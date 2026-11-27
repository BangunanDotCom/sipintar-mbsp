import {
  acceptanceNotice,
  boundToken,
  invitationProofCurrent,
  matchesInvitationToken,
} from "../invitation-proof.js";
import { hash, token } from "../core.js";
import { oracleDelegationPrincipal } from "./delegation-principal.js";
import { oracleDelegationEvidence } from "./delegation-evidence.js";
import { randomUUID } from "node:crypto";
import type { Connection } from "oracledb";
import { fail } from "../auth.js";
import type {
  CompanyInvitationRepository,
  InvitationPreview,
  Representative,
} from "../company-invitation-repository.js";
import { createOracleAuditRepository } from "./audit.js";
import { fromOracleBoolean } from "./codecs.js";
import type { OraclePool } from "./pool.js";
import { affected, clob, oracleTable, queryRows, timestamp } from "./query.js";

type RepRow = Omit<Representative, "canManageRepresentatives"> & {
  canManageRepresentatives: number;
};
type InviteRow = Omit<InvitationPreview, "company"> & {
  companyName: string;
  registrationNumber: string;
  companyStatus: string;
};
type ListRow = Omit<
  Awaited<ReturnType<CompanyInvitationRepository["representatives"]>>[number],
  "user" | "canManageRepresentatives"
> & {
  userName: string;
  canManageRepresentatives: number;
};

export function createOracleCompanyInvitationRepository(
  pool: OraclePool,
): CompanyInvitationRepository {
  const delegationEvidence = oracleDelegationEvidence(pool);
  const companies = oracleTable(pool, "STL_COMPANIES");
  const reps = oracleTable(pool, "STL_COMPANY_REPRESENTATIVES");
  const invites = oracleTable(pool, "STL_COMPANY_REP_INVITATIONS");
  const documents = oracleTable(pool, "STL_DELEGATION_DOCUMENTS");
  const sessions = oracleTable(pool, "STL_SESSIONS");
  const users = oracleTable(pool, "STL_USERS");
  const assignments = oracleTable(pool, "STL_USER_ROLE_ASSIGNMENTS");
  const permissions = oracleTable(pool, "STL_PERMISSIONS");
  const audit = createOracleAuditRepository(pool);
  const notifications = oracleTable(pool, "STL_NOTIFICATIONS");
  const principalAtUse = oracleDelegationPrincipal(pool);
  const repColumns = `R.ID AS "id", R.USER_ID AS "userId", R.COMPANY_ID AS "companyId",
    R.AUTHORITY_TYPE AS "authorityType", R.STARTS_AT AS "startsAt", R.ENDS_AT AS "endsAt",
    R.STATUS AS "status", R.VERIFIED_BY AS "verifiedBy",
    R.VERIFIED_DOCUMENT_ID AS "verifiedDocumentId", R.VERIFICATION_REVISION AS "verificationRevision", R.CAN_MANAGE_REPRESENTATIVES AS "canManageRepresentatives"`;

  async function preview(connection: Connection, tokenHash: string) {
    const [row] = await queryRows<InviteRow>(
      connection,
      `SELECT I.ID AS "id", I.COMPANY_ID AS "companyId",
      I.RECIPIENT_ID AS "recipientId", I.INVITED_BY AS "invitedBy", I.AUTHORITY_TYPE AS "authorityType",
      I.AUTHORITY_ENDS_AT AS "authorityEndsAt", I.TOKEN_HASH AS "tokenHash", I.ACCEPTED_AT AS "acceptedAt",
      I.EXPIRES_AT AS "expiresAt", I.CREATED_AT AS "createdAt",
      C.NAME AS "companyName", C.REGISTRATION_NUMBER AS "registrationNumber", C.STATUS AS "companyStatus"
      FROM ${invites} I JOIN ${companies} C ON I.COMPANY_ID=C.ID WHERE I.TOKEN_HASH=:tokenHash`,
      { tokenHash },
    );
    if (!row) return null;
    const { companyName, registrationNumber, companyStatus, ...invitation } =
      row;
    return {
      ...invitation,
      company: { name: companyName, registrationNumber, status: companyStatus },
    };
  }

  // Take the company lock before the representative lock for all invitation writes.
  // Re-read the permission and status predicates after taking both row locks.
  async function lockAuthority(
    connection: Connection,
    companyId: string,
    userId: string,
  ) {
    const binds = { companyId, userId };
    const [company] = await queryRows<{ ID: string }>(
      connection,
      `SELECT ID FROM ${companies} WHERE ID=:companyId AND STATUS='ACTIVE' FOR UPDATE WAIT 5`,
      { companyId },
    );
    if (!company) return null;
    const [representative] = await queryRows<{ ID: string }>(
      connection,
      `SELECT ID FROM ${reps} WHERE COMPANY_ID=:companyId AND USER_ID=:userId FOR UPDATE WAIT 5`,
      binds,
    );
    if (!representative) return null;
    const [rep] = await queryRows<RepRow>(
      connection,
      `SELECT ${repColumns} FROM ${reps} R JOIN ${users} U ON U.ID=R.USER_ID
       WHERE R.COMPANY_ID=:companyId AND R.USER_ID=:userId AND R.STATUS<>'REVOKED'
         AND (R.CAN_MANAGE_REPRESENTATIVES=1 OR R.STATUS='VERIFIED') AND R.STARTS_AT<=SYSTIMESTAMP
         AND (R.ENDS_AT IS NULL OR R.ENDS_AT>SYSTIMESTAMP) AND U.STATUS='ACTIVE' AND U.EMAIL_VERIFIED=1
         AND EXISTS (SELECT 1 FROM ${assignments} A JOIN ${permissions} P ON P.ROLE_ID=A.ROLE_ID
           WHERE A.USER_ID=R.USER_ID AND A.STATUS='ACTIVE' AND A.STARTS_AT<=SYSTIMESTAMP
             AND (A.ENDS_AT IS NULL OR A.ENDS_AT>SYSTIMESTAMP) AND P.ACTION='companies')`,
      binds,
    );
    if (!rep) return null;
    if (rep.canManageRepresentatives === 1) return { rep, proof: null };
    try {
      const proof = await delegationEvidence.lockedVerified(connection, rep);
      return { rep, proof };
    } catch (error) {
      if (
        error instanceof Error &&
        "statusCode" in error &&
        error.statusCode === 409
      )
        return null;
      throw error;
    }
  }

  return {
    representative: (userId, companyId) =>
      pool.use(async (connection) => {
        const [row] = await queryRows<RepRow>(
          connection,
          `SELECT ${repColumns} FROM ${reps} R WHERE USER_ID=:userId AND COMPANY_ID=:companyId`,
          { userId, companyId },
        );
        return row
          ? {
              ...row,
              canManageRepresentatives: fromOracleBoolean(
                row.canManageRepresentatives,
              ),
            }
          : null;
      }),
    preview: (tokenHash) =>
      pool.use((connection) => preview(connection, tokenHash)),
    representatives: (companyId) =>
      pool.use(async (connection) => {
        const rows = await queryRows<ListRow>(
          connection,
          `SELECT R.ID AS "id", R.USER_ID AS "userId", R.AUTHORITY_TYPE AS "authorityType",
          R.STARTS_AT AS "startsAt", R.ENDS_AT AS "endsAt", R.STATUS AS "status",
          R.CAN_MANAGE_REPRESENTATIVES AS "canManageRepresentatives", U.NAME AS "userName"
          FROM ${reps} R JOIN ${users} U ON U.ID=R.USER_ID
          WHERE R.COMPANY_ID=:companyId ORDER BY R.STARTS_AT,R.ID`,
          { companyId },
        );
        return rows.map(({ userName, canManageRepresentatives, ...row }) => ({
          ...row,
          canManageRepresentatives: fromOracleBoolean(canManageRepresentatives),
          user: { name: userName },
        }));
      }),
    invite: (data, principal) =>
      pool.transaction(async (connection) => {
        await principalAtUse(connection, principal, false);
        const authority = await lockAuthority(
          connection,
          data.companyId,
          principal.userId,
        );
        if (!authority)
          fail(403, "Anda tidak mempunyai kuasa mengurus wakil syarikat ini.");
        const [recipient] = await queryRows(
          connection,
          `SELECT ID FROM ${users} WHERE ID=:id AND KIND='APPLICANT' AND EMAIL_VERIFIED=1 AND STATUS='ACTIVE'`,
          { id: data.recipientId },
        );
        if (!recipient)
          fail(
            400,
            "Penerima perlu mendaftar dan mengesahkan akaun pemohon dahulu.",
          );
        const [existing] = await queryRows(
          connection,
          `SELECT ID FROM ${reps} WHERE COMPANY_ID=:companyId AND USER_ID=:userId`,
          { companyId: data.companyId, userId: data.recipientId },
        );
        if (existing)
          fail(409, "Pengguna telah mempunyai rekod perwakilan syarikat ini.");
        const id = randomUUID();
        const raw = boundToken(
          token().slice(0, 32),
          authority.rep,
          data.recipientId,
          authority.proof,
        );
        await connection.execute(
          `INSERT INTO ${invites} (ID,COMPANY_ID,RECIPIENT_ID,INVITED_BY,AUTHORITY_TYPE,
          AUTHORITY_ENDS_AT,TOKEN_HASH,EXPIRES_AT)
          VALUES (:id,:companyId,:recipientId,:invitedBy,:authorityType,:authorityEndsAt,:tokenHash,:expiresAt)`,
          {
            ...data,
            id,
            invitedBy: principal.userId,
            tokenHash: hash(raw),
            authorityEndsAt: timestamp(data.authorityEndsAt),
            expiresAt: timestamp(data.expiresAt),
          },
        );
        await audit.append(connection, {
          actorId: principal.userId,
          activeRole: principal.activeRole,
          action: "COMPANY_REPRESENTATIVE_INVITED",
          target: id,
        });
        return { id, raw };
      }),
    accept: (raw, principal) =>
      pool.transaction(async (connection) => {
        const { userId, activeRole } = principal;
        const invitation = await preview(connection, hash(raw));
        const now = new Date();
        if (
          !invitation ||
          invitation.recipientId !== userId ||
          invitation.acceptedAt ||
          invitation.expiresAt <= now ||
          invitation.company.status !== "ACTIVE" ||
          (invitation.authorityEndsAt && invitation.authorityEndsAt <= now)
        )
          fail(400, "Jemputan tidak sah, luput atau bukan untuk akaun ini.");
        const accounts = { userId, invitedBy: invitation.invitedBy };
        await connection.execute(
          `SELECT ID FROM ${users} WHERE ID IN (:userId,:invitedBy) ORDER BY ID FOR UPDATE WAIT 5`,
          accounts,
        );
        await connection.execute(
          `SELECT ID FROM ${assignments} WHERE USER_ID IN (:userId,:invitedBy) ORDER BY USER_ID,ID FOR UPDATE WAIT 5`,
          accounts,
        );
        await principalAtUse(connection, principal, false);
        const authority = await lockAuthority(
          connection,
          invitation.companyId,
          invitation.invitedBy,
        );
        if (!authority) fail(403, "Kuasa pemberi jemputan tidak lagi aktif.");
        if (
          !matchesInvitationToken(raw, authority.rep, userId, authority.proof)
        )
          fail(
            403,
            "Bukti kuasa jemputan telah berubah. Minta jemputan baharu.",
          );
        const checkedAt = new Date();
        if (
          !invitationProofCurrent(authority.proof, checkedAt) ||
          (authority.rep.endsAt && authority.rep.endsAt <= checkedAt)
        )
          fail(403, "Kuasa pemberi jemputan tidak lagi aktif.");
        const claimed = await affected(
          connection,
          `UPDATE ${invites} SET ACCEPTED_AT=SYSTIMESTAMP
        WHERE ID=:id AND RECIPIENT_ID=:userId AND COMPANY_ID=:companyId AND INVITED_BY=:invitedBy AND ACCEPTED_AT IS NULL AND EXPIRES_AT>SYSTIMESTAMP
          AND (AUTHORITY_ENDS_AT IS NULL OR AUTHORITY_ENDS_AT>SYSTIMESTAMP)`,
          {
            id: invitation.id,
            userId,
            companyId: invitation.companyId,
            invitedBy: invitation.invitedBy,
          },
        );
        if (!claimed) fail(400, "Jemputan telah digunakan.");
        const id = randomUUID();
        try {
          await connection.execute(
            `INSERT INTO ${reps} (ID, USER_ID, COMPANY_ID, AUTHORITY_TYPE, ENDS_AT)
          VALUES (:id,:userId,:companyId,:authorityType,:endsAt)`,
            {
              id,
              userId,
              companyId: invitation.companyId,
              authorityType: invitation.authorityType,
              endsAt: timestamp(invitation.authorityEndsAt),
            },
          );
        } catch (error) {
          if (
            error instanceof Error &&
            "code" in error &&
            error.code === "ORA-00001" &&
            /\bSTL_UK_14_03\b/i.test(error.message)
          )
            fail(
              409,
              "Pengguna telah mempunyai rekod perwakilan syarikat ini.",
            );
          throw error;
        }
        await audit.append(connection, {
          actorId: userId,
          activeRole,
          action: "COMPANY_INVITATION_ACCEPTED",
          target: id,
        });
        await connection.execute(
          `INSERT INTO ${notifications} (ID,USER_ID,TYPE,TITLE,MESSAGE)
          VALUES (:notificationId,:userId,:type,:title,:message)`,
          {
            notificationId: randomUUID(),
            userId,
            ...acceptanceNotice,
            message: clob(acceptanceNotice.message),
          },
        );
        const finalAuthority = await lockAuthority(
          connection,
          invitation.companyId,
          invitation.invitedBy,
        );
        if (
          !finalAuthority ||
          !matchesInvitationToken(
            raw,
            finalAuthority.rep,
            userId,
            finalAuthority.proof,
          )
        )
          fail(403, "Kuasa pemberi jemputan tidak lagi aktif.");
        // Last database statement before commit. Locks protect mutable rows, while
        // the database clock independently bounds every expiring authorization.
        const [eligible] = await queryRows(
          connection,
          `WITH clock AS (SELECT SYSTIMESTAMP AS INSTANT FROM DUAL)
          SELECT 1 FROM ${invites} I
          JOIN ${reps} R ON R.ID=:repId AND R.USER_ID=I.INVITED_BY AND R.COMPANY_ID=I.COMPANY_ID
          JOIN ${companies} C ON C.ID=I.COMPANY_ID AND C.STATUS='ACTIVE'
          JOIN ${users} U ON U.ID=I.INVITED_BY AND U.STATUS='ACTIVE' AND U.EMAIL_VERIFIED=1
          JOIN ${users} V ON V.ID=I.RECIPIENT_ID AND V.KIND='APPLICANT'
            AND V.STATUS='ACTIVE' AND V.EMAIL_VERIFIED=1 AND V.IDENTIFICATION_HASH IS NOT NULL
          JOIN ${sessions} S ON S.ID=:sessionId AND S.USER_ID=V.ID
            AND S.CSRF_HASH=:csrfHash AND S.ACTIVE_ROLE=:activeRole
          CROSS JOIN clock T
          WHERE I.ID=:id AND I.TOKEN_HASH=:tokenHash AND I.RECIPIENT_ID=:userId AND I.ACCEPTED_AT IS NOT NULL
            AND I.EXPIRES_AT>T.INSTANT AND (I.AUTHORITY_ENDS_AT IS NULL OR I.AUTHORITY_ENDS_AT>T.INSTANT)
            AND S.EXPIRES_AT>T.INSTANT AND R.STATUS<>'REVOKED' AND R.STARTS_AT<=T.INSTANT
            AND (R.ENDS_AT IS NULL OR R.ENDS_AT>T.INSTANT)
            AND EXISTS (SELECT 1 FROM ${assignments} A JOIN ${permissions} P ON P.ROLE_ID=A.ROLE_ID
              WHERE A.USER_ID=U.ID AND P.ACTION='companies' AND A.STATUS='ACTIVE'
                AND A.STARTS_AT<=T.INSTANT AND (A.ENDS_AT IS NULL OR A.ENDS_AT>T.INSTANT))
            AND EXISTS (SELECT 1 FROM ${assignments} A JOIN ${permissions} P ON P.ROLE_ID=A.ROLE_ID
              WHERE A.USER_ID=V.ID AND A.ROLE_ID=S.ACTIVE_ROLE AND P.ACTION='companies' AND A.STATUS='ACTIVE'
                AND A.STARTS_AT<=T.INSTANT AND (A.ENDS_AT IS NULL OR A.ENDS_AT>T.INSTANT))
            AND ((:proofId IS NULL AND R.CAN_MANAGE_REPRESENTATIVES=1) OR
              (R.CAN_MANAGE_REPRESENTATIVES=0 AND R.STATUS='VERIFIED' AND EXISTS (
                SELECT 1 FROM ${documents} D WHERE D.ID=:proofId AND D.ID=R.VERIFIED_DOCUMENT_ID
                  AND D.COMPANY_ID=R.COMPANY_ID AND D.REPRESENTATIVE_ID=R.ID AND D.AUTHORITY_TYPE=R.AUTHORITY_TYPE
                  AND D.VERSION=:proofVersion AND D.SHA256=:proofHash AND D.SCAN_SHA256=D.SHA256
                  AND D.SCAN_STATUS='CLEAN' AND D.SCAN_VALID_UNTIL>T.INSTANT
                  AND D.SCAN_LEASE_TOKEN IS NULL AND D.SCAN_LEASE_EXPIRES_AT IS NULL
                  AND D.SUPERSEDED_AT IS NULL AND D.REVOKED_AT IS NULL AND D.VALID_FROM<=T.INSTANT
                  AND (D.VALID_UNTIL IS NULL OR D.VALID_UNTIL>T.INSTANT))))`,
          {
            repId: finalAuthority.rep.id,
            sessionId: principal.id,
            csrfHash: principal.csrfHash,
            activeRole,
            id: invitation.id,
            tokenHash: hash(raw),
            userId,
            proofId: finalAuthority.proof?.id ?? null,
            proofVersion: finalAuthority.proof?.version ?? null,
            proofHash: finalAuthority.proof?.sha256 ?? null,
          },
        );
        if (!eligible)
          fail(403, "Kuasa pemberi atau penerima jemputan tidak lagi aktif.");
        return { id };
      }),
  };
}
