import { lockTrainingOutboxCase } from "./training-outbox-locks.js";
import { requireSyntheticSnapshotAuthority } from "./synthetic-submissions.js";
import {
  caseReminderCopy,
  eligibleCaseRecipient,
} from "./training-case-reminders.js";
import { completionSandbox } from "./synthetic-completion-gate.js";
import { completionEvent } from "../../../packages/shared/src/synthetic-completion-contract.js";
import { eligibleTechnicalRecipient } from "./training-technical-reminders.js";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { postgresAuth, type AuthRepository } from "./auth-repository.js";
import { authorize, fail } from "./auth.js";
import { db } from "./core.js";
import { loadSyntheticOwnerPolicy } from "./synthetic-owner-policy.js";
import { syntheticPortalDatabase } from "./synthetic-portal-gate.js";
import {
  lockSyntheticOfficer,
  postgresSyntheticReviewTransaction,
  syntheticReviewOfficer,
} from "./synthetic-portal-review.js";
import { draftInactivityDays } from "../../../packages/shared/src/draft-inactivity.js";

const title = "Peringatan draf latihan STAYLink";
const message =
  "Draf latihan tiada aktiviti selama 60 hari. Log masuk untuk menyambung draf jika masih diperlukan.";
type Tx = Prisma.TransactionClient;
type StaleDraft = {
  id: string;
  version: number;
  initiatedByUserId: string;
  updatedAt: Date;
};

const eligibleDraft = Prisma.sql`
  d.status = 'DRAFT'
  AND d."updatedAt" <= CURRENT_TIMESTAMP - (${draftInactivityDays} * interval '1 day')
  AND p."districtId" IN ('SPU', 'SPT', 'SPS')
  AND u.kind = 'APPLICANT' AND u.status = 'ACTIVE' AND u."emailVerified"
  AND lower(u.email) LIKE '%@example.test'
  AND NOT EXISTS (SELECT 1 FROM synthetic_submissions s WHERE s."draftId" = d.id)
  AND (
    d.capacity = 'INDIVIDUAL' OR
    (d.capacity = 'COMPANY' AND EXISTS (
      SELECT 1 FROM company_representatives r JOIN companies c ON c.id = r."companyId"
      WHERE r."userId" = d."initiatedByUserId" AND c.id = d."companyId"
        AND c.status = 'ACTIVE' AND r.status <> 'REVOKED'
        AND r."startsAt" <= CURRENT_TIMESTAMP AND (r."endsAt" IS NULL OR r."endsAt" > CURRENT_TIMESTAMP)
    ))
  )
`;

function readEligible(tx: Tx, scope: Prisma.Sql, limit: number) {
  return tx.$queryRaw<StaleDraft[]>`
    SELECT d.id, d.version, d."initiatedByUserId", d."updatedAt"
    FROM application_drafts d
    JOIN application_premises p ON p."draftId" = d.id
    JOIN users u ON u.id = d."initiatedByUserId"
    WHERE ${eligibleDraft} AND ${scope}
    ORDER BY d."updatedAt", d.id LIMIT ${limit}
  `;
}

async function enqueue(
  tx: Tx,
  draft: StaleDraft,
  source: "SUPERVISOR" | "SCHEDULE",
  actorId?: string,
) {
  const result = await tx.trainingReminderOutbox.createMany({
    data: {
      id: randomUUID(),
      draftId: draft.id,
      draftVersion: draft.version,
      recipientId: draft.initiatedByUserId,
      dedupeKey: `draft:${draft.id}:${draft.version}`,
      source,
    },
    skipDuplicates: true,
  });
  if (!result.count) return false;
  await tx.notification.create({
    select: { id: true },
    data: {
      userId: draft.initiatedByUserId,
      type: "TRAINING_DRAFT_REMINDER",
      title,
      message,
    },
  });
  await tx.auditLog.create({
    data: {
      actorId,
      activeRole: actorId ? "PPSK" : null,
      target: draft.id,
      action: "SYNTHETIC_DRAFT_REMINDER_QUEUED",
      metadata: { version: draft.version, source },
    },
  });
  return true;
}

export function trainingRemindersEnabled() {
  return Boolean(
    syntheticPortalDatabase() &&
    process.env.STAYLINK_SYNTHETIC_REMINDERS === "true" &&
    loadSyntheticOwnerPolicy()?.config.review.enabled === true,
  );
}

export async function scheduleTrainingReminders(database = db) {
  if (!trainingRemindersEnabled())
    throw Error("Gerbang peringatan latihan tertutup.");
  return database.$transaction(async (tx) => {
    const candidates = await tx.$queryRaw<{ id: string }[]>`
      SELECT d.id FROM application_drafts d
      JOIN application_premises p ON p."draftId" = d.id
      JOIN users u ON u.id = d."initiatedByUserId"
      WHERE ${eligibleDraft} AND NOT EXISTS (
        SELECT 1 FROM training_reminder_outbox o WHERE o."draftId" = d.id AND o."draftVersion" = d.version AND o.kind = 'DRAFT_INACTIVE'
      )
      ORDER BY d."updatedAt", d.id LIMIT 25
    `;
    if (!candidates.length) return 0;
    const locked = await tx.$queryRaw<
      { id: string }[]
    >`SELECT public.staylink_lock_outbox_drafts(
      ARRAY[${Prisma.join(candidates.map(({ id }) => id))}]::text[]
    ) AS id`;
    const ids = locked.map(({ id }) => id);
    if (!ids.length) return 0;
    const due = await readEligible(
      tx,
      Prisma.sql`d.id IN (${Prisma.join(ids)})`,
      25,
    );
    let queued = 0;
    for (const draft of due) if (await enqueue(tx, draft, "SCHEDULE")) queued++;
    return queued;
  });
}

export function reminderCopy(kind: string) {
  switch (kind) {
    case "TECH_PRE_DUE":
      return {
        subject: "Rujukan latihan menghampiri SLA",
        text: "Semak rujukan teknikal latihan yang masih terbuka dalam dashboard.",
      };
    case "TECH_OVERDUE":
      return {
        subject: "Rujukan latihan melepasi SLA",
        text: "Rekod ulasan atau semak status tugasan dalam dashboard latihan.",
      };
    case "TECH_ESCALATE":
      return {
        subject: "Eskalasi rujukan latihan",
        text: "Semak rujukan teknikal yang masih menunggu ulasan dalam dashboard latihan.",
      };
    default:
      return { subject: title, text: message };
  }
}

export type TrainingMailSender = (email: {
  to: string;
  subject: string;
  text: string;
  messageId: string;
}) => Promise<void>;

export async function deliverTrainingReminders(
  send: TrainingMailSender,
  database = db,
) {
  if (!trainingRemindersEnabled())
    throw Error("Gerbang peringatan latihan tertutup.");
  const [{ now }] = await database.$queryRaw<
    { now: Date }[]
  >`SELECT clock_timestamp() AS now`;
  await database.trainingReminderOutbox.updateMany({
    where: { status: "SENDING", leaseUntil: { lte: now } },
    data: { status: "UNCERTAIN", leaseUntil: null, lastError: "LEASE_EXPIRED" },
  });
  const ready = await database.trainingReminderOutbox.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      attempts: { lt: 5 },
      availableAt: { lte: now },
    },
    select: { id: true },
    orderBy: [{ availableAt: "asc" }, { id: "asc" }],
    take: 25,
  });
  for (const { id } of ready) {
    const row = await database.$transaction(async (tx) => {
      const [{ claimTime }] = await tx.$queryRaw<
        { claimTime: Date }[]
      >`SELECT clock_timestamp() AS "claimTime"`;
      const leaseUntil = new Date(claimTime.getTime() + 60_000);
      const claimed = await tx.trainingReminderOutbox.updateMany({
        where: {
          id,
          status: { in: ["PENDING", "FAILED"] },
          attempts: { lt: 5 },
          availableAt: { lte: claimTime },
        },
        data: { status: "SENDING", leaseUntil, attempts: { increment: 1 } },
      });
      if (!claimed.count) return null;
      const row = await tx.trainingReminderOutbox.findUniqueOrThrow({
        where: { id },
      });
      const caseCopy = caseReminderCopy(row.kind);
      let email: string | null = null;
      if (row.kind === "DRAFT_INACTIVE") {
        const [draft] = await readEligible(
          tx,
          Prisma.sql`d.id = ${row.draftId} AND d.version = ${row.draftVersion}`,
          1,
        );
        if (draft?.initiatedByUserId === row.recipientId) {
          const account = await tx.user.findUnique({
            where: { id: row.recipientId },
            select: { email: true },
          });
          email = account?.email ?? null;
        }
      } else if (caseCopy) {
        email = await eligibleCaseRecipient(
          {
            ...postgresSyntheticReviewTransaction(tx),
            lockSubmission: (id) =>
              lockTrainingOutboxCase(tx, row.recipientId, null, id),
            requireSnapshotAuthority: (submission) =>
              requireSyntheticSnapshotAuthority(tx, submission, false),
            events: (id) =>
              tx.auditLog.findMany({
                where: {
                  target: id,
                  action: completionEvent,
                  outcome: "SUCCESS",
                },
                select: { actorId: true, activeRole: true, metadata: true },
                take: 501,
              }),
          },
          row,
          async (id) => {
            await lockTrainingOutboxCase(tx, id, null, null);
            const user = await tx.user.findFirst({
              where: {
                id,
                kind: "APPLICANT",
                status: "ACTIVE",
                emailVerified: true,
                identificationHash: { not: null },
              },
              select: { email: true },
            });
            return user?.email ?? null;
          },
          completionSandbox(),
        );
      } else {
        email = await eligibleTechnicalRecipient(tx, row);
      }
      if (!email?.toLowerCase().endsWith("@example.test")) {
        await tx.trainingReminderOutbox.update({
          where: { id },
          data: {
            status: "CANCELLED",
            leaseUntil: null,
            lastError: "SCOPE_CHANGED",
          },
        });
        return null;
      }
      const copy = caseCopy ?? reminderCopy(row.kind);
      if (row.kind !== "DRAFT_INACTIVE" && !row.notifiedAt) {
        await tx.notification.create({
          select: { id: true },
          data: {
            userId: row.recipientId,
            type: caseCopy
              ? "TRAINING_CASE_REMINDER"
              : "TRAINING_TECHNICAL_REMINDER",
            title: copy.subject,
            message: copy.text,
          },
        });
        await tx.trainingReminderOutbox.update({
          where: { id },
          data: { notifiedAt: new Date() },
        });
      }
      return { ...row, email, copy, leaseUntil };
    });
    if (!row) continue;
    const claim = { id, status: "SENDING", leaseUntil: row.leaseUntil };
    try {
      await send({
        to: row.email,
        ...row.copy,
        messageId: `<staylink-training-${id}@example.test>`,
      });
      await database.trainingReminderOutbox.updateMany({
        where: claim,
        data: {
          status: "SENT",
          leaseUntil: null,
          sentAt: new Date(),
          lastError: null,
        },
      });
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? error.code
          : null;
      // A broken connection after DATA can leave delivery uncertain. Only a
      // known connection refusal or explicit temporary SMTP rejection merits retry.
      const response =
        error && typeof error === "object" && "responseCode" in error
          ? error.responseCode
          : null;
      const retryable =
        code === "ECONNREFUSED" ||
        (typeof response === "number" && response >= 400 && response < 500);
      await database.trainingReminderOutbox.updateMany({
        where: claim,
        data: {
          status: retryable ? "FAILED" : "UNCERTAIN",
          leaseUntil: null,
          lastError: retryable ? "SMTP_TEMPORARY" : "SMTP_UNCERTAIN",
          availableAt: new Date(Date.now() + 60_000 * 2 ** (row.attempts - 1)),
        },
      });
    }
  }
}

export type TrainingReminderRepository = {
  list(
    officer: Awaited<ReturnType<typeof syntheticReviewOfficer>>,
  ): Promise<unknown>;
  remind(
    officer: Awaited<ReturnType<typeof syntheticReviewOfficer>>,
    id: string,
    version: number,
  ): Promise<{ queued: boolean }>;
  monitor(): Promise<unknown>;
};
export function oracleTrainingRemindersEnabled() {
  return (
    process.env.NODE_ENV === "test" &&
    process.env.STAYLINK_ORACLE_LAB_SYNTHETIC === "true" &&
    process.env.STAYLINK_DEMO_HOST !== "true" &&
    process.env.STAYLINK_SYNTHETIC_REMINDERS === "true" &&
    loadSyntheticOwnerPolicy()?.config.review.enabled === true
  );
}
async function supervisor(
  req: Parameters<typeof syntheticReviewOfficer>[0],
  auth: AuthRepository,
  enabled: () => boolean,
) {
  if (!enabled()) fail(404, "Pemantauan latihan tidak tersedia.");
  const officer = await syntheticReviewOfficer(req, auth);
  if (officer.role !== "PPSK") fail(403, "Pemantauan memerlukan PPSK.");
  return officer;
}

export async function trainingReminderRoutes(
  portal: FastifyInstance,
  auth: AuthRepository = postgresAuth,
  repository?: TrainingReminderRepository,
) {
  const enabled = repository
    ? oracleTrainingRemindersEnabled
    : trainingRemindersEnabled;
  portal.get("/inactive-drafts", async (req) => {
    const officer = await supervisor(req, auth, enabled);
    if (repository) return repository.list(officer);
    return db.$transaction(
      async (tx) => {
        await lockSyntheticOfficer(tx, officer);
        const rows = await readEligible(
          tx,
          Prisma.sql`p."districtId" = ${officer.district}`,
          50,
        );
        const reminders = await tx.trainingReminderOutbox.findMany({
          where: {
            kind: "DRAFT_INACTIVE",
            draftId: { in: rows.map(({ id }) => id) },
          },
          take: 200,
          orderBy: { createdAt: "desc" },
          select: {
            draftId: true,
            draftVersion: true,
            source: true,
            status: true,
            createdAt: true,
            attempts: true,
          },
        });
        return {
          district: officer.district,
          drafts: rows.map(({ id, version, updatedAt }) => ({
            id,
            version,
            updatedAt,
            reminders: reminders.filter((entry) => entry.draftId === id),
          })),
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  });
  portal.post(
    "/inactive-drafts/:id/remind",
    { bodyLimit: 1024 },
    async (req) => {
      const officer = await supervisor(req, auth, enabled);
      const { id } = z.object({ id: z.uuid() }).parse(req.params);
      const { version } = z
        .strictObject({ version: z.number().int().positive() })
        .parse(req.body);
      if (repository) return repository.remind(officer, id, version);
      return db.$transaction(async (tx) => {
        await lockSyntheticOfficer(tx, officer);
        await tx.$queryRaw`SELECT id FROM application_drafts WHERE id = ${id} FOR UPDATE`;
        const [draft] = await readEligible(
          tx,
          Prisma.sql`d.id = ${id} AND p."districtId" = ${officer.district}`,
          1,
        );
        if (!draft) fail(404, "Draf latihan tidak tersedia.");
        if (draft.version !== version) fail(409, "Versi draf telah berubah.");
        return {
          queued: await enqueue(
            tx,
            draft,
            "SUPERVISOR",
            officer.operator.userId,
          ),
        };
      });
    },
  );
  portal.get("/reminder-monitor", async (req) => {
    if (!enabled()) fail(404, "Pemantauan latihan tidak tersedia.");
    await authorize(req, "config.technical", auth);
    if (repository) return repository.monitor();
    const rows = await db.trainingReminderOutbox.groupBy({
      by: ["status"],
      _count: { _all: true },
      orderBy: { status: "asc" },
    });
    const recent = await db.auditLog.findMany({
      where: { action: "SYNTHETIC_REMINDER_RUN" },
      select: { createdAt: true, outcome: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    return {
      recent,
      counts: rows.map(({ status, _count }) => ({
        status,
        count: _count._all,
      })),
    };
  });
}
