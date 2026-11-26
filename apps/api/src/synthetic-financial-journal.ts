export type FinancialEntry = {
  submissionId: string;
  invoiceId: string;
  stage: 1 | 2;
  event: "INVOICE" | "RECEIPT";
  amountSen: number;
};
export type FinancialView = Omit<
  FinancialEntry,
  "submissionId" | "stage" | "event"
> & { stage: number; event: string; createdAt: Date };
export type FinancialJournal = {
  entries(id: string): Promise<FinancialView[]>;
  invoice(
    id: string,
    stage: number,
  ): Promise<Pick<FinancialEntry, "amountSen" | "invoiceId"> | null>;
  append(entry: FinancialEntry): Promise<void>;
};

export async function recordSyntheticFinancialEntry(
  journal: FinancialJournal,
  data: FinancialEntry,
) {
  if (!Number.isSafeInteger(data.amountSen) || data.amountSen <= 0)
    throw Error("Nilai transaksi latihan dalam sen tidak sah.");
  if (data.event === "RECEIPT") {
    const invoice = await journal.invoice(data.submissionId, data.stage);
    // A legacy invoice may predate the append-only journal. Its caller must
    // validate the receipt against the existing immutable workflow snapshot.
    if (
      invoice &&
      (invoice.amountSen !== data.amountSen ||
        invoice.invoiceId !== data.invoiceId)
    )
      throw Error("Padanan lejar latihan tidak sepadan.");
  }
  await journal.append(data);
}
