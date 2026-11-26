import type { Prisma } from "@prisma/client";

export async function recordSyntheticFinancialEntry(
  tx: Prisma.TransactionClient,
  data: {
    submissionId: string;
    invoiceId: string;
    stage: 1 | 2;
    event: "INVOICE" | "RECEIPT";
    amountSen: number;
  },
) {
  if (!Number.isSafeInteger(data.amountSen) || data.amountSen <= 0)
    throw Error("Nilai transaksi latihan dalam sen tidak sah.");
  if (data.event === "RECEIPT") {
    const invoice = await tx.syntheticFinancialEntry.findUnique({
      where: {
        submissionId_stage_event: {
          submissionId: data.submissionId,
          stage: data.stage,
          event: "INVOICE",
        },
      },
    });
    // A legacy invoice may predate the append-only journal. Its caller must
    // validate the receipt against the existing immutable workflow snapshot.
    if (
      invoice &&
      (invoice.amountSen !== data.amountSen ||
        invoice.invoiceId !== data.invoiceId)
    )
      throw Error("Padanan lejar latihan tidak sepadan.");
  }
  await tx.syntheticFinancialEntry.create({ data });
}
