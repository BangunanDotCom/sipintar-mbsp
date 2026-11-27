import type { Prisma, TrainingReminderOutbox } from "@prisma/client";
import { z } from "zod";
import type { CompletionState } from "../../../packages/shared/src/synthetic-completion.js";
import { fail } from "./auth.js";
import { stateFor } from "./synthetic-completion-journal.js";
import { completionSandbox } from "./synthetic-completion-gate.js";
import { legacyFirstPayment } from "./synthetic-portal-billing.js";
import { loadSyntheticReview } from "./synthetic-portal-review.js";
import { requireSyntheticSnapshotAuthority } from "./synthetic-submissions.js";

const subjects = {
  CASE_CORRECTION: "Pembetulan permohonan latihan diperlukan",
  CASE_FIRST_PAYMENT: "Invois pertama latihan belum diselesaikan",
  CASE_SECOND_PAYMENT: "Invois kedua latihan belum diselesaikan",
  CASE_LETTER: "Keputusan dan surat latihan tersedia",
  CASE_SKB_EXPIRY: "Tempoh SKB latihan telah tamat",
  CASE_CLOSED: "Permohonan latihan ditutup",
} as const;
type Kind = keyof typeof subjects;
type Tx = Prisma.TransactionClient;
const base = z.strictObject({ submissionId: z.uuid() });
const reference = base.extend({ reference: z.uuid() });
const letter = base.extend({ number: z.number().int().positive() });
const expiry = base.extend({ date: z.iso.date() });
// A date remains valid through the end of its Malaysia calendar day.
const expiryInstant = (date: string) => Date.parse(date + "T16:00:00.000Z");

export function caseReminderCopy(kind: string) {
  if (!Object.hasOwn(subjects, kind)) return null;
  return {
    subject: subjects[kind as Kind],
    text: "Log masuk ke portal STAYLink MBSP latihan untuk menyemak status semasa.",
  };
}

export async function enqueueCaseReminder(
  tx: Tx,
  submissionId: string,
  kind: Kind,
  options: {
    key?: string;
    context?: { reference: string } | { number: number } | { date: string };
    availableAt?: Date;
    portalAlreadyNotified?: boolean;
  } = {},
) {
  const submission = await tx.syntheticSubmission.findUniqueOrThrow({
    where: { id: submissionId },
    select: { draftId: true, draftVersion: true, actorId: true },
  });
  await tx.trainingReminderOutbox.createMany({
    data: {
      draftId: submission.draftId,
      draftVersion: submission.draftVersion,
      recipientId: submission.actorId,
      source: "SCHEDULE",
      kind,
      context: { submissionId, ...options.context },
      dedupeKey: `${kind}:${submissionId}:${options.key ?? "once"}`,
      availableAt: options.availableAt,
      notifiedAt: options.portalAlreadyNotified ? new Date() : null,
    },
    skipDuplicates: true,
  });
}

export async function enqueueCompletionReminders(
  tx: Tx,
  id: string,
  action: string,
  state: CompletionState,
  now: number,
) {
  if (action === "CLOSE")
    await enqueueCaseReminder(tx, id, "CASE_CLOSED", {
      portalAlreadyNotified: true,
    });
  if (action === "ISSUE_SECOND" && state.invoice) {
    await enqueueCaseReminder(tx, id, "CASE_SECOND_PAYMENT", {
      context: { reference: state.invoice.id },
      availableAt: new Date(now + 86_400_000),
    });
  }
  if (action === "SIGN") {
    const issued = state.letters.at(-1);
    if (!issued) fail(409, "Surat latihan tidak tersedia.");
    await enqueueCaseReminder(tx, id, "CASE_LETTER", {
      key: String(issued.number),
      context: { number: issued.number },
      portalAlreadyNotified: true,
    });
    const dates = new Set(
      issued.decisions.flatMap((decision) =>
        decision.outcome === "SKB" && decision.conditionUntil
          ? [decision.conditionUntil]
          : [],
      ),
    );
    for (const date of dates)
      await enqueueCaseReminder(tx, id, "CASE_SKB_EXPIRY", {
        key: date,
        context: { date },
        availableAt: new Date(expiryInstant(date)),
      });
  }
}

export async function eligibleCaseRecipient(
  tx: Tx,
  row: TrainingReminderOutbox,
) {
  const context = z.object(base.shape).safeParse(row.context);
  if (!context.success) return null;
  const { submissionId } = context.data;
  // Match the applicant mutation lock order. Use the current case and account
  // before checking authority and before materializing a portal notification.
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${row.recipientId} FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM synthetic_submissions WHERE id = ${submissionId} FOR SHARE`;
  const submission = await tx.syntheticSubmission.findFirst({
    where: {
      id: submissionId,
      draftId: row.draftId,
      draftVersion: row.draftVersion,
      actorId: row.recipientId,
      correction: null,
      policyVersion: { startsWith: "SYNTHETIC-" },
    },
  });
  const user = await tx.user.findFirst({
    where: {
      id: row.recipientId,
      kind: "APPLICANT",
      status: "ACTIVE",
      emailVerified: true,
      identificationHash: { not: null },
    },
    select: { email: true },
  });
  if (!submission || !user?.email.toLowerCase().endsWith("@example.test"))
    return null;
  try {
    await requireSyntheticSnapshotAuthority(tx, submission);
    const { state: review, snapshot } = await loadSyntheticReview(
      tx,
      submission,
    );
    if (row.kind === "CASE_CORRECTION")
      return base.safeParse(row.context).success &&
        review.status === "CORRECTION_REQUESTED"
        ? user.email
        : null;
    if (review.status !== "REGISTERED") return null;

    if (row.kind === "CASE_FIRST_PAYMENT") {
      const expected = reference.safeParse(row.context);
      if (!expected.success) return null;
      const payment = await legacyFirstPayment(tx, submissionId);
      const invoice = payment.invoices[0];
      return invoice?.id === expected.data.reference &&
        !payment.settlements.length &&
        Date.now() >= invoice.expiresAt
        ? user.email
        : null;
    }
    if (!completionSandbox()) return null;
    const scopes = snapshot.units.flatMap(({ id, floorIds }) =>
      floorIds.map((floorId) => ({ unitId: id, floorId })),
    );
    const state = await stateFor(tx, submissionId, scopes);
    switch (row.kind) {
      case "CASE_CLOSED":
        return base.safeParse(row.context).success && state.closed
          ? user.email
          : null;
      case "CASE_LETTER": {
        const value = letter.safeParse(row.context);
        return value.success &&
          state.letters.some(({ number }) => number === value.data.number)
          ? user.email
          : null;
      }
      case "CASE_SECOND_PAYMENT": {
        const value = reference.safeParse(row.context);
        return value.success &&
          !state.closed &&
          state.invoice?.id === value.data.reference &&
          !state.invoice.settled &&
          row.availableAt <= new Date()
          ? user.email
          : null;
      }
      case "CASE_SKB_EXPIRY": {
        const value = expiry.safeParse(row.context);
        if (
          !value.success ||
          state.closed ||
          Date.now() < expiryInstant(value.data.date)
        )
          return null;
        const published = new Map(
          state.letters.flatMap(({ decisions }) =>
            decisions.map(
              (item) => [item.unitId + "/" + item.floorId, item] as const,
            ),
          ),
        );
        return [...published.values()].some(
          (item) =>
            item.outcome === "SKB" && item.conditionUntil === value.data.date,
        )
          ? user.email
          : null;
      }
      default:
        return null;
    }
  } catch (error) {
    if (
      error instanceof Error &&
      "statusCode" in error &&
      [403, 404, 409].includes(Number(error.statusCode))
    )
      return null;
    throw error;
  }
}
