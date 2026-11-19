import { z } from "zod";
import { supportingDocumentCategorySchema } from "./supporting-documents.js";

const scopeSchema = z.enum(["DRAFT", "UNIT", "FLOOR"]);
const ruleSchema = z.strictObject({
  requirement: z.string().trim().min(1),
  capacity: z.enum(["INDIVIDUAL", "COMPANY"]).optional(),
  premiseType: z.string().trim().min(1).optional(),
  condition: z.string().trim().min(1).optional(),
  scope: scopeSchema,
  alternatives: z.array(supportingDocumentCategorySchema).min(1),
  requireVerified: z.boolean(),
});
const policySchema = z.strictObject({
  version: z.string().trim().min(1).max(80),
  rules: z.array(ruleSchema).min(1).max(100),
});

export type Scope = z.infer<typeof scopeSchema>;
export type Evidence = {
  scope: Scope;
  targetId: string;
  category: string;
  scanStatus: string;
  verificationStatus: string;
};
export type PolicyContext = {
  capacity: "INDIVIDUAL" | "COMPANY";
  premiseType: string | null;
  facts: Readonly<Record<string, boolean>>;
  targets: Readonly<Record<Scope, readonly string[]>>;
  evidence: readonly Evidence[];
};

export function evaluateDocumentPolicy(config: unknown, context: PolicyContext) {
  if (config == null) return { status: "DISABLED" as const, version: null, issues: ["POLICY_DISABLED"] };
  const parsed = policySchema.safeParse(config);
  if (!parsed.success) return { status: "BLOCKED" as const, version: null, issues: ["POLICY_INVALID"] };
  const { rules, version } = parsed.data;
  const issues: string[] = [];
  const active = new Map<string, z.infer<typeof ruleSchema>>();
  for (const rule of rules) {
    if (rule.capacity && rule.capacity !== context.capacity) continue;
    if (rule.premiseType && context.premiseType && rule.premiseType !== context.premiseType) continue;
    if (rule.condition && Object.hasOwn(context.facts, rule.condition) && context.facts[rule.condition] === false) continue;
    if ((rule.premiseType && !context.premiseType) ||
        (rule.condition && !Object.hasOwn(context.facts, rule.condition))) {
      issues.push(`UNKNOWN_CONDITION:${rule.requirement}`);
      continue;
    }
    if (active.has(rule.requirement)) issues.push(`AMBIGUOUS_RULE:${rule.requirement}`);
    active.set(rule.requirement, rule);
  }
  if (!active.size) issues.push("NO_APPLICABLE_REQUIREMENTS");
  for (const rule of active.values()) {
    if (!context.targets[rule.scope].length) issues.push(`MISSING_SCOPE:${rule.requirement}`);
    for (const targetId of context.targets[rule.scope]) {
      const present = context.evidence.some((item) =>
        item.scope === rule.scope && item.targetId === targetId &&
        rule.alternatives.some((category) => category === item.category) &&
        item.scanStatus === "CLEAN" &&
        (item.verificationStatus === "VERIFIED" ||
          (!rule.requireVerified && item.verificationStatus === "UNVERIFIED")),
      );
      if (!present) issues.push(`MISSING_EVIDENCE:${rule.requirement}:${targetId}`);
    }
  }
  return { status: issues.length ? "BLOCKED" as const : "READY" as const, version, issues };
}
