import type { Connection } from "oracledb";
import { fail, type session } from "../auth.js";
import type { OraclePool } from "./pool.js";
import { oracleTable, queryRows } from "./query.js";
export type DelegationPrincipal = Pick<
  Awaited<ReturnType<typeof session>>,
  "id" | "userId" | "csrfHash" | "activeRole"
>;
export function oracleDelegationPrincipal(pool: OraclePool) {
  const users = oracleTable(pool, "STL_USERS");
  const assignments = oracleTable(pool, "STL_USER_ROLE_ASSIGNMENTS");
  const sessions = oracleTable(pool, "STL_SESSIONS");
  const permissions = oracleTable(pool, "STL_PERMISSIONS");
  return async function principalAtUse(
    connection: Connection,
    principal: DelegationPrincipal,
    pic: boolean,
  ) {
    const { id, userId, csrfHash, activeRole } = principal;
    if (pic && activeRole !== "PIC_KAWASAN")
      fail(403, "Skop sesi tidak sah untuk surat kuasa.");
    await connection.execute(
      `SELECT ID FROM ${users} WHERE ID=:userId FOR UPDATE WAIT 5`,
      { userId },
    );
    await connection.execute(
      `SELECT ID FROM ${assignments} WHERE USER_ID=:userId AND ROLE_ID=:activeRole ORDER BY ID FOR UPDATE WAIT 5`,
      { userId, activeRole },
    );
    await connection.execute(
      `SELECT ID FROM ${sessions} WHERE ID=:id FOR UPDATE WAIT 5`,
      { id },
    );
    const [current] = await queryRows(
      connection,
      `SELECT 1 FROM ${sessions} S JOIN ${users} U ON U.ID=S.USER_ID
       WHERE S.ID=:id AND S.USER_ID=:userId AND S.CSRF_HASH=:csrfHash AND S.ACTIVE_ROLE=:activeRole
         AND S.EXPIRES_AT>SYSTIMESTAMP AND U.KIND=:kind AND U.STATUS='ACTIVE' AND U.EMAIL_VERIFIED=1
         ${pic ? "AND S.MFA_VERIFIED=1" : ""} AND EXISTS (
           SELECT 1 FROM ${assignments} A JOIN ${permissions} P ON P.ROLE_ID=A.ROLE_ID
           WHERE A.USER_ID=S.USER_ID AND A.ROLE_ID=S.ACTIVE_ROLE AND A.STATUS='ACTIVE'
             AND A.STARTS_AT<=SYSTIMESTAMP AND (A.ENDS_AT IS NULL OR A.ENDS_AT>SYSTIMESTAMP)
             AND P.ACTION=:action ${pic ? "AND A.DISTRICT_ID IS NULL" : ""})`,
      {
        id,
        userId,
        csrfHash,
        activeRole,
        kind: pic ? "OFFICER" : "APPLICANT",
        action: pic ? "representation.verify" : "companies",
      },
    );
    if (!current) fail(403, "Skop sesi tidak sah untuk surat kuasa.");
  };
}
