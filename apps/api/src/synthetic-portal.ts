import { syntheticBillingRoutes } from "./synthetic-portal-billing.js";
import {
  correctionAction,
  loadSyntheticReview,
  syntheticReviewRoutes,
} from "./synthetic-portal-review.js";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { applicant, companyAuthority } from "./application-drafts.js";
import { fail } from "./auth.js";
import { db, hash } from "./core.js";
import { authorizedDraft } from "./premise-floors.js";
import { syntheticPortalDatabase } from "./synthetic-portal-gate.js";
import {
  captureSyntheticSubmission,
  loadSyntheticReadiness,
  requireSyntheticSnapshotAuthority,
} from "./synthetic-submissions.js";

const params = z.strictObject({ id: z.uuid() });
const version = z.number().int().positive();
const declaration = {
  version: "SYNTHETIC-K05-v1",
  text: "Saya mengesahkan bahawa permohonan ini menggunakan data latihan sintetik untuk simulasi STAYLink MBSP.",
};
const policy = {
  declarationVersion: declaration.version,
  documents: {
    version: "SYNTHETIC-K04-v1",
    rules: [
      {
        requirement: "layout",
        scope: "FLOOR",
        alternatives: ["floor_layout"],
        requireVerified: false,
      },
    ],
  },
};

const verdict = z.enum(["PENDING", "CLEAN", "FAILED", "INFECTED"]);
const evidenceBody = z.strictObject({ version, verdict });
const submitBody = z.strictObject({
  version,
  key: z.uuid(),
  accepted: z.literal(true),
  declarationVersion: z.string().max(80),
  previousId: z.uuid().nullable(),
});

async function correctionRequested(
  tx: Prisma.TransactionClient,
  id: string | null,
) {
  return (
    id !== null &&
    Boolean(
      await tx.auditLog.findFirst({
        where: { target: id, action: correctionAction, outcome: "SUCCESS" },
        select: { id: true },
      }),
    )
  );
}

export async function syntheticPortalRoutes(app: FastifyInstance) {
  const database = syntheticPortalDatabase();
  if (!database) return;
  const [active] = await db.$queryRaw<
    { name: string }[]
  >`SELECT current_database()::text AS name`;
  if (active?.name !== database)
    throw Error("Pangkalan data portal sintetik tidak sepadan.");

  await app.register(
    async (portal) => {
      portal.addHook("onRequest", async (_req, reply) => {
        reply.header("Cache-Control", "private, no-store, max-age=0");
        reply.header("Pragma", "no-cache");
      });

      portal.get("/drafts/:id", async (req) => {
        const { userId } = await applicant(req);
        const { id } = params.parse(req.params);
        return db.$transaction(
          async (tx) => {
            const draft = await authorizedDraft(tx, userId, id);
            const authority = draft.companyId
              ? await companyAuthority(tx, userId, draft.companyId)
              : null;
            const latest = await tx.syntheticSubmission.findFirst({
              where: { draftId: id },
              orderBy: { draftVersion: "desc" },
              select: {
                id: true,
                draftId: true,
                actorId: true,
                snapshot: true,
                draftVersion: true,
              },
            });
            const original = latest
              ? await requireSyntheticSnapshotAuthority(tx, latest)
              : null;
            const review = latest
              ? await loadSyntheticReview(tx, latest)
              : null;
            const correction = review?.state.status === "CORRECTION_REQUESTED";
            const evidence = await tx.applicationDocument.findMany({
              where: {
                draftId: id,
                supersededAt: null,
                storageKey: { startsWith: "issue31-fixture/" },
              },
              select: {
                id: true,
                category: true,
                version: true,
                scanStatus: true,
                scope: { select: { unitId: true, floorId: true } },
              },
              orderBy: { version: "asc" },
            });
            let blocker = "";
            try {
              await loadSyntheticReadiness(tx, draft, authority, policy);
            } catch (error) {
              if (
                !(error instanceof Error) ||
                !("statusCode" in error) ||
                error.statusCode !== 409
              )
                throw error;
              blocker = error.message;
            }
            if (latest && (!correction || draft.version <= latest.draftVersion))
              blocker = correction
                ? "Simpan pembetulan sebelum membuat serahan semula."
                : "Serahan sudah diterima untuk semakan.";
            if (
              original &&
              (original.capacity !== draft.capacity ||
                original.companyId !== draft.companyId)
            )
              blocker =
                "Kapasiti dan syarikat asal mesti dikekalkan untuk pembetulan sintetik.";
            return {
              declaration,
              policyVersion: policy.documents.version,
              draftVersion: draft.version,
              latest: latest
                ? { id: latest.id, draftVersion: latest.draftVersion }
                : null,
              reviewStatus: review?.state.status ?? null,
              reference: review?.state.officialReference ?? null,
              correctionReason: review?.correctionReason ?? null,
              correctionRequested: correction,
              evidence,
              blocker,
              ready: !blocker,
            };
          },
          { isolationLevel: "RepeatableRead" },
        );
      });

      portal.post("/drafts/:id/evidence", { bodyLimit: 1024 }, async (req) => {
        const { userId } = await applicant(req);
        const { id } = params.parse(req.params);
        const input = evidenceBody.parse(req.body);
        return db.$transaction(async (tx) => {
          const draft = await authorizedDraft(tx, userId, id);
          if (draft.companyId) {
            const authority = await companyAuthority(
              tx,
              userId,
              draft.companyId,
            );
            if (authority.status !== "VERIFIED")
              fail(409, "Kuasa wakil sintetik belum disahkan.");
          }
          const claim = await tx.applicationDraft.updateMany({
            where: { id, version: input.version },
            data: { version: { increment: 1 } },
          });
          if (claim.count !== 1) fail(409, "Versi draf telah berubah.");
          const current = await tx.syntheticSubmission.findFirst({
            where: { draftId: id },
            orderBy: { draftVersion: "desc" },
            select: { id: true },
          });
          if (current && !(await correctionRequested(tx, current.id)))
            fail(409, "Tiada pembetulan dibuka.");
          const floors = await tx.premiseFloor.findMany({
            where: { draftId: id },
            select: { id: true },
          });
          if (!floors.length) fail(409, "Simpan inventori tingkat dahulu.");
          const categories = draft.companyId
            ? ["floor_layout", "company_authority"]
            : ["floor_layout"];
          const documents = await tx.applicationDocument.groupBy({
            by: ["category"],
            where: { draftId: id, category: { in: categories } },
            _max: { version: true },
          });
          await tx.applicationDocument.updateMany({
            where: {
              draftId: id,
              category: { in: categories },
              supersededAt: null,
              storageKey: { startsWith: "issue31-fixture/" },
            },
            data: { supersededAt: new Date() },
          });
          for (const category of categories) {
            let documentVersion =
              documents.find((row) => row.category === category)?._max
                .version ?? 0;
            const targets =
              category === "floor_layout" ? floors : [{ id: null }];
            for (const floor of targets) {
              const documentId = randomUUID();
              const storageKey = `issue31-fixture/${id}/${documentId}`;
              await tx.applicationDocument.create({
                data: {
                  id: documentId,
                  draftId: id,
                  category,
                  version: ++documentVersion,
                  fileName: "simulasi-metadata.pdf",
                  mimeType: "application/pdf",
                  byteSize: Buffer.byteLength(storageKey),
                  sha256: hash(storageKey),
                  uploadedBy: userId,
                  storageKey,
                  scanStatus: input.verdict,
                  verificationStatus:
                    category === "company_authority" &&
                    input.verdict === "CLEAN"
                      ? "VERIFIED"
                      : "UNVERIFIED",
                  scope: { create: { floorId: floor.id } },
                },
              });
            }
          }
          await tx.auditLog.create({
            data: {
              actorId: userId,
              activeRole: "PEMOHON",
              action: "SYNTHETIC_PORTAL_EVIDENCE",
              target: id,
              metadata: { verdict: input.verdict },
            },
          });
          return { version: input.version + 1 };
        });
      });

      portal.post("/drafts/:id/submit", { bodyLimit: 2048 }, async (req) => {
        const { userId } = await applicant(req);
        const { id } = params.parse(req.params);
        const input = submitBody.parse(req.body);
        const correction = await correctionRequested(db, input.previousId);
        return captureSyntheticSubmission(
          userId,
          { ...input, draftId: id },
          {
            ...policy,
            correctionFor: correction
              ? (input.previousId ?? undefined)
              : undefined,
          },
        );
      });
      await syntheticReviewRoutes(portal);
      await syntheticBillingRoutes(portal);
    },
    { prefix: "/api/synthetic-portal" },
  );
}
