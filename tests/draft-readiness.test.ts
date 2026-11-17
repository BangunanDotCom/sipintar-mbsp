import { describe, expect, it } from "vitest";
import { evaluateDraftReadiness } from "../packages/shared/src/draft-readiness.js";
import { emptyPremises } from "../packages/shared/src/premises.js";

const premises = {
  ...emptyPremises,
  address: "No 1 Jalan Contoh",
  postcode: "14000",
  lotNumber: "PT 123",
  locality: "Bukit Mertajam",
  districtId: "SPT" as const,
  latitude: 5.363,
  longitude: 100.462,
  buildingType: "Rumah kedai",
  currentUse: "Penginapan",
  involvedFloors: 1,
  accommodationUnits: 1,
  totalRooms: 2,
  floorAreaSqm: 100,
  proposedWorkers: 4,
  certificateType: "NOT_APPLICABLE" as const,
};
const floors = [{
  floorLabel: "Tingkat Bawah",
  rooms: 2, beds: 4, workers: 4, areaSqm: 100,
  facilities: {
    toilets: 1, bathrooms: 1, sinks: 1,
    diningTables: 1, diningChairs: 4, fireExtinguishers: 1,
  },
}];

describe("draft readiness", () => {
  it("reports incomplete drafts", () => {
    const result = evaluateDraftReadiness({ premises: emptyPremises, floors: [] });
    expect(result.readyForNextStage).toBe(false);
    expect(result.issues).toHaveLength(2);
  });
  it("reports complete and matching draft information", () => {
    const result = evaluateDraftReadiness({ premises, floors });
    expect(result.readyForNextStage).toBe(true);
    expect(result.issues).toEqual([]);
  });
  it("rejects duplicate floor labels even when totals match", () => {
    const result = evaluateDraftReadiness({
      premises: { ...premises, involvedFloors: 2, totalRooms: 4, proposedWorkers: 8, floorAreaSqm: 200 },
      floors: [...floors, { ...floors[0], floorLabel: "tingkat bawah" }],
    });
    expect(result.readyForNextStage).toBe(false);
    expect(result.floorsComplete).toBe(false);
  });
  it("reports discrepancies without approving the draft", () => {
    const result = evaluateDraftReadiness({
      premises: { ...premises, proposedWorkers: 6 }, floors,
    });
    expect(result.readyForNextStage).toBe(false);
    expect(result.consistent).toBe(false);
    expect(result.issues.join(" ")).toContain("Jumlah pekerja");
  });
});
