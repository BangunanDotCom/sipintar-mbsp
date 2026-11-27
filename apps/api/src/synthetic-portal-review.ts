import { enqueueCaseReminder } from "./training-case-reminders.js";
import type { ReminderInput } from "./oracle/training-reminders.js";
import type { FinancialJournal } from "./synthetic-financial-journal.js";
import {
  configuredPrecheckProvider,
  precheckResult,
  runSyntheticPrecheck,
} from "./synthetic-precheck.js";
import {
  isPersonalDemoDatabase,
  personalDistrictAssignments,
} from "./demo-host-config.mjs";
import { syntheticPortalDatabase } from "./synthetic-portal-gate.js";
import { floorFacilitySchema } from "../../../packages/shared/src/floor-summary.js";
import { Prisma, type SyntheticSubmission } from "@prisma/client";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { postgresAuth } from "./auth-repository.js";
import type { AuditEntry } from "./oracle/audit.js";
import { authorizedDraft } from "./premise-floors.js";
import { authorize, fail } from "./auth.js";
import { db } from "./core.js";
import {
  assertSnapshotAuthority,
  requireSyntheticSnapshotAuthority,
} from "./synthetic-submissions.js";
import { lockSyntheticPortalSession } from "./synthetic-portal-session.js";
import {
  applySyntheticReview,
  mockPrecheck,
  type SyntheticReviewState,
} from "../../../packages/shared/src/synthetic-review.js";

const district = z.enum(["SPU", "SPT", "SPS"]);
const uuid = z.uuid();
const role = z.enum(["PIC_KAWASAN", "PPSK"]);
const params = z.strictObject({ id: uuid });
const edit = z.strictObject({
  action: z.enum(["REQUEST_CORRECTION", "CONFIRM_COMPLETE", "REGISTER"]),
  version: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
});
const snapshotSchema = z.object({
  districtId: district,
  units: z
    .array(
      z.object({ id: uuid, unitLabel: z.string(), floorIds: z.array(uuid) }),
    )
    .min(1),
  floors: z
    .array(
      z.object({
        id: uuid,
        floorLabel: z.string(),
        rooms: z.number().int().nonnegative().optional(),
        beds: z.number().int().nonnegative().optional(),
        workers: z.number().int().nonnegative().optional(),
        facilities: z.unknown().optional(),
      }),
    )
    .min(1),
  evidence: z
    .array(
      z.object({
        id: uuid,
        version: z.number().int().positive(),
        category: z.string(),
        scope: z.enum(["DRAFT", "UNIT", "FLOOR"]),
        targetId: uuid,
        scanStatus: z.literal("CLEAN"),
        verificationStatus: z.enum(["VERIFIED", "UNVERIFIED"]),
      }),
    )
    .min(1),
});

export const correctionAction = "SYNTHETIC_PORTAL_CORRECTION_REQUESTED";
export const completeAction = "SYNTHETIC_PORTAL_COMPLETE";
export const registerAction = "SYNTHETIC_PORTAL_REGISTERED";
export const reviewActions = [correctionAction, completeAction, registerAction];

export async function syntheticReviewOfficer(
  req: FastifyRequest,
  auth = postgresAuth,
) {
  const operator = await authorize(req, "areas.read", auth);
  const assignedRole = role.safeParse(operator.activeRole);
  const personal =
    process.env.STAYLINK_DEMO_HOST === "true" &&
    isPersonalDemoDatabase(syntheticPortalDatabase());
  const allocation =
    personal && assignedRole.data === "PIC_KAWASAN"
      ? personalDistrictAssignments(process.env).find(
          ({ id }) => id === operator.userId,
        )
      : null;
  const pic = uuid.safeParse(
    allocation?.id ?? process.env.STAYLINK_SYNTHETIC_PIC_ID,
  );
  const supervisor = uuid.safeParse(
    process.env.STAYLINK_SYNTHETIC_SUPERVISOR_ID,
  );
  const area = district.safeParse(
    allocation?.district ?? process.env.STAYLINK_SYNTHETIC_DISTRICT,
  );
  if (
    !assignedRole.success ||
    !pic.success ||
    !supervisor.success ||
    !area.success ||
    pic.data === supervisor.data ||
    operator.user.kind !== "OFFICER" ||
    !operator.mfaVerified ||
    operator.userId !==
      (assignedRole.data === "PIC_KAWASAN" ? pic.data : supervisor.data) ||
    !operator.assignments.some((item) => item.districtId === area.data)
  )
    fail(404, "Tugasan semakan sintetik tidak tersedia.");
  return { operator, role: assignedRole.data, district: area.data };
}

export type ReviewOfficer = Awaited<ReturnType<typeof syntheticReviewOfficer>>;

export async function lockSyntheticOfficer(
  tx: Prisma.TransactionClient,
  officer: ReviewOfficer,
) {
  await lockSyntheticPortalSession(
    tx,
    officer.operator,
    officer.role,
    officer.district,
  );
}

export type Submission = {
  id: string;
  draftId: string;
  actorId: string;
  snapshot: Prisma.JsonValue;
};

type SnapshotEvidence = z.infer<typeof snapshotSchema>["evidence"][number];

function evidenceRows(tx: Prisma.TransactionClient, ids: string[]) {
  return tx.applicationDocument.findMany({
    where: {
      id: { in: ids },
      supersededAt: null,
      scanStatus: "CLEAN",
      storageKey: { startsWith: "issue31-fixture/" },
      verificationStatus: { in: ["UNVERIFIED", "VERIFIED"] },
    },
    select: {
      id: true,
      draftId: true,
      category: true,
      version: true,
      verificationStatus: true,
      scope: { select: { unitId: true, floorId: true } },
    },
  });
}

export type CurrentEvidence = Awaited<ReturnType<typeof evidenceRows>>[number];

function eligibleEvidence(
  draftId: string,
  expected: SnapshotEvidence[],
  current: Map<string, CurrentEvidence>,
) {
  return expected.filter((item) => {
    const doc = current.get(item.id);
    if (
      !doc ||
      doc.draftId !== draftId ||
      doc.category !== item.category ||
      doc.version !== item.version ||
      (item.verificationStatus === "VERIFIED" &&
        doc.verificationStatus !== "VERIFIED")
    )
      return false;
    const scope = doc.scope?.unitId
      ? "UNIT"
      : doc.scope?.floorId
        ? "FLOOR"
        : "DRAFT";
    const target = doc.scope?.unitId ?? doc.scope?.floorId ?? draftId;
    return item.scope === scope && item.targetId === target;
  });
}

export async function requireCurrentSyntheticEvidence(
  tx: SyntheticReviewTransaction,
  draftId: string,
  expected: SnapshotEvidence[],
) {
  await tx.lockEvidence(draftId);
  const rows = await tx.evidenceRows(expected.map(({ id }) => id));
  if (
    rows.length !== expected.length ||
    eligibleEvidence(
      draftId,
      expected,
      new Map(rows.map((row) => [row.id, row])),
    ).length !== expected.length
  )
    fail(409, "Bukti sintetik tidak lagi layak.");
}

function reviewEvents(tx: Prisma.TransactionClient, ids: string[]) {
  return tx.auditLog.findMany({
    where: {
      target: { in: ids },
      action: { in: reviewActions },
      outcome: "SUCCESS",
    },
    select: { target: true, action: true, actorId: true, metadata: true },
  });
}
export type ReviewEvent = Awaited<ReturnType<typeof reviewEvents>>[number];

export async function loadSyntheticReview(
  tx: Pick<SyntheticReviewTransaction, "reviewEvents">,
  row: Submission,
) {
  return assembleSyntheticReview(row, await tx.reviewEvents([row.id]));
}

function assembleSyntheticReview(row: Submission, events: ReviewEvent[]) {
  const snapshot = snapshotSchema.safeParse(row.snapshot);
  if (!snapshot.success) fail(409, "Snapshot semakan sintetik tidak lengkap.");
  const returned = events.find((item) => item.action === correctionAction);
  const completed = events.find((item) => item.action === completeAction);
  const registered = events.find((item) => item.action === registerAction);
  if (
    new Set(events.map((item) => item.action)).size !== events.length ||
    (returned && completed) ||
    (registered && (!completed || completed.actorId === registered.actorId))
  )
    fail(409, "Sejarah semakan sintetik tidak konsisten.");
  const version = 1 + events.length;
  const state: SyntheticReviewState = {
    caseId: row.draftId,
    submissionId: row.id,
    initiatorId: row.actorId,
    scopeId: snapshot.data.districtId,
    version,
    status: registered
      ? "REGISTERED"
      : completed
        ? "COMPLETE"
        : returned
          ? "CORRECTION_REQUESTED"
          : "SUBMITTED",
    officialReference: registered ? `SYNTHETIC-${row.draftId}` : null,
  };
  const reason = z.object({ reason: z.string() }).safeParse(returned?.metadata);
  return {
    state,
    snapshot: snapshot.data,
    completerId: completed?.actorId ?? null,
    correctionReason: reason.success ? reason.data.reason : null,
  };
}

export async function lockSyntheticReview(
  tx: SyntheticReviewTransaction,
  id: string,
  officer: ReviewOfficer,
  options: { forWrite: boolean } = { forWrite: true },
) {
  await tx.lockOfficer(officer);
  if (options.forWrite) await tx.lockSubmission(id, officer);
  const row = await tx.activeSubmission(id, officer);
  if (!row || row.actorId === officer.operator.userId)
    fail(404, "Tugasan sintetik tidak ditemui.");
  await tx.requireSnapshotAuthority(row);
  return {
    ...(await loadSyntheticReview(tx, row)),
    actorId: row.actorId,
    previousId: row.previousId,
    draftVersion: row.draftVersion,
    policyVersion: row.policyVersion,
  };
}

export const reviewPageSize = 20;
const reviewQuery = z.strictObject({
  view: z
    .enum([
      "all",
      "action",
      "submitted",
      "correction",
      "complete",
      "registered",
    ])
    .default("all"),
  search: z
    .string()
    .trim()
    .regex(/^(?:SYNTHETIC-)?[0-9a-f]{4}[0-9a-f-]{0,32}$/i)
    .optional(),
  cursor: z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/)
    .max(128)
    .optional(),
});
const cursorSchema = z.tuple([z.iso.datetime().max(32), uuid]);

export type ReviewQuery = z.infer<typeof reviewQuery>;

export function readCursor(input: string | undefined) {
  if (!input) return null;
  try {
    return cursorSchema.parse(
      JSON.parse(Buffer.from(input, "base64url").toString("utf8")),
    );
  } catch {
    fail(400, "Kedudukan halaman tidak sah. Buka halaman pertama.");
  }
}

async function findReviewPage(
  tx: Prisma.TransactionClient,
  officer: ReviewOfficer,
  input: ReviewQuery,
) {
  const cursor = readCursor(input.cursor);
  const range = cursor
    ? Prisma.sql`AND (s."createdAt", s.id) < (${cursor[0]}::timestamptz, ${cursor[1]}::text)`
    : Prisma.empty;
  const event = (kinds: string[]) => Prisma.sql`EXISTS (
    SELECT 1 FROM audit_logs a
    WHERE a.target = s.id AND a.outcome = 'SUCCESS' AND a.action IN (${Prisma.join(kinds)})
  )`;
  const submitted = Prisma.sql`AND NOT ${event(reviewActions)}`;
  const awaitingRegistration = Prisma.sql`AND ${event([completeAction])} AND NOT ${event([registerAction, correctionAction])}`;
  const filter = {
    all: Prisma.empty,
    action: officer.role === "PIC_KAWASAN" ? submitted : awaitingRegistration,
    submitted,
    correction: Prisma.sql`AND ${event([correctionAction])}`,
    complete: awaitingRegistration,
    registered: Prisma.sql`AND ${event([registerAction])}`,
  }[input.view];
  const search = input.search?.toLowerCase();
  const prefix = search?.replace(/^synthetic-/, "");
  const matches = !prefix
    ? Prisma.empty
    : search?.startsWith("synthetic-")
      ? Prisma.sql`AND s."draftId" LIKE ${prefix + "%"} AND ${event([registerAction])}`
      : Prisma.sql`AND s.id LIKE ${prefix + "%"}`;
  // Apply district, assignment context and live company eligibility before
  // the page limit. A revoked case cannot fill the page or leak a cursor.
  return tx.$queryRaw<(Submission & { cursorTime: string })[]>`
    SELECT s.id, s."draftId", s."actorId", s.snapshot,
      to_char(s."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorTime"
    FROM synthetic_submissions s
    WHERE s.snapshot->>'districtId' = ${officer.district}
      AND s."actorId" <> ${officer.operator.userId}
      AND NOT EXISTS (
        SELECT 1 FROM synthetic_submissions next
        WHERE next."draftId" = s."draftId" AND next."previousId" = s.id
      )
      AND (
        (s.snapshot->>'capacity' = 'INDIVIDUAL' AND s.snapshot->'companyId' = 'null'::jsonb)
        OR (s.snapshot->>'capacity' = 'COMPANY' AND EXISTS (
          SELECT 1 FROM company_representatives r
          JOIN companies company ON company.id = r."companyId"
          WHERE r."userId" = s."actorId" AND r."companyId" = s.snapshot->>'companyId'
            AND company.status = 'ACTIVE' AND r.status = 'VERIFIED'
            AND r."startsAt" <= now() AND (r."endsAt" IS NULL OR r."endsAt" > now())
        ))
      )
      ${range}
      ${filter}
      ${matches}
    ORDER BY s."createdAt" DESC, s.id DESC
    LIMIT ${reviewPageSize + 1}
  `;
}

function comparisonSummary(
  snapshot: z.infer<typeof snapshotSchema>,
  draftVersion: number,
  policyVersion: string,
) {
  return {
    draftVersion,
    policyVersion,
    floorCount: snapshot.floors.length,
    unitCount: snapshot.units.length,
    evidenceCount: snapshot.evidence.length,
    floors: snapshot.floors.map(
      ({ id, floorLabel, rooms, beds, workers, facilities }) => ({
        id,
        floorLabel,
        rooms,
        beds,
        workers,
        facilities: floorFacilitySchema.safeParse(facilities).data,
      }),
    ),
  };
}

function compareUnits(
  previous: z.infer<typeof snapshotSchema>["units"],
  current: z.infer<typeof snapshotSchema>["units"],
) {
  const before = new Map(previous.map((unit) => [unit.id, unit]));
  const after = new Map(current.map((unit) => [unit.id, unit]));
  return [...new Set([...before.keys(), ...after.keys()])].flatMap((id) => {
    const a = before.get(id),
      b = after.get(id);
    if (
      a &&
      b &&
      a.unitLabel === b.unitLabel &&
      [...a.floorIds].sort().join() === [...b.floorIds].sort().join()
    )
      return [];
    return [
      {
        id,
        before: a ? { label: a.unitLabel, floors: a.floorIds.length } : null,
        after: b ? { label: b.unitLabel, floors: b.floorIds.length } : null,
      },
    ];
  });
}

type NotificationData = {
  userId: string;
  title: string;
  type: string;
  message: string;
};
type LedgerEvent = {
  action: string;
  metadata: Prisma.JsonValue;
  createdAt: Date;
};

export interface SyntheticReviewTransaction {
  databaseNow(): Promise<Date>;
  enqueueReminders(entries: ReminderInput[]): Promise<void>;
  lockOfficer(officer: ReviewOfficer): Promise<void>;
  lockEvidence(draftId: string): Promise<void>;
  evidenceRows(ids: string[]): Promise<CurrentEvidence[]>;
  reviewEvents(ids: string[]): Promise<ReviewEvent[]>;
  reviewPage(
    officer: ReviewOfficer,
    input: ReviewQuery,
  ): Promise<(Submission & { cursorTime: string })[]>;
  requireSnapshotAuthority(
    row: Pick<Submission, "snapshot" | "actorId">,
  ): ReturnType<typeof assertSnapshotAuthority>;
  lockSubmission(id: string, officer?: ReviewOfficer): Promise<void>;
  activeSubmission(
    id: string,
    officer?: ReviewOfficer,
  ): Promise<SyntheticSubmission | null>;
  previousSubmission(
    id: string,
    draftId: string,
    officer: ReviewOfficer,
  ): Promise<SyntheticSubmission | null>;
  applicantSubmission(
    draftId: string,
    userId: string,
  ): Promise<Pick<Submission, "id" | "snapshot" | "actorId"> | null>;
  ledgerEvents(id: string, actions: readonly string[]): Promise<LedgerEvent[]>;
  audit(entry: AuditEntry): Promise<void>;
  financial: FinancialJournal;
  auditHistory(
    id: string,
    action: string,
    take: number,
  ): Promise<{ id: string; createdAt: Date; metadata: Prisma.JsonValue }[]>;
  notify(entry: NotificationData): Promise<void>;
}

export interface SyntheticReviewRepository {
  transaction<T>(
    operation: (tx: SyntheticReviewTransaction) => Promise<T>,
    consistentRead?: boolean,
  ): Promise<T>;
}

export function postgresSyntheticReviewTransaction(
  tx: Prisma.TransactionClient,
): SyntheticReviewTransaction {
  return {
    async databaseNow() {
      const [row] = await tx.$queryRaw<
        { now: Date }[]
      >`SELECT clock_timestamp() AS now`;
      return row.now;
    },
    async enqueueReminders(entries) {
      await tx.trainingReminderOutbox.createMany({
        data: entries,
        skipDuplicates: true,
      });
    },
    lockOfficer: (officer) => lockSyntheticOfficer(tx, officer),
    async lockEvidence(draftId) {
      await tx.$queryRaw`SELECT id FROM application_documents WHERE "draftId" = ${draftId} FOR SHARE`;
      await tx.$queryRaw`SELECT "documentId" FROM draft_document_scopes WHERE "draftId" = ${draftId} FOR SHARE`;
    },
    async evidenceRows(ids) {
      return evidenceRows(tx, ids);
    },
    async reviewEvents(ids) {
      return reviewEvents(tx, ids);
    },
    reviewPage: (officer, input) => findReviewPage(tx, officer, input),
    requireSnapshotAuthority: (row) =>
      requireSyntheticSnapshotAuthority(tx, row),
    async lockSubmission(id, officer) {
      if (officer) {
        await tx.$queryRaw`SELECT id FROM synthetic_submissions WHERE id = ${id}
          AND snapshot->>'districtId' = ${officer.district} AND "actorId" <> ${officer.operator.userId} FOR UPDATE`;
      } else {
        await tx.$queryRaw`SELECT id FROM synthetic_submissions WHERE id = ${id} FOR UPDATE`;
      }
    },
    async activeSubmission(id, officer) {
      return tx.syntheticSubmission.findFirst({
        where: {
          id,
          correction: null,
          ...(officer && {
            snapshot: { path: ["districtId"], equals: officer.district },
            actorId: { not: officer.operator.userId },
          }),
        },
      });
    },
    async previousSubmission(id, draftId, officer) {
      return tx.syntheticSubmission.findFirst({
        where: {
          id,
          draftId,
          actorId: { not: officer.operator.userId },
          snapshot: { path: ["districtId"], equals: officer.district },
        },
      });
    },
    async applicantSubmission(draftId, userId) {
      await authorizedDraft(tx, userId, draftId);
      return tx.syntheticSubmission.findFirst({
        where: { draftId, correction: null },
        select: { id: true, snapshot: true, actorId: true },
      });
    },
    async ledgerEvents(id, actions) {
      return tx.auditLog.findMany({
        where: { target: id, outcome: "SUCCESS", action: { in: [...actions] } },
        select: { action: true, metadata: true, createdAt: true },
        take: 3,
      });
    },
    async audit(entry) {
      await tx.auditLog.create({
        data: {
          ...entry,
          metadata: entry.metadata as Prisma.InputJsonValue | undefined,
        },
      });
    },
    financial: {
      referencesElsewhere: (id, references) =>
        tx.syntheticFinancialEntry.findMany({
          where: { submissionId: { not: id }, OR: references },
          select: { invoiceId: true, event: true },
        }),
      entries: (submissionId) =>
        tx.syntheticFinancialEntry.findMany({
          where: { submissionId },
          orderBy: [{ stage: "asc" }, { createdAt: "asc" }, { id: "asc" }],
          select: {
            stage: true,
            event: true,
            invoiceId: true,
            amountSen: true,
            createdAt: true,
          },
        }),
      invoice: (submissionId, stage) =>
        tx.syntheticFinancialEntry.findUnique({
          where: {
            submissionId_stage_event: { submissionId, stage, event: "INVOICE" },
          },
          select: { invoiceId: true, amountSen: true },
        }),
      async append(data) {
        await tx.syntheticFinancialEntry.create({ data });
      },
    },
    auditHistory: (id, action, take) =>
      tx.auditLog.findMany({
        where: { target: id, action, outcome: "SUCCESS" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
        select: { id: true, createdAt: true, metadata: true },
      }),
    async notify(entry) {
      await tx.notification.create({ data: entry });
    },
  };
}

export const postgresSyntheticReviewRepository: SyntheticReviewRepository = {
  transaction(operation, consistentRead) {
    return db.$transaction(
      (tx) => operation(postgresSyntheticReviewTransaction(tx)),
      consistentRead ? { isolationLevel: "RepeatableRead" } : undefined,
    );
  },
};

export async function syntheticReviewRoutes(
  portal: FastifyInstance,
  repository = postgresSyntheticReviewRepository,
  auth = postgresAuth,
  remindersEnabled = false,
) {
  portal.get("/reviews", async (req) => {
    const officer = await syntheticReviewOfficer(req, auth);
    const input = reviewQuery.parse(req.query);
    return repository.transaction(async (tx) => {
      await tx.lockOfficer(officer);
      const rows = await tx.reviewPage(officer, input);
      const page = rows.slice(0, reviewPageSize);
      const last = page.at(-1);
      const nextCursor =
        last && rows.length > reviewPageSize
          ? Buffer.from(JSON.stringify([last.cursorTime, last.id])).toString(
              "base64url",
            )
          : null;
      const authorized: Submission[] = [];
      for (const row of page) {
        try {
          await tx.requireSnapshotAuthority(row);
          authorized.push(row);
        } catch (error) {
          if (
            !(error instanceof Error) ||
            !("statusCode" in error) ||
            (error.statusCode !== 404 && error.statusCode !== 409)
          )
            throw error;
        }
      }
      const events = await tx.reviewEvents(authorized.map(({ id }) => id));
      const grouped = new Map<string | null, ReviewEvent[]>();
      for (const event of events) {
        const group = grouped.get(event.target) ?? [];
        group.push(event);
        grouped.set(event.target, group);
      }
      const reviews = authorized.map((row) =>
        assembleSyntheticReview(row, grouped.get(row.id) ?? []),
      );
      const documents = await tx.evidenceRows([
        ...new Set(
          reviews.flatMap(({ snapshot }) =>
            snapshot.evidence.map(({ id }) => id),
          ),
        ),
      ]);
      const current = new Map(documents.map((doc) => [doc.id, doc]));
      return {
        role: officer.role,
        district: officer.district,
        nextCursor,
        reviews: reviews.map(({ state, snapshot, correctionReason }) => {
          const evidence = eligibleEvidence(
            state.caseId,
            snapshot.evidence,
            current,
          );
          return {
            id: state.submissionId,
            status: state.status,
            version: state.version,
            reference: state.officialReference,
            correctionReason,
            units: snapshot.units.map(({ unitLabel, floorIds }) => ({
              label: unitLabel,
              floorCount: floorIds.length,
            })),
            evidenceEligible: evidence.length === snapshot.evidence.length,
            evidence: evidence.map(({ category, version, scanStatus }) => ({
              category,
              version,
              scanStatus,
            })),
            advice: mockPrecheck({
              unitCount: snapshot.units.length,
              floorCount: snapshot.floors.length,
              evidenceCount: evidence.length,
            }),
          };
        }),
      };
    }, true);
  });

  portal.get("/reviews/:id/comparison", async (req) => {
    const officer = await syntheticReviewOfficer(req, auth);
    const { id } = params.parse(req.params);
    return repository.transaction(async (tx) => {
      const visible = await lockSyntheticReview(tx, id, officer, {
        forWrite: false,
      });
      const current = comparisonSummary(
        visible.snapshot,
        visible.draftVersion,
        visible.policyVersion,
      );
      if (!visible.previousId)
        return { current, previous: null, unitChanges: [], newEvidence: [] };
      const previousRow = await tx.previousSubmission(
        visible.previousId,
        visible.state.caseId,
        officer,
      );
      if (!previousRow)
        return { current, previous: null, unitChanges: [], newEvidence: [] };
      try {
        await tx.requireSnapshotAuthority(previousRow);
      } catch (error) {
        if (
          error instanceof Error &&
          "statusCode" in error &&
          [404, 409].includes(Number(error.statusCode))
        )
          return {
            current,
            previous: null,
            unitChanges: [],
            newEvidence: [],
          };
        throw error;
      }
      const prior = snapshotSchema.safeParse(previousRow.snapshot);
      if (!prior.success)
        fail(409, "Snapshot terdahulu tidak tersedia untuk perbandingan.");
      const evidenceIds = new Set(prior.data.evidence.map((item) => item.id));
      return {
        current,
        previous: comparisonSummary(
          prior.data,
          previousRow.draftVersion,
          previousRow.policyVersion,
        ),
        unitChanges: compareUnits(prior.data.units, visible.snapshot.units),
        newEvidence: visible.snapshot.evidence
          .filter((item) => !evidenceIds.has(item.id))
          .map(({ id, category, version }) => ({ id, category, version })),
      };
    }, true);
  });

  const precheckAction = "SYNTHETIC_PRECHECK_RECORDED";
  const recordedPrecheck = z.strictObject({
    version: z.number().int().positive(),
    result: precheckResult,
  });
  const precheckInput = z.discriminatedUnion("mode", [
    z.strictObject({
      mode: z.literal("AUTO"),
      version: z.number().int().positive(),
    }),
    z.strictObject({
      mode: z.literal("MANUAL"),
      version: z.number().int().positive(),
      reason: z.string().trim().min(3).max(500),
    }),
  ]);
  portal.get("/reviews/:id/precheck", async (req, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const officer = await syntheticReviewOfficer(req, auth);
    const { id } = params.parse(req.params);
    return repository.transaction(async (tx) => {
      await lockSyntheticReview(tx, id, officer, { forWrite: false });
      const rows = await tx.auditHistory(id, precheckAction, 20);
      return {
        history: rows.map(({ id, createdAt, metadata }) => ({
          id,
          createdAt,
          ...recordedPrecheck.parse(metadata),
        })),
      };
    }, true);
  });
  portal.post("/reviews/:id/precheck", { bodyLimit: 2048 }, async (req) => {
    const officer = await syntheticReviewOfficer(req, auth);
    if (officer.role !== "PIC_KAWASAN")
      fail(403, "Semakan awal memerlukan PIC.");
    const { id } = params.parse(req.params);
    const input = precheckInput.parse(req.body);
    return repository.transaction(async (tx) => {
      const { state, snapshot } = await lockSyntheticReview(tx, id, officer);
      if (state.status !== "SUBMITTED" || state.version !== input.version)
        fail(409, "Versi atau status semakan sudah berubah.");
      const rows = await tx.evidenceRows(snapshot.evidence.map(({ id }) => id));
      const current = new Map(rows.map((row) => [row.id, row]));
      const eligible = eligibleEvidence(
        state.caseId,
        snapshot.evidence,
        current,
      );
      const result =
        input.mode === "MANUAL"
          ? precheckResult.parse({
              source: "MANUAL",
              findings: [],
              reason: input.reason,
            })
          : await runSyntheticPrecheck(configuredPrecheckProvider(), {
              units: snapshot.units.length,
              floors: snapshot.floors.length,
              expectedEvidence: snapshot.evidence.length,
              cleanEvidence: eligible.length,
              unverifiedEvidence: eligible.filter(
                (d) => current.get(d.id)?.verificationStatus === "UNVERIFIED",
              ).length,
            });
      await tx.audit({
        target: id,
        actorId: officer.operator.userId,
        activeRole: officer.role,
        action: precheckAction,
        metadata: { version: state.version, result },
      });
      await tx.lockOfficer(officer);
      return result;
    });
  });

  portal.post("/reviews/:id", { bodyLimit: 4096 }, async (req) => {
    const officer = await syntheticReviewOfficer(req, auth);
    const { id } = params.parse(req.params);
    const input = edit.parse(req.body);
    return repository.transaction(async (tx) => {
      const { state, snapshot, completerId, actorId } =
        await lockSyntheticReview(tx, id, officer);
      if (
        input.action === "REGISTER" &&
        completerId === officer.operator.userId
      )
        fail(403, "Pendaftaran memerlukan penyelia berasingan.");
      const decision = applySyntheticReview(
        true,
        state,
        {
          id: officer.operator.userId,
          scopeId: officer.district,
          assignedCaseId: state.caseId,
          activeRole: officer.role,
          mfaVerified: officer.operator.mfaVerified,
          reviewGranted: true,
        },
        { ...input, submissionId: id },
        new Date(),
        "PPSK",
      );
      if (decision.status === "FORBIDDEN")
        fail(403, "Tindakan semakan tidak dibenarkan.");
      if (decision.status !== "APPLIED")
        fail(409, "Versi atau peralihan semakan tidak sah.");
      if (input.action !== "REQUEST_CORRECTION")
        await requireCurrentSyntheticEvidence(
          tx,
          state.caseId,
          snapshot.evidence,
        );
      await tx.audit({
        actorId: officer.operator.userId,
        activeRole: officer.role,
        target: id,
        action:
          input.action === "REGISTER"
            ? registerAction
            : input.action === "CONFIRM_COMPLETE"
              ? completeAction
              : correctionAction,
        metadata: decision.audit,
      });
      await tx.notify({
        userId: actorId,
        type: "SYNTHETIC_REVIEW",
        title: "Status permohonan latihan dikemas kini",
        message:
          input.action === "REQUEST_CORRECTION"
            ? "PIC meminta pembetulan. Buka draf latihan untuk melihat perkara yang perlu dibaiki."
            : input.action === "CONFIRM_COMPLETE"
              ? "PIC mengesahkan kelengkapan. Permohonan latihan menunggu PPSK."
              : "PPSK mendaftar permohonan latihan. Semak status dalam portal.",
      });
      if (input.action === "REQUEST_CORRECTION" && remindersEnabled)
        await enqueueCaseReminder(tx, id, "CASE_CORRECTION", {
          portalAlreadyNotified: true,
        });
      await tx.lockOfficer(officer);
      return {
        status: decision.next.status,
        version: decision.next.version,
        reference: decision.next.officialReference,
      };
    });
  });
}
