/**
 * Stable identity reconciliation for existing floor rows.
 * This helper is pure; callers must persist the resulting IDs in one transaction.
 * Existing clients do not send IDs, so normalized label matching is a compatibility fallback.
 * A label change without an explicit ID cannot be inferred safely.
 */
export type StoredFloorIdentity = { id: string; floorLabel: string };
export type IncomingFloorIdentity = { id?: string; floorLabel: string };

export class FloorIdentityError extends Error {
  constructor(public readonly reason: "unknown" | "duplicate" | "ambiguous") {
    super({
      unknown: "Floor ID does not belong to this draft.",
      duplicate: "A floor identity cannot be submitted twice.",
      ambiguous: "Existing floor labels are ambiguous.",
    }[reason]);
  }
}

export function normalizeFloorLabel(label: string): string {
  return label.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase("ms-MY");
}

export function reconcileFloorIds(
  existing: readonly StoredFloorIdentity[],
  incoming: readonly IncomingFloorIdentity[],
  newId: () => string,
): string[] {
  const existingIds = new Set(existing.map((floor) => floor.id));
  const explicitIds = new Set<string>();
  for (const { id } of incoming) {
    if (id === undefined) continue;
    if (!existingIds.has(id)) throw new FloorIdentityError("unknown");
    if (explicitIds.has(id)) throw new FloorIdentityError("duplicate");
    explicitIds.add(id);
  }

  const byLabel = new Map<string, string | null>();
  for (const floor of existing) {
    if (explicitIds.has(floor.id)) continue;
    const key = normalizeFloorLabel(floor.floorLabel);
    byLabel.set(key, byLabel.has(key) ? null : floor.id);
  }
  return incoming.map((floor) => {
    if (floor.id !== undefined) return floor.id;
    const label = normalizeFloorLabel(floor.floorLabel);
    const id = byLabel.get(label);
    if (id === null) throw new FloorIdentityError("ambiguous");
    byLabel.delete(label);
    return id ?? newId();
  });
}
