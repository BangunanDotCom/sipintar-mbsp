import { z } from "zod";

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
  followUpBy: z.iso.date().optional(),
});
export const completionCommand = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("REFER") }),
  z.strictObject({ action: z.literal("RECEIVE_BKT"), note: notes }),
  z.strictObject({ action: z.literal("ACK_REFERRAL") }),
  z.strictObject({
    action: z.literal("RETURN_COMMENT"),
    department: z.enum(departments),
    reason: notes,
  }),

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
  z.strictObject({ action: z.literal("RETURN_PAPER"), reason: notes }),
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
const commandRoles: Record<CompletionCommand["action"], CompletionRole[]> = {
  REFER: ["PIC_KAWASAN"],
  RECEIVE_BKT: ["URUS_SETIA_JK"],
  ACK_REFERRAL: [...departments],
  RETURN_COMMENT: ["PIC_KAWASAN"],
  REREFER: ["PIC_KAWASAN"],
  COMMENT: [...departments],
  SUBMIT_PAPER: ["PIC_KAWASAN"],
  RETURN_PAPER: ["URUS_SETIA_JK"],
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

export const completionEvent = "SYNTHETIC_PORTAL_COMPLETION";
export const completionProvider = "SYNTHETIC_PROVIDER";
export const trainingLetterTemplate = "SYNTHETIC-DECISION-LETTER-v1";
export const unicodeLetterTemplate = "SYNTHETIC-DECISION-LETTER-v2";
export const trainingLetterVersion = z.enum([
  trainingLetterTemplate,
  unicodeLetterTemplate,
]);
export type TrainingLetterVersion = z.infer<typeof trainingLetterVersion>;
export const completionStoredMetadata = z.strictObject({
  version: z.number().int().positive(),
  timestamp: z.number().int().nonnegative(),
  firstPaid: z.boolean(),
  feeSen: z.number().int().nonnegative().nullable(),
  invoiceId: z.uuid().optional(),
  letterTemplate: trainingLetterVersion.optional(),
  command: completionCommand,
});

const completionJournalRole = z.enum([
  ...completionRoles,
  "PIC_KAWASAN",
  "PPSK",
  "PEMOHON",
  "WAKIL_SYARIKAT",
]);
const completionActorId = z.uuid();
export function completionEventRole(
  actorId: string | null,
  activeRole: string | null,
  action: CompletionCommand["action"],
): CompletionRole | null {
  if (actorId === completionProvider)
    return activeRole === null && action === "SETTLE_SECOND" ? "PPSK" : null;
  if (!completionActorId.safeParse(actorId).success) return null;
  const parsed = completionJournalRole.safeParse(activeRole);
  return parsed.success && canActOnCompletion(parsed.data, action)
    ? parsed.data
    : null;
}
