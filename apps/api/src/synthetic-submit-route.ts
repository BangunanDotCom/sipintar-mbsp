import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { applicant } from "./application-drafts.js";
import { fail } from "./auth.js";
import type { AuthRepository } from "./auth-repository.js";
import type { SyntheticOwnerPolicy } from "./synthetic-owner-policy.js";
import type { ObservedPortalSession } from "./synthetic-portal-session.js";
import type { SyntheticPolicy } from "./synthetic-submissions.js";

const submitBody = z.strictObject({
  version: z.number().int().positive(),
  key: z.uuid(),
  accepted: z.literal(true),
  declarationVersion: z.string().max(80),
  policyFingerprint: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  previousId: z.uuid().nullable(),
});

export function registerSyntheticSubmitRoute(
  portal: FastifyInstance,
  owner: SyntheticOwnerPolicy,
  auth: AuthRepository,
  capture: (
    operator: ObservedPortalSession,
    data: unknown,
    policy: SyntheticPolicy,
  ) => Promise<{ id: string; version: number }>,
) {
  portal.post("/drafts/:id/submit", { bodyLimit: 2048 }, async (req) => {
    const operator = await applicant(req, auth);
    const { id } = z.strictObject({ id: z.uuid() }).parse(req.params);
    const { policyFingerprint, ...input } = submitBody.parse(req.body);
    if (
      (owner.custom || policyFingerprint !== undefined) &&
      policyFingerprint !== owner.fingerprint
    )
      fail(
        409,
        "Polisi latihan telah berubah. Muat semula dan sahkan akuan sekali lagi.",
      );
    return capture(
      operator,
      { ...input, draftId: id },
      {
        declarationVersion: owner.config.declaration.version,
        documents: owner.config.documents,
        owner: {
          version: owner.config.version,
          fingerprint: owner.fingerprint,
        },
      },
    );
  });
}
