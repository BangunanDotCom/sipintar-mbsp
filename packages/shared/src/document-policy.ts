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
export const documentPolicySchema = z.strictObject({
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

export function documentRuleApplicability(
  rule: z.infer<typeof ruleSchema>,
  context: Pick<PolicyContext, "capacity" | "premiseType" | "facts">,
) {
  if (
    (rule.capacity && rule.capacity !== context.capacity) ||
    (rule.premiseType &&
      context.premiseType &&
      rule.premiseType !== context.premiseType)
  )
    return "NOT_APPLICABLE" as const;
  if (
    rule.condition &&
    Object.hasOwn(context.facts, rule.condition) &&
    context.facts[rule.condition] === false
  )
    return "NOT_APPLICABLE" as const;
  if (
    (rule.premiseType && !context.premiseType) ||
    (rule.condition && !Object.hasOwn(context.facts, rule.condition))
  )
    return "UNKNOWN" as const;
  return rule.condition ? ("CONDITIONAL" as const) : ("REQUIRED" as const);
}

export function evaluateDocumentPolicy(
  config: unknown,
  context: PolicyContext,
) {
  if (config == null)
    return {
      status: "DISABLED" as const,
      version: null,
      issues: ["POLICY_DISABLED"],
    };
  const parsed = documentPolicySchema.safeParse(config);
  if (!parsed.success)
    return {
      status: "BLOCKED" as const,
      version: null,
      issues: ["POLICY_INVALID"],
    };
  const { rules, version } = parsed.data;
  const issues: string[] = [];
  const active = new Map<string, z.infer<typeof ruleSchema>>();
  for (const rule of rules) {
    const applicability = documentRuleApplicability(rule, context);
    if (applicability === "NOT_APPLICABLE") continue;
    if (applicability === "UNKNOWN") {
      issues.push(`UNKNOWN_CONDITION:${rule.requirement}`);
      continue;
    }
    if (active.has(rule.requirement))
      issues.push(`AMBIGUOUS_RULE:${rule.requirement}`);
    active.set(rule.requirement, rule);
  }
  if (!active.size) issues.push("NO_APPLICABLE_REQUIREMENTS");
  for (const rule of active.values()) {
    if (!context.targets[rule.scope].length)
      issues.push(`MISSING_SCOPE:${rule.requirement}`);
    for (const targetId of context.targets[rule.scope]) {
      const present = context.evidence.some(
        (item) =>
          item.scope === rule.scope &&
          item.targetId === targetId &&
          rule.alternatives.some((category) => category === item.category) &&
          item.scanStatus === "CLEAN" &&
          (item.verificationStatus === "VERIFIED" ||
            (!rule.requireVerified &&
              item.verificationStatus === "UNVERIFIED")),
      );
      if (!present)
        issues.push(`MISSING_EVIDENCE:${rule.requirement}:${targetId}`);
    }
  }
  return {
    status: issues.length ? ("BLOCKED" as const) : ("READY" as const),
    version,
    issues,
  };
}
