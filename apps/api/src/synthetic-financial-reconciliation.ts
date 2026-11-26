import type { Prisma } from "@prisma/client";
import { MOCK_UNIT_FEE_SEN } from "./synthetic-owner-policy.js";
import { legacyFirstPayment } from "./synthetic-portal-billing.js";
import { replayCompletion } from "./synthetic-completion-journal.js";
import { fail } from "./auth.js";

type Entry = {
  stage: 1 | 2;
  event: "INVOICE" | "RECEIPT";
  invoiceId: string;
  amountSen: number;
  createdAt: Date;
};
type Slot = Pick<Entry, "stage" | "event">;
const key = (
  entry: Pick<Entry, "stage" | "event"> | { stage: number; event: string },
) => entry.stage + ":" + entry.event;

export async function reconcileSyntheticLedger(
  tx: Prisma.TransactionClient,
  submissionId: string,
  caseId: string,
  unitIds: readonly string[],
  scopes: { unitId: string; floorId: string }[],
  apply: boolean,
) {
  const first = await legacyFirstPayment(tx, submissionId);
  const second = await replayCompletion(tx, submissionId, scopes);
  const expected: Entry[] = [];
  const ids = new Set(unitIds);
  const [invoice] = first.invoices;
  if (invoice && first.issuedAt) {
    if (
      invoice.caseId !== caseId ||
      invoice.unitIds.length !== ids.size ||
      new Set(invoice.unitIds).size !== ids.size ||
      !invoice.unitIds.every((id) => ids.has(id)) ||
      invoice.amountSen !== ids.size * MOCK_UNIT_FEE_SEN
    )
      fail(409, "Invois asal tidak sepadan dengan unit fizikal serahan.");
    const primary = {
      stage: 1,
      event: "INVOICE",
      invoiceId: invoice.id,
      amountSen: invoice.amountSen,
      createdAt: first.issuedAt,
    } as const;
    expected.push(primary);
    if (first.settledAt)
      expected.push({
        ...primary,
        event: "RECEIPT",
        createdAt: first.settledAt,
      });
  }
  if (second.state.invoice && second.issuedAt) {
    const bill = second.state.invoice;
    const secondary = {
      stage: 2,
      event: "INVOICE",
      invoiceId: bill.id,
      amountSen: bill.amountSen,
      createdAt: second.issuedAt,
    } as const;
    expected.push(secondary);
    if (second.settledAt) {
      if (second.settledAt < second.issuedAt)
        fail(409, "Urutan waktu bayaran kedua tidak sah.");
      expected.push({
        ...secondary,
        event: "RECEIPT",
        createdAt: second.settledAt,
      });
    }
  }
  if (
    expected.some(
      ({ amountSen }) =>
        !Number.isSafeInteger(amountSen) ||
        amountSen <= 0 ||
        amountSen > 2147483647,
    )
  )
    fail(409, "Amaun jurnal asal di luar had integer sen.");

  const entries = await tx.syntheticFinancialEntry.findMany({
    where: { submissionId },
    orderBy: [{ stage: "asc" }, { event: "asc" }],
    select: {
      stage: true,
      event: true,
      invoiceId: true,
      amountSen: true,
      createdAt: true,
    },
  });
  const actualSlots = new Map(entries.map((entry) => [key(entry), entry]));
  const expectedSlots = new Set(expected.map(key));
  const conflicts: { stage: number; event: string; reason: string }[] = [];
  for (const entry of entries) {
    if (!expectedSlots.has(key(entry)))
      conflicts.push({
        stage: entry.stage,
        event: entry.event,
        reason: "NO_SOURCE",
      });
  }
  const missing: Entry[] = [];
  for (const entry of expected) {
    const actual = actualSlots.get(key(entry));
    if (!actual) missing.push(entry);
    else if (
      actual.invoiceId !== entry.invoiceId ||
      actual.amountSen !== entry.amountSen
    )
      conflicts.push({
        stage: entry.stage,
        event: entry.event,
        reason: "MISMATCH",
      });
  }
  if (missing.length) {
    const elsewhere = await tx.syntheticFinancialEntry.findMany({
      where: {
        submissionId: { not: submissionId },
        OR: missing.map(({ invoiceId, event }) => ({ invoiceId, event })),
      },
      select: { invoiceId: true, event: true },
    });
    for (const entry of missing) {
      if (
        elsewhere.some(
          (row) =>
            row.invoiceId === entry.invoiceId && row.event === entry.event,
        )
      )
        conflicts.push({
          stage: entry.stage,
          event: entry.event,
          reason: "REFERENCE_CONFLICT",
        });
    }
  }
  if (apply && conflicts.length)
    fail(409, "Padanan bercanggah. Tiada catatan ditambah.");
  if (apply && missing.length)
    await tx.syntheticFinancialEntry.createMany({
      data: missing.map((entry) => ({ ...entry, submissionId })),
    });
  const totals = (source: { event: string; amountSen: number }[]) => {
    const invoices = source
      .filter((item) => item.event === "INVOICE")
      .reduce((sum, item) => sum + item.amountSen, 0);
    const receipts = source
      .filter((item) => item.event === "RECEIPT")
      .reduce((sum, item) => sum + item.amountSen, 0);
    return {
      invoicedSen: invoices,
      settledSen: receipts,
      outstandingSen: invoices - receipts,
    };
  };
  return {
    source: totals(expected),
    ledger: totals(apply ? [...entries, ...missing] : entries),
    missing: missing.map(({ stage, event }): Slot => ({ stage, event })),
    conflicts,
    added: apply ? missing.length : 0,
  };
}
