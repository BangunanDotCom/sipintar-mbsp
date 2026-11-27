import type { CompletionRole } from "../../../packages/shared/src/synthetic-completion-contract.js";
import type { Prisma } from "@prisma/client";
import { isCurrent } from "../../../packages/shared/src/index.js";
import { fail } from "./auth.js";

export type ObservedPortalSession = {
  id: string;
  userId: string;
  csrfHash: string;
  activeRole: string | null;
};

// Mutations pair the permission read with the write transaction. Role or session
// revocation that wins first prevents the action from producing an audit event.
export async function lockSyntheticPortalSession(
  tx: Prisma.TransactionClient,
  operator: ObservedPortalSession,
  roleId: CompletionRole,
  districtId?: string,
) {
  const applicant = roleId === "PEMOHON" || roleId === "WAKIL_SYARIKAT";
  const permission = applicant
    ? "applications.draft"
    : roleId === "PIC_KAWASAN" || roleId === "PPSK"
      ? "areas.read"
      : "profile";
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${operator.userId} FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM user_role_assignments
      WHERE "userId" = ${operator.userId} AND "roleId" = ${roleId} FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM sessions WHERE id = ${operator.id} FOR SHARE`;
  const [{ now }] = await tx.$queryRaw<
    { now: Date }[]
  >`SELECT clock_timestamp() AS now`;
  const active = await tx.session.findFirst({
    where: {
      id: operator.id,
      userId: operator.userId,
      activeRole: roleId,
      csrfHash: operator.csrfHash,
      expiresAt: { gt: now },
      ...(applicant ? {} : { mfaVerified: true }),
      user: {
        status: "ACTIVE",
        emailVerified: true,
        kind: applicant ? "APPLICANT" : "OFFICER",
      },
    },
    select: {
      user: {
        select: {
          identificationHash: true,
          roles: {
            where: {
              roleId,
              districtId,
              role: { permissions: { some: { action: permission } } },
            },
            select: { status: true, startsAt: true, endsAt: true },
          },
        },
      },
    },
  });
  if (
    !active ||
    (applicant && !active.user.identificationHash) ||
    !active.user.roles.some((item) => isCurrent(item, now))
  )
    fail(403, "Tugasan atau sesi portal sudah berubah. Muat semula halaman.");
}

export async function lockSyntheticApplicantSession(
  tx: Prisma.TransactionClient,
  operator: ObservedPortalSession,
) {
  const role = operator.activeRole;
  if (role !== "PEMOHON" && role !== "WAKIL_SYARIKAT")
    fail(403, "Peranan pemohon atau wakil diperlukan untuk latihan.");
  await lockSyntheticPortalSession(tx, operator, role);
  return role;
}
