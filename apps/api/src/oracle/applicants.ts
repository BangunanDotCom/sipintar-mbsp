import { oracleDelegationPrincipal } from "./delegation-principal.js";
import {
  delegationSummary,
  isCurrentDelegation,
} from "../delegation-evidence.js";
import { oracleDelegationEvidence } from "./delegation-evidence.js";
import { randomUUID } from "node:crypto";
import type { Company, CompanyRepresentative, District } from "@prisma/client";
import type { Connection } from "oracledb";
import type { ApplicantRepository } from "../applicant-repository.js";
import { fail } from "../auth.js";
import { fromOracleBoolean } from "./codecs.js";
import { decodeOracleConfig } from "./config-value.js";
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

const companyFields = `ID AS "id", NAME AS "name", ADDRESS AS "address", PHONE AS "phone", EMAIL AS "email",
  REGISTRATION_NUMBER AS "registrationNumber", STATUS AS "status", INFORMATION_STATUS AS "informationStatus", CREATED_AT AS "createdAt"`;
const representativeFields = `ID AS "id", USER_ID AS "userId", COMPANY_ID AS "companyId", STATUS AS "status",
  AUTHORITY_TYPE AS "authorityType", STARTS_AT AS "startsAt", ENDS_AT AS "endsAt", VERIFIED_BY AS "verifiedBy",
  VERIFIED_DOCUMENT_ID AS "verifiedDocumentId", VERIFICATION_REVISION AS "verificationRevision",
  CAN_MANAGE_REPRESENTATIVES AS "canManageRepresentatives"`;
type RepRow = Omit<CompanyRepresentative, "canManageRepresentatives"> & {
  canManageRepresentatives: number;
};
const representativeDto = (row: RepRow) => ({
  ...row,
  canManageRepresentatives: fromOracleBoolean(row.canManageRepresentatives),
});
type Profile = Awaited<ReturnType<ApplicantRepository["updateProfile"]>>;
type ProfileRow = Omit<Profile, "emailVerified"> & { emailVerified: number };
function isDuplicate(error: unknown, constraint: RegExp) {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "ORA-00001" &&
    constraint.test(error.message)
  );
}

export function createOracleApplicantRepository(
  pool: OraclePool,
): ApplicantRepository {
  const delegationEvidence = oracleDelegationEvidence(pool);
  const principalAtUse = oracleDelegationPrincipal(pool);
  const users = oracleTable(pool, "STL_USERS");
  const districts = oracleTable(pool, "STL_DISTRICTS");
  const companies = oracleTable(pool, "STL_COMPANIES");
  const representatives = oracleTable(pool, "STL_COMPANY_REPRESENTATIVES");
  const settings = oracleTable(pool, "STL_SYSTEM_CONFIGURATIONS");
  const validRepresentative =
    "STATUS<>'REVOKED' AND STARTS_AT<=SYSTIMESTAMP AND (ENDS_AT IS NULL OR ENDS_AT>SYSTIMESTAMP)";
  async function findCompany(connection: Connection, companyId: string) {
    const [row] = await queryRows<Company>(
      connection,
      `SELECT ${companyFields} FROM ${companies} WHERE ID=:companyId`,
      { companyId },
    );
    return requireRecord(row);
  }
  async function lockCompany(connection: Connection, companyId: string) {
    const [row] = await queryRows(
      connection,
      `SELECT ID FROM ${companies} WHERE ID=:companyId FOR UPDATE`,
      { companyId },
    );
    requireRecord(row);
  }
  async function assertRepresentative(
    connection: Connection,
    companyId: string,
    userId: string,
  ) {
    await connection.execute(
      `SELECT ID FROM ${representatives} WHERE COMPANY_ID=:companyId AND USER_ID=:userId FOR UPDATE`,
      { companyId, userId },
    );
    const [row] = await queryRows(
      connection,
      `SELECT ID FROM ${representatives} WHERE COMPANY_ID=:companyId AND USER_ID=:userId AND ${validRepresentative}`,
      { companyId, userId },
    );
    if (!row) fail(404, "Rekod tidak ditemui.");
  }

  return {
    async setIdentification(id, passwordHash, data) {
      try {
        return await pool.transaction(
          async (connection) =>
            (await affected(
              connection,
              `UPDATE ${users} SET IDENTIFICATION_HASH=:identificationHash,
             IDENTIFICATION_ENCRYPTED=:identificationEncrypted, IDENTIFICATION_MASKED=:identificationMasked, UPDATED_AT=SYSTIMESTAMP
           WHERE ID=:id AND KIND='APPLICANT' AND STATUS='ACTIVE' AND IDENTIFICATION_HASH IS NULL AND PASSWORD_HASH=:passwordHash`,
              {
                id,
                passwordHash,
                ...data,
                identificationEncrypted: clob(data.identificationEncrypted),
              },
            )) === 1,
        );
      } catch (error) {
        if (isDuplicate(error, /\bSTL_IX_01_01\b/i))
          fail(409, "Rekod bertindih. Semak maklumat yang dimasukkan.");
        throw error;
      }
    },
    updateProfile: (id, data) =>
      pool.transaction(async (connection) => {
        requireRecord(
          (await affected(
            connection,
            `UPDATE ${users} SET NAME=:name,PHONE=:phone,UPDATED_AT=SYSTIMESTAMP WHERE ID=:id AND STATUS='ACTIVE'`,
            { ...data, id },
          )) || null,
        );
        const [row] = await queryRows<ProfileRow>(
          connection,
          `SELECT ID AS "id", NAME AS "name", PHONE AS "phone", EMAIL AS "email", KIND AS "kind", STATUS AS "status",
          EMAIL_VERIFIED AS "emailVerified", IDENTIFICATION_MASKED AS "identificationMasked" FROM ${users} WHERE ID=:id`,
          { id },
        );
        return {
          ...requireRecord(row),
          emailVerified: fromOracleBoolean(row.emailVerified),
        };
      }),
    districts: () =>
      pool.use((connection) =>
        queryRows<District>(
          connection,
          `SELECT ID AS "id", NAME AS "name" FROM ${districts} ORDER BY ID`,
          {},
        ),
      ),
    companies: (principal, includeDocuments) =>
      pool.transaction(async (connection) => {
        await principalAtUse(connection, principal, false);
        const userId = principal.userId;
        const now = new Date();
        const list = await queryRows<{ ID: string; COMPANY_ID: string }>(
          connection,
          `SELECT ID,COMPANY_ID FROM ${representatives} WHERE USER_ID=:userId AND ${validRepresentative} ORDER BY COMPANY_ID,ID`,
          { userId },
        );
        const output: Awaited<ReturnType<ApplicantRepository["companies"]>> =
          [];
        for (const { ID: id, COMPANY_ID: companyId } of list) {
          await lockCompany(connection, companyId);
          await connection.execute(
            `SELECT ID FROM ${representatives} WHERE ID=:id FOR UPDATE WAIT 5`,
            { id },
          );
          const [row] = await queryRows<RepRow>(
            connection,
            `SELECT ${representativeFields} FROM ${representatives} WHERE ID=:id AND USER_ID=:userId AND ${validRepresentative}`,
            { id, userId },
          );
          if (!row) continue;
          const company = await findCompany(connection, companyId);
          if (company.status !== "ACTIVE") continue;
          const { verifiedDocumentId, ...rep } = representativeDto(row);
          const files = (await delegationEvidence.current(connection, row.id))
            .filter(
              (doc) =>
                doc.companyId === row.companyId &&
                doc.authorityType === row.authorityType &&
                isCurrentDelegation(doc, now),
            )
            .map((doc) => delegationSummary(doc, now));
          const status =
            rep.status === "VERIFIED" &&
            !files.some(
              (doc) => doc.id === verifiedDocumentId && doc.downloadable,
            )
              ? "DOCUMENT_UPDATE_REQUIRED"
              : rep.status;
          output.push({
            ...rep,
            status,
            company: { ...company, documents: includeDocuments ? files : [] },
          });
        }
        return output;
      }),
    async createCompany(userId, data, authorityType, endsAt) {
      try {
        return await pool.transaction(async (connection) => {
          const companyId = randomUUID();
          await connection.execute(
            `INSERT INTO ${companies} (ID,NAME,ADDRESS,PHONE,EMAIL,REGISTRATION_NUMBER)
             VALUES (:companyId,:name,:address,:phone,:email,:registrationNumber)`,
            { ...data, companyId },
          );
          await connection.execute(
            `INSERT INTO ${representatives} (ID,USER_ID,COMPANY_ID,AUTHORITY_TYPE,ENDS_AT,CAN_MANAGE_REPRESENTATIVES)
             VALUES (:id,:userId,:companyId,:authorityType,:endsAt,1)`,
            {
              id: randomUUID(),
              userId,
              companyId,
              authorityType,
              endsAt: timestamp(endsAt),
            },
          );
          return findCompany(connection, companyId);
        });
      } catch (error) {
        if (isDuplicate(error, /\bSTL_UK_13_02\b/i))
          throw Object.assign(Error("Nombor SSM telah didaftarkan."), {
            code: "P2002",
          });
        throw error;
      }
    },
    updateCompany: (companyId, data, userId) =>
      pool.transaction(async (connection) => {
        await lockCompany(connection, companyId);
        await assertRepresentative(connection, companyId, userId);
        await connection.execute(
          `UPDATE ${companies} SET NAME=:name,ADDRESS=:address,PHONE=:phone,EMAIL=:email,
          INFORMATION_STATUS='UNVERIFIED' WHERE ID=:companyId`,
          { ...data, companyId },
        );
        return findCompany(connection, companyId);
      }),
    settings: (keys) =>
      pool.use(async (connection) => {
        const list = oracleInList("KEY", keys, "IN", "key_");
        const rows = await queryRows<{ key: string; value: string }>(
          connection,
          `SELECT KEY AS "key", VALUE AS "value" FROM ${settings} WHERE ${list.sql}`,
          list.binds,
        );
        return rows.map(({ key, value }) => ({
          key,
          value: decodeOracleConfig(value),
        }));
      }),
  };
}
