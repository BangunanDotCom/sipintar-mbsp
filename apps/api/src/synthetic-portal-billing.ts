import { createHmac, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { applicant } from "./application-drafts.js";
import { requireSyntheticSnapshotAuthority } from "./synthetic-submissions.js";
import { fail } from "./auth.js";
import { db } from "./core.js";
import { authorizedDraft } from "./premise-floors.js";
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

async function ledgerFor(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<MockLedger> {
  const events = await tx.auditLog.findMany({
    where: {
      target: id,
      outcome: "SUCCESS",
      action: { in: [issued, settled] },
    },
    select: { action: true, metadata: true },
  });
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
  };
}

function invoiceView(ledger: MockLedger) {
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
        : Date.now() >= invoice.expiresAt
          ? "EXPIRED"
          : "ISSUED",
      providerReference: receipt?.providerReference ?? null,
    },
  };
}

async function storeReconciliation(
  tx: Prisma.TransactionClient,
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
    Date.now(),
  );
  if (result.status !== "REPLAY" && result.status !== "SETTLED")
    fail(409, "Padanan atau tempoh invois sintetik tidak sah.");
  if (result.status === "SETTLED") {
    const receipt = result.ledger.settlements[0];
    await tx.auditLog.create({
      data: {
        actorId,
        activeRole: actorId ? "PPSK" : null,
        action: settled,
        target: id,
        metadata: receipt,
      },
    });
  }
  return { ...invoiceView(result.ledger), result: result.status };
}

export async function syntheticBillingRoutes(
  portal: FastifyInstance,
  options: { ttlMinutes: number; policyVersion: string },
) {
  const configured = process.env.STAYLINK_SYNTHETIC_CALLBACK_KEY;
  if (!configured || !/^[a-f0-9]{64}$/.test(configured)) return;
  const secret = Buffer.from(configured, "hex");

  portal.get("/drafts/:id/billing", async (req) => {
    const { userId } = await applicant(req);
    const { id } = params.parse(req.params);
    return db.$transaction(
      async (tx) => {
        await authorizedDraft(tx, userId, id);
        const row = await tx.syntheticSubmission.findFirst({
          where: { draftId: id, correction: null },
          select: { id: true, snapshot: true, actorId: true },
        });
        if (row) await requireSyntheticSnapshotAuthority(tx, row);
        return row
          ? invoiceView(await ledgerFor(tx, row.id))
          : { invoice: null };
      },
      { isolationLevel: "RepeatableRead" },
    );
  });

  portal.get("/reviews/:id/billing", async (req) => {
    const officer = await syntheticReviewOfficer(req);
    const { id } = params.parse(req.params);
    return db.$transaction(async (tx) => {
      await lockSyntheticReview(tx, id, officer);
      return invoiceView(await ledgerFor(tx, id));
    });
  });

  portal.post("/reviews/:id/billing", { bodyLimit: 1024 }, async (req) => {
    const officer = await syntheticReviewOfficer(req);
    if (officer.role !== "PPSK")
      fail(403, "Tindakan kewangan latihan memerlukan PPSK.");
    const { id } = params.parse(req.params);
    const { action } = billingBody.parse(req.body);
    return db.$transaction(async (tx) => {
      const { state, snapshot } = await lockSyntheticReview(tx, id, officer);
      const ledger = await ledgerFor(tx, id);
      if (state.status !== "REGISTERED")
        fail(409, "Daftar keputusan sintetik dahulu.");
      if (action === "ISSUE") {
        if (!ledger.invoices.length)
          await requireCurrentSyntheticEvidence(
            tx,
            state.caseId,
            snapshot.evidence,
          );
        const now = Date.now();
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
          await tx.auditLog.create({
            data: {
              actorId: officer.operator.userId,
              activeRole: officer.role,
              action: issued,
              target: id,
              metadata: {
                ...output.invoice,
                policyVersion: options.policyVersion,
                unitIds: [...output.invoice.unitIds],
              },
            },
          });
        }
        return { ...invoiceView(output.ledger), result: output.status };
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
      return storeReconciliation(
        tx,
        id,
        ledger,
        payload,
        signature,
        secret,
        officer.operator.userId,
      );
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
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM synthetic_submissions WHERE id = ${id} FOR UPDATE`;
      const row = await tx.syntheticSubmission.findFirst({
        where: { id, correction: null },
      });
      if (!row) fail(404, "Serahan sintetik tidak ditemui.");
      await requireSyntheticSnapshotAuthority(tx, row);
      const { state } = await loadSyntheticReview(tx, row);
      if (state.status !== "REGISTERED")
        fail(409, "Keputusan sintetik belum didaftarkan.");
      return storeReconciliation(
        tx,
        id,
        await ledgerFor(tx, id),
        payload,
        signature,
        secret,
        null,
      );
    });
  });
}
