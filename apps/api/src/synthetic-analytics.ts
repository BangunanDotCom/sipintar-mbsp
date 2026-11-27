import { technicalReferralSlaMs } from "../../../packages/shared/src/synthetic-completion.js";
import { completionSandbox } from "./synthetic-completion-gate.js";
import { syntheticRecordOverlay, syntheticRetentionDays, syntheticRetentionReview } from "./synthetic-record-overlay.js";
import { stateFor } from "./synthetic-completion-journal.js";
import { lockSyntheticReview } from "./synthetic-portal-review.js";
import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { fail } from "./auth.js";
import { db } from "./core.js";
import {
  lockSyntheticOfficer,
  syntheticReviewOfficer,
} from "./synthetic-portal-review.js";

const departmentFilter = z.enum(["SPU", "SPT", "SPS"]);
const criteria = z.strictObject({
  district: departmentFilter.optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  category: z.string().trim().min(1).max(160).optional(),
  format: z.enum(["json", "csv"]).default("json"),
});

type Counts = {
  status: "SUBMITTED" | "CORRECTION_REQUESTED" | "COMPLETE" | "REGISTERED";
  cases: number;
  firstPaid: number;
  secondPaid: number;
  referred: number;
  overdue: number;
  closed: number;
};

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

export async function syntheticAnalyticsRoutes(portal: FastifyInstance) {
  portal.get("/reports/applications", async (req, reply) => {
    const officer = await syntheticReviewOfficer(req);
    const input = criteria.parse(req.query);
    if (input.district && input.district !== officer.district)
      fail(404, "Laporan latihan tidak tersedia dalam skop ini.");
    if (input.from && input.to && input.from > input.to)
      fail(400, "Julat tarikh tidak sah.");
    const from = input.from ? new Date(input.from + "T00:00:00+08:00") : null;
    const until = input.to
      ? new Date(Date.parse(input.to + "T00:00:00+08:00") + 86_400_000)
      : null;
    const dueBefore = Date.now() - technicalReferralSlaMs;
    const rows = await db.$transaction(
      async (tx) => {
        await lockSyntheticOfficer(tx, officer);
        return tx.$queryRaw<Counts[]>`
        WITH eligible AS (
          SELECT s.id FROM synthetic_submissions s
          WHERE s.snapshot->>'districtId' = ${officer.district}
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
        ),
        -- Each case has one active referral epoch. Only the last department
        -- action after that epoch can satisfy it. ACK does not satisfy the SLA.
        workflow AS (
          SELECT a.target, a."activeRole", a.metadata->'command' AS command,
            CASE WHEN a.metadata->>'version' ~ '^[1-9][0-9]{0,2}$'
              THEN (a.metadata->>'version')::int END AS version,
            CASE WHEN a.metadata->>'timestamp' ~ '^[0-9]{1,15}$'
              THEN (a.metadata->>'timestamp')::bigint END AS timestamp
          FROM eligible JOIN audit_logs a ON a.target = eligible.id
          WHERE a.outcome = 'SUCCESS' AND a.action = 'SYNTHETIC_PORTAL_COMPLETION'
        ),
        latest_referrals AS (
          SELECT DISTINCT ON (target) target, version, timestamp, command
          FROM workflow
          WHERE command->>'action' IN ('REFER','REREFER') AND version IS NOT NULL
          ORDER BY target, version DESC
        ),
        due_departments AS (
          SELECT r.target, r.version, d.role
          FROM latest_referrals r
          CROSS JOIN (VALUES ('PERANCANG_BANDAR'), ('KEJURUTERAAN')) AS d(role)
          WHERE r.timestamp <= ${dueBefore}::bigint
            AND (r.command->>'action' = 'REFER' OR (r.command->'departments') ? d.role)
        ),
        latest_comments AS (
          SELECT DISTINCT ON (c.target, department) c.target,
            CASE WHEN c.command->>'action' = 'COMMENT' THEN c."activeRole"
              ELSE c.command->>'department' END AS department,
            c.command->>'action' AS action, c.version
          FROM workflow c
          JOIN latest_referrals r ON r.target = c.target AND c.version > r.version
          WHERE c.command->>'action' IN ('COMMENT','RETURN_COMMENT')
          ORDER BY c.target, department, c.version DESC
        ),
        overdue_referrals AS (
          SELECT DISTINCT d.target FROM due_departments d
          LEFT JOIN latest_comments c ON c.target = d.target AND c.department = d.role
          WHERE c.action IS DISTINCT FROM 'COMMENT'
        ),
        journal AS (
          SELECT eligible.id,
            CASE
              WHEN bool_or(a.action = 'SYNTHETIC_PORTAL_REGISTERED') THEN 'REGISTERED'
              WHEN bool_or(a.action = 'SYNTHETIC_PORTAL_CORRECTION_REQUESTED') THEN 'CORRECTION_REQUESTED'
              WHEN bool_or(a.action = 'SYNTHETIC_PORTAL_COMPLETE') THEN 'COMPLETE'
              ELSE 'SUBMITTED'
            END AS status,
            bool_or(a.action = 'SYNTHETIC_PORTAL_INVOICE_SETTLED') AS first_paid,
            bool_or(a.action = 'SYNTHETIC_PORTAL_COMPLETION' AND a.metadata->'command'->>'action' = 'SETTLE_SECOND') AS second_paid,
            bool_or(a.action = 'SYNTHETIC_PORTAL_COMPLETION' AND a.metadata->'command'->>'action' = 'REFER') AS referred,
            bool_or(a.action = 'SYNTHETIC_PORTAL_COMPLETION' AND a.metadata->'command'->>'action' = 'CLOSE') AS closed,
            bool_or(o.target IS NOT NULL) AS overdue
          FROM eligible
          LEFT JOIN audit_logs a ON a.target = eligible.id AND a.outcome = 'SUCCESS'
            AND a.action LIKE 'SYNTHETIC_PORTAL_%'
          LEFT JOIN overdue_referrals o ON o.target = eligible.id
          GROUP BY eligible.id
        )
        SELECT status, count(*)::int AS cases,
          count(*) FILTER (WHERE first_paid)::int AS "firstPaid",
          count(*) FILTER (WHERE second_paid)::int AS "secondPaid",
          count(*) FILTER (WHERE referred)::int AS referred,
          count(*) FILTER (WHERE overdue AND NOT closed)::int AS overdue,
          count(*) FILTER (WHERE closed)::int AS closed
        FROM journal GROUP BY status ORDER BY status
      `;
      },
      { isolationLevel: "RepeatableRead" },
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
    const officer = await syntheticReviewOfficer(req);
    const { page, review } = z
      .strictObject({
        page: z.coerce.number().int().min(1).max(100_000).default(1),
        review: z.enum(["retention"]).optional(),
      })
      .parse(req.query);
    const retention = completionSandbox() && officer.role === "PPSK"
      ? syntheticRetentionDays() : null;
    if (review && retention === null) fail(404, "Semakan retensi latihan tidak tersedia.");
    const now = new Date();
    const cutoff = review && retention !== null
      ? new Date(now.getTime() - retention * 86_400_000)
      : null;
    // Project the validated overlay before pagination. A corrupt or over-limit
    // stream is ineligible and cannot consume a slot on a retention page.
    const retentionFilter = cutoff ? Prisma.sql`
      AND (SELECT
        count(*) <= 100
        AND count(*) = count(DISTINCT control.version)
        AND COALESCE(max(control.version), 0) = count(*)
        AND COALESCE(bool_and(control.valid), true)
        AND NOT COALESCE(bool_or(control.action = 'REQUEST_REOPEN'), false)
        AND COALESCE((array_agg(control.action ORDER BY control.version DESC)
          FILTER (WHERE control.action IN ('PLACE_HOLD','RELEASE_HOLD')))[1], 'RELEASE_HOLD') = 'RELEASE_HOLD'
      FROM (
        SELECT
          CASE WHEN jsonb_typeof(log.metadata->'version') = 'number'
            AND log.metadata->>'version' ~ '^[1-9][0-9]{0,2}$'
            THEN (log.metadata->>'version')::int END AS version,
          log.metadata->>'action' AS action,
          CASE WHEN jsonb_typeof(log.metadata) = 'object' THEN
            log.metadata - ARRAY['version','action','reason'] = '{}'::jsonb
            AND COALESCE(log.metadata->>'action' IN ('PLACE_HOLD','RELEASE_HOLD','REQUEST_REOPEN'), false)
            AND COALESCE(jsonb_typeof(log.metadata->'reason') = 'string'
              AND length(btrim(log.metadata->>'reason')) BETWEEN 5 AND 500, false)
          ELSE false END AS valid
        FROM audit_logs log
        WHERE log.target = s.id AND log.action = 'SYNTHETIC_ARCHIVE_CONTROL'
          AND log.outcome = 'SUCCESS'
        LIMIT 101
      ) control)` : Prisma.empty;
    const result = await db.$transaction(
      async (tx) => {
        await lockSyntheticOfficer(tx, officer);
        const rows = await tx.$queryRaw<{ id: string; closedAt: Date }[]>`
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
          ${retentionFilter}
        GROUP BY s.id
        ${cutoff ? Prisma.sql`HAVING max(a."createdAt") <= ${cutoff}` : Prisma.empty}
        ORDER BY max(a."createdAt") DESC, s.id DESC
        LIMIT 21 OFFSET ${(page - 1) * 20}
      `;
        const items = rows.slice(0, 20);
        const nextPage = rows.length === 21 ? page + 1 : null;
        if (!review || retention === null) return { items, nextPage };

        const candidates = [];
        for (const item of items) {
          const { snapshot } = await lockSyntheticReview(tx, item.id, officer, { forWrite: false });
          const scopes = snapshot.units.flatMap(({ id, floorIds }) =>
            floorIds.map((floorId) => ({ unitId: id, floorId })));
          if (!(await stateFor(tx, item.id, scopes)).closed)
            fail(409, "Penutupan arkib latihan tidak konsisten.");
          const overlay = await syntheticRecordOverlay(tx, item.id);
          const assessment = syntheticRetentionReview(item.closedAt, retention, overlay, now);
          if (assessment.status !== "REVIEW_DUE")
            fail(409, "Status retensi latihan tidak konsisten.");
          candidates.push({ ...item, eligibleAt: assessment.eligibleAt });
        }
        await tx.auditLog.create({ data: {
          actorId: officer.operator.userId, activeRole: officer.role,
          action: "SYNTHETIC_RETENTION_REVIEW_ACCESSED", target: officer.district,
          metadata: { page, count: candidates.length, retentionDays: retention },
        } });
        return { items: candidates, nextPage };
      },
      { isolationLevel: "RepeatableRead" },
    );
    return {
      district: officer.district,
      ...result,
      ...(retention !== null && { retentionDays: retention }),
    };
  });
}
