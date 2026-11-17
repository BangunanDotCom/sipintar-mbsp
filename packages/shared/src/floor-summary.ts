import { z } from "zod";

// Building Department records premises totals only. Employer-specific allocation
// and worker capacity determinations belong to JTK.
export const floorFacilitySchema = z.object({
  toilets: z.number().int().min(0).max(100000),
  bathrooms: z.number().int().min(0).max(100000),
  sinks: z.number().int().min(0).max(100000),
  diningTables: z.number().int().min(0).max(100000),
  diningChairs: z.number().int().min(0).max(100000),
  fireExtinguishers: z.number().int().min(0).max(100000),
}).strict();

export const premiseFloorSchema = z.object({
  floorLabel: z.string().trim().min(1).max(80),
  rooms: z.number().int().min(0).max(100000),
  beds: z.number().int().min(0).max(100000),
  workers: z.number().int().min(0).max(100000),
  areaSqm: z.number().min(0).max(100000000).multipleOf(0.01),
  facilities: floorFacilitySchema,
}).strict();

export const premiseFloorsSchema = z.array(premiseFloorSchema)
  .min(1).max(200)
  .superRefine((floors, ctx) => {
    const seen = new Set<string>();
    floors.forEach((floor, index) => {
      // Treat visually equivalent labels as the same floor (Unicode width and whitespace).
      const key = floor.floorLabel.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase("ms-MY");
      if (seen.has(key)) ctx.addIssue({
        code: "custom", path: [index, "floorLabel"],
        message: "Nama tingkat tidak boleh berulang.",
      });
      seen.add(key);
    });
  });

export type PremiseFloor = z.infer<typeof premiseFloorSchema>;
export type FloorTotals = {
  floors: number;
  rooms: number;
  beds: number;
  workers: number;
  areaSqm: number;
  facilities: z.infer<typeof floorFacilitySchema>;
};

export function summarizePremiseFloors(floors: PremiseFloor[]): FloorTotals {
  const valid = premiseFloorsSchema.parse(floors);
  const facilities = {
    toilets: 0, bathrooms: 0, sinks: 0,
    diningTables: 0, diningChairs: 0, fireExtinguishers: 0,
  };
  const totals: FloorTotals = {
    floors: valid.length, rooms: 0, beds: 0, workers: 0,
    areaSqm: 0, facilities,
  };
  for (const floor of valid) {
    totals.rooms += floor.rooms;
    totals.beds += floor.beds;
    totals.workers += floor.workers;
    totals.areaSqm += floor.areaSqm;
    for (const key of Object.keys(facilities) as (keyof typeof facilities)[])
      facilities[key] += floor.facilities[key];
  }
  totals.areaSqm = Math.round(totals.areaSqm * 100) / 100;
  if (!Number.isSafeInteger(totals.rooms) || !Number.isSafeInteger(totals.beds) ||
      !Number.isSafeInteger(totals.workers))
    throw new Error("Jumlah keseluruhan melebihi had pengiraan.");
  return totals;
}
