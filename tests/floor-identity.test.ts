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
  it("reserves explicit IDs before matching labels from older clients", () => {
    expect(reconcileFloorIds(stored, [
      { floorLabel: "Tingkat 1" }, { id: "floor-b", floorLabel: "Aras 2" },
    ], () => "new")).toEqual(["new", "floor-b"]);
  });
  it("requires explicit IDs only when the legacy label is ambiguous", () => {
    const floors = [
      { id: "floor-a", floorLabel: "Tingkat 1" },
      { id: "floor-b", floorLabel: "tingkat  1" },
    ];
    expect(() => reconcileFloorIds(floors, [{ floorLabel: "Tingkat 1" }], () => "new"))
      .toThrow("ambiguous");
    expect(reconcileFloorIds(floors, [
      { id: "floor-a", floorLabel: "Aras 1" },
      { id: "floor-b", floorLabel: "Aras 2" },
    ], () => "new")).toEqual(["floor-a", "floor-b"]);
  });
});
