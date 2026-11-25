import type { SyntheticPortalDraftRepository } from "../synthetic-portal.js";
import { loadSyntheticReview } from "../synthetic-portal-review.js";
import { assertSnapshotAuthority } from "../synthetic-submissions.js";
import { createOracleDraftRepository } from "./drafts.js";
import type { OraclePool } from "./pool.js";
import { oracleInList, oracleTable, queryRows } from "./query.js";
import { createOracleSyntheticReviewRepository } from "./synthetic-review.js";
import { createOracleSyntheticSubmissions } from "./synthetic-submissions.js";

export function createOracleSyntheticPortal(pool: OraclePool) {
  const drafts = createOracleDraftRepository(pool);
  const submissions = createOracleSyntheticSubmissions(pool);
  const reviews = createOracleSyntheticReviewRepository(pool);
  const documents = oracleTable(pool, "STL_APPLICATION_DOCUMENTS");
  const scopes = oracleTable(pool, "STL_DRAFT_DOCUMENT_SCOPES");

  const portal: SyntheticPortalDraftRepository = {
    transaction(action) {
      return pool.transaction((connection) => {
        const draftTx = drafts.onConnection(connection);
        const submissionTx = submissions.onConnection(connection);
        const reviewTx = reviews.onConnection(connection);
        return action({
          ...submissionTx,
          requireSnapshotAuthority: (row) =>
            assertSnapshotAuthority(
              row,
              draftTx.companyAuthority,
              submissionTx.proof,
            ),
          review: (row) => loadSyntheticReview(reviewTx, row),
          claimVersion: draftTx.saveDraft,
          async documentVersions(draftId, categories) {
            const match = oracleInList(
              "CATEGORY",
              categories,
              "IN",
              "category_",
            );
            const rows = await queryRows<{ CATEGORY: string; VERSION: number }>(
              connection,
              `SELECT CATEGORY, MAX(VERSION) AS VERSION FROM ${documents}
               WHERE DRAFT_ID=:draftId AND ${match.sql} GROUP BY CATEGORY`,
              { draftId, ...match.binds },
            );
            return new Map(
              rows.map(({ CATEGORY, VERSION }) => [CATEGORY, VERSION]),
            );
          },
          async replaceEvidence(draftId, fixtures) {
            await connection.execute(
              `UPDATE ${documents} SET SUPERSEDED_AT=SYSTIMESTAMP
               WHERE DRAFT_ID=:draftId AND SUPERSEDED_AT IS NULL AND STORAGE_KEY LIKE 'issue31-fixture/%'`,
              { draftId },
            );
            await connection.executeMany(
              `INSERT INTO ${documents} (ID,DRAFT_ID,CATEGORY,VERSION,FILE_NAME,MIME_TYPE,BYTE_SIZE,SHA256,
                 UPLOADED_BY,STORAGE_KEY,SCAN_STATUS,VERIFICATION_STATUS)
               VALUES (:id,:draftId,:category,:versionValue,:fileName,:mimeType,:byteSize,:sha256,
                 :uploadedBy,:storageKey,:scanStatus,:verificationStatus)`,
              fixtures.map(
                ({ document: { version: versionValue, ...document } }) => ({
                  ...document,
                  versionValue,
                }),
              ),
            );
            await connection.executeMany(
              `INSERT INTO ${scopes} (DOCUMENT_ID,DRAFT_ID,FLOOR_ID,UNIT_ID)
               VALUES (:documentId,:draftId,:floorId,:unitId)`,
              fixtures.map(({ scope }) => scope),
            );
          },
        });
      });
    },
  };
  return { portal, reviews, capture: submissions.capture };
}
