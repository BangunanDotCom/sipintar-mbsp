import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { SyntheticReviewState } from "../../../packages/shared/src/synthetic-review.js";

const UNIT_FEE_SEN = 5000;
export const callbackSchema = z.strictObject({
  invoiceId: z.uuid(),
  eventId: z.uuid(),
  providerReference: z.string().regex(/^SYNTHETIC-[A-Za-z0-9-]{1,80}$/),
  currency: z.literal("MYR"),
  amountSen: z.number().int().positive(),
  outcome: z.literal("SETTLED"),
});
export const mockInvoiceSchema = z.strictObject({
  id: z.uuid(),
  caseId: z.string(),
  submissionId: z.string(),
  officialReference: z.string(),
  unitIds: z.array(z.uuid()).min(1),
  amountSen: z.number().int().positive(),
  currency: z.literal("MYR"),
  expiresAt: z.number().int().positive(),
});
type Invoice = Omit<z.infer<typeof mockInvoiceSchema>, "unitIds"> & {
  unitIds: readonly string[];
};
type Settlement = z.infer<typeof callbackSchema>;
export type MockLedger = {
  invoices: readonly Invoice[];
  settlements: readonly Settlement[];
};

// State and IDs are synthetic fixtures. This module has no provider client or callback route.
export function issueMockInvoice(
  enabled: boolean,
  ledger: MockLedger,
  review: SyntheticReviewState,
  verified: { submissionId: string; unitIds: readonly string[] },
  invoiceId: string,
  expiresAt: number,
  now: number,
) {
  if (enabled !== true) return { status: "DISABLED" as const };
  if (
    review.status !== "REGISTERED" ||
    review.officialReference !== `SYNTHETIC-${review.caseId}` ||
    review.submissionId !== verified.submissionId
  )
    return { status: "NOT_REGISTERED" as const };
  if (
    !verified.unitIds.length ||
    verified.unitIds.some((id) => !z.uuid().safeParse(id).success)
  )
    return { status: "INVALID_INVENTORY" as const };
  const unitIds = [
    ...new Set(verified.unitIds.map((id) => id.toLowerCase())),
  ].sort();
  const existing = ledger.invoices.find(
    (invoice) => invoice.caseId === review.caseId,
  );
  if (existing) {
    if (
      existing.submissionId !== verified.submissionId ||
      existing.unitIds.join() !== unitIds.join()
    )
      return { status: "SNAPSHOT_CONFLICT" as const };
    return { status: "REPLAY" as const, invoice: existing, ledger };
  }
  if (
    !z.uuid().safeParse(invoiceId).success ||
    ledger.invoices.some((invoice) => invoice.id === invoiceId) ||
    !Number.isSafeInteger(expiresAt) ||
    !Number.isSafeInteger(now) ||
    expiresAt <= now
  )
    return { status: "INVALID_INVOICE" as const };
  const invoice: Invoice = {
    id: invoiceId,
    caseId: review.caseId,
    submissionId: review.submissionId,
    officialReference: review.officialReference,
    unitIds,
    amountSen: unitIds.length * UNIT_FEE_SEN,
    currency: "MYR",
    expiresAt,
  };
  return {
    status: "ISSUED" as const,
    invoice,
    ledger: { ...ledger, invoices: [...ledger.invoices, invoice] },
  };
}

export function verifyMockCallback(
  payload: string,
  signature: string,
  secret: Buffer,
) {
  if (
    secret.length < 32 ||
    payload.length > 4096 ||
    !/^[a-f0-9]{64}$/.test(signature) ||
    !timingSafeEqual(
      Buffer.from(signature, "hex"),
      createHmac("sha256", secret).update(payload).digest(),
    )
  )
    return { status: "UNAUTHENTICATED" as const };
  let decoded: unknown;
  try {
    decoded = JSON.parse(payload);
  } catch {
    return { status: "INVALID_CALLBACK" as const };
  }
  const parsed = callbackSchema.safeParse(decoded);
  if (!parsed.success) return { status: "INVALID_CALLBACK" as const };
  return { status: "VERIFIED" as const, event: parsed.data };
}

export function reconcileMockCallback(
  enabled: boolean,
  ledger: MockLedger,
  payload: string,
  signature: string,
  secret: Buffer,
  now: number,
) {
  if (enabled !== true) return { status: "DISABLED" as const };
  const result = verifyMockCallback(payload, signature, secret);
  if (result.status !== "VERIFIED") return result;
  const { event } = result;
  const seen = ledger.settlements.find((row) => row.eventId === event.eventId);
  if (seen) {
    const matches =
      seen.invoiceId === event.invoiceId &&
      seen.amountSen === event.amountSen &&
      seen.currency === event.currency &&
      seen.outcome === event.outcome &&
      seen.providerReference === event.providerReference;
    return matches
      ? { status: "REPLAY" as const, ledger }
      : { status: "REFERENCE_CONFLICT" as const };
  }
  const invoice = ledger.invoices.find((row) => row.id === event.invoiceId);
  if (
    !invoice ||
    invoice.amountSen !== event.amountSen ||
    invoice.currency !== event.currency
  )
    return { status: "INVOICE_MISMATCH" as const };
  if (!Number.isSafeInteger(now) || now >= invoice.expiresAt)
    return { status: "EXPIRED" as const };
  if (
    ledger.settlements.some(
      (row) =>
        row.providerReference === event.providerReference ||
        row.invoiceId === invoice.id,
    )
  )
    return { status: "REFERENCE_CONFLICT" as const };
  return {
    status: "SETTLED" as const,
    ledger: { ...ledger, settlements: [...ledger.settlements, event] },
  };
}
