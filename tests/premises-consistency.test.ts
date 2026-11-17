import { describe, expect, it } from "vitest";
import { comparePremisesTotals } from "../packages/shared/src/premises-consistency.js";
import type { FloorTotals } from "../packages/shared/src/floor-summary.js";

const totals: FloorTotals = {
  floors: 4, rooms: 13, beds: 52, workers: 52, areaSqm: 380.75,
  facilities: { toilets: 9, bathrooms: 8, sinks: 9, diningTables: 8, diningChairs: 34, fireExtinguishers: 8 },
};
describe("premises and floor consistency", () => {
  it("accepts matching declarations", () => {
    expect(comparePremisesTotals({
      involvedFloors: 4, totalRooms: 13, proposedWorkers: 52, floorAreaSqm: 380.75,
    }, totals)).toEqual([]);
  });
  it("identifies discrepancies without changing applicant data", () => {
    const mismatch = comparePremisesTotals({
      involvedFloors: 3, totalRooms: 13, proposedWorkers: 48, floorAreaSqm: 380.75,
    }, totals);
    expect(mismatch).toMatchObject([
      { field: "involvedFloors", declared: 3, calculated: 4 },
      { field: "proposedWorkers", declared: 48, calculated: 52 },
    ]);
  });
  it("ignores aggregate fields not yet filled in a draft", () => {
    expect(comparePremisesTotals({
      involvedFloors: null, totalRooms: null, proposedWorkers: null, floorAreaSqm: null,
    }, totals)).toEqual([]);
    expect(comparePremisesTotals(null, totals)).toEqual([]);
  });
});
