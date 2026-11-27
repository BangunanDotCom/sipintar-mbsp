import type { Connection } from "oracledb";
import { completionEvent } from "../../../../packages/shared/src/synthetic-completion-contract.js";
import { fail } from "../auth.js";
import type { OraclePool } from "./pool.js";
import { oracleTable, queryRows } from "./query.js";

export const oracleCompletionEnabled = (env = process.env) =>
  env.NODE_ENV === "test" &&
  env.STAYLINK_ORACLE_LAB_SYNTHETIC === "true" &&
  env.STAYLINK_SYNTHETIC_COMPLETION === "true" &&
  env.STAYLINK_DEMO_HOST !== "true";

export async function assertOracleCompletionMigration(
  pool: OraclePool,
  reminders = false,
) {
  const history = oracleTable(pool, "STL_SCHEMA_MIGRATIONS");
  const version = reminders ? "007-reminder-kind-width" : "004-core-journals";
  await pool.use(async (connection) => {
    const [row] = await queryRows(
      connection,
      `SELECT VERSION FROM ${history} WHERE VERSION=:version AND STATE='APPLIED'`,
      { version },
    );
    if (!row) throw Error(`Migrasi Oracle makmal ${version} belum digunakan.`);
  });
}

export async function requireOracleUnclosedDraft(
  pool: OraclePool,
  connection: Connection,
  draftId: string,
) {
  if (!oracleCompletionEnabled()) return;
  const submissions = oracleTable(pool, "STL_SYNTHETIC_SUBMISSIONS");
  const audit = oracleTable(pool, "STL_AUDIT_LOGS");
  const [row] = await queryRows(
    connection,
    `SELECT 1 FROM ${audit} A WHERE A.TARGET=(
        SELECT ID FROM ${submissions} WHERE DRAFT_ID=:draftId ORDER BY DRAFT_VERSION DESC FETCH FIRST 1 ROW ONLY
      ) AND A.ACTION=:event AND A.OUTCOME='SUCCESS' AND JSON_VALUE(A.METADATA,'$.command.action')='CLOSE' AND ROWNUM=1`,
    { draftId, event: completionEvent },
  );
  if (row) fail(409, "Permohonan latihan telah ditutup.");
}
