import type { CompletionRole } from "../../../../packages/shared/src/synthetic-completion-contract.js";
import type { Connection } from "oracledb";
import { fail } from "../auth.js";
import type { ObservedPortalSession } from "../synthetic-portal-session.js";
import type { OraclePool } from "./pool.js";
import { oracleTable, queryRows } from "./query.js";

export function oracleSyntheticSession(pool: OraclePool) {
  const users = oracleTable(pool, "STL_USERS");
  const assignments = oracleTable(pool, "STL_USER_ROLE_ASSIGNMENTS");
  const permissions = oracleTable(pool, "STL_PERMISSIONS");
  const sessions = oracleTable(pool, "STL_SESSIONS");
  return async (
    connection: Connection,
    operator: ObservedPortalSession,
    activeRole: CompletionRole,
    district?: string,
    lock = true,
  ) => {
    const { id, csrfHash, userId } = operator;
    const applicant =
      activeRole === "PEMOHON" || activeRole === "WAKIL_SYARIKAT";
    const kind = applicant ? "APPLICANT" : "OFFICER";
    const permission = applicant
      ? "applications.draft"
      : activeRole === "PIC_KAWASAN" || activeRole === "PPSK"
        ? "areas.read"
        : "profile";
    if (lock) {
      await connection.execute(
        `SELECT ID FROM ${users} WHERE ID=:userId FOR UPDATE`,
        { userId },
      );
      await connection.execute(
        `SELECT ID FROM ${assignments} WHERE USER_ID=:userId AND ROLE_ID=:activeRole FOR UPDATE`,
        { userId, activeRole },
      );
      await connection.execute(
        `SELECT ID FROM ${sessions} WHERE ID=:id AND USER_ID=:userId FOR UPDATE`,
        { id, userId },
      );
    }
    const [active] = await queryRows(
      connection,
      `SELECT S.ID FROM ${sessions} S JOIN ${users} U ON U.ID=S.USER_ID
        WHERE S.ID=:id AND S.USER_ID=:userId AND S.CSRF_HASH=:csrfHash AND S.ACTIVE_ROLE=:activeRole
          AND S.EXPIRES_AT>SYSTIMESTAMP AND U.KIND=:kind AND U.STATUS='ACTIVE' AND U.EMAIL_VERIFIED=1
          AND ${applicant ? "U.IDENTIFICATION_HASH IS NOT NULL" : "S.MFA_VERIFIED=1"} AND EXISTS (
            SELECT 1 FROM ${assignments} A JOIN ${permissions} P ON P.ROLE_ID=A.ROLE_ID
            WHERE A.USER_ID=S.USER_ID AND A.ROLE_ID=S.ACTIVE_ROLE AND A.STATUS='ACTIVE'
              AND A.STARTS_AT<=SYSTIMESTAMP AND (A.ENDS_AT IS NULL OR A.ENDS_AT>SYSTIMESTAMP)
              AND P.ACTION=:permission ${district ? "AND A.DISTRICT_ID=:district" : ""})`,
      {
        id,
        userId,
        csrfHash,
        activeRole,
        kind,
        permission,
        ...(district && { district }),
      },
    );
    if (!active)
      fail(403, "Tugasan atau sesi portal sudah berubah. Muat semula halaman.");
  };
}
