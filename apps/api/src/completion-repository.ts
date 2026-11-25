import type { Prisma, SyntheticSubmission } from "@prisma/client";
import {
  completionEvent,
  type CompletionRole,
} from "../../../packages/shared/src/synthetic-completion-contract.js";
import { db } from "./core.js";
import type { AuditEntry } from "./oracle/audit.js";
import { authorizedDraft } from "./premise-floors.js";
import {
  postgresSyntheticReviewTransaction,
  type SyntheticReviewTransaction,
} from "./synthetic-portal-review.js";
import {
  lockSyntheticApplicantSession,
  lockSyntheticPortalSession,
  type ObservedPortalSession,
} from "./synthetic-portal-session.js";

export interface CompletionTransaction extends SyntheticReviewTransaction {
  events(
    id: string,
  ): Promise<
    {
      actorId: string | null;
      activeRole: string | null;
      metadata: Prisma.JsonValue;
    }[]
  >;
  appendCompletion(entry: AuditEntry): Promise<void>;
  lockActor(
    operator: ObservedPortalSession,
    role: CompletionRole,
    district: string,
  ): Promise<void>;
  lockApplicant(
    operator: ObservedPortalSession,
  ): Promise<"PEMOHON" | "WAKIL_SYARIKAT">;
  lockParent(
    id: string,
    district: string,
    excludedActorId: string,
  ): Promise<void>;
  lockCase(id: string, district?: string): Promise<void>;
  caseRow(id: string, district?: string): Promise<SyntheticSubmission | null>;
  applicantCase(draftId: string, userId: string): Promise<string | null>;
  queue(district: string, excludedActorId: string): Promise<{ id: string }[]>;
}

export interface CompletionRepository {
  transaction<T>(
    operation: (tx: CompletionTransaction) => Promise<T>,
    consistentRead?: boolean,
  ): Promise<T>;
}

export const postgresCompletion: CompletionRepository = {
  transaction(operation, consistentRead) {
    return db.$transaction(
      (tx) => {
        const review = postgresSyntheticReviewTransaction(tx);
        return operation({
          ...review,
          appendCompletion: review.audit,
          async events(id) {
            return tx.auditLog.findMany({
              where: {
                target: id,
                action: completionEvent,
                outcome: "SUCCESS",
              },
              select: { actorId: true, activeRole: true, metadata: true },
              take: 501,
            });
          },
          lockActor: (operator, role, district) =>
            lockSyntheticPortalSession(tx, operator, role, district),
          lockApplicant: (operator) =>
            lockSyntheticApplicantSession(tx, operator),
          async lockParent(id, district, excludedActorId) {
            await tx.$queryRaw`SELECT d.id FROM application_drafts d
            JOIN synthetic_submissions s ON s."draftId" = d.id
            WHERE s.id = ${id} AND s.snapshot->>'districtId' = ${district} AND s."actorId" <> ${excludedActorId}
            FOR UPDATE OF d`;
          },
          async lockCase(id, district) {
            if (district)
              await tx.$queryRaw`SELECT id FROM synthetic_submissions WHERE id = ${id}
              AND snapshot->>'districtId' = ${district} FOR UPDATE`;
            else await review.lockSubmission(id);
          },
          async caseRow(id, district) {
            return tx.syntheticSubmission.findFirst({
              where: {
                id,
                correction: null,
                ...(district && {
                  snapshot: { path: ["districtId"], equals: district },
                }),
              },
            });
          },
          async applicantCase(draftId, userId) {
            await tx.$queryRaw`SELECT id FROM application_drafts WHERE id = ${draftId}
            AND "initiatedByUserId" = ${userId} FOR UPDATE`;
            await authorizedDraft(tx, userId, draftId);
            return (
              (
                await tx.syntheticSubmission.findFirst({
                  where: { draftId, correction: null },
                  orderBy: { draftVersion: "desc" },
                  select: { id: true },
                })
              )?.id ?? null
            );
          },
          async queue(district, excludedActorId) {
            return tx.$queryRaw<
              { id: string }[]
            >`SELECT s.id FROM synthetic_submissions s
            WHERE s.snapshot->>'districtId' = ${district} AND s."actorId" <> ${excludedActorId}
              AND NOT EXISTS (SELECT 1 FROM synthetic_submissions child WHERE child."previousId" = s.id)
              AND EXISTS (SELECT 1 FROM audit_logs a WHERE a.target = s.id AND a.action = ${completionEvent})
            ORDER BY s."createdAt" DESC, s.id LIMIT 50`;
          },
        });
      },
      consistentRead ? { isolationLevel: "RepeatableRead" } : undefined,
    );
  },
};
