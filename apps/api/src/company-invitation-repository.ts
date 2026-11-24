import { db } from "./core.js";
import { fail } from "./auth.js";
import { isCurrent } from "../../../packages/shared/src/index.js";
import {
  validRepresentative,
  managesRepresentatives,
} from "./company-representative-policy.js";

type NewInvitation = {
  companyId: string;
  recipientId: string;
  invitedBy: string;
  authorityType: string;
  authorityEndsAt: Date | null;
  tokenHash: string;
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
  async invite(data: NewInvitation) {
    return db.companyRepresentationInvitation.create({
      data,
      select: { id: true },
    });
  },
  async accept(tokenHash: string, userId: string, activeRole: string | null) {
    return db.$transaction(async (tx) => {
      const invitation = await tx.companyRepresentationInvitation.findUnique({
        where: { tokenHash: tokenHash },
        include: { company: true },
      });
      const now = new Date();
      if (
        !invitation ||
        invitation.recipientId !== userId ||
        invitation.acceptedAt ||
        invitation.expiresAt <= now ||
        invitation.company.status !== "ACTIVE" ||
        (invitation.authorityEndsAt && invitation.authorityEndsAt <= now)
      )
        fail(400, "Jemputan tidak sah, luput atau bukan untuk akaun ini.");
      const inviter = await tx.companyRepresentative.findUnique({
        where: {
          userId_companyId: {
            userId: invitation.invitedBy,
            companyId: invitation.companyId,
          },
        },
        include: {
          user: {
            include: {
              roles: { include: { role: { include: { permissions: true } } } },
            },
          },
        },
      });
      if (
        !inviter ||
        !validRepresentative(inviter, now) ||
        !managesRepresentatives(inviter) ||
        inviter.user.status !== "ACTIVE" ||
        !inviter.user.emailVerified ||
        !inviter.user.roles.some(
          (a) =>
            isCurrent(a, now) &&
            a.role.permissions.some((p) => p.action === "companies"),
        )
      )
        fail(403, "Kuasa pemberi jemputan tidak lagi aktif.");
      const claimed = await tx.companyRepresentationInvitation.updateMany({
        where: { id: invitation.id, acceptedAt: null, expiresAt: { gt: now } },
        data: { acceptedAt: now },
      });
      if (!claimed.count) fail(400, "Jemputan telah digunakan.");
      const r = await tx.companyRepresentative.create({
        data: {
          userId: userId,
          companyId: invitation.companyId,
          authorityType: invitation.authorityType,
          endsAt: invitation.authorityEndsAt,
          status: "UNVERIFIED",
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          activeRole: activeRole,
          action: "COMPANY_INVITATION_ACCEPTED",
          target: r.id,
        },
      });
      return { id: r.id };
    });
  },
};

export type CompanyInvitationRepository = typeof postgresCompanyInvitations;
export type Representative = NonNullable<
  Awaited<ReturnType<CompanyInvitationRepository["representative"]>>
>;
export type InvitationPreview = NonNullable<
  Awaited<ReturnType<CompanyInvitationRepository["preview"]>>
>;
