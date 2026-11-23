import { summarizeDocumentRequirements } from "../packages/shared/src/document-policy";
import { expect, it } from "vitest";
import {
  loadSyntheticOwnerPolicy,
  syntheticDocumentFacts,
} from "../apps/api/src/synthetic-owner-policy";

const baseline = loadSyntheticOwnerPolicy()!.config;
const read = (patch: Record<string, unknown>) =>
  loadSyntheticOwnerPolicy(JSON.stringify({ ...baseline, ...patch }));

it("keeps the default and explicit policy synthetic with immutable official safeguards", () => {
  const policy = read({});
  expect(policy).toMatchObject({
    custom: true,
    config: {
      mode: "SYNTHETIC",
      records: { mode: "DISABLED" },
      security: { mode: "ENFORCED" },
    },
  });
  for (const patch of [
    { mode: "PRODUCTION" },
    { approval: { signed: true } },
    { reference: { strategy: "OFFICIAL" } },
    { security: { mode: "OFF" } },
    { records: { mode: "ACTIVE" } },
    { billing: { mode: "LIVE" } },
    {
      billing: {
        mode: "MOCK",
        currency: "MYR",
        unitFeeSen: 1000,
        ttlMinutes: 30,
      },
    },
    {
      billing: {
        mode: "MOCK",
        currency: "MYR",
        unitFeeSen: 5000,
        ttlMinutes: 999,
      },
    },
    { review: { enabled: false, assignment: "DISTRICT_FIXTURE" } },
  ])
    expect(read(patch)).toBeNull();
  expect(
    read({
      review: { enabled: false, assignment: "DISTRICT_FIXTURE" },
      billing: { mode: "DISABLED" },
    }),
  ).not.toBeNull();
});

it("rejects malformed and oversized configurations and detects edits that reuse the same version", () => {
  expect(loadSyntheticOwnerPolicy("")).toBeNull();
  expect(loadSyntheticOwnerPolicy("{oops")).toBeNull();
  expect(loadSyntheticOwnerPolicy("x".repeat(16_385))).toBeNull();
  const original = read({})!;
  const reordered = loadSyntheticOwnerPolicy(
    JSON.stringify(Object.fromEntries(Object.entries(baseline).reverse())),
  );
  expect(reordered?.fingerprint).toBe(original.fingerprint);
  expect(
    read({
      declaration: {
        ...baseline.declaration,
        text: "Akuan sintetik telah disemak semula.",
      },
    })?.fingerprint,
  ).not.toBe(original.fingerprint);
});

it("uses only facts that can be resolved by a synthetic inventory", () => {
  expect(syntheticDocumentFacts(2, "CCC")).toEqual({
    multipleUnits: true,
    hasBuildingCertificate: true,
  });
  expect(syntheticDocumentFacts(1, "NOT_APPLICABLE")).toEqual({
    multipleUnits: false,
    hasBuildingCertificate: false,
  });
  expect(syntheticDocumentFacts(1, "UNKNOWN")).toEqual({
    multipleUnits: false,
  });
});

it("reports scoped evidence coverage while distinguishing each applicability state", () => {
  const rule = baseline.documents.rules[0];
  const result = summarizeDocumentRequirements(
    {
      ...baseline.documents,
      rules: [
        rule,
        { ...rule, requirement: "conditional", condition: "multipleUnits" },
        { ...rule, requirement: "company", capacity: "COMPANY" },
        {
          ...rule,
          requirement: "certificate",
          condition: "hasBuildingCertificate",
        },
      ],
    },
    {
      capacity: "INDIVIDUAL",
      premiseType: "SHOP",
      facts: { multipleUnits: true },
      targets: { DRAFT: ["draft-a"], UNIT: [], FLOOR: ["floor-a", "floor-b"] },
      evidence: [
        {
          category: "floor_layout",
          scope: "FLOOR",
          targetId: "floor-a",
          scanStatus: "CLEAN",
          verificationStatus: "UNVERIFIED",
        },
      ],
    },
  );
  expect(
    result.map(({ applicability, eligibleTargets, requiredTargets }) => [
      applicability,
      eligibleTargets,
      requiredTargets,
    ]),
  ).toEqual([
    ["REQUIRED", 1, 2],
    ["CONDITIONAL", 1, 2],
    ["NOT_APPLICABLE", 0, 0],
    ["UNKNOWN", 0, 0],
  ]);
});
