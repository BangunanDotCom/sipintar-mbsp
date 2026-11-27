import { Prisma } from "@prisma/client";
import { fail } from "./auth.js";

type Tx = Prisma.TransactionClient;
type StaffSession = {
  id: string;
  userId: string;
  activeRole: string | null;
  csrfHash: string;
};
type Scope = { district: string; allowGlobal: boolean } | { globalOnly: true };

export async function assertStaffAuthority(
  tx: Tx,
  operator: StaffSession,
  permission: string,
  scope?: Scope,
) {
  let districtFilter = Prisma.empty;
  if (scope) {
    districtFilter =
      "globalOnly" in scope
        ? Prisma.sql`AND a."districtId" IS NULL`
        : Prisma.sql`AND (a."districtId"=${scope.district}
        OR (${scope.allowGlobal} AND a."districtId" IS NULL))`;
  }
  const [result] = await tx.$queryRaw<{ allowed: boolean }[]>`
    WITH now AS MATERIALIZED (SELECT clock_timestamp() AT TIME ZONE 'UTC' AS instant)
    SELECT EXISTS (
      SELECT 1 FROM sessions s
      JOIN users u ON u.id=s."userId"
      JOIN user_role_assignments a ON a."userId"=u.id AND a."roleId"=s."activeRole"
      JOIN permissions p ON p."roleId"=a."roleId" AND p.action=${permission}
      CROSS JOIN now
      WHERE s.id=${operator.id} AND s."userId"=${operator.userId}
        AND s."activeRole"=${operator.activeRole} AND s."csrfHash"=${operator.csrfHash}
        AND s."mfaVerified" AND s."expiresAt">now.instant
        AND u.kind='OFFICER' AND u.status='ACTIVE' AND u."emailVerified"
        AND a.status='ACTIVE' AND a."startsAt"<=now.instant
        AND (a."endsAt" IS NULL OR a."endsAt">now.instant)
        ${districtFilter}
    ) AS allowed`;
  if (!result?.allowed)
    fail(403, "Kuasa atau sesi pegawai sudah berubah. Muat semula halaman.");
}

export async function withStaffAuthority<T>(
  tx: Tx,
  operator: StaffSession,
  permission: string,
  mutate: () => Promise<T>,
  options: { targets?: string[]; scope?: Scope } = {},
) {
  // Lock actors and affected users in the same order across protected writes.
  const ids = [...new Set([operator.userId, ...(options.targets ?? [])])];
  await tx.$queryRaw`SELECT id FROM users WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR NO KEY UPDATE`;
  await tx.$queryRaw`SELECT id FROM user_role_assignments
    WHERE "userId"=${operator.userId} AND "roleId"=${operator.activeRole} ORDER BY id FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM sessions WHERE id=${operator.id} FOR SHARE`;
  await assertStaffAuthority(tx, operator, permission, options.scope);
  const result = await mutate();
  await assertStaffAuthority(tx, operator, permission, options.scope);
  return result;
}
