import { randomUUID } from "node:crypto";
import type {
  Area,
  AreaAssignment,
  Department,
  District,
  Permission,
  Role,
  TemplateDefinition,
  TemplateVersion,
  UserRoleAssignment,
} from "@prisma/client";
import type { BindParameters, Connection } from "oracledb";
import type {
  AdminRepository,
  Appointment,
  PublicAccount,
} from "../admin-repository.js";
import { fail } from "../auth.js";
import { createOracleAuditRepository } from "./audit.js";
import { fromOracleBoolean } from "./codecs.js";
import type { OraclePool } from "./pool.js";
import {
  affected,
  clob,
  oracleInList,
  oracleTable,
  queryRows,
  requireRecord,
  timestamp,
} from "./query.js";

type AccountRow = Omit<PublicAccount, "emailVerified"> & {
  emailVerified: number;
};

const userFields = `ID AS "id", NAME AS "name", EMAIL AS "email", PHONE AS "phone", KIND AS "kind",
  STATUS AS "status", EMAIL_VERIFIED AS "emailVerified", IDENTIFICATION_MASKED AS "identificationMasked"`;
const roleFields = `ID AS "id", USER_ID AS "userId", ROLE_ID AS "roleId", DEPARTMENT_ID AS "departmentId", DISTRICT_ID AS "districtId",
  STARTS_AT AS "startsAt", ENDS_AT AS "endsAt", STATUS AS "status", AUTHORIZED_BY AS "authorizedBy", REFERENCE AS "reference", CREATED_AT AS "createdAt"`;
const assignmentFields = `ID AS "id", AREA_ID AS "areaId", USER_ID AS "userId", STARTS_AT AS "startsAt", ENDS_AT AS "endsAt",
  REASON AS "reason", ASSIGNED_BY AS "assignedBy", CREATED_AT AS "createdAt"`;
const templateFields = `ID AS "id", TEMPLATE_ID AS "templateId", VERSION AS "version", CONTENT AS "content", STATUS AS "status",
  CREATED_BY AS "createdBy", ACTIVATED_BY AS "activatedBy", CREATED_AT AS "createdAt"`;
const current =
  "STARTS_AT<=SYSTIMESTAMP AND (ENDS_AT IS NULL OR ENDS_AT>SYSTIMESTAMP)";
const decode = (row: AccountRow): PublicAccount => ({
  ...row,
  emailVerified: fromOracleBoolean(row.emailVerified),
});

async function first<T>(
  connection: Connection,
  sql: string,
  binds: BindParameters,
) {
  return requireRecord((await queryRows<T>(connection, sql, binds))[0]);
}

export function createOracleAdmin(pool: OraclePool): AdminRepository {
  const users = oracleTable(pool, "STL_USERS");
  const sessions = oracleTable(pool, "STL_SESSIONS");
  const roles = oracleTable(pool, "STL_ROLES");
  const permissions = oracleTable(pool, "STL_PERMISSIONS");
  const appointments = oracleTable(pool, "STL_USER_ROLE_ASSIGNMENTS");
  const departments = oracleTable(pool, "STL_DEPARTMENTS");
  const districts = oracleTable(pool, "STL_DISTRICTS");
  const mfa = oracleTable(pool, "STL_MFA_FACTORS");
  const recovery = oracleTable(pool, "STL_RECOVERY_CODES");
  const areas = oracleTable(pool, "STL_AREAS");
  const areaAssignments = oracleTable(pool, "STL_AREA_ASSIGNMENTS");
  const templates = oracleTable(pool, "STL_TEMPLATE_DEFINITIONS");
  const versions = oracleTable(pool, "STL_TEMPLATE_VERSIONS");
  const audit = createOracleAuditRepository(pool);
  const lock = (connection: Connection, table: string, id: string) =>
    first(connection, `SELECT ID FROM ${table} WHERE ID=:id FOR UPDATE`, {
      id,
    });
  const readAppointment = (connection: Connection, id: string) =>
    first<UserRoleAssignment>(
      connection,
      `SELECT ${roleFields} FROM ${appointments} WHERE ID=:id`,
      { id },
    );
  const readArea = (connection: Connection, id: string) =>
    first<Area>(
      connection,
      `SELECT ID AS "id", NAME AS "name", DISTRICT_ID AS "districtId" FROM ${areas} WHERE ID=:id`,
      { id },
    );
  const deleteSessions = (connection: Connection, id: string) =>
    connection.execute(`DELETE FROM ${sessions} WHERE USER_ID=:id`, { id });

  async function insertAppointment(
    connection: Connection,
    userId: string,
    data: Appointment,
  ) {
    const id = randomUUID();
    const { startsAt, endsAt, ...row } = data;
    await connection.execute(
      `INSERT INTO ${appointments}
      (ID,USER_ID,ROLE_ID,DEPARTMENT_ID,DISTRICT_ID,STARTS_AT,ENDS_AT,REFERENCE,AUTHORIZED_BY)
      VALUES (:id,:userId,:roleId,:departmentId,:districtId,:startsAt,:endsAt,:reference,:authorizedBy)`,
      {
        ...row,
        id,
        userId,
        startsAt: timestamp(startsAt),
        endsAt: timestamp(endsAt),
      },
    );
    return readAppointment(connection, id);
  }

  async function activePic(
    connection: Connection,
    userId: string,
    districtId: string,
  ) {
    const [row] = await queryRows(
      connection,
      `SELECT U.ID FROM ${users} U JOIN ${appointments} A ON A.USER_ID=U.ID
      WHERE U.ID=:userId AND U.STATUS='ACTIVE' AND A.ROLE_ID='PIC_KAWASAN' AND A.STATUS='ACTIVE'
        AND A.STARTS_AT<=SYSTIMESTAMP AND (A.ENDS_AT IS NULL OR A.ENDS_AT>SYSTIMESTAMP)
        AND (A.DISTRICT_ID IS NULL OR A.DISTRICT_ID=:districtId) AND ROWNUM=1`,
      { userId, districtId },
    );
    return !!row;
  }

  async function version(
    connection: Connection,
    templateId: string,
    content: string,
    createdBy: string,
    number: number,
  ) {
    const id = randomUUID();
    await connection.execute(
      `INSERT INTO ${versions} (ID,TEMPLATE_ID,VERSION,CONTENT,CREATED_BY)
      VALUES (:id,:templateId,:versionNo,:content,:createdBy)`,
      { id, templateId, versionNo: number, content: clob(content), createdBy },
    );
    return first<TemplateVersion>(
      connection,
      `SELECT ${templateFields} FROM ${versions} WHERE ID=:id`,
      { id },
    );
  }

  async function populateRoles<T extends { id: string }>(
    connection: Connection,
    rows: T[],
  ) {
    const result: (T & { roles: UserRoleAssignment[] })[] = [];
    for (const row of rows) {
      const assigned = await queryRows<UserRoleAssignment>(
        connection,
        `SELECT ${roleFields} FROM ${appointments} WHERE USER_ID=:id`,
        { id: row.id },
      );
      result.push({ ...row, roles: assigned });
    }
    return result;
  }

  return {
    users: () =>
      pool.transaction(async (connection) => {
        await connection.execute("SET TRANSACTION READ ONLY");
        const rows = await queryRows<AccountRow>(
          connection,
          `SELECT ${userFields} FROM ${users} ORDER BY CREATED_AT DESC,ID FETCH FIRST 100 ROWS ONLY`,
          {},
        );
        return populateRoles(connection, rows.map(decode));
      }),
    roles: () =>
      pool.transaction(async (connection) => {
        await connection.execute("SET TRANSACTION READ ONLY");
        const result = await queryRows<Role>(
          connection,
          `SELECT ID AS "id", LABEL AS "label" FROM ${roles} ORDER BY ID`,
          {},
        );
        const allowed = await queryRows<Permission>(
          connection,
          `SELECT ID AS "id", ROLE_ID AS "roleId", ACTION AS "action" FROM ${permissions} ORDER BY ACTION`,
          {},
        );
        return result.map((row) => ({
          ...row,
          permissions: allowed.filter(
            (permission) => permission.roleId === row.id,
          ),
        }));
      }),
    departments: () =>
      pool.use((connection) =>
        queryRows<Department>(
          connection,
          `SELECT ID AS "id", NAME AS "name" FROM ${departments} ORDER BY ID`,
          {},
        ),
      ),
    departmentExists: (id) =>
      pool.use(
        async (connection) =>
          (
            await queryRows(
              connection,
              `SELECT ID FROM ${departments} WHERE ID=:id`,
              { id },
            )
          ).length === 1,
      ),
    async createOfficer(data, appointment, entry) {
      try {
        return await pool.transaction(async (connection) => {
          const id = randomUUID();
          await connection.execute(
            `INSERT INTO ${users} (ID,NAME,EMAIL,PHONE,KIND,UPDATED_AT)
            VALUES (:id,:name,:email,:phone,'OFFICER',SYSTIMESTAMP)`,
            { ...data, id },
          );
          await insertAppointment(connection, id, appointment);
          await audit.append(connection, { ...entry, target: id });
          return decode(
            await first<AccountRow>(
              connection,
              `SELECT ${userFields} FROM ${users} WHERE ID=:id`,
              { id },
            ),
          );
        });
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "ORA-00001" &&
          /\bSTL_UK_01_01\b/i.test(error.message)
        )
          fail(409, "Rekod bertindih. Semak maklumat yang dimasukkan.");
        throw error;
      }
    },
    status: (id, status) =>
      pool.transaction(async (connection) => {
        requireRecord(
          (await affected(
            connection,
            `UPDATE ${users} SET STATUS=:status,UPDATED_AT=SYSTIMESTAMP WHERE ID=:id`,
            { id, status },
          )) || null,
        );
        await deleteSessions(connection, id);
      }),
    resetMfa: (userId) =>
      pool.transaction(async (connection) => {
        // Match the auth verification lock order, including when a factor is absent.
        await lock(connection, users, userId);
        await connection.execute(`DELETE FROM ${mfa} WHERE USER_ID=:userId`, {
          userId,
        });
        await connection.execute(
          `DELETE FROM ${recovery} WHERE USER_ID=:userId`,
          { userId },
        );
        await deleteSessions(connection, userId);
      }),
    officer: (id) =>
      pool.use((connection) =>
        first<{ kind: string }>(
          connection,
          `SELECT KIND AS "kind" FROM ${users} WHERE ID=:id`,
          { id },
        ),
      ),
    assignRole: (userId, data) =>
      pool.transaction(async (connection) => {
        const user = await first<{ KIND: string }>(
          connection,
          `SELECT KIND FROM ${users} WHERE ID=:userId FOR UPDATE`,
          { userId },
        );
        if (user.KIND !== "OFFICER") fail(400, "Pelantikan pegawai sahaja.");
        return insertAppointment(connection, userId, data);
      }),
    appointment: (id) =>
      pool.use((connection) => readAppointment(connection, id)),
    revoke: (id, userId) =>
      pool.transaction(async (connection) => {
        await lock(connection, users, userId);
        requireRecord(
          (await affected(
            connection,
            `UPDATE ${appointments} SET STATUS='REVOKED',ENDS_AT=SYSTIMESTAMP
        WHERE ID=:id AND USER_ID=:userId`,
            { id, userId },
          )) || null,
        );
        await deleteSessions(connection, userId);
      }),
    areas: (filter) =>
      pool.transaction(async (connection) => {
        await connection.execute("SET TRANSACTION READ ONLY");
        const eligible = filter
          ? oracleInList("R.DISTRICT_ID", filter, "IN")
          : { sql: "1=1", binds: {} };
        const rows = await queryRows<Area & { districtName: string }>(
          connection,
          `SELECT R.ID AS "id", R.NAME AS "name", R.DISTRICT_ID AS "districtId", D.NAME AS "districtName"
          FROM ${areas} R JOIN ${districts} D ON D.ID=R.DISTRICT_ID WHERE ${eligible.sql} ORDER BY R.ID`,
          eligible.binds,
        );
        const output: (Area & {
          district: District;
          assignments: AreaAssignment[];
        })[] = [];
        for (const { districtName, ...area } of rows) {
          const assigned = await queryRows<AreaAssignment>(
            connection,
            `SELECT ${assignmentFields} FROM ${areaAssignments} WHERE AREA_ID=:id ORDER BY CREATED_AT DESC, ID`,
            { id: area.id },
          );
          output.push({
            ...area,
            district: { id: area.districtId, name: districtName },
            assignments: assigned,
          });
        }
        return output;
      }),
    officers: () =>
      pool.transaction(async (connection) => {
        await connection.execute("SET TRANSACTION READ ONLY");
        const rows = await queryRows<{ id: string; name: string }>(
          connection,
          `SELECT ID AS "id", NAME AS "name" FROM ${users} WHERE KIND='OFFICER' AND STATUS='ACTIVE'`,
          {},
        );
        return populateRoles(connection, rows);
      }),
    newArea: async (data) => {
      try {
        return await pool.transaction(async (connection) => {
          const id = randomUUID();
          await connection.execute(
            `INSERT INTO ${areas} (ID,NAME,DISTRICT_ID) VALUES (:id,:name,:districtId)`,
            { ...data, id },
          );
          return { ...data, id };
        });
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "ORA-00001" &&
          /\bSTL_UK_11_02\b/i.test(error.message)
        )
          fail(409, "Rekod bertindih. Semak maklumat yang dimasukkan.");
        throw error;
      }
    },
    area: (id) => pool.use((connection) => readArea(connection, id)),
    activeAssignments: (areaId) =>
      pool.use((connection) =>
        queryRows<AreaAssignment>(
          connection,
          `SELECT ${assignmentFields} FROM ${areaAssignments} WHERE AREA_ID=:areaId AND ${current}`,
          { areaId },
        ),
      ),
    activePic: (userId, districtId) =>
      pool.use((connection) => activePic(connection, userId, districtId)),
    replaceArea: (data, activeRole) =>
      pool.transaction(async (connection) => {
        await lock(connection, users, data.userId);
        await lock(connection, areas, data.areaId);
        const area = await readArea(connection, data.areaId);
        if (!(await activePic(connection, data.userId, area.districtId)))
          fail(400, "PIC tidak mempunyai pelantikan aktif bagi daerah ini.");
        await connection.execute(
          `UPDATE ${areaAssignments} SET ENDS_AT=SYSTIMESTAMP WHERE AREA_ID=:areaId AND ENDS_AT IS NULL`,
          { areaId: data.areaId },
        );
        const id = randomUUID();
        await connection.execute(
          `INSERT INTO ${areaAssignments} (ID,AREA_ID,USER_ID,REASON,ASSIGNED_BY)
        VALUES (:id,:areaId,:userId,:reason,:assignedBy)`,
          { ...data, id },
        );
        await audit.append(connection, {
          actorId: data.assignedBy,
          activeRole,
          action: "AREA_REASSIGNED",
          target: data.areaId,
          metadata: { userId: data.userId, reason: data.reason },
        });
        return first<AreaAssignment>(
          connection,
          `SELECT ${assignmentFields} FROM ${areaAssignments} WHERE ID=:id`,
          { id },
        );
      }),
    templates: () =>
      pool.transaction(async (connection) => {
        await connection.execute("SET TRANSACTION READ ONLY");
        const rows = await queryRows<TemplateDefinition>(
          connection,
          `SELECT ID AS "id", NAME AS "name", CATEGORY AS "category" FROM ${templates} ORDER BY NAME,ID`,
          {},
        );
        const result: (TemplateDefinition & { versions: TemplateVersion[] })[] =
          [];
        for (const row of rows)
          result.push({
            ...row,
            versions: await queryRows<TemplateVersion>(
              connection,
              `SELECT ${templateFields} FROM ${versions} WHERE TEMPLATE_ID=:id ORDER BY VERSION DESC`,
              { id: row.id },
            ),
          });
        return result;
      }),
    createTemplate: (name, category, content, createdBy) =>
      pool.transaction(async (connection) => {
        const id = randomUUID();
        await connection.execute(
          `INSERT INTO ${templates} (ID,NAME,CATEGORY) VALUES (:id,:name,:category)`,
          { id, name, category },
        );
        await version(connection, id, content, createdBy, 1);
        return { id, name, category };
      }),
    newTemplateVersion: (templateId, content, createdBy) =>
      pool.transaction(async (connection) => {
        await lock(connection, templates, templateId);
        const row = await first<{ LAST_VERSION: number }>(
          connection,
          `SELECT COALESCE(MAX(VERSION),0) AS LAST_VERSION FROM ${versions} WHERE TEMPLATE_ID=:templateId`,
          { templateId },
        );
        return version(
          connection,
          templateId,
          content,
          createdBy,
          row.LAST_VERSION + 1,
        );
      }),
    activateTemplate: (id, actorId, activeRole) =>
      pool.transaction(async (connection) => {
        const { TEMPLATE_ID: templateId } = await first<{
          TEMPLATE_ID: string;
        }>(connection, `SELECT TEMPLATE_ID FROM ${versions} WHERE ID=:id`, {
          id,
        });
        await lock(connection, templates, templateId);
        await connection.execute(
          `UPDATE ${versions} SET STATUS='ARCHIVED' WHERE TEMPLATE_ID=:templateId AND STATUS='ACTIVE'`,
          { templateId },
        );
        requireRecord(
          (await affected(
            connection,
            `UPDATE ${versions} SET STATUS='ACTIVE',ACTIVATED_BY=:actorId WHERE ID=:id`,
            { id, actorId },
          )) || null,
        );
        await audit.append(connection, {
          actorId,
          activeRole,
          action: "TEMPLATE_ACTIVATED",
          target: id,
        });
      }),
  };
}
