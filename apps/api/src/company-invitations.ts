import { z } from "zod";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { hash, origin } from "./core.js";
import { authorize, fail } from "./auth.js";
import { postgresAuth } from "./auth-repository.js";
import type { CompanyInvitationRepository } from "./company-invitation-repository.js";
import {
  validRepresentative,
  managesRepresentatives,
} from "./company-representative-policy.js";
export {
  validRepresentative,
  managesRepresentatives,
} from "./company-representative-policy.js";

export async function companyInvitationRoutes(
  app: FastifyInstance,
  repository: CompanyInvitationRepository,
  auth = postgresAuth,
) {
  const { notify } = auth;
  const allow = (req: FastifyRequest) => authorize(req, "companies", auth);
  async function own(req: FastifyRequest, companyId: string, manage = false) {
    const s = await allow(req);
    const r = await repository.representative(s.userId, companyId);
    if (!r || !validRepresentative(r)) fail(404, "Rekod tidak ditemui.");
    if (manage && !managesRepresentatives(r))
      fail(403, "Anda tidak mempunyai kuasa mengurus wakil syarikat ini.");
    return s;
  }
  app.post("/api/company-invitations/preview", async (req) => {
    const s = await allow(req);
    const { token: raw } = z
      .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
      .parse(req.body);
    const invitation = await repository.preview(hash(raw));
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
    return repository.representatives(id);
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
      const recipient = await auth.findUser(b.email);
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
      if (await repository.representative(recipient.id, id))
        fail(409, "Pengguna telah mempunyai rekod perwakilan syarikat ini.");
      const invitation = await repository.invite(
        {
          companyId: id,
          recipientId: recipient.id,
          authorityType: b.authorityType,
          authorityEndsAt: b.endsAt ? new Date(b.endsAt) : null,
          expiresAt: new Date(Date.now() + 24 * 3600000),
        },
        s,
      );
      await notify(
        recipient.id,
        "COMPANY_INVITATION",
        "Jemputan wakil syarikat STAYLink",
        "Anda dijemput menjadi wakil syarikat. Penerimaan tidak bermaksud dokumen telah disahkan MBSP.",
        `${origin}/jemputan-syarikat?token=${invitation.raw}`,
      );
      return {
        id: invitation.id,
        message: "Jemputan dihantar kepada e-mel penerima. Pautan sah 24 jam.",
      };
    },
  );
  app.post("/api/company-invitations/accept", async (req) => {
    const s = await allow(req);
    if (s.user.kind !== "APPLICANT") fail(403, "Akaun pemohon diperlukan.");
    if (!s.user.identificationHash)
      fail(409, "Lengkapkan nombor pengenalan dalam Profil saya dahulu.");
    const b = z
      .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
      .parse(req.body);
    const representative = await repository.accept(b.token, s);
    return {
      id: representative.id,
      message:
        "Perwakilan diterima. Pengesahan rasmi dokumen masih menunggu semakan MBSP.",
    };
  });
}
