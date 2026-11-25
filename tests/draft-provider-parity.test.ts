import { createHmac, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parse } from "dotenv";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, buildOracleLabApp } from "../apps/api/src/app";
import type { AuthRepository } from "../apps/api/src/auth-repository";
import { db, hash, origin } from "../apps/api/src/core";
import { postgresRepositories } from "../apps/api/src/database-provider";
import { oracleJson } from "../apps/api/src/oracle/codecs";
import { oracleConfig } from "../apps/api/src/oracle/config";
import { createOraclePool, type OraclePool } from "../apps/api/src/oracle/pool";
import { createOracleRepositories } from "../apps/api/src/oracle/provider";
import { emptyPremises } from "../packages/shared/src/premises";
import { createPrivateDocumentKey } from "../apps/api/src/private-document-keys";
import { seed } from "../prisma/seed";
import { prepareOracleLab } from "../scripts/oracle/lab";
import { migrateOracle } from "../scripts/oracle/migrations";

const variants = [
  {
    name: "PostgreSQL",
    enabled: process.env.STAYLINK_TEST_DB_PARITY === "true",
  },
  {
    name: "Oracle",
    enabled:
      !!process.env.ORACLE_LAB_OWNER_ENV &&
      !!process.env.ORACLE_LAB_RUNTIME_ENV,
  },
];

for (const { name, enabled } of variants) {
  describe.skipIf(!enabled)(`${name} draft HTTP contract`, () => {
    let app: FastifyInstance;
    let owner: OraclePool | undefined;
    let runtime: OraclePool | undefined;
    let auth: AuthRepository;
    const isOracle = name === "Oracle";

    beforeAll(async () => {
      if (isOracle) {
        const ownerEnv = parse(
          await readFile(process.env.ORACLE_LAB_OWNER_ENV!),
        );
        owner = await createOraclePool(oracleConfig(ownerEnv, "install"));
        runtime = await createOraclePool(
          oracleConfig(
            parse(await readFile(process.env.ORACLE_LAB_RUNTIME_ENV!)),
            "runtime",
          ),
        );
        await owner.use((connection) => migrateOracle(connection, true));
        await prepareOracleLab({
          ...ownerEnv,
          ORACLE_LAB_ENABLE_AUTH: "true",
          ORACLE_LAB_ENABLE_DRAFTS: "true",
          ORACLE_LAB_ENABLE_SUBMISSIONS: "true",
          ORACLE_LAB_ENABLE_APPLICANTS: "true",
          ORACLE_LAB_ENABLE_DASHBOARD: "true",
          ORACLE_LAB_ENABLE_ADMIN: "true",
        });
        const repositories = createOracleRepositories(runtime);
        auth = repositories.auth;
        app = await buildOracleLabApp(repositories);
      } else {
        const url = new URL(process.env.TEST_DATABASE_URL!);
        if (
          process.env.DATABASE_URL !== url.href ||
          url.hostname !== "127.0.0.1" ||
          !url.pathname.endsWith("_test") ||
          url.protocol !== "postgresql:" ||
          url.search ||
          url.hash
        )
          throw Error(
            "PostgreSQL parity requires an isolated loopback database.",
          );
        const [actual] = await db.$queryRaw<
          { name: string }[]
        >`SELECT current_database()::text AS name`;
        if (actual?.name !== url.pathname.slice(1))
          throw Error("Unexpected PostgreSQL database.");
        await seed();
        auth = postgresRepositories.auth;
        app = await buildApp();
      }
    }, 30_000);

    afterAll(async () => {
      await app?.close();
      await owner?.close();
      await runtime?.close();
      if (!isOracle) await db.$disconnect();
    });

    async function actor(
      role:
        | "PEMOHON"
        | "PIC_KAWASAN"
        | "PPSK"
        | "PENTADBIR_ICT"
        | "PENTADBIR_OPERASI"
        | "PENTADBIR_TEMPLAT" = "PEMOHON",
      districtId: "SPU" | "SPT" | null = "SPU",
    ) {
      const id = randomUUID();
      const user = await auth.register({
        name: "Pemohon Sintetik",
        email: `${id}@example.test`,
        phone: "0100000000",
        identificationHash: hash(id),
        identificationEncrypted: "encrypted-fixture",
        identificationMasked: "1234",
        passwordHash: "unused-fixture",
        consentAt: new Date(),
      });
      if (owner) {
        await owner.transaction(async (connection) => {
          await connection.execute(
            "UPDATE STL_USERS SET EMAIL_VERIFIED=1,KIND=:kind WHERE ID=:id",
            { id: user.id, kind: role === "PEMOHON" ? "APPLICANT" : "OFFICER" },
          );
          if (role !== "PEMOHON")
            await connection.execute(
              `INSERT INTO STL_USER_ROLE_ASSIGNMENTS (ID,USER_ID,ROLE_ID,DISTRICT_ID,REFERENCE)
              VALUES (:id,:userId,:role,:districtId,'Latihan Team 2')`,
              { districtId, id: randomUUID(), userId: user.id, role },
            );
        });
      } else {
        await db.user.update({
          where: { id: user.id },
          data: {
            emailVerified: true,
            kind: role === "PEMOHON" ? "APPLICANT" : "OFFICER",
            ...(role !== "PEMOHON" && {
              roles: {
                create: {
                  roleId: role,
                  districtId,
                  reference: "Latihan Team 2",
                },
              },
            }),
          },
        });
      }
      const csrf = randomUUID();
      await auth.createSession({
        id: hash(id),
        csrfHash: hash(csrf),
        userId: user.id,
        mfaVerified: true,
        expiresAt: new Date(Date.now() + 3_600_000),
      });
      await auth.switchRole(hash(id), role);
      return {
        userId: user.id,
        cookie: `staylink=${id}`,
        origin,
        "x-csrf-token": csrf,
      };
    }

    async function document(
      draftId: string,
      unitId: string | null,
      floorId: string | null,
      uploadedBy: string,
      version = 1,
    ) {
      const id = randomUUID();
      const storageKey = createPrivateDocumentKey(draftId, "premises_plan");
      const sha256 = hash("fixture");
      if (owner) {
        await owner.transaction(async (connection) => {
          await connection.execute(
            `INSERT INTO STL_APPLICATION_DOCUMENTS
            (ID,DRAFT_ID,CATEGORY,VERSION,FILE_NAME,MIME_TYPE,BYTE_SIZE,SHA256,STORAGE_KEY,UPLOADED_BY)
            VALUES (:id,:draftId,'premises_plan',:documentVersion,'fixture.pdf','application/pdf',7,:sha256,:storageKey,:uploadedBy)`,
            {
              id,
              draftId,
              sha256,
              storageKey,
              uploadedBy,
              documentVersion: version,
            },
          );
          await connection.execute(
            `INSERT INTO STL_DRAFT_DOCUMENT_SCOPES
            (DOCUMENT_ID,DRAFT_ID,UNIT_ID,FLOOR_ID) VALUES (:id,:draftId,:unitId,:floorId)`,
            { id, draftId, unitId, floorId },
          );
        });
      } else {
        await db.$transaction([
          db.applicationDocument.create({
            data: {
              id,
              draftId,
              category: "premises_plan",
              version,
              fileName: "fixture.pdf",
              mimeType: "application/pdf",
              byteSize: 7,
              sha256,
              storageKey,
              uploadedBy,
            },
          }),
          db.draftDocumentScope.create({
            data: { documentId: id, draftId, unitId, floorId },
          }),
        ]);
      }
      return id;
    }

    it("preserves synthetic evidence, immutable submission, review and reconciliation", async () => {
      const requester = await actor();
      const create = await app.inject({
        method: "POST",
        url: "/api/application-drafts",
        headers: requester,
        payload: { capacity: "INDIVIDUAL", notes: "Latihan Oracle" },
      });
      expect(create.statusCode, create.body).toBe(201);
      const draftId = create.json().id;
      const draft = `/api/application-drafts/${draftId}`;
      const submit = `/api/synthetic-portal/drafts/${draftId}/submit`;
      const put = (suffix: string, payload: object) =>
        app.inject({
          method: "PUT",
          url: draft + suffix,
          headers: requester,
          payload,
        });
      const fullPremises = {
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
        involvedFloors: 1,
        totalRooms: 2,
        accommodationUnits: 1,
        floorAreaSqm: 61.73,
        proposedWorkers: 4,
        certificateType: "NOT_APPLICABLE",
      };
      const premises = await put("/premises", {
        version: 1,
        action: "CONTINUE",
        premises: fullPremises,
      });
      expect(premises.statusCode, premises.body).toBe(200);
      const floors = await put("/floors", {
        version: 2,
        floors: [
          {
            floorLabel: "A",
            rooms: 2,
            beds: 4,
            workers: 4,
            areaSqm: 61.73,
            facilities: {
              toilets: 1,
              bathrooms: 1,
              sinks: 1,
              diningTables: 1,
              diningChairs: 4,
              fireExtinguishers: 1,
            },
          },
        ],
      });
      expect(floors.statusCode, floors.body).toBe(200);
      const floorId = floors.json().floors[0].id;
      const units = await put("/units", {
        version: 3,
        units: [{ unitLabel: "Unit A", floorIds: [floorId] }],
      });
      expect(units.statusCode, units.body).toBe(200);
      const input = {
        version: 4,
        key: randomUUID(),
        accepted: true,
        declarationVersion: "SYNTHETIC-K05-v1",
        previousId: null,
      };
      const capture = (payload: object) =>
        app.inject({
          method: "POST",
          url: submit,
          headers: requester,
          payload,
        });
      const withoutEvidence = await capture(input);
      expect(withoutEvidence.statusCode, withoutEvidence.body).toBe(409);
      const evidence = (version: number, verdict: string) =>
        app.inject({
          method: "POST",
          url: `/api/synthetic-portal/drafts/${draftId}/evidence`,
          headers: requester,
          payload: { version, verdict },
        });
      const failed = await evidence(4, "FAILED");
      expect(failed.statusCode, failed.body).toBe(200);
      expect((await capture({ ...input, version: 5 })).statusCode).toBe(409);
      const clean = await evidence(5, "CLEAN");
      expect(clean.statusCode, clean.body).toBe(200);
      input.version = 6;
      const details = await app.inject({
        url: `/api/synthetic-portal/drafts/${draftId}`,
        headers: requester,
      });
      expect(details.statusCode, details.body).toBe(200);
      expect(details.json()).toMatchObject({
        ready: true,
        evidence: [{ scanStatus: "CLEAN", version: 2 }],
      });
      const requests = await Promise.all([capture(input), capture(input)]);
      for (const response of requests)
        expect(response.statusCode, response.body).toBe(200);
      expect(requests[0].json()).toEqual(requests[1].json());
      expect(
        (await capture({ ...input, declarationVersion: "SYNTHETIC-OLD" }))
          .statusCode,
      ).toBe(409);
      expect((await capture({ ...input, key: randomUUID() })).statusCode).toBe(
        409,
      );
      const pic = await actor("PIC_KAWASAN");
      const ppsk = await actor("PPSK");
      process.env.STAYLINK_SYNTHETIC_PIC_ID = pic.userId;
      process.env.STAYLINK_SYNTHETIC_SUPERVISOR_ID = ppsk.userId;
      const submissionId = requests[0].json().id;
      const review = `/api/synthetic-portal/reviews/${submissionId}`;
      const queue = await app.inject({
        url: `/api/synthetic-portal/reviews?search=${submissionId}`,
        headers: pic,
      });
      expect(queue.statusCode, queue.body).toBe(200);
      expect(queue.json()).toMatchObject({
        reviews: [{ id: submissionId, status: "SUBMITTED" }],
      });
      const decide = (headers: typeof pic, action: string, version: number) =>
        app.inject({
          method: "POST",
          url: review,
          headers,
          payload: { action, version, reason: "Pengesahan sintetik Team 2" },
        });
      expect((await decide(pic, "REGISTER", 1)).statusCode).toBe(403);
      const decisions = await Promise.all([
        decide(pic, "CONFIRM_COMPLETE", 1),
        decide(pic, "CONFIRM_COMPLETE", 1),
      ]);
      expect(
        decisions.map(({ statusCode }) => statusCode).sort(),
        decisions.map(({ body }) => body).join(" "),
      ).toEqual([200, 409]);
      const registered = await decide(ppsk, "REGISTER", 2);
      expect(registered.statusCode, registered.body).toBe(200);
      const issue = () =>
        app.inject({
          method: "POST",
          url: review + "/billing",
          headers: ppsk,
          payload: { action: "ISSUE" },
        });
      const invoices = await Promise.all([issue(), issue()]);
      for (const response of invoices)
        expect(response.statusCode, response.body).toBe(200);
      expect(invoices.map((response) => response.json().result).sort()).toEqual(
        ["ISSUED", "REPLAY"],
      );
      const invoice = invoices[0].json().invoice;
      expect(invoice).toMatchObject({
        amountSen: 5000,
        currency: "MYR",
        unitCount: 1,
      });
      const payload = JSON.stringify({
        invoiceId: invoice.id,
        eventId: invoice.id,
        currency: "MYR",
        amountSen: 5000,
        providerReference: `SYNTHETIC-${invoice.id}`,
        outcome: "SETTLED",
      });
      const signature = createHmac(
        "sha256",
        Buffer.from(process.env.STAYLINK_SYNTHETIC_CALLBACK_KEY!, "hex"),
      )
        .update(payload)
        .digest("hex");
      const callback = (value: string) =>
        app.inject({
          method: "POST",
          url: `/api/synthetic-portal/callbacks/payment/${submissionId}`,
          headers: { "x-staylink-synthetic-signature": value },
          payload: { payload },
        });
      expect((await callback("0".repeat(64))).statusCode).toBe(401);
      const payments = await Promise.all([
        callback(signature),
        callback(signature),
      ]);
      for (const response of payments)
        expect(response.statusCode, response.body).toBe(200);
      expect(payments.map((response) => response.json().result).sort()).toEqual(
        ["REPLAY", "SETTLED"],
      );
      const bill = await app.inject({
        url: `/api/synthetic-portal/drafts/${draftId}/billing`,
        headers: requester,
      });
      expect(bill.statusCode, bill.body).toBe(200);
      expect(bill.json()).toMatchObject({
        invoice: { id: invoice.id, status: "SETTLED" },
      });

      const dashboard = await app.inject({
        url: "/api/dashboard",
        headers: requester,
      });
      expect(dashboard.statusCode, dashboard.body).toBe(200);
      expect(dashboard.json().notifications).toHaveLength(2);
      expect(
        dashboard
          .json()
          .notifications.every(
            (entry: { type: string }) => entry.type === "SYNTHETIC_REVIEW",
          ),
      ).toBe(true);
    }, 30_000);

    it("serializes area assignment and template versions and revokes officer access", async () => {
      const ops = await actor("PENTADBIR_OPERASI");
      const pic = await actor("PIC_KAWASAN");
      const ict = await actor("PENTADBIR_ICT");
      const editor = await actor("PENTADBIR_TEMPLAT");
      const call = (
        method: "POST" | "PATCH" | "GET",
        url: string,
        headers: typeof ops,
        payload?: object,
      ) => app.inject({ method, url, headers, payload });
      const area = await call("POST", "/api/areas", ops, {
        name: `Kawasan ${randomUUID()}`,
        districtId: "SPU",
      });
      expect(area.statusCode, area.body).toBe(200);
      const areaId = area.json().id;
      const assignment = await call("POST", "/api/areas/assign", ops, {
        areaId,
        userId: pic.userId,
        reason: "Pelantikan data sintetik",
      });
      expect(assignment.statusCode, assignment.body).toBe(200);
      const resolution = await call("GET", `/api/areas/${areaId}/resolve`, pic);
      expect(resolution.json()).toMatchObject({
        status: "PIC_DIKENAL_PASTI",
        userId: pic.userId,
      });
      const templates = await call("GET", "/api/templates", editor);
      expect(templates.statusCode, templates.body).toBe(200);
      const template = await call("POST", "/api/templates", editor, {
        name: "Templat Sintetik Team 2",
        category: templates.json()[0].category,
        content: "Versi awal sintetik",
      });
      expect(template.statusCode, template.body).toBe(200);
      const endpoint = `/api/templates/${template.json().id}/versions`;
      const versions = await Promise.all([
        call("POST", endpoint, editor, { content: "Versi tambahan A" }),
        call("POST", endpoint, editor, { content: "Versi tambahan B" }),
      ]);
      for (const entry of versions)
        expect(entry.statusCode, entry.body).toBe(200);
      expect(versions.map((entry) => entry.json().version).sort()).toEqual([
        2, 3,
      ]);
      for (const entry of versions) {
        const result = await call(
          "POST",
          `/api/template-versions/${entry.json().id}/activate`,
          editor,
          {},
        );
        expect(result.statusCode, result.body).toBe(200);
      }
      const listed = await call("GET", "/api/templates", editor);
      const latest = listed
        .json()
        .find((row: { id: string }) => row.id === template.json().id);
      expect(
        latest.versions.filter(
          (row: { status: string }) => row.status === "ACTIVE",
        ),
      ).toHaveLength(1);
      const suspend = await call(
        "PATCH",
        `/api/admin/users/${pic.userId}/status`,
        ict,
        { status: "SUSPENDED", reason: "Ujian penggantungan sintetik" },
      );
      expect(suspend.statusCode, suspend.body).toBe(200);
      expect((await call("GET", "/api/auth/me", pic)).statusCode).toBe(401);
      expect(
        (await call("GET", `/api/areas/${areaId}/resolve`, ops)).json(),
      ).toEqual({ status: "PERLU PENENTUAN PPSK" });
    }, 30_000);

    it("keeps company and delegation reads and writes scoped to current representatives", async () => {
      const manager = await actor();
      const outsider = await actor();
      const update = await app.inject({
        method: "PATCH",
        url: "/api/profile",
        headers: manager,
        payload: { name: "Nama Latihan Dikemas Kini", phone: "0100000002" },
      });
      expect(update.statusCode, update.body).toBe(200);
      expect(update.json()).toMatchObject({
        name: "Nama Latihan Dikemas Kini",
      });
      expect(update.json()).not.toHaveProperty("passwordHash");
      const details = {
        name: "Syarikat Latihan",
        address: "Alamat Sintetik",
        phone: "0100000000",
        email: "syarikat@example.test",
      };
      const input = {
        ...details,
        registrationNumber: randomUUID().replaceAll("-", ""),
        authorityType: "PEKERJA",
      };
      const create = () =>
        app.inject({
          method: "POST",
          url: "/api/companies",
          headers: manager,
          payload: input,
        });
      const company = await create();
      expect(company.statusCode, company.body).toBe(201);
      expect((await create()).statusCode).toBe(409);
      const companyId = company.json().id;
      const uri = `/api/companies/${companyId}`;
      const pdf = Buffer.from("%PDF-1.7\nLatihan\n%%EOF");
      const upload = await app.inject({
        method: "POST",
        url: uri + "/documents",
        headers: manager,
        payload: { fileName: "fixture.pdf", content: pdf.toString("base64") },
      });
      expect(upload.statusCode, upload.body).toBe(200);
      const documentId = upload.json().id;
      const path = `/api/documents/${documentId}`;
      expect(
        (await app.inject({ url: path, headers: outsider })).statusCode,
      ).toBe(404);
      const download = await app.inject({ url: path, headers: manager });
      expect(download.statusCode, download.body).toBe(404);
      expect(download.body).not.toContain("Latihan");
      const updated = await app.inject({
        method: "PATCH",
        url: uri,
        headers: manager,
        payload: { ...details, name: "Syarikat Dipinda" },
      });
      expect(updated.statusCode, updated.body).toBe(200);
      const list = await app.inject({
        url: "/api/companies",
        headers: manager,
      });
      expect(list.statusCode, list.body).toBe(200);
      expect(list.json()).toMatchObject([
        {
          company: {
            id: companyId,
            name: "Syarikat Dipinda",
            documents: [{ id: documentId }],
          },
        },
      ]);
      const context = await app.inject({
        url: "/api/application-drafts/context",
        headers: manager,
      });
      expect(context.json().companies).toMatchObject([{ id: companyId }]);
    }, 30_000);

    it.runIf(isOracle)(
      "pages the Oracle review queue with a microsecond cursor and a stable tie-break",
      async () => {
        const requester = await actor();
        const pic = await actor("PIC_KAWASAN", "SPT");
        const ppsk = await actor("PPSK", "SPT");
        const previous = process.env.STAYLINK_SYNTHETIC_DISTRICT;
        process.env.STAYLINK_SYNTHETIC_DISTRICT = "SPT";
        process.env.STAYLINK_SYNTHETIC_PIC_ID = pic.userId;
        process.env.STAYLINK_SYNTHETIC_SUPERVISOR_ID = ppsk.userId;
        const prefix = randomUUID().slice(0, 8);
        const ids = Array.from(
          { length: 21 },
          () => prefix + randomUUID().slice(8),
        )
          .sort()
          .reverse();
        const fixture = { synthetic: true };
        const snapshot = {
          capacity: "INDIVIDUAL",
          companyId: null,
          districtId: "SPT",
          units: [{ id: randomUUID(), unitLabel: "Latihan", floorIds: [] }],
          floors: [{ id: randomUUID(), floorLabel: "Latihan" }],
          evidence: [
            {
              id: randomUUID(),
              version: 1,
              category: "floor_layout",
              scope: "FLOOR",
              targetId: randomUUID(),
              scanStatus: "CLEAN",
              verificationStatus: "UNVERIFIED",
            },
          ],
        };
        try {
          await owner!.transaction(async (connection) => {
            for (const id of ids) {
              const draftId = randomUUID();
              await connection.execute(
                `INSERT INTO STL_APPLICATION_DRAFTS
              (ID,INITIATED_BY_USER_ID,CAPACITY,OFFICIAL_APPLICANT_USER_ID,INITIATOR_SNAPSHOT,APPLICANT_SNAPSHOT,UPDATED_AT)
              VALUES (:draftId,:userId,'INDIVIDUAL',:userId,:fixture,:fixture,SYSTIMESTAMP)`,
                {
                  draftId,
                  userId: requester.userId,
                  fixture: oracleJson(fixture),
                },
              );
              await connection.execute(
                `INSERT INTO STL_SYNTHETIC_SUBMISSIONS
              (ID,DRAFT_ID,DRAFT_VERSION,KEY,ACTOR_ID,DECLARATION_VERSION,POLICY_VERSION,SNAPSHOT,CREATED_AT)
              VALUES (:id,:draftId,1,:id,:userId,'SYNTHETIC-K05-v1','SYNTHETIC-K04-v1',:snapshot,
                TO_TIMESTAMP_TZ('2026-11-01T00:00:00.000001 +00:00','YYYY-MM-DD"T"HH24:MI:SS.FF6 TZH:TZM'))`,
                {
                  id,
                  draftId,
                  userId: requester.userId,
                  snapshot: oracleJson(snapshot),
                },
              );
            }
          });
          const first = await app.inject({
            url: `/api/synthetic-portal/reviews?search=${prefix}`,
            headers: pic,
          });
          expect(first.statusCode, first.body).toBe(200);
          expect(
            first
              .json()
              .reviews.slice(0, 20)
              .map((item: { id: string }) => item.id),
          ).toEqual(ids.slice(0, 20));
          const cursor = first.json().nextCursor;
          expect(
            JSON.parse(Buffer.from(cursor, "base64url").toString())[0],
          ).toBe("2026-11-01T00:00:00.000001Z");
          const second = await app.inject({
            url: `/api/synthetic-portal/reviews?cursor=${cursor}&search=${prefix}`,
            headers: pic,
          });
          expect(second.statusCode, second.body).toBe(200);
          expect(second.json().reviews[0].id).toBe(ids[20]);
        } finally {
          if (previous === undefined)
            delete process.env.STAYLINK_SYNTHETIC_DISTRICT;
          else process.env.STAYLINK_SYNTHETIC_DISTRICT = previous;
        }
      },
      30_000,
    );

    it.runIf(isOracle)(
      "recovers after a closed Oracle pool without exposing driver details",
      async () => {
        const runtimeEnv = parse(
          await readFile(process.env.ORACLE_LAB_RUNTIME_ENV!),
        );
        const closed = await createOraclePool(
          oracleConfig(runtimeEnv, "runtime"),
        );
        const unavailable = await buildOracleLabApp(
          createOracleRepositories(closed),
        );
        await closed.close();
        try {
          const failing = await unavailable.inject({ url: "/api/health" });
          expect(failing.statusCode, failing.body).toBe(503);
          expect(failing.json().code).toBe("DATABASE_UNAVAILABLE");
          expect(failing.body).not.toContain(runtimeEnv.ORACLE_USER);
        } finally {
          await unavailable.close();
        }
        const ready = await app.inject({ url: "/api/health" });
        expect(ready.statusCode, ready.body).toBe(200);
      },
    );

    it("preserves IDs, ownership, metadata, aggregate versions and transaction rollback", async () => {
      const applicant = await actor();
      const other = await actor();
      const root = "/api/application-drafts";
      const input = { capacity: "INDIVIDUAL", notes: "" };
      const create = await app.inject({
        method: "POST",
        url: root,
        headers: applicant,
        payload: input,
      });
      expect(create.statusCode, create.body).toBe(201);
      const draft = create.json();
      expect(draft).toMatchObject({
        version: 1,
        notes: "",
        representativeSnapshot: null,
      });
      expect(draft.applicantSnapshot).not.toHaveProperty("identificationHash");
      const uri = `${root}/${draft.id}`;
      const save = (suffix: string, payload: object) =>
        app.inject({
          method: "PUT",
          url: uri + suffix,
          headers: applicant,
          payload,
        });
      expect((await app.inject({ url: uri, headers: other })).statusCode).toBe(
        404,
      );
      const list = await app.inject({ url: root, headers: applicant });
      expect(list.json()).toEqual([
        expect.objectContaining({ id: draft.id, version: 1 }),
      ]);
      const premises = {
        ...emptyPremises,
        districtId: "SPU",
        latitude: 5.400000000018,
        longitude: 100.4,
        certificateType: "CCC",
        certificateDate: "2023-10-15",
        certificateNumber: "STL-LAB",
        accommodationUnits: 1,
        floorAreaSqm: 123.45,
      };
      const concurrent = await Promise.all([
        save("/premises", { version: 1, premises }),
        save("/premises", { version: 1, premises }),
      ]);
      expect(
        concurrent.map(({ statusCode }) => statusCode).sort(),
        concurrent.map(({ body }) => body).join(" "),
      ).toEqual([200, 409]);
      expect(
        concurrent.find(({ statusCode }) => statusCode === 200)!.json(),
      ).toMatchObject({ version: 2, premises });
      const facilities = {
        toilets: 1,
        bathrooms: 2,
        sinks: 3,
        diningTables: 4,
        diningChairs: 5,
        fireExtinguishers: 6,
      };
      const floor = {
        rooms: 2,
        beds: 3,
        workers: 4,
        areaSqm: 61.73,
        facilities,
      };
      const createFloors = await save("/floors", {
        version: 2,
        floors: [
          { ...floor, floorLabel: "A" },
          { ...floor, floorLabel: "B" },
        ],
      });
      expect(createFloors.statusCode, createFloors.body).toBe(200);
      const { floors } = createFloors.json();
      const [first, second] = floors;
      const swapped = await save("/floors", {
        version: 3,
        floors: [
          { ...second, floorLabel: first.floorLabel },
          { ...first, floorLabel: second.floorLabel },
        ],
      });
      expect(swapped.statusCode, swapped.body).toBe(200);
      expect(swapped.json().floors).toEqual([
        { ...second, floorLabel: first.floorLabel },
        { ...first, floorLabel: second.floorLabel },
      ]);
      const unit = await save("/units", {
        version: 4,
        units: [
          { unitLabel: "Unit Sintetik", floorIds: [first.id, second.id] },
        ],
      });
      expect(unit.statusCode, unit.body).toBe(200);
      const stored = unit.json();
      expect(stored).toMatchObject({
        version: 5,
        inventoryStatus: "MATCHED",
        units: [{ floorIds: [second.id, first.id] }],
      });
      const blocked = await save("/floors", {
        version: 5,
        floors: [swapped.json().floors[0]],
      });
      expect(blocked.statusCode).toBe(409);
      const scopeId = await document(
        draft.id,
        null,
        first.id,
        applicant.userId,
      );
      await document(
        draft.id,
        stored.units[0].unitId,
        null,
        applicant.userId,
        2,
      );
      const metadata = await app.inject({
        url: uri + "/documents",
        headers: applicant,
      });
      expect(metadata.statusCode, metadata.body).toBe(200);
      expect(metadata.headers["cache-control"]).toContain("no-store");
      expect(metadata.json()).toMatchObject({
        submissionEnabled: false,
        documents: expect.arrayContaining([
          expect.objectContaining({
            id: scopeId,
            version: 1,
            scanStatus: "PENDING",
            scope: { floorId: first.id, unitId: null },
          }),
        ]),
      });
      expect(metadata.json().documents[0]).not.toHaveProperty("storageKey");
      const readiness = await app.inject({
        url: uri + "/submission-readiness",
        headers: applicant,
      });
      expect(readiness.statusCode, readiness.body).toBe(200);
      expect(readiness.json().submissionEnabled).toBe(false);
      const uncoupled = await save("/units", {
        version: 5,
        units: [{ ...stored.units[0], floorIds: [] }],
      });
      expect(uncoupled.statusCode, uncoupled.body).toBe(200);
      expect((await save("/units", { version: 6, units: [] })).statusCode).toBe(
        409,
      );
      expect(
        (
          await save("/floors", {
            version: 6,
            floors: [swapped.json().floors[0]],
          })
        ).statusCode,
      ).toBe(409);
      const read = await app.inject({ url: uri, headers: applicant });
      expect(read.json().version).toBe(6);
      const submission = await app.inject({
        method: "POST",
        url: uri + "/submit",
        headers: applicant,
      });
      expect(submission.statusCode).toBe(409);
    }, 30_000);
  });
}
