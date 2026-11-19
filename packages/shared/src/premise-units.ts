import { z } from "zod";
import { normalizeFloorLabel as normalizeUnitLabel } from "./floor-identity.js";

export { normalizeUnitLabel };

export const premiseUnitsSaveSchema = z
  .strictObject({
    version: z.number().int().positive(),
    units: z
      .array(
        z.strictObject({
          unitId: z.uuid().optional(),
          unitLabel: z.string().trim().min(1).max(80),
          floorIds: z.array(z.uuid()).max(200),
        }),
      )
      .max(200),
  })
  .superRefine(({ units }, ctx) => {
    const labels = new Set<string>();
    const ids = new Set<string>();
    for (const [index, unit] of units.entries()) {
      const label = normalizeUnitLabel(unit.unitLabel);
      if (labels.has(label))
        ctx.addIssue({
          code: "custom",
          path: ["units", index, "unitLabel"],
          message: "Label unit tidak boleh berulang.",
        });
      labels.add(label);
      if (unit.unitId) {
        if (ids.has(unit.unitId))
          ctx.addIssue({
            code: "custom",
            path: ["units", index, "unitId"],
            message: "ID unit tidak boleh berulang.",
          });
        ids.add(unit.unitId);
      }
      if (new Set(unit.floorIds).size !== unit.floorIds.length)
        ctx.addIssue({
          code: "custom",
          path: ["units", index, "floorIds"],
          message: "Pautan tingkat tidak boleh berulang.",
        });
    }
  });

export type PremiseUnitInput = z.infer<
  typeof premiseUnitsSaveSchema
>["units"][number];
export type PremiseUnitsRecord = {
  version: number;
  premiseId: string | null;
  floors: { floorId: string; floorLabel: string }[];
  units: (PremiseUnitInput & { unitId: string })[];
  totals: { unitCount: number; declaredCount: number | null };
  inventoryStatus: "NOT_RECORDED" | "NOT_DECLARED" | "MATCHED" | "MISMATCH";
};
