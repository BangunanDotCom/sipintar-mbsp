import { createOracleTrainingReminders } from "../apps/api/src/oracle/training-reminders";
import { deliverTrainingReminders } from "../apps/api/src/training-reminders";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import argon2 from "argon2";
import { createHmac, randomUUID } from "node:crypto";
import { parse } from "dotenv";
import { scanDelegationDocument } from "../apps/api/src/delegation-scan-worker";
import { createOracleDelegationScanner } from "../apps/api/src/oracle/delegation-scan";
import * as financialJournal from "../apps/api/src/synthetic-financial-journal";
import { describe, expect, it, vi } from "vitest";
import { buildApp, buildOracleLabApp } from "../apps/api/src/app";
import { postgresAuth } from "../apps/api/src/auth-repository";
import { db, encrypt, hash, origin } from "../apps/api/src/core";
import { queryRows, timestamp } from "../apps/api/src/oracle/query";
import { oracleConfig } from "../apps/api/src/oracle/config";
import { createOraclePool } from "../apps/api/src/oracle/pool";
import { createOracleRepositories } from "../apps/api/src/oracle/provider";
import { seed } from "../prisma/seed";
import { migrateOracle } from "../scripts/oracle/migrations";
import { prepareOracleLab } from "../scripts/oracle/lab";
import { emptyPremises } from "../packages/shared/src/premises";
import { completionEvent } from "../packages/shared/src/synthetic-completion-contract";

const root = "/api/synthetic-portal";
const variants = [
  {
    name: "Oracle",
    enabled:
      !!process.env.ORACLE_LAB_COMPLETION_OWNER_ENV &&
      !!process.env.ORACLE_LAB_COMPLETION_RUNTIME_ENV,
  },
  {
    name: "PostgreSQL",
    enabled: process.env.STAYLINK_TEST_COMPLETION_PARITY === "true",
  },
];
for (const { name, enabled } of variants) {
  describe.skipIf(!enabled)(`${name} Issue #68 completion API`, () => {
    const capacities =
      name === "Oracle" && !process.env.ORACLE_P0_SCANNER_ENV
        ? (["INDIVIDUAL"] as const)
        : (["INDIVIDUAL", "COMPANY"] as const);
    it.each(capacities)(
      "preserves the full published %s contract, role boundaries and closure",
      async (capacity) => {
        const oracle = name === "Oracle";
        const postgresName = "staylink_issue62_personal_completionparity_test";
        const ownerEnv = oracle
          ? parse(await readFile(process.env.ORACLE_LAB_COMPLETION_OWNER_ENV!))
          : undefined;
        const ownerPool = ownerEnv
          ? await createOraclePool(oracleConfig(ownerEnv, "install"))
          : undefined;
        const runtime = oracle
          ? await createOraclePool(
              oracleConfig(
                parse(
                  await readFile(
                    process.env.ORACLE_LAB_COMPLETION_RUNTIME_ENV!,
                  ),
                ),
                "runtime",
              ),
            )
          : undefined;
        try {
          if (ownerPool && ownerEnv) {
            await ownerPool.use((connection) =>
              migrateOracle(connection, true),
            );
            await prepareOracleLab({
              ...ownerEnv,
              ORACLE_LAB_ENABLE_AUTH: "true",
              ORACLE_LAB_ENABLE_APPLICANTS: "true",
              ORACLE_LAB_ENABLE_DRAFTS: "true",
              ORACLE_LAB_ENABLE_SUBMISSIONS: "true",
              ORACLE_LAB_ENABLE_COMPLETION: "true",
              ORACLE_LAB_ENABLE_DASHBOARD: "true",
            });
            vi.stubEnv("NODE_ENV", "test");
            vi.stubEnv("STAYLINK_DEMO_HOST", "false");
            vi.stubEnv("STAYLINK_ORACLE_LAB_SYNTHETIC", "true");
          } else {
            const url = new URL(process.env.TEST_DATABASE_URL!);
            if (
              url.protocol !== "postgresql:" ||
              url.hostname !== "127.0.0.1" ||
              url.port !== "5432" ||
              url.pathname !== "/" + postgresName ||
              url.href !== process.env.DATABASE_URL ||
              url.search ||
              url.hash
            )
              throw Error(
                "PostgreSQL completion parity requires its dedicated loopback database.",
              );
            const [actual] = await db.$queryRaw<
              { name: string }[]
            >`SELECT current_database()::text AS name`;
            if (actual?.name !== postgresName)
              throw Error("Unexpected completion parity database.");
            await seed();
            vi.stubEnv("NODE_ENV", "development");
            vi.stubEnv("STAYLINK_DEMO_HOST", "true");
          }
          vi.stubEnv("STAYLINK_SYNTHETIC_COMPLETION", "true");
          vi.stubEnv("STAYLINK_SYNTHETIC_LEDGER_BACKFILL", "false");
          vi.stubEnv("STAYLINK_SYNTHETIC_BKT", "true");
          vi.stubEnv("STAYLINK_SYNTHETIC_RECORDS", "true");
          vi.stubEnv("STAYLINK_SYNTHETIC_APPOINTMENT_CONFLICTS", "true");
          vi.stubEnv("STAYLINK_SYNTHETIC_REMINDERS", "true");
          vi.stubEnv("STAYLINK_SYNTHETIC_PORTAL", "true");
          vi.stubEnv("STAYLINK_SYNTHETIC_SECOND_UNIT_FEE_SEN", "1234");
          vi.stubEnv("STAYLINK_SYNTHETIC_DISTRICT", "SPU");
          const oracleRepositories =
            runtime && createOracleRepositories(runtime);
          const auth = oracleRepositories
            ? oracleRepositories.auth
            : postgresAuth;
          const kitDirectory =
            capacity === "INDIVIDUAL"
              ? process.env.STAYLINK_COMPLETION_PARITY_KIT_DIR
              : undefined;
          const browserAccounts: {
            label: string;
            email: string;
            password: string;
            mfaSecretBase32?: string;
          }[] = [];
          const actor = async (
            role: string,
            districtId: string | null = "SPU",
          ) => {
            const raw = randomUUID();
            const email = `${raw}@example.test`;
            const password = kitDirectory
              ? randomUUID() + "!Stl"
              : "unused-fixture";
            const user = await auth.register({
              email,
              name: "Akaun Sintetik Penyelesaian",
              phone: "0100000000",
              identificationHash: hash(raw),
              identificationEncrypted: "fixture-encrypted",
              identificationMasked: "1234",
              passwordHash: kitDirectory
                ? await argon2.hash(password)
                : password,
              consentAt: new Date(),
            });
            const officer = role !== "PEMOHON";
            if (ownerPool) {
              await ownerPool.transaction(async (connection) => {
                await connection.execute(
                  "UPDATE STL_USERS SET EMAIL_VERIFIED=1,KIND=:kind WHERE ID=:id",
                  { id: user.id, kind: officer ? "OFFICER" : "APPLICANT" },
                );
                if (officer)
                  await connection.execute(
                    `INSERT INTO STL_USER_ROLE_ASSIGNMENTS (ID,USER_ID,ROLE_ID,DISTRICT_ID,REFERENCE)
                 VALUES (:id,:userId,:role,:districtId,'Issue 68 synthetic parity')`,
                    { id: randomUUID(), userId: user.id, role, districtId },
                  );
              });
            } else {
              await db.user.update({
                where: { id: user.id },
                data: {
                  emailVerified: true,
                  kind: officer ? "OFFICER" : "APPLICANT",
                  ...(officer && {
                    roles: {
                      create: {
                        roleId: role,
                        districtId,
                        reference: "Issue 68 synthetic parity",
                      },
                    },
                  }),
                },
              });
            }
            if (kitDirectory) {
              // Base32 test secret with 128 bits of entropy held only in the local kit.
              const mfaSecretBase32 = officer
                ? new (await import("otpauth")).Secret({ size: 16 }).base32
                : undefined;
              if (mfaSecretBase32)
                await auth.setFactor(user.id, encrypt(mfaSecretBase32));
              browserAccounts.push({
                label:
                  role === "PEMOHON"
                    ? "pemohon"
                    : role === "PPSK"
                      ? "ppsk"
                      : role,
                email,
                password,
                mfaSecretBase32,
              });
            }
            const csrf = randomUUID();
            await auth.createSession({
              id: hash(raw),
              userId: user.id,
              csrfHash: hash(csrf),
              expiresAt: new Date(Date.now() + 3_600_000),
              mfaVerified: true,
            });
            await auth.switchRole(hash(raw), role);
            return {
              userId: user.id,
              cookie: "staylink=" + raw,
              origin,
              "x-csrf-token": csrf,
            };
          };
          const owner = await actor("PEMOHON");
          const other = await actor("PEMOHON");
          const pic = await actor("PIC_KAWASAN");
          const spt = await actor("PIC_KAWASAN", "SPT");
          const ppsk = await actor("PPSK");
          const planning = await actor("PERANCANG_BANDAR");
          const engineering = await actor("KEJURUTERAAN");
          const council = await actor("URUS_SETIA_JK");
          const signer = await actor("PEGAWAI_PENANDATANGAN");
          vi.stubEnv("STAYLINK_SYNTHETIC_PIC_ID", pic.userId);
          vi.stubEnv("STAYLINK_SYNTHETIC_SUPERVISOR_ID", ppsk.userId);
          vi.stubEnv("STAYLINK_PERSONAL_PIC_SPT_ID", spt.userId);
          vi.stubEnv("STAYLINK_PERSONAL_PIC_SPS_ID", randomUUID());
          vi.stubEnv(
            "STAYLINK_SYNTHETIC_COMPLETION_ASSIGNMENTS",
            JSON.stringify({
              PERANCANG_BANDAR: planning.userId,
              KEJURUTERAAN: engineering.userId,
              URUS_SETIA_JK: council.userId,
              PEGAWAI_PENANDATANGAN: signer.userId,
            }),
          );
          const app = oracleRepositories
            ? await buildOracleLabApp(oracleRepositories)
            : await buildApp();
          try {
            let companyId: string | undefined;
            let proofId: string | undefined;
            if (capacity === "COMPANY") {
              const company = await app.inject({
                method: "POST",
                url: "/api/companies",
                headers: owner,
                payload: {
                  name: "Syarikat penyelesaian sintetik",
                  registrationNumber: randomUUID().slice(0, 20),
                  address: "Alamat sintetik",
                  phone: "0100000000",
                  email: "fixture@example.test",
                  authorityType: "PENGARAH",
                },
              });
              expect(company.statusCode, company.body).toBe(201);
              companyId = company.json().id;
              const membership = await app.inject({
                url: "/api/companies",
                headers: owner,
              });
              const [{ id: representativeId }] = membership.json();
              const upload = await app.inject({
                method: "POST",
                url: `/api/companies/${companyId}/documents`,
                headers: owner,
                payload: {
                  fileName: "completion.pdf",
                  content: Buffer.from(
                    "%PDF-1.4\nCompany completion fixture\n%%EOF",
                  ).toString("base64"),
                },
              });
              expect(upload.statusCode, upload.body).toBe(200);
              const documentId: string = upload.json().id;
              proofId = documentId;
              const scanner = {
                scan: async () => ({
                  status: "CLEAN" as const,
                  engine: "synthetic",
                }),
              };
              if (ownerPool) {
                const worker = await createOraclePool(
                  oracleConfig(
                    parse(await readFile(process.env.ORACLE_P0_SCANNER_ENV!)),
                    "runtime",
                  ),
                );
                try {
                  expect(
                    await createOracleDelegationScanner(worker).scan(
                      scanner,
                      documentId,
                    ),
                  ).toBe(true);
                } finally {
                  await worker.close();
                }
              } else
                expect(
                  await scanDelegationDocument(db, scanner, documentId),
                ).toBe(true);
              const verifier = await actor("PIC_KAWASAN", null);
              const verified = await app.inject({
                method: "POST",
                url: `/api/representations/${representativeId}/verify`,
                headers: verifier,
                payload: {
                  status: "VERIFIED",
                  reason: "Semakan bukti wakil sintetik",
                  documentId,
                  expectedRevision: 1,
                },
              });
              expect(verified.statusCode, verified.body).toBe(200);
              if (ownerPool)
                await ownerPool.transaction(async (connection) => {
                  await connection.execute(
                    `INSERT INTO STL_USER_ROLE_ASSIGNMENTS (ID,USER_ID,ROLE_ID,REFERENCE)
                VALUES(:id,:userId,'WAKIL_SYARIKAT','Issue 68 synthetic parity')`,
                    { id: randomUUID(), userId: owner.userId },
                  );
                });
              else
                await db.userRoleAssignment.create({
                  data: {
                    userId: owner.userId,
                    roleId: "WAKIL_SYARIKAT",
                    reference: "Issue 68 synthetic parity",
                  },
                });
              const switched = await app.inject({
                method: "POST",
                url: "/api/auth/role",
                headers: owner,
                payload: { roleId: "WAKIL_SYARIKAT" },
              });
              expect(switched.statusCode, switched.body).toBe(200);
            }
            const create = await app.inject({
              method: "POST",
              url: "/api/application-drafts",
              headers: owner,
              payload: {
                capacity,
                ...(companyId && { companyId }),
                notes: "Permohonan sintetik kesetaraan Issue 68",
              },
            });
            expect(create.statusCode, create.body).toBe(201);
            const draft = create.json().id;
            const draftPath = "/api/application-drafts/" + draft;
            const put = (suffix: string, payload: object) =>
              app.inject({
                method: "PUT",
                url: draftPath + suffix,
                headers: owner,
                payload,
              });
            const dashboard = await app.inject({
              url: "/api/dashboard",
              headers: owner,
            });
            expect(dashboard.json().training).toEqual({
              review: true,
              completion: true,
              reminders: true,
            });
            const premisesInput = {
              version: 1,
              action: "CONTINUE",
              premises: {
                ...emptyPremises,
                address: "Alamat latihan",
                postcode: "14000",
                lotNumber: "1",
                locality: "Latihan",
                districtId: "SPU",
                latitude: 5.4,
                longitude: 100.4,
                buildingType: "Kedai",
                currentUse: "Kedai",
                involvedFloors: 4,
                totalRooms: 8,
                accommodationUnits: 1,
                floorAreaSqm: 200,
                proposedWorkers: 16,
                certificateType: "NOT_APPLICABLE",
              },
            };
            const premises = await put("/premises", premisesInput);
            expect(premises.statusCode, premises.body).toBe(200);
            if (capacity === "INDIVIDUAL") {
              const stale = await app.inject({
                method: "POST",
                url: "/api/application-drafts",
                headers: owner,
                payload: { capacity },
              });
              expect(stale.statusCode, stale.body).toBe(201);
              const staleId = stale.json().id;
              const ready = await app.inject({
                method: "PUT",
                url: `/api/application-drafts/${staleId}/premises`,
                headers: owner,
                payload: premisesInput,
              });
              expect(ready.statusCode, ready.body).toBe(200);
              const old = new Date(Date.now() - 61 * 86_400_000);
              if (ownerPool)
                await ownerPool.transaction((c) =>
                  c.execute(
                    "UPDATE STL_APPLICATION_DRAFTS SET UPDATED_AT=:old WHERE ID=:id",
                    { old: timestamp(old), id: staleId },
                  ),
                );
              else
                await db.applicationDraft.update({
                  where: { id: staleId },
                  data: { updatedAt: old },
                });
              const staleList = await app.inject({
                url: root + "/inactive-drafts",
                headers: ppsk,
              });
              expect(staleList.statusCode, staleList.body).toBe(200);
              const staleRow = staleList
                .json()
                .drafts.find((item: { id: string }) => item.id === staleId);
              expect(staleRow).toBeDefined();
              const remind = () =>
                app.inject({
                  method: "POST",
                  url: `${root}/inactive-drafts/${staleId}/remind`,
                  headers: ppsk,
                  payload: { version: staleRow.version },
                });
              const requests = await Promise.all([remind(), remind()]);
              expect(requests.map((r) => r.statusCode)).toEqual([200, 200]);
              expect(requests.map((r) => r.json().queued).sort()).toEqual([
                false,
                true,
              ]);
              const denied = await app.inject({
                method: "POST",
                url: `${root}/inactive-drafts/${staleId}/remind`,
                headers: pic,
                payload: { version: staleRow.version },
              });
              expect(denied.statusCode).toBe(403);
              const list = await app.inject({
                url: "/api/application-drafts",
                headers: owner,
              });
              expect(
                list.json().find((item: { id: string }) => item.id === staleId)
                  ?.inactivity?.reviewDue,
              ).toBe(true);
            }
            if (capacity === "INDIVIDUAL") {
              const editor = await actor("PENTADBIR_TEMPLAT", null);
              const list = await app.inject({
                url: "/api/templates",
                headers: editor,
              });
              expect(list.statusCode, list.body).toBe(200);
              const template = await app.inject({
                method: "POST",
                url: "/api/templates",
                headers: editor,
                payload: {
                  name: "Pratonton sintetik konsolidasi",
                  category: list.json()[0].category,
                  content: "Templat latihan versi pertama",
                },
              });
              expect(template.statusCode, template.body).toBe(200);
              const listed = (
                await app.inject({ url: "/api/templates", headers: editor })
              )
                .json()
                .find((item: { id: string }) => item.id === template.json().id);
              const preview = await app.inject({
                url: `/api/template-versions/${listed.versions[0].id}/preview`,
                headers: editor,
              });
              expect(preview.statusCode, preview.body.slice(0, 120)).toBe(200);
              expect(preview.headers["content-digest"]).toMatch(/^sha-256=:/);
              const ict = await actor("PENTADBIR_ICT", null);
              const applicantActor = await actor("PIC_KAWASAN", "SPT");
              const appointment = () =>
                app.inject({
                  method: "POST",
                  url: `/api/admin/users/${applicantActor.userId}/roles`,
                  headers: ict,
                  payload: {
                    roleId: "PIC_KAWASAN",
                    departmentId: "BANGUNAN",
                    districtId: "SPU",
                    startsAt: new Date().toISOString(),
                    reference: "Pelantikan latihan serentak",
                  },
                });
              const updates = await Promise.all([appointment(), appointment()]);
              expect(
                updates.map((r) => r.statusCode).sort(),
                updates.map((r) => r.body).join("\n"),
              ).toEqual([200, 409]);
              const roleId = updates
                .find((r) => r.statusCode === 200)!
                .json().id;
              const revoke = () =>
                app.inject({
                  method: "DELETE",
                  url: `/api/admin/appointments/${roleId}`,
                  headers: ict,
                });
              expect((await revoke()).statusCode).toBe(200);
              expect((await revoke()).statusCode).toBe(200);
              expect(
                (
                  await app.inject({
                    url: "/api/dashboard",
                    headers: applicantActor,
                  })
                ).statusCode,
              ).toBe(401);
            }
            const floors = await put("/floors", {
              version: 2,
              floors: ["A", "B", "C", "D"].map((floorLabel) => ({
                floorLabel,
                rooms: 2,
                beds: 4,
                workers: 4,
                areaSqm: 50,
                facilities: {
                  toilets: 1,
                  bathrooms: 1,
                  sinks: 1,
                  diningTables: 1,
                  diningChairs: 4,
                  fireExtinguishers: 1,
                },
              })),
            });
            expect(floors.statusCode, floors.body).toBe(200);
            const floorIds = floors
              .json()
              .floors.map(({ id }: { id: string }) => id);
            const units = await put("/units", {
              version: 3,
              units: [{ unitLabel: "Unit A", floorIds }],
            });
            expect(units.statusCode, units.body).toBe(200);
            const appUrl = root + "/drafts/" + draft;
            const current = await app.inject({ url: appUrl, headers: owner });
            expect(current.statusCode).toBe(200);
            const initial = current.json();
            const evidence = await app.inject({
              method: "POST",
              url: appUrl + "/evidence",
              headers: owner,
              payload: { version: initial.draftVersion, verdict: "CLEAN" },
            });
            expect(evidence.statusCode).toBe(200);
            const ready = await app
              .inject({ url: appUrl, headers: owner })
              .then((r) => r.json());
            const submission = {
              version: ready.draftVersion,
              key: randomUUID(),
              accepted: true,
              declarationVersion: ready.declaration.version,
              policyFingerprint: ready.policyFingerprint,
              previousId: null,
            };
            const submit = () =>
              app.inject({
                method: "POST",
                url: appUrl + "/submit",
                headers: owner,
                payload: submission,
              });
            if (proofId) {
              if (ownerPool) {
                await ownerPool.use((connection) =>
                  connection.execute(
                    `CREATE TRIGGER STL_LAB_SUBMIT_PAUSE BEFORE INSERT ON STL_AUDIT_LOGS FOR EACH ROW
                   BEGIN IF :NEW.ACTION='SYNTHETIC_SUBMISSION_CAPTURED' THEN DBMS_SESSION.SLEEP(3); END IF; END;`,
                  ),
                );
              } else {
                await db.$executeRaw`CREATE FUNCTION p0_delay_capture() RETURNS trigger LANGUAGE plpgsql AS $$
                  BEGIN IF NEW.action='SYNTHETIC_SUBMISSION_CAPTURED' THEN PERFORM pg_sleep(3); END IF; RETURN NEW; END $$`;
                await db.$executeRaw`CREATE TRIGGER p0_delay_capture BEFORE INSERT ON audit_logs
                  FOR EACH ROW EXECUTE FUNCTION p0_delay_capture()`;
              }
              try {
                const expiresAt = new Date(Date.now() + 2200);
                if (ownerPool)
                  await ownerPool.transaction((c) =>
                    c.execute(
                      "UPDATE STL_DELEGATION_DOCUMENTS SET SCAN_VALID_UNTIL=:expiresAt WHERE ID=:id",
                      { expiresAt: timestamp(expiresAt), id: proofId },
                    ),
                  );
                else
                  await db.delegationDocument.update({
                    where: { id: proofId },
                    data: { scanValidUntil: expiresAt },
                  });
                const start = Date.now();
                const rejected = await submit();
                expect(rejected.statusCode, rejected.body).toBe(409);
                expect(Date.now() - start).toBeGreaterThanOrEqual(2900);
                if (ownerPool) {
                  const counts = await ownerPool.use(
                    async (c) =>
                      (
                        await queryRows<{ N: number; A: number }>(
                          c,
                          `SELECT (SELECT COUNT(*) FROM STL_SYNTHETIC_SUBMISSIONS WHERE DRAFT_ID=:draft) N,
                     (SELECT COUNT(*) FROM STL_AUDIT_LOGS WHERE ACTOR_ID=:actor AND ACTION='SYNTHETIC_SUBMISSION_CAPTURED') A FROM DUAL`,
                          { draft, actor: owner.userId },
                        )
                      )[0],
                  );
                  expect(counts).toEqual({ N: 0, A: 0 });
                } else {
                  expect(
                    await db.syntheticSubmission.count({
                      where: { draftId: draft },
                    }),
                  ).toBe(0);
                  expect(
                    await db.auditLog.count({
                      where: {
                        actorId: owner.userId,
                        action: "SYNTHETIC_SUBMISSION_CAPTURED",
                      },
                    }),
                  ).toBe(0);
                }
              } finally {
                if (ownerPool)
                  await ownerPool.use((c) =>
                    c.execute("DROP TRIGGER STL_LAB_SUBMIT_PAUSE"),
                  );
                else {
                  await db.$executeRaw`DROP TRIGGER p0_delay_capture ON audit_logs`;
                  await db.$executeRaw`DROP FUNCTION p0_delay_capture()`;
                }
              }
              const scanner = {
                scan: async () => ({
                  status: "CLEAN" as const,
                  engine: "synthetic",
                }),
              };
              if (ownerPool) {
                const worker = await createOraclePool(
                  oracleConfig(
                    parse(await readFile(process.env.ORACLE_P0_SCANNER_ENV!)),
                    "runtime",
                  ),
                );
                try {
                  expect(
                    await createOracleDelegationScanner(worker).scan(
                      scanner,
                      proofId,
                    ),
                  ).toBe(true);
                } finally {
                  await worker.close();
                }
              } else
                expect(await scanDelegationDocument(db, scanner, proofId)).toBe(
                  true,
                );
            }
            const submitted = await submit();
            expect(submitted.statusCode, submitted.body).toBe(200);
            const { id } = submitted.json();
            const review = root + "/reviews/" + id;
            const completion = root + "/completion/" + id;
            const post = (
              url: string,
              headers: typeof owner,
              payload: object,
            ) => app.inject({ method: "POST", url, headers, payload });
            let offset = 0;
            const command = (
              headers: typeof owner,
              version: number,
              action: string,
              other = {},
            ) =>
              post(completion, headers, {
                version: version + offset,
                command: { action, ...other },
              });
            const precheck = await post(review + "/precheck", pic, {
              version: 1,
              mode: "AUTO",
            });
            expect(precheck.statusCode, precheck.body).toBe(200);
            const manual = await post(review + "/precheck", pic, {
              version: 1,
              mode: "MANUAL",
              reason: "Semakan sendiri latihan",
            });
            expect(manual.statusCode, manual.body).toBe(200);
            const precheckHistory = await app.inject({
              url: review + "/precheck",
              headers: ppsk,
            });
            expect(precheckHistory.statusCode, precheckHistory.body).toBe(200);
            expect(precheckHistory.json().history).toHaveLength(2);
            expect(
              (
                await post(review + "/precheck", ppsk, {
                  version: 1,
                  mode: "AUTO",
                })
              ).statusCode,
            ).toBe(403);
            expect(
              (
                await post(review, pic, {
                  action: "CONFIRM_COMPLETE",
                  version: 1,
                  reason: "Bukti latihan lengkap",
                })
              ).statusCode,
            ).toBe(200);
            expect(
              (
                await post(review, ppsk, {
                  action: "REGISTER",
                  version: 2,
                  reason: "Pendaftaran latihan",
                })
              ).statusCode,
            ).toBe(200);
            expect((await command(pic, 0, "REFER")).statusCode).toBe(409);
            // Legacy data already has invoice/receipt audit events, before the
            // append-only financial table was introduced.
            const legacyWrites =
              capacity === "COMPANY"
                ? vi
                    .spyOn(financialJournal, "recordSyntheticFinancialEntry")
                    .mockResolvedValue(undefined)
                : undefined;
            try {
              expect(
                (await post(review + "/billing", ppsk, { action: "ISSUE" }))
                  .statusCode,
              ).toBe(200);
              expect(
                (
                  await post(review + "/billing", ppsk, {
                    action: "SIMULATE_SETTLEMENT",
                  })
                ).statusCode,
              ).toBe(200);
            } finally {
              legacyWrites?.mockRestore();
            }
            expect((await command(pic, 0, "REFER")).statusCode).toBe(409);
            const readyBkt = await app.inject({
              url: root + "/completion/queue",
              headers: council,
            });
            expect(readyBkt.statusCode, readyBkt.body).toBe(200);
            expect(readyBkt.json().cases).toEqual(
              expect.arrayContaining([expect.objectContaining({ id })]),
            );
            const bkt = await command(council, 0, "RECEIVE_BKT", {
              note: "Penerimaan BKT sintetik",
            });
            expect(bkt.statusCode, bkt.body).toBe(200);
            offset++;
            expect((await command(spt, 0, "REFER")).statusCode).toBe(404);
            const configuredAssignments =
              process.env.STAYLINK_SYNTHETIC_COMPLETION_ASSIGNMENTS!;
            const assignments = JSON.parse(configuredAssignments);
            // Missing recipient causes a real FK failure after the journal append and the first insert.
            assignments.KEJURUTERAAN = randomUUID();
            vi.stubEnv(
              "STAYLINK_SYNTHETIC_COMPLETION_ASSIGNMENTS",
              JSON.stringify(assignments),
            );
            const faulty = oracleRepositories
              ? await buildOracleLabApp(oracleRepositories)
              : await buildApp();
            try {
              const rejected = await faulty.inject({
                method: "POST",
                url: completion,
                headers: pic,
                payload: { version: offset, command: { action: "REFER" } },
              });
              expect(rejected.statusCode, rejected.body).toBe(500);
            } finally {
              await faulty.close();
              vi.stubEnv(
                "STAYLINK_SYNTHETIC_COMPLETION_ASSIGNMENTS",
                configuredAssignments,
              );
            }
            const afterRollback = await app.inject({
              url: completion,
              headers: pic,
            });
            expect(afterRollback.json()).toMatchObject({
              version: offset,
              referral: null,
            });
            const recipient = await app.inject({
              url: "/api/dashboard",
              headers: planning,
            });
            expect(recipient.json().notifications).toEqual([]);
            expect((await command(pic, 0, "REFER")).statusCode).toBe(200);
            for (const department of [planning, engineering]) {
              const dashboard = await app.inject({
                url: "/api/dashboard",
                headers: department,
              });
              expect(dashboard.json().notifications).toMatchObject([
                { title: "Rujukan teknikal LATIHAN STAYLink" },
              ]);
            }

            const queue = await app.inject({
              url: root + "/completion/queue",
              headers: planning,
            });
            expect(queue.statusCode, queue.body).toBe(200);
            const { scopes } = queue
              .json()
              .cases.find((row: { id: string }) => row.id === id);
            expect(scopes).toHaveLength(4);
            expect(
              new Set(scopes.map((scope: { unitId: string }) => scope.unitId))
                .size,
            ).toBe(1);
            expect(
              (
                await command(pic, 1, "SUBMIT_PAPER", {
                  summary: "Ulasan belum lengkap",
                })
              ).statusCode,
            ).toBe(409);
            expect(
              (
                await command(planning, 0, "COMMENT", {
                  general: "Semakan perancang latihan",
                  details: [],
                })
              ).statusCode,
            ).toBe(409);
            const invalidScope = {
              unitId: scopes[0].unitId,
              floorId: "a78c8455-e65f-4c0b-afff-21f25d270bf1",
              comment: "Di luar skop",
            };
            expect(
              (
                await command(planning, 1, "COMMENT", {
                  general: "Semakan perancang latihan",
                  details: [invalidScope],
                })
              ).statusCode,
            ).toBe(409);
            const slaDeadline = queue
              .json()
              .cases.find((item: { id: string }) => item.id === id)
              .referral.deadline;
            if (
              capacity === "INDIVIDUAL" &&
              (!oracle || process.env.ORACLE_CONSOL_WORKER_ENV)
            ) {
              const key = `TECH_PRE_DUE:${id}:2:PERANCANG_BANDAR`;
              if (ownerPool)
                await ownerPool.transaction((c) =>
                  c.execute(
                    "UPDATE STL_TRAINING_REMINDER_OUTBOX SET AVAILABLE_AT=SYSTIMESTAMP-INTERVAL '1' MINUTE WHERE DEDUPE_KEY=:key",
                    { key },
                  ),
                );
              else
                await db.trainingReminderOutbox.update({
                  where: { dedupeKey: key },
                  data: { availableAt: new Date(0) },
                });
              const mails: string[] = [];
              const sender = async (email: {
                to: string;
                messageId: string;
              }) => {
                if (
                  email.to ===
                  planning.cookie.slice("staylink=".length) + "@example.test"
                )
                  mails.push(email.messageId);
              };
              if (ownerPool) {
                const env = parse(
                  await readFile(process.env.ORACLE_CONSOL_WORKER_ENV!),
                );
                const workerPool = await createOraclePool(
                  oracleConfig(env, "runtime"),
                );
                try {
                  const worker = createOracleTrainingReminders(workerPool);
                  await Promise.all([
                    worker.deliver(sender),
                    worker.deliver(sender),
                  ]);
                } finally {
                  await workerPool.close();
                }
              } else
                await Promise.all([
                  deliverTrainingReminders(sender),
                  deliverTrainingReminders(sender),
                ]);
              expect(mails).toHaveLength(1);
              const inbox = await app.inject({
                url: "/api/dashboard",
                headers: planning,
              });
              expect(inbox.json().notifications).toEqual(
                expect.arrayContaining([
                  expect.objectContaining({
                    type: "TRAINING_TECHNICAL_REMINDER",
                  }),
                ]),
              );
            }
            const now = Date.now();
            expect(slaDeadline - now).toBeGreaterThan(7 * 86_400_000 - 10_000);
            expect(slaDeadline - now).toBeLessThanOrEqual(7 * 86_400_000);
            const clock = vi.spyOn(Date, "now").mockReturnValue(slaDeadline);
            try {
              const overdue = await app.inject({
                url: root + "/completion/queue",
                headers: ppsk,
              });
              expect(overdue.statusCode, overdue.body).toBe(200);
              expect(overdue.json().summary.overdue).toBeGreaterThanOrEqual(1);
              const details = await app.inject({
                url: completion,
                headers: pic,
              });
              expect(details.json().consolidation).toMatchObject({
                deadline: slaDeadline,
                departments: [{ status: "OVERDUE" }, { status: "OVERDUE" }],
              });
            } finally {
              clock.mockRestore();
            }
            for (const department of [planning, engineering]) {
              const ack = await command(department, 1, "ACK_REFERRAL");
              expect(ack.statusCode, ack.body).toBe(200);
              offset++;
            }
            const comments = [
              {
                general: "Semakan perancang",
                details: [
                  {
                    unitId: scopes[0].unitId,
                    floorId: scopes[0].floorId,
                    comment: "Ulasan unit dan tingkat",
                  },
                ],
              },
              { general: "Semakan kejuruteraan", details: [] },
            ];
            const actors = [planning, engineering];
            const simultaneous = await Promise.all(
              actors.map((actor, i) =>
                command(actor, 1, "COMMENT", comments[i]),
              ),
            );
            expect(
              simultaneous.map(({ statusCode }) => statusCode).sort(),
            ).toEqual([200, 409]);
            const retry = simultaneous.findIndex(
              ({ statusCode }) => statusCode === 409,
            );
            expect(
              (await command(actors[retry], 2, "COMMENT", comments[retry]))
                .statusCode,
            ).toBe(200);
            const reconciliation =
              completion + "/financial-ledger/reconciliation";
            const consolidation = async () => {
              const response = await app.inject({
                url: completion,
                headers: pic,
              });
              expect(response.statusCode, response.body).toBe(200);
              return response.json().consolidation;
            };
            expect(await consolidation()).toMatchObject({
              submittedPaperVersion: null,
              departments: [
                {
                  department: "PERANCANG_BANDAR",
                  status: "RECEIVED",
                  current: comments[0],
                },
                {
                  department: "KEJURUTERAAN",
                  status: "RECEIVED",
                  current: comments[1],
                },
              ],
            });
            const returnedComment = await command(pic, 3, "RETURN_COMMENT", {
              department: "PERANCANG_BANDAR",
              reason: "Perlu maklumat tambahan latihan",
            });
            expect(returnedComment.statusCode, returnedComment.body).toBe(200);
            offset++;
            const resentComment = await command(
              planning,
              3,
              "COMMENT",
              comments[0],
            );
            expect(resentComment.statusCode, resentComment.body).toBe(200);
            offset++;
            expect(
              (
                await command(pic, 3, "SUBMIT_PAPER", {
                  summary: "Kertas Pertimbangan latihan",
                })
              ).statusCode,
            ).toBe(200);
            const returnPaper = await command(council, 4, "RETURN_PAPER", {
              reason: "Pinda syor latihan",
            });
            expect(returnPaper.statusCode, returnPaper.body).toBe(200);
            offset++;
            expect(await consolidation()).toMatchObject({
              submittedPaperVersion: null,
              departments: [
                {
                  previous: { comment: comments[0] },
                  returnReason: "Perlu maklumat tambahan latihan",
                },
                { current: comments[1] },
              ],
            });
            const resendPaper = await command(pic, 4, "SUBMIT_PAPER", {
              summary: "Kertas Pertimbangan semakan latihan",
            });
            expect(resendPaper.statusCode, resendPaper.body).toBe(200);
            expect((await consolidation()).submittedPaperVersion).toEqual(
              expect.any(Number),
            );
            offset++;
            const outcomes = scopes.map(
              (
                { unitId, floorId }: { unitId: string; floorId: string },
                i: number,
              ) => ({
                unitId,
                floorId,
                outcome: ["SK", "TANGGUH", "SKB", "TOLAK"][i],
                ...(i === 2 && {
                  conditionUntil: new Date(Date.now() + 86_400_000)
                    .toISOString()
                    .slice(0, 10),
                }),
                reason: "Keputusan mesyuarat latihan",
              }),
            );
            expect(
              (await command(signer, 4, "DECIDE", { decisions: outcomes }))
                .statusCode,
            ).toBe(403);
            expect(
              (await command(council, 4, "DECIDE", { decisions: outcomes }))
                .statusCode,
            ).toBe(200);
            expect((await command(signer, 5, "SIGN")).statusCode).toBe(200);
            const first = await app.inject({
              url: appUrl + "/completion/letters/1",
              headers: owner,
            });
            expect(first.statusCode).toBe(200);
            expect(first.headers["cache-control"]).toContain("no-store");
            expect(first.body).toMatch(/LATIHAN[\s\S]+TANGGUH/);
            expect(first.body).toContain("| SKB |");
            expect(first.body).toContain("| TOLAK |");
            expect(
              (
                await app.inject({
                  url: appUrl + "/completion/letters/1",
                  headers: other,
                })
              ).statusCode,
            ).toBe(404);
            expect((await command(ppsk, 6, "CLOSE")).statusCode).toBe(409);
            expect(
              (
                await post(appUrl + "/completion", owner, {
                  version: 6 + offset,
                  command: {
                    action: "RESPOND",
                    note: "Bukti pindaan latihan tersedia",
                  },
                })
              ).statusCode,
            ).toBe(200);
            expect((await command(pic, 7, "CHECK_RESPONSE")).statusCode).toBe(
              200,
            );
            expect(
              (await command(ppsk, 8, "ALLOW_RECONSIDERATION")).statusCode,
            ).toBe(200);
            expect(
              (
                await command(pic, 9, "REREFER", {
                  departments: ["KEJURUTERAAN"],
                })
              ).statusCode,
            ).toBe(200);
            expect(
              (
                await command(planning, 10, "COMMENT", {
                  general: "Tidak dirujuk semula",
                  details: [],
                })
              ).statusCode,
            ).toBe(409);
            const followupAck = await command(engineering, 10, "ACK_REFERRAL");
            expect(followupAck.statusCode, followupAck.body).toBe(200);
            offset++;
            expect(
              (
                await command(engineering, 10, "COMMENT", {
                  general: "Semakan susulan selesai",
                  details: [],
                })
              ).statusCode,
            ).toBe(200);
            expect(
              (
                await command(pic, 11, "SUBMIT_PAPER", {
                  summary: "Kertas susulan latihan",
                })
              ).statusCode,
            ).toBe(200);
            expect(
              (
                await command(council, 12, "DECIDE", {
                  decisions: outcomes
                    .slice(1, 3)
                    .map(
                      ({
                        unitId,
                        floorId,
                        reason,
                      }: {
                        unitId: string;
                        floorId: string;
                        reason: string;
                      }) => ({ unitId, floorId, reason, outcome: "SK" }),
                    ),
                })
              ).statusCode,
            ).toBe(200);
            expect((await command(signer, 13, "SIGN")).statusCode).toBe(200);
            expect(
              (
                await app.inject({
                  url: appUrl + "/completion/letters/1",
                  headers: owner,
                })
              ).body,
            ).toBe(first.body);
            expect(
              (
                await app.inject({
                  url: appUrl + "/completion/letters/2",
                  headers: owner,
                })
              ).body,
            ).toContain("Surat susulan");
            const invoice = await command(ppsk, 14, "ISSUE_SECOND").then(
              (r) => r.json().invoice,
            );
            expect(invoice.amountSen).toBe(1234);
            expect((await command(ppsk, 15, "CLOSE")).statusCode).toBe(409);
            const callback = (
              amountSen: number,
              key = process.env.STAYLINK_SYNTHETIC_CALLBACK_KEY!,
            ) => {
              const payload = JSON.stringify({
                invoiceId: invoice.id,
                eventId: invoice.id,
                providerReference: "SYNTHETIC-" + invoice.id,
                currency: "MYR",
                amountSen,
                outcome: "SETTLED",
              });
              return app.inject({
                method: "POST",
                url: root + "/callbacks/payment-second/" + id,
                headers: {
                  "x-staylink-synthetic-signature": createHmac(
                    "sha256",
                    Buffer.from(key, "hex"),
                  )
                    .update(payload)
                    .digest("hex"),
                },
                payload: { payload },
              });
            };
            expect((await callback(1234, "aa".repeat(32))).statusCode).toBe(
              401,
            );
            expect((await callback(1235)).statusCode).toBe(409);
            const callbacks = await Promise.all([
              callback(1234),
              callback(1234),
            ]);
            expect(callbacks.map((r) => r.json().result).sort()).toEqual([
              "REPLAY",
              "SETTLED",
            ]);
            expect((await command(ppsk, 16, "CLOSE")).statusCode).toBe(200);
            expect(
              (
                await app.inject({
                  url: appUrl + "/completion",
                  headers: owner,
                })
              ).json().closed,
            ).toBe(true);
            if (kitDirectory) {
              const kit = {
                accounts: browserAccounts,
                scenarios: [
                  {
                    id: "single-unit",
                    submissionId: id,
                    draftPath: `/permohonan/draf/${draft}/premis`,
                  },
                ],
              };
              const config = [
                "STAYLINK_SYNTHETIC_PORTAL=true",
                "STAYLINK_SYNTHETIC_COMPLETION=true",
                "STAYLINK_SYNTHETIC_BKT=true",
                "STAYLINK_SYNTHETIC_RECORDS=true",
                "STAYLINK_SYNTHETIC_SECOND_UNIT_FEE_SEN=1234",
                "STAYLINK_SYNTHETIC_DISTRICT=SPU",
                `STAYLINK_SYNTHETIC_PIC_ID=${pic.userId}`,
                `STAYLINK_SYNTHETIC_SUPERVISOR_ID=${ppsk.userId}`,
                `STAYLINK_PERSONAL_PIC_SPT_ID=${spt.userId}`,
                `STAYLINK_PERSONAL_PIC_SPS_ID=${process.env.STAYLINK_PERSONAL_PIC_SPS_ID}`,
                `STAYLINK_SYNTHETIC_COMPLETION_ASSIGNMENTS=${process.env.STAYLINK_SYNTHETIC_COMPLETION_ASSIGNMENTS}`,
              ];
              const prefix = join(kitDirectory, name.toLowerCase());
              await writeFile(prefix + ".json", JSON.stringify(kit), {
                mode: 0o600,
                flag: "wx",
              });
              await writeFile(prefix + ".env", config.join("\n") + "\n", {
                mode: 0o600,
                flag: "wx",
              });
            }
            const letter = await app.inject({
              url: appUrl + "/completion/letters/1?format=pdf",
              headers: owner,
            });
            expect(letter.statusCode, letter.body.slice(0, 100)).toBe(200);
            expect(letter.headers["x-staylink-letter-template"]).toBe(
              "SYNTHETIC-DECISION-LETTER-v2",
            );
            expect(letter.headers["content-digest"]).toMatch(/^sha-256=:/);
            const reconcile = (headers = ppsk) =>
              app.inject({ url: reconciliation, headers });
            const dryRun = await reconcile();
            expect(dryRun.statusCode, dryRun.body).toBe(200);
            const missing =
              capacity === "COMPANY"
                ? [
                    { stage: 1, event: "INVOICE" },
                    { stage: 1, event: "RECEIPT" },
                  ]
                : [];
            expect(dryRun.json()).toMatchObject({
              missing,
              conflicts: [],
              added: 0,
              source: { outstandingSen: 0 },
              ledger: { outstandingSen: 0 },
            });
            expect((await reconcile(pic)).statusCode).toBe(404);
            expect((await reconcile(spt)).statusCode).toBe(404);
            expect(
              (await post(reconciliation, ppsk, { confirm: true })).statusCode,
            ).toBe(404);
            vi.stubEnv("STAYLINK_SYNTHETIC_LEDGER_BACKFILL", "true");
            expect(
              (await post(reconciliation, ppsk, { confirm: false })).statusCode,
            ).toBe(400);
            if (capacity === "COMPANY") {
              // Force the audit write to fail after the ledger inserts. A retry
              // must still see the original dry-run result on both engines.
              if (ownerPool) {
                await ownerPool.use((c) =>
                  c.execute(`CREATE OR REPLACE TRIGGER STL_TEST_BACKFILL_AUDIT
                  BEFORE INSERT ON STL_AUDIT_LOGS FOR EACH ROW
                  WHEN (NEW.ACTION = 'SYNTHETIC_LEDGER_BACKFILLED')
                  BEGIN RAISE_APPLICATION_ERROR(-20981, 'synthetic audit failure'); END;`),
                );
              } else {
                await db.$executeRaw`CREATE FUNCTION stl_test_backfill_audit() RETURNS trigger LANGUAGE plpgsql AS $$
                  BEGIN IF NEW.action = 'SYNTHETIC_LEDGER_BACKFILLED' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`;
                await db.$executeRaw`CREATE TRIGGER stl_test_backfill_audit BEFORE INSERT ON audit_logs
                  FOR EACH ROW EXECUTE FUNCTION stl_test_backfill_audit()`;
              }
              try {
                expect(
                  (await post(reconciliation, ppsk, { confirm: true }))
                    .statusCode,
                ).toBe(500);
                expect((await reconcile()).json()).toEqual(dryRun.json());
              } finally {
                if (ownerPool)
                  await ownerPool.use((c) =>
                    c.execute("DROP TRIGGER STL_TEST_BACKFILL_AUDIT"),
                  );
                else {
                  await db.$executeRaw`DROP TRIGGER stl_test_backfill_audit ON audit_logs`;
                  await db.$executeRaw`DROP FUNCTION stl_test_backfill_audit()`;
                }
              }
            }
            const apply = () => post(reconciliation, ppsk, { confirm: true });
            const [firstBackfill, concurrentBackfill] = await Promise.all([
              apply(),
              apply(),
            ]);
            expect(firstBackfill.statusCode, firstBackfill.body).toBe(200);
            expect(concurrentBackfill.statusCode, concurrentBackfill.body).toBe(
              200,
            );
            expect(
              [
                firstBackfill.json().added,
                concurrentBackfill.json().added,
              ].sort(),
            ).toEqual([0, missing.length]);
            const reconciled = (await reconcile()).json();
            expect(reconciled).toMatchObject({
              added: 0,
              missing: [],
              conflicts: [],
            });
            expect(reconciled.ledger).toEqual(reconciled.source);
            const backfills = ownerPool
              ? await ownerPool
                  .use((c) =>
                    queryRows<{ count: number }>(
                      c,
                      `SELECT COUNT(*) AS "count" FROM STL_AUDIT_LOGS
                  WHERE TARGET=:id AND ACTION='SYNTHETIC_LEDGER_BACKFILLED'`,
                      { id },
                    ),
                  )
                  .then(([row]) => row.count)
              : await db.auditLog.count({
                  where: { target: id, action: "SYNTHETIC_LEDGER_BACKFILLED" },
                });
            expect(backfills).toBe(capacity === "COMPANY" ? 1 : 0);

            const ledger = await app.inject({
              url: completion + "/financial-ledger",
              headers: ppsk,
            });
            expect(ledger.statusCode, ledger.body).toBe(200);
            expect(
              ledger
                .json()
                .entries.map((entry: { stage: number; event: string }) => [
                  entry.stage,
                  entry.event,
                ]),
            ).toEqual([
              [1, "INVOICE"],
              [1, "RECEIPT"],
              [2, "INVOICE"],
              [2, "RECEIPT"],
            ]);
            if (ownerPool)
              await expect(
                ownerPool.transaction((c) =>
                  c.execute(
                    "UPDATE STL_SYNTH_FINANCIAL_ENTRIES SET AMOUNT_SEN=1 WHERE SUBMISSION_ID=:id",
                    { id },
                  ),
                ),
              ).rejects.toThrow(/ORA-20008/);
            else
              await expect(
                db.$executeRaw`UPDATE synthetic_financial_entries SET "amountSen"=1 WHERE "submissionId"=${id}`,
              ).rejects.toThrow();
            expect(
              (
                await app.inject({
                  url: completion + "/financial-ledger",
                  headers: pic,
                })
              ).statusCode,
            ).toBe(404);
            for (const [version, action] of [
              "PLACE_HOLD",
              "RELEASE_HOLD",
              "REQUEST_REOPEN",
            ].entries()) {
              const record = await post(completion + "/records", ppsk, {
                version,
                action,
                reason: "Ujian semakan rekod",
              });
              expect(record.statusCode, record.body).toBe(200);
            }
            const overlay = await app.inject({
              url: completion + "/records",
              headers: ppsk,
            });
            expect(overlay.json()).toMatchObject({
              version: 3,
              reopenRequested: true,
              reopenEnabled: false,
              disposalEnabled: false,
            });
            const report = await app.inject({
              url: root + "/reports/applications",
              headers: ppsk,
            });
            expect(report.statusCode, report.body).toBe(200);
            expect(
              report
                .json()
                .rows.find(
                  (item: { status: string }) => item.status === "REGISTERED",
                ).closed,
            ).toBeGreaterThanOrEqual(1);
            const csv = await app.inject({
              url: root + "/reports/applications?format=csv",
              headers: ppsk,
            });
            expect(csv.body).toContain("bayaran_pertama,bayaran_kedua");
            expect(
              (
                await app.inject({
                  url: root + "/reports/applications?district=SPT",
                  headers: ppsk,
                })
              ).statusCode,
            ).toBe(404);
            const archives = await app.inject({
              url: root + "/reports/archive",
              headers: ppsk,
            });
            expect(archives.statusCode, archives.body).toBe(200);
            expect(archives.json().items).toEqual(
              expect.arrayContaining([expect.objectContaining({ id })]),
            );
            const aggregate = await app.inject({
              url: root + "/completion/queue",
              headers: ppsk,
            });
            expect(aggregate.statusCode).toBe(200);
            expect(aggregate.json().cases).toEqual([]);
            expect(aggregate.json().summary.closed).toBeGreaterThanOrEqual(1);
            expect(
              (
                await app.inject({
                  url: root + "/completion/queue",
                  headers: spt,
                })
              ).statusCode,
            ).toBe(404);
            const existing = await app.inject({
              url: "/api/application-drafts/" + draft,
              headers: owner,
            });
            expect(existing.statusCode).toBe(200);
            expect(
              (
                await app.inject({
                  method: "PATCH",
                  url: "/api/application-drafts/" + draft,
                  headers: owner,
                  payload: {
                    version: existing.json().version,
                    capacity,
                    ...(companyId && { companyId }),
                    notes: "Percubaan selepas tutup",
                  },
                })
              ).statusCode,
            ).toBe(409);

            for (const [path, payload] of [
              [
                "/premises",
                { version: existing.json().version, premises: emptyPremises },
              ],
              [
                "/floors",
                {
                  version: existing.json().version,
                  floors: [
                    {
                      floorLabel: "X",
                      rooms: 1,
                      beds: 1,
                      workers: 1,
                      areaSqm: 2,
                      facilities: {
                        toilets: 1,
                        bathrooms: 1,
                        sinks: 1,
                        diningTables: 1,
                        diningChairs: 1,
                        fireExtinguishers: 1,
                      },
                    },
                  ],
                },
              ],
              ["/units", { version: existing.json().version, units: [] }],
            ] as const)
              expect((await put(path, payload)).statusCode).toBe(409);
            expect(
              (
                await post(appUrl + "/evidence", owner, {
                  version: existing.json().version,
                  verdict: "CLEAN",
                })
              ).statusCode,
            ).toBe(409);
            const events = ownerPool
              ? await ownerPool.use(
                  async (connection) =>
                    (
                      await connection.execute<[string | null, string | null]>(
                        "SELECT ACTOR_ID,ACTIVE_ROLE FROM STL_AUDIT_LOGS WHERE TARGET=:id AND ACTION=:event",
                        { id, event: completionEvent },
                      )
                    ).rows!,
                )
              : (
                  await db.auditLog.findMany({
                    where: { target: id, action: completionEvent },
                    select: { actorId: true, activeRole: true },
                  })
                ).map(({ actorId, activeRole }) => [actorId, activeRole]);
            expect(events).toHaveLength(17 + offset);
            expect(
              events.filter(([actorId]) => actorId === "SYNTHETIC_PROVIDER"),
            ).toEqual([["SYNTHETIC_PROVIDER", null]]);
            if (companyId && proofId) {
              const revoked = await app.inject({
                method: "POST",
                url: `/api/companies/${companyId}/documents/${proofId}/revoke`,
                headers: owner,
              });
              expect(revoked.statusCode, revoked.body).toBe(200);
              expect(
                (await post(appUrl + "/submit", owner, submission)).statusCode,
              ).toBe(409);
              expect(
                (
                  await app.inject({
                    url: appUrl + "/completion",
                    headers: owner,
                  })
                ).statusCode,
              ).toBe(409);
            }
          } finally {
            await app.close();
          }
        } finally {
          vi.unstubAllEnvs();
          await runtime?.close();
          await ownerPool?.close();
          if (!oracle) await db.$disconnect();
        }
      },
      90_000,
    );
  });
}
