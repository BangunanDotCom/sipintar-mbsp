import * as pgEvidence from "../apps/api/src/delegation-evidence";
import * as oraEvidence from "../apps/api/src/oracle/delegation-evidence";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parse } from "dotenv";
import oracledb, { type BindParameters } from "oracledb";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance, HTTPMethods } from "fastify";
import { buildApp, buildOracleLabApp } from "../apps/api/src/app";
import { postgresAuth } from "../apps/api/src/auth-repository";
import { db, hash, origin } from "../apps/api/src/core";
import { scanDelegationDocument } from "../apps/api/src/delegation-scan-worker";
import { oracleConfig } from "../apps/api/src/oracle/config";
import { createOraclePool, type OraclePool } from "../apps/api/src/oracle/pool";
import { createOracleDelegationScanner } from "../apps/api/src/oracle/delegation-scan";
import { createOracleRepositories } from "../apps/api/src/oracle/provider";
import { queryRows, timestamp } from "../apps/api/src/oracle/query";
import { seed } from "../prisma/seed";

const syntheticPdf = Buffer.from("%PDF-1.4\nEXAMPLE P0 FIXTURE\n%%EOF");
const clean = {
  scan: async () => ({ status: "CLEAN" as const, engine: "synthetic" }),
};
const pgName = "staylink_issue58_p0integration_test";
const oracleEnabled = Boolean(
  process.env.ORACLE_P0_OWNER_ENV &&
  process.env.ORACLE_P0_RUNTIME_ENV &&
  process.env.ORACLE_P0_SCANNER_ENV,
);

for (const oracle of [false, true]) {
  describe.skipIf(
    oracle ? !oracleEnabled : process.env.STAYLINK_TEST_P0_POSTGRES !== "true",
  )(`P0 delegation persistence on ${oracle ? "Oracle" : "PostgreSQL"}`, () => {
    let owner: OraclePool | undefined,
      runtime: OraclePool | undefined,
      scanner: OraclePool | undefined;
    let app: FastifyInstance;
    let auth = postgresAuth;
    async function pool(path: string, purpose: "install" | "runtime") {
      return createOraclePool(
        oracleConfig(parse(await readFile(path)), purpose),
      );
    }
    async function sql(statement: string, binds: BindParameters = {}) {
      return owner!.transaction((connection) =>
        connection.execute(statement, binds),
      );
    }
    beforeAll(async () => {
      if (oracle) {
        owner = await pool(process.env.ORACLE_P0_OWNER_ENV!, "install");
        runtime = await pool(process.env.ORACLE_P0_RUNTIME_ENV!, "runtime");
        scanner = await pool(process.env.ORACLE_P0_SCANNER_ENV!, "runtime");
        if (!/^STL_LAB_P0_O[0-9]+$/.test(owner.owner))
          throw Error("The P0 fixture needs its dedicated Oracle owner.");
        const repositories = createOracleRepositories(runtime);
        auth = repositories.auth;
        app = await buildOracleLabApp(repositories);
      } else {
        const url = new URL(process.env.TEST_DATABASE_URL!);
        if (
          url.hostname !== "127.0.0.1" ||
          url.pathname !== "/" + pgName ||
          url.href !== process.env.DATABASE_URL ||
          url.search ||
          url.hash
        )
          throw Error(
            "The P0 fixture needs its dedicated PostgreSQL database.",
          );
        const [current] = await db.$queryRaw<
          { name: string }[]
        >`SELECT current_database()::text AS name`;
        if (current?.name !== pgName) throw Error("Unexpected P0 database.");
        await seed();
        app = await buildApp();
      }
    });
    afterAll(async () => {
      await app?.close();
      await Promise.all([owner?.close(), runtime?.close(), scanner?.close()]);
      if (!oracle) await db.$disconnect();
    });

    async function actor(
      role = "PEMOHON",
      districtId: string | null = null,
      mfaVerified = true,
    ) {
      const raw = randomUUID(),
        csrf = randomUUID();
      const officer = role !== "PEMOHON";
      const user = await auth.register({
        email: raw + "@example.test",
        name: "Synthetic P0 account",
        phone: "0123456789",
        identificationHash: hash(raw),
        identificationEncrypted: "fixture",
        identificationMasked: "1234",
        passwordHash: "unused-fixture",
        consentAt: new Date(),
      });
      const kind = officer ? "OFFICER" : "APPLICANT";
      if (oracle) {
        await sql(
          "UPDATE STL_USERS SET EMAIL_VERIFIED=1,KIND=:kind WHERE ID=:id",
          { kind, id: user.id },
        );
        if (officer)
          await sql(
            `INSERT INTO STL_USER_ROLE_ASSIGNMENTS(ID,USER_ID,ROLE_ID,DISTRICT_ID,REFERENCE)
          VALUES(:id,:userId,:role,:districtId,'P0 synthetic')`,
            { id: randomUUID(), userId: user.id, role, districtId },
          );
      } else {
        await db.user.update({
          where: { id: user.id },
          data: {
            emailVerified: true,
            kind,
            ...(officer && {
              roles: {
                create: { roleId: role, districtId, reference: "P0 synthetic" },
              },
            }),
          },
        });
      }
      await auth.createSession({
        id: hash(raw),
        userId: user.id,
        csrfHash: hash(csrf),
        expiresAt: new Date(Date.now() + 3_600_000),
        mfaVerified,
      });
      await auth.switchRole(hash(raw), role);
      return {
        id: user.id,
        email: user.email,
        session: hash(raw),
        headers: { cookie: "staylink=" + raw, origin, "x-csrf-token": csrf },
      };
    }
    function request(
      who: Awaited<ReturnType<typeof actor>>,
      url: string,
      method: HTTPMethods = "GET",
      payload?: object,
    ) {
      return app.inject({
        url,
        method,
        headers: who.headers,
        payload,
        remoteAddress: `fd00:${hash(who.id).slice(0, 4)}:${hash(who.id).slice(4, 8)}::1`,
      });
    }
    function scan(id: string, service = clean, clock?: () => Date) {
      return scanner
        ? createOracleDelegationScanner(scanner).scan(service, id, clock)
        : scanDelegationDocument(db, service, id, clock);
    }
    async function addRepresentative(companyId: string, userId: string) {
      const id = randomUUID();
      if (oracle)
        await sql(
          `INSERT INTO STL_COMPANY_REPRESENTATIVES (ID,COMPANY_ID,USER_ID,AUTHORITY_TYPE)
        VALUES(:id,:companyId,:userId,'PEKERJA')`,
          { id, companyId, userId },
        );
      else
        await db.companyRepresentative.create({
          data: { id, companyId, userId, authorityType: "PEKERJA" },
        });
      return id;
    }
    async function fixture() {
      const applicant = await actor();
      const reviewer = await actor("PIC_KAWASAN");
      const response = await request(applicant, "/api/companies", "POST", {
        name: "Syarikat sintetik P0",
        registrationNumber: "P0" + randomUUID().slice(0, 16),
        address: "Alamat sintetik",
        phone: "0100000000",
        email: "fixture@example.test",
        authorityType: "PENGARAH",
      });
      expect(response.statusCode, response.body).toBe(201);
      const companyId = response.json().id;
      const [membership] = (await request(applicant, "/api/companies")).json();
      const rep = membership.id;
      const upload = (who = applicant, input = {}) =>
        request(who, `/api/companies/${companyId}/documents`, "POST", {
          fileName: "p0-fixture.pdf",
          content: syntheticPdf.toString("base64"),
          ...input,
        });
      const document = await upload();
      expect(document.statusCode, document.body).toBe(200);
      const id = document.json().id;
      const verify = (
        documentId = id,
        expectedRevision = 1,
        who = reviewer,
        target = rep,
      ) =>
        request(who, `/api/representations/${target}/verify`, "POST", {
          documentId,
          expectedRevision,
          status: "VERIFIED",
          reason: "P0 synthetic verification",
        });
      return { applicant, reviewer, companyId, rep, id, upload, verify };
    }
    async function setVerdict(
      id: string,
      scanStatus: string,
      scanSha256: string | null = null,
    ) {
      if (oracle)
        await sql(
          "UPDATE STL_DELEGATION_DOCUMENTS SET SCAN_STATUS=:scanStatus,SCAN_SHA256=:scanSha256 WHERE ID=:id",
          { id, scanStatus, scanSha256 },
        );
      else
        await db.delegationDocument.update({
          where: { id },
          data: { scanStatus, scanSha256 },
        });
    }
    async function proof(id: string) {
      if (!oracle)
        return db.companyRepresentative.findUniqueOrThrow({
          where: { id },
          select: { verifiedDocumentId: true, verificationRevision: true },
        });
      return owner!.use(
        async (connection) =>
          (
            await queryRows<{
              verifiedDocumentId: string | null;
              verificationRevision: number;
            }>(
              connection,
              `SELECT VERIFIED_DOCUMENT_ID AS "verifiedDocumentId",VERIFICATION_REVISION AS "verificationRevision"
        FROM STL_COMPANY_REPRESENTATIVES WHERE ID=:id`,
              { id },
            )
          )[0],
      );
    }
    async function decisions(id: string) {
      if (!oracle)
        return db.auditLog.count({
          where: {
            target: id,
            action: "REPRESENTATION_VERIFIED",
            outcome: "SUCCESS",
          },
        });
      return owner!.use(
        async (connection) =>
          (
            await queryRows<{ N: number }>(
              connection,
              "SELECT COUNT(*) N FROM STL_AUDIT_LOGS WHERE TARGET=:id AND ACTION='REPRESENTATION_VERIFIED' AND OUTCOME='SUCCESS'",
              { id },
            )
          )[0].N,
      );
    }

    it("A-N01/A-N02/A-N03/A-N05/A-P01 enforce release, integrity, authority and audit on both byte routes", async () => {
      const f = await fixture();
      const applicantPath = `/api/documents/${f.id}`;
      const officerPath = `/api/representation-documents/${f.id}`;
      const legacy = randomUUID();
      if (oracle)
        await sql(
          `INSERT INTO STL_DELEGATION_DOCUMENTS(ID,COMPANY_ID,UPLOADED_BY,FILE_NAME,MIME_TYPE,CONTENT,SHA256,SCAN_STATUS)
        VALUES(:id,:companyId,:uploadedBy,'legacy.pdf','application/pdf',:content,:sha256,'LEGACY')`,
          {
            id: legacy,
            companyId: f.companyId,
            uploadedBy: f.applicant.id,
            content: { val: syntheticPdf, type: oracledb.BLOB },
            sha256: hash("legacy"),
          },
        );
      else
        await db.delegationDocument.create({
          data: {
            id: legacy,
            companyId: f.companyId,
            uploadedBy: f.applicant.id,
            fileName: "legacy.pdf",
            mimeType: "application/pdf",
            content: syntheticPdf,
            sha256: hash("legacy"),
          },
        });
      for (const kind of [
        "PENDING",
        "SCANNING",
        "INFECTED",
        "FAILED",
        "CLEAN",
      ]) {
        await setVerdict(f.id, kind);
        for (const [who, path] of [
          [f.applicant, applicantPath],
          [f.reviewer, officerPath],
        ] as const) {
          const denied = await request(who, path);
          expect(denied.statusCode, denied.body).toBe(404);
          expect(denied.body).not.toContain("EXAMPLE P0 FIXTURE");
          expect(denied.headers["content-disposition"]).toBeUndefined();
        }
      }
      expect(
        (await request(f.applicant, `/api/documents/${legacy}`)).statusCode,
      ).toBe(404);
      expect(
        (await request(f.reviewer, `/api/representation-documents/${legacy}`))
          .statusCode,
      ).toBe(404);
      expect((await app.inject(applicantPath)).statusCode).toBe(401);
      await setVerdict(f.id, "PENDING");
      expect(await scan(f.id)).toBe(true);
      const outsider = await actor();
      const outsiderRep = await addRepresentative(f.companyId, outsider.id);
      if (oracle)
        await expect(
          runtime!.transaction((c) =>
            c.execute(
              `UPDATE ${runtime!.owner}.STL_DELEGATION_DOCUMENTS SET SCAN_STATUS='CLEAN' WHERE ID=:id`,
              { id: f.id },
            ),
          ),
        ).rejects.toThrow(/ORA-(01031|41900)/);
      expect(
        (await request(outsider, "/api/companies")).json()[0].company.documents,
      ).toEqual([]);
      for (const [who, path] of [
        [f.applicant, applicantPath],
        [f.reviewer, officerPath],
      ] as const) {
        const allowed = await request(who, path);
        expect(allowed.statusCode, allowed.body).toBe(200);
        expect(allowed.rawPayload).toEqual(syntheticPdf);
        expect(allowed.headers).toMatchObject({
          "cache-control": "private, no-store",
          "x-content-type-options": "nosniff",
          "content-security-policy": "sandbox",
          "referrer-policy": "no-referrer",
        });
      }
      expect((await request(outsider, applicantPath)).statusCode).toBe(404);
      expect(
        (await request(await actor("PIC_KAWASAN", "SPU"), officerPath))
          .statusCode,
      ).toBe(403);
      const auditCount = oracle
        ? await owner!.use(
            async (connection) =>
              (
                await queryRows<{ N: number }>(
                  connection,
                  "SELECT COUNT(*) N FROM STL_AUDIT_LOGS WHERE TARGET=:id AND ACTION IN ('DOCUMENT_READ','REPRESENTATION_DOCUMENT_READ') AND OUTCOME='SUCCESS'",
                  { id: f.id },
                )
              )[0].N,
          )
        : await db.auditLog.count({
            where: {
              target: f.id,
              outcome: "SUCCESS",
              action: { in: ["DOCUMENT_READ", "REPRESENTATION_DOCUMENT_READ"] },
            },
          });
      expect(auditCount).toBe(2);
      const bad = randomUUID();
      const sha256 = hash(syntheticPdf.toString("utf8"));
      const byteSize = syntheticPdf.length + 1;
      const validFrom = new Date(Date.now() - 60_000);
      const scanValidUntil = new Date(Date.now() + 60_000);
      if (oracle)
        await sql(
          `INSERT INTO STL_DELEGATION_DOCUMENTS(ID,COMPANY_ID,UPLOADED_BY,FILE_NAME,MIME_TYPE,CONTENT,
        SHA256,SCAN_STATUS,REPRESENTATIVE_ID,VERSION,VALID_FROM,BYTE_SIZE,AUTHORITY_TYPE,SCAN_SHA256,SCAN_ENGINE,SCAN_VALID_UNTIL)
        VALUES(:bad,:companyId,:uploadedBy,'mismatch.pdf','application/pdf',:content,
        :sha256,'CLEAN',:outsiderRep,1,:validFrom,:byteSize,'PEKERJA',:sha256,'fixture',:scanValidUntil)`,
          {
            bad,
            companyId: f.companyId,
            uploadedBy: outsider.id,
            outsiderRep,
            sha256,
            byteSize,
            content: { val: syntheticPdf, type: oracledb.BLOB },
            validFrom: timestamp(validFrom),
            scanValidUntil: timestamp(scanValidUntil),
          },
        );
      else
        await db.delegationDocument.create({
          data: {
            id: bad,
            companyId: f.companyId,
            uploadedBy: outsider.id,
            fileName: "mismatch.pdf",
            mimeType: "application/pdf",
            content: syntheticPdf,
            sha256,
            scanStatus: "CLEAN",
            representativeId: outsiderRep,
            version: 1,
            validFrom,
            byteSize,
            authorityType: "PEKERJA",
            scanSha256: sha256,
            scanEngine: "fixture",
            scanValidUntil,
          },
        });
      for (const [who, path] of [
        [outsider, `/api/documents/${bad}`],
        [f.reviewer, `/api/representation-documents/${bad}`],
      ] as const) {
        const denied = await request(who, path);
        expect(denied.statusCode).toBe(404);
        expect(denied.body).not.toContain("EXAMPLE P0 FIXTURE");
      }
      expect(
        (await request(outsider, `/api/documents/${randomUUID()}`)).statusCode,
      ).toBe(404);
      await setVerdict(f.id, "CLEAN", "a".repeat(64));
      expect((await request(f.applicant, applicantPath)).statusCode).toBe(404);
      expect((await f.verify()).statusCode).toBe(409);
      if (oracle)
        await expect(
          sql("UPDATE STL_DELEGATION_DOCUMENTS SET BYTE_SIZE=1 WHERE ID=:id", {
            id: f.id,
          }),
        ).rejects.toThrow();
      else
        await expect(
          db.delegationDocument.update({
            where: { id: f.id },
            data: { byteSize: 1 },
          }),
        ).rejects.toThrow();
      if (oracle)
        await sql("UPDATE STL_SESSIONS SET EXPIRES_AT=:now WHERE ID=:id", {
          id: f.applicant.session,
          now: timestamp(new Date(0)),
        });
      else
        await db.session.update({
          where: { id: f.applicant.session },
          data: { expiresAt: new Date(0) },
        });
      expect((await request(f.applicant, applicantPath)).statusCode).toBe(401);
    });

    it("A-N04/B-N04 serializes replacements, duplicate leases and stale verdicts", async () => {
      const f = await fixture();
      let start!: () => void, release!: () => void;
      const entered = new Promise<void>((resolve) => {
        start = resolve;
      });
      const resume = new Promise<void>((resolve) => {
        release = resolve;
      });
      let instant = Date.now() + 1_000;
      const clock = () => new Date(instant);
      const stale = scan(
        f.id,
        {
          scan: async () => {
            start();
            await resume;
            return clean.scan();
          },
        },
        clock,
      );
      try {
        await Promise.race([
          entered,
          stale.then(() => {
            throw Error("Worker failed to hold its lease");
          }),
        ]);
        expect(await scan(f.id, clean, clock)).toBe(false);
        instant += 60_001;
        const replacements = await Promise.all([
          f.upload(f.applicant, { expectedDocumentId: f.id }),
          f.upload(f.applicant, { expectedDocumentId: f.id }),
        ]);
        expect(
          replacements.map(({ statusCode }) => statusCode).sort(),
          replacements.map(({ body }) => body).join("\n"),
        ).toEqual([200, 409]);
        const replacement = replacements
          .find(({ statusCode }) => statusCode === 200)!
          .json().id;
        expect(
          await scan(
            replacement,
            {
              scan: async () => {
                throw Error("fixture timeout");
              },
            },
            clock,
          ),
        ).toBe(true);
        expect(
          (await request(f.applicant, `/api/documents/${replacement}`))
            .statusCode,
        ).toBe(404);
      } finally {
        release();
      }
      expect(await stale).toBe(false);
      expect((await f.verify(f.id, 2)).statusCode).toBe(409);
    });

    it("B-N01/B-N02/B-N03/B-N04/B-N05/B-P01 binds one proof, rolls back, rejects stale actions and preserves mandate", async () => {
      const f = await fixture();
      const other = await actor();
      const otherRep = await addRepresentative(f.companyId, other.id);
      const otherUpload = await f.upload(other);
      expect(otherUpload.statusCode, otherUpload.body).toBe(200);
      const otherDoc = otherUpload.json().id;
      const foreign = await fixture();
      expect(await scan(f.id)).toBe(true);
      expect(await scan(otherDoc)).toBe(true);
      for (const id of [randomUUID(), otherDoc, foreign.id])
        expect((await f.verify(id)).statusCode).toBe(404);
      expect(
        (
          await request(
            f.reviewer,
            `/api/representations/${f.rep}/verify`,
            "POST",
            { status: "VERIFIED" },
          )
        ).statusCode,
      ).toBe(400);
      for (const who of [
        f.applicant,
        await actor("PIC_KAWASAN", "SPT"),
        await actor("PIC_KAWASAN", null, false),
        await actor("PPSK"),
        {
          ...f.reviewer,
          headers: {
            ...f.reviewer.headers,
            origin: "https://unrelated.example.test",
          },
        },
        {
          ...f.reviewer,
          headers: { ...f.reviewer.headers, "x-csrf-token": randomUUID() },
        },
      ])
        expect((await f.verify(f.id, 1, who)).statusCode).toBe(403);
      expect(await decisions(f.rep)).toBe(0);
      if (oracle) {
        await expect(
          sql(
            "UPDATE STL_COMPANY_REPRESENTATIVES SET VERIFIED_DOCUMENT_ID=:doc WHERE ID=:id",
            { id: f.rep, doc: otherDoc },
          ),
        ).rejects.toThrow(/ORA-02291/);
        await sql(`CREATE TRIGGER STL_P0_TEST_AUDIT BEFORE INSERT ON STL_AUDIT_LOGS FOR EACH ROW
          BEGIN IF :NEW.ACTION='REPRESENTATION_VERIFIED' AND :NEW.OUTCOME='SUCCESS' THEN
            RAISE_APPLICATION_ERROR(-20024,'Synthetic audit failure'); END IF; END;`);
        try {
          expect((await f.verify()).statusCode).toBe(500);
          expect(await decisions(f.rep)).toBe(0);
          expect(await proof(f.rep)).toEqual({
            verifiedDocumentId: null,
            verificationRevision: 1,
          });
        } finally {
          await sql("DROP TRIGGER STL_P0_TEST_AUDIT");
        }
        await sql(`CREATE TRIGGER STL_P0_TEST_NOTIFY BEFORE INSERT ON STL_NOTIFICATIONS FOR EACH ROW
          BEGIN IF :NEW.TITLE = 'Status perwakilan berubah' THEN RAISE_APPLICATION_ERROR(-20022,'Synthetic notification failure'); END IF; END;`);
      } else {
        await expect(
          db.companyRepresentative.update({
            where: { id: f.rep },
            data: { verifiedDocumentId: otherDoc },
          }),
        ).rejects.toThrow();
        await db.$executeRaw`CREATE FUNCTION p0_provider_failure() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN IF NEW.title = 'Status perwakilan berubah' THEN RAISE EXCEPTION 'Synthetic notification failure'; END IF; RETURN NEW; END $$`;
        await db.$executeRaw`CREATE TRIGGER p0_provider_failure BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION p0_provider_failure()`;
      }
      try {
        expect((await f.verify()).statusCode).toBe(500);
        expect(await decisions(f.rep)).toBe(0);
        expect(await proof(f.rep)).toEqual({
          verifiedDocumentId: null,
          verificationRevision: 1,
        });
      } finally {
        if (oracle) await sql("DROP TRIGGER STL_P0_TEST_NOTIFY");
        else {
          await db.$executeRaw`DROP TRIGGER p0_provider_failure ON notifications`;
          await db.$executeRaw`DROP FUNCTION p0_provider_failure()`;
        }
      }
      const concurrent = await Promise.all([f.verify(), f.verify()]);
      expect(
        concurrent.map(({ statusCode }) => statusCode).sort(),
        concurrent.map(({ body }) => body).join("\n"),
      ).toEqual([200, 409]);
      expect(await decisions(f.rep)).toBe(1);
      expect(await proof(f.rep)).toEqual({
        verifiedDocumentId: f.id,
        verificationRevision: 2,
      });
      expect(await proof(otherRep)).toEqual({
        verifiedDocumentId: null,
        verificationRevision: 1,
      });
      expect(
        (await f.verify(otherDoc, 1, f.reviewer, otherRep)).statusCode,
      ).toBe(200);
      const recipient = await actor();
      const invitations = `/api/companies/${f.companyId}/invitations`;
      const invite = () =>
        request(other, invitations, "POST", {
          email: recipient.email,
          authorityType: "PEKERJA",
        });
      expect((await invite()).statusCode).toBe(200);
      const invitationToken = hash(randomUUID());
      const expiresAt = new Date(Date.now() + 60_000);
      if (oracle)
        await sql(
          `INSERT INTO STL_COMPANY_REP_INVITATIONS(ID,COMPANY_ID,RECIPIENT_ID,INVITED_BY,AUTHORITY_TYPE,TOKEN_HASH,EXPIRES_AT)
        VALUES(:id,:companyId,:recipientId,:invitedBy,'PEKERJA',:tokenHash,:expiresAt)`,
          {
            id: randomUUID(),
            companyId: f.companyId,
            recipientId: recipient.id,
            invitedBy: other.id,
            tokenHash: hash(invitationToken),
            expiresAt: timestamp(expiresAt),
          },
        );
      else
        await db.companyRepresentationInvitation.create({
          data: {
            companyId: f.companyId,
            recipientId: recipient.id,
            invitedBy: other.id,
            authorityType: "PEKERJA",
            tokenHash: hash(invitationToken),
            expiresAt,
          },
        });
      expect(
        (
          await request(
            other,
            `/api/companies/${f.companyId}/documents/${otherDoc}/revoke`,
            "POST",
          )
        ).statusCode,
      ).toBe(200);
      expect((await invite()).statusCode).toBe(403);
      expect(
        (
          await request(recipient, "/api/company-invitations/accept", "POST", {
            token: invitationToken,
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await request(f.applicant, invitations, "POST", {
            email: recipient.email,
            authorityType: "PEKERJA",
          })
        ).statusCode,
      ).toBe(200);
      expect(await proof(otherRep)).toEqual({
        verifiedDocumentId: null,
        verificationRevision: 3,
      });
      expect(await decisions(otherRep)).toBe(1);
    });
    it("A-N04 discards a clean response when the representative is revoked during scanning", async () => {
      const f = await fixture();
      let started!: () => void, finish!: () => void;
      const entered = new Promise<void>((r) => {
        started = r;
      });
      const held = new Promise<void>((r) => {
        finish = r;
      });
      const scanning = scan(f.id, {
        scan: async () => {
          started();
          await held;
          return clean.scan();
        },
      });
      try {
        await Promise.race([
          entered,
          scanning.then(() => {
            throw Error("fixture never held a lease");
          }),
        ]);
        if (oracle)
          await sql(
            "UPDATE STL_COMPANY_REPRESENTATIVES SET STATUS='REVOKED' WHERE ID=:id",
            { id: f.rep },
          );
        else
          await db.companyRepresentative.update({
            where: { id: f.rep },
            data: { status: "REVOKED" },
          });
      } finally {
        finish();
      }
      expect(await scanning).toBe(false);
      expect(
        (await request(f.applicant, `/api/documents/${f.id}`)).statusCode,
      ).toBe(404);
      expect(
        (await request(f.reviewer, `/api/representation-documents/${f.id}`))
          .statusCode,
      ).toBe(404);
    });

    it("A-N02 aborts a read after the eligibility gate without emitting partial PDF bytes", async () => {
      const f = await fixture();
      expect(await scan(f.id)).toBe(true);
      const readFailure = Object.assign(
        Error("synthetic private BLOB read error"),
        { code: "ECONNRESET" },
      );
      const createEvidence = oraEvidence.oracleDelegationEvidence;
      const mocked = oracle
        ? vi
            .spyOn(oraEvidence, "oracleDelegationEvidence")
            .mockImplementation((p) => ({
              ...createEvidence(p),
              bytes: vi.fn().mockRejectedValue(readFailure),
            }))
        : vi
            .spyOn(pgEvidence, "delegationBytes")
            .mockRejectedValue(readFailure);
      let failureApp: FastifyInstance | undefined;
      try {
        failureApp = oracle
          ? await buildOracleLabApp(createOracleRepositories(runtime!))
          : await buildApp();
        for (const [path, who] of [
          [`/api/documents/${f.id}`, f.applicant],
          [`/api/representation-documents/${f.id}`, f.reviewer],
        ] as const) {
          const denied = await failureApp.inject({
            url: path,
            headers: who.headers,
          });
          expect(denied.statusCode, denied.body).toBe(503);
          expect(denied.json().code).toBe("DATABASE_UNAVAILABLE");
          expect(denied.headers["content-disposition"]).toBeUndefined();
          expect(denied.body).not.toMatch(/%PDF|EXAMPLE P0|synthetic private/);
        }
      } finally {
        mocked.mockRestore();
        await failureApp?.close();
      }
      if (scanner)
        await expect(
          scanner.transaction((c) =>
            c.execute(
              `UPDATE ${scanner!.owner}.STL_COMPANY_REPRESENTATIVES SET STATUS='VERIFIED' WHERE ID=:id`,
              { id: f.rep },
            ),
          ),
        ).rejects.toThrow(/ORA-(01031|41900)/);
      const recovered = await request(f.applicant, `/api/documents/${f.id}`);
      expect(recovered.statusCode, recovered.body).toBe(200);
      expect(recovered.rawPayload).toEqual(syntheticPdf);
    });

    async function inviteFixture(direct = false) {
      const f = await fixture();
      if (!direct) {
        if (oracle)
          await sql(
            "UPDATE STL_COMPANY_REPRESENTATIVES SET CAN_MANAGE_REPRESENTATIVES=0 WHERE ID=:id",
            { id: f.rep },
          );
        else
          await db.companyRepresentative.update({
            where: { id: f.rep },
            data: { canManageRepresentatives: false },
          });
        expect(await scan(f.id)).toBe(true);
        expect((await f.verify()).statusCode).toBe(200);
      }
      const recipient = await actor();
      const issued = await request(
        f.applicant,
        `/api/companies/${f.companyId}/invitations`,
        "POST",
        { email: recipient.email, authorityType: "PEKERJA" },
      );
      expect(issued.statusCode, issued.body).toBe(200);
      let raw: string | null = null;
      for (let attempt = 0; attempt < 20 && !raw; attempt++) {
        const query = encodeURIComponent("to:" + recipient.email);
        const list = await fetch(
          "http://127.0.0.1:8025/api/v1/search?query=" + query,
        ).then((r) => r.json());
        for (const item of list.messages ?? []) {
          if (!item.Subject.includes("Jemputan wakil syarikat")) continue;
          const body = await fetch(
            "http://127.0.0.1:8025/api/v1/message/" + item.ID,
          ).then((r) => r.json());
          raw = body.Text.match(/[?&]token=([a-f0-9]{64})/)?.[1] ?? null;
        }
        if (!raw) await new Promise((r) => setTimeout(r, 100));
      }
      if (!raw) throw Error("Mailpit did not receive the invitation fixture.");
      const invitationId: string = issued.json().id;
      const accept = (who = recipient) =>
        request(who, "/api/company-invitations/accept", "POST", { token: raw });
      async function unchanged() {
        if (oracle) {
          const state = await owner!.use(
            async (c) =>
              (
                await queryRows<{
                  REPS: number;
                  CLAIMS: number;
                  EVENTS: number;
                  NOTICES: number;
                }>(
                  c,
                  `SELECT (SELECT COUNT(*) FROM STL_COMPANY_REPRESENTATIVES WHERE COMPANY_ID=:companyId AND USER_ID=:recipientId) REPS,
              (SELECT COUNT(*) FROM STL_COMPANY_REP_INVITATIONS WHERE ID=:invitationId AND ACCEPTED_AT IS NOT NULL) CLAIMS,
              (SELECT COUNT(*) FROM STL_AUDIT_LOGS WHERE ACTOR_ID=:recipientId AND ACTION='COMPANY_INVITATION_ACCEPTED') EVENTS,
              (SELECT COUNT(*) FROM STL_NOTIFICATIONS WHERE USER_ID=:recipientId AND TITLE='Perwakilan syarikat diterima') NOTICES FROM DUAL`,
                  {
                    companyId: f.companyId,
                    recipientId: recipient.id,
                    invitationId,
                  },
                )
              )[0],
          );
          expect(state).toEqual({ REPS: 0, CLAIMS: 0, EVENTS: 0, NOTICES: 0 });
        } else {
          expect(
            await db.companyRepresentative.count({
              where: { companyId: f.companyId, userId: recipient.id },
            }),
          ).toBe(0);
          expect(
            (
              await db.companyRepresentationInvitation.findUniqueOrThrow({
                where: { id: invitationId },
              })
            ).acceptedAt,
          ).toBeNull();
          expect(
            await db.auditLog.count({
              where: {
                actorId: recipient.id,
                action: "COMPANY_INVITATION_ACCEPTED",
              },
            }),
          ).toBe(0);
          expect(
            await db.notification.count({
              where: {
                userId: recipient.id,
                title: "Perwakilan syarikat diterima",
              },
            }),
          ).toBe(0);
        }
      }
      const expire = () =>
        oracle
          ? sql(
              "UPDATE STL_DELEGATION_DOCUMENTS SET SCAN_VALID_UNTIL=:past WHERE ID=:id",
              { past: timestamp(new Date(0)), id: f.id },
            )
          : db.delegationDocument.update({
              where: { id: f.id },
              data: { scanValidUntil: new Date(0) },
            });
      return { ...f, recipient, invitationId, accept, unchanged, expire };
    }

    it("B-N01/B-N02/B-P01 accepts the exact issued proof once and isolates the recipient", async () => {
      const f = await inviteFixture();
      const wrong = await actor();
      expect((await f.accept(wrong)).statusCode).toBe(400);
      await f.unchanged();
      const accepted = await f.accept();
      expect(accepted.statusCode, accepted.body).toBe(200);
      expect(await proof(accepted.json().id)).toEqual({
        verifiedDocumentId: null,
        verificationRevision: 0,
      });
      expect((await f.accept()).statusCode).toBe(400);
    });

    it("B-N02 rejects expired and rescanned proof without changing the invitation or membership", async () => {
      const f = await inviteFixture();
      await f.expire();
      expect((await f.accept()).statusCode).toBe(403);
      await f.unchanged();
      expect(await scan(f.id)).toBe(true);
      expect((await f.accept()).statusCode).toBe(403);
      await f.unchanged();
    });

    it("B-N02 rejects replacement and reapproval, withdrawal and revoked direct authority", async () => {
      const f = await inviteFixture();
      const replaced = await f.upload(f.applicant, {
        expectedDocumentId: f.id,
      });
      expect(replaced.statusCode, replaced.body).toBe(200);
      const next = replaced.json().id;
      expect(await scan(next)).toBe(true);
      expect((await f.verify(next, 3)).statusCode).toBe(200);
      expect((await f.accept()).statusCode).toBe(403);
      await f.unchanged();
      const revoked = await inviteFixture();
      expect(
        (
          await request(
            revoked.applicant,
            `/api/companies/${revoked.companyId}/documents/${revoked.id}/revoke`,
            "POST",
          )
        ).statusCode,
      ).toBe(200);
      expect((await revoked.accept()).statusCode).toBe(403);
      await revoked.unchanged();
      const direct = await inviteFixture(true);
      if (oracle)
        await sql(
          "UPDATE STL_COMPANY_REPRESENTATIVES SET CAN_MANAGE_REPRESENTATIVES=0 WHERE ID=:id",
          { id: direct.rep },
        );
      else
        await db.companyRepresentative.update({
          where: { id: direct.rep },
          data: { canManageRepresentatives: false },
        });
      expect((await direct.accept()).statusCode).toBe(403);
      await direct.unchanged();
    });

    it("B-N02 rejects an expired issuer role, including the database-clock expiry boundary", async () => {
      const f = await inviteFixture(true);
      await f.unchanged();
      if (oracle)
        await sql(
          "UPDATE STL_USER_ROLE_ASSIGNMENTS SET ENDS_AT=SYSTIMESTAMP WHERE USER_ID=:id",
          { id: f.applicant.id },
        );
      else
        await db.$executeRaw`UPDATE user_role_assignments SET "endsAt"=date_trunc('milliseconds',clock_timestamp() AT TIME ZONE 'UTC')
        WHERE "userId"=${f.applicant.id}`;
      expect((await f.accept()).statusCode).toBe(403);
      await f.unchanged();
    });

    it("B-N02 rolls back when the issuer appointment expires after all four writes", async () => {
      const f = await inviteFixture(true);
      await f.unchanged();
      if (oracle) {
        // The trigger only runs after the preliminary authorization, membership, audit
        // and notification insert. It waits on the database clock rather than JS time.
        await sql(`CREATE TRIGGER STL_P0_ROLE_CLOCK AFTER INSERT ON STL_NOTIFICATIONS FOR EACH ROW
          DECLARE deadline TIMESTAMP WITH TIME ZONE;
          BEGIN
            IF :NEW.TITLE='Perwakilan syarikat diterima' THEN
              SELECT MAX(A.ENDS_AT) INTO deadline FROM STL_USER_ROLE_ASSIGNMENTS A JOIN STL_COMPANY_REP_INVITATIONS I
                ON I.INVITED_BY=A.USER_ID WHERE I.RECIPIENT_ID=:NEW.USER_ID AND I.ACCEPTED_AT IS NOT NULL;
              IF deadline IS NULL OR deadline<=SYSTIMESTAMP THEN
                RAISE_APPLICATION_ERROR(-20026,'Fixture did not enter writes before expiry');
              END IF;
              WHILE SYSTIMESTAMP<deadline LOOP DBMS_SESSION.SLEEP(0.025); END LOOP;
            END IF;
          END;`);
        try {
          await sql(
            "UPDATE STL_USER_ROLE_ASSIGNMENTS SET ENDS_AT=SYSTIMESTAMP+INTERVAL '3' SECOND WHERE USER_ID=:id",
            { id: f.applicant.id },
          );
          const response = await f.accept();
          expect(response.statusCode, response.body).toBe(403);
        } finally {
          await sql("DROP TRIGGER STL_P0_ROLE_CLOCK");
        }
      } else {
        await db.$executeRaw`CREATE FUNCTION p0_role_clock() RETURNS trigger LANGUAGE plpgsql AS $$
          DECLARE deadline timestamp;
          BEGIN
            IF NEW.title='Perwakilan syarikat diterima' THEN
              SELECT max(a."endsAt") INTO deadline FROM user_role_assignments a JOIN company_representation_invitations i
                ON i."invitedBy"=a."userId" WHERE i."recipientId"=NEW."userId" AND i."acceptedAt" IS NOT NULL;
              IF deadline IS NULL OR deadline <= (clock_timestamp() AT TIME ZONE 'UTC') THEN
                RAISE EXCEPTION 'Fixture did not enter writes before expiry';
              END IF;
              PERFORM pg_sleep_until(deadline AT TIME ZONE 'UTC');
            END IF;
            RETURN NEW;
          END $$`;
        await db.$executeRaw`CREATE TRIGGER p0_role_clock AFTER INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION p0_role_clock()`;
        try {
          await db.$executeRaw`UPDATE user_role_assignments SET "endsAt"=(clock_timestamp() AT TIME ZONE 'UTC')+interval '3 seconds'
            WHERE "userId"=${f.applicant.id}`;
          const response = await f.accept();
          expect(response.statusCode, response.body).toBe(403);
        } finally {
          await db.$executeRaw`DROP TRIGGER p0_role_clock ON notifications`;
          await db.$executeRaw`DROP FUNCTION p0_role_clock()`;
        }
      }
      await f.unchanged();
    });

    it("B-N05 leaves the invitation claim and recipient unchanged on audit failure", async () => {
      const f = await inviteFixture(true);
      if (oracle)
        await sql(`CREATE TRIGGER STL_P0_ACCEPT_AUDIT BEFORE INSERT ON STL_AUDIT_LOGS FOR EACH ROW
        BEGIN IF :NEW.ACTION='COMPANY_INVITATION_ACCEPTED' THEN
          RAISE_APPLICATION_ERROR(-20027, 'Fixture acceptance audit failure');
        END IF; END;`);
      else {
        await db.$executeRaw`CREATE FUNCTION p0_accept_audit() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN IF NEW.action='COMPANY_INVITATION_ACCEPTED' THEN RAISE EXCEPTION 'Fixture acceptance audit failure'; END IF;
          RETURN NEW; END $$`;
        await db.$executeRaw`CREATE TRIGGER p0_accept_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION p0_accept_audit()`;
      }
      try {
        expect((await f.accept()).statusCode).toBe(500);
        await f.unchanged();
      } finally {
        if (oracle) await sql("DROP TRIGGER STL_P0_ACCEPT_AUDIT");
        else {
          await db.$executeRaw`DROP TRIGGER p0_accept_audit ON audit_logs`;
          await db.$executeRaw`DROP FUNCTION p0_accept_audit()`;
        }
      }
    });

    it("B-N04 preserves a completed acceptance when issuer revocation commits later", async () => {
      const f = await inviteFixture(true);
      const accepted = await f.accept();
      expect(accepted.statusCode, accepted.body).toBe(200);
      if (oracle)
        await sql(
          "UPDATE STL_USER_ROLE_ASSIGNMENTS SET STATUS='REVOKED' WHERE USER_ID=:id",
          { id: f.applicant.id },
        );
      else
        await db.userRoleAssignment.updateMany({
          where: { userId: f.applicant.id },
          data: { status: "REVOKED" },
        });
      expect((await f.accept()).statusCode).toBe(400);
      const acceptedId: string = accepted.json().id;
      expect(await proof(acceptedId)).toEqual({
        verifiedDocumentId: null,
        verificationRevision: 0,
      });
      const claimed = oracle
        ? (
            await owner!.use((c) =>
              queryRows<{ N: number }>(
                c,
                "SELECT COUNT(*) N FROM STL_COMPANY_REP_INVITATIONS WHERE ID=:id AND ACCEPTED_AT IS NOT NULL",
                { id: f.invitationId },
              ),
            )
          )[0].N
        : await db.companyRepresentationInvitation.count({
            where: { id: f.invitationId, acceptedAt: { not: null } },
          });
      expect(claimed).toBe(1);
    });

    it("B-N04/B-N05 rejects committed revocation and rolls back failed acceptance writes", async () => {
      const f = await inviteFixture(true);
      let locked!: () => void, release!: () => void;
      const ready = new Promise<void>((r) => {
        locked = r;
      });
      const held = new Promise<void>((r) => {
        release = r;
      });
      const revoke = oracle
        ? owner!.transaction(async (c) => {
            await c.execute(
              "UPDATE STL_COMPANY_REPRESENTATIVES SET STATUS='REVOKED' WHERE ID=:id",
              { id: f.rep },
            );
            locked();
            await held;
          })
        : db.$transaction(async (tx) => {
            await tx.companyRepresentative.update({
              where: { id: f.rep },
              data: { status: "REVOKED" },
            });
            locked();
            await held;
          });
      await Promise.race([
        ready,
        revoke.then(() => {
          throw Error("revocation did not acquire lock");
        }),
      ]);
      const accepting = f.accept();
      try {
        await new Promise((r) => setTimeout(r, 100));
      } finally {
        release();
      }
      await revoke;
      expect((await accepting).statusCode).toBe(403);
      await f.unchanged();

      const valid = await inviteFixture(true);
      if (oracle)
        await sql(`CREATE TRIGGER STL_P0_ACC_NOTIFY BEFORE INSERT ON STL_NOTIFICATIONS FOR EACH ROW
        BEGIN IF :NEW.TITLE='Perwakilan syarikat diterima' THEN
        RAISE_APPLICATION_ERROR(-20022,'Synthetic notification failure'); END IF; END;`);
      else {
        await db.$executeRaw`CREATE FUNCTION p0_accept_abort() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN IF NEW.title='Perwakilan syarikat diterima' THEN RAISE EXCEPTION 'Synthetic notification failure'; END IF; RETURN NEW; END $$`;
        await db.$executeRaw`CREATE TRIGGER p0_accept_abort BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION p0_accept_abort()`;
      }
      try {
        expect((await valid.accept()).statusCode).toBe(500);
        await valid.unchanged();
      } finally {
        if (oracle) await sql("DROP TRIGGER STL_P0_ACC_NOTIFY");
        else {
          await db.$executeRaw`DROP TRIGGER p0_accept_abort ON notifications`;
          await db.$executeRaw`DROP FUNCTION p0_accept_abort()`;
        }
      }
      const accepted = await valid.accept();
      expect(accepted.statusCode, accepted.body).toBe(200);
      expect((await valid.accept()).statusCode).toBe(400);
    });
  });
}
