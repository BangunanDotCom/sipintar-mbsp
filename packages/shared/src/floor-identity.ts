/**
 * Stable identity reconciliation for existing floor rows.
 * This helper is pure; callers must persist the resulting IDs in one transaction.
 * Existing clients do not send IDs, so exact label matching is a compatibility fallback.
 * A label change without an explicit ID cannot be inferred safely.
 */
export type StoredFloorIdentity = { id: string; floorLabel: string };
export type IncomingFloorIdentity = { id?: string; floorLabel: string };

export function reconcileFloorIds(
  existing: readonly StoredFloorIdentity[],
  incoming: readonly IncomingFloorIdentity[],
  newId: () => string,
): string[] {
  const byId = new Map(existing.map((floor) => [floor.id, floor]));
  const normalized = (label: string) =>
    label.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase("ms-MY");
  const byLabel = new Map<string, string>();
  for (const floor of existing) {
    const key = normalized(floor.floorLabel);
    if (byLabel.has(key)) throw new Error("Existing floor labels are ambiguous.");
    byLabel.set(key, floor.id);
  }
  const used = new Set<string>();
  return incoming.map((floor) => {
    let id: string;
    if (floor.id !== undefined) {
      if (!byId.has(floor.id)) throw new Error("Floor ID does not belong to this draft.");
      id = floor.id;
    } else {
      id = byLabel.get(normalized(floor.floorLabel)) ?? newId();
    }
    if (used.has(id)) throw new Error("A floor identity cannot be submitted twice.");
    used.add(id);
    return id;
  });
}
