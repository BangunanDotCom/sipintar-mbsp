import { completionDatabaseName } from "../../../packages/shared/src/synthetic-completion.js";
import type { Prisma } from "@prisma/client";
import { fail } from "./auth.js";
import { syntheticPortalDatabase } from "./synthetic-portal-gate.js";

export const completionEvent = "SYNTHETIC_PORTAL_COMPLETION";

export function completionSandbox(env = process.env) {
  return (
    env.STAYLINK_SYNTHETIC_COMPLETION === "true" &&
    env.STAYLINK_DEMO_HOST === "true" &&
    completionDatabaseName.test(syntheticPortalDatabase(env) ?? "")
  );
}

export async function requireUnclosedTrainingDraft(
  tx: Prisma.TransactionClient,
  draftId: string,
) {
  if (!completionSandbox()) return;
  const [latest] = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM synthetic_submissions WHERE "draftId" = ${draftId}
    ORDER BY "draftVersion" DESC LIMIT 1 FOR UPDATE`;
  if (!latest) return;
  const closure = await tx.auditLog.findFirst({
    where: {
      target: latest.id,
      action: completionEvent,
      outcome: "SUCCESS",
      metadata: { path: ["command", "action"], equals: "CLOSE" },
    },
    select: { id: true },
  });
  if (closure) fail(409, "Permohonan latihan telah ditutup.");
}
