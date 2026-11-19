import { expect, it } from "vitest";
import {
  applySyntheticReview,
  mockPrecheck,
  type SyntheticReviewState,
} from "../packages/shared/src/synthetic-review";

const current: SyntheticReviewState = {
  caseId: "case1",
  submissionId: "sub1",
  scopeId: "SPU",
  initiatorId: "applicant",
  status: "SUBMITTED",
  version: 1,
  officialReference: null,
};
const pic = {
  id: "pic1",
  activeRole: "PIC_KAWASAN",
  scopeId: "SPU",
  assignedCaseId: "case1",
  reviewGranted: true,
  mfaVerified: true,
};
const action = {
  action: "CONFIRM_COMPLETE" as const,
  version: 1,
  submissionId: "sub1",
  reason: "Bukti sintetik disemak.",
};
const now = new Date("2026-11-19T09:00:00Z");

it("returns advice without an identity, a permission or a review decision", () => {
  expect(
    mockPrecheck({ unitCount: 1, floorCount: 2, evidenceCount: 0 }),
  ).toEqual({
    source: "SYNTHETIC_MOCK",
    advisoryOnly: true,
    missing: ["EVIDENCE_MISSING"],
  });
});

it("denies unassigned, cross-area, no-MFA, unauthorized and self-review cases", () => {
  expect(applySyntheticReview(false, current, pic, action, now).status).toBe(
    "DISABLED",
  );
  for (const denied of [
    { id: "applicant" },
    { scopeId: "SPT" },
    { assignedCaseId: "case2" },
    { mfaVerified: false },
    { reviewGranted: false },
    { activeRole: "PENTADBIR_ICT" },
  ]) {
    expect(
      applySyntheticReview(true, current, { ...pic, ...denied }, action, now)
        .status,
    ).toBe("FORBIDDEN");
  }
  expect(
    applySyntheticReview(true, current, pic, { ...action, version: 2 }, now)
      .status,
  ).toBe("CONFLICT");
  expect(
    applySyntheticReview(
      true,
      current,
      pic,
      { ...action, submissionId: "sub2" },
      now,
    ).status,
  ).toBe("CONFLICT");
});

it("records a reason and permits registration only after human completion", () => {
  expect(
    applySyntheticReview(
      true,
      current,
      pic,
      { ...action, action: "REGISTER" },
      now,
    ).status,
  ).toBe("INVALID_TRANSITION");
  expect(
    applySyntheticReview(true, current, pic, { ...action, reason: " " }, now)
      .status,
  ).toBe("REASON_REQUIRED");
  const correction = applySyntheticReview(
    true,
    current,
    pic,
    { ...action, action: "REQUEST_CORRECTION" },
    now,
  );
  expect(correction).toMatchObject({
    status: "APPLIED",
    next: { officialReference: null, status: "CORRECTION_REQUESTED" },
  });
  const complete = applySyntheticReview(true, current, pic, action, now);
  if (complete.status !== "APPLIED") throw Error("review fixture failed");
  expect(complete).toMatchObject({
    next: { officialReference: null, version: 2 },
    audit: {
      actorId: "pic1",
      from: "SUBMITTED",
      to: "COMPLETE",
      reason: action.reason,
    },
  });
  expect(
    applySyntheticReview(
      true,
      complete.next,
      pic,
      { ...action, version: 2, action: "REGISTER" },
      now,
    ),
  ).toMatchObject({
    status: "APPLIED",
    next: {
      officialReference: "SYNTHETIC-case1",
      status: "REGISTERED",
      version: 3,
    },
  });
});
