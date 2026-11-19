import { expect, it } from "vitest";
import { evaluateDocumentPolicy, type PolicyContext } from "../packages/shared/src/document-policy";
const rule = {
  requirement: "plan", capacity: "INDIVIDUAL", premiseType: "SHOP", condition: "layout",
  scope: "FLOOR", alternatives: ["floor_layout", "premises_plan"], requireVerified: false,
};
const policy = { version: "SYNTHETIC-v1", rules: [rule] };
const context: PolicyContext = {
  capacity: "INDIVIDUAL", premiseType: "SHOP", facts: { layout: true },
  targets: { DRAFT: ["draft-a"], UNIT: [], FLOOR: ["floor-a"] },
  evidence: [{ scope: "FLOOR", targetId: "floor-a", category: "premises_plan", scanStatus: "CLEAN", verificationStatus: "UNVERIFIED" }],
};
it("uses an alternative only for the required scope and target", () => {
  expect(evaluateDocumentPolicy(policy, context).status).toBe("READY");
  expect(evaluateDocumentPolicy(policy, { ...context, targets: { ...context.targets, FLOOR: ["floor-b"] } }).status).toBe("BLOCKED");
});
it("fails closed on missing configuration, facts, competing rules and verification", () => {
  expect(evaluateDocumentPolicy(undefined, context).status).toBe("DISABLED");
  expect(evaluateDocumentPolicy(policy, { ...context, facts: {} }).status).toBe("BLOCKED");
  expect(evaluateDocumentPolicy({ ...policy, rules: [rule, rule] }, context).status).toBe("BLOCKED");
  expect(evaluateDocumentPolicy({ ...policy, rules: [{ ...rule, requireVerified: true }] }, context).status).toBe("BLOCKED");
  for (const scanStatus of ["PENDING", "FAILED", "INFECTED", "UNKNOWN"]) {
    expect(evaluateDocumentPolicy(policy, { ...context, evidence: [{ ...context.evidence[0], scanStatus }] }).status).toBe("BLOCKED");
  }
});
