import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  issueMockInvoice,
  reconcileMockCallback,
} from "../apps/api/src/synthetic-billing";
import {
  applySyntheticReview,
  type SyntheticReviewState,
} from "../packages/shared/src/synthetic-review";

const a = randomUUID(),
  b = randomUUID(),
  invoiceId = randomUUID(),
  eventId = randomUUID();
const ledger = { invoices: [], settlements: [] };
const now = 1000,
  expires = 2000;
const review: SyntheticReviewState = {
  caseId: "case",
  status: "REGISTERED",
  officialReference: "SYNTHETIC-case",
  version: 3,
  submissionId: "sub",
  initiatorId: "owner",
  scopeId: "SPU",
};
const verified = { submissionId: "sub", unitIds: [a, a, b] };

it("issues one MYR100 invoice for two distinct physical units after human registration", () => {
  const submitted: SyntheticReviewState = {
    ...review,
    status: "SUBMITTED",
    officialReference: null,
    version: 1,
  };
  const pic = {
    id: "pic",
    scopeId: "SPU",
    assignedCaseId: "case",
    reviewGranted: true,
    activeRole: "PIC_KAWASAN",
    mfaVerified: true,
  };
  const action = {
    submissionId: "sub",
    version: 1,
    reason: "Pengesahan sintetik",
  };
  const at = new Date(now);
  expect(
    issueMockInvoice(false, ledger, review, verified, invoiceId, expires, now)
      .status,
  ).toBe("DISABLED");
  expect(
    issueMockInvoice(true, ledger, submitted, verified, invoiceId, expires, now)
      .status,
  ).toBe("NOT_REGISTERED");
  const complete = applySyntheticReview(
    true,
    submitted,
    pic,
    { ...action, action: "CONFIRM_COMPLETE" },
    at,
  );
  if (complete.status !== "APPLIED") throw Error("completion fixture failed");
  const registered = applySyntheticReview(
    true,
    complete.next,
    pic,
    { ...action, action: "REGISTER", version: 2 },
    at,
  );
  if (registered.status !== "APPLIED")
    throw Error("registration fixture failed");
  const result = issueMockInvoice(
    true,
    ledger,
    registered.next,
    verified,
    invoiceId,
    expires,
    now,
  );
  if (result.status !== "ISSUED") throw Error("invoice fixture failed");
  expect(result.invoice).toMatchObject({
    amountSen: 10000,
    currency: "MYR",
    unitIds: [a, b].sort(),
  });
  expect(
    issueMockInvoice(
      true,
      result.ledger,
      review,
      verified,
      randomUUID(),
      expires,
      now,
    ),
  ).toMatchObject({
    status: "REPLAY",
    invoice: result.invoice,
  });
  expect(
    issueMockInvoice(
      true,
      result.ledger,
      review,
      { ...verified, unitIds: [a] },
      invoiceId,
      expires,
      now,
    ).status,
  ).toBe("SNAPSHOT_CONFLICT");
});

it("authenticates the mock callback and distinguishes duplicates from conflicting settlements", () => {
  const issued = issueMockInvoice(
    true,
    ledger,
    review,
    verified,
    invoiceId,
    expires,
    now,
  );
  if (issued.status !== "ISSUED") throw Error("invoice fixture failed");
  const secret = randomBytes(32);
  const event = {
    invoiceId,
    eventId,
    currency: "MYR",
    amountSen: 10000,
    providerReference: "SYNTHETIC-provider1",
    outcome: "SETTLED",
  };
  const body = JSON.stringify(event);
  const sign = (payload: string) =>
    createHmac("sha256", secret).update(payload).digest("hex");
  expect(
    reconcileMockCallback(false, issued.ledger, body, sign(body), secret, now)
      .status,
  ).toBe("DISABLED");
  expect(
    reconcileMockCallback(
      true,
      issued.ledger,
      body + " ",
      sign(body),
      secret,
      now,
    ).status,
  ).toBe("UNAUTHENTICATED");
  expect(
    reconcileMockCallback(
      true,
      issued.ledger,
      body,
      sign(body),
      secret,
      expires,
    ).status,
  ).toBe("EXPIRED");
  const wrongAmount = JSON.stringify({ ...event, amountSen: 1 });
  expect(
    reconcileMockCallback(
      true,
      issued.ledger,
      wrongAmount,
      sign(wrongAmount),
      secret,
      now,
    ).status,
  ).toBe("INVOICE_MISMATCH");
  const receipt = reconcileMockCallback(
    true,
    issued.ledger,
    body,
    sign(body),
    secret,
    now,
  );
  if (receipt.status !== "SETTLED") throw Error("settlement fixture failed");
  expect(
    reconcileMockCallback(
      true,
      receipt.ledger,
      body,
      sign(body),
      secret,
      expires,
    ).status,
  ).toBe("REPLAY");
  for (const conflict of [
    { ...event, eventId: randomUUID() },
    { ...event, providerReference: "SYNTHETIC-provider2" },
  ]) {
    const data = JSON.stringify(conflict);
    expect(
      reconcileMockCallback(true, receipt.ledger, data, sign(data), secret, now)
        .status,
    ).toBe("REFERENCE_CONFLICT");
  }
  expect(receipt.ledger.settlements).toHaveLength(1);
});
