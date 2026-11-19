export type SyntheticReviewState = {
  caseId: string;
  submissionId: string;
  version: number;
  initiatorId: string;
  scopeId: string;
  status: "SUBMITTED" | "CORRECTION_REQUESTED" | "COMPLETE" | "REGISTERED";
  officialReference: string | null;
};

type Reviewer = {
  id: string;
  scopeId: string;
  assignedCaseId: string;
  activeRole: string;
  mfaVerified: boolean;
  reviewGranted: boolean;
};

type ReviewAction = {
  action: "REQUEST_CORRECTION" | "CONFIRM_COMPLETE" | "REGISTER";
  version: number;
  submissionId: string;
  reason: string;
};

export function mockPrecheck(metadata: {
  unitCount: number;
  floorCount: number;
  evidenceCount: number;
}) {
  const missing = [
    ["UNITS_MISSING", metadata.unitCount],
    ["FLOORS_MISSING", metadata.floorCount],
    ["EVIDENCE_MISSING", metadata.evidenceCount],
  ]
    .filter(
      ([, count]) =>
        typeof count !== "number" || !Number.isSafeInteger(count) || count <= 0,
    )
    .map(([warning]) => warning);
  return {
    source: "SYNTHETIC_MOCK" as const,
    advisoryOnly: true as const,
    missing,
  };
}

const transitions = {
  REQUEST_CORRECTION: { from: "SUBMITTED", to: "CORRECTION_REQUESTED" },
  CONFIRM_COMPLETE: { from: "SUBMITTED", to: "COMPLETE" },
  REGISTER: { from: "COMPLETE", to: "REGISTERED" },
} as const;

// All identity and assignment fields are server-owned fixtures, separate from the action.
export function applySyntheticReview(
  enabled: boolean,
  current: SyntheticReviewState,
  reviewer: Reviewer,
  action: ReviewAction,
  now: Date,
  registrationRole: "PIC_KAWASAN" | "PPSK" = "PIC_KAWASAN",
) {
  if (enabled !== true) return { status: "DISABLED" as const };
  if (
    reviewer.activeRole !==
      (action.action === "REGISTER" ? registrationRole : "PIC_KAWASAN") ||
    reviewer.mfaVerified !== true ||
    reviewer.reviewGranted !== true ||
    reviewer.id === current.initiatorId ||
    !reviewer.id ||
    !reviewer.scopeId ||
    reviewer.scopeId !== current.scopeId ||
    reviewer.assignedCaseId !== current.caseId
  )
    return { status: "FORBIDDEN" as const };
  if (
    action.version !== current.version ||
    action.submissionId !== current.submissionId
  )
    return { status: "CONFLICT" as const };
  if (!Object.hasOwn(transitions, action.action))
    return { status: "INVALID_TRANSITION" as const };
  const transition = transitions[action.action];
  if (current.status !== transition.from || current.officialReference !== null)
    return { status: "INVALID_TRANSITION" as const };
  const reason = action.reason.trim();
  if (reason.length < 3 || reason.length > 500)
    return { status: "REASON_REQUIRED" as const };

  const next: SyntheticReviewState = {
    ...current,
    status: transition.to,
    version: current.version + 1,
    officialReference:
      action.action === "REGISTER" ? `SYNTHETIC-${current.caseId}` : null,
  };
  return {
    status: "APPLIED" as const,
    next,
    audit: {
      actorId: reviewer.id,
      role: reviewer.activeRole,
      action: action.action,
      submissionId: current.submissionId,
      from: current.status,
      to: next.status,
      reason,
      version: next.version,
      occurredAt: now.toISOString(),
    },
  };
}
