import type {
  DocumentScanRepository,
  ScanDocument,
} from "../document-scan-repository.js";
import type { OraclePool } from "./pool.js";
import { affected, oracleTable, queryRows } from "./query.js";

function documentBinds({
  id,
  draftId,
  storageKey,
  sha256,
  byteSize,
  mimeType,
}: ScanDocument) {
  return { id, draftId, storageKey, sha256, byteSize, mimeType };
}

export function createOracleDocumentScanRepository(
  pool: OraclePool,
): DocumentScanRepository {
  const documents = oracleTable(pool, "STL_APPLICATION_DOCUMENTS");
  const scanCandidate = `SUPERSEDED_AT IS NULL AND (
    SCAN_STATUS='PENDING' OR (SCAN_STATUS='SCANNING' AND SCAN_LEASE_EXPIRES_AT <= SYSTIMESTAMP)
  )`;
  const matchesDocument = `ID=:id AND DRAFT_ID=:draftId AND STORAGE_KEY=:storageKey AND SHA256=:sha256
    AND BYTE_SIZE=:byteSize AND MIME_TYPE=:mimeType`;
  return {
    pending: (limit) =>
      pool.use((connection) =>
        queryRows<{ id: string }>(
          connection,
          `SELECT ID AS "id" FROM ${documents} WHERE ${scanCandidate}
        ORDER BY UPLOADED_AT,ID FETCH FIRST :limit ROWS ONLY`,
          { limit },
        ),
      ),
    find: (id) =>
      pool.use(async (connection) => {
        const [row] = await queryRows<ScanDocument>(
          connection,
          `SELECT ID AS "id", DRAFT_ID AS "draftId", STORAGE_KEY AS "storageKey", SHA256 AS "sha256",
          BYTE_SIZE AS "byteSize", MIME_TYPE AS "mimeType", SCAN_STATUS AS "scanStatus",
          SUPERSEDED_AT AS "supersededAt" FROM ${documents} WHERE ID=:id`,
          { id },
        );
        return row ?? null;
      }),
    claim: (document, token) =>
      pool.transaction(
        async (connection) =>
          (await affected(
            connection,
            `UPDATE ${documents} SET SCAN_STATUS='SCANNING', SCAN_LEASE_TOKEN=:token,
          SCAN_LEASE_EXPIRES_AT=SYSTIMESTAMP + INTERVAL '5' MINUTE WHERE ${matchesDocument} AND ${scanCandidate}`,
            { ...documentBinds(document), token },
          )) === 1,
      ),
    finish: (document, token, status) =>
      pool.transaction(
        async (connection) =>
          (await affected(
            connection,
            `UPDATE ${documents}
          SET SCAN_STATUS=:status, SCAN_LEASE_TOKEN=NULL, SCAN_LEASE_EXPIRES_AT=NULL
          WHERE ${matchesDocument} AND SUPERSEDED_AT IS NULL AND SCAN_STATUS='SCANNING'
            AND SCAN_LEASE_TOKEN=:token AND SCAN_LEASE_EXPIRES_AT>SYSTIMESTAMP`,
            { ...documentBinds(document), token, status },
          )) === 1,
      ),
  };
}
