import { z } from "zod";

const finding = z.enum([
  "NO_UNITS",
  "NO_FLOORS",
  "EVIDENCE_INELIGIBLE",
  "EVIDENCE_UNVERIFIED",
]);
export const precheckResult = z.strictObject({
  source: z.enum(["SYNTHETIC_RULES", "MANUAL", "MANUAL_REQUIRED"]),
  findings: z.array(finding).max(4),
  reason: z.string().max(500).nullable(),
});
export type PrecheckResult = z.infer<typeof precheckResult>;

type CaseFacts = {
  units: number;
  floors: number;
  expectedEvidence: number;
  cleanEvidence: number;
  unverifiedEvidence: number;
};

export interface SyntheticPrecheckProvider {
  run(
    facts: Readonly<CaseFacts>,
    signal: AbortSignal,
  ): Promise<z.infer<typeof finding>[]>;
}

const trainingRules: SyntheticPrecheckProvider = {
  async run(facts) {
    const findings: z.infer<typeof finding>[] = [];
    if (!facts.units) findings.push("NO_UNITS");
    if (!facts.floors) findings.push("NO_FLOORS");
    if (
      !facts.expectedEvidence ||
      facts.cleanEvidence !== facts.expectedEvidence
    )
      findings.push("EVIDENCE_INELIGIBLE");
    if (facts.unverifiedEvidence) findings.push("EVIDENCE_UNVERIFIED");
    return findings;
  },
};

export function configuredPrecheckProvider(
  mode = process.env.STAYLINK_SYNTHETIC_PRECHECK_PROVIDER,
): SyntheticPrecheckProvider | null {
  return mode === "synthetic-rules" ? trainingRules : null;
}

export async function runSyntheticPrecheck(
  provider: SyntheticPrecheckProvider | null,
  facts: CaseFacts,
): Promise<PrecheckResult> {
  if (provider) {
    const controller = new AbortController();
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      const timedOut = new Promise<never>((_, reject) => {
        deadline = setTimeout(() => {
          controller.abort();
          reject(new Error("Semakan awal tamat masa."));
        }, 1000);
      });
      const findings = await Promise.race([
        provider.run(facts, controller.signal),
        timedOut,
      ]);
      return precheckResult.parse({
        source: "SYNTHETIC_RULES",
        findings,
        reason: null,
      });
    } catch {
      // Provider diagnostics can contain sensitive data. Keep them out of the review record.
    } finally {
      clearTimeout(deadline);
    }
  }
  return {
    source: "MANUAL_REQUIRED",
    findings: [],
    reason:
      "Semakan penyedia tidak tersedia. PIC perlu menyemak permohonan dan bukti secara manual.",
  };
}
