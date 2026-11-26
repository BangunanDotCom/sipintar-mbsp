import { randomUUID } from "node:crypto";
import oracledb from "oracledb";
import { draftInactivityDays } from "../../../../packages/shared/src/draft-inactivity.js";
import { fail } from "../auth.js";
import { stateFor } from "../synthetic-completion-journal.js";
import {
  oracleTrainingRemindersEnabled,
  reminderCopy,
  type TrainingMailSender,
  type TrainingReminderRepository,
} from "../training-reminders.js";
import {
  technicalReminderContext,
  technicalReminderInventory,
} from "../training-technical-reminders.js";
import { createOracleAuditRepository } from "./audit.js";
import { oracleCompletionEnabled } from "./completion-gate.js";
import type { OraclePool } from "./pool.js";
import {
  affected,
  clob,
  oracleInList,
  oracleTable,
  queryRows,
  timestamp,
} from "./query.js";
import { createOracleCompletionRepository } from "./synthetic-completion.js";
import { createOracleSyntheticReviewRepository } from "./synthetic-review.js";

type StaleDraft = {
  id: string;
  version: number;
  initiatedByUserId: string;
  updatedAt: Date;
  email: string;
};
export type ReminderInput = {
  draftId: string;
  draftVersion: number;
  recipientId: string;
  source: "SUPERVISOR" | "SCHEDULE";
  dedupeKey: string;
  kind?: string;
  context?: object;
  availableAt?: Date;
};

export function insertOracleReminder(
  pool: OraclePool,
  connection: oracledb.Connection,
  data: ReminderInput,
) {
  const table = oracleTable(pool, "STL_TRAINING_REMINDER_OUTBOX");
  return connection
    .execute(
      `INSERT INTO ${table}
   (ID,DRAFT_ID,DRAFT_VERSION,RECIPIENT_ID,SOURCE,DEDUPE_KEY,KIND,CONTEXT,AVAILABLE_AT)
   VALUES (:id,:draftId,:draftVersion,:recipientId,:source,:dedupeKey,:kind,:context,COALESCE(:availableAt,SYSTIMESTAMP))`,
      {
        ...data,
        id: randomUUID(),
        kind: data.kind ?? "DRAFT_INACTIVE",
        availableAt: timestamp(data.availableAt ?? null),
        context: data.context
          ? clob(JSON.stringify(data.context))
          : { val: null, type: oracledb.CLOB },
      },
    )
    .then(() => true)
    .catch((error: unknown) => {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ORA-00001" &&
        /\bSTL_UK_TR_DEDUPE\b/i.test(error.message)
      )
        return false;
      throw error;
    });
}

export function createOracleTrainingReminders(pool: OraclePool) {
  const drafts = oracleTable(pool, "STL_APPLICATION_DRAFTS");
  const premises = oracleTable(pool, "STL_APPLICATION_PREMISES");
  const users = oracleTable(pool, "STL_USERS");
  const reps = oracleTable(pool, "STL_COMPANY_REPRESENTATIVES");
  const companies = oracleTable(pool, "STL_COMPANIES");
  const submissions = oracleTable(pool, "STL_SYNTHETIC_SUBMISSIONS");
  const auditTable = oracleTable(pool, "STL_AUDIT_LOGS");
  const notifications = oracleTable(pool, "STL_NOTIFICATIONS");
  const assignments = oracleTable(pool, "STL_USER_ROLE_ASSIGNMENTS");
  const permissions = oracleTable(pool, "STL_PERMISSIONS");
  const outbox = oracleTable(pool, "STL_TRAINING_REMINDER_OUTBOX");
  const review = createOracleSyntheticReviewRepository(pool);
  const journal = createOracleCompletionRepository(pool);
  const audit = createOracleAuditRepository(pool);
  const fields = `ID AS "id",DRAFT_ID AS "draftId",DRAFT_VERSION AS "draftVersion",RECIPIENT_ID AS "recipientId",
     KIND AS "kind",CONTEXT AS "context",ATTEMPTS AS "attempts",NOTIFIED_AT AS "notifiedAt"`;
  const scope = `D.STATUS='DRAFT' AND D.UPDATED_AT<=SYSTIMESTAMP-NUMTODSINTERVAL(${draftInactivityDays},'DAY')
    AND P.DISTRICT_ID IN ('SPU','SPT','SPS') AND U.KIND='APPLICANT' AND U.STATUS='ACTIVE'
    AND U.EMAIL_VERIFIED=1 AND LOWER(U.EMAIL) LIKE '%@example.test'
    AND NOT EXISTS (SELECT 1 FROM ${submissions} S WHERE S.DRAFT_ID=D.ID)
    AND (D.CAPACITY='INDIVIDUAL' OR (D.CAPACITY='COMPANY' AND EXISTS (
      SELECT 1 FROM ${reps} R JOIN ${companies} C ON C.ID=R.COMPANY_ID
      WHERE R.USER_ID=D.INITIATED_BY_USER_ID AND C.ID=D.COMPANY_ID AND C.STATUS='ACTIVE'
        AND R.STATUS<>'REVOKED' AND R.STARTS_AT<=SYSTIMESTAMP AND (R.ENDS_AT IS NULL OR R.ENDS_AT>SYSTIMESTAMP)
    )))`;
  const joined = `FROM ${drafts} D JOIN ${premises} P ON P.DRAFT_ID=D.ID JOIN ${users} U ON U.ID=D.INITIATED_BY_USER_ID`;
  function readEligible(
    connection: oracledb.Connection,
    filter: string,
    binds: oracledb.BindParameters,
    take: number,
  ) {
    return queryRows<StaleDraft>(
      connection,
      `SELECT D.ID AS "id",D.VERSION AS "version",D.UPDATED_AT AS "updatedAt",
      D.INITIATED_BY_USER_ID AS "initiatedByUserId",U.EMAIL AS "email"
      ${joined} WHERE ${scope} AND ${filter} ORDER BY D.UPDATED_AT,D.ID FETCH FIRST :take ROWS ONLY`,
      { ...binds, take },
    );
  }
  async function notify(
    connection: oracledb.Connection,
    userId: string,
    type: string,
    copy: { subject: string; text: string },
  ) {
    await connection.execute(
      `INSERT INTO ${notifications} (ID,USER_ID,TYPE,TITLE,MESSAGE)
      VALUES (:id,:userId,:type,:title,:message)`,
      {
        id: randomUUID(),
        userId,
        type,
        title: copy.subject,
        message: clob(copy.text),
      },
    );
  }
  async function enqueue(
    connection: oracledb.Connection,
    draft: StaleDraft,
    source: ReminderInput["source"],
    actorId?: string,
  ) {
    const queued = await insertOracleReminder(pool, connection, {
      draftId: draft.id,
      draftVersion: draft.version,
      recipientId: draft.initiatedByUserId,
      dedupeKey: `draft:${draft.id}:${draft.version}`,
      source,
    });
    if (!queued) return false;
    await notify(
      connection,
      draft.initiatedByUserId,
      "TRAINING_DRAFT_REMINDER",
      reminderCopy("DRAFT_INACTIVE"),
    );
    await audit.append(connection, {
      actorId,
      activeRole: actorId ? "PPSK" : null,
      target: draft.id,
      action: "SYNTHETIC_DRAFT_REMINDER_QUEUED",
      metadata: { version: draft.version, source },
    });
    return true;
  }
  const repository: TrainingReminderRepository = {
    list: (officer) =>
      pool.transaction(async (connection) => {
        await connection.execute(
          "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE",
        );
        await review.onConnection(connection).lockOfficer(officer);
        const rows = await readEligible(
          connection,
          "P.DISTRICT_ID=:district",
          { district: officer.district },
          50,
        );
        const ids = oracleInList(
          "DRAFT_ID",
          rows.map((row) => row.id),
          "IN",
          "draft_",
        );
        const reminders = await queryRows<{ draftId: string }>(
          connection,
          `SELECT DRAFT_ID AS "draftId",DRAFT_VERSION AS "draftVersion",
        SOURCE AS "source",STATUS AS "status",CREATED_AT AS "createdAt",ATTEMPTS AS "attempts" FROM ${outbox}
        WHERE KIND='DRAFT_INACTIVE' AND ${ids.sql} ORDER BY CREATED_AT DESC,ID FETCH FIRST 200 ROWS ONLY`,
          ids.binds,
        );
        return {
          district: officer.district,
          drafts: rows.map(({ id, version, updatedAt }) => ({
            id,
            version,
            updatedAt,
            reminders: reminders.filter((r) => r.draftId === id),
          })),
        };
      }),
    remind: (officer, id, version) =>
      pool.transaction(async (connection) => {
        await review.onConnection(connection).lockOfficer(officer);
        await connection.execute(
          `SELECT D.ID ${joined} WHERE D.ID=:id AND P.DISTRICT_ID=:district FOR UPDATE OF D.ID WAIT 5`,
          { id, district: officer.district },
        );
        const [draft] = await readEligible(
          connection,
          "D.ID=:id AND P.DISTRICT_ID=:district",
          { id, district: officer.district },
          1,
        );
        if (!draft) fail(404, "Draf latihan tidak tersedia.");
        if (draft.version !== version) fail(409, "Versi draf telah berubah.");
        return {
          queued: await enqueue(
            connection,
            draft,
            "SUPERVISOR",
            officer.operator.userId,
          ),
        };
      }),
    monitor: () =>
      pool.transaction(async (connection) => {
        const counts = await queryRows(
          connection,
          `SELECT STATUS AS "status",COUNT(*) AS "count" FROM ${outbox} GROUP BY STATUS ORDER BY STATUS`,
          {},
        );
        const recent = await queryRows(
          connection,
          `SELECT CREATED_AT AS "createdAt",OUTCOME AS "outcome" FROM ${auditTable}
        WHERE ACTION='SYNTHETIC_REMINDER_RUN' ORDER BY CREATED_AT DESC,ID FETCH FIRST 10 ROWS ONLY`,
          {},
        );
        return { recent, counts };
      }),
  };
  type Claimed = {
    id: string;
    draftId: string;
    draftVersion: number;
    recipientId: string;
    kind: string;
    context: string | null;
    attempts: number;
    notifiedAt: Date | null;
  };
  async function technicalRecipient(
    connection: oracledb.Connection,
    row: Claimed,
  ) {
    if (!oracleCompletionEnabled()) return null;
    const parsed = technicalReminderContext.safeParse(
      JSON.parse(row.context ?? "null"),
    );
    if (!parsed.success) return null;
    const { submissionId, referralVersion, district, role } = parsed.data;
    if (
      process.env.STAYLINK_SYNTHETIC_DISTRICT !== district ||
      (row.kind === "TECH_ESCALATE") !== (role === "PPSK")
    )
      return null;
    const config =
      process.env.STAYLINK_SYNTHETIC_COMPLETION_ASSIGNMENTS ?? "{}";
    let assigned: string | undefined;
    try {
      assigned =
        role === "PPSK"
          ? process.env.STAYLINK_SYNTHETIC_SUPERVISOR_ID
          : JSON.parse(config)[role];
    } catch {
      return null;
    }
    if (assigned !== row.recipientId) return null;
    await connection.execute(
      `SELECT ID FROM ${users} WHERE ID=:id FOR UPDATE WAIT 5`,
      { id: assigned },
    );
    await connection.execute(
      `SELECT ID FROM ${assignments} WHERE USER_ID=:id AND ROLE_ID=:role FOR UPDATE WAIT 5`,
      { id: assigned, role },
    );
    const [user] = await queryRows<{ EMAIL: string }>(
      connection,
      `SELECT U.EMAIL FROM ${users} U
      WHERE U.ID=:id AND U.KIND='OFFICER' AND U.STATUS='ACTIVE' AND U.EMAIL_VERIFIED=1 AND LOWER(U.EMAIL) LIKE '%@example.test'
      AND EXISTS (SELECT 1 FROM ${assignments} A JOIN ${permissions} P ON A.ROLE_ID=P.ROLE_ID
        WHERE A.USER_ID=U.ID AND A.ROLE_ID=:role AND A.DISTRICT_ID=:district AND A.STATUS='ACTIVE'
        AND P.ACTION=:permission AND A.STARTS_AT<=SYSTIMESTAMP AND (A.ENDS_AT IS NULL OR A.ENDS_AT>SYSTIMESTAMP))`,
      {
        id: assigned,
        role,
        district,
        permission: role === "PPSK" ? "areas.read" : "profile",
      },
    );
    if (!user) return null;
    const tx = review.onConnection(connection);
    await tx.lockSubmission(submissionId);
    const submission = await tx.activeSubmission(submissionId);
    if (
      !submission ||
      submission.actorId === assigned ||
      submission.draftId !== row.draftId ||
      submission.draftVersion !== row.draftVersion
    )
      return null;
    const inventory = technicalReminderInventory.safeParse(submission.snapshot);
    if (!inventory.success || inventory.data.districtId !== district)
      return null;
    try {
      await tx.requireSnapshotAuthority(submission);
      const scopes = inventory.data.units.flatMap((unit) =>
        unit.floorIds.map((floorId) => ({ unitId: unit.id, floorId })),
      );
      const state = await stateFor(
        { events: (id) => journal.events(connection, id) },
        submissionId,
        scopes,
      );
      const referral = state.referral;
      if (state.closed || referral?.version !== referralVersion) return null;
      if (
        row.kind === "TECH_PRE_DUE"
          ? Date.now() >= referral.deadline
          : Date.now() < referral.deadline
      )
        return null;
      const outstanding = referral.departments.filter(
        (dept) => !referral.comments[dept],
      );
      return (role === "PPSK" ? outstanding.length : outstanding.includes(role))
        ? user.EMAIL
        : null;
    } catch (err) {
      if (
        err instanceof Error &&
        "statusCode" in err &&
        [404, 409].includes(Number(err.statusCode))
      )
        return null;
      throw err;
    }
  }
  function ensureEnabled() {
    if (!oracleTrainingRemindersEnabled())
      throw Error("Gerbang peringatan Oracle makmal tertutup.");
  }
  return {
    repository,
    async schedule() {
      ensureEnabled();
      return pool.transaction(async (connection) => {
        const due = await readEligible(
          connection,
          `NOT EXISTS (SELECT 1 FROM ${outbox} O WHERE O.DRAFT_ID=D.ID AND
          O.DRAFT_VERSION=D.VERSION AND O.KIND='DRAFT_INACTIVE')`,
          {},
          25,
        );
        let queued = 0;
        for (const { id } of due) {
          const [locked] = await queryRows(
            connection,
            `SELECT ID FROM ${drafts} WHERE ID=:id FOR UPDATE SKIP LOCKED`,
            { id },
          );
          if (!locked) continue;
          const [fresh] = await readEligible(connection, "D.ID=:id", { id }, 1);
          if (fresh && (await enqueue(connection, fresh, "SCHEDULE"))) queued++;
        }
        return queued;
      });
    },
    async deliver(send: TrainingMailSender) {
      ensureEnabled();
      const ready = await pool.transaction(async (connection) => {
        await connection.execute(`UPDATE ${outbox} SET STATUS='UNCERTAIN',LEASE_UNTIL=NULL,LAST_ERROR='LEASE_EXPIRED'
          WHERE STATUS='SENDING' AND LEASE_UNTIL<=SYSTIMESTAMP`);
        return queryRows<{ ID: string }>(
          connection,
          `SELECT ID FROM ${outbox} WHERE STATUS IN ('PENDING','FAILED') AND ATTEMPTS<5
          AND AVAILABLE_AT<=SYSTIMESTAMP ORDER BY AVAILABLE_AT,ID FETCH FIRST 25 ROWS ONLY`,
          {},
        );
      });
      for (const { ID: id } of ready) {
        const leaseUntil = timestamp(new Date(Date.now() + 60_000));
        const row = await pool.transaction(async (connection) => {
          if (
            !(await affected(
              connection,
              `UPDATE ${outbox} SET STATUS='SENDING',LEASE_UNTIL=:leaseUntil,ATTEMPTS=ATTEMPTS+1
              WHERE ID=:id AND STATUS IN ('PENDING','FAILED') AND ATTEMPTS<5 AND AVAILABLE_AT<=SYSTIMESTAMP`,
              { id, leaseUntil },
            ))
          )
            return null;
          const [entry] = await queryRows<Claimed>(
            connection,
            `SELECT ${fields} FROM ${outbox} WHERE ID=:id`,
            { id },
          );
          const [draft] =
            entry.kind === "DRAFT_INACTIVE"
              ? await readEligible(
                  connection,
                  "D.ID=:draftId AND D.VERSION=:version",
                  { draftId: entry.draftId, version: entry.draftVersion },
                  1,
                )
              : [];
          const email =
            entry.kind === "DRAFT_INACTIVE"
              ? draft?.initiatedByUserId === entry.recipientId
                ? draft.email
                : null
              : await technicalRecipient(connection, entry);
          if (!email?.toLowerCase().endsWith("@example.test")) {
            await connection.execute(
              `UPDATE ${outbox} SET STATUS='CANCELLED',LEASE_UNTIL=NULL,LAST_ERROR='SCOPE_CHANGED' WHERE ID=:id`,
              { id },
            );
            return null;
          }
          const copy = reminderCopy(entry.kind);
          if (entry.kind !== "DRAFT_INACTIVE" && !entry.notifiedAt) {
            await notify(
              connection,
              entry.recipientId,
              "TRAINING_TECHNICAL_REMINDER",
              copy,
            );
            await connection.execute(
              `UPDATE ${outbox} SET NOTIFIED_AT=SYSTIMESTAMP WHERE ID=:id`,
              { id },
            );
          }
          return { ...entry, email, copy };
        });
        if (!row) continue;
        let status = "SENT",
          lastError: string | null = null;
        try {
          await send({
            to: row.email,
            ...row.copy,
            messageId: `<staylink-training-${id}@example.test>`,
          });
        } catch (err) {
          const retryable =
            err &&
            typeof err === "object" &&
            (("code" in err && err.code === "ECONNREFUSED") ||
              ("responseCode" in err &&
                typeof err.responseCode === "number" &&
                err.responseCode >= 400 &&
                err.responseCode < 500));
          status = retryable ? "FAILED" : "UNCERTAIN";
          lastError = retryable ? "SMTP_TEMPORARY" : "SMTP_UNCERTAIN";
        }
        await pool.transaction(async (connection) => {
          await connection.execute(
            `UPDATE ${outbox} SET STATUS=:status,LEASE_UNTIL=NULL,LAST_ERROR=:lastError,
            SENT_AT=CASE WHEN :status='SENT' THEN SYSTIMESTAMP ELSE SENT_AT END,
            AVAILABLE_AT=CASE WHEN :status='SENT' THEN AVAILABLE_AT ELSE :nextTime END
            WHERE ID=:id AND STATUS='SENDING' AND LEASE_UNTIL=:leaseUntil`,
            {
              id,
              leaseUntil,
              status,
              lastError,
              nextTime: timestamp(
                new Date(Date.now() + 60_000 * 2 ** (row.attempts - 1)),
              ),
            },
          );
        });
      }
    },
    logRun: (outcome: string, metadata: Record<string, unknown>) =>
      audit.record({ action: "SYNTHETIC_REMINDER_RUN", outcome, metadata }),
  };
}
