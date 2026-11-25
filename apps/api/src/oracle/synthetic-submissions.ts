import { requireOracleUnclosedDraft } from "./completion-gate.js";
import { randomUUID } from "node:crypto";
import type { SyntheticSubmission } from "@prisma/client";
import type { Connection } from "oracledb";
import { fail } from "../auth.js";
import {
  captureInTransaction,
  type SyntheticPolicy,
  type SyntheticSubmissionTransaction,
} from "../synthetic-submissions.js";
import type { ObservedPortalSession } from "../synthetic-portal-session.js";
import { oracleJson } from "./codecs.js";
import { createOracleDraftRepository } from "./drafts.js";
import { oracleSyntheticSession } from "./synthetic-session.js";
import type { OraclePool } from "./pool.js";
import { oracleTable, queryRows, requireRecord } from "./query.js";

type SubmissionRow = Omit<SyntheticSubmission, "snapshot"> & {
  snapshot: string;
};

export function createOracleSyntheticSubmissions(pool: OraclePool) {
  const drafts = createOracleDraftRepository(pool);
  const submissions = oracleTable(pool, "STL_SYNTHETIC_SUBMISSIONS");
  const auditLogs = oracleTable(pool, "STL_AUDIT_LOGS");
  const documents = oracleTable(pool, "STL_APPLICATION_DOCUMENTS");
  const scopes = oracleTable(pool, "STL_DRAFT_DOCUMENT_SCOPES");
  const lockSession = oracleSyntheticSession(pool);
  const columns = `ID AS "id", DRAFT_ID AS "draftId", DRAFT_VERSION AS "draftVersion",
    KEY AS "key", ACTOR_ID AS "actorId", DECLARATION_VERSION AS "declarationVersion",
    POLICY_VERSION AS "policyVersion", PREVIOUS_ID AS "previousId", SNAPSHOT AS "snapshot",
    CREATED_AT AS "createdAt"`;
  type Evidence = Awaited<
    ReturnType<SyntheticSubmissionTransaction["evidence"]>
  >[number];
  type EvidenceRow = Omit<Evidence, "scope"> & {
    documentId: string | null;
    unitId: string | null;
    floorId: string | null;
  };

  function onConnection(
    connection: Connection,
  ): SyntheticSubmissionTransaction {
    const draftTx = drafts.onConnection(connection);
    async function readSubmission(
      where: string,
      binds: Record<string, string>,
      order = "",
    ) {
      const [row] = await queryRows<SubmissionRow>(
        connection,
        `SELECT ${columns} FROM ${submissions} WHERE ${where} ${order} FETCH FIRST 1 ROW ONLY`,
        binds,
      );
      return row ? { ...row, snapshot: JSON.parse(row.snapshot) } : null;
    }
    return {
      async lockApplicant(userId, operator) {
        if (
          !operator ||
          operator.userId !== userId ||
          (operator.activeRole !== "PEMOHON" &&
            operator.activeRole !== "WAKIL_SYARIKAT")
        )
          fail(403, "Peranan pemohon atau wakil diperlukan untuk latihan.");
        const { activeRole } = operator;
        await lockSession(connection, operator, activeRole);
        return activeRole;
      },
      async draft(userId, id) {
        const draft = await draftTx.findDraft(userId, id);
        if (!draft) fail(404, "Draf permohonan tidak ditemui.");
        return draft;
      },
      authority: draftTx.companyAuthority,
      // findDraft acquires and holds the parent write lock before reading the version.
      lockDraftVersion: async (draft) => draft.version,
      submissionByKey: (draftId, key) =>
        readSubmission("DRAFT_ID=:draftId AND KEY=:idempotencyKey", {
          draftId,
          idempotencyKey: key,
        }),
      latestSubmission: (draftId) =>
        readSubmission(
          "DRAFT_ID=:draftId",
          { draftId },
          "ORDER BY DRAFT_VERSION DESC",
        ),
      async correctionRequested(id) {
        const [row] = await queryRows(
          connection,
          `SELECT ID FROM ${auditLogs} WHERE TARGET=:id AND OUTCOME='SUCCESS'
            AND ACTION='SYNTHETIC_PORTAL_CORRECTION_REQUESTED' AND ROWNUM=1`,
          { id },
        );
        return !!row;
      },
      requireUnclosed: (draftId) =>
        requireOracleUnclosedDraft(pool, connection, draftId),
      async lockEvidence(draftId) {
        await connection.execute(
          `SELECT ID FROM ${documents} WHERE DRAFT_ID=:draftId FOR UPDATE`,
          { draftId },
        );
        await connection.execute(
          `SELECT DOCUMENT_ID FROM ${scopes} WHERE DRAFT_ID=:draftId FOR UPDATE`,
          { draftId },
        );
      },
      async inventory(draftId) {
        const premises = await draftTx.findPremises(draftId);
        const floors = await draftTx.floors(draftId);
        if (!premises) return { premises, floors };
        const units = await draftTx.units(premises.id);
        units.sort((left, right) =>
          left.id < right.id ? -1 : left.id === right.id ? 0 : 1,
        );
        return { premises: { ...premises, units }, floors };
      },
      async evidence(draftId) {
        const rows = await queryRows<EvidenceRow>(
          connection,
          `SELECT D.ID AS "id", D.CATEGORY AS "category", D.VERSION AS "version",
             D.SCAN_STATUS AS "scanStatus", D.VERIFICATION_STATUS AS "verificationStatus",
             S.DOCUMENT_ID AS "documentId", S.UNIT_ID AS "unitId", S.FLOOR_ID AS "floorId"
           FROM ${documents} D LEFT JOIN ${scopes} S ON S.DOCUMENT_ID=D.ID AND S.DRAFT_ID=D.DRAFT_ID
           WHERE D.DRAFT_ID=:draftId AND D.SUPERSEDED_AT IS NULL AND D.STORAGE_KEY LIKE 'issue31-fixture/%'
           ORDER BY D.ID`,
          { draftId },
        );
        return rows.map(({ documentId, unitId, floorId, ...row }) => ({
          ...row,
          scope: documentId ? { unitId, floorId } : null,
        }));
      },
      async createSubmission(data) {
        const id = randomUUID();
        await connection.execute(
          `INSERT INTO ${submissions} (ID,DRAFT_ID,DRAFT_VERSION,KEY,ACTOR_ID,DECLARATION_VERSION,POLICY_VERSION,PREVIOUS_ID,SNAPSHOT)
           VALUES (:id,:draftId,:draftVersion,:key,:actorId,:declarationVersion,:policyVersion,:previousId,:snapshot)`,
          { ...data, id, snapshot: oracleJson(data.snapshot) },
        );
        return requireRecord(await readSubmission("ID=:id", { id }));
      },
      audit: draftTx.audit,
    };
  }

  return {
    onConnection,
    capture(
      operator: ObservedPortalSession,
      payload: unknown,
      policy: SyntheticPolicy,
    ) {
      if (process.env.NODE_ENV !== "test")
        throw Error(
          "Serahan Oracle sintetik hanya tersedia dalam proses ujian.",
        );
      return pool.transaction((connection) =>
        captureInTransaction(
          onConnection(connection),
          operator.userId,
          payload,
          policy,
          operator,
          true,
        ),
      );
    },
  };
}
