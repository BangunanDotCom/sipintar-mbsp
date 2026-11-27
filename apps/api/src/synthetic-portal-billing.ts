import { enqueueCaseReminder } from "./training-case-reminders.js";
import { recordSyntheticFinancialEntry } from "./synthetic-financial-journal.js";
import { createHmac, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { applicant } from "./application-drafts.js";
import { fail } from "./auth.js";
import { postgresAuth } from "./auth-repository.js";
import {
  callbackSchema,
  issueMockInvoice,
  mockInvoiceSchema,
  reconcileMockCallback,
  verifyMockCallback,
  type MockLedger,
} from "./synthetic-billing.js";
import {
  loadSyntheticReview,
  postgresSyntheticReviewRepository,
  type SyntheticReviewTransaction,
  lockSyntheticReview,
  requireCurrentSyntheticEvidence,
  syntheticReviewOfficer,
} from "./synthetic-portal-review.js";

const issued = "SYNTHETIC_PORTAL_INVOICE_ISSUED";
const settled = "SYNTHETIC_PORTAL_INVOICE_SETTLED";
const params = z.strictObject({ id: z.uuid() });
const billingBody = z.strictObject({
  action: z.enum(["ISSUE", "SIMULATE_SETTLEMENT"]),
});
const callbackBody = z.strictObject({ payload: z.string().max(4096) });
const minute = 60_000;

export async function legacyFirstPayment(
  tx: Pick<SyntheticReviewTransaction, "ledgerEvents">,
  id: string,
) {
  const events = await tx.ledgerEvents(id, [issued, settled]);
  const invoices = events
    .filter((row) => row.action === issued)
    .map((row) => mockInvoiceSchema.safeParse(row.metadata));
  const receipts = events
    .filter((row) => row.action === settled)
    .map((row) => callbackSchema.safeParse(row.metadata));
  if (
    invoices.length > 1 ||
    receipts.length > 1 ||
    invoices.some((item) => !item.success || item.data.submissionId !== id) ||
    receipts.some((item) => !item.success)
  )
    fail(409, "Sejarah lejar sintetik tidak konsisten.");
  const invoice = invoices[0]?.data;
  const receipt = receipts[0]?.data;
  if (
    receipt &&
    (!invoice ||
      receipt.invoiceId !== invoice.id ||
      receipt.eventId !== invoice.id ||
      receipt.amountSen !== invoice.amountSen ||
      receipt.providerReference !== `SYNTHETIC-${invoice.id}`)
  )
    fail(409, "Padanan lejar sintetik tidak konsisten.");
  return {
    invoices: invoice ? [invoice] : [],
    settlements: receipt ? [receipt] : [],
    issuedAt: events.find((event) => event.action === issued)?.createdAt,
    settledAt: events.find((event) => event.action === settled)?.createdAt,
  };
}

export async function firstPaymentSettled(
  tx: SyntheticReviewTransaction,
  id: string,
) {
  return (await legacyFirstPayment(tx, id)).settlements.length === 1;
}

function invoiceView(ledger: MockLedger, now: Date) {
  const invoice = ledger.invoices[0];
  if (!invoice) return { invoice: null };
  const receipt = ledger.settlements[0];
  return {
    invoice: {
      id: invoice.id,
      unitCount: invoice.unitIds.length,
      amountSen: invoice.amountSen,
      currency: invoice.currency,
      expiresAt: invoice.expiresAt,
      status: receipt
        ? "SETTLED"
        : now.getTime() >= invoice.expiresAt
          ? "EXPIRED"
          : "ISSUED",
      providerReference: receipt?.providerReference ?? null,
    },
  };
}

async function storeReconciliation(
  tx: SyntheticReviewTransaction,
  id: string,
  ledger: MockLedger,
  payload: string,
  signature: string,
  secret: Buffer,
  actorId: string | null,
) {
  const invoice = ledger.invoices[0];
  const verified = verifyMockCallback(payload, signature, secret);
  if (verified.status !== "VERIFIED") fail(401, "Callback sintetik tidak sah.");
  if (
    !invoice ||
    verified.event.eventId !== invoice.id ||
    verified.event.providerReference !== `SYNTHETIC-${invoice.id}`
  )
    fail(409, "Rujukan callback sintetik tidak sepadan.");
  const result = reconcileMockCallback(
    true,
    ledger,
    payload,
    signature,
    secret,
    (await tx.databaseNow()).getTime(),
  );
  if (result.status !== "REPLAY" && result.status !== "SETTLED")
    fail(409, "Padanan atau tempoh invois sintetik tidak sah.");
  if (result.status === "SETTLED") {
    const receipt = result.ledger.settlements[0];
    await recordSyntheticFinancialEntry(tx.financial, {
      submissionId: id,
      invoiceId: receipt.invoiceId,
      stage: 1,
      event: "RECEIPT",
      amountSen: receipt.amountSen,
    });
    await tx.audit({
      actorId,
      activeRole: actorId ? "PPSK" : null,
      action: settled,
      target: id,
      metadata: receipt,
    });
  }
  return {
    ...invoiceView(result.ledger, await tx.databaseNow()),
    result: result.status,
  };
}

export async function syntheticBillingRoutes(
  portal: FastifyInstance,
  options: { ttlMinutes: number; policyVersion: string },
  repository = postgresSyntheticReviewRepository,
  auth = postgresAuth,
  remindersEnabled = false,
) {
  const configured = process.env.STAYLINK_SYNTHETIC_CALLBACK_KEY;
  if (!configured || !/^[a-f0-9]{64}$/.test(configured)) return;
  const secret = Buffer.from(configured, "hex");

  portal.get("/drafts/:id/billing", async (req) => {
    const { userId } = await applicant(req, auth);
    const { id } = params.parse(req.params);
    return repository.transaction(async (tx) => {
      const row = await tx.applicantSubmission(id, userId);
      if (row) await tx.requireSnapshotAuthority(row);
      return row
        ? invoiceView(
            await legacyFirstPayment(tx, row.id),
            await tx.databaseNow(),
          )
        : { invoice: null };
    }, true);
  });

  portal.get("/reviews/:id/billing", async (req) => {
    const officer = await syntheticReviewOfficer(req, auth);
    const { id } = params.parse(req.params);
    return repository.transaction(async (tx) => {
      await lockSyntheticReview(tx, id, officer);
      return invoiceView(
        await legacyFirstPayment(tx, id),
        await tx.databaseNow(),
      );
    });
  });

  portal.post("/reviews/:id/billing", { bodyLimit: 1024 }, async (req) => {
    const officer = await syntheticReviewOfficer(req, auth);
    if (officer.role !== "PPSK")
      fail(403, "Tindakan kewangan latihan memerlukan PPSK.");
    const { id } = params.parse(req.params);
    const { action } = billingBody.parse(req.body);
    return repository.transaction(async (tx) => {
      const { state, snapshot } = await lockSyntheticReview(tx, id, officer);
      const ledger = await legacyFirstPayment(tx, id);
      if (state.status !== "REGISTERED")
        fail(409, "Daftar keputusan sintetik dahulu.");
      if (action === "ISSUE") {
        if (!ledger.invoices.length)
          await requireCurrentSyntheticEvidence(
            tx,
            state.caseId,
            snapshot.evidence,
          );
        const now = (await tx.databaseNow()).getTime();
        const output = issueMockInvoice(
          true,
          ledger,
          state,
          { submissionId: id, unitIds: snapshot.units.map((unit) => unit.id) },
          randomUUID(),
          now + options.ttlMinutes * minute,
          now,
        );
        if (output.status !== "ISSUED" && output.status !== "REPLAY")
          fail(409, "Invois sintetik tidak dapat dijana.");
        if (output.status === "ISSUED") {
          await recordSyntheticFinancialEntry(tx.financial, {
            submissionId: id,
            invoiceId: output.invoice.id,
            stage: 1,
            event: "INVOICE",
            amountSen: output.invoice.amountSen,
          });
          await tx.audit({
            actorId: officer.operator.userId,
            activeRole: officer.role,
            action: issued,
            target: id,
            metadata: {
              ...output.invoice,
              policyVersion: options.policyVersion,
              unitIds: [...output.invoice.unitIds],
            },
          });
        }
        if (output.status === "ISSUED" && remindersEnabled)
          await enqueueCaseReminder(tx, id, "CASE_FIRST_PAYMENT", {
            context: { reference: output.invoice.id },
            availableAt: new Date(output.invoice.expiresAt),
          });
        await tx.lockOfficer(officer);
        return {
          ...invoiceView(output.ledger, await tx.databaseNow()),
          result: output.status,
        };
      }
      const invoice = ledger.invoices[0];
      if (!invoice) fail(409, "Jana invois sintetik dahulu.");
      const payload = JSON.stringify({
        invoiceId: invoice.id,
        eventId: invoice.id,
        providerReference: `SYNTHETIC-${invoice.id}`,
        currency: invoice.currency,
        amountSen: invoice.amountSen,
        outcome: "SETTLED",
      });
      const signature = createHmac("sha256", secret)
        .update(payload)
        .digest("hex");
      const reconciled = await storeReconciliation(
        tx,
        id,
        ledger,
        payload,
        signature,
        secret,
        officer.operator.userId,
      );
      await tx.lockOfficer(officer);
      return reconciled;
    });
  });

  portal.post("/callbacks/payment/:id", { bodyLimit: 8192 }, async (req) => {
    const { id } = params.parse(req.params);
    const { payload } = callbackBody.parse(req.body);
    const signature = req.headers["x-staylink-synthetic-signature"];
    if (
      typeof signature !== "string" ||
      verifyMockCallback(payload, signature, secret).status !== "VERIFIED"
    )
      fail(401, "Callback sintetik tidak sah.");
    return repository.transaction(async (tx) => {
      await tx.lockSubmission(id);
      const row = await tx.activeSubmission(id);
      if (!row) fail(404, "Serahan sintetik tidak ditemui.");
      await tx.requireSnapshotAuthority(row);
      const { state } = await loadSyntheticReview(tx, row);
      if (state.status !== "REGISTERED")
        fail(409, "Keputusan sintetik belum didaftarkan.");
      return storeReconciliation(
        tx,
        id,
        await legacyFirstPayment(tx, id),
        payload,
        signature,
        secret,
        null,
      );
    });
  });
}
