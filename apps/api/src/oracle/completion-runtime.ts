import { insertOracleReminder } from "./training-reminders.js";
import type { Prisma } from "@prisma/client";
import { completionEvent } from "../../../../packages/shared/src/synthetic-completion-contract.js";
import type { CompletionRepository } from "../completion-repository.js";
import { fail } from "../auth.js";
import type { OraclePool } from "./pool.js";
import { oracleTable, queryRows } from "./query.js";
import { createOracleCompletionRepository } from "./synthetic-completion.js";
import { createOracleSyntheticReviewRepository } from "./synthetic-review.js";
import { oracleSyntheticSession } from "./synthetic-session.js";

export function createOracleCompletionRuntime(
  pool: OraclePool,
): CompletionRepository {
  const reviews = createOracleSyntheticReviewRepository(pool);
  const journal = createOracleCompletionRepository(pool);
  const lockSession = oracleSyntheticSession(pool);
  const submissions = oracleTable(pool, "STL_SYNTHETIC_SUBMISSIONS");
  const drafts = oracleTable(pool, "STL_APPLICATION_DRAFTS");
  const audit = oracleTable(pool, "STL_AUDIT_LOGS");
  const districtFilter =
    "JSON_VALUE(S.SNAPSHOT,'$.districtId' RETURNING VARCHAR2(3) NULL ON ERROR)=:district";

  return {
    async transaction(operation, consistentRead) {
      try {
        return await pool.transaction(async (connection) => {
          // Dashboard requests sharing a session can read concurrently. An
          // Oracle read-only transaction still gives every query one snapshot.
          if (consistentRead)
            await connection.execute("SET TRANSACTION READ ONLY");
          const review = reviews.onConnection(connection, consistentRead);
          return operation({
            ...review,
            async enqueueReminders(entries) {
              for (const entry of entries)
                await insertOracleReminder(pool, connection, entry);
            },
            events: (id) => journal.events(connection, id),
            appendCompletion: (entry) => journal.appendEvent(connection, entry),
            lockActor: (operator, role, district) =>
              lockSession(
                connection,
                operator,
                role,
                district,
                !consistentRead,
              ),
            async lockApplicant(operator) {
              const role = operator.activeRole;
              if (role !== "PEMOHON" && role !== "WAKIL_SYARIKAT")
                fail(
                  403,
                  "Peranan pemohon atau wakil diperlukan untuk latihan.",
                );
              await lockSession(connection, operator, role);
              return role;
            },
            async lockParent(id, district, excludedActorId) {
              await connection.execute(
                `SELECT D.ID FROM ${drafts} D JOIN ${submissions} S ON S.DRAFT_ID=D.ID
                WHERE S.ID=:id AND ${districtFilter} AND S.ACTOR_ID<>:excludedActorId FOR UPDATE OF D.ID WAIT 5`,
                { id, district, excludedActorId },
              );
            },
            async lockCase(id, district) {
              await connection.execute(
                `SELECT S.ID FROM ${submissions} S WHERE S.ID=:id
                ${district ? "AND " + districtFilter : ""} FOR UPDATE OF S.ID WAIT 5`,
                { id, ...(district && { district }) },
              );
            },
            async caseRow(id, district) {
              const row = await review.activeSubmission(id);
              if (
                district &&
                (row?.snapshot as Prisma.JsonObject | undefined)?.districtId !==
                  district
              )
                return null;
              return row;
            },
            async applicantCase(draftId, userId) {
              return (
                (await review.applicantSubmission(draftId, userId))?.id ?? null
              );
            },
            queue: (district, excludedActorId, includeBkt) =>
              queryRows<{ id: string }>(
                connection,
                `SELECT S.ID AS "id" FROM ${submissions} S
                WHERE ${districtFilter} AND S.ACTOR_ID<>:excludedActorId
                  AND NOT EXISTS (SELECT 1 FROM ${submissions} N WHERE N.DRAFT_ID=S.DRAFT_ID AND N.PREVIOUS_ID=S.ID)
                  AND EXISTS (SELECT 1 FROM ${audit} A WHERE A.TARGET=S.ID AND A.OUTCOME='SUCCESS' AND (A.ACTION=:event OR (:includeBkt=1 AND A.ACTION='SYNTHETIC_PORTAL_INVOICE_SETTLED')))
                ORDER BY S.CREATED_AT DESC,S.ID FETCH FIRST 50 ROWS ONLY`,
                {
                  district,
                  excludedActorId,
                  event: completionEvent,
                  includeBkt: includeBkt ? 1 : 0,
                },
              ),
          });
        });
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          ["ORA-08177", "ORA-00060", "ORA-30006"].includes(String(error.code))
        )
          fail(
            409,
            "Versi atau transaksi telah berubah. Muat semula sebelum mencuba.",
          );
        throw error;
      }
    },
  };
}
