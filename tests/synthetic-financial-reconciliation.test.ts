import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { reconcileSyntheticLedger } from "../apps/api/src/synthetic-financial-reconciliation";
import { MOCK_UNIT_FEE_SEN } from "../apps/api/src/synthetic-owner-policy";

it.each([
  "MISMATCH",
  "NO_SOURCE",
  "REFERENCE_CONFLICT",
  "UNIQUE_RACE",
] as const)(
  "reports %s without applying conflicting journal entries",
  async (reason) => {
    const submissionId = randomUUID();
    const unitId = randomUUID();
    const invoiceId = randomUUID();
    const createdAt = new Date("2026-10-29T12:00:00Z");
    const expected = {
      stage: 1,
      event: "INVOICE",
      invoiceId,
      amountSen: MOCK_UNIT_FEE_SEN,
      createdAt,
    };
    const append = vi.fn();
    if (reason === "UNIQUE_RACE")
      append.mockRejectedValueOnce(
        Object.assign(new Error("unique"), { code: "ORA-00001" }),
      );
    const tx = {
      events: async () => [],
      ledgerEvents: async () => [
        {
          action: "SYNTHETIC_PORTAL_INVOICE_ISSUED",
          createdAt,
          metadata: {
            id: invoiceId,
            submissionId,
            caseId: "synthetic-case",
            officialReference: "LAB",
            unitIds: [unitId],
            amountSen: MOCK_UNIT_FEE_SEN,
            currency: "MYR",
            expiresAt: createdAt.getTime() + 60_000,
          },
        },
      ],
      financial: {
        entries: async () =>
          reason === "MISMATCH"
            ? [{ ...expected, amountSen: 1 }]
            : reason === "NO_SOURCE"
              ? [{ ...expected, event: "RECEIPT" }]
              : [],
        invoice: async () => null,
        referencesElsewhere: async () =>
          reason === "REFERENCE_CONFLICT" ? [expected] : [],
        append,
      },
    };
    const args = [
      tx,
      submissionId,
      "synthetic-case",
      [unitId],
      [] as { unitId: string; floorId: string }[],
    ] as const;
    const dryRun = await reconcileSyntheticLedger(...args, false);
    expect(dryRun).toMatchObject({
      added: 0,
      conflicts: reason === "UNIQUE_RACE" ? [] : [{ reason }],
    });
    expect(append).not.toHaveBeenCalled();
    await expect(reconcileSyntheticLedger(...args, true)).rejects.toMatchObject(
      { statusCode: 409 },
    );
    expect(append).toHaveBeenCalledTimes(reason === "UNIQUE_RACE" ? 1 : 0);
  },
);
