import { readFile } from "node:fs/promises";
import { createHmac, randomUUID } from "node:crypto";
import { parse } from "dotenv";
import { describe, expect, it, vi } from "vitest";
import { buildApp, buildOracleLabApp } from "../apps/api/src/app";
import { postgresAuth } from "../apps/api/src/auth-repository";
import { db, hash, origin } from "../apps/api/src/core";
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
    it("preserves the full published contract, role boundaries, serialized events and closure", async () => {
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
                await readFile(process.env.ORACLE_LAB_COMPLETION_RUNTIME_ENV!),
              ),
              "runtime",
            ),
          )
        : undefined;
      try {
        if (ownerPool && ownerEnv) {
          await ownerPool.use((connection) => migrateOracle(connection, true));
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
        vi.stubEnv("STAYLINK_SYNTHETIC_PORTAL", "true");
        vi.stubEnv("STAYLINK_SYNTHETIC_SECOND_UNIT_FEE_SEN", "1234");
        vi.stubEnv("STAYLINK_SYNTHETIC_DISTRICT", "SPU");
        const oracleRepositories = runtime && createOracleRepositories(runtime);
        const auth = oracleRepositories
          ? oracleRepositories.auth
          : postgresAuth;
        const actor = async (role: string, districtId = "SPU") => {
          const raw = randomUUID();
          const user = await auth.register({
            email: `${raw}@example.test`,
            name: "Akaun Sintetik Penyelesaian",
            phone: "0100000000",
            identificationHash: hash(raw),
            identificationEncrypted: "fixture-encrypted",
            identificationMasked: "1234",
            passwordHash: "unused-fixture",
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
          const create = await app.inject({
            method: "POST",
            url: "/api/application-drafts",
            headers: owner,
            payload: {
              capacity: "INDIVIDUAL",
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
          });
          const premises = await put("/premises", {
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
          });
          expect(premises.statusCode, premises.body).toBe(200);
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
          const submitted = await app.inject({
            method: "POST",
            url: appUrl + "/submit",
            headers: owner,
            payload: {
              version: ready.draftVersion,
              key: randomUUID(),
              accepted: true,
              declarationVersion: ready.declaration.version,
              policyFingerprint: ready.policyFingerprint,
              previousId: null,
            },
          });
          expect(submitted.statusCode, submitted.body).toBe(200);
          const { id } = submitted.json();
          const review = root + "/reviews/" + id;
          const completion = root + "/completion/" + id;
          const post = (url: string, headers: typeof owner, payload: object) =>
            app.inject({ method: "POST", url, headers, payload });
          const command = (
            headers: typeof owner,
            version: number,
            action: string,
            other = {},
          ) =>
            post(completion, headers, {
              version,
              command: { action, ...other },
            });
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
              payload: { version: 0, command: { action: "REFER" } },
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
            version: 0,
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
          } finally {
            clock.mockRestore();
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
            actors.map((actor, i) => command(actor, 1, "COMMENT", comments[i])),
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
          expect(
            (
              await command(pic, 3, "SUBMIT_PAPER", {
                summary: "Kertas Pertimbangan latihan",
              })
            ).statusCode,
          ).toBe(200);
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
                version: 6,
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
          expect((await callback(1234, "aa".repeat(32))).statusCode).toBe(401);
          expect((await callback(1235)).statusCode).toBe(409);
          const callbacks = await Promise.all([callback(1234), callback(1234)]);
          expect(callbacks.map((r) => r.json().result).sort()).toEqual([
            "REPLAY",
            "SETTLED",
          ]);
          expect((await command(ppsk, 16, "CLOSE")).statusCode).toBe(200);
          expect(
            (
              await app.inject({ url: appUrl + "/completion", headers: owner })
            ).json().closed,
          ).toBe(true);
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
                  capacity: "INDIVIDUAL",
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
          expect(events).toHaveLength(17);
          expect(
            events.filter(([actorId]) => actorId === "SYNTHETIC_PROVIDER"),
          ).toEqual([["SYNTHETIC_PROVIDER", null]]);
        } finally {
          await app.close();
        }
      } finally {
        vi.unstubAllEnvs();
        await runtime?.close();
        await ownerPool?.close();
        if (!oracle) await db.$disconnect();
      }
    }, 90_000);
  });
}
