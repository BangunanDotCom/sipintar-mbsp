import { Prisma } from "@prisma/client";
import {
  completionEvent as eventName,
  completionEventRole,
  completionStoredMetadata,
} from "../../../packages/shared/src/synthetic-completion-contract.js";
import {
  replayCompletionCommand,
  completionState,
  completionHistoryByteLimit,
  completionHistorySegmentSize,
  assertCompletionHistoryCount,
} from "../../../packages/shared/src/synthetic-completion.js";
import { fail } from "./auth.js";
type Tx = Prisma.TransactionClient;

const versionSql = Prisma.sql`CASE WHEN metadata->>'version' ~ '^[1-9][0-9]{0,3}$'
  THEN (metadata->>'version')::integer ELSE NULL END`;

export async function replayCompletion(
  tx: Tx,
  id: string,
  scopes: { unitId: string; floorId: string }[],
) {
  const [head] = await tx.$queryRaw<
    {
      count: number;
      distinctCount: number;
      maximum: number;
      bytes: bigint;
    }[]
  >`SELECT count(*)::int AS count,
    count(DISTINCT ${versionSql})::int AS "distinctCount",
    COALESCE(max(${versionSql}),0)::int AS maximum,
    COALESCE(sum(octet_length(metadata::text)),0)::bigint AS bytes
    FROM audit_logs WHERE target=${id} AND action=${eventName} AND outcome='SUCCESS'`;
  try {
    assertCompletionHistoryCount(head.count);
  } catch {
    fail(409, "Sejarah latihan melebihi had persediaan.");
  }
  if (
    head.count !== head.distinctCount ||
    head.count !== head.maximum ||
    head.bytes > BigInt(completionHistoryByteLimit)
  )
    fail(409, "Sejarah latihan tidak konsisten atau melebihi had data.");

  const state = completionState();
  let issuedAt: Date | undefined;
  let settledAt: Date | undefined;
  for (
    let offset = 0;
    offset < head.count;
    offset += completionHistorySegmentSize
  ) {
    const end = Math.min(head.count, offset + completionHistorySegmentSize);
    const events = await tx.$queryRaw<
      {
        actorId: string | null;
        activeRole: string | null;
        metadata: Prisma.JsonValue;
      }[]
    >`SELECT "actorId","activeRole",metadata FROM audit_logs
      WHERE target=${id} AND action=${eventName} AND outcome='SUCCESS'
        AND ${versionSql}>${offset} AND ${versionSql}<=${end}
      ORDER BY ${versionSql}, id LIMIT ${completionHistorySegmentSize + 1}`;
    if (events.length !== end - offset)
      fail(409, "Segmen sejarah latihan tidak konsisten.");
    for (const { actorId, activeRole, metadata } of events) {
      const event = completionStoredMetadata.safeParse(metadata);
      if (
        !event.success ||
        !actorId ||
        event.data.version !== state.version + 1
      )
        fail(409, "Versi sejarah latihan tidak konsisten.");
      const role = completionEventRole(
        actorId,
        activeRole,
        event.data.command.action,
      );
      if (!role) fail(409, "Pelaku sejarah latihan tidak sah.");
      try {
        const applied = replayCompletionCommand(state, event.data.command, {
          ...event.data,
          actorId,
          role,
          now: event.data.timestamp,
          scopes,
        });
        if (!applied.changed) fail(409, "Peralihan sejarah diduplikasi.");
        if (event.data.command.action === "ISSUE_SECOND")
          issuedAt = new Date(event.data.timestamp);
        if (event.data.command.action === "SETTLE_SECOND")
          settledAt = new Date(event.data.timestamp);
      } catch {
        fail(409, "Sejarah peralihan latihan tidak konsisten.");
      }
    }
  }
  return { state, issuedAt, settledAt };
}

export async function assertCompletionAppendBudget(
  tx: Tx,
  id: string,
  metadata: Prisma.InputJsonValue,
) {
  const [result] = await tx.$queryRaw<{ bytes: bigint }[]>`
    SELECT (COALESCE(sum(octet_length(metadata::text)),0) +
      octet_length((${JSON.stringify(metadata)}::jsonb)::text))::bigint AS bytes
    FROM audit_logs WHERE target=${id} AND action=${eventName} AND outcome='SUCCESS'`;
  if (result.bytes > BigInt(completionHistoryByteLimit))
    fail(409, "Peralihan latihan melebihi had data sejarah.");
}

export async function stateFor(...args: Parameters<typeof replayCompletion>) {
  return (await replayCompletion(...args)).state;
}
