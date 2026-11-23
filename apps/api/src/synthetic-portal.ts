import {
  loadSyntheticOwnerPolicy,
  syntheticDocumentFacts,
} from "./synthetic-owner-policy.js";
import { documentRuleApplicability } from "../../../packages/shared/src/document-policy.js";
import { lockSyntheticPortalSession } from "./synthetic-portal-session.js";
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
const verdict = z.enum(["PENDING", "CLEAN", "FAILED", "INFECTED"]);
const evidenceBody = z.strictObject({ version, verdict });
const submitBody = z.strictObject({
  version,
  key: z.uuid(),
  accepted: z.literal(true),
  declarationVersion: z.string().max(80),
  policyFingerprint: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
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
  const owner = loadSyntheticOwnerPolicy();
  if (!owner) {
    app.log.warn(
      { code: "SYNTHETIC_POLICY_INVALID" },
      "Polisi portal latihan tidak sah. Portal latihan ditutup.",
    );
    return;
  }
  const {
    declaration,
    documents,
    review,
    billing,
    version: ownerVersion,
  } = owner.config;
  const policy = {
    declarationVersion: declaration.version,
    documents,
    owner: { version: ownerVersion, fingerprint: owner.fingerprint },
  };
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
              policyFingerprint: owner.fingerprint,
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
        const operator = await applicant(req);
        const { userId } = operator;
        const { id } = params.parse(req.params);
        const input = evidenceBody.parse(req.body);
        return db.$transaction(async (tx) => {
          await lockSyntheticPortalSession(tx, operator, "PEMOHON");
          const draft = await authorizedDraft(tx, userId, id);
          if (draft.version !== input.version)
            fail(409, "Versi draf telah berubah.");
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
            select: { id: true, actorId: true, snapshot: true },
          });
          if (current) {
            const original = await requireSyntheticSnapshotAuthority(
              tx,
              current,
            );
            if (
              original.capacity !== draft.capacity ||
              original.companyId !== draft.companyId
            )
              fail(
                409,
                "Kapasiti dan syarikat asal mesti dikekalkan untuk pembetulan sintetik.",
              );
            if (!(await correctionRequested(tx, current.id)))
              fail(409, "Tiada pembetulan dibuka.");
          }
          const floors = await tx.premiseFloor.findMany({
            where: { draftId: id },
            select: { id: true },
          });
          const premises = await tx.applicationPremises.findUnique({
            where: { draftId: id },
            select: {
              buildingType: true,
              certificateType: true,
              units: { select: { id: true } },
            },
          });
          if (!floors.length) fail(409, "Simpan inventori tingkat dahulu.");
          const units = premises?.units ?? [];
          const context = {
            capacity: draft.companyId
              ? ("COMPANY" as const)
              : ("INDIVIDUAL" as const),
            premiseType: premises?.buildingType ?? null,
            facts: syntheticDocumentFacts(
              units.length,
              premises?.certificateType ?? null,
            ),
          };
          const targets = { DRAFT: [{ id }], UNIT: units, FLOOR: floors };
          const selected = new Map<
            string,
            { category: string; floorId: string | null; unitId: string | null }
          >();
          const applicable = new Set<string>();
          for (const rule of documents.rules) {
            const relevance = documentRuleApplicability(rule, context);
            if (relevance === "NOT_APPLICABLE") continue;
            if (
              relevance === "UNKNOWN" ||
              applicable.has(rule.requirement) ||
              !targets[rule.scope].length
            )
              fail(409, "Syarat atau skop bukti latihan belum jelas.");
            applicable.add(rule.requirement);
            const category = rule.alternatives[0];
            for (const target of targets[rule.scope]) {
              selected.set(`${category}:${rule.scope}:${target.id}`, {
                category,
                floorId: rule.scope === "FLOOR" ? target.id : null,
                unitId: rule.scope === "UNIT" ? target.id : null,
              });
            }
          }
          if (!applicable.size)
            fail(409, "Tiada syarat bukti latihan yang sesuai.");
          if (draft.companyId)
            selected.set(`company_authority:DRAFT:${id}`, {
              category: "company_authority",
              floorId: null,
              unitId: null,
            });
          if (selected.size > 600)
            fail(409, "Bilangan bukti latihan melebihi had.");
          const categories = [
            ...new Set([...selected.values()].map(({ category }) => category)),
          ];
          const priorVersions = await tx.applicationDocument.groupBy({
            by: ["category"],
            where: { draftId: id, category: { in: categories } },
            _max: { version: true },
          });
          const nextVersion = new Map(
            priorVersions.map((row) => [row.category, row._max.version ?? 0]),
          );
          await tx.applicationDocument.updateMany({
            where: {
              draftId: id,
              supersededAt: null,
              storageKey: { startsWith: "issue31-fixture/" },
            },
            data: { supersededAt: new Date() },
          });
          const fixtures = [...selected.values()].map(
            ({ category, floorId, unitId }) => {
              const documentId = randomUUID();
              const storageKey = `issue31-fixture/${id}/${documentId}`;
              const version = (nextVersion.get(category) ?? 0) + 1;
              nextVersion.set(category, version);
              return {
                document: {
                  id: documentId,
                  draftId: id,
                  category,
                  version,
                  fileName: "simulasi-metadata.pdf",
                  mimeType: "application/pdf",
                  byteSize: Buffer.byteLength(storageKey),
                  sha256: hash(storageKey),
                  uploadedBy: userId,
                  storageKey,
                  scanStatus: input.verdict,
                  verificationStatus:
                    draft.companyId &&
                    category === "company_authority" &&
                    input.verdict === "CLEAN" &&
                    floorId === null &&
                    unitId === null
                      ? "VERIFIED"
                      : "UNVERIFIED",
                },
                scope: { documentId, draftId: id, floorId, unitId },
              };
            },
          );
          await tx.applicationDocument.createMany({
            data: fixtures.map(({ document }) => document),
          });
          await tx.draftDocumentScope.createMany({
            data: fixtures.map(({ scope }) => scope),
          });
          await tx.auditLog.create({
            data: {
              actorId: userId,
              activeRole: "PEMOHON",
              action: "SYNTHETIC_PORTAL_EVIDENCE",
              target: id,
              metadata: {
                verdict: input.verdict,
                policyVersion: ownerVersion,
                policyFingerprint: owner.fingerprint,
              },
            },
          });
          return { version: input.version + 1 };
        });
      });

      portal.post("/drafts/:id/submit", { bodyLimit: 2048 }, async (req) => {
        const operator = await applicant(req);
        const { id } = params.parse(req.params);
        const { policyFingerprint, ...input } = submitBody.parse(req.body);
        if (
          (owner.custom || policyFingerprint !== undefined) &&
          policyFingerprint !== owner.fingerprint
        )
          fail(
            409,
            "Polisi latihan telah berubah. Muat semula dan sahkan akuan sekali lagi.",
          );
        const correction = await correctionRequested(db, input.previousId);
        return captureSyntheticSubmission(
          operator.userId,
          { ...input, draftId: id },
          {
            ...policy,
            correctionFor: correction
              ? (input.previousId ?? undefined)
              : undefined,
          },
          operator,
        );
      });
      if (review.enabled) await syntheticReviewRoutes(portal);
      if (billing.mode === "MOCK")
        await syntheticBillingRoutes(portal, {
          ttlMinutes: billing.ttlMinutes,
          policyVersion: ownerVersion,
        });
    },
    { prefix: "/api/synthetic-portal" },
  );
}
