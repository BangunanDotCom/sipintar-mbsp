import { describe, expect, it } from "vitest";
import { reconcileFloorIds } from "../packages/shared/src/floor-identity.js";

describe("reconcileFloorIds", () => {
  const stored = [
    { id: "floor-a", floorLabel: "Tingkat Bawah" },
    { id: "floor-b", floorLabel: "Tingkat 1" },
  ];
  it("preserves IDs for legacy label-based edits and reordering", () => {
    expect(reconcileFloorIds(stored, [
      { floorLabel: "tingkat 1" }, { floorLabel: "Tingkat Bawah" },
    ], () => "new")).toEqual(["floor-b", "floor-a"]);
  });
  it("preserves explicit ID when a label is renamed", () => {
    expect(reconcileFloorIds(stored, [{ id: "floor-b", floorLabel: "Aras Satu" }], () => "new"))
      .toEqual(["floor-b"]);
  });
  it("creates an ID for a new floor", () => {
    expect(reconcileFloorIds(stored, [{ floorLabel: "Tingkat 2" }], () => "floor-c"))
      .toEqual(["floor-c"]);
  });
  it("rejects cross-draft IDs", () => {
    expect(() => reconcileFloorIds(stored, [{ id: "foreign", floorLabel: "Tingkat 2" }], () => "new"))
      .toThrow("does not belong");
  });
  it("rejects repeated identities", () => {
    expect(() => reconcileFloorIds(stored, [
      { id: "floor-a", floorLabel: "A" }, { id: "floor-a", floorLabel: "B" },
    ], () => "new")).toThrow("twice");
  });
});
