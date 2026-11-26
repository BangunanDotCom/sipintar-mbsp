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
