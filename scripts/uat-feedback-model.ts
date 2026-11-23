import { z } from "zod";

export class FeedbackError extends Error {}

export const scenarios = [
  "single-unit",
  "multiple-units",
  "failed-evidence",
  "company-active",
  "company-expired",
  "district-spt",
] as const;
const syntheticActor = z.string().regex(/^SYN-[A-Z0-9][A-Z0-9-]{2,30}$/);
const evidence = z.string().regex(/^EV-[A-Z0-9][A-Z0-9-]{2,30}$/);
const commit = z.string().regex(/^[a-f0-9]{7,40}$/);
const labels = z
  .string()
  .regex(/^ADD-[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(64);
const feedbackText = z
  .string()
  .trim()
  .min(3)
  .max(600)
  .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value))
  .refine(
    (value) =>
      !/@|\b[a-z][a-z0-9+.-]*:\/\/|\b(?:data|file|ftp|https?|javascript|mailto|vbscript):|\bwww\.|Bearer\s|BEGIN .*KEY|(?:password|kata laluan|secret|token)\s*[:=]|\d{6}[- ]?\d{2}[- ]?\d{4}|\b\d{9,}\b/i.test(
        value,
      ),
  );
const team = z.enum(["BANGUNAN", "ICT", "KEWANGAN", "UNIT_REKOD", "TEKNIKAL"]);

export const sessionSchema = z.strictObject({
  id: z.string().regex(/^UAT-[A-Z0-9][A-Z0-9-]{2,30}$/),
  dateMyt: z.iso.date(),
  commit,
});
export type UatSession = z.infer<typeof sessionSchema>;

export const recordSchema = z
  .strictObject({
    type: z.literal("RECORD"),
    by: syntheticActor,
    actor: z.enum(["PEMOHON", "PIC", "PPSK"]),
    scenario: z.union([z.enum(scenarios), labels]),
    expected: feedbackText,
    actual: feedbackText,
    outcome: z.enum(["PASS", "FAIL", "BLOCKED"]),
    severity: z.enum(["BLOCKER", "HIGH", "MEDIUM", "LOW"]).nullable(),
    reproducibility: z.enum([
      "ALWAYS",
      "INTERMITTENT",
      "ONCE",
      "NOT_APPLICABLE",
    ]),
    reproductionSteps: feedbackText.optional(),
    evidenceRef: evidence,
    component: z.enum([
      "PEMOHON",
      "PIC_PPSK",
      "POLISI",
      "BUKTI",
      "INVOIS",
      "AKSES",
      "ICT",
    ]),
    issueRef: z.string().regex(/^(?:GH-\d{1,8}|UAT-[A-Z0-9-]{3,32})$/),
  })
  .superRefine((item, ctx) => {
    if ((item.outcome === "PASS") !== (item.severity === null)) {
      ctx.addIssue({
        code: "custom",
        path: ["severity"],
        message: "Severity diperlukan bagi FAIL/BLOCKED sahaja.",
      });
    }
    if (item.outcome !== "PASS" && !item.reproductionSteps) {
      ctx.addIssue({ code: "custom", path: ["reproductionSteps"], message: "Nyatakan langkah untuk mengulang dapatan." });
    }
  });

export const actionSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("ASSIGN"),
    by: syntheticActor,
    team,
    assignee: syntheticActor,
  }),
  z.strictObject({
    type: z.literal("FIX"),
    by: syntheticActor,
    commit,
    resolution: feedbackText,
    testRef: z
      .string()
      .regex(/^tests\/(?:[a-z0-9_-]+\/)*[a-z0-9_.-]+\.(?:ts|tsx)$/i)
      .max(160)
      .refine((value) => !value.includes("..")),
  }),
  z.strictObject({
    type: z.literal("RETEST"),
    by: syntheticActor,
    result: z.enum(["PASS", "FAIL", "BLOCKED"]),
    actual: feedbackText,
    evidenceRef: evidence,
  }),
  z.strictObject({
    type: z.literal("REVIEW"),
    by: syntheticActor,
    result: z.enum(["VERIFIED_INTERNAL", "CHANGES_REQUESTED"]),
    note: feedbackText,
  }),
]);

export type Observation = z.infer<typeof recordSchema>;
export type Action = z.infer<typeof actionSchema>;
export const entrySchema = z.strictObject({
  at: z.iso.datetime(),
  event: z.union([recordSchema, actionSchema]),
});
export type Entry = z.infer<typeof entrySchema>;

type State =
  | "OPEN"
  | "ASSIGNED"
  | "FIX_RECORDED"
  | "PASS_CAPTURED"
  | "RETEST_PASSED"
  | "REOPENED"
  | "VERIFIED_INTERNAL";
export function summarizeObservation(entries: Entry[]) {
  const first = entries[0]?.event;
  if (!first || first.type !== "RECORD")
    throw new FeedbackError("Rekod awal tidak sah.");
  let state: State = first.outcome === "PASS" ? "PASS_CAPTURED" : "OPEN";
  let assignment: Extract<Action, { type: "ASSIGN" }> | null = null;
  let fix: Extract<Action, { type: "FIX" }> | null = null;
  let retest: Extract<Action, { type: "RETEST" }> | null = null;
  let review: Extract<Action, { type: "REVIEW" }> | null = null;
  let verifier = first.by;

  for (const { event } of entries.slice(1)) {
    if (state === "VERIFIED_INTERNAL")
      throw new FeedbackError(
        "Pengesahan dalaman telah dimuktamadkan untuk rekod ini.",
      );
    switch (event.type) {
      case "RECORD":
        throw new FeedbackError("Rekod awal hanya boleh ditulis sekali.");
      case "ASSIGN":
        if (!["OPEN", "ASSIGNED", "REOPENED"].includes(state))
          throw new FeedbackError("Penugasan tidak tersedia pada status ini.");
        assignment = event;
        state = "ASSIGNED";
        break;
      case "FIX":
        if (
          !assignment ||
          assignment.assignee !== event.by ||
          !["ASSIGNED", "REOPENED"].includes(state)
        )
          throw new FeedbackError(
            "Pembetulan memerlukan penanggungjawab yang ditetapkan.",
          );
        fix = event;
        retest = null;
        review = null;
        state = "FIX_RECORDED";
        break;
      case "RETEST":
        if (state !== "FIX_RECORDED" || !fix || fix.by === event.by)
          throw new FeedbackError(
            "Ujian semula memerlukan pembetulan dan penguji berasingan.",
          );
        retest = event;
        verifier = event.by;
        state = event.result === "PASS" ? "RETEST_PASSED" : "REOPENED";
        break;
      case "REVIEW":
        if (
          !["PASS_CAPTURED", "RETEST_PASSED"].includes(state) ||
          event.by === verifier ||
          event.by === fix?.by
        )
          throw new FeedbackError(
            "Semakan memerlukan hasil lulus dan penyemak berasingan.",
          );
        review = event;
        state =
          event.result === "VERIFIED_INTERNAL"
            ? "VERIFIED_INTERNAL"
            : "REOPENED";
        break;
    }
  }
  return { first, state, assignment, fix, retest, review };
}
