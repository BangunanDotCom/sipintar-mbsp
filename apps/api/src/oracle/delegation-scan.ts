import { randomUUID } from "node:crypto";
import type { Connection } from "oracledb";
import { isCurrentDelegation } from "../delegation-evidence.js";
import type {
  DocumentMalwareScanner,
  MalwareScanResult,
} from "../document-malware-scanner.js";
import { oracleDelegationEvidence } from "./delegation-evidence.js";
import type { OraclePool } from "./pool.js";
import { affected, oracleTable, queryRows, timestamp } from "./query.js";

export function createOracleDelegationScanner(pool: OraclePool) {
  const docs = oracleTable(pool, "STL_DELEGATION_DOCUMENTS");
  const reps = oracleTable(pool, "STL_COMPANY_REPRESENTATIVES");
  const companies = oracleTable(pool, "STL_COMPANIES");
  const evidence = oracleDelegationEvidence(pool);
  const current = "D.SUPERSEDED_AT IS NULL AND D.REVOKED_AT IS NULL";
  const eligible = `EXISTS (SELECT 1 FROM ${reps} R JOIN ${companies} C ON C.ID=R.COMPANY_ID
    WHERE R.ID=D.REPRESENTATIVE_ID AND C.ID=D.COMPANY_ID AND R.AUTHORITY_TYPE=D.AUTHORITY_TYPE
      AND R.STATUS<>'REVOKED' AND C.STATUS='ACTIVE' AND R.STARTS_AT<=:now
      AND (R.ENDS_AT IS NULL OR R.ENDS_AT>:now))`;
  const window =
    "D.VALID_FROM<=:now AND (D.VALID_UNTIL IS NULL OR D.VALID_UNTIL>:now)";
  const due = `(D.SCAN_STATUS='PENDING' OR (D.SCAN_STATUS='SCANNING' AND D.SCAN_LEASE_EXPIRES_AT<=:now)
    OR (D.SCAN_STATUS='CLEAN' AND D.SCAN_VALID_UNTIL<=:now))`;

  async function lockScope(
    connection: Connection,
    companyId: string,
    repId: string,
  ) {
    await connection.execute(
      `SELECT ID FROM ${companies} WHERE ID=:companyId FOR UPDATE WAIT 5`,
      { companyId },
    );
    await connection.execute(
      `SELECT ID FROM ${reps} WHERE ID=:repId FOR UPDATE WAIT 5`,
      { repId },
    );
  }

  return {
    due(now: Date) {
      return pool.use((connection) =>
        queryRows<{ id: string }>(
          connection,
          `SELECT D.ID AS "id" FROM ${docs} D WHERE ${current} AND ${eligible} AND ${window} AND ${due}
         ORDER BY D.CREATED_AT,D.ID FETCH FIRST 10 ROWS ONLY`,
          { now: timestamp(now) },
        ),
      );
    },
    async scan(
      scanner: DocumentMalwareScanner,
      id: string,
      clock = () => new Date(),
    ) {
      const token = randomUUID();
      const doc = await pool.transaction(async (connection) => {
        const initial = await evidence.metadata(connection, id);
        if (!initial?.representativeId) return null;
        const now = clock();
        if (!isCurrentDelegation(initial, now)) return null;
        const changed = await affected(
          connection,
          `UPDATE ${docs} D SET SCAN_STATUS='SCANNING',
          SCAN_LEASE_TOKEN=:token,SCAN_LEASE_EXPIRES_AT=:expires,
          SCAN_SHA256=NULL,SCAN_ENGINE=NULL,SCAN_VALID_UNTIL=NULL
          WHERE D.ID=:id AND D.SHA256=:sha256 AND ${current} AND ${eligible} AND ${window} AND ${due}`,
          {
            token,
            expires: timestamp(new Date(now.getTime() + 60_000)),
            id,
            sha256: initial.sha256,
            now: timestamp(now),
          },
        );
        return changed === 1 ? initial : null;
      });
      if (!doc?.representativeId) return false;
      const { companyId, representativeId, sha256 } = doc;
      let outcome: MalwareScanResult = {
        status: "FAILED",
        engine: "scan-failed",
      };
      try {
        const content = await pool.use(async (connection) => {
          const held = await evidence.metadata(connection, id);
          if (
            !held ||
            held.scanLeaseToken !== token ||
            !held.scanLeaseExpiresAt ||
            held.scanLeaseExpiresAt <= clock() ||
            !isCurrentDelegation(held, clock())
          )
            return null;
          return evidence.content(connection, held);
        });
        if (content) {
          const result = await scanner.scan(content);
          if (
            result &&
            ["CLEAN", "INFECTED", "FAILED"].includes(result.status) &&
            typeof result.engine === "string" &&
            result.engine.length <= 128 &&
            Array.from(result.engine).every(
              (c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126,
            ) &&
            result.engine.trim()
          )
            outcome = { status: result.status, engine: result.engine.trim() };
        }
      } catch {
        // Record a generic failed verdict without carrying scanner or storage details.
      }
      return pool.transaction(async (connection) => {
        await lockScope(connection, companyId, representativeId);
        const now = clock();
        const clean = outcome.status === "CLEAN";
        return (
          (await affected(
            connection,
            `UPDATE ${docs} D SET SCAN_STATUS=:status,SCAN_ENGINE=:engine,
          SCAN_SHA256=:scanSha256,SCAN_VALID_UNTIL=:scanValidUntil,SCAN_LEASE_TOKEN=NULL,SCAN_LEASE_EXPIRES_AT=NULL
          WHERE D.ID=:id AND D.SHA256=:sha256 AND D.SCAN_STATUS='SCANNING' AND D.SCAN_LEASE_TOKEN=:token
            AND D.SCAN_LEASE_EXPIRES_AT>:now AND ${current} AND ${eligible} AND ${window}`,
            {
              id,
              sha256,
              token,
              now: timestamp(now),
              ...outcome,
              scanSha256: clean ? sha256 : null,
              scanValidUntil: timestamp(
                clean ? new Date(now.getTime() + 86_400_000) : null,
              ),
            },
          )) === 1
        );
      });
    },
  };
}
