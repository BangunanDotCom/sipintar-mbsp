import type { CompletionState } from "./synthetic-completion.js";

export function overdueTechnicalDepartments(state: CompletionState, now: number) {
  const { referral } = state;
  if (!referral || state.closed || now < referral.deadline) return [];
  return referral.departments.filter((department) => !referral.comments[department]);
}

export function technicalConsolidation(state: CompletionState, now: number) {
  const { referral } = state;
  if (!referral) return null;
  const overdue = overdueTechnicalDepartments(state, now);
  return {
    deadline: referral.deadline,
    submittedPaperVersion: referral.paperSubmitted
      ? (state.papers.at(-1)?.submittedVersion ?? null)
      : null,
    departments: referral.departments.map((department) => {
      const current = referral.comments[department];
      const history = state.technicalHistory.filter(
        (item) =>
          item.department === department && item.version > referral.version,
      );
      const submissions = history.filter((item) => item.comment !== null);
      const latest = submissions.at(-1);
      const previous = submissions.at(current ? -2 : -1);
      return {
        department,
        status: current
          ? "RECEIVED"
          : overdue.includes(department)
            ? "OVERDUE"
            : "PENDING",
        currentVersion: current ? (latest?.version ?? null) : null,
        current: current ?? null,
        previous: previous?.comment
          ? { version: previous.version, comment: previous.comment }
          : null,
        returnReason:
          history.filter((item) => item.action === "RETURNED").at(-1)?.reason ??
          null,
      };
    }),
  };
}
