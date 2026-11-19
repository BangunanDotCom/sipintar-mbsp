import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { premiseUnitsSaveSchema } from "../packages/shared/src/premise-units";

describe("K02 unit input", () => {
  it("accepts one physical unit with multiple floors and permits a saved unlink", () => {
    const unit = {
      unitId: randomUUID(),
      unitLabel: "Kedai A",
      floorIds: [randomUUID(), randomUUID()],
    };
    expect(
      premiseUnitsSaveSchema.parse({ version: 1, units: [unit] }).units,
    ).toEqual([unit]);
    expect(
      premiseUnitsSaveSchema.safeParse({
        version: 1,
        units: [{ ...unit, floorIds: [] }],
      }).success,
    ).toBe(true);
  });

  it("rejects equivalent labels, repeated IDs and repeated links", () => {
    const unit = {
      unitId: randomUUID(),
      unitLabel: "Kedai A",
      floorIds: [randomUUID()],
    };
    for (const units of [
      [unit, { unitLabel: "ＫＥＤＡＩ  ａ", floorIds: [] }],
      [unit, { ...unit, unitLabel: "Kedai B" }],
      [{ ...unit, floorIds: [...unit.floorIds, ...unit.floorIds] }],
      [{ ...unit, chargeable: true }],
    ]) {
      expect(
        premiseUnitsSaveSchema.safeParse({ version: 1, units }).success,
      ).toBe(false);
    }
  });
});
