import oracledb, { type Connection } from "oracledb";
import {
  cleanDelegation,
  matchesDelegationBytes,
  type DelegationMetadata,
} from "../delegation-evidence.js";
import { fail } from "../auth.js";
import type { OraclePool } from "./pool.js";
import { oracleTable, queryRows } from "./query.js";

const fields = `ID AS "id", COMPANY_ID AS "companyId", REPRESENTATIVE_ID AS "representativeId",
  VERSION AS "version", FILE_NAME AS "fileName", MIME_TYPE AS "mimeType", UPLOADED_BY AS "uploadedBy",
  SHA256 AS "sha256", BYTE_SIZE AS "byteSize", AUTHORITY_TYPE AS "authorityType",
  VALID_FROM AS "validFrom", VALID_UNTIL AS "validUntil", SUPERSEDED_AT AS "supersededAt",
  REVOKED_AT AS "revokedAt", SCAN_STATUS AS "scanStatus", SCAN_SHA256 AS "scanSha256",
  SCAN_ENGINE AS "scanEngine", SCAN_VALID_UNTIL AS "scanValidUntil",
  SCAN_LEASE_TOKEN AS "scanLeaseToken", SCAN_LEASE_EXPIRES_AT AS "scanLeaseExpiresAt"`;

export function oracleDelegationEvidence(pool: OraclePool) {
  const documents = oracleTable(pool, "STL_DELEGATION_DOCUMENTS");

  async function metadata(connection: Connection, id: string, lock = false) {
    if (lock)
      await connection.execute(
        `SELECT ID FROM ${documents} WHERE ID=:id FOR UPDATE WAIT 5`,
        { id },
      );
    return (
      await queryRows<DelegationMetadata>(
        connection,
        `SELECT ${fields} FROM ${documents} WHERE ID=:id`,
        { id },
      )
    )[0];
  }

  async function content(connection: Connection, doc: DelegationMetadata) {
    const { rows } = await connection.execute<{ CONTENT: Buffer }>(
      `SELECT CONTENT FROM ${documents} WHERE ID=:id AND DBMS_LOB.GETLENGTH(CONTENT)=:byteSize`,
      { id: doc.id, byteSize: doc.byteSize },
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        fetchTypeHandler: ({ dbType }) =>
          dbType === oracledb.DB_TYPE_BLOB
            ? { type: oracledb.BUFFER }
            : undefined,
      },
    );
    const content = rows?.[0]?.CONTENT;
    return Buffer.isBuffer(content) && matchesDelegationBytes(doc, content)
      ? content
      : null;
  }

  async function bytes(connection: Connection, doc: DelegationMetadata) {
    if (!cleanDelegation(doc, new Date())) fail(404, "Dokumen tidak ditemui.");
    const data = await content(connection, doc);
    if (!data || !cleanDelegation(doc, new Date()))
      fail(404, "Dokumen tidak ditemui.");
    return data;
  }

  return {
    metadata,
    content,
    bytes,
    current(connection: Connection, representativeId: string) {
      return queryRows<DelegationMetadata>(
        connection,
        `SELECT ${fields} FROM ${documents}
        WHERE REPRESENTATIVE_ID=:representativeId AND SUPERSEDED_AT IS NULL AND REVOKED_AT IS NULL`,
        { representativeId },
      );
    },
    async lockedVerified(
      connection: Connection,
      rep: {
        id: string;
        companyId: string;
        status: string;
        authorityType: string;
        verifiedDocumentId: string | null;
      },
    ) {
      if (rep.status !== "VERIFIED" || !rep.verifiedDocumentId)
        fail(409, "Surat kuasa versi semasa belum disahkan.");
      const doc = await metadata(connection, rep.verifiedDocumentId, true);
      if (
        !doc ||
        doc.representativeId !== rep.id ||
        doc.companyId !== rep.companyId ||
        doc.authorityType !== rep.authorityType ||
        !cleanDelegation(doc, new Date())
      )
        fail(409, "Surat kuasa versi semasa belum disahkan.");
      try {
        await bytes(connection, doc);
      } catch (error) {
        if (
          error instanceof Error &&
          "statusCode" in error &&
          error.statusCode === 404
        )
          fail(409, "Surat kuasa versi semasa belum dapat disahkan.");
        throw error;
      }
      return doc;
    },
    async verified(
      connection: Connection,
      rep: {
        id: string;
        companyId: string;
        status: string;
        authorityType: string;
        verifiedDocumentId: string | null;
      },
    ) {
      const { id, version, sha256 } = await this.lockedVerified(
        connection,
        rep,
      );
      return { id, version, sha256 };
    },
  };
}
