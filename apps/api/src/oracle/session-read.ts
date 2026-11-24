import oracledb from "oracledb";
import { fromOracleBoolean } from "./codecs.js";
import type { OraclePool } from "./pool.js";

type SessionRow = {
  USER_ID: string;
  ACTIVE_ROLE: string | null;
  CSRF_HASH: string;
  MFA_VERIFIED: number;
  ACCOUNT_KIND: string;
  EMAIL_VERIFIED: number;
  ROLE_ID: string | null;
  DISTRICT_ID: string | null;
  ACTION: string | null;
};

export function createOracleSessionReader(pool: OraclePool) {
  if (!/^STL_LAB_[A-Z][A-Z0-9_]{0,19}$/.test(pool.owner))
    throw Error("Schema Oracle tidak sah.");
  const owner = pool.owner;
  return {
    findActiveSession(idHash: string) {
      if (!/^[a-f0-9]{64}$/.test(idHash)) return Promise.resolve(null);
      return pool.use(async (connection) => {
        // A single statement gives the session, active assignment and permissions a consistent read point.
        const result = await connection.execute<SessionRow>(
          `SELECT S.USER_ID,S.ACTIVE_ROLE,S.CSRF_HASH,S.MFA_VERIFIED,U.KIND AS ACCOUNT_KIND,U.EMAIL_VERIFIED,
                  A.ROLE_ID,A.DISTRICT_ID,P.ACTION
             FROM ${owner}.STL_SESSIONS S
             JOIN ${owner}.STL_USERS U ON U.ID = S.USER_ID
             LEFT JOIN ${owner}.STL_USER_ROLE_ASSIGNMENTS A
               ON A.USER_ID=S.USER_ID AND A.ROLE_ID=S.ACTIVE_ROLE AND A.STATUS='ACTIVE'
              AND A.STARTS_AT <= SYSTIMESTAMP AND (A.ENDS_AT IS NULL OR A.ENDS_AT > SYSTIMESTAMP)
             LEFT JOIN ${owner}.STL_PERMISSIONS P ON P.ROLE_ID=A.ROLE_ID
            WHERE S.ID=:idHash AND S.EXPIRES_AT > SYSTIMESTAMP AND U.STATUS='ACTIVE'
            ORDER BY A.ROLE_ID,A.DISTRICT_ID,P.ACTION`,
          { idHash },
          { outFormat: oracledb.OUT_FORMAT_OBJECT },
        );
        const session = result.rows?.[0];
        if (!session) return null;
        return {
          userId: session.USER_ID,
          activeRole: session.ACTIVE_ROLE,
          csrfHash: session.CSRF_HASH,
          mfaVerified: fromOracleBoolean(session.MFA_VERIFIED),
          accountKind: session.ACCOUNT_KIND,
          emailVerified: fromOracleBoolean(session.EMAIL_VERIFIED),
          assignments: result
            .rows!.filter((row) => row.ROLE_ID !== null)
            .map(({ ROLE_ID, DISTRICT_ID, ACTION }) => ({
              role: ROLE_ID!,
              district: DISTRICT_ID,
              permission: ACTION,
            })),
        };
      });
    },
  };
}
