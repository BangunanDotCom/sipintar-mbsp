import type { TrainingReminderOutbox } from "@prisma/client";
import type { CompletionTransaction } from "./completion-repository.js";
import type { SyntheticReviewTransaction } from "./synthetic-portal-review.js";
import { z } from "zod";
import type { CompletionState } from "../../../packages/shared/src/synthetic-completion.js";
import { fail } from "./auth.js";
import { stateFor } from "./synthetic-completion-journal.js";
import { legacyFirstPayment } from "./synthetic-portal-billing.js";
import { loadSyntheticReview } from "./synthetic-portal-review.js";

const subjects = {
  CASE_CORRECTION: "Pembetulan permohonan latihan diperlukan",
  CASE_FIRST_PAYMENT: "Invois pertama latihan belum diselesaikan",
  CASE_SECOND_PAYMENT: "Invois kedua latihan belum diselesaikan",
  CASE_LETTER: "Keputusan dan surat latihan tersedia",
  CASE_SKB_EXPIRY: "Tempoh SKB latihan telah tamat",
  CASE_CLOSED: "Permohonan latihan ditutup",
} as const;
type Kind = keyof typeof subjects;
type Enqueue = Pick<
  SyntheticReviewTransaction,
  "activeSubmission" | "enqueueReminders" | "databaseNow"
>;
type Eligibility = Pick<
  CompletionTransaction,
  | "lockSubmission"
  | "activeSubmission"
  | "requireSnapshotAuthority"
  | "reviewEvents"
  | "ledgerEvents"
  | "events"
  | "databaseNow"
>;
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
  tx: Enqueue,
  submissionId: string,
  kind: Kind,
  options: {
    key?: string;
    context?: { reference: string } | { number: number } | { date: string };
    availableAt?: Date;
    portalAlreadyNotified?: boolean;
  } = {},
) {
  const submission = await tx.activeSubmission(submissionId);
  if (!submission) fail(404, "Serahan latihan tidak ditemui.");
  await tx.enqueueReminders([
    {
      draftId: submission.draftId,
      draftVersion: submission.draftVersion,
      recipientId: submission.actorId,
      source: "SCHEDULE",
      kind,
      context: { submissionId, ...options.context },
      dedupeKey: `${kind}:${submissionId}:${options.key ?? "once"}`,
      availableAt: options.availableAt,
      notifiedAt: options.portalAlreadyNotified ? await tx.databaseNow() : null,
    },
  ]);
}

export async function enqueueCompletionReminders(
  tx: Enqueue,
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
  tx: Eligibility,
  row: Pick<
    TrainingReminderOutbox,
    | "context"
    | "draftId"
    | "draftVersion"
    | "recipientId"
    | "kind"
    | "availableAt"
  >,
  lockRecipient: (id: string) => Promise<string | null>,
  completionEnabled: boolean,
) {
  const context = z.object(base.shape).safeParse(row.context);
  if (!context.success) return null;
  const { submissionId } = context.data;
  // Match the applicant mutation lock order. Use the current case and account
  // before checking authority and before materializing a portal notification.
  const email = await lockRecipient(row.recipientId);
  await tx.lockSubmission(submissionId);
  const submission = await tx.activeSubmission(submissionId);
  if (
    !submission ||
    submission.draftId !== row.draftId ||
    submission.draftVersion !== row.draftVersion ||
    submission.actorId !== row.recipientId ||
    !submission.policyVersion.startsWith("SYNTHETIC-") ||
    !email?.toLowerCase().endsWith("@example.test")
  )
    return null;
  const now = await tx.databaseNow();
  try {
    await tx.requireSnapshotAuthority(submission);
    const { state: review, snapshot } = await loadSyntheticReview(
      tx,
      submission,
    );
    if (row.kind === "CASE_CORRECTION")
      return base.safeParse(row.context).success &&
        review.status === "CORRECTION_REQUESTED"
        ? email
        : null;
    if (review.status !== "REGISTERED") return null;

    if (row.kind === "CASE_FIRST_PAYMENT") {
      const expected = reference.safeParse(row.context);
      if (!expected.success) return null;
      const payment = await legacyFirstPayment(tx, submissionId);
      const invoice = payment.invoices[0];
      return invoice?.id === expected.data.reference &&
        !payment.settlements.length &&
        now.getTime() >= invoice.expiresAt
        ? email
        : null;
    }
    if (!completionEnabled) return null;
    const scopes = snapshot.units.flatMap(({ id, floorIds }) =>
      floorIds.map((floorId) => ({ unitId: id, floorId })),
    );
    const state = await stateFor(tx, submissionId, scopes);
    switch (row.kind) {
      case "CASE_CLOSED":
        return base.safeParse(row.context).success && state.closed
          ? email
          : null;
      case "CASE_LETTER": {
        const value = letter.safeParse(row.context);
        return value.success &&
          state.letters.some(({ number }) => number === value.data.number)
          ? email
          : null;
      }
      case "CASE_SECOND_PAYMENT": {
        const value = reference.safeParse(row.context);
        return value.success &&
          !state.closed &&
          state.invoice?.id === value.data.reference &&
          !state.invoice.settled &&
          row.availableAt <= now
          ? email
          : null;
      }
      case "CASE_SKB_EXPIRY": {
        const value = expiry.safeParse(row.context);
        if (
          !value.success ||
          state.closed ||
          now.getTime() < expiryInstant(value.data.date)
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
          ? email
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
