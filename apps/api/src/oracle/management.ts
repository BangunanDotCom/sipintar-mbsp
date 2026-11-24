import { randomUUID } from "node:crypto";
import type { AuditLog, Prisma } from "@prisma/client";
import type {
  Configuration,
  ManagementRepository,
} from "../management-repository.js";
import { createOracleAuditRepository } from "./audit.js";
import { decodeOracleConfig, encodeOracleConfig } from "./config-value.js";
import type { OraclePool } from "./pool.js";
import { affected, oracleTable, queryRows } from "./query.js";

type ConfigRow = Omit<Configuration, "versions" | "value"> & { value: string };
type VersionRow = Omit<Configuration["versions"][number], "value"> & {
  value: string;
};
type AuditRow = Omit<AuditLog, "metadata"> & { metadata: string | null };

export function createOracleManagementRepository(
  pool: OraclePool,
): ManagementRepository {
  const notifications = oracleTable(pool, "STL_NOTIFICATIONS");
  const configs = oracleTable(pool, "STL_SYSTEM_CONFIGURATIONS");
  const versions = oracleTable(pool, "STL_CONFIGURATION_VERSIONS");
  const logs = oracleTable(pool, "STL_AUDIT_LOGS");
  const assignments = oracleTable(pool, "STL_AREA_ASSIGNMENTS");
  const areas = oracleTable(pool, "STL_AREAS");
  const email = oracleTable(pool, "STL_EMAIL_DELIVERY_LOGS");
  const audit = createOracleAuditRepository(pool);
  return {
    markNotificationRead: (id, userId) =>
      pool.transaction(async (connection) => ({
        count: await affected(
          connection,
          `UPDATE ${notifications} SET READ_AT=SYSTIMESTAMP WHERE ID=:id AND USER_ID=:userId`,
          { id, userId },
        ),
      })),
    configurations: (scope) =>
      pool.transaction(async (connection) => {
        await connection.execute("SET TRANSACTION READ ONLY");
        const filter = { prefix: scope + "." };
        const rows = await queryRows<ConfigRow>(
          connection,
          `SELECT KEY AS "key", VALUE AS "value", UPDATED_AT AS "updatedAt" FROM ${configs}
          WHERE SUBSTR(KEY,1,LENGTH(:prefix))=:prefix ORDER BY KEY`,
          filter,
        );
        const versionRows = await queryRows<VersionRow>(
          connection,
          `SELECT ID AS "id", KEY AS "key", VALUE AS "value", CHANGED_BY AS "changedBy",
          REASON AS "reason", CREATED_AT AS "createdAt" FROM (
            SELECT V.*, ROW_NUMBER() OVER (PARTITION BY KEY ORDER BY CREATED_AT DESC, ID DESC) AS STL_RN
            FROM ${versions} V WHERE SUBSTR(KEY,1,LENGTH(:prefix))=:prefix
          ) WHERE STL_RN <= 10 ORDER BY KEY, STL_RN`,
          filter,
        );
        const grouped = new Map<string, Configuration["versions"]>();
        for (const row of versionRows) {
          const version = { ...row, value: decodeOracleConfig(row.value) };
          const entries = grouped.get(row.key);
          if (entries) entries.push(version);
          else grouped.set(row.key, [version]);
        }
        return rows.map((row) => ({
          ...row,
          value: decodeOracleConfig(row.value),
          versions: grouped.get(row.key) ?? [],
        }));
      }),
    changeConfiguration: ({ key, value, reason, userId, activeRole }) =>
      pool.transaction(async (connection) => {
        const data = { key, value: encodeOracleConfig(value) };
        const update = () =>
          affected(
            connection,
            `UPDATE ${configs} SET VALUE=:value, UPDATED_AT=SYSTIMESTAMP WHERE KEY=:key`,
            data,
          );
        if (!(await update())) {
          try {
            await connection.execute(
              `INSERT INTO ${configs} (KEY,VALUE,UPDATED_AT) VALUES (:key,:value,SYSTIMESTAMP)`,
              data,
            );
          } catch (error) {
            if (
              !(
                error instanceof Error &&
                "code" in error &&
                error.code === "ORA-00001"
              ) ||
              !(await update())
            )
              throw error;
          }
        }
        await connection.execute(
          `INSERT INTO ${versions} (ID,KEY,VALUE,CHANGED_BY,REASON) VALUES (:id,:key,:value,:userId,:reason)`,
          { ...data, id: randomUUID(), userId, reason },
        );
        await audit.append(connection, {
          actorId: userId,
          activeRole,
          action: "CONFIG_CHANGED",
          target: key,
        });
      }),
    auditHistory: (userId) =>
      pool.use(async (connection) => {
        const where = userId
          ? `WHERE L.ACTOR_ID=:userId OR (L.ACTION='AREA_REASSIGNED' AND EXISTS (
        SELECT 1 FROM ${assignments} A JOIN ${areas} R ON R.ID=A.AREA_ID WHERE A.ASSIGNED_BY=:userId AND R.ID=L.TARGET
      ))`
          : "";
        const result = await queryRows<AuditRow>(
          connection,
          `SELECT L.ID AS "id", L.ACTOR_ID AS "actorId", L.ACTIVE_ROLE AS "activeRole",
          L.ACTION AS "action", L.TARGET AS "target", L.OUTCOME AS "outcome",
          L.METADATA AS "metadata", L.CREATED_AT AS "createdAt"
          FROM ${logs} L ${where} ORDER BY L.CREATED_AT DESC, L.ID DESC FETCH FIRST 100 ROWS ONLY`,
          userId ? { userId } : {},
        );
        return result.map((row) => ({
          ...row,
          metadata:
            row.metadata === null
              ? null
              : (JSON.parse(row.metadata) as Prisma.JsonValue),
        }));
      }),
    emailStatus: () =>
      pool.use((connection) =>
        queryRows<{ status: string; _count: number }>(
          connection,
          `SELECT STATUS AS "status", COUNT(*) AS "_count" FROM ${email} GROUP BY STATUS`,
          {},
        ),
      ),
  };
}
