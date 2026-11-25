import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import oracledb, { type Connection } from "oracledb";
import { z } from "zod";
import type { AuthRepository } from "../auth-repository.js";
import { authorize, fail } from "../auth.js";
import {
  cleanDelegation,
  delegationDigest,
  delegationSummary,
} from "../delegation-evidence.js";
import { delegationLimitMiB, validateDelegationPdf } from "../upload-policy.js";
import { createOracleAuditRepository } from "./audit.js";
import { decodeOracleConfig } from "./config-value.js";
import { oracleDelegationEvidence } from "./delegation-evidence.js";
import type { OraclePool } from "./pool.js";
import { affected, clob, oracleTable, queryRows, timestamp } from "./query.js";

const param = z.object({ id: z.uuid() });
const pdfHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "sandbox",
  "Referrer-Policy": "no-referrer",
};
const missing = () => fail(404, "Dokumen tidak ditemui.");
type Principal = Awaited<ReturnType<typeof authorize>>;
type Member = {
  id: string;
  userId: string;
  companyId: string;
  status: string;
  authorityType: string;
  startsAt: Date;
  endsAt: Date | null;
  verifiedBy: string | null;
  verifiedDocumentId: string | null;
  verificationRevision: number;
  canManageRepresentatives: number;
};

export async function oracleDelegationRoutes(
  app: FastifyInstance,
  pool: OraclePool,
  auth: AuthRepository,
) {
  const docs = oracleTable(pool, "STL_DELEGATION_DOCUMENTS");
  const reps = oracleTable(pool, "STL_COMPANY_REPRESENTATIVES");
  const companies = oracleTable(pool, "STL_COMPANIES");
  const users = oracleTable(pool, "STL_USERS");
  const sessions = oracleTable(pool, "STL_SESSIONS");
  const assignments = oracleTable(pool, "STL_USER_ROLE_ASSIGNMENTS");
  const permissions = oracleTable(pool, "STL_PERMISSIONS");
  const configs = oracleTable(pool, "STL_SYSTEM_CONFIGURATIONS");
  const notifications = oracleTable(pool, "STL_NOTIFICATIONS");
  const evidence = oracleDelegationEvidence(pool);
  const audit = createOracleAuditRepository(pool);
  const currentDoc = "SUPERSEDED_AT IS NULL AND REVOKED_AT IS NULL";
  const currentRep =
    "R.STATUS<>'REVOKED' AND R.STARTS_AT<=SYSTIMESTAMP AND (R.ENDS_AT IS NULL OR R.ENDS_AT>SYSTIMESTAMP)";
  const memberFields = `R.ID AS "id",R.USER_ID AS "userId",R.COMPANY_ID AS "companyId",
    R.STATUS AS "status",R.AUTHORITY_TYPE AS "authorityType",R.STARTS_AT AS "startsAt",
    R.ENDS_AT AS "endsAt",R.VERIFIED_BY AS "verifiedBy",R.VERIFIED_DOCUMENT_ID AS "verifiedDocumentId",
    R.VERIFICATION_REVISION AS "verificationRevision",R.CAN_MANAGE_REPRESENTATIVES AS "canManageRepresentatives"`;

  async function principalAtUse(
    connection: Connection,
    principal: Principal,
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
  }

  async function member(
    connection: Connection,
    companyId: string,
    targetId: string | null,
    userId: string | null,
  ) {
    // Match the company and representative order already used by Oracle draft and invitation writes.
    const [company] = await queryRows(
      connection,
      `SELECT ID FROM ${companies} WHERE ID=:companyId AND STATUS='ACTIVE' FOR UPDATE WAIT 5`,
      { companyId },
    );
    if (!company) return missing();
    const scope = `R.COMPANY_ID=:companyId AND (R.ID=:targetId OR R.USER_ID=:userId)`;
    const binds = { companyId, targetId, userId };
    await connection.execute(
      `SELECT R.ID FROM ${reps} R WHERE ${scope} ORDER BY R.ID FOR UPDATE WAIT 5`,
      binds,
    );
    const rows = await queryRows<Member>(
      connection,
      `SELECT ${memberFields} FROM ${reps} R WHERE ${scope} AND ${currentRep}`,
      binds,
    );
    const self = rows.find((rep) => rep.userId === userId);
    const target = targetId ? rows.find((rep) => rep.id === targetId) : self;
    if (
      !target ||
      (userId &&
        (!self ||
          (self.id !== target.id && self.canManageRepresentatives !== 1)))
    )
      return missing();
    return target;
  }

  async function transaction<T>(
    operation: (connection: Connection) => Promise<T>,
  ) {
    try {
      return await pool.transaction(operation);
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        ["ORA-00060", "ORA-30006"].includes(String(error.code))
      )
        fail(
          409,
          "Versi atau transaksi telah berubah. Muat semula sebelum mencuba.",
        );
      throw error;
    }
  }
  const entry = (s: Principal, action: string, target: string) => ({
    actorId: s.userId,
    activeRole: s.activeRole,
    action,
    target,
  });
  const invalidate = (connection: Connection, id: string) =>
    connection.execute(
      `UPDATE ${reps} SET STATUS='UNVERIFIED',VERIFIED_BY=NULL,VERIFIED_DOCUMENT_ID=NULL,
       VERIFICATION_REVISION=VERIFICATION_REVISION+1 WHERE ID=:id`,
      { id },
    );

  app.post("/api/companies/:id/documents", async (request) => {
    const s = await authorize(request, "companies", auth);
    const { id: companyId } = param.parse(request.params);
    const input = z
      .strictObject({
        fileName: z
          .string()
          .min(1)
          .max(120)
          .regex(/^[^/\\]+\.pdf$/i)
          .refine(
            (value) =>
              Buffer.from(value).toString() === value &&
              Array.from(value).every(
                (c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127,
              ),
          ),
        content: z
          .string()
          .max(27962028)
          .regex(/^[A-Za-z0-9+/]*={0,2}$/),
        representativeId: z.uuid().optional(),
        expectedDocumentId: z.uuid().nullable().optional(),
        validFrom: z.iso.datetime().optional(),
        validUntil: z.iso.datetime().optional(),
      })
      .parse(request.body);
    return transaction(async (connection) => {
      await principalAtUse(connection, s, false);
      const rep = await member(
        connection,
        companyId,
        input.representativeId ?? null,
        s.userId,
      );
      const [config] = await queryRows<{ VALUE: string }>(
        connection,
        `SELECT VALUE FROM ${configs} WHERE KEY='technical.upload_delegation_mib'`,
        {},
      );
      const limit = delegationLimitMiB(
        config ? decodeOracleConfig(config.VALUE) : undefined,
      );
      let bytes: Buffer;
      try {
        bytes = validateDelegationPdf(input.content, limit);
      } catch (error) {
        fail(
          400,
          error instanceof Error ? error.message : "Dokumen PDF tidak sah.",
        );
      }
      const now = new Date();
      const validFrom = input.validFrom ? new Date(input.validFrom) : now;
      const validUntil = input.validUntil ? new Date(input.validUntil) : null;
      if (validUntil && (validUntil <= now || validUntil <= validFrom))
        fail(400, "Julat sah dokumen tidak dibenarkan.");
      const [prior] = await evidence.current(connection, rep.id);
      if ((prior?.id ?? null) !== (input.expectedDocumentId ?? null))
        fail(
          409,
          "Versi surat kuasa sudah berubah. Muat semula sebelum mengganti.",
        );
      const [history] = await queryRows<{ LAST_VERSION: number }>(
        connection,
        `SELECT NVL(MAX(VERSION),0) AS LAST_VERSION FROM ${docs} WHERE REPRESENTATIVE_ID=:id`,
        { id: rep.id },
      );
      if (prior)
        await connection.execute(
          `UPDATE ${docs} SET SUPERSEDED_AT=SYSTIMESTAMP WHERE ID=:id`,
          { id: prior.id },
        );
      const id = randomUUID();
      const version = history.LAST_VERSION + 1;
      await connection.execute(
        `INSERT INTO ${docs} (ID,COMPANY_ID,REPRESENTATIVE_ID,VERSION,AUTHORITY_TYPE,
        UPLOADED_BY,FILE_NAME,MIME_TYPE,CONTENT,SHA256,BYTE_SIZE,VALID_FROM,VALID_UNTIL)
        VALUES (:id,:companyId,:representativeId,:version,:authorityType,:uploadedBy,:fileName,'application/pdf',
        :content,:sha256,:byteSize,:validFrom,:validUntil)`,
        {
          id,
          companyId,
          representativeId: rep.id,
          version,
          authorityType: rep.authorityType,
          uploadedBy: s.userId,
          fileName: input.fileName,
          content: { val: bytes, type: oracledb.BLOB },
          sha256: delegationDigest(bytes),
          byteSize: bytes.length,
          validFrom: timestamp(validFrom),
          validUntil: timestamp(validUntil),
        },
      );
      await invalidate(connection, rep.id);
      await audit.append(connection, {
        ...entry(s, "DOCUMENT_UPLOADED", id),
        metadata: {
          representativeId: rep.id,
          version,
          supersedes: prior?.id ?? null,
        },
      });
      const doc = await evidence.metadata(connection, id);
      if (!doc) return missing();
      return { ...delegationSummary(doc), status: "UNVERIFIED" };
    });
  });

  app.post(
    "/api/companies/:id/documents/:documentId/revoke",
    async (request) => {
      const s = await authorize(request, "companies", auth);
      const { id: companyId, documentId } = param
        .extend({ documentId: z.uuid() })
        .parse(request.params);
      return transaction(async (connection) => {
        await principalAtUse(connection, s, false);
        const doc = await evidence.metadata(connection, documentId);
        if (!doc?.representativeId || doc.companyId !== companyId)
          return missing();
        const rep = await member(
          connection,
          companyId,
          doc.representativeId,
          s.userId,
        );
        if (
          (await affected(
            connection,
            `UPDATE ${docs} SET REVOKED_AT=SYSTIMESTAMP
        WHERE ID=:documentId AND REPRESENTATIVE_ID=:id AND ${currentDoc}`,
            { id: rep.id, documentId },
          )) !== 1
        )
          fail(409, "Versi surat kuasa tidak lagi aktif.");
        await invalidate(connection, rep.id);
        await audit.append(connection, {
          ...entry(s, "DELEGATION_DOCUMENT_REVOKED", documentId),
          metadata: { representativeId: rep.id },
        });
        return { ok: true };
      });
    },
  );

  for (const pic of [false, true]) {
    app.get(
      pic ? "/api/representation-documents/:id" : "/api/documents/:id",
      { exposeHeadRoute: false },
      async (request, reply) => {
        reply.headers(pdfHeaders);
        const s = await authorize(
          request,
          pic ? "representation.verify" : "companies",
          auth,
        );
        const { id } = param.parse(request.params);
        const action = entry(
          s,
          pic ? "REPRESENTATION_DOCUMENT_READ" : "DOCUMENT_READ",
          id,
        );
        try {
          const result = await transaction(async (connection) => {
            await principalAtUse(connection, s, pic);
            const initial = await evidence.metadata(connection, id);
            if (!initial?.representativeId) return missing();
            const rep = await member(
              connection,
              initial.companyId,
              initial.representativeId,
              pic ? null : s.userId,
            );
            const doc = await evidence.metadata(connection, id, true);
            if (!doc || doc.authorityType !== rep.authorityType)
              return missing();
            const bytes = await evidence.bytes(connection, doc);
            await audit.append(connection, {
              ...action,
              metadata: {
                representativeId: rep.id,
                version: doc.version,
                requestId: request.id,
              },
            });
            return { bytes, fileName: doc.fileName };
          });
          return reply
            .header(
              "Content-Disposition",
              `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16))}`,
            )
            .type("application/pdf")
            .send(result.bytes);
        } catch (error) {
          await audit.record({
            ...action,
            outcome: "DENIED",
            metadata: { requestId: request.id },
          });
          throw error;
        }
      },
    );
  }

  app.get("/api/representations", async (request, reply) => {
    reply.headers(pdfHeaders);
    const s = await authorize(request, "representation.verify", auth);
    return transaction(async (connection) => {
      await principalAtUse(connection, s, true);
      const list = await queryRows<
        Member & { companyName: string; userName: string }
      >(
        connection,
        `SELECT ${memberFields},C.NAME AS "companyName",U.NAME AS "userName" FROM ${reps} R
         JOIN ${companies} C ON C.ID=R.COMPANY_ID JOIN ${users} U ON U.ID=R.USER_ID
         WHERE C.STATUS='ACTIVE' AND ${currentRep} ORDER BY R.ID FETCH FIRST 100 ROWS ONLY`,
        {},
      );
      const result = [];
      for (const {
        companyName,
        userName,
        canManageRepresentatives,
        ...rep
      } of list) {
        const documents = (await evidence.current(connection, rep.id))
          .filter((doc) => doc.authorityType === rep.authorityType)
          .map((doc) => delegationSummary(doc));
        result.push({
          ...rep,
          canManageRepresentatives: canManageRepresentatives === 1,
          user: { id: rep.userId, name: userName },
          company: { id: rep.companyId, name: companyName, documents },
        });
      }
      return result;
    });
  });

  app.post("/api/representations/:id/verify", async (request) => {
    const s = await authorize(request, "representation.verify", auth);
    const { id } = param.parse(request.params);
    const action = entry(s, "REPRESENTATION_VERIFIED", id);
    try {
      const input = z
        .strictObject({
          status: z.enum(["VERIFIED", "DOCUMENT_UPDATE_REQUIRED"]),
          reason: z.string().trim().min(5).max(500),
          documentId: z.uuid(),
          expectedRevision: z.number().int().min(0),
        })
        .parse(request.body);
      return await transaction(async (connection) => {
        await principalAtUse(connection, s, true);
        const [initial] = await queryRows<{ COMPANY_ID: string }>(
          connection,
          `SELECT COMPANY_ID FROM ${reps} WHERE ID=:id`,
          { id },
        );
        if (!initial) fail(404, "Perwakilan tidak ditemui.");
        const rep = await member(connection, initial.COMPANY_ID, id, null);
        if (rep.userId === s.userId) fail(403, "Pengesah bebas diperlukan.");
        const doc = await evidence.metadata(connection, input.documentId, true);
        if (
          !doc ||
          doc.representativeId !== id ||
          doc.companyId !== rep.companyId
        )
          return missing();
        if (doc.uploadedBy === s.userId)
          fail(403, "Pengesah bebas diperlukan.");
        if (input.expectedRevision !== rep.verificationRevision)
          fail(409, "Versi pengesahan sudah berubah.");
        if (
          doc.authorityType !== rep.authorityType ||
          !cleanDelegation(doc, new Date())
        )
          fail(409, "Surat kuasa versi semasa belum layak.");
        await evidence.bytes(connection, doc);
        const verificationRevision = rep.verificationRevision + 1;
        await connection.execute(
          `UPDATE ${reps} SET STATUS=:status,VERIFIED_BY=:userId,
          VERIFIED_DOCUMENT_ID=:docId,VERIFICATION_REVISION=:verificationRevision WHERE ID=:id`,
          {
            status: input.status,
            userId: s.userId,
            docId: input.status === "VERIFIED" ? doc.id : null,
            verificationRevision,
            id,
          },
        );
        await audit.append(connection, {
          ...action,
          metadata: {
            reason: input.reason,
            companyId: rep.companyId,
            representativeId: id,
            documentId: doc.id,
            version: doc.version,
            sha256: doc.sha256,
            authorityType: doc.authorityType,
            previousStatus: rep.status,
            status: input.status,
            revision: verificationRevision,
          },
        });
        await connection.execute(
          `INSERT INTO ${notifications} (ID,USER_ID,TYPE,TITLE,MESSAGE)
          VALUES (:id,:userId,'COMPANY','Status perwakilan berubah',:message)`,
          { id: randomUUID(), userId: rep.userId, message: clob(input.reason) },
        );
        return { ok: true, verificationRevision, documentVersion: doc.version };
      });
    } catch (error) {
      await audit.record({
        ...action,
        outcome: "DENIED",
        metadata: { requestId: request.id },
      });
      throw error;
    }
  });
}
