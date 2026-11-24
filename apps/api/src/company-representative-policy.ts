export function validRepresentative(
  r: { status: string; startsAt: Date; endsAt: Date | null },
  now = new Date(),
) {
  return (
    r.status !== "REVOKED" && r.startsAt <= now && (!r.endsAt || r.endsAt > now)
  );
}
export function managesRepresentatives(r: {
  status: string;
  canManageRepresentatives: boolean;
}) {
  return r.canManageRepresentatives || r.status === "VERIFIED";
}
