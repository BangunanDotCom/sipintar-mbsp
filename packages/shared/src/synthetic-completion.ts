import type { z } from "zod";
import {
  canActOnCompletion,
  trainingLetterTemplate,
  type TrainingLetterVersion,
  departments,
  type TechnicalDepartment,
  type CompletionRole,
  type CompletionCommand,
  type determination,
} from "./synthetic-completion-contract.js";
export {
  canActOnCompletion,
  completionCommand,
  completionRoles,
} from "./synthetic-completion-contract.js";
export type {
  CompletionRole,
  CompletionCommand,
} from "./synthetic-completion-contract.js";

export const completionDatabaseName =
  /^staylink_issue62_personal_completion[a-z0-9]{0,14}_test$/;

export const completionHistoryLimit = 500;

export function assertCompletionHistoryCount(count: number) {
  if (
    !Number.isSafeInteger(count) ||
    count < 0 ||
    count > completionHistoryLimit
  )
    throw Error("Sejarah latihan melebihi had persediaan.");
}

type Determination = z.infer<typeof determination>;
type Scope = Pick<Determination, "unitId" | "floorId">;
type Comment = Extract<CompletionCommand, { action: "COMMENT" }>;
const day = 86_400_000;
export const technicalReferralSlaMs = 7 * day;
export const noTechnicalComment =
  "Tiada ulasan diterima daripada jabatan berkenaan dalam tempoh tujuh (7) hari kalendar yang ditetapkan. Sehubungan itu, jabatan berkenaan hendaklah mengemukakan ulasan semasa mesyuarat pertimbangan.";
const key = (item: Scope) => item.unitId + "/" + item.floorId;

export function sixMonthLimit(timestamp: number) {
  const myt = new Date(timestamp + 8 * 3_600_000);
  const month = myt.getUTCMonth() + 6;
  const lastDate = new Date(
    Date.UTC(myt.getUTCFullYear(), month + 1, 0),
  ).getUTCDate();
  return new Date(
    Date.UTC(myt.getUTCFullYear(), month, Math.min(lastDate, myt.getUTCDate())),
  )
    .toISOString()
    .slice(0, 10);
}

type Paper = {
  submittedVersion: number;
  summary: string;
  comments: {
    department: TechnicalDepartment;
    text: string;
    details: Comment["details"];
  }[];
};

export function completionState() {
  return {
    version: 0,
    bkt: null as null | { receivedAt: number; note: string },
    technicalHistory: [] as {
      department: TechnicalDepartment;
      version: number;
      action: "SUBMITTED" | "RETURNED";
      comment: Omit<Comment, "action"> | null;
      reason: string | null;
    }[],
    referral: null as null | {
      deadline: number;
      version: number;
      paperSubmitted: boolean;
      departments: TechnicalDepartment[];
      acknowledged: TechnicalDepartment[];
      comments: Partial<Record<TechnicalDepartment, Omit<Comment, "action">>>;
    },
    papers: [] as Paper[],
    returnedPapers: [] as {
      paper: Paper;
      reason: string;
      returnedVersion: number;
    }[],
    decisions: [] as (Determination & { firstConditionAt?: number })[],
    letters: [] as {
      number: number;
      decisions: Determination[];
      signedAt: number;
      templateVersion: TrainingLetterVersion;
    }[],
    decisionSigned: false,
    decisionScope: [] as string[],
    response: null as null | {
      note: string;
      checkedBy: string | null;
      lateScopes: Scope[];
      allowed: boolean;
      referred: boolean;
    },
    invoice: null as null | { id: string; amountSen: number; settled: boolean },
    closed: false,
  };
}
export type CompletionState = ReturnType<typeof completionState>;

export function applyCompletion(
  state: CompletionState,
  command: CompletionCommand,
  context: {
    role: CompletionRole;
    actorId: string;
    now: number;
    scopes: Scope[];
    firstPaid: boolean;
    letterTemplate?: TrainingLetterVersion;
    feeSen: number | null;
    invoiceId?: string;
  },
): { state: CompletionState; changed: boolean } {
  const { role, actorId, now, scopes } = context;
  const { action } = command;
  if (!canActOnCompletion(role, action))
    throw Error("Peranan tidak dibenarkan.");
  if (action === "SETTLE_SECOND" && state.invoice?.settled)
    return { state, changed: false };
  if (state.closed) throw Error("Permohonan telah ditutup.");
  assertCompletionHistoryCount(state.version + 1);
  const next = structuredClone(state);
  const { referral, response } = next;
  const pending = next.decisions.filter(
    ({ outcome }) => outcome === "TANGGUH" || outcome === "SKB",
  );
  const scopeKeys = new Set(scopes.map(key));
  const uniqueValid = (items: Scope[]) =>
    new Set(items.map(key)).size === items.length &&
    items.every((item) => scopeKeys.has(key(item)));
  switch (command.action) {
    case "RECEIVE_BKT":
      if (next.bkt || referral || !context.firstPaid)
        throw Error(
          "Penerimaan BKT latihan memerlukan bayaran pertama dan kes yang belum dirujuk.",
        );
      next.bkt = { receivedAt: now, note: command.note };
      break;
    case "ACK_REFERRAL": {
      const department = role as TechnicalDepartment;
      if (
        !next.bkt ||
        !referral?.departments.includes(department) ||
        referral.acknowledged.includes(department)
      )
        throw Error("Penerimaan rujukan tidak tersedia.");
      referral.acknowledged.push(department);
      break;
    }
    case "RETURN_COMMENT": {
      if (
        !next.bkt ||
        !referral ||
        referral.paperSubmitted ||
        !referral.comments[command.department]
      )
        throw Error(
          "Ulasan tiada atau telah dimasukkan dalam snapshot Kertas Pertimbangan.",
        );
      delete referral.comments[command.department];
      next.technicalHistory.push({
        department: command.department,
        version: state.version + 1,
        action: "RETURNED",
        comment: null,
        reason: command.reason,
      });
      break;
    }
    case "REFER":
      if (
        !context.firstPaid ||
        referral ||
        !scopes.length ||
        scopes.length > 300
      )
        throw Error("Bayaran pertama atau skop rujukan belum disahkan.");
      next.referral = {
        departments: [...departments],
        comments: {},
        acknowledged: [],
        deadline: technicalReferralDeadline(now),
        version: state.version + 1,
        paperSubmitted: false,
      };
      break;
    case "REREFER":
      if (
        !response?.allowed ||
        response.referred ||
        !next.decisionSigned ||
        !pending.length ||
        new Set(command.departments).size !== command.departments.length ||
        next.papers.length < next.letters.length
      )
        throw Error(
          "Rujukan semula memerlukan semakan dan pengesahan susulan.",
        );
      response.referred = true;
      next.referral = {
        departments: command.departments,
        comments: {},
        acknowledged: [],
        deadline: technicalReferralDeadline(now),
        version: state.version + 1,
        paperSubmitted: false,
      };
      break;
    case "COMMENT": {
      const department = role as TechnicalDepartment;
      if (
        !referral?.departments.includes(department) ||
        referral.comments[department] ||
        (next.bkt && !referral.acknowledged.includes(department)) ||
        !uniqueValid(command.details)
      )
        throw Error("Ulasan atau skop rujukan tidak sah.");
      referral.comments[department] = {
        general: command.general,
        details: command.details,
      };
      if (next.bkt)
        next.technicalHistory.push({
          department,
          version: state.version + 1,
          action: "SUBMITTED",
          comment: referral.comments[department],
          reason: null,
        });
      break;
    }
    case "SUBMIT_PAPER":
      if (
        !referral ||
        next.papers.length !== next.letters.length ||
        (next.letters.length > 0 && !response?.allowed) ||
        (now < referral.deadline &&
          referral.departments.some((d) => !referral.comments[d]))
      )
        throw Error("Kertas Pertimbangan belum sedia diserah.");
      referral.paperSubmitted = true;
      next.papers.push({
        submittedVersion: state.version + 1,
        summary: command.summary,
        comments: referral.departments.map((department) => ({
          department,
          text: referral.comments[department]?.general ?? noTechnicalComment,
          details: referral.comments[department]?.details ?? [],
        })),
      });
      break;
    case "RETURN_PAPER": {
      if (
        !referral?.paperSubmitted ||
        next.papers.length !== next.letters.length + 1 ||
        (next.decisions.length > 0 && !next.decisionSigned)
      )
        throw Error("Kertas Pertimbangan tiada atau keputusan telah direkod.");
      const paper = next.papers.pop()!;
      next.returnedPapers.push({
        paper,
        reason: command.reason,
        returnedVersion: state.version + 1,
      });
      referral.paperSubmitted = false;
      break;
    }
    case "DECIDE": {
      const required = next.decisions.length ? pending : scopes;
      if (
        next.papers.length !== next.letters.length + 1 ||
        (next.decisions.length > 0 &&
          (!next.decisionSigned || !response?.allowed)) ||
        !uniqueValid(command.decisions) ||
        command.decisions.length !== required.length ||
        required.some(
          (item) => !command.decisions.some((d) => key(d) === key(item)),
        )
      )
        throw Error(
          "Keputusan mesti meliputi tepat semua skop yang menunggu keputusan.",
        );
      const previous = new Map(next.decisions.map((item) => [key(item), item]));
      const changed = command.decisions.map((item) => {
        const firstConditionAt = previous.get(key(item))?.firstConditionAt;
        const today = new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);
        if (
          item.followUpBy &&
          (item.outcome !== "TANGGUH" || item.followUpBy < today)
        )
          throw Error(
            "Tarikh susulan mesti untuk keputusan TANGGUH dan belum berlalu.",
          );

        if (item.outcome === "SKB") {
          const start = firstConditionAt ?? now;
          if (
            !item.conditionUntil ||
            item.conditionUntil < today ||
            item.conditionUntil > sixMonthLimit(start)
          )
            throw Error(
              "Tempoh keseluruhan SKB tidak boleh melebihi enam bulan.",
            );
          return { ...item, firstConditionAt: start };
        }
        if (item.conditionUntil)
          throw Error("Tarikh syarat hanya terpakai kepada SKB.");
        return {
          ...item,
          ...(firstConditionAt !== undefined && { firstConditionAt }),
        };
      });
      const changedKeys = new Set(changed.map(key));
      next.decisions = [
        ...next.decisions.filter((item) => !changedKeys.has(key(item))),
        ...changed,
      ];
      next.decisionScope = [...changedKeys];
      next.decisionSigned = false;
      next.response = null;
      break;
    }
    case "SIGN":
      if (
        !next.decisions.length ||
        next.decisionSigned ||
        next.papers.length !== next.letters.length + 1
      )
        throw Error("Tiada keputusan untuk dipertandatangani.");
      next.letters.push({
        number: next.letters.length + 1,
        decisions: next.decisions
          .filter((item) => next.decisionScope.includes(key(item)))
          .map(({ firstConditionAt: _, ...item }) => item),
        signedAt: now,
        templateVersion: context.letterTemplate ?? trainingLetterTemplate,
      });
      next.decisionSigned = true;
      break;
    case "RESPOND":
      if (!next.decisionSigned || !pending.length || response)
        throw Error("Tiada tindakan susulan tersedia.");
      next.response = {
        note: command.note,
        lateScopes: pending
          .filter(
            ({ followUpBy }) =>
              followUpBy &&
              followUpBy <
                new Date(now + 8 * 3_600_000).toISOString().slice(0, 10),
          )
          .map(({ unitId, floorId }) => ({ unitId, floorId })),
        checkedBy: null,
        allowed: false,
        referred: false,
      };
      break;
    case "CHECK_RESPONSE":
      if (!response || response.checkedBy)
        throw Error("Tiada jawapan menunggu semakan.");
      response.checkedBy = actorId;
      break;
    case "ALLOW_RECONSIDERATION":
      if (
        !response?.checkedBy ||
        response.checkedBy === actorId ||
        response.allowed
      )
        throw Error(
          "Pengesahan susulan perlu dibuat oleh penyelia berasingan.",
        );
      response.allowed = true;
      break;
    case "ISSUE_SECOND": {
      const approved = new Set(
        next.decisions
          .filter((item) => item.outcome === "SK")
          .map(({ unitId }) => unitId),
      );
      if (
        !next.decisionSigned ||
        pending.length ||
        next.invoice ||
        !approved.size ||
        context.feeSen === null ||
        !context.invoiceId
      )
        throw Error("Invois kedua belum boleh dijana.");
      next.invoice = {
        id: context.invoiceId,
        amountSen: context.feeSen * approved.size,
        settled: false,
      };
      break;
    }
    case "SETTLE_SECOND":
      if (!next.invoice) throw Error("Invois kedua belum dijana.");
      next.invoice.settled = true;
      break;
    case "CLOSE":
      if (
        !next.decisionSigned ||
        pending.length ||
        (next.decisions.some(({ outcome }) => outcome === "SK") &&
          !next.invoice?.settled)
      )
        throw Error("Keputusan atau bayaran masih tertunggak.");
      next.closed = true;
      break;
  }
  next.version++;
  return { state: next, changed: true };
}

export function technicalReferralDeadline(openedAt: number) {
  return openedAt + technicalReferralSlaMs;
}

export function technicalSla(
  closed: boolean,
  deadline: number,
  outstanding: boolean,
  now: number,
) {
  return !closed && outstanding && now >= deadline;
}

export function completionOverdue(
  { closed, referral }: CompletionState,
  now: number,
  department?: TechnicalDepartment,
) {
  return Boolean(
    referral &&
    technicalSla(
      closed,
      referral.deadline,
      referral.departments.some(
        (role) =>
          (!department || department === role) && !referral.comments[role],
      ),
      now,
    ),
  );
}
