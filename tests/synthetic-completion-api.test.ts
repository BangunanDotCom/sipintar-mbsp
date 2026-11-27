import type { Prisma } from "@prisma/client";
import { deliverTrainingReminders } from "../apps/api/src/training-reminders";
import { afterAll, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { reconcileSyntheticLedger } from "../apps/api/src/synthetic-financial-reconciliation";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { buildApp } from "../apps/api/src/app";
import { totp } from "../apps/api/src/auth";
import { db } from "../apps/api/src/core";
import { inspectDemoHost } from "../apps/api/src/demo-host-config.mjs";

const kitFile = process.env.STAYLINK_COMPLETION_KIT_FILE;
const root = "/api/synthetic-portal";
type Credentials = {
  id: string;
  label: string;
  role: string;
  email: string;
  password: string;
  mfaSecretBase32: string | null;
};

it.runIf(Boolean(kitFile))(
  "reconciles, refers, publishes partial and supplemental letters, and closes only after second settlement",
  async () => {
    const { database, origin, failures } = inspectDemoHost();
    if (
      failures.length ||
      !/^staylink_issue62_personal_completion[a-z0-9]{0,14}_test$/.test(
        database ?? "",
      ) ||
      origin !== "https://localhost:5444" ||
      process.env.STAYLINK_SYNTHETIC_SECOND_UNIT_FEE_SEN !== "1234"
    )
      throw Error("Gunakan fixture integrasi latihan terasing.");
    const kit = JSON.parse(await readFile(kitFile!, "utf8")) as {
      accounts: Credentials[];
      scenarios: { id: string; draftPath: string }[];
    };
    const flags = ["STAYLINK_SYNTHETIC_BKT","STAYLINK_SYNTHETIC_RECORDS","STAYLINK_SYNTHETIC_REMINDERS","STAYLINK_SYNTHETIC_LEDGER_BACKFILL"] as const;
    const originalFlags = flags.map((key)=>process.env[key]);
    for (const key of flags) process.env[key]="true";
    const app = await buildApp();
    try {
      expect(kit.accounts).toHaveLength(11);
      let sequence = 0;
      const signIn = async (label: string) => {
        const account = kit.accounts.find((item) => item.label === label)!;
        const remoteAddress = "192.0.2." + ++sequence;
        const login = await app.inject({
          method: "POST",
          url: "/api/auth/login",
          payload: { email: account.email, password: account.password },
          remoteAddress,
        });
        expect(login.statusCode, label).toBe(200);
        const headers = {
          origin: origin!,
          cookie:
            "staylink=" +
            login.cookies.find((item) => item.name === "staylink")!.value,
          "x-csrf-token": login.json().csrf,
        };
        if (account.mfaSecretBase32) {
          expect(
            (
              await app.inject({
                url: root + "/completion/queue",
                headers,
                remoteAddress,
              })
            ).statusCode,
          ).toBe(403);
          const mfa = await app.inject({
            method: "POST",
            url: "/api/auth/mfa/verify",
            headers,
            remoteAddress,
            payload: { code: totp(account.mfaSecretBase32).generate() },
          });
          expect(mfa.statusCode, label).toBe(200);
        }
        expect(
          (
            await app.inject({
              method: "POST",
              url: "/api/auth/role",
              headers,
              remoteAddress,
              payload: { roleId: account.role },
            })
          ).statusCode,
        ).toBe(200);
        return headers;
      };
      const [
        owner,
        other,
        pic,
        spt,
        ppsk,
        planning,
        engineering,
        council,
        signer,
      ] = await Promise.all(
        [
          "pemohon",
          "wakil",
          "pic-spu",
          "pic-spt",
          "ppsk",
          "perancang",
          "kejuruteraan",
          "urus-setia",
          "penandatangan",
        ].map(signIn),
      );
      const draft = kit.scenarios
        .find(({ id }) => id === "single-unit")!
        .draftPath.split("/")[3];
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
      expect(submitted.statusCode).toBe(200);
      const { id } = submitted.json();
      const review = root + "/reviews/" + id;
      const completion = root + "/completion/" + id;
      const post = (url: string, headers: typeof owner, payload: object) =>
        app.inject({ method: "POST", url, headers, payload });
      let phaseOffset=0;
      const command = (
        headers: typeof owner,
        version: number,
        action: string,
        other = {},
      ) =>
        post(completion, headers, { version:version+phaseOffset, command: { action, ...other } });
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
        (await post(review + "/billing", ppsk, { action: "ISSUE" })).statusCode,
      ).toBe(200);
      await db.$executeRaw`CREATE FUNCTION finance_fixture_abort() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.event = 'RECEIPT' THEN RAISE EXCEPTION 'synthetic receipt failure'; END IF;
        RETURN NEW; END $$`;
      try {
        await db.$executeRaw`CREATE TRIGGER finance_fixture_abort BEFORE INSERT ON synthetic_financial_entries
          FOR EACH ROW EXECUTE FUNCTION finance_fixture_abort()`;
        try {
          const failed=await post(review+"/billing",ppsk,{action:"SIMULATE_SETTLEMENT"});
          expect(failed.statusCode).toBe(500);
          expect(await db.syntheticFinancialEntry.count({where:{submissionId:id}})).toBe(1);
          expect(await db.auditLog.count({where:{target:id,action:"SYNTHETIC_PORTAL_INVOICE_SETTLED"}})).toBe(0);
        } finally {
          await db.$executeRaw`DROP TRIGGER finance_fixture_abort ON synthetic_financial_entries`;
        }
      } finally {
        await db.$executeRaw`DROP FUNCTION finance_fixture_abort()`;
      }
      expect(
        (
          await post(review + "/billing", ppsk, {
            action: "SIMULATE_SETTLEMENT",
          })
        ).statusCode,
      ).toBe(200);
      expect((await command(spt, 0, "REFER")).statusCode).toBe(404);
      expect((await command(pic,0,"REFER")).statusCode).toBe(409);
      const intake=await app.inject({url:root+"/completion/queue",headers:council});
      expect(intake.json().cases).toContainEqual(expect.objectContaining({id,version:0,bkt:null}));

      const councilId = kit.accounts.find(({ label }) => label === "urus-setia")!.id;
      const intakeGrant = await db.userRoleAssignment.findFirstOrThrow({
        where: { userId: councilId, roleId: "URUS_SETIA_JK", districtId: "SPU" },
      });
      await db.$executeRaw`CREATE FUNCTION training_expiring_intake() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.action = 'SYNTHETIC_PORTAL_COMPLETION' AND NEW.metadata->'command'->>'action' = 'RECEIVE_BKT'
          THEN PERFORM pg_sleep(3.5); END IF;
          RETURN NEW;
        END $$`;
      try {
        await db.$executeRaw`CREATE TRIGGER training_expiring_intake BEFORE INSERT ON audit_logs
          FOR EACH ROW EXECUTE FUNCTION training_expiring_intake()`;
        await db.userRoleAssignment.update({
          where: { id: intakeGrant.id }, data: { endsAt: new Date(Date.now() + 3_000) },
        });
        const expired = await command(council, 0, "RECEIVE_BKT", { note: "Penerimaan tidak boleh dikomit." });
        expect(expired.statusCode, expired.body).toBe(403);
        expect(await db.auditLog.count({
          where: { target: id, action: "SYNTHETIC_PORTAL_COMPLETION",
            metadata: { path: ["command", "action"], equals: "RECEIVE_BKT" } },
        })).toBe(0);
      } finally {
        await db.$executeRaw`DROP TRIGGER IF EXISTS training_expiring_intake ON audit_logs`;
        await db.$executeRaw`DROP FUNCTION training_expiring_intake()`;
        await db.userRoleAssignment.update({where:{id:intakeGrant.id},data:{endsAt:intakeGrant.endsAt}});
      }

      expect((await command(council,0,"RECEIVE_BKT",{note:"Penerimaan BKT latihan."})).statusCode).toBe(200);
      phaseOffset++;
      expect((await command(pic, 0, "REFER")).statusCode).toBe(200);
      const waiting = await app.inject({ url: completion, headers: pic });
      expect(waiting.json().consolidation.departments.map(({ status }: { status: string }) => status))
        .toEqual(["PENDING", "PENDING"]);
      const reminders = await db.trainingReminderOutbox.findMany({where:{draftId:draft,kind:{startsWith:"TECH_"}}});
      expect(reminders).toHaveLength(5);
      const pre = reminders.find((entry)=>entry.kind==="TECH_PRE_DUE")!;
      await db.trainingReminderOutbox.update({where:{id:pre.id},data:{availableAt:new Date(0)}});
      const deliveries:string[]=[];
      await Promise.all([deliverTrainingReminders(async (mail)=>{deliveries.push(mail.messageId);}),
        deliverTrainingReminders(async (mail)=>{deliveries.push(mail.messageId);})]);
      expect(deliveries).toHaveLength(1);
      const queue = await app.inject({
        url: root + "/completion/queue",
        headers: planning,
      });
      expect(queue.statusCode, queue.body).toBe(200);
      const { scopes } = queue
        .json()
        .cases.find((row: { id: string }) => row.id === id);
      expect(scopes).toHaveLength(2);
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
      expect((await command(planning,1,"ACK_REFERRAL")).statusCode).toBe(200);
      phaseOffset++;
      expect((await command(engineering,1,"ACK_REFERRAL")).statusCode).toBe(200);
      phaseOffset++;
      expect(
        (
          await command(planning, 1, "COMMENT", {
            general: "Semakan perancang latihan",
            details: [],
          })
        ).statusCode,
      ).toBe(200);
      expect((await command(pic,2,"RETURN_COMMENT",{
        department:"PERANCANG_BANDAR",reason:"Ulasan latihan dipulangkan.",
      })).statusCode).toBe(200);
      phaseOffset++;
      expect((await command(planning,2,"COMMENT",{
        general:"Semakan perancang dipinda",details:[],
      })).statusCode).toBe(200);
      phaseOffset++;
      expect(
        (
          await command(engineering, 2, "COMMENT", {
            general: "Semakan kejuruteraan latihan",
            details: [],
          })
        ).statusCode,
      ).toBe(200);
      const reportPath = root + "/reports/applications";
      const referral = await db.auditLog.findFirstOrThrow({
        where:{target:id,action:"SYNTHETIC_PORTAL_COMPLETION",metadata:{path:["command","action"],equals:"REFER"}},
      });
      const openedAt = Date.now() - 7 * 86_400_000 - 60_000;
      await db.auditLog.update({where:{id:referral.id},data:{
        createdAt:new Date(openedAt),
        metadata:{...(referral.metadata as object),timestamp:openedAt},
      }});
      expect((await command(pic,3,"RETURN_COMMENT",{
        department:"PERANCANG_BANDAR",reason:"Ulasan selepas tempoh dikembalikan.",
      })).statusCode).toBe(200);
      phaseOffset++;
      try {
        const deadline = openedAt + 7 * 86_400_000;
        for (const [timestamp, expected] of [[deadline-1,0],[deadline,1],[deadline+1,1]]) {
          const clock = vi.spyOn(Date,"now").mockReturnValue(timestamp);
          try {
            const detail = await app.inject({url:completion,headers:pic});
            expect(detail.json().consolidation.departments.filter(
              ({status}: {status:string})=>status==="OVERDUE",
            )).toHaveLength(expected);
            const report = await app.inject({url:reportPath,headers:ppsk});
            expect(report.statusCode,report.body).toBe(200);
            expect(report.json().rows.find(({status}: {status:string})=>status==="REGISTERED").overdue).toBe(expected);
            expect((await app.inject({url:reportPath+"?format=csv",headers:ppsk})).body)
              .toContain(`SPU,REGISTERED,1,1,0,1,${expected},0`);
          } finally {
            clock.mockRestore();
          }
        }
      } finally {
        await db.auditLog.update({where:{id:referral.id},data:{
          createdAt:referral.createdAt,metadata:referral.metadata as object,
        }});
      }
      expect((await command(planning,3,"COMMENT",{
        general:"Semakan perancang muktamad latihan",details:[],
      })).statusCode).toBe(200);
      phaseOffset++;
      expect(
        (
          await command(pic, 3, "SUBMIT_PAPER", {
            summary: "Kertas Pertimbangan latihan",
          })
        ).statusCode,
      ).toBe(200);
      const consolidated = await app.inject({ url: completion, headers: pic });
      expect(consolidated.json().consolidation).toMatchObject({
        submittedPaperVersion: 4 + phaseOffset,
        departments: [
          { department: "PERANCANG_BANDAR", status: "RECEIVED",
            current: { general: "Semakan perancang muktamad latihan" },
            previous: { comment: { general: "Semakan perancang dipinda" } },
            returnReason: "Ulasan selepas tempoh dikembalikan." },
          { department: "KEJURUTERAAN", status: "RECEIVED" },
        ],
      });
      expect((await app.inject({ url: appUrl + "/completion", headers: owner })).json()).not.toHaveProperty("consolidation");
      expect((await app.inject({ url: root + "/completion/queue", headers: planning })).json().cases[0]).not.toHaveProperty("consolidation");
      expect((await app.inject({ url: completion, headers: spt })).statusCode).toBe(404);
      const eventWhere = { target:id, action:"SYNTHETIC_PORTAL_COMPLETION" };
      const originalEvents = await db.auditLog.findMany({where:eventWhere,select:{id:true}});
      const keep = originalEvents.map(({id})=>id);
      const baseVersion=4+phaseOffset;
      expect(keep).toHaveLength(baseVersion);
      const timestamp = Date.now();
      const extraEvent = (version: number) => {
        const returned = (version-baseVersion) % 2 === 1;
        const subject = kit.accounts.find(({label}) => label === (returned ? "urus-setia" : "pic-spu"))!;
        return {
          ...eventWhere, actorId:subject.id, activeRole:subject.role,
          metadata: {
            version, timestamp, firstPaid:false, feeSen:1234,
            command: returned
              ? {action:"RETURN_PAPER",reason:"Pembetulan sejarah sintetik"}
              : {action:"SUBMIT_PAPER",summary:"Pindaan sejarah sintetik"},
          },
        };
      };
      try {
        await db.auditLog.createMany({data:Array.from({length:499-baseVersion},(_,i)=>extraEvent(i+baseVersion+1))});
        const read = () => app.inject({url:completion,headers:pic});
        expect((await read()).json().version).toBe(499);
        expect((await command(council,499-phaseOffset,"RETURN_PAPER",{reason:"Versi ke-500"})).statusCode).toBe(200);
        expect((await read()).json().version).toBe(500);
        expect((await command(pic,500-phaseOffset,"SUBMIT_PAPER",{summary:"Versi ke-501"})).statusCode).toBe(409);
        expect(await db.auditLog.count({where:eventWhere})).toBe(500);
        await db.auditLog.create({data:extraEvent(501)});
        expect((await read()).statusCode).toBe(409);
      } finally {
        await db.auditLog.deleteMany({where:{...eventWhere,id:{notIn:keep}}});
      }
      expect((await command(pic,4,"RETURN_PAPER",{reason:"Pinda ringkasan latihan."})).statusCode).toBe(404);
      expect((await command(council,4,"RETURN_PAPER",{reason:"Pinda ringkasan latihan."})).statusCode).toBe(200);
      expect((await command(council,4,"RETURN_PAPER",{reason:"Revisi lapuk."})).statusCode).toBe(409);
      expect((await command(pic,5,"SUBMIT_PAPER",{summary:"Kertas Pertimbangan dipinda"})).statusCode).toBe(200);
      const papers = (await app.inject({url:completion,headers:pic})).json();
      expect(papers.technicalHistory.filter((event:{department:string}) => event.department==="PERANCANG_BANDAR")
        .map((event:{action:string})=>event.action)).toEqual(["SUBMITTED","RETURNED","SUBMITTED","RETURNED","SUBMITTED"]);
      expect(papers.papers[0].summary).toBe("Kertas Pertimbangan dipinda");
      expect(papers.returnedPapers[0]).toMatchObject({
        reason:"Pinda ringkasan latihan.",
        paper:{summary:"Kertas Pertimbangan latihan",submittedVersion:4+phaseOffset},
      });
      const exerciseSkb = process.env.STAYLINK_SKB_MAIL_FIXTURE === "true";
      const skbDate = new Date(Date.now() + 24 * 3_600_000).toISOString().slice(0,10);
      const outcomes = scopes.map(
        (
          { unitId, floorId }: { unitId: string; floorId: string },
          i: number,
        ) => ({
          unitId,
          floorId,
          outcome: i ? "TANGGUH" : exerciseSkb ? "SKB" : "SK",
          ...(!i && exerciseSkb ? { conditionUntil: skbDate } : {}),
          reason: "Keputusan mesyuarat latihan",
        }),
      );
      expect(
        (await command(signer, 6, "DECIDE", { decisions: outcomes }))
          .statusCode,
      ).toBe(403);
      expect(
        (await command(council, 6, "DECIDE", { decisions: outcomes }))
          .statusCode,
      ).toBe(200);
      expect((await command(signer, 7, "SIGN")).statusCode).toBe(200);
      if (exerciseSkb) {
        const outbox = await db.trainingReminderOutbox.findFirstOrThrow({
          where:{draftId:draft,kind:"CASE_SKB_EXPIRY"},
        });
        const midnightMyt = Date.parse(skbDate+"T16:00:00.000Z");
        expect(outbox.availableAt.getTime()).toBe(midnightMyt);
        const { default: nodemailer } = await import("nodemailer");
        const transport = nodemailer.createTransport({
          host:"127.0.0.1",port:1025,secure:false,ignoreTLS:true,
        });
        const messageId = `<staylink-training-${outbox.id}@example.test>`;
        const sent: string[] = [];
        const send: Parameters<typeof deliverTrainingReminders>[0] = async (mail) => {
          if (mail.messageId !== messageId) return;
          await transport.sendMail({from:"STAYLink LATIHAN <noreply@example.test>",...mail});
          sent.push(mail.messageId);
        };
        vi.useFakeTimers({toFake:["Date"]});
        try {
          vi.setSystemTime(midnightMyt-1);
          await deliverTrainingReminders(send);
          expect(await db.trainingReminderOutbox.findUnique({where:{id:outbox.id}}))
            .toMatchObject({status:"PENDING",attempts:0});
          vi.setSystemTime(midnightMyt);
          await Promise.all([deliverTrainingReminders(send),deliverTrainingReminders(send)]);
          vi.setSystemTime(midnightMyt+1);
          await deliverTrainingReminders(send);
          expect(sent).toEqual([messageId]);
          const messages = await fetch("http://127.0.0.1:8025/api/v1/messages");
          expect(messages.status).toBe(200);
          expect((await messages.json() as { messages: { MessageID?:string }[] }).messages
            .filter(({MessageID})=>MessageID?.includes(outbox.id))).toHaveLength(1);
          expect(await db.trainingReminderOutbox.findUnique({where:{id:outbox.id}}))
            .toMatchObject({status:"SENT",attempts:1});
        } finally {
          vi.useRealTimers();
          transport.close();
        }
      }
      const first = await app.inject({
        url: appUrl + "/completion/letters/1",
        headers: owner,
      });
      expect(first.statusCode).toBe(200);
      expect(first.headers["cache-control"]).toContain("no-store");
      expect(first.body).toMatch(/LATIHAN[\s\S]+TANGGUH/);
      const pdfUrl = appUrl + "/completion/letters/1?format=pdf";
      const firstPdf = await app.inject({url:pdfUrl, headers:owner});
      expect(firstPdf.statusCode).toBe(200);
      expect(firstPdf.headers["content-type"]).toContain("application/pdf");
      expect(firstPdf.headers["x-staylink-letter-template"]).toBe("SYNTHETIC-DECISION-LETTER-v2");
      expect(firstPdf.headers["content-digest"]).toBe(
        `sha-256=:${createHash("sha256").update(firstPdf.rawPayload).digest("base64")}:`,
      );
      expect(firstPdf.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
      expect((await app.inject({url:pdfUrl, headers:other})).statusCode).toBe(404);

      expect(
        (
          await app.inject({
            url: appUrl + "/completion/letters/1",
            headers: other,
          })
        ).statusCode,
      ).toBe(404);
      expect((await command(ppsk, 8, "CLOSE")).statusCode).toBe(409);
      expect(
        (
          await post(appUrl + "/completion", owner, {
            version: 8 + phaseOffset,
            command: {
              action: "RESPOND",
              note: "Bukti pindaan latihan tersedia",
            },
          })
        ).statusCode,
      ).toBe(200);
      expect((await command(pic, 9, "CHECK_RESPONSE")).statusCode).toBe(200);
      expect((await command(ppsk, 10, "ALLOW_RECONSIDERATION")).statusCode).toBe(
        200,
      );
      expect(
        (await command(pic, 11, "REREFER", { departments: ["KEJURUTERAAN"] }))
          .statusCode,
      ).toBe(200);
      expect(
        (
          await command(planning, 12, "COMMENT", {
            general: "Tidak dirujuk semula",
            details: [],
          })
        ).statusCode,
      ).toBe(409);
      expect((await command(engineering,12,"ACK_REFERRAL")).statusCode).toBe(200);
      phaseOffset++;
      expect(
        (
          await command(engineering, 12, "COMMENT", {
            general: "Semakan susulan selesai",
            details: [],
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await command(pic, 13, "SUBMIT_PAPER", {
            summary: "Kertas susulan latihan",
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await command(council, 14, "DECIDE", {
            decisions: (exerciseSkb ? outcomes : [outcomes[1]])
              .map(({unitId,floorId,reason}: {unitId:string;floorId:string;reason:string})=>({unitId,floorId,reason,outcome:"SK"})),
          })
        ).statusCode,
      ).toBe(200);
      expect((await command(signer, 15, "SIGN")).statusCode).toBe(200);
      expect((await app.inject({url:pdfUrl,headers:owner})).rawPayload).toEqual(firstPdf.rawPayload);
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
      const invoice = await command(ppsk, 16, "ISSUE_SECOND").then(
        (r) => r.json().invoice,
      );
      expect(invoice.amountSen).toBe(1234);
      expect((await command(ppsk, 17, "CLOSE")).statusCode).toBe(409);
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
      expect((await command(ppsk, 18, "CLOSE")).statusCode).toBe(200);
      expect(
        (
          await app.inject({ url: appUrl + "/completion", headers: owner })
        ).json().closed,
      ).toBe(true);
      await db.trainingReminderOutbox.updateMany({where:{draftId:draft,status:"PENDING",kind:{startsWith:"TECH_"}},data:{availableAt:new Date(0)}});
      const caseMail: string[] = [];
      await deliverTrainingReminders(async (mail)=>{ caseMail.push(mail.subject); });
      expect(caseMail.sort()).toEqual([
        "Keputusan dan surat latihan tersedia",
        ...(!exerciseSkb ? ["Keputusan dan surat latihan tersedia"] : []),
        "Permohonan latihan ditutup",
      ]);
      const outbox = await db.trainingReminderOutbox.findMany({
        where:{ draftId:draft, kind:{startsWith:"CASE_"} },
        select:{ kind:true, status:true, notifiedAt:true },
      });
      expect(outbox.filter(({status})=>status==="SENT").map(({kind})=>kind).sort())
        .toEqual(["CASE_CLOSED","CASE_LETTER","CASE_LETTER",...(exerciseSkb ? ["CASE_SKB_EXPIRY"] : [])]);
      await db.trainingReminderOutbox.updateMany({
        where:{draftId:draft,status:"PENDING",kind:{startsWith:"CASE_"}},
        data:{availableAt:new Date(0)},
      });
      await deliverTrainingReminders(async ()=>{ throw Error("Reminder is stale after closure or settlement."); });
      expect(await db.trainingReminderOutbox.count({
        where:{draftId:draft,status:"CANCELLED",kind:{in:["CASE_FIRST_PAYMENT","CASE_SECOND_PAYMENT","CASE_SKB_EXPIRY"]}},
      })).toBe(2);
      expect(await db.trainingReminderOutbox.count({where:{draftId:draft,status:"CANCELLED",kind:{startsWith:"TECH_"}}})).toBe(7);

      const ledgerPath=completion+"/financial-ledger";
      const financial=await app.inject({url:ledgerPath,headers:ppsk});
      expect(financial.statusCode).toBe(200);
      expect(financial.json().entries.map(({stage,event,amountSen}:{stage:number;event:string;amountSen:number})=>
        [stage,event,amountSen].join(":")).sort()).toEqual([
          "1:INVOICE:5000","1:RECEIPT:5000","2:INVOICE:1234","2:RECEIPT:1234",
      ]);
      expect((await app.inject({url:ledgerPath,headers:pic})).statusCode).toBe(404);
      expect((await app.inject({url:ledgerPath+"?format=csv",headers:ppsk})).body).toContain("2,RECEIPT,1234,");
      await expect(db.syntheticFinancialEntry.updateMany({where:{submissionId:id},data:{amountSen:9}})).rejects.toThrow();
      await expect(db.syntheticFinancialEntry.deleteMany({where:{submissionId:id}})).rejects.toThrow();

      const reconciliation = ledgerPath + "/reconciliation";
      const report = await app.inject({ url: reconciliation, headers: ppsk });
      expect(report.statusCode, report.body).toBe(200);
      expect(report.headers["cache-control"]).toContain("no-store");
      expect(report.json()).toEqual({
        source: { invoicedSen: 6234, settledSen: 6234, outstandingSen: 0 },
        ledger: { invoicedSen: 6234, settledSen: 6234, outstandingSen: 0 },
        missing: [], conflicts: [], added: 0,
      });
      expect((await app.inject({ url: reconciliation, headers: pic })).statusCode).toBe(404);
      expect((await app.inject({ url: reconciliation, headers: spt })).statusCode).toBe(404);
      const invalidHeaders = { ...ppsk, "x-csrf-token": "invalid" };
      expect((await post(reconciliation, invalidHeaders, { confirm: true })).statusCode).toBe(403);
      expect((await post(reconciliation, ppsk, { confirm: true })).json()).toMatchObject({ added: 0 });

      // Replay the exact historical event shapes on a synthetic fixture inside a transaction.
      // Rolling back must remove fixture rows and appended entries together.
      const legacyId = randomUUID();
      const legacyInvoice = randomUUID();
      const legacySecondInvoice = randomUUID();
      const invoiceEvents = await db.auditLog.findMany({
        where: { target: id, action: { in: [
          "SYNTHETIC_PORTAL_INVOICE_ISSUED", "SYNTHETIC_PORTAL_INVOICE_SETTLED",
          "SYNTHETIC_PORTAL_COMPLETION",
        ] } },
        select: { actorId: true, activeRole: true, action: true, metadata: true, createdAt: true },
      });
      const original = await db.syntheticSubmission.findUniqueOrThrow({ where: { id } });
      const rollback = Error("Rollback fixture ledger");
      await expect(db.$transaction(async (tx) => {
        await tx.syntheticSubmission.create({ data: {
          ...original, id: legacyId, key: legacyId, draftVersion: original.draftVersion + 100,
          previousId: null, snapshot: original.snapshot!,
        } });
        const oldRef = financial.json().entries.find((entry: { stage: number }) => entry.stage === 1).invoiceId;
        const appendHistory = async (reference: string) => {
          await tx.auditLog.createMany({ data: invoiceEvents.map((item) => {
            const stored = item.metadata as Record<string, string | number>;
            const metadata = item.action === "SYNTHETIC_PORTAL_INVOICE_ISSUED"
              ? { ...stored, id: reference, submissionId: legacyId }
              : item.action === "SYNTHETIC_PORTAL_INVOICE_SETTLED"
                ? { ...stored, invoiceId: reference, eventId: reference, providerReference: "SYNTHETIC-" + reference }
                : stored.invoiceId
                  ? { ...stored, invoiceId: legacySecondInvoice }
                  : stored;
            return { ...item, target: legacyId, metadata };
          }) });
        };
        const run = (apply: boolean) => reconcileSyntheticLedger(
          tx, legacyId, draft, [...new Set<string>(scopes.map((scope: { unitId: string }) => scope.unitId))], scopes, apply,
        );
        await appendHistory(oldRef);
        expect((await run(false)).conflicts).toEqual([
          { stage: 1, event: "INVOICE", reason: "REFERENCE_CONFLICT" },
          { stage: 1, event: "RECEIPT", reason: "REFERENCE_CONFLICT" },
        ]);
        await expect(run(true)).rejects.toThrow("Padanan bercanggah");
        expect(await tx.syntheticFinancialEntry.count({ where: { submissionId: legacyId } })).toBe(0);
        await tx.auditLog.deleteMany({ where: { target: legacyId } });
        await appendHistory(legacyInvoice);
        expect(await run(false)).toMatchObject({
          source: { settledSen: 6234 }, ledger: { settledSen: 0 },
          missing: [
            { stage: 1, event: "INVOICE" }, { stage: 1, event: "RECEIPT" },
            { stage: 2, event: "INVOICE" }, { stage: 2, event: "RECEIPT" },
          ],
          conflicts: [], added: 0,
        });
        expect(await run(true)).toMatchObject({ added: 4, ledger: { settledSen: 6234 } });
        expect(await run(true)).toMatchObject({ added: 0, missing: [] });
        throw rollback;
      })).rejects.toBe(rollback);
      expect(await db.syntheticFinancialEntry.count({ where: { submissionId: legacyId } })).toBe(0);
      expect(await db.auditLog.count({ where: { target: legacyId } })).toBe(0);

      const retentionPath = root + "/reports/archive?review=retention";
      const oldRetention = process.env.STAYLINK_SYNTHETIC_RETENTION_DAYS;
      expect((await app.inject({url:retentionPath,headers:ppsk})).statusCode).toBe(404);
      const closure = await db.auditLog.findFirstOrThrow({
        where:{target:id,action:"SYNTHETIC_PORTAL_COMPLETION",metadata:{path:["command","action"],equals:"CLOSE"}},
      });
      const archivedAt = new Date(Date.now() - 2 * 86_400_000);
      await db.auditLog.update({where:{id:closure.id},data:{createdAt:archivedAt}});
      process.env.STAYLINK_SYNTHETIC_RETENTION_DAYS = "1";
      try {
        const candidate = await app.inject({url:retentionPath,headers:ppsk});
        expect(candidate.statusCode,candidate.body).toBe(200);
        expect(candidate.json()).toMatchObject({retentionDays:1,items:[{
          id,eligibleAt:new Date(archivedAt.getTime()+86_400_000).toISOString(),
        }]});
        expect((await app.inject({url:retentionPath,headers:pic})).statusCode).toBe(404);
        expect((await app.inject({url:retentionPath,headers:spt})).statusCode).toBe(404);
        expect(await db.auditLog.count({where:{target:"SPU",action:"SYNTHETIC_RETENTION_REVIEW_ACCESSED"}})).toBe(1);
        const held = await post(completion+"/records",ppsk,{version:0,action:"PLACE_HOLD",reason:"Semak fail untuk retensi"});
        expect(held.statusCode,held.body).toBe(200);
        expect((await app.inject({url:retentionPath,headers:ppsk})).json().items).toEqual([]);
        const released = await post(completion+"/records",ppsk,{version:1,action:"RELEASE_HOLD",reason:"Selesai semakan fail"});
        expect(released.statusCode,released.body).toBe(200);
        expect((await app.inject({url:retentionPath,headers:ppsk})).json().items).toHaveLength(1);
      } finally {
        if (oldRetention === undefined) delete process.env.STAYLINK_SYNTHETIC_RETENTION_DAYS;
        else process.env.STAYLINK_SYNTHETIC_RETENTION_DAYS = oldRetention;
        await db.auditLog.update({where:{id:closure.id},data:{createdAt:closure.createdAt}});
      }

      const records=completion+"/records";
      expect((await post(records, spt, {version:0,action:"PLACE_HOLD",reason:"Semak fail latihan"})).statusCode).toBe(404);
      const hold=await post(records,ppsk,{version:2,action:"PLACE_HOLD",reason:"Semak fail latihan"});
      expect(hold.json()).toMatchObject({legalHold:true,disposalEnabled:false});
      expect((await post(records,ppsk,{version:0,action:"REQUEST_REOPEN",reason:"Permintaan lapuk"})).statusCode).toBe(409);
      const reopen=await post(records,ppsk,{version:3,action:"REQUEST_REOPEN",reason:"Rujukan permohonan latihan"});
      expect(reopen.json()).toMatchObject({legalHold:true,reopenRequested:true,reopenEnabled:false});
      expect((await app.inject({url:appUrl+"/completion",headers:owner})).json().closed).toBe(true);
      const archivePath = root + "/reports/archive";
      const archive = await app.inject({url:archivePath,headers:ppsk});
      expect(archive.statusCode,archive.body).toBe(200);
      expect(archive.json()).toMatchObject({district:"SPU",items:[{id}],nextPage:null});
      expect((await app.inject({url:archivePath,headers:owner})).statusCode).toBe(403);
      expect((await app.inject({url:archivePath+"?page=2",headers:ppsk})).json().items).toEqual([]);
      const aggregate = await app.inject({
        url: root + "/completion/queue",
        headers: ppsk,
      });
      const csvPath = root + "/completion/queue?format=csv&view=closed";
      const csv = await app.inject({url:csvPath,headers:ppsk});
      expect(csv.statusCode).toBe(200);
      expect(csv.headers["cache-control"]).toContain("no-store");
      expect(csv.headers["content-type"]).toContain("text/csv");
      expect(csv.body).toContain("SPU,closed,1,0,1,0");
      expect(csv.body).not.toContain(id);
      expect((await app.inject({url:csvPath,headers:spt})).statusCode).toBe(404);
      expect((await app.inject({url:csvPath,headers:planning})).statusCode).toBe(403);
      expect(aggregate.statusCode).toBe(200);
      expect(aggregate.json()).toEqual({
        cases: [],
        summary: { sampled: 1, overdue: 0, closed: 1, paymentPending: 0 },
      });
      expect(
        (await app.inject({ url: root + "/completion/queue", headers: spt }))
          .statusCode,
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
      expect(
        await db.auditLog.findFirst({
          where: { target: id, actorId: "SYNTHETIC_PROVIDER" },
          select: { activeRole: true },
        }),
      ).toEqual({ activeRole: null });
      expect(
        await db.auditLog.count({
          where: { target: id, action: "SYNTHETIC_PORTAL_COMPLETION" },
        }),
      ).toBe(19+phaseOffset);
      if (process.env.STAYLINK_RETENTION_VOLUME_FIXTURE === "true") {
        const original = await db.syntheticSubmission.findUniqueOrThrow({where:{id}});
        const snapshot = original.snapshot as Prisma.InputJsonObject;
        const history = await db.auditLog.findMany({
          where:{target:id,action:{in:["SYNTHETIC_PORTAL_COMPLETION",
            "SYNTHETIC_PORTAL_COMPLETE","SYNTHETIC_PORTAL_REGISTERED"]}},
          select:{action:true,actorId:true,activeRole:true,metadata:true,createdAt:true},
        });
        const now = Date.now();
        const fixtures = Array.from({length:120},(_,index)=>({
          key:randomUUID(), index, districtId:index>=100 ? "SPT" : "SPU",
          closedAt:new Date(now - (index>=90 && index<100 ? 1 : 2*86_400_000) - index*100),
        }));
        await db.syntheticSubmission.createMany({data:fixtures.map(({key,index,districtId})=>({
          ...original, id:key, key, previousId:null,draftVersion:original.draftVersion+100+index,
          snapshot:{...snapshot,districtId},
        }))});
        await db.auditLog.createMany({data:fixtures.flatMap(({key,index,closedAt})=>[
          ...history.map((event)=>({...event,target:key,
            createdAt:(event.metadata as {command?:{action:string}})?.command?.action==="CLOSE"
              ? closedAt : event.createdAt,
            metadata:event.metadata===null ? undefined : event.metadata as Prisma.InputJsonValue,
          })),
          ...((index<25 || (index>=30 && index<45)) ? [{
            target:key,action:"SYNTHETIC_ARCHIVE_CONTROL",
            metadata:{version:1,action:index<25 ? "PLACE_HOLD" : "REQUEST_REOPEN",reason:"Latihan retensi pukal"},
          }] : []),
        ])});
        const previousRetention = process.env.STAYLINK_SYNTHETIC_RETENTION_DAYS;
        process.env.STAYLINK_SYNTHETIC_RETENTION_DAYS="1";
        try {
          const expected = fixtures.filter(({index})=>(index>=25 && index<30)||(index>=45 && index<90)).map(({key})=>key);
          const found: string[] = [];
          let page: number | null = 1;
          while(page!==null) {
            expect(page).toBeLessThanOrEqual(3);
            const response = await app.inject({url:retentionPath+"&page="+page,headers:ppsk});
            expect(response.statusCode,response.body).toBe(200);
            const data: {items:{id:string}[];nextPage:number|null} = response.json();
            expect(data.items).toHaveLength(page===3 ? 10 : 20);
            found.push(...data.items.map(({id})=>id));
            page=data.nextPage;
          }
          expect(found).toEqual(expected);
          expect(new Set(found).size).toBe(50);
        } finally {
          if(previousRetention===undefined) delete process.env.STAYLINK_SYNTHETIC_RETENTION_DAYS;
          else process.env.STAYLINK_SYNTHETIC_RETENTION_DAYS=previousRetention;
        }
      }
    } finally {
      await app.close();
      flags.forEach((key,index)=>{
        if (originalFlags[index]===undefined) delete process.env[key];
        else process.env[key]=originalFlags[index];
      });
    }
  },
  90_000,
);

afterAll(async () => {
  if (kitFile) await db.$disconnect();
});
