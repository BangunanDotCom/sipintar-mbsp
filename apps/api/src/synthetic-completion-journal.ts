import type { Prisma } from "@prisma/client";
import {
  completionEventRole,
  completionStoredMetadata,
} from "../../../packages/shared/src/synthetic-completion-contract.js";
import {
  applyCompletion,
  completionState,
  assertCompletionHistoryCount,
} from "../../../packages/shared/src/synthetic-completion.js";
import { fail } from "./auth.js";
type Tx = {
  events(id: string): Promise<
    {
      actorId: string | null;
      activeRole: string | null;
      metadata: Prisma.JsonValue;
    }[]
  >;
};

export async function replayCompletion(
  tx: Tx,
  id: string,
  scopes: { unitId: string; floorId: string }[],
) {
  const events = await tx.events(id);
  try {
    assertCompletionHistoryCount(events.length);
  } catch {
    fail(409, "Sejarah latihan melebihi had persediaan.");
  }
  const values = events
    .map(({ actorId, activeRole, metadata }) => {
      const parsed = completionStoredMetadata.safeParse(metadata);
      if (!parsed.success || !actorId) fail(409, "Sejarah latihan tidak sah.");
      const role = completionEventRole(
        actorId,
        activeRole,
        parsed.data.command.action,
      );
      if (!role) fail(409, "Pelaku sejarah latihan tidak sah.");
      return { actorId, role, ...parsed.data };
    })
    .sort((a, b) => a.version - b.version);
  let state = completionState();
  let issuedAt: Date | undefined;
  let settledAt: Date | undefined;
  for (const value of values) {
    if (value.version !== state.version + 1)
      fail(409, "Versi sejarah latihan tidak konsisten.");
    try {
      const applied = applyCompletion(state, value.command, {
        ...value,
        now: value.timestamp,
        scopes,
      });
      if (!applied.changed) fail(409, "Peralihan sejarah diduplikasi.");
      state = applied.state;
      if (value.command.action === "ISSUE_SECOND")
        issuedAt = new Date(value.timestamp);
      if (value.command.action === "SETTLE_SECOND")
        settledAt = new Date(value.timestamp);
    } catch {
      fail(409, "Sejarah peralihan latihan tidak konsisten.");
    }
  }
  return { state, issuedAt, settledAt };
}

export async function stateFor(...args: Parameters<typeof replayCompletion>) {
  return (await replayCompletion(...args)).state;
}
