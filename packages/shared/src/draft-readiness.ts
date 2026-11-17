import { z } from "zod";
import { completePremisesSchema, type PremisesFields } from "./premises.js";
import { premiseFloorsSchema, summarizePremiseFloors } from "./floor-summary.js";
import { comparePremisesTotals } from "./premises-consistency.js";

export const draftReadinessSchema = z.object({
  premises: z.unknown(),
  floors: z.unknown(),
});
export type DraftReadiness = {
  readyForNextStage: boolean;
  premisesComplete: boolean;
  floorsComplete: boolean;
  consistent: boolean;
  issues: string[];
};
export function evaluateDraftReadiness(input: {
  premises: unknown;
  floors: unknown;
}): DraftReadiness {
  const premises = completePremisesSchema.safeParse(input.premises);
  const floors = premiseFloorsSchema.safeParse(input.floors);
  const issues: string[] = [];
  if (!premises.success) issues.push("Maklumat premis belum lengkap atau tidak sah.");
  if (!floors.success) issues.push("Butiran penginapan mengikut tingkat belum lengkap atau tidak sah.");
  let consistent = false;
  if (premises.success && floors.success) {
    const totals = summarizePremiseFloors(floors.data);
    const mismatches = comparePremisesTotals(premises.data as PremisesFields, totals);
    consistent = mismatches.length === 0;
    for (const mismatch of mismatches) {
      issues.push(`${mismatch.label}: maklumat premis ${mismatch.declared}, jumlah tingkat ${mismatch.calculated}.`);
    }
  }
  return {
    readyForNextStage: premises.success && floors.success && consistent,
    premisesComplete: premises.success,
    floorsComplete: floors.success,
    consistent,
    issues,
  };
}
