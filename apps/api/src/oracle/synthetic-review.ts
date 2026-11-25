import { randomUUID } from "node:crypto";
import type { Prisma, SyntheticSubmission } from "@prisma/client";
import type { Connection } from "oracledb";
import { fail } from "../auth.js";
import {
  completeAction,
  correctionAction,
  registerAction,
  reviewActions,
  readCursor,
  reviewPageSize,
  type CurrentEvidence,
  type ReviewEvent,
  type ReviewOfficer,
  type SyntheticReviewRepository,
  type SyntheticReviewTransaction,
} from "../synthetic-portal-review.js";
import { assertSnapshotAuthority } from "../synthetic-submissions.js";
import { createOracleDraftRepository } from "./drafts.js";
import type { OraclePool } from "./pool.js";
import { clob, oracleInList, oracleTable, queryRows } from "./query.js";
import { oracleSyntheticSession } from "./synthetic-session.js";
import { createOracleSyntheticSubmissions } from "./synthetic-submissions.js";

type SubmissionRow = Omit<SyntheticSubmission, "snapshot"> & {
  snapshot: string;
};
type EventRow = Omit<ReviewEvent, "metadata"> & { metadata: string | null };
type EvidenceRow = Omit<CurrentEvidence, "scope"> & {
  documentId: string | null;
  unitId: string | null;
  floorId: string | null;
};
const decode = ({ snapshot, ...row }: SubmissionRow): SyntheticSubmission => ({
  ...row,
  snapshot: JSON.parse(snapshot),
});
const json = (value: string | null): Prisma.JsonValue =>
  value === null ? null : JSON.parse(value);

export function createOracleSyntheticReviewRepository(
  pool: OraclePool,
): SyntheticReviewRepository & {
  onConnection(connection: Connection): SyntheticReviewTransaction;
} {
  const draftRepository = createOracleDraftRepository(pool);
  const submissionRepository = createOracleSyntheticSubmissions(pool);
  const lockSession = oracleSyntheticSession(pool);
  const submissions = oracleTable(pool, "STL_SYNTHETIC_SUBMISSIONS");
  const audit = oracleTable(pool, "STL_AUDIT_LOGS");
  const documents = oracleTable(pool, "STL_APPLICATION_DOCUMENTS");
  const scopes = oracleTable(pool, "STL_DRAFT_DOCUMENT_SCOPES");
  const representatives = oracleTable(pool, "STL_COMPANY_REPRESENTATIVES");
  const companies = oracleTable(pool, "STL_COMPANIES");
  const notifications = oracleTable(pool, "STL_NOTIFICATIONS");
  const fields = `S.ID AS "id", S.DRAFT_ID AS "draftId", S.DRAFT_VERSION AS "draftVersion",
    S.KEY AS "key", S.ACTOR_ID AS "actorId", S.DECLARATION_VERSION AS "declarationVersion",
    S.POLICY_VERSION AS "policyVersion", S.PREVIOUS_ID AS "previousId", S.SNAPSHOT AS "snapshot",
    S.CREATED_AT AS "createdAt"`;
  const live = `NOT EXISTS (SELECT 1 FROM ${submissions} N WHERE N.DRAFT_ID=S.DRAFT_ID AND N.PREVIOUS_ID=S.ID)`;
  const snapshotDistrict = "JSON_VALUE(S.SNAPSHOT,'$.districtId')";
  const inDistrict = `${snapshotDistrict}=:district AND S.ACTOR_ID<>:officerId`;
  const officerBinds = (officer: ReviewOfficer) => ({
    district: officer.district,
    officerId: officer.operator.userId,
  });

  function onConnection(connection: Connection): SyntheticReviewTransaction {
    const draftTx = draftRepository.onConnection(connection);
    const submissionTx = submissionRepository.onConnection(connection);
    const events = async (ids: string[], actions: readonly string[]) => {
      const targets = oracleInList("TARGET", ids, "IN", "target_");
      const kinds = oracleInList("ACTION", actions, "IN", "action_");
      return (
        await queryRows<EventRow>(
          connection,
          `SELECT TARGET AS "target", ACTION AS "action", ACTOR_ID AS "actorId", METADATA AS "metadata"
         FROM ${audit} WHERE OUTCOME='SUCCESS' AND ${targets.sql} AND ${kinds.sql}`,
          { ...targets.binds, ...kinds.binds },
        )
      ).map((row) => ({ ...row, metadata: json(row.metadata) }));
    };
    const first = async (where: string, binds: Record<string, string>) => {
      const [row] = await queryRows<SubmissionRow>(
        connection,
        `SELECT ${fields} FROM ${submissions} S WHERE ${where} FETCH FIRST 1 ROW ONLY`,
        binds,
      );
      return row ? decode(row) : null;
    };
    return {
      lockOfficer: (officer) =>
        lockSession(
          connection,
          officer.operator,
          officer.role,
          officer.district,
        ),
      lockEvidence: submissionTx.lockEvidence,
      async evidenceRows(ids) {
        const output: CurrentEvidence[] = [];
        for (let index = 0; index < ids.length; index += 500) {
          const match = oracleInList(
            "D.ID",
            ids.slice(index, index + 500),
            "IN",
          );
          const rows = await queryRows<EvidenceRow>(
            connection,
            `SELECT D.ID AS "id", D.DRAFT_ID AS "draftId", D.CATEGORY AS "category",
               D.VERSION AS "version", D.VERIFICATION_STATUS AS "verificationStatus",
               T.DOCUMENT_ID AS "documentId", T.UNIT_ID AS "unitId", T.FLOOR_ID AS "floorId"
             FROM ${documents} D LEFT JOIN ${scopes} T ON T.DOCUMENT_ID=D.ID AND T.DRAFT_ID=D.DRAFT_ID
             WHERE ${match.sql} AND D.SUPERSEDED_AT IS NULL AND D.SCAN_STATUS='CLEAN'
               AND D.STORAGE_KEY LIKE 'issue31-fixture/%' AND D.VERIFICATION_STATUS IN ('VERIFIED','UNVERIFIED')`,
            match.binds,
          );
          output.push(
            ...rows.map(({ documentId, unitId, floorId, ...row }) => ({
              ...row,
              scope: documentId ? { unitId, floorId } : null,
            })),
          );
        }
        return output;
      },
      reviewEvents: (ids) => events(ids, reviewActions),
      async reviewPage(officer, input) {
        const cursor = readCursor(input.cursor);
        const cursorTime =
          cursor &&
          cursor[0].replace(
            /(?:\.(\d+))?Z$/,
            (_match, fraction) =>
              `.${String(fraction ?? "")
                .padEnd(6, "0")
                .slice(0, 6)} +00:00`,
          );
        const time = `TO_TIMESTAMP_TZ(:cursorTime,'YYYY-MM-DD"T"HH24:MI:SS.FF6 TZH:TZM')`;
        const range = cursor
          ? `AND (S.CREATED_AT<${time} OR (S.CREATED_AT=${time} AND S.ID<:cursorId))`
          : "";
        const event = (actions: string[]) =>
          `EXISTS (SELECT 1 FROM ${audit} A WHERE A.TARGET=S.ID AND A.OUTCOME='SUCCESS' AND A.ACTION IN (${actions.map((action) => `'${action}'`).join(",")}))`;
        const submitted = `AND NOT ${event(reviewActions)}`;
        const awaitingRegistration = `AND ${event([completeAction])} AND NOT ${event([registerAction, correctionAction])}`;
        const filter = {
          all: "",
          action:
            officer.role === "PIC_KAWASAN" ? submitted : awaitingRegistration,
          submitted,
          correction: `AND ${event([correctionAction])}`,
          complete: awaitingRegistration,
          registered: `AND ${event([registerAction])}`,
        }[input.view];
        const search = input.search?.toLowerCase();
        const byReference = search?.startsWith("synthetic-");
        const matches = !search
          ? ""
          : byReference
            ? `AND S.DRAFT_ID LIKE :search AND ${event([registerAction])}`
            : "AND S.ID LIKE :search";
        const rows = await queryRows<SubmissionRow & { cursorTime: string }>(
          connection,
          `SELECT ${fields}, TO_CHAR(SYS_EXTRACT_UTC(S.CREATED_AT),'YYYY-MM-DD"T"HH24:MI:SS.FF6"Z"') AS "cursorTime"
           FROM ${submissions} S WHERE ${inDistrict} AND ${live} AND (
             (JSON_VALUE(S.SNAPSHOT,'$.capacity')='INDIVIDUAL' AND JSON_EXISTS(S.SNAPSHOT,'$.companyId?(@ == null)'))
             OR (JSON_VALUE(S.SNAPSHOT,'$.capacity')='COMPANY' AND EXISTS (
               SELECT 1 FROM ${representatives} R JOIN ${companies} C ON C.ID=R.COMPANY_ID
               WHERE R.USER_ID=S.ACTOR_ID AND R.COMPANY_ID=JSON_VALUE(S.SNAPSHOT,'$.companyId')
                 AND C.STATUS='ACTIVE' AND R.STATUS='VERIFIED'
                 AND R.STARTS_AT<=SYSTIMESTAMP AND (R.ENDS_AT IS NULL OR R.ENDS_AT>SYSTIMESTAMP)
             ))) ${range} ${filter} ${matches}
           ORDER BY S.CREATED_AT DESC,S.ID DESC FETCH FIRST ${reviewPageSize + 1} ROWS ONLY`,
          {
            ...officerBinds(officer),
            ...(cursor && { cursorTime, cursorId: cursor[1] }),
            ...(search && { search: search.replace(/^synthetic-/, "") + "%" }),
          },
        );
        return rows.map((row) => ({
          ...decode(row),
          cursorTime: row.cursorTime,
        }));
      },
      requireSnapshotAuthority: (row) =>
        assertSnapshotAuthority(row, draftTx.companyAuthority),
      async lockSubmission(id, officer) {
        await connection.execute(
          `SELECT S.ID FROM ${submissions} S WHERE S.ID=:id ${officer ? "AND " + inDistrict : ""} FOR UPDATE`,
          { id, ...(officer && officerBinds(officer)) },
        );
      },
      activeSubmission: (id, officer) =>
        first(`S.ID=:id AND ${live} ${officer ? "AND " + inDistrict : ""}`, {
          id,
          ...(officer && officerBinds(officer)),
        }),
      previousSubmission: (id, draftId, officer) =>
        first(`S.ID=:id AND S.DRAFT_ID=:draftId AND ${inDistrict}`, {
          id,
          draftId,
          ...officerBinds(officer),
        }),
      async applicantSubmission(draftId, userId) {
        const draft = await draftTx.findDraft(userId, draftId);
        if (!draft) fail(404, "Draf permohonan tidak ditemui.");
        if (draft.companyId)
          await draftTx.companyAuthority(userId, draft.companyId);
        return first(`S.DRAFT_ID=:draftId AND ${live}`, { draftId });
      },
      ledgerEvents: (id, actions) => events([id], actions),
      audit: draftTx.audit,
      async notify(entry) {
        await connection.execute(
          `INSERT INTO ${notifications} (ID,USER_ID,TITLE,TYPE,MESSAGE) VALUES (:id,:userId,:title,:type,:message)`,
          { ...entry, id: randomUUID(), message: clob(entry.message) },
        );
      },
    };
  }

  return {
    onConnection,
    async transaction(operation, consistentRead) {
      try {
        return await pool.transaction(async (connection) => {
          if (consistentRead)
            await connection.execute(
              "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE",
            );
          return operation(onConnection(connection));
        });
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          (error.code === "ORA-08177" || error.code === "ORA-00060")
        )
          fail(
            409,
            "Versi atau transaksi telah berubah. Muat semula sebelum mencuba.",
          );
        throw error;
      }
    },
  };
}
