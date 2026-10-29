import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { db, audit, notify, hash, token, origin } from "./core.js";
import { authorize, fail } from "./auth.js";
import { isCurrent } from "../../../packages/shared/src/index.js";
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
async function own(req: any, companyId: string, manage = false) {
  const s = await authorize(req, "companies");
  const r = await db.companyRepresentative.findUnique({
    where: { userId_companyId: { userId: s.userId, companyId } },
  });
  if (!r || !validRepresentative(r)) fail(404, "Rekod tidak ditemui.");
  if (manage && !managesRepresentatives(r))
    fail(403, "Anda tidak mempunyai kuasa mengurus wakil syarikat ini.");
  return s;
}
export async function companyInvitationRoutes(app: FastifyInstance) {
  app.post("/api/company-invitations/preview", async (req) => {
    const s = await authorize(req, "companies");
    const { token: raw } = z
      .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
      .parse(req.body);
    const invitation = await db.companyRepresentationInvitation.findUnique({
      where: { tokenHash: hash(raw) },
      include: {
        company: {
          select: { name: true, registrationNumber: true, status: true },
        },
      },
    });
    if (
      !invitation ||
      invitation.recipientId !== s.userId ||
      invitation.acceptedAt ||
      invitation.expiresAt <= new Date() ||
      invitation.company.status !== "ACTIVE"
    )
      fail(404, "Jemputan tidak ditemui atau telah luput.");
    return {
      companyName: invitation.company.name,
      registrationNumber: invitation.company.registrationNumber,
      authorityType: invitation.authorityType,
      expiresAt: invitation.expiresAt,
    };
  });

  app.get("/api/companies/:id/representatives", async (req) => {
    const { id } = z.object({ id: z.uuid() }).parse(req.params);
    await own(req, id);
    return db.companyRepresentative.findMany({
      where: { companyId: id },
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
  });
  app.post(
    "/api/companies/:id/invitations",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (req) => {
      const { id } = z.object({ id: z.uuid() }).parse(req.params),
        s = await own(req, id, true);
      const b = z
        .object({
          email: z.string().trim().toLowerCase().pipe(z.email()),
          authorityType: z.enum(["PENGARAH", "PEKERJA", "WAKIL_DIBERI_KUASA"]),
          endsAt: z.iso.datetime().optional(),
        })
        .parse(req.body);
      if (b.endsAt && new Date(b.endsAt) <= new Date())
        fail(400, "Tarikh tamat kuasa mesti pada masa hadapan.");
      const recipient = await db.user.findUnique({ where: { email: b.email } });
      if (
        !recipient ||
        !recipient.emailVerified ||
        recipient.kind !== "APPLICANT" ||
        recipient.status !== "ACTIVE"
      )
        fail(
          400,
          "Penerima perlu mendaftar dan mengesahkan akaun pemohon dahulu.",
        );
      if (
        await db.companyRepresentative.findUnique({
          where: { userId_companyId: { userId: recipient.id, companyId: id } },
        })
      )
        fail(409, "Pengguna telah mempunyai rekod perwakilan syarikat ini.");
      const raw = token();
      const invitation = await db.companyRepresentationInvitation.create({
        data: {
          companyId: id,
          recipientId: recipient.id,
          invitedBy: s.userId,
          authorityType: b.authorityType,
          authorityEndsAt: b.endsAt ? new Date(b.endsAt) : null,
          tokenHash: hash(raw),
          expiresAt: new Date(Date.now() + 24 * 3600000),
        },
      });
      await audit(
        s.userId,
        s.activeRole,
        "COMPANY_REPRESENTATIVE_INVITED",
        invitation.id,
      );
      await notify(
        recipient.id,
        "COMPANY_INVITATION",
        "Jemputan wakil syarikat STAYLink",
        "Anda dijemput menjadi wakil syarikat. Penerimaan tidak bermaksud dokumen telah disahkan MBSP.",
        `${origin}/jemputan-syarikat?token=${raw}`,
      );
      return {
        id: invitation.id,
        message: "Jemputan dihantar kepada e-mel penerima. Pautan sah 24 jam.",
      };
    },
  );
  app.post("/api/company-invitations/accept", async (req) => {
    const s = await authorize(req, "companies");
    if (s.user.kind !== "APPLICANT") fail(403, "Akaun pemohon diperlukan.");
    if (!s.user.identificationHash)
      fail(409, "Lengkapkan nombor pengenalan dalam Profil saya dahulu.");
    const b = z
      .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
      .parse(req.body);
    const representative = await db.$transaction(async (tx) => {
      const invitation = await tx.companyRepresentationInvitation.findUnique({
        where: { tokenHash: hash(b.token) },
        include: { company: true },
      });
      const now = new Date();
      if (
        !invitation ||
        invitation.recipientId !== s.userId ||
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
          userId: s.userId,
          companyId: invitation.companyId,
          authorityType: invitation.authorityType,
          endsAt: invitation.authorityEndsAt,
          status: "UNVERIFIED",
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: s.userId,
          activeRole: s.activeRole,
          action: "COMPANY_INVITATION_ACCEPTED",
          target: r.id,
        },
      });
      return r;
    });
    await notify(
      s.userId,
      "COMPANY",
      "Perwakilan syarikat diterima",
      "Anda kini boleh mengurus profil syarikat yang diwakili. Pengesahan rasmi dokumen menunggu semakan pegawai MBSP.",
    );
    return {
      id: representative.id,
      message:
        "Perwakilan diterima. Pengesahan rasmi dokumen masih menunggu semakan MBSP.",
    };
  });
}
