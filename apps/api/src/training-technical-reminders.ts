import type { Prisma, TrainingReminderOutbox } from "@prisma/client";
import { z } from "zod";
import type { CompletionState } from "../../../packages/shared/src/synthetic-completion.js";
import { isCurrent } from "../../../packages/shared/src/index.js";
import { completionSandbox } from "./synthetic-completion-gate.js";
import { completionEvent } from "../../../packages/shared/src/synthetic-completion-contract.js";
import { stateFor } from "./synthetic-completion-journal.js";
import { requireSyntheticSnapshotAuthority } from "./synthetic-submissions.js";

const departments = z.enum(["PERANCANG_BANDAR", "KEJURUTERAAN"]);
export const technicalReminderContext = z.strictObject({
  submissionId: z.uuid(),
  referralVersion: z.number().int().positive(),
  district: z.enum(["SPU", "SPT", "SPS"]),
  role: z.enum([...departments.options, "PPSK"]),
});
export const technicalReminderInventory = z.object({
  districtId: technicalReminderContext.shape.district,
  units: z.array(z.object({ id: z.uuid(), floorIds: z.array(z.uuid()) })),
});

const hour = 3_600_000;
type Tx = Prisma.TransactionClient;

export function technicalReminderPlan(deadline: number, env = process.env) {
  const hours = (
    raw: string | undefined,
    fallback: number,
    min: number,
    max: number,
  ) => {
    if (raw === undefined) return fallback;
    if (!/^\d{1,3}$/.test(raw) || Number(raw) < min || Number(raw) > max)
      throw Error("Selang peringatan teknikal latihan tidak sah.");
    return Number(raw);
  };
  return {
    TECH_PRE_DUE: new Date(
      deadline -
        hours(env.STAYLINK_SYNTHETIC_TECH_PRE_HOURS, 24, 1, 168) * hour,
    ),
    TECH_OVERDUE: new Date(
      deadline +
        hours(env.STAYLINK_SYNTHETIC_TECH_LATE_HOURS, 0, 0, 168) * hour,
    ),
    TECH_ESCALATE: new Date(
      deadline +
        hours(env.STAYLINK_SYNTHETIC_TECH_ESCALATION_HOURS, 24, 0, 168) * hour,
    ),
  };
}

export async function enqueueTechnicalReminders(
  tx: Tx,
  submissionId: string,
  district: z.infer<typeof technicalReminderContext>["district"],
  referral: NonNullable<CompletionState["referral"]>,
  assignments: Record<z.infer<typeof departments>, string>,
  supervisorId: string | undefined,
) {
  const submission = await tx.syntheticSubmission.findUniqueOrThrow({
    where: { id: submissionId },
    select: { draftId: true, draftVersion: true },
  });
  await tx.trainingReminderOutbox.createMany({
    data: technicalReminderEntries(
      submission,
      submissionId,
      district,
      referral,
      assignments,
      supervisorId,
    ),
    skipDuplicates: true,
  });
}
export function technicalReminderEntries(
  submission: { draftId: string; draftVersion: number },
  submissionId: string,
  district: z.infer<typeof technicalReminderContext>["district"],
  referral: NonNullable<CompletionState["referral"]>,
  assignments: Record<z.infer<typeof departments>, string>,
  supervisorId: string | undefined,
) {
  const supervisor = z.uuid().parse(supervisorId);
  const times = technicalReminderPlan(referral.deadline);
  const entries = [
    ...referral.departments.flatMap((role) =>
      (["TECH_PRE_DUE", "TECH_OVERDUE"] as const).map((kind) => ({
        kind,
        role,
        recipientId: assignments[role],
      })),
    ),
    { kind: "TECH_ESCALATE" as const, role: "PPSK", recipientId: supervisor },
  ];
  return entries.map(({ kind, role, recipientId }) => ({
    draftId: submission.draftId,
    draftVersion: submission.draftVersion,
    kind,
    recipientId,
    source: "SCHEDULE" as const,
    dedupeKey: `${kind}:${submissionId}:${referral.version}:${role}`,
    context: {
      submissionId,
      district,
      role,
      referralVersion: referral.version,
    },
    availableAt: times[kind],
  }));
}

export async function eligibleTechnicalRecipient(
  tx: Tx,
  row: TrainingReminderOutbox,
) {
  if (!completionSandbox()) return null;
  const parsed = technicalReminderContext.safeParse(row.context);
  if (!parsed.success) return null;
  const { submissionId, referralVersion, district, role } = parsed.data;
  if (process.env.STAYLINK_SYNTHETIC_DISTRICT !== district) return null;
  let assignment: string | undefined;
  try {
    assignment =
      role === "PPSK"
        ? process.env.STAYLINK_SYNTHETIC_SUPERVISOR_ID
        : z
            .record(z.string(), z.uuid())
            .parse(
              JSON.parse(
                process.env.STAYLINK_SYNTHETIC_COMPLETION_ASSIGNMENTS ?? "{}",
              ),
            )[role];
  } catch {
    return null;
  }
  if (assignment !== row.recipientId) return null;
  if ((row.kind === "TECH_ESCALATE") !== (role === "PPSK")) return null;
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${row.recipientId} FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM user_role_assignments
    WHERE "userId" = ${row.recipientId} AND "roleId" = ${role} ORDER BY id FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM synthetic_submissions WHERE id = ${submissionId} FOR SHARE`;

  const user = await tx.user.findFirst({
    where: {
      id: row.recipientId,
      kind: "OFFICER",
      status: "ACTIVE",
      emailVerified: true,
    },
    select: {
      email: true,
      roles: {
        where: {
          districtId: district,
          roleId: role,
          role: {
            permissions: {
              some: { action: role === "PPSK" ? "areas.read" : "profile" },
            },
          },
        },
        select: { status: true, startsAt: true, endsAt: true },
      },
    },
  });
  if (
    !user?.email.toLowerCase().endsWith("@example.test") ||
    !user.roles.some((grant) => isCurrent(grant))
  )
    return null;
  const submission = await tx.syntheticSubmission.findFirst({
    where: { id: submissionId, draftId: row.draftId, correction: null },
  });
  if (!submission || submission.actorId === row.recipientId) return null;
  const inventory = technicalReminderInventory.safeParse(submission.snapshot);
  if (!inventory.success || inventory.data.districtId !== district) return null;
  try {
    await requireSyntheticSnapshotAuthority(tx, submission);
    const scopes = inventory.data.units.flatMap(({ id, floorIds }) =>
      floorIds.map((floorId) => ({ unitId: id, floorId })),
    );
    const state = await stateFor(
      {
        events: (id) =>
          tx.auditLog.findMany({
            where: { target: id, action: completionEvent, outcome: "SUCCESS" },
            select: { actorId: true, activeRole: true, metadata: true },
            take: 501,
          }),
      },
      submissionId,
      scopes,
    );
    const referral = state.referral;
    if (state.closed || referral?.version !== referralVersion) return null;
    const now = Date.now();
    if (
      row.kind === "TECH_PRE_DUE"
        ? now >= referral.deadline
        : now < referral.deadline
    )
      return null;

    const missing = referral.departments.filter(
      (department) => !referral.comments[department],
    );
    if (role === "PPSK" ? !missing.length : !missing.includes(role))
      return null;
    return user.email;
  } catch (error) {
    if (
      error instanceof Error &&
      "statusCode" in error &&
      [404, 409].includes(Number(error.statusCode))
    )
      return null;
    throw error;
  }
}
