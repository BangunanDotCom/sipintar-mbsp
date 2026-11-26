import { syntheticRecordOverlay, recordAction } from "./synthetic-record-overlay.js";
import { trainingRemindersEnabled } from "./training-reminders.js";
import { enqueueTechnicalReminders } from "./training-technical-reminders.js";
import { stateFor } from "./synthetic-completion-journal.js";
import { recordSyntheticFinancialEntry } from "./synthetic-financial-journal.js";
import { trainingLetterPdf, unicodeTrainingPdf, trainingPdfDigest, UnsupportedTrainingGlyph } from "./synthetic-letter-pdf.js";
import {
  completionEvent as eventName,
  completionProvider as provider,
  unicodeLetterTemplate,
} from "../../../packages/shared/src/synthetic-completion-contract.js";
import { completionSandbox } from "./synthetic-completion-gate.js";
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  applyCompletion,
  canActOnCompletion,
  completionCommand,
  completionRoles,
  type CompletionRole,
} from "../../../packages/shared/src/synthetic-completion.js";
import { applicant } from "./application-drafts.js";
import { authorize, fail, session } from "./auth.js";
import { db } from "./core.js";
import { authorizedDraft } from "./premise-floors.js";
import { firstPaymentSettled } from "./synthetic-portal-billing.js";
import {
  lockSyntheticReview,
  loadSyntheticReview,
  syntheticReviewOfficer,
} from "./synthetic-portal-review.js";
import {
  lockSyntheticApplicantSession,
  lockSyntheticPortalSession,
} from "./synthetic-portal-session.js";
import { requireSyntheticSnapshotAuthority } from "./synthetic-submissions.js";
import { verifyMockCallback } from "./synthetic-billing.js";

const uuid = z.uuid();
const identityMap = z.strictObject({
  PERANCANG_BANDAR: uuid,
  KEJURUTERAAN: uuid,
  URUS_SETIA_JK: uuid,
  PEGAWAI_PENANDATANGAN: uuid,
});
const edit = z.strictObject({
  version: z.number().int().nonnegative(),
  command: completionCommand,
});
const idParam = z.strictObject({ id: uuid });
const letterParam = z.strictObject({
  id: uuid,
  number: z.coerce.number().int().positive().max(500),
});
type Tx = Prisma.TransactionClient;
type Scope = { unitId: string; floorId: string };
type Case = {
  scopes: Scope[];
  unitLabel: Map<string, string>;
  floorLabel: Map<string, string>;
};

function inventory(
  snapshot: Awaited<ReturnType<typeof loadSyntheticReview>>["snapshot"],
): Case {
  return {
    scopes: snapshot.units.flatMap((u) =>
      u.floorIds.map((floorId) => ({ unitId: u.id, floorId })),
    ),
    unitLabel: new Map(snapshot.units.map((u) => [u.id, u.unitLabel])),
    floorLabel: new Map(snapshot.floors.map((f) => [f.id, f.floorLabel])),
  };
}


export function completionConfig(env = process.env) {
  if (
    env.STAYLINK_SYNTHETIC_COMPLETION !== "true" ||
    !["development", "test"].includes(env.NODE_ENV ?? "")
  )
    return null;
  let assignments: z.infer<typeof identityMap>;
  try {
    assignments = identityMap.parse(
      JSON.parse(env.STAYLINK_SYNTHETIC_COMPLETION_ASSIGNMENTS ?? ""),
    );
  } catch {
    throw Error("Konfigurasi empat pelantikan latihan berasingan diperlukan.");
  }
  const officerIds = [
    ...Object.values(assignments),
    env.STAYLINK_SYNTHETIC_PIC_ID,
    env.STAYLINK_SYNTHETIC_SUPERVISOR_ID,
  ];
  const district = z
    .enum(["SPU", "SPT", "SPS"])
    .parse(env.STAYLINK_SYNTHETIC_DISTRICT);
  if (
    officerIds.some((id) => !uuid.safeParse(id).success) ||
    new Set(officerIds).size !== officerIds.length
  )
    throw Error("Identiti latihan mesti berasingan.");
  const raw = env.STAYLINK_SYNTHETIC_SECOND_UNIT_FEE_SEN;
  if (raw !== undefined && !/^[1-9]\d{0,6}$/.test(raw))
    throw Error("Fi unit kedua latihan mesti integer sen yang sah.");
  const callbackKey = env.STAYLINK_SYNTHETIC_CALLBACK_KEY;
  if (!callbackKey || !/^[0-9a-f]{64}$/.test(callbackKey))
    throw Error("Kunci callback latihan diperlukan.");
  return {
    assignments,
    district,
    feeSen: raw === undefined ? null : Number(raw),
    secret: Buffer.from(callbackKey, "hex"),
  };
}

type Actor = { userId: string; role: CompletionRole };
type Config = NonNullable<ReturnType<typeof completionConfig>>;
type State = Awaited<ReturnType<typeof stateFor>>;

export async function syntheticCompletionRoutes(portal: FastifyInstance) {
  // Registered only by the PostgreSQL synthetic portal gate.
  if (!completionSandbox()) return;
  const config = completionConfig();
  if (!config) return;
  await portal.register(async (api) => registerCompletion(api, config));
}

function registerCompletion(api: FastifyInstance, config: Config) {
  const { assignments, district, feeSen, secret } = config;
  const bktEnabled = process.env.STAYLINK_SYNTHETIC_BKT === "true";
  const recordsEnabled = process.env.STAYLINK_SYNTHETIC_RECORDS === "true";
  async function assigned(req: FastifyRequest) {
    const officer = await authorize(req, "profile");
    const role = z.enum(completionRoles).safeParse(officer.activeRole);
    if (
      !role.success ||
      officer.userId !== assignments[role.data] ||
      !officer.assignments.some((item) => item.districtId === district)
    )
      fail(404, "Tiada pelantikan latihan dalam skop ini.");
    return { officer, role: role.data };
  }

  async function lockedRow(tx: Tx, id: string, area?: string, forWrite = true) {
    if (forWrite && area) {
      await tx.$queryRaw`SELECT id FROM synthetic_submissions
        WHERE id = ${id} AND snapshot->>'districtId' = ${area} FOR UPDATE`;
    } else if (forWrite) {
      await tx.$queryRaw`SELECT id FROM synthetic_submissions WHERE id = ${id} FOR UPDATE`;
    }
    const row = await tx.syntheticSubmission.findFirst({
      where: {
        id,
        correction: null,
        ...(area && { snapshot: { path: ["districtId"], equals: area } }),
      },
    });
    if (!row) fail(404, "Serahan latihan tidak ditemui.");
    await requireSyntheticSnapshotAuthority(tx, row);
    const { snapshot, state } = await loadSyntheticReview(tx, row);
    if (state.status !== "REGISTERED")
      fail(404, "Serahan latihan belum tersedia.");
    return { ...inventory(snapshot), row };
  }

  async function assignedCase(tx: Tx, req: FastifyRequest, id: string) {
    const { officer, role } = await assigned(req);
    await lockSyntheticPortalSession(tx, officer, role, district);
    const record = await lockedRow(tx, id, district);
    if (record.row.actorId === officer.userId)
      fail(404, "Serahan latihan tidak ditemui.");
    return { record, actor: { userId: officer.userId, role } };
  }

  async function mutate(
    tx: Tx,
    id: string,
    state: State,
    scopes: Scope[],
    actor: Actor,
    command: z.infer<typeof completionCommand>,
  ) {
    if (!canActOnCompletion(actor.role, command.action))
      fail(403, "Peranan tidak dibenarkan untuk tindakan ini.");
    const timestamp = Date.now();
    const firstPaid =
      ["REFER", "RECEIVE_BKT"].includes(command.action) && (await firstPaymentSettled(tx, id));
    const invoiceId =
      command.action === "ISSUE_SECOND" ? randomUUID() : undefined;
    let result: ReturnType<typeof applyCompletion>;
    try {
      result = applyCompletion(state, command, {
        ...actor,
        actorId: actor.userId,
        scopes,
        now: timestamp,
        firstPaid,
        feeSen,
        invoiceId,
      });
    } catch (error) {
      fail(
        409,
        error instanceof Error ? error.message : "Peralihan latihan tidak sah.",
      );
    }
    if (result.changed) {
      if ((command.action === "ISSUE_SECOND" || command.action === "SETTLE_SECOND") && result.state.invoice) {
        const invoice = result.state.invoice;
        await recordSyntheticFinancialEntry(tx, {
          submissionId:id, invoiceId:invoice.id, stage:2,
          event:command.action === "ISSUE_SECOND" ? "INVOICE" : "RECEIPT",
          amountSen:invoice.amountSen,
        });
      }
      await tx.auditLog.create({
        data: {
          target: id,
          action: eventName,
          actorId: actor.userId,
          activeRole: actor.userId === provider ? null : actor.role,
          metadata: {
            version: result.state.version,
            timestamp,
            firstPaid,
            feeSen,
            ...(invoiceId && { invoiceId }),
            ...(command.action === "SIGN" && { letterTemplate: unicodeLetterTemplate }),
            command,
          } as Prisma.InputJsonValue,
        },
      });
    }
    return result.state;
  }

  function scopedView(state: State, record: Case, role: CompletionRole) {
    const scopes = record.scopes.map((item) => ({
      ...item,
      unitLabel: record.unitLabel.get(item.unitId),
      floorLabel: record.floorLabel.get(item.floorId),
    }));
    const stats = {
      version: state.version,
      closed: state.closed,
      scopes,
      letters: state.letters.map(({ number }) => number),
      invoice: state.invoice,
    };
    if (role === "PEMOHON" || role === "WAKIL_SYARIKAT") {
      return {
        ...stats,
        decisions: [
          ...new Map(
            state.letters.flatMap(({ decisions }) =>
              decisions.map(
                (item) => [item.unitId + "/" + item.floorId, item] as const,
              ),
            ),
          ).values(),
        ],
        responseSubmitted: Boolean(state.response),
      };
    }
    if (role === "PERANCANG_BANDAR" || role === "KEJURUTERAAN") {
      return {
        version: state.version,
        closed: state.closed,
        scopes,
        bktEnabled,
        technicalHistory: state.technicalHistory.filter((item)=>item.department===role),
        referral: state.referral && {
          deadline: state.referral.deadline,
          assigned: state.referral.departments.includes(role),
          comment: state.referral.comments[role] ?? null,
          acknowledged: state.referral.acknowledged.includes(role),
          acknowledgementRequired: Boolean(state.bkt),
        },
      };
    }
    return {
      ...stats,
      decisions: state.decisions,
      decisionSigned: state.decisionSigned,
      response: state.response,
      papers: state.papers,
      returnedPapers: state.returnedPapers,
      bktEnabled, bkt:state.bkt, technicalHistory:state.technicalHistory, recordsEnabled:recordsEnabled && role === "PPSK",
      referral: state.referral,
      overdue: Boolean(
        state.referral &&
        Date.now() >= state.referral.deadline &&
        state.referral.departments.some((d) => !state.referral?.comments[d]),
      ),
    };
  }

  api.get("/completion/queue", async (req, reply) => {
    const { format, view } = z.strictObject({
      format: z.enum(["json", "csv"]).default("json"),
      view: z.enum(["all", "open", "overdue", "closed"]).default("all"),
    }).parse(req.query);
    const initial = await session(req);
    const manager = ["PIC_KAWASAN", "PPSK"].includes(initial.activeRole ?? "")
      ? await syntheticReviewOfficer(req)
      : null;
    if (manager && manager.district !== district)
      fail(404, "Tiada pelantikan latihan dalam skop ini.");
    const { officer, role } = manager
      ? { officer: manager.operator, role: manager.role }
      : await assigned(req);
    if (format === "csv" && !manager) fail(403, "Eksport latihan memerlukan PIC atau PPSK.");
    const result = await db.$transaction(
      async (tx) => {
        await lockSyntheticPortalSession(tx, officer, role, district);
        const rows = await tx.$queryRaw<
          { id: string }[]
        >`SELECT s.id FROM synthetic_submissions s
        WHERE s.snapshot->>'districtId' = ${district} AND s."actorId" <> ${officer.userId}
          AND NOT EXISTS (SELECT 1 FROM synthetic_submissions child WHERE child."previousId" = s.id)
          AND (
            EXISTS (SELECT 1 FROM audit_logs a WHERE a.target = s.id AND a.action = ${eventName} AND a.outcome = 'SUCCESS')
            OR (${bktEnabled && role === "URUS_SETIA_JK"} AND EXISTS (
              SELECT 1 FROM audit_logs a WHERE a.target = s.id AND a.outcome = 'SUCCESS'
                AND a.action = 'SYNTHETIC_PORTAL_INVOICE_SETTLED'
            ))
          )
        ORDER BY s."createdAt" DESC, s.id LIMIT 50`;
        const cases = [];
        const summary = {
          sampled: 0,
          overdue: 0,
          closed: 0,
          paymentPending: 0,
        };
        const now = Date.now();
        for (const { id } of rows) {
          try {
            const record = await lockedRow(tx, id, district, false);
            const state = await stateFor(tx, id, record.scopes);
            if (
              (role === "PERANCANG_BANDAR" || role === "KEJURUTERAAN") &&
              !state.referral?.departments.includes(role)
            )
              continue;
            const responsible =
              role === "PERANCANG_BANDAR" || role === "KEJURUTERAAN"
                ? [role]
                : (state.referral?.departments ?? []);
            const overdue = Boolean(
              !state.closed &&
              state.referral &&
              now >= state.referral.deadline &&
              responsible.some((department) => !state.referral?.comments[department]),
            );
            if ((view === "open" && state.closed) ||
                (view === "closed" && !state.closed) ||
                (view === "overdue" && !overdue)) continue;
            summary.sampled++;
            if (state.closed) summary.closed++;
            if (overdue) summary.overdue++;
            if (manager && state.invoice && !state.invoice.settled)
              summary.paymentPending++;
            if (!manager)
              cases.push({ id, ...scopedView(state, record, role) });
          } catch (error) {
            if (
              !(error instanceof Error) ||
              !("statusCode" in error) ||
              ![404, 409].includes(Number(error.statusCode))
            )
              throw error;
          }
        }
        return { cases, summary };
      },
      { isolationLevel: "RepeatableRead" },
    );
    if (format === "json") return result;
    const { sampled, overdue, closed, paymentPending } = result.summary;
    return reply
      .header("Content-Disposition", `attachment; filename="staylink-latihan-${district}-${view}.csv"`)
      .header("X-Content-Type-Options", "nosniff")
      .type("text/csv; charset=utf-8")
      .send("daerah,penapis,kes,lewat,tutup,bayaran_tertunda\r\n" +
        [district, view, sampled, overdue, closed, paymentPending].join(",") + "\r\n");
  });

  api.get("/completion/:id", async (req) => {
    const { id } = idParam.parse(req.params);
    const officer = await syntheticReviewOfficer(req);
    if (officer.district !== district)
      fail(404, "Tiada pelantikan latihan dalam skop ini.");
    return db.$transaction(
      async (tx) => {
        const { snapshot } = await lockSyntheticReview(tx, id, officer, {
          forWrite: false,
        });
        const record = inventory(snapshot);
        return scopedView(
          await stateFor(tx, id, record.scopes),
          record,
          officer.role,
        );
      },
      { isolationLevel: "RepeatableRead" },
    );
  });

  api.get("/completion/:id/financial-ledger", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { format } = z.strictObject({ format:z.enum(["json","csv"]).default("json") }).parse(req.query);
    const officer = await syntheticReviewOfficer(req);
    if (officer.role !== "PPSK" || officer.district !== district)
      fail(404, "Lejar latihan tidak tersedia.");
    const entries = await db.$transaction(async (tx) => {
      await lockSyntheticReview(tx, id, officer, { forWrite:false });
      return tx.syntheticFinancialEntry.findMany({
        where:{submissionId:id},orderBy:[{stage:"asc"},{createdAt:"asc"},{id:"asc"}],
        select:{stage:true,event:true,invoiceId:true,amountSen:true,createdAt:true},
      });
    }, {isolationLevel:"RepeatableRead"});
    if (format === "json") return {entries};
    return reply.header("Content-Disposition", 'attachment; filename="staylink-lejar-latihan.csv"')
      .type("text/csv; charset=utf-8")
      .send(["peringkat,acara,nilai_sen,waktu_utc",
        ...entries.map(({stage,event,amountSen,createdAt})=>[stage,event,amountSen,createdAt.toISOString()].join(",")),
        ""].join("\r\n"));
  });

  async function recordsOfficer(req:FastifyRequest) {
    if (!recordsEnabled) fail(404, "Daftar rekod latihan tidak tersedia.");
    const officer = await syntheticReviewOfficer(req);
    if (officer.role !== "PPSK" || officer.district !== district)
      fail(404, "Daftar rekod latihan tidak tersedia.");
    return officer;
  }
  async function closedRecord(tx:Tx, id:string, officer:Awaited<ReturnType<typeof recordsOfficer>>, forWrite:boolean) {
    const {snapshot} = await lockSyntheticReview(tx,id,officer,{forWrite});
    const {scopes} = inventory(snapshot);
    if (!(await stateFor(tx,id,scopes)).closed)
      fail(409, "Daftar rekod hanya tersedia selepas penutupan latihan.");
    return syntheticRecordOverlay(tx,id);
  }
  api.get("/completion/:id/records", async (req) => {
    const officer = await recordsOfficer(req);
    const {id} = idParam.parse(req.params);
    return db.$transaction(async (tx) => {
      const overlay = await closedRecord(tx,id,officer,false);
      await tx.auditLog.create({data:{
        actorId:officer.operator.userId,activeRole:officer.role,
        action:"SYNTHETIC_ARCHIVE_ACCESSED",target:id,
      }});
      return overlay;
    },{isolationLevel:"RepeatableRead"});
  });
  api.post("/completion/:id/records", {bodyLimit:4096}, async (req) => {
    const officer = await recordsOfficer(req);
    const {id} = idParam.parse(req.params);
    const input = recordAction.parse(req.body);
    return db.$transaction(async (tx) => {
      const current = await closedRecord(tx,id,officer,true);
      if (input.version !== current.version || current.version >= 100)
        fail(409, "Versi daftar rekod latihan tidak tersedia.");
      if ((input.action === "PLACE_HOLD" && current.legalHold) ||
          (input.action === "RELEASE_HOLD" && !current.legalHold) ||
          (input.action === "REQUEST_REOPEN" && current.reopenRequested))
        fail(409, "Tindakan rekod telah direkodkan atau tidak sah.");
      await tx.auditLog.create({data:{
        actorId:officer.operator.userId,activeRole:officer.role,target:id,
        action:"SYNTHETIC_ARCHIVE_CONTROL",metadata:{...input,version:current.version+1},
      }});
      return syntheticRecordOverlay(tx,id);
    });
  });

  api.post("/completion/:id", { bodyLimit: 390_000 }, async (req) => {
    const { id } = idParam.parse(req.params);
    const input = edit.parse(req.body);
    const managing = !["COMMENT", "DECIDE", "SIGN", "RETURN_PAPER", "RECEIVE_BKT", "ACK_REFERRAL"].includes(
      input.command.action,
    );
    const manager = managing ? await syntheticReviewOfficer(req) : null;
    if (!bktEnabled && ["RECEIVE_BKT","ACK_REFERRAL","RETURN_COMMENT"].includes(input.command.action))
      fail(404, "Aliran BKT latihan tidak diaktifkan.");
    if (manager && manager.district !== district)
      fail(404, "Tiada pelantikan latihan dalam skop ini.");
    return db.$transaction(async (tx) => {
      const { record, actor } = manager
        ? await (async () => {
            const { snapshot, state } = await lockSyntheticReview(
              tx,
              id,
              manager,
            );
            if (state.status !== "REGISTERED")
              fail(409, "Daftar serahan latihan dahulu.");
            return {
              record: inventory(snapshot),
              actor: { userId: manager.operator.userId, role: manager.role },
            };
          })()
        : await assignedCase(tx, req, id);
      const state = await stateFor(tx, id, record.scopes);
      if (bktEnabled && input.command.action === "REFER" && !state.bkt)
        fail(409, "Rekod penerimaan BKT latihan dahulu.");
      if (state.version !== input.version)
        fail(409, "Versi aliran latihan sudah berubah.");
      const next = await mutate(
        tx,
        id,
        state,
        record.scopes,
        actor,
        input.command,
      );
      const command = input.command;
      if (command.action === "REFER" || command.action === "REREFER") {
        const referred = next.referral?.departments ?? [];
        if (next.referral && trainingRemindersEnabled()) {
          await enqueueTechnicalReminders(tx,id,district,next.referral,assignments,process.env.STAYLINK_SYNTHETIC_SUPERVISOR_ID);
        }

        await tx.notification.createMany({
          data: referred.map((department) => ({
            userId: assignments[department],
            type: "SYNTHETIC_REVIEW",
            title: "Rujukan teknikal LATIHAN STAYLink",
            message:
              "Tugasan latihan baharu tersedia dalam dashboard. Tempoh ulasan tujuh hari kalendar.",
          })),
        });
      }
      if (
        input.command.action === "SIGN" ||
        input.command.action === "CLOSE" ||
        (input.command.action === "COMMENT" && state.referral?.paperSubmitted)
      ) {
        const row = await tx.syntheticSubmission.findUniqueOrThrow({
          where: { id },
          select: { actorId: true },
        });
        const late = input.command.action === "COMMENT";
        await tx.notification.create({
          data: {
            userId: late ? assignments.URUS_SETIA_JK : row.actorId,
            type: "SYNTHETIC_REVIEW",
            title: "Makluman LATIHAN STAYLink",
            message: late
              ? "Ulasan teknikal susulan telah diterima selepas KP diserah."
              : input.command.action === "SIGN"
                ? "Surat keputusan latihan tersedia dalam portal."
                : "Permohonan latihan ditutup.",
          },
        });
      }
      return scopedView(next, record, actor.role);
    });
  });

  async function applicantRecord(tx: Tx, draftId: string, actorId: string) {
    await authorizedDraft(tx, actorId, draftId);
    const latest = await tx.syntheticSubmission.findFirst({
      where: { draftId, correction: null },
      select: { id: true },
    });
    if (!latest) fail(404, "Tiada rujukan latihan.");
    return lockedRow(tx, latest.id);
  }

  api.get("/drafts/:id/completion", async (req) => {
    const { id } = idParam.parse(req.params);
    const operator = await applicant(req);
    return db.$transaction(async (tx) => {
      const record = await applicantRecord(tx, id, operator.userId);
      return scopedView(
        await stateFor(tx, record.row.id, record.scopes),
        record,
        "PEMOHON",
      );
    });
  });
  api.post("/drafts/:id/completion", { bodyLimit: 4096 }, async (req) => {
    const { id } = idParam.parse(req.params);
    const input = edit.parse(req.body);
    if (input.command.action !== "RESPOND")
      fail(403, "Tindakan pemohon tidak sah.");
    const operator = await applicant(req);
    return db.$transaction(async (tx) => {
      const role = await lockSyntheticApplicantSession(tx, operator);
      const record = await applicantRecord(tx, id, operator.userId);
      const state = await stateFor(tx, record.row.id, record.scopes);
      if (state.version !== input.version)
        fail(409, "Versi aliran latihan sudah berubah.");
      return scopedView(
        await mutate(
          tx,
          record.row.id,
          state,
          record.scopes,
          {
            role,
            userId: operator.userId,
          },
          input.command,
        ),
        record,
        role,
      );
    });
  });
  api.get("/drafts/:id/completion/letters/:number", async (req, reply) => {
    const { id, number } = letterParam.parse(req.params);
    const operator = await applicant(req);
    const { format } = z.strictObject({ format: z.enum(["txt", "pdf"]).default("txt") }).parse(req.query);
    const { contents, signedAt, templateVersion } = await db.$transaction(async (tx) => {
      const record = await applicantRecord(tx, id, operator.userId);
      const state = await stateFor(tx, record.row.id, record.scopes);
      const letter = state.letters.find((item) => item.number === number);
      if (!letter) fail(404, "Surat latihan tidak ditemui.");
      const clean = (value: string | undefined) =>
        (value ?? "").replace(/[\r\n\t]/g, " ");
      return { signedAt: letter.signedAt, templateVersion: letter.templateVersion, contents: [
          "STAYLink MBSP — LATIHAN / TIADA KESAN RASMI",
          "Rujukan latihan: SYNTHETIC-" + record.row.draftId,
          number === 1
            ? "Surat keputusan induk"
            : "Surat susulan kepada surat induk versi 1",
          "Versi " + number + " · " + new Date(letter.signedAt).toISOString(),
          "Tandatangan disimulasikan.",
          "Unit | Tingkat | Keputusan | Sebab | Tarikh syarat | Tarikh susulan",
          ...letter.decisions.map((d) =>
            [
              record.unitLabel.get(d.unitId),
              record.floorLabel.get(d.floorId),
              d.outcome,
              d.reason,
              d.conditionUntil,
              d.followUpBy,
            ]
              .map(clean)
              .join(" | "),
          ),
          "Kapasiti pekerja: Mengikut jumlah kapasiti yang ditetapkan oleh JTK.",
        ].join("\n") + "\n" };
    });
    if (format === "pdf") {
      let bytes: Buffer;
      try {
        bytes = templateVersion === unicodeLetterTemplate
          ? await unicodeTrainingPdf(contents, signedAt, templateVersion)
          : await trainingLetterPdf(contents, signedAt);
      } catch (error) {
        if (error instanceof UnsupportedTrainingGlyph)
          fail(422, "Sebahagian aksara belum disokong oleh PDF latihan. Muat turun versi teks UTF-8.");
        throw error;
      }
      return reply
        .header("Content-Digest", trainingPdfDigest(bytes))
        .header("Content-Disposition", `attachment; filename="staylink-latihan-v${number}.pdf"`)
        .header("X-Content-Type-Options", "nosniff")
        .header("Content-Security-Policy", "sandbox")
        .header("X-Staylink-Letter-Template", templateVersion)
        .type("application/pdf")
        .send(bytes);
    }
    return reply
      .header(
        "Content-Disposition",
        `attachment; filename="staylink-latihan-v${number}.txt"`,
      )
      .type("text/plain; charset=utf-8")
      .send(contents);
  });
  api.post(
    "/callbacks/payment-second/:id",
    { bodyLimit: 8192 },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const { payload } = z
        .strictObject({ payload: z.string().max(4096) })
        .parse(req.body);
      const signature = req.headers["x-staylink-synthetic-signature"];
      if (typeof signature !== "string")
        fail(401, "Callback latihan tidak sah.");
      const verified = verifyMockCallback(payload, signature, secret);
      if (verified.status !== "VERIFIED")
        fail(401, "Callback latihan tidak sah.");
      return db.$transaction(async (tx) => {
        const record = await lockedRow(tx, id);
        const state = await stateFor(tx, id, record.scopes);
        const event = verified.event;
        if (
          !state.invoice ||
          event.invoiceId !== state.invoice.id ||
          event.eventId !== state.invoice.id ||
          event.providerReference !== `SYNTHETIC-${state.invoice.id}` ||
          event.amountSen !== state.invoice.amountSen
        )
          fail(409, "Padanan invois kedua tidak sah.");
        if (state.invoice.settled) return { result: "REPLAY" };
        await mutate(
          tx,
          id,
          state,
          record.scopes,
          {
            userId: provider,
            role: "PPSK",
          },
          { action: "SETTLE_SECOND" },
        );
        return { result: "SETTLED" };
      });
    },
  );
}
