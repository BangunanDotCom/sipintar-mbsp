import { z } from "zod";
import { createHash } from "node:crypto";
import { documentPolicySchema } from "../../../packages/shared/src/document-policy.js";

export const MOCK_UNIT_FEE_SEN = 5000;

// Official owners, approvals and providers cannot be declared by this fixture.
const version = z.string().regex(/^SYNTHETIC-[A-Za-z0-9][A-Za-z0-9_.-]{0,68}$/);
const policySchema = z
  .strictObject({
    mode: z.literal("SYNTHETIC"),
    version,
    documents: documentPolicySchema.extend({
      version,
      rules: documentPolicySchema.shape.rules.max(20),
    }),
    declaration: z.strictObject({
      version,
      text: z.string().trim().min(10).max(1200),
    }),
    review: z.strictObject({
      enabled: z.boolean(),
      assignment: z.literal("DISTRICT_FIXTURE"),
    }),
    reference: z.strictObject({ strategy: z.literal("SYNTHETIC_UUID") }),
    records: z.strictObject({ mode: z.literal("DISABLED") }),
    security: z.strictObject({ mode: z.literal("ENFORCED") }),
    billing: z.discriminatedUnion("mode", [
      z.strictObject({ mode: z.literal("DISABLED") }),
      z.strictObject({
        mode: z.literal("MOCK"),
        currency: z.literal("MYR"),
        unitFeeSen: z.literal(MOCK_UNIT_FEE_SEN),
        ttlMinutes: z.number().int().min(5).max(120),
      }),
    ]),
  })
  .refine(
    (policy) => policy.review.enabled || policy.billing.mode === "DISABLED",
  );

const defaultPolicy = {
  mode: "SYNTHETIC",
  version: "SYNTHETIC-BASELINE-v1",
  documents: {
    version: "SYNTHETIC-K04-v1",
    rules: [
      {
        requirement: "layout",
        scope: "FLOOR",
        alternatives: ["floor_layout"],
        requireVerified: false,
      },
    ],
  },
  declaration: {
    version: "SYNTHETIC-K05-v1",
    text: "Saya mengesahkan bahawa permohonan ini menggunakan data latihan sintetik untuk simulasi STAYLink MBSP.",
  },
  review: { enabled: true, assignment: "DISTRICT_FIXTURE" },
  reference: { strategy: "SYNTHETIC_UUID" },
  records: { mode: "DISABLED" },
  security: { mode: "ENFORCED" },
  billing: { mode: "MOCK", currency: "MYR", unitFeeSen: MOCK_UNIT_FEE_SEN, ttlMinutes: 60 },
};

export function loadSyntheticOwnerPolicy(
  raw = process.env.STAYLINK_SYNTHETIC_POLICY_JSON,
) {
  if (raw !== undefined && Buffer.byteLength(raw) > 16_384) return null;
  try {
    const parsed = policySchema.safeParse(
      raw === undefined ? defaultPolicy : JSON.parse(raw),
    );
    if (!parsed.success) return null;
    const config = parsed.data;
    return {
      config,
      fingerprint: createHash("sha256")
        .update(JSON.stringify(config))
        .digest("hex"),
      custom: raw !== undefined,
    };
  } catch {
    return null;
  }
}

export type SyntheticOwnerPolicy = NonNullable<
  ReturnType<typeof loadSyntheticOwnerPolicy>
>;

export function syntheticDocumentFacts(
  units: number,
  certificateType: string | null,
) {
  return {
    multipleUnits: units > 1,
    ...(["CCC", "CFO", "OC", "NOT_APPLICABLE"].includes(certificateType ?? "")
      ? { hasBuildingCertificate: certificateType !== "NOT_APPLICABLE" }
      : {}),
  };
}
