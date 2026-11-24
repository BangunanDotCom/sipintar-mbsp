import { randomUUID } from "node:crypto";
import type { Connection } from "oracledb";
import { hash, token } from "../core.js";
import type {
  AuthAccount,
  AuthFactor,
  AuthRepository,
  AuthSession,
} from "../auth-repository.js";
import { createOracleAuditRepository } from "./audit.js";
import { fromOracleBoolean, oracleBoolean } from "./codecs.js";
import { createOracleNotificationRepository } from "./notification.js";
import type { OraclePool } from "./pool.js";
import {
  affected,
  clob,
  oracleTable,
  queryRows,
  requireRecord,
  timestamp,
} from "./query.js";

const accountColumns = `ID AS "id", NAME AS "name", EMAIL AS "email", PHONE AS "phone",
  IDENTIFICATION_HASH AS "identificationHash", IDENTIFICATION_ENCRYPTED AS "identificationEncrypted",
  IDENTIFICATION_MASKED AS "identificationMasked", PASSWORD_HASH AS "passwordHash", KIND AS "kind",
  STATUS AS "status", EMAIL_VERIFIED AS "emailVerified", CONSENT_AT AS "consentAt",
  CREATED_AT AS "createdAt", UPDATED_AT AS "updatedAt"`;

type AccountRow = Omit<AuthAccount, "emailVerified"> & {
  emailVerified: number;
};
const decodeAccount = (row: AccountRow) => ({
  ...row,
  emailVerified: fromOracleBoolean(row.emailVerified),
});

type SessionRow = Omit<AuthSession, "user" | "mfaVerified"> & {
  mfaVerified: number;
};
type Assignment = AuthSession["user"]["roles"][number];
type AssignmentRow = Omit<Assignment, "role"> & {
  roleLabel: string;
  permissionId: string | null;
  permissionAction: string | null;
};
type FactorRow = Omit<AuthFactor, "verified" | "lastStep"> & {
  verified: number;
  lastStep: string;
};

function groupAssignments(rows: AssignmentRow[]): Assignment[] {
  const assignments = new Map<string, Assignment>();
  for (const { roleLabel, permissionId, permissionAction, ...row } of rows) {
    const assignment = assignments.get(row.id) ?? {
      ...row,
      role: { id: row.roleId, label: roleLabel, permissions: [] },
    };
    if (permissionId !== null && permissionAction !== null)
      assignment.role.permissions.push({
        id: permissionId,
        roleId: row.roleId,
        action: permissionAction,
      });
    assignments.set(row.id, assignment);
  }
  return [...assignments.values()];
}

export function createOracleAuthRepository(pool: OraclePool): AuthRepository {
  const users = oracleTable(pool, "STL_USERS");
  const sessions = oracleTable(pool, "STL_SESSIONS");
  const identities = oracleTable(pool, "STL_AUTHENTICATION_IDENTITIES");
  const factors = oracleTable(pool, "STL_MFA_FACTORS");
  const recovery = oracleTable(pool, "STL_RECOVERY_CODES");
  const assignments = oracleTable(pool, "STL_USER_ROLE_ASSIGNMENTS");
  const roles = oracleTable(pool, "STL_ROLES");
  const permissions = oracleTable(pool, "STL_PERMISSIONS");
  const audit = createOracleAuditRepository(pool);
  const { notify } = createOracleNotificationRepository(pool);

  async function readUser(
    connection: Connection,
    field: "ID" | "EMAIL",
    value: string,
  ) {
    const [row] = await queryRows<AccountRow>(
      connection,
      `SELECT ${accountColumns} FROM ${users} WHERE ${field}=:value`,
      { value },
    );
    return row ? decodeAccount(row) : null;
  }
  async function lockUser(connection: Connection, userId: string) {
    requireRecord(
      (
        await queryRows(
          connection,
          `SELECT ID FROM ${users} WHERE ID=:userId FOR UPDATE`,
          { userId },
        )
      )[0],
    );
  }
  async function revokeSessions(connection: Connection, userId: string) {
    await connection.execute(`DELETE FROM ${sessions} WHERE USER_ID=:userId`, {
      userId,
    });
  }
  async function verifySession(
    connection: Connection,
    sessionId: string,
    userId: string,
  ) {
    requireRecord(
      (await affected(
        connection,
        `UPDATE ${sessions} SET MFA_VERIFIED=1 WHERE ID=:sessionId AND USER_ID=:userId AND EXPIRES_AT>SYSTIMESTAMP`,
        { sessionId, userId },
      )) || null,
    );
  }

  return {
    assertRegistrationReady: () =>
      pool.use(async (connection) => {
        await connection.execute(`SELECT 1 FROM ${users} WHERE 1=0`);
      }),
    async register(data) {
      try {
        return await pool.transaction(async (connection) => {
          const id = randomUUID();
          await connection.execute(
            `INSERT INTO ${users}
            (ID,NAME,EMAIL,PHONE,PASSWORD_HASH,CONSENT_AT,UPDATED_AT,IDENTIFICATION_HASH,
             IDENTIFICATION_ENCRYPTED,IDENTIFICATION_MASKED)
            VALUES (:id,:name,:email,:phone,:passwordHash,:consentAt,SYSTIMESTAMP,:identificationHash,
                    :identificationEncrypted,:identificationMasked)`,
            {
              ...data,
              id,
              consentAt: timestamp(data.consentAt),
              identificationEncrypted: clob(data.identificationEncrypted),
            },
          );
          await connection.execute(
            `INSERT INTO ${assignments} (ID, USER_ID, ROLE_ID, REFERENCE)
             VALUES (:id, :userId, 'PEMOHON', 'Pendaftaran awam')`,
            { id: randomUUID(), userId: id },
          );
          return requireRecord(await readUser(connection, "ID", id));
        });
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "ORA-00001" &&
          /\b(?:STL_UK_01_01|STL_IX_01_01)\b/i.test(error.message)
        )
          throw Object.assign(Error("Rekod bertindih."), { code: "P2002" });
        throw error;
      }
    },
    findUser: (email) =>
      pool.use((connection) => readUser(connection, "EMAIL", email)),
    loadSession: (id) =>
      pool.transaction(async (connection) => {
        // The session, account and permissions must share the same read point.
        await connection.execute("SET TRANSACTION READ ONLY");
        const [row] = await queryRows<SessionRow>(
          connection,
          `SELECT ID AS "id", USER_ID AS "userId", ACTIVE_ROLE AS "activeRole",
          MFA_VERIFIED AS "mfaVerified", CSRF_HASH AS "csrfHash", EXPIRES_AT AS "expiresAt",
          CREATED_AT AS "createdAt" FROM ${sessions} WHERE ID=:id`,
          { id },
        );
        if (!row) return null;
        const user = requireRecord(
          await readUser(connection, "ID", row.userId),
        );
        const roleRows = await queryRows<AssignmentRow>(
          connection,
          `SELECT A.ID AS "id", A.USER_ID AS "userId", A.ROLE_ID AS "roleId",
          A.DEPARTMENT_ID AS "departmentId", A.DISTRICT_ID AS "districtId",
          A.STARTS_AT AS "startsAt", A.ENDS_AT AS "endsAt", A.STATUS AS "status",
          A.AUTHORIZED_BY AS "authorizedBy", A.REFERENCE AS "reference", A.CREATED_AT AS "createdAt",
          R.LABEL AS "roleLabel", P.ID AS "permissionId", P.ACTION AS "permissionAction"
         FROM ${assignments} A JOIN ${roles} R ON R.ID=A.ROLE_ID
         LEFT JOIN ${permissions} P ON P.ROLE_ID=A.ROLE_ID WHERE A.USER_ID=:userId`,
          { userId: row.userId },
        );
        return {
          ...row,
          mfaVerified: fromOracleBoolean(row.mfaVerified),
          user: { ...user, roles: groupAssignments(roleRows) },
        };
      }),
    createSession: (data) =>
      pool.transaction(async (connection) => {
        await connection.execute(
          `INSERT INTO ${sessions} (ID,USER_ID,CSRF_HASH,EXPIRES_AT,MFA_VERIFIED)
         VALUES (:id,:userId,:csrfHash,:expiresAt,:mfaVerified)`,
          {
            ...data,
            expiresAt: timestamp(data.expiresAt),
            mfaVerified: oracleBoolean(data.mfaVerified),
          },
        );
      }),
    refreshCsrf: (id, previousHash, csrfHash) =>
      pool.transaction(async (connection) => {
        await connection.execute(
          `UPDATE ${sessions} SET CSRF_HASH=:csrfHash WHERE ID=:id AND CSRF_HASH=:previousHash`,
          { id, previousHash, csrfHash },
        );
      }),
    logout: (id) =>
      pool.transaction(async (connection) => {
        requireRecord(
          (await affected(connection, `DELETE FROM ${sessions} WHERE ID=:id`, {
            id,
          })) || null,
        );
      }),
    switchRole: (id, activeRole) =>
      pool.transaction(async (connection) => {
        requireRecord(
          (await affected(
            connection,
            `UPDATE ${sessions} S SET S.ACTIVE_ROLE=:activeRole
          WHERE S.ID=:id AND S.EXPIRES_AT>SYSTIMESTAMP AND EXISTS (
            SELECT 1 FROM ${assignments} A WHERE A.USER_ID=S.USER_ID AND A.ROLE_ID=:activeRole
              AND A.STATUS='ACTIVE' AND A.STARTS_AT<=SYSTIMESTAMP
              AND (A.ENDS_AT IS NULL OR A.ENDS_AT>SYSTIMESTAMP))`,
            { id, activeRole },
          )) || null,
        );
      }),
    activate: (tokenHash, provider, passwordHash) =>
      pool.transaction(async (connection) => {
        const [identity] = await queryRows<{ USER_ID: string }>(
          connection,
          `SELECT USER_ID FROM ${identities} WHERE TOKEN_HASH=:tokenHash AND PROVIDER=:provider
          AND CONSUMED_AT IS NULL AND EXPIRES_AT>=SYSTIMESTAMP`,
          { tokenHash, provider },
        );
        if (!identity) return null;
        const userId = identity.USER_ID;
        await lockUser(connection, userId);
        const claimed = await affected(
          connection,
          `UPDATE ${identities} SET CONSUMED_AT=SYSTIMESTAMP
          WHERE TOKEN_HASH=:tokenHash AND PROVIDER=:provider AND CONSUMED_AT IS NULL
            AND EXPIRES_AT>=SYSTIMESTAMP`,
          { tokenHash, provider },
        );
        if (!claimed) return null;
        await connection.execute(
          `UPDATE ${users} SET EMAIL_VERIFIED=1, UPDATED_AT=SYSTIMESTAMP,
          PASSWORD_HASH=COALESCE(:passwordHash,PASSWORD_HASH) WHERE ID=:userId`,
          { userId, passwordHash: passwordHash ?? null },
        );
        await revokeSessions(connection, userId);
        return requireRecord(await readUser(connection, "ID", userId));
      }),
    changePassword: (userId, passwordHash) =>
      pool.transaction(async (connection) => {
        await lockUser(connection, userId);
        await connection.execute(
          `UPDATE ${users} SET PASSWORD_HASH=:passwordHash, UPDATED_AT=SYSTIMESTAMP WHERE ID=:userId`,
          { userId, passwordHash },
        );
        await revokeSessions(connection, userId);
      }),
    findFactor: (userId) =>
      pool.use(async (connection) => {
        const [row] = await queryRows<FactorRow>(
          connection,
          `SELECT ID AS "id", USER_ID AS "userId", ENCRYPTED_SECRET AS "encryptedSecret",
          VERIFIED AS "verified", TO_CHAR(LAST_STEP, 'FM9999999999999999990') AS "lastStep"
          FROM ${factors} WHERE USER_ID=:userId`,
          { userId },
        );
        return row
          ? {
              ...row,
              verified: fromOracleBoolean(row.verified),
              lastStep: BigInt(row.lastStep),
            }
          : null;
      }),
    setFactor: (userId, encryptedSecret) =>
      pool.transaction(async (connection) => {
        await lockUser(connection, userId);
        const [existing] = await queryRows<{ VERIFIED: number }>(
          connection,
          `SELECT VERIFIED FROM ${factors} WHERE USER_ID=:userId`,
          { userId },
        );
        if (existing && fromOracleBoolean(existing.VERIFIED)) return false;
        if (existing) {
          await connection.execute(
            `UPDATE ${factors} SET ENCRYPTED_SECRET=:encryptedSecret WHERE USER_ID=:userId`,
            { userId, encryptedSecret },
          );
        } else {
          await connection.execute(
            `INSERT INTO ${factors} (ID,USER_ID,ENCRYPTED_SECRET) VALUES (:id,:userId,:encryptedSecret)`,
            { id: randomUUID(), userId, encryptedSecret },
          );
        }
        return true;
      }),
    claimMfa: (sessionId, factor, accepted, recoveryHashes) =>
      pool.transaction(async (connection) => {
        await lockUser(connection, factor.userId);
        const claimed = await affected(
          connection,
          `UPDATE ${factors} SET VERIFIED=1, LAST_STEP=:accepted
          WHERE ID=:id AND USER_ID=:userId AND LAST_STEP<:accepted AND VERIFIED=:verified
            AND ENCRYPTED_SECRET=:encryptedSecret`,
          {
            id: factor.id,
            userId: factor.userId,
            accepted,
            verified: oracleBoolean(factor.verified),
            encryptedSecret: factor.encryptedSecret,
          },
        );
        if (!claimed) return false;
        if (!factor.verified) {
          await connection.execute(
            `DELETE FROM ${recovery} WHERE USER_ID=:userId`,
            { userId: factor.userId },
          );
          for (const codeHash of recoveryHashes)
            await connection.execute(
              `INSERT INTO ${recovery} (ID,USER_ID,CODE_HASH) VALUES (:id,:userId,:codeHash)`,
              { id: randomUUID(), userId: factor.userId, codeHash },
            );
        }
        await verifySession(connection, sessionId, factor.userId);
        return true;
      }),
    useRecoveryCode: (sessionId, userId, codeHash) =>
      pool.transaction(async (connection) => {
        await lockUser(connection, userId);
        const claimed = await affected(
          connection,
          `UPDATE ${recovery} SET USED_AT=SYSTIMESTAMP
          WHERE USER_ID=:userId AND CODE_HASH=:codeHash AND USED_AT IS NULL`,
          { userId, codeHash },
        );
        if (!claimed) return false;
        await verifySession(connection, sessionId, userId);
        return true;
      }),
    async audit(actorId, activeRole, action, target, outcome, metadata) {
      await audit.record({
        actorId,
        activeRole,
        action,
        target,
        outcome,
        metadata,
      });
    },
    notify,
    async issueIdentity(userId, provider) {
      const raw = token();
      await pool.transaction(async (connection) => {
        await connection.execute(
          `INSERT INTO ${identities} (ID,USER_ID,PROVIDER,TOKEN_HASH,EXPIRES_AT)
           VALUES (:id,:userId,:provider,:tokenHash,SYSTIMESTAMP + INTERVAL '1' HOUR)`,
          { id: randomUUID(), userId, provider, tokenHash: hash(raw) },
        );
      });
      return raw;
    },
  };
}
