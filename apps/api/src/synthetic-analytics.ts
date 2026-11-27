import {
  syntheticRecordOverlay,
  syntheticRetentionDays,
  syntheticRetentionReview,
} from "./synthetic-record-overlay.js";
import { stateFor } from "./synthetic-completion-journal.js";
import { completionEvent } from "../../../packages/shared/src/synthetic-completion-contract.js";
import {
  technicalReferralDeadline,
  technicalSla,
} from "../../../packages/shared/src/synthetic-completion.js";
import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { fail } from "./auth.js";
import { postgresAuth, type AuthRepository } from "./auth-repository.js";
import { db } from "./core.js";
import {
  lockSyntheticOfficer,
  loadSyntheticReview,
  syntheticReviewOfficer,
  postgresSyntheticReviewTransaction,
  type SyntheticReviewTransaction,
} from "./synthetic-portal-review.js";

const departmentFilter = z.enum(["SPU", "SPT", "SPS"]);
const criteria = z.strictObject({
  district: departmentFilter.optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  category: z.string().trim().min(1).max(160).optional(),
  format: z.enum(["json", "csv"]).default("json"),
});

export type Counts = {
  status: "SUBMITTED" | "CORRECTION_REQUESTED" | "COMPLETE" | "REGISTERED";
  cases: number;
  firstPaid: number;
  secondPaid: number;
  referred: number;
  overdue: number;
  closed: number;
};

export type ReportEvent = {
  action: string;
  role: string | null;
  command: string | null;
  version: number | null;
  departments: string[] | null;
  department: string | null;
  timestamp: number | null;
};

export function countReportCases(
  counts: Map<Counts["status"], Counts>,
  rows: ReportEvent[],
  now: number,
) {
  const has = (action: string) => rows.some((row) => row.action === action);
  const journal = rows.filter((row) => row.action === completionEvent);
  const did = (command: string) =>
    journal.some((row) => row.command === command);
  const closed = did("CLOSE");
  const status = has("SYNTHETIC_PORTAL_REGISTERED")
    ? "REGISTERED"
    : has("SYNTHETIC_PORTAL_CORRECTION_REQUESTED")
      ? "CORRECTION_REQUESTED"
      : has("SYNTHETIC_PORTAL_COMPLETE")
        ? "COMPLETE"
        : "SUBMITTED";
  const result = counts.get(status) ?? {
    status,
    cases: 0,
    firstPaid: 0,
    secondPaid: 0,
    referred: 0,
    overdue: 0,
    closed: 0,
  };
  const departments = ["PERANCANG_BANDAR", "KEJURUTERAAN"];
  const ordered = journal
    .filter(({ version }) => Number.isInteger(version) && version! > 0)
    .sort((left, right) => left.version! - right.version!);
  let deadline: number | null = null;
  const pending = new Set<string>();
  for (const row of ordered) {
    if (row.command === "REFER" || row.command === "REREFER") {
      deadline =
        row.timestamp !== null
          ? technicalReferralDeadline(row.timestamp)
          : null;
      pending.clear();
      for (const role of row.command === "REFER"
        ? departments
        : (row.departments ?? []))
        pending.add(role);
    } else if (row.command === "COMMENT" && row.role) {
      pending.delete(row.role);
    } else if (row.command === "RETURN_COMMENT" && row.department) {
      pending.add(row.department);
    }
  }
  result.cases++;
  if (has("SYNTHETIC_PORTAL_INVOICE_SETTLED")) result.firstPaid++;
  if (did("SETTLE_SECOND")) result.secondPaid++;
  if (did("REFER")) result.referred++;
  if (closed) result.closed++;
  if (
    deadline !== null &&
    technicalSla(closed, deadline, pending.size > 0, now)
  )
    result.overdue++;
  counts.set(status, result);
}

// A case is counted only while the version captured in its snapshot is still
// authorized. The query needs no company names, document paths or staff IDs.
const liveAuthority = Prisma.sql`
  ((s.snapshot->>'capacity' = 'INDIVIDUAL' AND s.snapshot->'companyId' = 'null'::jsonb)
   OR (s.snapshot->>'capacity' = 'COMPANY' AND EXISTS (
     SELECT 1
     FROM company_representatives r
     JOIN companies c ON c.id = r."companyId" AND c.status = 'ACTIVE'
     JOIN delegation_documents d ON d.id = r."verifiedDocumentId"
       AND d."representativeId" = r.id AND d."companyId" = c.id
     WHERE r."userId" = s."actorId" AND r.status = 'VERIFIED'
       AND r.id = s.snapshot->>'representativeId'
       AND c.id = s.snapshot->>'companyId'
       AND r."startsAt" <= CURRENT_TIMESTAMP AND (r."endsAt" IS NULL OR r."endsAt" > CURRENT_TIMESTAMP)
       AND d.id = s.snapshot->'authorityProof'->>'id'
       AND d.version::text = s.snapshot->'authorityProof'->>'version'
       AND d.sha256 = s.snapshot->'authorityProof'->>'sha256'
       AND d."authorityType" = r."authorityType"
       AND d."supersededAt" IS NULL AND d."revokedAt" IS NULL
       AND d."validFrom" <= CURRENT_TIMESTAMP AND (d."validUntil" IS NULL OR d."validUntil" > CURRENT_TIMESTAMP)
       AND d."mimeType" = 'application/pdf' AND d."byteSize" > 0
       AND d."scanStatus" = 'CLEAN' AND d."scanSha256" = d.sha256
       AND btrim(d."scanEngine") <> '' AND d."scanValidUntil" > CURRENT_TIMESTAMP
       AND d."scanLeaseToken" IS NULL AND d."scanLeaseExpiresAt" IS NULL
       AND octet_length(d.content) = d."byteSize" AND encode(sha256(d.content), 'hex') = d.sha256
   )))
`;

type ArchiveRow = { id: string; closedAt: Date; eligibleAt?: Date };

export async function retentionPage(
  tx: Pick<
    SyntheticReviewTransaction,
    | "auditHistory"
    | "activeSubmission"
    | "requireSnapshotAuthority"
    | "audit"
    | "databaseNow"
    | "lockOfficer"
    | "reviewEvents"
  >,
  events: Parameters<typeof stateFor>[0]["events"],
  rows: AsyncIterable<ArchiveRow>,
  officer: Awaited<ReturnType<typeof syntheticReviewOfficer>>,
  page: number,
  days: number,
) {
  const now = await tx.databaseNow();
  let offset = (page - 1) * 20;
  const items: ArchiveRow[] = [];
  for await (const row of rows) {
    if (row.closedAt.getTime() + days * 86_400_000 > now.getTime()) continue;
    const submission = await tx.activeSubmission(row.id, officer);
    if (!submission) continue;
    await tx.requireSnapshotAuthority(submission);
    const {
      snapshot: { units },
    } = await loadSyntheticReview(tx, submission);
    const scopes = units.flatMap(({ id, floorIds }) =>
      floorIds.map((floorId) => ({ unitId: id, floorId })),
    );
    if (!(await stateFor({ events }, row.id, scopes)).closed)
      fail(409, "Penutupan arkib latihan tidak konsisten.");
    const overlay = await syntheticRecordOverlay(tx, row.id);
    const assessment = syntheticRetentionReview(
      row.closedAt,
      days,
      overlay,
      now,
    );
    if (assessment.status !== "REVIEW_DUE") continue;
    if (offset > 0) {
      offset--;
      continue;
    }
    items.push({ ...row, eligibleAt: assessment.eligibleAt });
    if (items.length === 21) break;
  }
  await tx.audit({
    actorId: officer.operator.userId,
    activeRole: officer.role,
    target: officer.district,
    action: "SYNTHETIC_RETENTION_REVIEW_ACCESSED",
    metadata: { page, count: Math.min(items.length, 20), retentionDays: days },
  });
  await tx.lockOfficer(officer);
  return items;
}

export type AnalyticsRepository = {
  applications(
    officer: Awaited<ReturnType<typeof syntheticReviewOfficer>>,
    filters: { from: Date | null; until: Date | null; category?: string },
  ): Promise<Counts[]>;
  archive(
    officer: Awaited<ReturnType<typeof syntheticReviewOfficer>>,
    page: number,
    retention: number | null,
  ): Promise<ArchiveRow[]>;
};

export async function syntheticAnalyticsRoutes(
  portal: FastifyInstance,
  auth: AuthRepository = postgresAuth,
  repository?: AnalyticsRepository,
  completionEnabled = false,
) {
  portal.get("/reports/applications", async (req, reply) => {
    const officer = await syntheticReviewOfficer(req, auth);
    const input = criteria.parse(req.query);
    if (input.district && input.district !== officer.district)
      fail(404, "Laporan latihan tidak tersedia dalam skop ini.");
    if (input.from && input.to && input.from > input.to)
      fail(400, "Julat tarikh tidak sah.");
    const from = input.from ? new Date(input.from + "T00:00:00+08:00") : null;
    const until = input.to
      ? new Date(Date.parse(input.to + "T00:00:00+08:00") + 86_400_000)
      : null;
    const rows = repository
      ? await repository.applications(officer, {
          from,
          until,
          category: input.category,
        })
      : await db.$transaction(
          async (tx) => {
            await lockSyntheticOfficer(tx, officer);
            const counts = new Map<Counts["status"], Counts>();
            const now = Date.now();
            let cursor = "";
            for (;;) {
              const page: (ReportEvent & { id: string })[] = await tx.$queryRaw`
                WITH eligible AS (
                  SELECT s.id FROM synthetic_submissions s
                  WHERE s.id > ${cursor} AND s.snapshot->>'districtId' = ${officer.district}
                    AND s."policyVersion" LIKE 'SYNTHETIC-%'
                    AND s."actorId" <> ${officer.operator.userId}
                    AND NOT EXISTS (
                      SELECT 1 FROM synthetic_submissions child
                      WHERE child."previousId" = s.id AND child."draftId" = s."draftId"
                    )
                    ${from ? Prisma.sql`AND s."createdAt" >= ${from}` : Prisma.empty}
                    ${until ? Prisma.sql`AND s."createdAt" < ${until}` : Prisma.empty}
                    ${input.category ? Prisma.sql`AND lower(s.snapshot->>'buildingType') = lower(${input.category})` : Prisma.empty}
                    AND ${liveAuthority}
                  ORDER BY s.id LIMIT 500
                )
                SELECT eligible.id, a.action, a."activeRole" AS role,
                  a.metadata->'command'->>'action' AS command,
                  a.metadata->'command'->>'department' AS department,
                  CASE WHEN jsonb_typeof(a.metadata->'command'->'departments') = 'array'
                    THEN a.metadata->'command'->'departments' END AS departments,
                  CASE WHEN a.metadata->>'version' ~ '^[0-9]{1,3}$'
                    THEN (a.metadata->>'version')::int END AS version,
                  CASE WHEN a.metadata->>'timestamp' ~ '^[0-9]{1,15}$'
                    THEN (a.metadata->>'timestamp')::double precision END AS timestamp
                FROM eligible LEFT JOIN audit_logs a ON a.target=eligible.id
                  AND a.outcome='SUCCESS' AND a.action LIKE 'SYNTHETIC_PORTAL_%'
                ORDER BY eligible.id
              `;
              const grouped = new Map<string, ReportEvent[]>();
              for (const row of page) {
                const events = grouped.get(row.id) ?? [];
                if (row.action) events.push(row);
                grouped.set(row.id, events);
              }
              for (const [id, events] of grouped) {
                countReportCases(counts, events, now);
                cursor = id;
              }
              if (grouped.size < 500) break;
            }
            return [...counts.values()].sort((a, b) =>
              a.status.localeCompare(b.status),
            );
          },
          { isolationLevel: "RepeatableRead", timeout: 15_000 },
        );
    if (input.format === "json") return { district: officer.district, rows };
    return reply
      .header(
        "Content-Disposition",
        `attachment; filename="staylink-latihan-laporan-${officer.district}.csv"`,
      )
      .header("X-Content-Type-Options", "nosniff")
      .type("text/csv; charset=utf-8")
      .send(
        [
          "daerah,status,kes,bayaran_pertama,bayaran_kedua,dirujuk,lewat,ditutup",
          ...rows.map((row) =>
            [
              officer.district,
              row.status,
              row.cases,
              row.firstPaid,
              row.secondPaid,
              row.referred,
              row.overdue,
              row.closed,
            ].join(","),
          ),
          "",
        ].join("\r\n"),
      );
  });
  portal.get("/reports/archive", async (req) => {
    const officer = await syntheticReviewOfficer(req, auth);
    const { page, review } = z
      .strictObject({
        page: z.coerce.number().int().min(1).max(100_000).default(1),
        review: z.literal("retention").optional(),
      })
      .parse(req.query);
    const retentionDays =
      completionEnabled && officer.role === "PPSK"
        ? syntheticRetentionDays()
        : null;
    if (review && retentionDays === null)
      fail(404, "Semakan retensi latihan tidak tersedia.");
    const retention = review ? retentionDays : null;
    const items = repository
      ? await repository.archive(officer, page, retention)
      : await db.$transaction(
          async (tx) => {
            await lockSyntheticOfficer(tx, officer);
            const read = (offset: number, limit: number) => tx.$queryRaw<
              ArchiveRow[]
            >`
        SELECT s.id, max(a."createdAt") AS "closedAt"
        FROM synthetic_submissions s
        JOIN audit_logs a ON a.target = s.id AND a.outcome = 'SUCCESS'
          AND a.action = 'SYNTHETIC_PORTAL_COMPLETION' AND a.metadata->'command'->>'action' = 'CLOSE'
        WHERE s.snapshot->>'districtId' = ${officer.district}
          AND s."actorId" <> ${officer.operator.userId}
          AND s."policyVersion" LIKE 'SYNTHETIC-%'
          AND NOT EXISTS (SELECT 1 FROM synthetic_submissions child
            WHERE child."previousId" = s.id AND child."draftId" = s."draftId")
          AND ${liveAuthority}
        GROUP BY s.id
        ORDER BY max(a."createdAt") DESC, s.id DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
            if (retention === null) return read((page - 1) * 20, 21);
            async function* batches() {
              for (let offset = 0; ; offset += 100) {
                const batch = await read(offset, 100);
                yield* batch;
                if (batch.length < 100) break;
              }
            }
            return retentionPage(
              postgresSyntheticReviewTransaction(tx),
              (id) =>
                tx.auditLog.findMany({
                  where: {
                    target: id,
                    outcome: "SUCCESS",
                    action: completionEvent,
                  },
                  select: { actorId: true, activeRole: true, metadata: true },
                  take: 501,
                }),
              batches(),
              officer,
              page,
              retention,
            );
          },
          { isolationLevel: "RepeatableRead" },
        );
    return {
      district: officer.district,
      items: items.slice(0, 20),
      nextPage: items.length === 21 ? page + 1 : null,
      ...(retentionDays !== null && { retentionDays }),
    };
  });
}
