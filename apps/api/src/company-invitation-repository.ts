import type { DelegationPrincipal } from "./oracle/delegation-principal.js";
import { db } from "./core.js";
type NewInvitation = {
  companyId: string;
  recipientId: string;
  authorityType: string;
  authorityEndsAt: Date | null;
  expiresAt: Date;
};

export const postgresCompanyInvitations = {
  async representative(userId: string, companyId: string) {
    return db.companyRepresentative.findUnique({
      where: { userId_companyId: { userId, companyId } },
    });
  },
  async preview(tokenHash: string) {
    return db.companyRepresentationInvitation.findUnique({
      where: { tokenHash },
      include: {
        company: {
          select: { name: true, registrationNumber: true, status: true },
        },
      },
    });
  },
  async representatives(companyId: string) {
    return db.companyRepresentative.findMany({
      where: { companyId },
      select: {
        id: true,
        userId: true,
        authorityType: true,
        startsAt: true,
        endsAt: true,
        status: true,
        canManageRepresentatives: true,
        user: { select: { name: true } },
      },
      orderBy: { startsAt: "asc" },
    });
  },
};

export type CompanyInvitationRepository = typeof postgresCompanyInvitations & {
  invite(
    data: NewInvitation,
    principal: DelegationPrincipal,
  ): Promise<{ id: string; raw: string }>;
  accept(raw: string, principal: DelegationPrincipal): Promise<{ id: string }>;
};
export type Representative = NonNullable<
  Awaited<ReturnType<CompanyInvitationRepository["representative"]>>
>;
export type InvitationPreview = NonNullable<
  Awaited<ReturnType<CompanyInvitationRepository["preview"]>>
>;
