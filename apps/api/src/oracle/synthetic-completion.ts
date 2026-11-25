import { z } from "zod";
import type { Connection } from "oracledb";
import { createOracleAuditRepository } from "./audit.js";
import type { OraclePool } from "./pool.js";
import { oracleTable, queryRows } from "./query.js";

const caseScope = z.strictObject({
  id: z.uuid(),
  district: z.enum(["SPU", "SPT", "SPS"]),
  excludedActorId: z.uuid(),
});
const eventKind = "SYNTHETIC_PORTAL_COMPLETION";
const metadataSchema = z.strictObject({
  version: z.number().int().positive(),
  timestamp: z.number().int().nonnegative(),
  firstPaid: z.boolean(),
  feeSen: z.number().int().nonnegative().nullable(),
  invoiceId: z.uuid().optional(),
  command: z.object({ action: z.string().min(1) }).passthrough(),
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
    const rows = await queryRows<{
      ACTOR_ID: string;
      ACTIVE_ROLE: string | null;
      METADATA: string;
    }>(
      connection,
      `SELECT ACTOR_ID, ACTIVE_ROLE, METADATA FROM ${auditLog}
       WHERE TARGET = :id AND ACTION = :action AND OUTCOME = 'SUCCESS'
       FETCH FIRST 501 ROWS ONLY`,
      { id: scope.id, action: eventKind },
    );
    if (rows.length > 500) throw Error("Had sejarah Oracle makmal dicapai.");
    const events = rows
      .map(({ ACTOR_ID, ACTIVE_ROLE, METADATA }): History => ({
        actorId: z.string().min(1).parse(ACTOR_ID),
        activeRole: ACTIVE_ROLE,
        metadata: metadataSchema.parse(JSON.parse(METADATA)),
      }))
      .sort((a, b) => a.metadata.version - b.metadata.version);
    if (events.some(({ metadata }, index) => metadata.version !== index + 1))
      throw Error("Versi sejarah Oracle tidak konsisten.");
    return { snapshot: JSON.parse(row.SNAPSHOT) as unknown, events };
  }

  return {
    lockedHistory,
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
      await audit.append(connection, {
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
