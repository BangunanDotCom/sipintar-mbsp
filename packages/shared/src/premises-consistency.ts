import type { FloorTotals } from "./floor-summary.js";

export type PremisesAggregate = {
  involvedFloors: number | null;
  totalRooms: number | null;
  proposedWorkers: number | null;
  floorAreaSqm: number | null;
};
export type AggregateMismatch = {
  field: keyof PremisesAggregate;
  label: string;
  declared: number;
  calculated: number;
};
const mappings = [
  ["involvedFloors", "Bilangan tingkat", "floors"],
  ["totalRooms", "Bilangan bilik", "rooms"],
  ["proposedWorkers", "Jumlah pekerja", "workers"],
  ["floorAreaSqm", "Keluasan lantai (m²)", "areaSqm"],
] as const;

export function comparePremisesTotals(
  declared: PremisesAggregate | null | undefined,
  totals: FloorTotals,
): AggregateMismatch[] {
  if (!declared) return [];
  const issues: AggregateMismatch[] = [];
  for (const [field, label, totalKey] of mappings) {
    const value = declared[field];
    if (value === null || value === undefined) continue;
    const calculated = totals[totalKey];
    if (Math.abs(value - calculated) > (field === "floorAreaSqm" ? 0.005 : 0)) {
      issues.push({ field, label, declared: value, calculated });
    }
  }
  return issues;
}
