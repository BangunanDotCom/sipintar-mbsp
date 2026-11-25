import {
  completionEvent as eventKind,
  completionEventRole,
  completionStoredMetadata as metadataSchema,
} from "../../../../packages/shared/src/synthetic-completion-contract.js";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { fail } from "../auth.js";
import type { AuditEntry } from "./audit.js";
import type { Connection } from "oracledb";
import { createOracleAuditRepository } from "./audit.js";
import type { OraclePool } from "./pool.js";
import { oracleTable, queryRows } from "./query.js";

const caseScope = z.strictObject({
  id: z.uuid(),
  district: z.enum(["SPU", "SPT", "SPS"]),
  excludedActorId: z.uuid(),
});
type Scope = z.infer<typeof caseScope>;
type Metadata = z.infer<typeof metadataSchema>;
type History = {
  actorId: string;
  activeRole: string | null;
  metadata: Metadata;
};

// This repository relies on callers to validate current session and role in the
// same transaction before approving a domain transition. The server remains closed to Oracle.
export function createOracleCompletionRepository(pool: OraclePool) {
  const submissions = oracleTable(pool, "STL_SYNTHETIC_SUBMISSIONS");
  const auditLog = oracleTable(pool, "STL_AUDIT_LOGS");
  const audit = createOracleAuditRepository(pool);

  async function eventRows(connection: Connection, id: string) {
    return queryRows<{
      ACTOR_ID: string;
      ACTIVE_ROLE: string | null;
      METADATA: string;
    }>(
      connection,
      `SELECT ACTOR_ID, ACTIVE_ROLE, METADATA FROM ${auditLog}
       WHERE TARGET = :id AND ACTION = :action AND OUTCOME = 'SUCCESS'
       FETCH FIRST 501 ROWS ONLY`,
      { id, action: eventKind },
    );
  }

  async function appendEvent(connection: Connection, entry: AuditEntry) {
    const input = metadataSchema.safeParse(entry.metadata);
    if (
      !entry.actorId ||
      entry.action !== eventKind ||
      !input.success ||
      !completionEventRole(
        entry.actorId,
        entry.activeRole ?? null,
        input.data.command.action,
      )
    )
      fail(409, "Peristiwa latihan tidak sah.");
    await audit.append(connection, { ...entry, metadata: input.data });
  }

  async function lockedHistory(connection: Connection, rawScope: Scope) {
    const scope = caseScope.parse(rawScope);
    const [row] = await queryRows<{ SNAPSHOT: string }>(
      connection,
      `SELECT s.SNAPSHOT FROM ${submissions} s
       WHERE s.ID = :id AND s.ACTOR_ID <> :excludedActorId
         AND JSON_VALUE(s.SNAPSHOT, '$.districtId' RETURNING VARCHAR2(3) NULL ON ERROR) = :district
         AND NOT EXISTS (SELECT 1 FROM ${submissions} child
                          WHERE child.PREVIOUS_ID = s.ID AND child.DRAFT_ID = s.DRAFT_ID)
       FOR UPDATE OF s.ID WAIT 5`,
      scope,
    );
    if (!row) return null;
    const rows = await eventRows(connection, scope.id);
    if (rows.length > 500) throw Error("Had sejarah Oracle makmal dicapai.");
    const events = rows
      .map(({ ACTOR_ID, ACTIVE_ROLE, METADATA }): History => {
        const metadata = metadataSchema.parse(JSON.parse(METADATA));
        if (
          !completionEventRole(ACTOR_ID, ACTIVE_ROLE, metadata.command.action)
        )
          throw Error("Pelaku sejarah Oracle tidak sah.");
        return { actorId: ACTOR_ID, activeRole: ACTIVE_ROLE, metadata };
      })
      .sort((a, b) => a.metadata.version - b.metadata.version);
    if (events.some(({ metadata }, index) => metadata.version !== index + 1))
      throw Error("Versi sejarah Oracle tidak konsisten.");
    return { snapshot: JSON.parse(row.SNAPSHOT) as unknown, events };
  }

  return {
    lockedHistory,
    appendEvent,
    async events(connection: Connection, id: string) {
      return (await eventRows(connection, id)).map(
        ({ ACTOR_ID, ACTIVE_ROLE, METADATA }) => {
          let metadata: Prisma.JsonValue;
          try {
            metadata = JSON.parse(METADATA);
          } catch {
            fail(409, "Sejarah latihan tidak sah.");
          }
          return { actorId: ACTOR_ID, activeRole: ACTIVE_ROLE, metadata };
        },
      );
    },
    async append(
      connection: Connection,
      scope: Scope,
      actor: { id: string; role: string | null },
      expectedVersion: number,
      input: Omit<Metadata, "version">,
    ) {
      const record = await lockedHistory(connection, scope);
      if (!record) return null;
      if (record.events.length !== expectedVersion)
        throw Error("Versi sejarah Oracle sudah berubah.");
      if (expectedVersion >= 500)
        throw Error("Had sejarah Oracle makmal dicapai.");
      const metadata = metadataSchema.parse({
        ...input,
        version: expectedVersion + 1,
      });
      if (!completionEventRole(actor.id, actor.role, metadata.command.action))
        throw Error("Pelaku sejarah Oracle tidak sah.");
      await appendEvent(connection, {
        actorId: z.string().min(1).parse(actor.id),
        activeRole: actor.role,
        target: scope.id,
        action: eventKind,
        metadata,
      });
      return metadata.version;
    },
  };
}
