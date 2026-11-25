import { registerSyntheticSubmitRoute } from "./synthetic-submit-route.js";
import { postgresAuth, type AuthRepository } from "./auth-repository.js";
import {
  loadSyntheticOwnerPolicy,
  type SyntheticOwnerPolicy,
  syntheticDocumentFacts,
} from "./synthetic-owner-policy.js";
import {
  documentRuleApplicability,
  summarizeDocumentRequirements,
} from "../../../packages/shared/src/document-policy.js";
import {
  lockSyntheticApplicantSession,
  type ObservedPortalSession,
} from "./synthetic-portal-session.js";
import type { AuditEntry } from "./oracle/audit.js";
import { syntheticBillingRoutes } from "./synthetic-portal-billing.js";
import {
  correctionAction,
  loadSyntheticReview,
  postgresSyntheticReviewTransaction,
  postgresSyntheticReviewRepository,
  type SyntheticReviewRepository,
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
  evaluateSyntheticReadiness,
  type SyntheticSubmissionTransaction,
  type SyntheticPolicy,
  loadSyntheticInventory,
  loadSyntheticEvidence,
  documentContext,
  requireSyntheticSnapshotAuthority,
} from "./synthetic-submissions.js";

const params = z.strictObject({ id: z.uuid() });
const version = z.number().int().positive();
const verdict = z.enum(["PENDING", "CLEAN", "FAILED", "INFECTED"]);
const evidenceBody = z.strictObject({ version, verdict });
type FixtureEvidence = {
  document: Prisma.ApplicationDocumentCreateManyInput;
  scope: Prisma.DraftDocumentScopeCreateManyInput;
};
export type SyntheticPortalDraftTransaction = Pick<
  SyntheticSubmissionTransaction,
  | "lockApplicant"
  | "draft"
  | "authority"
  | "latestSubmission"
  | "inventory"
  | "evidence"
  | "correctionRequested"
> & {
  requireSnapshotAuthority: typeof requireSyntheticSnapshotAuthority extends (
    tx: Prisma.TransactionClient,
    row: infer Row,
  ) => infer Result
    ? (row: Row) => Result
    : never;
  review(
    row: NonNullable<
      Awaited<ReturnType<SyntheticSubmissionTransaction["latestSubmission"]>>
    >,
  ): ReturnType<typeof loadSyntheticReview>;
  claimVersion(
    userId: string,
    draftId: string,
    version: number,
  ): Promise<boolean>;
  documentVersions(
    draftId: string,
    categories: string[],
  ): Promise<Map<string, number>>;
  replaceEvidence(draftId: string, fixtures: FixtureEvidence[]): Promise<void>;
  audit(entry: AuditEntry): Promise<void>;
};
export type SyntheticPortalDraftRepository = {
  transaction<T>(
    callback: (tx: SyntheticPortalDraftTransaction) => Promise<T>,
    consistentRead?: boolean,
  ): Promise<T>;
};
const postgresPortalDrafts: SyntheticPortalDraftRepository = {
  transaction(callback, consistentRead) {
    return db.$transaction(
      (tx) =>
        callback({
          async lockApplicant(userId, operator) {
            if (!operator || operator.userId !== userId)
              fail(403, "Sesi portal diperlukan.");
            return lockSyntheticApplicantSession(tx, operator);
          },
          draft: (userId, id) => authorizedDraft(tx, userId, id),
          authority: (userId, id) => companyAuthority(tx, userId, id),
          async latestSubmission(draftId) {
            return tx.syntheticSubmission.findFirst({
              where: { draftId },
              orderBy: { draftVersion: "desc" },
            });
          },
          inventory: (id) => loadSyntheticInventory(tx, id),
          evidence: (id) => loadSyntheticEvidence(tx, id),
          async correctionRequested(id) {
            return !!(await tx.auditLog.findFirst({
              where: {
                target: id,
                action: correctionAction,
                outcome: "SUCCESS",
              },
              select: { id: true },
            }));
          },
          requireSnapshotAuthority: (row) =>
            requireSyntheticSnapshotAuthority(tx, row),
          review: (row) =>
            loadSyntheticReview(postgresSyntheticReviewTransaction(tx), row),
          async claimVersion(userId, id, version) {
            return (
              (
                await tx.applicationDraft.updateMany({
                  where: {
                    id,
                    initiatedByUserId: userId,
                    status: "DRAFT",
                    version,
                  },
                  data: { version: { increment: 1 } },
                })
              ).count === 1
            );
          },
          async documentVersions(draftId, categories) {
            const rows = await tx.applicationDocument.groupBy({
              by: ["category"],
              where: { draftId, category: { in: categories } },
              _max: { version: true },
            });
            return new Map(
              rows.map((row) => [row.category, row._max.version ?? 0]),
            );
          },
          async replaceEvidence(draftId, fixtures) {
            await tx.applicationDocument.updateMany({
              where: {
                draftId,
                supersededAt: null,
                storageKey: { startsWith: "issue31-fixture/" },
              },
              data: { supersededAt: new Date() },
            });
            await tx.applicationDocument.createMany({
              data: fixtures.map(({ document }) => document),
            });
            await tx.draftDocumentScope.createMany({
              data: fixtures.map(({ scope }) => scope),
            });
          },
          async audit(entry) {
            await tx.auditLog.create({
              data: {
                ...entry,
                metadata: entry.metadata as Prisma.InputJsonValue | undefined,
              },
            });
          },
        }),
      consistentRead ? { isolationLevel: "RepeatableRead" } : undefined,
    );
  },
};
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
  const [active] = await db.$queryRaw<
    { name: string }[]
  >`SELECT current_database()::text AS name`;
  if (active?.name !== database)
    throw Error("Pangkalan data portal sintetik tidak sepadan.");

  return registerSyntheticPortal(
    app,
    owner,
    postgresAuth,
    postgresPortalDrafts,
    postgresSyntheticReviewRepository,
    (operator, input, policy) =>
      captureSyntheticSubmission(operator.userId, input, policy, operator),
  );
}

export async function registerSyntheticPortal(
  app: FastifyInstance,
  owner: SyntheticOwnerPolicy,
  auth: AuthRepository,
  repository: SyntheticPortalDraftRepository,
  reviewRepository: SyntheticReviewRepository,
  capture: (
    operator: ObservedPortalSession,
    input: unknown,
    policy: SyntheticPolicy,
  ) => Promise<{ id: string; version: number }>,
) {
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
  await app.register(
    async (portal) => {
      portal.addHook("onRequest", async (_req, reply) => {
        reply.header("Cache-Control", "private, no-store, max-age=0");
        reply.header("Pragma", "no-cache");
      });

      portal.get("/drafts/:id", async (req) => {
        const { userId } = await applicant(req, auth);
        const { id } = params.parse(req.params);
        return repository.transaction(async (tx) => {
          const draft = await tx.draft(userId, id);
          const authority = draft.companyId
            ? await tx.authority(userId, draft.companyId)
            : null;
          const latest = await tx.latestSubmission(id);
          const original = latest
            ? await tx.requireSnapshotAuthority(latest)
            : null;
          const review = latest ? await tx.review(latest) : null;
          const correction = review?.state.status === "CORRECTION_REQUESTED";
          const inventory = await tx.inventory(id);
          const evidence = await tx.evidence(id);
          const context = documentContext(draft, inventory, evidence);
          let blocker = "";
          try {
            evaluateSyntheticReadiness(
              draft,
              authority,
              policy,
              inventory,
              evidence,
              true,
            );
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
            evidence: evidence.map(
              ({ id, category, version, scanStatus, scope }) => ({
                id,
                category,
                version,
                scanStatus,
                scope,
              }),
            ),
            requirements: summarizeDocumentRequirements(documents, context),
            inventory: {
              unitCount: context.targets.UNIT.length,
              floorCount: context.targets.FLOOR.length,
            },
            blocker,
            ready: !blocker,
          };
        }, true);
      });

      portal.post("/drafts/:id/evidence", { bodyLimit: 1024 }, async (req) => {
        const operator = await applicant(req, auth);
        const { userId } = operator;
        const { id } = params.parse(req.params);
        const input = evidenceBody.parse(req.body);
        return repository.transaction(async (tx) => {
          const activeRole = await tx.lockApplicant(userId, operator);
          const draft = await tx.draft(userId, id);
          if (draft.version !== input.version)
            fail(409, "Versi draf telah berubah.");
          if (draft.companyId) {
            const authority = await tx.authority(userId, draft.companyId);
            if (authority.status !== "VERIFIED")
              fail(409, "Kuasa wakil sintetik belum disahkan.");
          }
          if (!(await tx.claimVersion(userId, id, input.version)))
            fail(409, "Versi draf telah berubah.");
          const current = await tx.latestSubmission(id);
          if (current) {
            const original = await tx.requireSnapshotAuthority(current);
            if (
              original.capacity !== draft.capacity ||
              original.companyId !== draft.companyId
            )
              fail(
                409,
                "Kapasiti dan syarikat asal mesti dikekalkan untuk pembetulan sintetik.",
              );
            if (!(await tx.correctionRequested(current.id)))
              fail(409, "Tiada pembetulan dibuka.");
          }
          const { floors, premises } = await tx.inventory(id);
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
          const nextVersion = await tx.documentVersions(id, categories);
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
          await tx.replaceEvidence(id, fixtures);
          await tx.audit({
            actorId: userId,
            activeRole,
            action: "SYNTHETIC_PORTAL_EVIDENCE",
            target: id,
            metadata: {
              verdict: input.verdict,
              policyVersion: ownerVersion,
              policyFingerprint: owner.fingerprint,
            },
          });
          return { version: input.version + 1 };
        });
      });

      registerSyntheticSubmitRoute(portal, owner, auth, capture);
      if (review.enabled)
        await syntheticReviewRoutes(portal, reviewRepository, auth);
      if (billing.mode === "MOCK")
        await syntheticBillingRoutes(
          portal,
          {
            ttlMinutes: billing.ttlMinutes,
            policyVersion: ownerVersion,
          },
          reviewRepository,
          auth,
        );
    },
    { prefix: "/api/synthetic-portal" },
  );
}
