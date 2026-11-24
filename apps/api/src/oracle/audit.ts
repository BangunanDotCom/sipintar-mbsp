import type { Connection } from "oracledb";
import oracledb from "oracledb";
import {
  newOracleId,
  oracleInstant,
  oracleInstantSql,
  oracleJson,
  oracleOptionalText,
} from "./codecs.js";
import type { OraclePool } from "./pool.js";

export interface AuditEntry {
  actorId?: string | null;
  activeRole?: string | null;
  action: string;
  target?: string | null;
  outcome?: string;
  metadata?: Record<string, unknown> | readonly unknown[];
  createdAt?: Date;
}

export function createOracleAuditRepository(pool: OraclePool) {
  if (!/^STL_LAB_[A-Z][A-Z0-9_]{0,19}$/.test(pool.owner))
    throw Error("Schema Oracle tidak sah.");
  const table = `${pool.owner}.STL_AUDIT_LOGS`;
  async function append(connection: Connection, entry: AuditEntry) {
    if (!entry.action.trim() || entry.outcome === "")
      throw Error("Tindakan dan hasil audit diperlukan.");
    const id = newOracleId();
    await connection.execute(
      `INSERT INTO ${table}
        (ID, ACTOR_ID, ACTIVE_ROLE, ACTION, TARGET, OUTCOME, METADATA, CREATED_AT)
        VALUES (:id, :actorId, :activeRole, :action, :target, :outcome, :metadata, ${oracleInstantSql(":createdAt")})`,
      {
        id,
        actorId: oracleOptionalText(entry.actorId),
        action: entry.action,
        activeRole: oracleOptionalText(entry.activeRole),
        target: oracleOptionalText(entry.target),
        outcome: entry.outcome ?? "SUCCESS",
        metadata:
          entry.metadata === undefined
            ? { val: null, type: oracledb.CLOB }
            : oracleJson(entry.metadata),
        createdAt: oracleInstant(entry.createdAt ?? new Date()),
      },
    );
    return id;
  }
  return {
    append,
    record: (entry: AuditEntry) =>
      pool.transaction((connection) => append(connection, entry)),
  };
}
