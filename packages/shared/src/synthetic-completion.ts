import { z } from "zod";

export const completionDatabaseName =
  /^staylink_issue62_personal_completion[a-z0-9]{0,14}_test$/;

export const departments = ["PERANCANG_BANDAR", "KEJURUTERAAN"] as const;
export type TechnicalDepartment = (typeof departments)[number];
export const completionRoles = [
  ...departments,
  "URUS_SETIA_JK",
  "PEGAWAI_PENANDATANGAN",
] as const;
export type CompletionRole =
  | "PIC_KAWASAN"
  | "PPSK"
  | "PEMOHON"
  | "WAKIL_SYARIKAT"
  | (typeof completionRoles)[number];

const notes = z.string().trim().min(3).max(1000);
const scope = { unitId: z.uuid(), floorId: z.uuid() };
const outcome = z.enum(["SK", "SKB", "TANGGUH", "TOLAK"]);
export const determination = z.strictObject({
  ...scope,
  outcome,
  reason: notes,
  conditionUntil: z.iso.date().optional(),
});
export const completionCommand = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("REFER") }),
  z.strictObject({
    action: z.literal("REREFER"),
    departments: z.array(z.enum(departments)).min(1).max(2),
  }),
  z.strictObject({
    action: z.literal("COMMENT"),
    general: notes,
    details: z.array(z.strictObject({ ...scope, comment: notes })).max(300),
  }),
  z.strictObject({ action: z.literal("SUBMIT_PAPER"), summary: notes }),
  z.strictObject({
    action: z.literal("DECIDE"),
    decisions: z.array(determination).min(1).max(300),
  }),
  z.strictObject({ action: z.literal("SIGN") }),
  z.strictObject({ action: z.literal("RESPOND"), note: notes }),
  z.strictObject({ action: z.literal("CHECK_RESPONSE") }),
  z.strictObject({ action: z.literal("ALLOW_RECONSIDERATION") }),
  z.strictObject({ action: z.literal("ISSUE_SECOND") }),
  z.strictObject({ action: z.literal("SETTLE_SECOND") }),
  z.strictObject({ action: z.literal("CLOSE") }),
]);
export type CompletionCommand = z.infer<typeof completionCommand>;
type Determination = z.infer<typeof determination>;
type Scope = Pick<Determination, "unitId" | "floorId">;
type Comment = Extract<CompletionCommand, { action: "COMMENT" }>;
const day = 86_400_000;
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

export function completionState() {
  return {
    version: 0,
    referral: null as null | {
      deadline: number;
      paperSubmitted: boolean;
      departments: TechnicalDepartment[];
      comments: Partial<Record<TechnicalDepartment, Omit<Comment, "action">>>;
    },
    papers: [] as {
      summary: string;
      comments: {
        department: TechnicalDepartment;
        text: string;
        details: Comment["details"];
      }[];
    }[],
    decisions: [] as (Determination & { firstConditionAt?: number })[],
    letters: [] as {
      number: number;
      decisions: Determination[];
      signedAt: number;
    }[],
    decisionSigned: false,
    decisionScope: [] as string[],
    response: null as null | {
      note: string;
      checkedBy: string | null;
      allowed: boolean;
      referred: boolean;
    },
    invoice: null as null | { id: string; amountSen: number; settled: boolean },
    closed: false,
  };
}
export type CompletionState = ReturnType<typeof completionState>;

const commandRoles: Record<CompletionCommand["action"], CompletionRole[]> = {
  REFER: ["PIC_KAWASAN"],
  REREFER: ["PIC_KAWASAN"],
  COMMENT: [...departments],
  SUBMIT_PAPER: ["PIC_KAWASAN"],
  DECIDE: ["URUS_SETIA_JK"],
  SIGN: ["PEGAWAI_PENANDATANGAN"],
  RESPOND: ["PEMOHON", "WAKIL_SYARIKAT"],
  CHECK_RESPONSE: ["PIC_KAWASAN"],
  ALLOW_RECONSIDERATION: ["PPSK"],
  ISSUE_SECOND: ["PPSK"],
  SETTLE_SECOND: ["PPSK"],
  CLOSE: ["PPSK"],
};

export function canActOnCompletion(
  role: CompletionRole,
  action: CompletionCommand["action"],
) {
  return commandRoles[action].includes(role);
}

export function applyCompletion(
  state: CompletionState,
  command: CompletionCommand,
  context: {
    role: CompletionRole;
    actorId: string;
    now: number;
    scopes: Scope[];
    firstPaid: boolean;
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
        deadline: now + 7 * day,
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
        deadline: now + 7 * day,
        paperSubmitted: false,
      };
      break;
    case "COMMENT": {
      const department = role as TechnicalDepartment;
      if (
        !referral?.departments.includes(department) ||
        referral.comments[department] ||
        !uniqueValid(command.details)
      )
        throw Error("Ulasan atau skop rujukan tidak sah.");
      referral.comments[department] = {
        general: command.general,
        details: command.details,
      };
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
        summary: command.summary,
        comments: referral.departments.map((department) => ({
          department,
          text: referral.comments[department]?.general ?? noTechnicalComment,
          details: referral.comments[department]?.details ?? [],
        })),
      });
      break;
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
        if (item.outcome === "SKB") {
          const start = firstConditionAt ?? now;
          const today = new Date(now + 8 * 3_600_000)
            .toISOString()
            .slice(0, 10);
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
      });
      next.decisionSigned = true;
      break;
    case "RESPOND":
      if (!next.decisionSigned || !pending.length || response)
        throw Error("Tiada tindakan susulan tersedia.");
      next.response = {
        note: command.note,
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
