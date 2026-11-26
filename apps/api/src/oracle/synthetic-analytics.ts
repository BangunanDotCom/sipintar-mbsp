import type { Prisma } from "@prisma/client";
import type { Connection } from "oracledb";
import { completionEvent } from "../../../../packages/shared/src/synthetic-completion-contract.js";
import type { AnalyticsRepository, Counts } from "../synthetic-analytics.js";
import type { ReviewOfficer } from "../synthetic-portal-review.js";
import type { OraclePool } from "./pool.js";
import { oracleInList, oracleTable, queryRows, timestamp } from "./query.js";
import { createOracleSyntheticReviewRepository } from "./synthetic-review.js";

type Filters = Parameters<AnalyticsRepository["applications"]>[1];
type CaseRow = { id: string; actorId: string; snapshot: string };
type Event = {
  id: string;
  target: string;
  action: string;
  command: string | null;
  version: number | null;
  departments: string | null;
  role: string | null;
  createdAt: Date;
  stamp: string;
};
const days7 = 7 * 86_400_000;

export function createOracleSyntheticAnalytics(
  pool: OraclePool,
): AnalyticsRepository {
  const submissions = oracleTable(pool, "STL_SYNTHETIC_SUBMISSIONS");
  const audit = oracleTable(pool, "STL_AUDIT_LOGS");
  const review = createOracleSyntheticReviewRepository(pool);

  async function* eligible(
    connection: Connection,
    officer: ReviewOfficer,
    filters: Filters,
  ) {
    const tx = review.onConnection(connection);
    let last = "";
    for (;;) {
      const page = await queryRows<CaseRow>(
        connection,
        `SELECT S.ID AS "id",S.ACTOR_ID AS "actorId",S.SNAPSHOT AS "snapshot" FROM ${submissions} S
         WHERE S.ID>:last AND JSON_VALUE(S.SNAPSHOT,'$.districtId')=:district
           AND S.ACTOR_ID<>:actor AND S.POLICY_VERSION LIKE 'SYNTHETIC-%'
           AND NOT EXISTS (SELECT 1 FROM ${submissions} C WHERE C.DRAFT_ID=S.DRAFT_ID AND C.PREVIOUS_ID=S.ID)
           ${filters.from ? "AND S.CREATED_AT>=:fromTime" : ""}
           ${filters.until ? "AND S.CREATED_AT<:untilTime" : ""}
           ${filters.category ? "AND LOWER(JSON_VALUE(S.SNAPSHOT,'$.buildingType'))=LOWER(:category)" : ""}
         ORDER BY S.ID FETCH FIRST 200 ROWS ONLY`,
        {
          last: last || " ",
          district: officer.district,
          actor: officer.operator.userId,
          ...(filters.from && { fromTime: timestamp(filters.from) }),
          ...(filters.until && { untilTime: timestamp(filters.until) }),
          ...(filters.category && { category: filters.category }),
        },
      );
      if (!page.length) break;
      const allowed: string[] = [];
      for (const { id, actorId, snapshot } of page) {
        try {
          await tx.requireSnapshotAuthority({
            actorId,
            snapshot: JSON.parse(snapshot) as Prisma.JsonValue,
          });
          allowed.push(id);
        } catch (err) {
          if (
            !(err instanceof Error) ||
            !("statusCode" in err) ||
            ![404, 409].includes(Number(err.statusCode))
          )
            throw err;
        }
      }
      if (allowed.length) yield allowed;
      last = page[page.length - 1].id;
      if (page.length < 200) break;
    }
  }

  async function events(
    connection: Connection,
    ids: string[],
    onlyClosed = false,
  ) {
    const targets = oracleInList("TARGET", ids, "IN", "report_");
    return queryRows<Event>(
      connection,
      `SELECT ID AS "id",TARGET AS "target",ACTION AS "action",ACTIVE_ROLE AS "role",CREATED_AT AS "createdAt",
        TO_CHAR(SYS_EXTRACT_UTC(CREATED_AT),'YYYY-MM-DD"T"HH24:MI:SS.FF6') AS "stamp",
        JSON_VALUE(METADATA,'$.command.action') AS "command",
        JSON_VALUE(METADATA,'$.version' RETURNING NUMBER NULL ON ERROR) AS "version",
        JSON_QUERY(METADATA,'$.command.departments') AS "departments"
       FROM ${audit} WHERE ${targets.sql} AND OUTCOME='SUCCESS'
         AND ${onlyClosed ? "ACTION=:completion AND JSON_VALUE(METADATA,'$.command.action')='CLOSE'" : "ACTION LIKE 'SYNTHETIC_PORTAL_%'"}`,
      { ...targets.binds, ...(onlyClosed && { completion: completionEvent }) },
    );
  }
  return {
    applications: (officer, filters) =>
      pool.transaction(async (connection) => {
        await connection.execute(
          "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE",
        );
        await review.onConnection(connection).lockOfficer(officer);
        const now = Date.now();
        const counts = new Map<Counts["status"], Counts>();
        for await (const ids of eligible(connection, officer, filters)) {
          const grouped = new Map<string, Event[]>();
          for (const e of await events(connection, ids)) {
            const values = grouped.get(e.target) ?? [];
            values.push(e);
            grouped.set(e.target, values);
          }
          for (const id of ids) {
            const rows = grouped.get(id) ?? [];
            const has = (action: string) =>
              rows.some((e) => e.action === action);
            const completion = rows.filter((e) => e.action === completionEvent);
            const completed = (command: string) =>
              completion.some((e) => e.command === command);
            const referred = completion
              .filter(
                (e) =>
                  (e.command === "REFER" || e.command === "REREFER") &&
                  Number.isInteger(e.version) &&
                  Number(e.version) >= 0 &&
                  Number(e.version) <= 999,
              )
              .sort((a, b) => Number(b.version) - Number(a.version))[0];
            const closed = completed("CLOSE");
            const status = has("SYNTHETIC_PORTAL_REGISTERED")
              ? "REGISTERED"
              : has("SYNTHETIC_PORTAL_CORRECTION_REQUESTED")
                ? "CORRECTION_REQUESTED"
                : has("SYNTHETIC_PORTAL_COMPLETE")
                  ? "COMPLETE"
                  : "SUBMITTED";
            const total = counts.get(status) ?? {
              status,
              cases: 0,
              firstPaid: 0,
              secondPaid: 0,
              referred: 0,
              overdue: 0,
              closed: 0,
            };
            total.cases++;
            if (has("SYNTHETIC_PORTAL_INVOICE_SETTLED")) total.firstPaid++;
            if (completed("SETTLE_SECOND")) total.secondPaid++;
            if (completed("REFER")) total.referred++;
            if (closed) total.closed++;
            if (
              referred &&
              !closed &&
              referred.createdAt.getTime() + days7 <= now
            ) {
              const departments =
                referred.command === "REFER"
                  ? ["PERANCANG_BANDAR", "KEJURUTERAAN"]
                  : JSON.parse(referred.departments ?? "[]");
              if (
                Array.isArray(departments) &&
                departments.some(
                  (d) =>
                    !completion.some(
                      (e) =>
                        e.role === d &&
                        e.command === "COMMENT" &&
                        Number.isInteger(e.version) &&
                        Number(e.version) <= 999 &&
                        Number(e.version) > Number(referred.version),
                    ),
                )
              )
                total.overdue++;
            }
            counts.set(status, total);
          }
        }
        return [...counts.values()].sort((a, b) =>
          a.status.localeCompare(b.status),
        );
      }),
    archive: (officer, page) =>
      pool.transaction(async (connection) => {
        await connection.execute(
          "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE",
        );
        await review.onConnection(connection).lockOfficer(officer);
        const latest = new Map<string, Event>();
        for await (const ids of eligible(connection, officer, {
          from: null,
          until: null,
        })) {
          for (const event of await events(connection, ids, true)) {
            const prior = latest.get(event.target);
            if (!prior || prior.stamp < event.stamp)
              latest.set(event.target, event);
          }
        }
        const start = (page - 1) * 20;
        return [...latest.values()]
          .sort(
            (a, b) =>
              b.stamp.localeCompare(a.stamp) ||
              b.target.localeCompare(a.target),
          )
          .slice(start, start + 21)
          .map((e) => ({ id: e.target, closedAt: e.createdAt }));
      }),
  };
}
