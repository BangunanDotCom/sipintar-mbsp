import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { fail } from "./auth.js";

export const recordAction = z.strictObject({
  version: z.number().int().nonnegative(),
  action: z.enum(["PLACE_HOLD", "RELEASE_HOLD", "REQUEST_REOPEN"]),
  reason: z.string().trim().min(5).max(500),
});

export async function syntheticRecordOverlay(
  tx: {
    auditHistory(
      id: string,
      action: string,
      take: number,
    ): Promise<{ metadata: Prisma.JsonValue; createdAt: Date }[]>;
  },
  id: string,
) {
  const events = await tx.auditHistory(id, "SYNTHETIC_ARCHIVE_CONTROL", 101);
  if (events.length > 100)
    fail(409, "Sejarah daftar rekod latihan melebihi had.");
  const history = events
    .map((item) => ({
      ...recordAction
        .extend({ version: z.number().int().positive() })
        .parse(item.metadata),
      createdAt: item.createdAt,
    }))
    .sort((a, b) => a.version - b.version);
  let legalHold = false;
  let reopenRequested = false;
  for (const [index, event] of history.entries()) {
    if (event.version !== index + 1)
      fail(409, "Sejarah daftar rekod tidak konsisten.");
    if (event.action === "PLACE_HOLD") legalHold = true;
    if (event.action === "RELEASE_HOLD") legalHold = false;
    if (event.action === "REQUEST_REOPEN") reopenRequested = true;
  }
  return {
    version: history.length,
    legalHold,
    reopenRequested,
    disposalEnabled: false,
    reopenEnabled: false,
    history,
  };
}

export function syntheticRetentionDays(env = process.env) {
  if (env.STAYLINK_SYNTHETIC_RECORDS !== "true") return null;
  const raw = env.STAYLINK_SYNTHETIC_RETENTION_DAYS;
  if (raw === undefined) return null;
  if (!/^[1-9]\d{0,3}$/.test(raw) || Number(raw) > 3650)
    fail(503, "Tempoh retensi latihan mesti antara 1 hingga 3650 hari.");
  return Number(raw);
}

export function syntheticRetentionReview(
  closedAt: Date,
  days: number,
  overlay: { legalHold: boolean; reopenRequested: boolean },
  now: Date,
) {
  const eligibleAt = new Date(closedAt.getTime() + days * 86_400_000);
  return {
    eligibleAt,
    status: overlay.legalHold
      ? "LEGAL_HOLD"
      : overlay.reopenRequested
        ? "REOPEN_REQUESTED"
        : eligibleAt <= now
          ? "REVIEW_DUE"
          : "RETAIN",
  };
}
