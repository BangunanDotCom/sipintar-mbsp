import type { Prisma } from "@prisma/client";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { authorize, fail } from "./auth.js";
import { db } from "./core.js";
import { requireSyntheticSnapshotAuthority } from "./synthetic-submissions.js";
import { isCurrent } from "../../../packages/shared/src/index.js";
import {
  applySyntheticReview,
  mockPrecheck,
  type SyntheticReviewState,
} from "../../../packages/shared/src/synthetic-review.js";

const district = z.enum(["SPU", "SPT", "SPS"]);
const uuid = z.uuid();
const role = z.enum(["PIC_KAWASAN", "PPSK"]);
const params = z.strictObject({ id: uuid });
const edit = z.strictObject({
  action: z.enum(["REQUEST_CORRECTION", "CONFIRM_COMPLETE", "REGISTER"]),
  version: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
});
const snapshotSchema = z.object({
  districtId: district,
  units: z
    .array(
      z.object({ id: uuid, unitLabel: z.string(), floorIds: z.array(uuid) }),
    )
    .min(1),
  floors: z.array(z.object({ id: uuid, floorLabel: z.string() })).min(1),
  evidence: z
    .array(
      z.object({
        id: uuid,
        version: z.number().int().positive(),
        category: z.string(),
        scope: z.enum(["DRAFT", "UNIT", "FLOOR"]),
        targetId: uuid,
        scanStatus: z.literal("CLEAN"),
        verificationStatus: z.enum(["VERIFIED", "UNVERIFIED"]),
      }),
    )
    .min(1),
});

export const correctionAction = "SYNTHETIC_PORTAL_CORRECTION_REQUESTED";
const completeAction = "SYNTHETIC_PORTAL_COMPLETE";
const registerAction = "SYNTHETIC_PORTAL_REGISTERED";
const actions = [correctionAction, completeAction, registerAction];

export async function syntheticReviewOfficer(req: FastifyRequest) {
  const operator = await authorize(req, "areas.read");
  const assignedRole = role.safeParse(operator.activeRole);
  const pic = uuid.safeParse(process.env.STAYLINK_SYNTHETIC_PIC_ID);
  const supervisor = uuid.safeParse(
    process.env.STAYLINK_SYNTHETIC_SUPERVISOR_ID,
  );
  const area = district.safeParse(process.env.STAYLINK_SYNTHETIC_DISTRICT);
  if (
    !assignedRole.success ||
    !pic.success ||
    !supervisor.success ||
    !area.success ||
    pic.data === supervisor.data ||
    operator.user.kind !== "OFFICER" ||
    !operator.mfaVerified ||
    operator.userId !==
      (assignedRole.data === "PIC_KAWASAN" ? pic.data : supervisor.data) ||
    !operator.assignments.some((item) => item.districtId === area.data)
  )
    fail(404, "Tugasan semakan sintetik tidak tersedia.");
  return { operator, role: assignedRole.data, district: area.data };
}

export type ReviewOfficer = Awaited<ReturnType<typeof syntheticReviewOfficer>>;

export async function lockSyntheticOfficer(
  tx: Prisma.TransactionClient,
  officer: ReviewOfficer,
) {
  const { operator, district, role: roleId } = officer;
  await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${operator.userId} FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM "user_role_assignments"
      WHERE "userId" = ${operator.userId} AND "roleId" = ${roleId} FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM "sessions" WHERE id = ${operator.id} FOR SHARE`;
  const active = await tx.session.findUnique({
    where: { id: operator.id },
    include: {
      user: {
        include: {
          roles: { include: { role: { include: { permissions: true } } } },
        },
      },
    },
  });
  if (
    !active ||
    active.user.status !== "ACTIVE" ||
    !active.user.emailVerified ||
    active.expiresAt <= new Date() ||
    active.activeRole !== roleId ||
    !active.mfaVerified ||
    !active.user.roles.some(
      (item) =>
        item.roleId === roleId &&
        item.districtId === district &&
        isCurrent(item) &&
        item.role.permissions.some(
          (permission) => permission.action === "areas.read",
        ),
    )
  )
    fail(403, "Tugasan atau sesi pegawai sudah berubah.");
}

type Submission = {
  id: string;
  draftId: string;
  actorId: string;
  snapshot: Prisma.JsonValue;
};

export async function loadSyntheticReview(
  tx: Prisma.TransactionClient,
  row: Submission,
) {
  const snapshot = snapshotSchema.safeParse(row.snapshot);
  if (!snapshot.success) fail(409, "Snapshot semakan sintetik tidak lengkap.");
  const events = await tx.auditLog.findMany({
    where: { target: row.id, action: { in: actions }, outcome: "SUCCESS" },
    select: { action: true, actorId: true, metadata: true },
  });
  const returned = events.find((item) => item.action === correctionAction);
  const completed = events.find((item) => item.action === completeAction);
  const registered = events.find((item) => item.action === registerAction);
  if (
    new Set(events.map((item) => item.action)).size !== events.length ||
    (returned && completed) ||
    (registered && (!completed || completed.actorId === registered.actorId))
  )
    fail(409, "Sejarah semakan sintetik tidak konsisten.");
  const version = 1 + events.length;
  const state: SyntheticReviewState = {
    caseId: row.draftId,
    submissionId: row.id,
    initiatorId: row.actorId,
    scopeId: snapshot.data.districtId,
    version,
    status: registered
      ? "REGISTERED"
      : completed
        ? "COMPLETE"
        : returned
          ? "CORRECTION_REQUESTED"
          : "SUBMITTED",
    officialReference: registered ? `SYNTHETIC-${row.draftId}` : null,
  };
  const reason = z.object({ reason: z.string() }).safeParse(returned?.metadata);
  return {
    state,
    snapshot: snapshot.data,
    completerId: completed?.actorId ?? null,
    correctionReason: reason.success ? reason.data.reason : null,
  };
}

export async function lockSyntheticReview(
  tx: Prisma.TransactionClient,
  id: string,
  officer: ReviewOfficer,
) {
  await lockSyntheticOfficer(tx, officer);
  // One lock per immutable submission serializes review and billing state writes.
  await tx.$queryRaw`SELECT id FROM synthetic_submissions WHERE id = ${id}
    AND snapshot->>'districtId' = ${officer.district} AND "actorId" <> ${officer.operator.userId}
    FOR UPDATE`;
  const row = await tx.syntheticSubmission.findFirst({
    where: {
      id,
      correction: null,
      snapshot: { path: ["districtId"], equals: officer.district },
    },
  });
  if (!row || row.actorId === officer.operator.userId)
    fail(404, "Tugasan sintetik tidak ditemui.");
  await requireSyntheticSnapshotAuthority(tx, row);
  return loadSyntheticReview(tx, row);
}

export async function syntheticReviewRoutes(portal: FastifyInstance) {
  portal.get("/reviews", async (req) => {
    const officer = await syntheticReviewOfficer(req);
    return db.$transaction(
      async (tx) => {
        const rows = await tx.syntheticSubmission.findMany({
          where: {
            correction: null,
            actorId: { not: officer.operator.userId },
            snapshot: { path: ["districtId"], equals: officer.district },
          },
          select: { id: true, draftId: true, actorId: true, snapshot: true },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 50,
        });
        return {
          role: officer.role,
          district: officer.district,
          reviews: await Promise.all(
            rows.map(async (row) => {
              try {
                await requireSyntheticSnapshotAuthority(tx, row);
              } catch (error) {
                if (
                  error instanceof Error &&
                  "statusCode" in error &&
                  (error.statusCode === 404 || error.statusCode === 409)
                )
                  return null;
                throw error;
              }
              const { state, snapshot, correctionReason } =
                await loadSyntheticReview(tx, row);
              const { units, floors, evidence } = snapshot;
              return {
                id: row.id,
                status: state.status,
                version: state.version,
                reference: state.officialReference,
                correctionReason,
                units: units.map(({ unitLabel, floorIds }) => ({
                  label: unitLabel,
                  floorCount: floorIds.length,
                })),
                evidence: evidence.map(({ category, version, scanStatus }) => ({
                  category,
                  version,
                  scanStatus,
                })),
                advice: mockPrecheck({
                  unitCount: units.length,
                  floorCount: floors.length,
                  evidenceCount: evidence.length,
                }),
              };
            }),
          ).then((reviews) => reviews.filter((review) => review !== null)),
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  });

  portal.post("/reviews/:id", { bodyLimit: 4096 }, async (req) => {
    const officer = await syntheticReviewOfficer(req);
    const { id } = params.parse(req.params);
    const input = edit.parse(req.body);
    return db.$transaction(async (tx) => {
      const { state, snapshot, completerId } = await lockSyntheticReview(
        tx,
        id,
        officer,
      );
      if (
        input.action === "REGISTER" &&
        completerId === officer.operator.userId
      )
        fail(403, "Pendaftaran memerlukan penyelia berasingan.");
      const decision = applySyntheticReview(
        true,
        state,
        {
          id: officer.operator.userId,
          scopeId: officer.district,
          assignedCaseId: state.caseId,
          activeRole: officer.role,
          mfaVerified: officer.operator.mfaVerified,
          reviewGranted: true,
        },
        { ...input, submissionId: id },
        new Date(),
        "PPSK",
      );
      if (decision.status === "FORBIDDEN")
        fail(403, "Tindakan semakan tidak dibenarkan.");
      if (decision.status !== "APPLIED")
        fail(409, "Versi atau peralihan semakan tidak sah.");
      if (input.action === "CONFIRM_COMPLETE") {
        const documentIds = snapshot.evidence.map((item) => item.id);
        await tx.$queryRaw`SELECT id FROM application_documents WHERE "draftId" = ${state.caseId} FOR SHARE`;
        const available = await tx.applicationDocument.count({
          where: {
            id: { in: documentIds },
            draftId: state.caseId,
            scanStatus: "CLEAN",
            verificationStatus: { in: ["VERIFIED", "UNVERIFIED"] },
            storageKey: { startsWith: "issue31-fixture/" },
            supersededAt: null,
          },
        });
        if (available !== documentIds.length)
          fail(409, "Bukti sintetik tidak lagi layak.");
      }
      await tx.auditLog.create({
        data: {
          actorId: officer.operator.userId,
          activeRole: officer.role,
          target: id,
          action:
            input.action === "REGISTER"
              ? registerAction
              : input.action === "CONFIRM_COMPLETE"
                ? completeAction
                : correctionAction,
          metadata: decision.audit,
        },
      });
      return {
        status: decision.next.status,
        version: decision.next.version,
        reference: decision.next.officialReference,
      };
    });
  });
}
