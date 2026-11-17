import { describe, expect, it } from "vitest";
import { premiseFloorsSchema, summarizePremiseFloors } from "../packages/shared/src/floor-summary.js";

const facilities = {
  toilets: 2, bathrooms: 1, sinks: 2,
  diningTables: 2, diningChairs: 8, fireExtinguishers: 2,
};
describe("premises floor summary", () => {
  it("calculates an accurate applicant-provided total", () => {
    const floors = [
      { floorLabel: "Tingkat Bawah", rooms: 0, beds: 0, workers: 0, areaSqm: 80, facilities },
      { floorLabel: "Tingkat 1", rooms: 4, beds: 16, workers: 16, areaSqm: 100.25, facilities },
      { floorLabel: "Tingkat 2", rooms: 5, beds: 20, workers: 20, areaSqm: 100.25, facilities },
      { floorLabel: "Tingkat 3", rooms: 4, beds: 16, workers: 16, areaSqm: 100.25, facilities },
    ];
    const totals = summarizePremiseFloors(floors);
    expect(totals).toMatchObject({
      floors: 4, rooms: 13, beds: 52, workers: 52,
      areaSqm: 380.75,
      facilities: { toilets: 8, bathrooms: 4, sinks: 8, diningTables: 8, diningChairs: 32, fireExtinguishers: 8 },
    });
  });
  it("rejects repeated floor labels", () => {
    const floor = { floorLabel: "Tingkat 1", rooms: 1, beds: 1, workers: 1, areaSqm: 10, facilities };
    expect(premiseFloorsSchema.safeParse([floor, { ...floor, floorLabel: "tingkat 1" }]).success).toBe(false);
  });
  it("rejects visually duplicate labels with repeated whitespace or fullwidth characters", () => {
    const floor = { floorLabel: "Tingkat 1", rooms: 1, beds: 1, workers: 1, areaSqm: 10, facilities };
    expect(premiseFloorsSchema.safeParse([floor, { ...floor, floorLabel: "Tingkat   1" }]).success).toBe(false);
    expect(premiseFloorsSchema.safeParse([floor, { ...floor, floorLabel: "Ｔｉｎｇｋａｔ １" }]).success).toBe(false);
  });
  it("rejects negative counts and employer allocations", () => {
    const floor = { floorLabel: "Aras 1", rooms: -1, beds: 1, workers: 1, areaSqm: 10, facilities };
    expect(premiseFloorsSchema.safeParse([floor]).success).toBe(false);
    expect(premiseFloorsSchema.safeParse([{ ...floor, rooms: 1, employerId: "not-permitted" }]).success).toBe(false);
  });
});
