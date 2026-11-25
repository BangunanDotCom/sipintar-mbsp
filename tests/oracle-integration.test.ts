import { createOracleCompletionRepository } from "../apps/api/src/oracle/synthetic-completion";
import { companyInvitationRoutes } from "../apps/api/src/company-invitations";
import { createOracleCompanyInvitationRepository } from "../apps/api/src/oracle/company-invitations";
import { createOracleDocumentScanRepository } from "../apps/api/src/oracle/document-scan";
import { createPrivateDocumentKey } from "../apps/api/src/private-document-keys";
import { processPendingDocumentScanBatch } from "../apps/api/src/document-scan-batch";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import argon2 from "argon2";
import { authRoutes, totp } from "../apps/api/src/auth";
import { closeMailer, hash, origin } from "../apps/api/src/core";
import { managementRoutes } from "../apps/api/src/management-routes";
import { createOracleManagementRepository } from "../apps/api/src/oracle/management";
import { createOracleAuthRepository } from "../apps/api/src/oracle/auth";
import { oracleGeneratedLobIndexes } from "../scripts/oracle/lob-indexes";
import { readFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { parse } from "dotenv";
import oracledb, { type Connection } from "oracledb";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { oracleConfig } from "../apps/api/src/oracle/config";
import { createOraclePool, type OraclePool } from "../apps/api/src/oracle/pool";
import { createOracleAuditRepository } from "../apps/api/src/oracle/audit";
import { createOracleSessionReader } from "../apps/api/src/oracle/session-read";
import { oracleBinary, oracleJson } from "../apps/api/src/oracle/codecs";
import { migrateOracle } from "../scripts/oracle/migrations";
import {
  labActorId,
  labSessionHash,
  prepareOracleLab,
} from "../scripts/oracle/lab";

const ownerFile = process.env.ORACLE_LAB_OWNER_ENV;
const runtimeFile = process.env.ORACLE_LAB_RUNTIME_ENV;
const options = { outFormat: oracledb.OUT_FORMAT_OBJECT };
describe.skipIf(!ownerFile || !runtimeFile)(
  "Oracle isolated synthetic integration",
  () => {
    let owner: OraclePool;
    let runtime: OraclePool;

    beforeAll(async () => {
      const ownerEnv = parse(await readFile(ownerFile!));
      owner = await createOraclePool(oracleConfig(ownerEnv, "install"));
      runtime = await createOraclePool(
        oracleConfig(parse(await readFile(runtimeFile!)), "runtime"),
      );
      await owner.use((connection) => migrateOracle(connection, true));
      await prepareOracleLab({
        ...ownerEnv,
        ORACLE_LAB_ENABLE_AUTH: "true",
        ORACLE_LAB_ENABLE_MANAGEMENT: "true",
        ORACLE_LAB_ENABLE_DOCUMENT_SCAN: "true",
        ORACLE_LAB_ENABLE_COMPANY_INVITATIONS: "true",
      });
    });

    afterAll(async () => {
      await Promise.all([owner?.close(), runtime?.close()]);
    });

    it("detects a completed schema and verifies that applying it again is a no-op", async () => {
      expect(
        await owner.use((connection) => migrateOracle(connection, false)),
      ).toBe("APPLIED");
      expect(
        await owner.use((connection) => migrateOracle(connection, true)),
      ).toBe("APPLIED");
    });

    it("reads the hashed session, explicit role permission and district without mutation", async () => {
      const repository = createOracleSessionReader(runtime);
      expect(await repository.findActiveSession(labSessionHash)).toMatchObject({
        userId: labActorId,
        activeRole: "PIC_KAWASAN",
        emailVerified: true,
        mfaVerified: true,
        assignments: expect.arrayContaining([
          { role: "PIC_KAWASAN", district: "SPU", permission: "areas.read" },
        ]),
      });
      expect(await repository.findActiveSession("e".repeat(64))).toBeNull();
      expect(await repository.findActiveSession("bukan-hash")).toBeNull();
    });

    it("binds and commits large JSON CLOB audit, rolls back a second audit, and rejects runtime DELETE", async () => {
      const audit = createOracleAuditRepository(runtime);
      const target = randomUUID();
      const action = "STL_LAB_'_TEST";
      const recorded = await audit.record({
        action,
        target,
        metadata: { kind: "fixture", content: "é界".repeat(3500) },
      });
      await expect(
        runtime.transaction(async (connection) => {
          await audit.append(connection, { action, target });
          throw Error("rollback fixture");
        }),
      ).rejects.toThrow("rollback fixture");
      await owner.use(async (connection) => {
        const rows = await connection.execute<{
          ID: string;
          ACTION: string;
          KIND: string;
        }>(
          "SELECT ID,ACTION,JSON_VALUE(METADATA,'$.kind') AS KIND FROM STL_AUDIT_LOGS WHERE TARGET=:target",
          { target },
          options,
        );
        expect(rows.rows).toEqual([
          { ID: recorded, ACTION: action, KIND: "fixture" },
        ]);
      });
      await expect(
        runtime.use((connection) =>
          connection.execute(
            `DELETE FROM ${runtime.owner}.STL_AUDIT_LOGS WHERE ID=:id`,
            { id: recorded },
          ),
        ),
      ).rejects.toMatchObject({
        code: expect.stringMatching(/^ORA-(?:01031|41900)$/),
      });
    });

    it("scopes Oracle completion locks by district and actor, replays ordered CLOB events, and rolls back", async () => {
      const repo = createOracleCompletionRepository(owner);
      await owner.use(async (connection) => {
        const draft = randomUUID();
        const id = randomUUID();
        const snapshot = { districtId: "SPU", fixture: "é界".repeat(3500) };
        try {
          await connection.execute(
            `INSERT INTO STL_APPLICATION_DRAFTS
              (ID,INITIATED_BY_USER_ID,CAPACITY,OFFICIAL_APPLICANT_USER_ID,INITIATOR_SNAPSHOT,APPLICANT_SNAPSHOT,UPDATED_AT)
              VALUES (:draft,:owner,'INDIVIDUAL',:owner,:payload,:payload,SYSTIMESTAMP)`,
            {
              draft,
              owner: labActorId,
              payload: oracleJson({ synthetic: true }),
            },
          );
          await connection.execute(
            `INSERT INTO STL_SYNTHETIC_SUBMISSIONS
              (ID,DRAFT_ID,DRAFT_VERSION,KEY,ACTOR_ID,DECLARATION_VERSION,POLICY_VERSION,SNAPSHOT)
              VALUES (:id,:draft,1,:reqkey,:owner,'SYNTHETIC-1','SYNTHETIC-1',:snapshot)`,
            {
              id,
              draft,
              reqkey: randomUUID(),
              owner: labActorId,
              snapshot: oracleJson(snapshot),
            },
          );
          const scope = {
            id,
            district: "SPU",
            excludedActorId: randomUUID(),
          } as const;
          const actor = { id: scope.excludedActorId, role: "PIC_KAWASAN" };
          const input = {
            timestamp: Date.now(),
            firstPaid: true,
            feeSen: null,
            command: { action: "REFER" as const },
          };
          expect(
            await repo.lockedHistory(connection, { ...scope, district: "SPT" }),
          ).toBeNull();
          expect(
            await repo.lockedHistory(connection, {
              ...scope,
              excludedActorId: labActorId,
            }),
          ).toBeNull();
          await expect(
            repo.append(
              connection,
              scope,
              { ...actor, role: "PPSK" },
              0,
              input,
            ),
          ).rejects.toThrow("Pelaku sejarah Oracle tidak sah.");
          expect(await repo.append(connection, scope, actor, 0, input)).toBe(1);
          await expect(
            repo.append(connection, scope, actor, 0, input),
          ).rejects.toThrow("sudah berubah");
          expect(await repo.lockedHistory(connection, scope)).toEqual({
            snapshot,
            events: [
              {
                actorId: actor.id,
                activeRole: actor.role,
                metadata: { ...input, version: 1 },
              },
            ],
          });
        } finally {
          await connection.rollback();
        }
        const result = await connection.execute<{ N: number }>(
          "SELECT COUNT(*) N FROM STL_AUDIT_LOGS WHERE TARGET=:id",
          { id },
          options,
        );
        expect(result.rows?.[0].N).toBe(0);
      });
    });

    it("reports Oracle-generated LOB indexes through their STL segment and table", async () => {
      const indexes = await owner.use(oracleGeneratedLobIndexes);
      expect(indexes).toHaveLength(14);
      expect(indexes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            TABLE_NAME: "STL_USERS",
            COLUMN_NAME: "IDENTIFICATION_ENCRYPTED",
            SEGMENT_NAME: "STL_LOB_01_13",
            INDEX_NAME: expect.stringMatching(/^SYS_IL/),
          }),
        ]),
      );
    });

    it("runs the auth HTTP routes on Oracle, with SMTP, role and one-time MFA", async () => {
      vi.stubEnv("MFA_ENCRYPTION_KEY", randomBytes(32).toString("hex"));
      vi.stubEnv("IDENTITY_DATA_KEY", randomBytes(32).toString("hex"));
      vi.stubEnv("STAYLINK_DEMO_HOST", "true");
      vi.stubEnv("SMTP_HOST", "127.0.0.1");
      vi.stubEnv("SMTP_PORT", "1025");
      const app = Fastify();
      const repository = createOracleAuthRepository(runtime);
      const password = `Aa1!${randomBytes(12).toString("hex")}`;
      const suffix = randomBytes(6).toString("hex");
      const email = `stl-applicant-${suffix}@example.test`;
      const officerEmail = `stl-officer-${suffix}@example.test`;
      try {
        await app.register(cookie);
        await authRoutes(app, repository);
        const post = (endpoint: string, payload: object, headers = {}) =>
          app.inject({
            method: "POST",
            url: `/api/auth/${endpoint}`,
            payload,
            headers,
          });
        const login = (email: string, credential = password) =>
          post("login", { email, password: credential });
        const sessionHeaders = async (email: string, credential = password) => {
          const result = await login(email, credential);
          expect(result.statusCode, result.body).toBe(200);
          return {
            cookie: String(result.headers["set-cookie"]).split(";")[0],
            "x-csrf-token": result.json().csrf,
            origin,
          };
        };
        const registration = {
          name: "Pemohon Oracle Sintetik",
          email,
          phone: "0123456789",
          password,
          identificationNumber: `UJIAN${suffix}`,
          consent: true,
        };
        const registered = await post("register", registration);
        expect(registered.statusCode, registered.body).toBe(201);
        expect((await post("register", registration)).statusCode).toBe(409);
        const mail = await owner.use(
          async (connection) =>
            (
              await connection.execute<{ STATUS: string }>(
                "SELECT STATUS FROM STL_EMAIL_DELIVERY_LOGS WHERE RECIPIENT=:email AND TYPE='VERIFICATION'",
                { email },
                options,
              )
            ).rows?.[0],
        );
        expect(mail?.STATUS).toBe("SENT");
        const list = await fetch("http://127.0.0.1:8025/api/v1/messages");
        expect(list.ok).toBe(true);
        const { messages } = (await list.json()) as {
          messages: { ID: string; To: { Address: string }[] }[];
        };
        const verificationMail = messages.find((message) =>
          message.To.some(({ Address }) => Address === email),
        );
        expect(verificationMail).toBeDefined();
        const detail = await fetch(
          `http://127.0.0.1:8025/api/v1/message/${verificationMail!.ID}`,
        );
        expect(detail.ok).toBe(true);
        const { Text } = (await detail.json()) as { Text: string };
        const activationToken = new URL(Text.trim()).searchParams.get("token");
        const unverifiedHeaders = await sessionHeaders(email);
        const activation = { token: activationToken, type: "VERIFY_EMAIL" };
        const activated = await post("activate", activation);
        expect(activated.statusCode, activated.body).toBe(200);
        expect((await post("activate", activation)).statusCode).toBe(400);
        expect(
          (
            await app.inject({
              url: "/api/auth/me",
              headers: unverifiedHeaders,
            })
          ).statusCode,
        ).toBe(401);
        const applicant = await sessionHeaders(email);
        expect(
          (
            await post(
              "role",
              { roleId: "PEMOHON" },
              { ...applicant, origin: "http://invalid.test" },
            )
          ).statusCode,
        ).toBe(403);
        expect(
          (await post("role", { roleId: "PEMOHON" }, applicant)).statusCode,
        ).toBe(200);
        const me = await app.inject({
          url: "/api/auth/me",
          headers: applicant,
        });
        expect(me.json()).toMatchObject({
          activeRole: "PEMOHON",
          user: { emailVerified: true },
        });

        const newPassword = password + "Z!";
        expect(
          (
            await post(
              "password",
              { currentPassword: password, password: newPassword },
              applicant,
            )
          ).statusCode,
        ).toBe(200);
        expect((await login(email)).statusCode).toBe(401);
        const updatedApplicant = await sessionHeaders(email, newPassword);
        expect((await post("logout", {}, updatedApplicant)).statusCode).toBe(
          200,
        );

        const officerId = randomUUID();
        const passwordHash = await argon2.hash(password);
        await owner.transaction(async (connection) => {
          await connection.execute(
            `INSERT INTO STL_USERS (ID,NAME,EMAIL,PHONE,KIND,EMAIL_VERIFIED,PASSWORD_HASH,UPDATED_AT)
              VALUES (:officerId,'Pegawai Ujian',:officerEmail,'0100000000','OFFICER',1,:passwordHash,SYSTIMESTAMP)`,
            { officerId, officerEmail, passwordHash },
          );
          await connection.execute(
            `INSERT INTO STL_USER_ROLE_ASSIGNMENTS (ID,USER_ID,ROLE_ID,DISTRICT_ID,REFERENCE)
              VALUES (:id,:officerId,'PIC_KAWASAN','SPU','Latihan')`,
            { id: randomUUID(), officerId },
          );
        });
        const officer = await sessionHeaders(officerEmail);
        const role = { roleId: "PIC_KAWASAN" };
        expect((await post("role", role, officer)).statusCode).toBe(403);
        const setup = await post("mfa/setup", {}, officer);
        expect(setup.statusCode, setup.body).toBe(200);
        const code = totp(setup.json().secret).generate();
        const verified = await Promise.all([
          post("mfa/verify", { code }, officer),
          post("mfa/verify", { code }, officer),
        ]);
        expect(verified.map((response) => response.statusCode).sort()).toEqual([
          200, 400,
        ]);
        const recoveryCodes = verified
          .find((response) => response.statusCode === 200)!
          .json().recoveryCodes;
        expect(recoveryCodes).toHaveLength(8);
        expect((await post("role", role, officer)).statusCode).toBe(200);
        expect((await post("mfa/setup", {}, officer)).statusCode).toBe(409);
        const freshOfficer = await sessionHeaders(officerEmail);
        expect((await post("role", role, freshOfficer)).statusCode).toBe(403);
        expect(
          (await post("mfa/recovery", { code: recoveryCodes[0] }, freshOfficer))
            .statusCode,
        ).toBe(200);
        expect(
          (await post("mfa/recovery", { code: recoveryCodes[0] }, freshOfficer))
            .statusCode,
        ).toBe(400);
        const sessionHash = hash(freshOfficer.cookie.split("=")[1]);
        expect(await repository.loadSession(sessionHash)).toMatchObject({
          mfaVerified: true,
        });
      } finally {
        await app.close();
        closeMailer();
        vi.unstubAllEnvs();
      }
    }, 30_000);

    it("rechecks company authority and accepts the intended recipient just once", async () => {
      const app = Fastify();
      const companyId = randomUUID();
      const representativeId = randomUUID();
      const accounts = [randomUUID(), randomUUID()];
      const csrf = randomBytes(32).toString("hex");
      const token = randomBytes(32).toString("hex");
      const [inviter, recipient] = accounts;
      await owner.transaction(async (connection) => {
        for (const id of accounts) {
          await connection.execute(
            `INSERT INTO STL_USERS (ID,NAME,EMAIL,PHONE,EMAIL_VERIFIED,UPDATED_AT,
               IDENTIFICATION_HASH,IDENTIFICATION_ENCRYPTED,IDENTIFICATION_MASKED)
               VALUES (:id,'Fixture',:email,'0100000000',1,SYSTIMESTAMP,:hash,:mock,:masked)`,
            {
              id,
              email: `stl-${id}@example.test`,
              hash: hash(id),
              mock: "encrypted-fixture",
              masked: "1234",
            },
          );
          await connection.execute(
            `INSERT INTO STL_USER_ROLE_ASSIGNMENTS (ID,USER_ID,ROLE_ID,REFERENCE)
               VALUES (:id,:userId,'PEMOHON','Latihan')`,
            { id: randomUUID(), userId: id },
          );
          await connection.execute(
            `INSERT INTO STL_SESSIONS (ID,USER_ID,ACTIVE_ROLE,CSRF_HASH,MFA_VERIFIED,EXPIRES_AT)
               VALUES (:id,:userId,'PEMOHON',:csrf,1,SYSTIMESTAMP + INTERVAL '1' HOUR)`,
            { id: hash(id), userId: id, csrf: hash(csrf) },
          );
        }
        await connection.execute(
          `INSERT INTO STL_COMPANIES (ID,NAME,REGISTRATION_NUMBER,ADDRESS,PHONE,EMAIL)
             VALUES (:id,'Syarikat Oracle',:id,'Latihan','0100000000','oracle@example.test')`,
          { id: companyId },
        );
        await connection.execute(
          `INSERT INTO STL_COMPANY_REPRESENTATIVES (ID,USER_ID,COMPANY_ID,AUTHORITY_TYPE,CAN_MANAGE_REPRESENTATIVES)
             VALUES (:id,:userId,:companyId,'PENGARAH',1)`,
          { id: representativeId, userId: inviter, companyId },
        );
      });
      vi.stubEnv("MFA_ENCRYPTION_KEY", randomBytes(32).toString("hex"));
      vi.stubEnv("SMTP_HOST", "127.0.0.1");
      try {
        await app.register(cookie);
        const repository = createOracleCompanyInvitationRepository(runtime);
        await companyInvitationRoutes(
          app,
          repository,
          createOracleAuthRepository(runtime),
        );
        await repository.invite({
          companyId,
          recipientId: recipient,
          invitedBy: inviter,
          authorityType: "PEKERJA",
          authorityEndsAt: null,
          tokenHash: hash(token),
          expiresAt: new Date(Date.now() + 3600_000),
        });
        const headers = (id: string) => ({
          cookie: `staylink=${id}`,
          "x-csrf-token": csrf,
          origin,
        });
        const post = (path: string, id = recipient) =>
          app.inject({
            url: `/api/company-invitations/${path}`,
            method: "POST",
            headers: headers(id),
            payload: { token },
          });
        expect((await post("preview", inviter)).statusCode).toBe(404);
        const preview = await post("preview");
        expect(preview.statusCode, preview.body).toBe(200);
        expect(preview.json().companyName).toBe("Syarikat Oracle");
        const setStatus = (status: string) =>
          owner.transaction(async (connection) => {
            await connection.execute(
              "UPDATE STL_COMPANY_REPRESENTATIVES SET STATUS=:status WHERE ID=:id",
              { status, id: representativeId },
            );
          });
        await setStatus("REVOKED");
        expect((await post("accept")).statusCode).toBe(403);
        await setStatus("UNVERIFIED");
        const results = await Promise.all([post("accept"), post("accept")]);
        expect(
          results.map((result) => result.statusCode).sort(),
          results.map(({ body }) => body).join(" "),
        ).toEqual([200, 400]);
        const list = await app.inject({
          url: `/api/companies/${companyId}/representatives`,
          headers: headers(recipient),
        });
        expect(list.statusCode, list.body).toBe(200);
        expect(list.json()).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              userId: recipient,
              status: "UNVERIFIED",
              canManageRepresentatives: false,
            }),
          ]),
        );
      } finally {
        await app.close();
        closeMailer();
        vi.unstubAllEnvs();
      }
    }, 30_000);

    it("applies management permissions, Oracle JSON configuration history and scoped notification writes", async () => {
      const app = Fastify();
      const raw = randomBytes(32).toString("hex");
      const csrf = randomBytes(32).toString("hex");
      const notificationId = randomUUID();
      const userId = randomUUID();
      const foreignUserId = randomUUID();
      const key = `fixture_${randomBytes(6).toString("hex")}`;
      await owner.transaction(async (connection) => {
        for (const [id, role] of [
          [userId, "PENTADBIR_ICT"],
          [foreignUserId, "PEMOHON"],
        ]) {
          await connection.execute(
            `INSERT INTO STL_USERS (ID,NAME,EMAIL,PHONE,KIND,EMAIL_VERIFIED,UPDATED_AT)
              VALUES (:id,'Akaun Ujian',:email,'0100000000','OFFICER',1,SYSTIMESTAMP)`,
            { id, email: `stl-${id}@example.test` },
          );
          await connection.execute(
            `INSERT INTO STL_USER_ROLE_ASSIGNMENTS (ID,USER_ID,ROLE_ID,REFERENCE)
              VALUES (:id,:userId,:role,'Latihan')`,
            { id: randomUUID(), userId: id, role },
          );
          await connection.execute(
            `INSERT INTO STL_SESSIONS (ID,USER_ID,ACTIVE_ROLE,CSRF_HASH,MFA_VERIFIED,EXPIRES_AT)
              VALUES (:id,:userId,:role,:csrf,1,SYSTIMESTAMP + INTERVAL '1' HOUR)`,
            {
              id: hash(id === userId ? raw : foreignUserId),
              userId: id,
              role,
              csrf: hash(csrf),
            },
          );
        }
        await connection.execute(
          `INSERT INTO STL_NOTIFICATIONS (ID,USER_ID,TYPE,TITLE,MESSAGE)
            VALUES (:id,:userId,'TEST','Latihan','Latihan')`,
          { id: notificationId, userId },
        );
      });
      try {
        await app.register(cookie);
        await managementRoutes(
          app,
          createOracleManagementRepository(runtime),
          createOracleAuthRepository(runtime),
        );
        const headers = {
          cookie: `staylink=${raw}`,
          "x-csrf-token": csrf,
          origin,
        };
        const foreignHeaders = {
          ...headers,
          cookie: `staylink=${foreignUserId}`,
        };
        expect(
          (
            await app.inject({
              url: "/api/config/technical",
              headers: foreignHeaders,
            })
          ).statusCode,
        ).toBe(403);
        const update = (value: string | boolean) =>
          app.inject({
            url: "/api/config/technical",
            method: "POST",
            headers,
            payload: { key, value, reason: "Latihan Oracle" },
          });
        const attempts = await Promise.all([update(""), update(false)]);
        for (const result of attempts)
          expect(result.statusCode, result.body).toBe(200);
        const configurations = await app.inject({
          url: "/api/config/technical",
          headers,
        });
        expect(configurations.statusCode, configurations.body).toBe(200);
        const setting = configurations
          .json()
          .find((item: { key: string }) => item.key === `technical.${key}`);
        expect(setting.versions).toHaveLength(2);
        expect(
          setting.versions.map((item: { value: unknown }) => item.value),
        ).toEqual(expect.arrayContaining(["", false]));
        const audit = await app.inject({ url: "/api/audit", headers });
        expect(audit.statusCode, audit.body).toBe(200);
        expect(audit.json()).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              action: "CONFIG_CHANGED",
              target: `technical.${key}`,
            }),
          ]),
        );
        const status = await app.inject({
          url: "/api/admin/services",
          headers,
        });
        expect(status.statusCode, status.body).toBe(200);
        expect(status.json()).toMatchObject({
          database: "CONNECTED",
          email: expect.any(Array),
        });
        const read = (headers: { cookie: string }) =>
          app.inject({
            url: `/api/notifications/${notificationId}/read`,
            method: "POST",
            headers,
          });
        expect((await read(foreignHeaders)).json()).toEqual({ count: 0 });
        expect((await read(headers)).json()).toEqual({ count: 1 });
      } finally {
        await app.close();
      }
    });

    it("claims Oracle quarantine leases once and preserves the integrity check", async () => {
      const draft = randomUUID();
      const first = randomUUID();
      const corrupt = randomUUID();
      const firstKey = createPrivateDocumentKey(draft, "premises_plan");
      const corruptKey = createPrivateDocumentKey(draft, "premises_plan");
      const content = Buffer.from("%PDF-1.7\nOracle quarantine fixture");
      const repository = createOracleDocumentScanRepository(runtime);
      await owner.transaction(async (connection) => {
        await connection.execute(
          `INSERT INTO STL_APPLICATION_DRAFTS
            (ID, INITIATED_BY_USER_ID,CAPACITY,OFFICIAL_APPLICANT_USER_ID,
             INITIATOR_SNAPSHOT,APPLICANT_SNAPSHOT,UPDATED_AT)
            VALUES (:draft,:actor,'INDIVIDUAL',:actor,:payload,:payload,SYSTIMESTAMP)`,
          {
            draft,
            actor: labActorId,
            payload: oracleJson({ synthetic: true }),
          },
        );
        for (const [id, storageKey, version] of [
          [first, firstKey, 1],
          [corrupt, corruptKey, 2],
        ] as const)
          await connection.execute(
            `INSERT INTO STL_APPLICATION_DOCUMENTS
              (ID,DRAFT_ID,CATEGORY,VERSION,FILE_NAME,MIME_TYPE,BYTE_SIZE,SHA256,STORAGE_KEY,UPLOADED_BY)
            VALUES (:id,:draft,'premises_plan',:version,'fixture.pdf','application/pdf',:byteSize,:sha256,:storageKey,:actor)`,
            {
              id,
              draft,
              version,
              storageKey,
              byteSize: content.length,
              sha256: id === first ? hash(content.toString()) : "a".repeat(64),
              actor: labActorId,
            },
          );
      });
      const document = (await repository.find(first))!;
      const leases = [randomUUID(), randomUUID()];
      const claimed = await Promise.all(
        leases.map((token) => repository.claim(document, token)),
      );
      expect(claimed.filter(Boolean)).toHaveLength(1);
      await owner.transaction(async (connection) => {
        await connection.execute(
          `UPDATE STL_APPLICATION_DOCUMENTS SET SCAN_LEASE_EXPIRES_AT=SYSTIMESTAMP - INTERVAL '1' MINUTE WHERE ID=:id`,
          { id: first },
        );
      });
      const freshLease = randomUUID();
      expect(await repository.claim(document, freshLease)).toBe(true);
      expect(
        await repository.finish(
          document,
          leases[claimed.indexOf(true)],
          "CLEAN",
        ),
      ).toBe(false);
      expect(await repository.finish(document, freshLease, "INFECTED")).toBe(
        true,
      );
      expect(await repository.find(first)).toMatchObject({
        scanStatus: "INFECTED",
      });
      const scan = vi.fn(async () => ({
        status: "CLEAN" as const,
        engine: "fixture",
      }));
      await processPendingDocumentScanBatch(
        repository,
        {
          readQuarantined: async () => content,
          putQuarantined: async () => {},
          deleteQuarantined: async () => {},
        },
        { scan },
        { limit: 50 },
      );
      expect(scan).not.toHaveBeenCalled();
      expect(await repository.find(corrupt)).toMatchObject({
        scanStatus: "FAILED",
      });
    });

    it("allows historical district assignments and enforces one ongoing assignment", async () => {
      await owner.use(async (connection) => {
        try {
          const id = randomUUID();
          await connection.execute(
            "INSERT INTO STL_AREAS (ID,NAME,DISTRICT_ID) VALUES (:id,:name,'SPU')",
            { id, name: `Latihan ${id}` },
          );
          const assign = (historic: boolean) =>
            connection.execute(
              `INSERT INTO STL_AREA_ASSIGNMENTS
            (ID,AREA_ID,USER_ID,ENDS_AT,REASON,ASSIGNED_BY) VALUES
            (:assignmentId,:area,:actor,CASE WHEN :historic=1 THEN SYSTIMESTAMP ELSE NULL END,:reason,:actor)`,
              {
                assignmentId: randomUUID(),
                area: id,
                actor: labActorId,
                historic: historic ? 1 : 0,
                reason: "Latihan STL",
              },
            );
          await assign(true);
          await assign(true);
          await assign(false);
          await expect(assign(false)).rejects.toMatchObject({
            code: "ORA-00001",
          });
        } finally {
          await connection.rollback();
        }
      });
    });

    it("preserves the nullable correction key, composite FK, immutable trigger, and LOB codecs", async () => {
      await owner.use(async (connection) => {
        try {
          const draftId = randomUUID();
          const otherId = randomUUID();
          for (const draft of [draftId, otherId])
            await connection.execute(
              `INSERT INTO STL_APPLICATION_DRAFTS
            (ID, INITIATED_BY_USER_ID, CAPACITY, OFFICIAL_APPLICANT_USER_ID,
             INITIATOR_SNAPSHOT, APPLICANT_SNAPSHOT, UPDATED_AT)
             VALUES (:draft,:actor,'INDIVIDUAL',:actor,:payload,:payload,SYSTIMESTAMP)`,
              {
                draft,
                actor: labActorId,
                payload: oracleJson({ synthetic: true }),
              },
            );
          await expect(
            connection.execute(
              "UPDATE STL_APPLICATION_DRAFTS SET NOTES=:notes WHERE ID=:id",
              {
                notes: { val: "x".repeat(2001), type: oracledb.CLOB },
                id: draftId,
              },
            ),
          ).rejects.toMatchObject({ code: "ORA-20063" });
          const insert = (
            db: Connection,
            id: string,
            draft: string,
            version: number,
            previous: string | null,
            key = randomUUID(),
          ) =>
            db.execute(
              `INSERT INTO STL_SYNTHETIC_SUBMISSIONS
            (ID,DRAFT_ID,DRAFT_VERSION,KEY,ACTOR_ID,DECLARATION_VERSION,POLICY_VERSION,PREVIOUS_ID,SNAPSHOT)
            VALUES (:id,:draft,:version,:key,:actor,'SYNTHETIC-1','SYNTHETIC-1',:previous,:snapshot)`,
              {
                id,
                draft,
                version,
                key,
                actor: labActorId,
                previous,
                snapshot: oracleJson({ synthetic: true }),
              },
            );
          const original = randomUUID();
          const replayKey = randomUUID();
          await insert(connection, original, draftId, 1, null, replayKey);
          await expect(
            insert(connection, randomUUID(), draftId, 9, null, replayKey),
          ).rejects.toMatchObject({ code: "ORA-00001" });
          await insert(connection, randomUUID(), draftId, 2, null);
          await expect(
            insert(connection, randomUUID(), otherId, 2, original),
          ).rejects.toMatchObject({ code: "ORA-02291" });
          await insert(connection, randomUUID(), draftId, 3, original);
          await expect(
            insert(connection, randomUUID(), draftId, 4, original),
          ).rejects.toMatchObject({ code: "ORA-00001" });
          await expect(
            connection.execute(
              "UPDATE STL_SYNTHETIC_SUBMISSIONS SET SNAPSHOT=:snapshot WHERE ID=:id",
              { snapshot: oracleJson({ changed: true }), id: original },
            ),
          ).rejects.toMatchObject({ code: "ORA-20062" });
          const { rows } = await connection.execute<{ N: number }>(
            "SELECT DBMS_LOB.GETLENGTH(:content) AS N FROM DUAL",
            { content: oracleBinary(Uint8Array.from([0, 1, 255])) },
            options,
          );
          expect(rows?.[0]?.N).toBe(3);
        } finally {
          await connection.rollback();
        }
      });
    });
  },
);
