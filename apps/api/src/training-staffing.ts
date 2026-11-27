import type {
  Prisma,
  TrainingReminderOutbox,
  UserRoleAssignment,
} from "@prisma/client";
import { z } from "zod";
import { syntheticPortalDatabase } from "./synthetic-portal-gate.js";

export function trainingStaffingEnabled() {
  return Boolean(
    syntheticPortalDatabase() &&
    process.env.STAYLINK_SYNTHETIC_STAFFING === "true",
  );
}

const context = z.strictObject({
  appointmentId: z.uuid(),
  action: z.enum(["START", "REVOKE"]),
});
type Action = z.infer<typeof context>["action"];

export async function queueStaffAppointment(
  tx: Prisma.TransactionClient,
  appointment: Pick<UserRoleAssignment, "id" | "userId" | "startsAt">,
  action: Action,
) {
  await tx.trainingReminderOutbox.createMany({
    data: {
      recipientId: appointment.userId,
      source: "SCHEDULE",
      kind: "STAFF_APPOINTMENT",
      context: { appointmentId: appointment.id, action },
      dedupeKey: `staff-appointment:${appointment.id}:${action}`,
      availableAt: action === "START" ? appointment.startsAt : new Date(),
    },
    skipDuplicates: true,
  });
}

export async function eligibleStaffAppointment(
  tx: Prisma.TransactionClient,
  row: TrainingReminderOutbox,
) {
  if (!trainingStaffingEnabled()) return null;
  const parsed = context.safeParse(row.context);
  if (!parsed.success) return null;
  const { appointmentId, action } = parsed.data;
  await tx.$queryRaw`SELECT id FROM users WHERE id=${row.recipientId} FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM user_role_assignments WHERE id=${appointmentId}
    AND "userId"=${row.recipientId} FOR SHARE`;
  const [recipient] = await tx.$queryRaw<{ email: string }[]>`
    WITH now AS MATERIALIZED (SELECT clock_timestamp() AT TIME ZONE 'UTC' AS instant)
    SELECT u.email FROM users u JOIN user_role_assignments a ON a."userId"=u.id
    CROSS JOIN now
    WHERE u.id=${row.recipientId} AND a.id=${appointmentId}
      AND u.kind='OFFICER' AND u.status='ACTIVE' AND u."emailVerified"
      AND lower(u.email) LIKE '%@example.test'
      AND ((${action}='START' AND a.status='ACTIVE' AND a."startsAt"<=now.instant
        AND (a."endsAt" IS NULL OR a."endsAt">now.instant))
        OR (${action}='REVOKE' AND a.status='REVOKED'))`;
  if (!recipient) return null;
  return {
    email: recipient.email,
    subject:
      action === "START"
        ? "Pelantikan latihan STAYLink bermula"
        : "Pelantikan latihan STAYLink ditamatkan",
    text: "Log masuk ke portal latihan untuk menyemak pelantikan dan skop kuasa semasa.",
  };
}
