import type { Prisma } from "@prisma/client";

export async function lockTrainingOutboxCase(
  tx: Prisma.TransactionClient,
  recipient: string,
  role: string | null,
  submission: string | null,
) {
  await tx.$queryRaw`SELECT public.staylink_lock_outbox_case(
    ${recipient}::text,${role}::text,${submission}::text)
  `;
}
