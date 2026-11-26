import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { fail } from "./auth.js";
import { postgresAuth, type AuthRepository } from "./auth-repository.js";
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

export type Counts = {
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

export type AnalyticsRepository = {
  applications(
    officer: Awaited<ReturnType<typeof syntheticReviewOfficer>>,
    filters: { from: Date | null; until: Date | null; category?: string },
  ): Promise<Counts[]>;
  archive(
    officer: Awaited<ReturnType<typeof syntheticReviewOfficer>>,
    page: number,
  ): Promise<{ id: string; closedAt: Date }[]>;
};

export async function syntheticAnalyticsRoutes(
  portal: FastifyInstance,
  auth: AuthRepository = postgresAuth,
  repository?: AnalyticsRepository,
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
        latest_referrals AS (
          SELECT DISTINCT ON (a.target) a.target, a."createdAt", a.metadata
          FROM eligible JOIN audit_logs a ON a.target = eligible.id
          WHERE a.outcome = 'SUCCESS' AND a.action = 'SYNTHETIC_PORTAL_COMPLETION'
            AND a.metadata->'command'->>'action' IN ('REFER', 'REREFER')
            AND a.metadata->>'version' ~ '^[0-9]{1,3}$'
          ORDER BY a.target, (a.metadata->>'version')::int DESC
        ),
        overdue_referrals AS (
          SELECT r.target FROM latest_referrals r
          WHERE r."createdAt" + interval '7 days' <= CURRENT_TIMESTAMP
            AND EXISTS (
              SELECT 1 FROM (VALUES ('PERANCANG_BANDAR'), ('KEJURUTERAAN')) AS dept(role)
              WHERE (
                r.metadata->'command'->>'action' = 'REFER'
                OR (r.metadata->'command'->'departments') ? dept.role
              ) AND NOT EXISTS (
                SELECT 1 FROM audit_logs c
                WHERE c.target = r.target AND c.action = 'SYNTHETIC_PORTAL_COMPLETION'
                  AND c.outcome = 'SUCCESS' AND c."activeRole" = dept.role
                  AND c.metadata->'command'->>'action' = 'COMMENT'
                  AND CASE WHEN c.metadata->>'version' ~ '^[0-9]{1,3}$'
                    THEN (c.metadata->>'version')::int > (r.metadata->>'version')::int ELSE false END
              )
            )
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
            EXISTS (SELECT 1 FROM overdue_referrals o WHERE o.target = eligible.id) AS overdue
          FROM eligible
          LEFT JOIN audit_logs a ON a.target = eligible.id AND a.outcome = 'SUCCESS'
            AND a.action LIKE 'SYNTHETIC_PORTAL_%'
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
    const officer = await syntheticReviewOfficer(req, auth);
    const { page } = z
      .strictObject({
        page: z.coerce.number().int().min(1).max(100_000).default(1),
      })
      .parse(req.query);
    const items = repository
      ? await repository.archive(officer, page)
      : await db.$transaction(
          async (tx) => {
            await lockSyntheticOfficer(tx, officer);
            return tx.$queryRaw<{ id: string; closedAt: Date }[]>`
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
        LIMIT 21 OFFSET ${(page - 1) * 20}
      `;
          },
          { isolationLevel: "RepeatableRead" },
        );
    return {
      district: officer.district,
      items: items.slice(0, 20),
      nextPage: items.length === 21 ? page + 1 : null,
    };
  });
}
