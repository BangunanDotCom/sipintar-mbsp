import { randomUUID } from "node:crypto";
import { dispatchMail, encrypt, type MailOutbox } from "../core.js";
import type { OraclePool } from "./pool.js";
import {
  affected,
  clob,
  oracleTable,
  queryRows,
  requireRecord,
} from "./query.js";

function assertLabSmtp() {
  if ((process.env.SMTP_HOST ?? "127.0.0.1") !== "127.0.0.1")
    throw Error("Emel makmal Oracle memerlukan SMTP loopback.");
}

export function createOracleNotificationRepository(pool: OraclePool) {
  const notification = oracleTable(pool, "STL_NOTIFICATIONS");
  const email = oracleTable(pool, "STL_EMAIL_DELIVERY_LOGS");
  const user = oracleTable(pool, "STL_USERS");

  const outbox: MailOutbox = {
    claim: (id) =>
      pool.transaction(async (connection) => {
        const claimed = await affected(
          connection,
          `UPDATE ${email} SET STATUS='SENDING', ATTEMPTS=ATTEMPTS+1
          WHERE ID=:id AND STATUS IN ('PENDING','FAILED') AND ATTEMPTS < 5
            AND LOWER(RECIPIENT) LIKE '%@example.test'`,
          { id },
        );
        if (!claimed) return null;
        const [row] = await queryRows<{
          recipient: string;
          encryptedPayload: string;
        }>(
          connection,
          `SELECT RECIPIENT AS "recipient", ENCRYPTED_PAYLOAD AS "encryptedPayload"
           FROM ${email} WHERE ID=:id`,
          { id },
        );
        return requireRecord(row);
      }),
    markSent: (id, encryptedPayload) =>
      pool.transaction(async (connection) => {
        await connection.execute(
          `UPDATE ${email} SET STATUS='SENT', SENT_AT=SYSTIMESTAMP, LAST_ERROR=NULL,
          ENCRYPTED_PAYLOAD=:payload WHERE ID=:id AND STATUS='SENDING'`,
          { id, payload: clob(encryptedPayload) },
        );
      }),
    markFailed: (id, lastError) =>
      pool.transaction(async (connection) => {
        await connection.execute(
          `UPDATE ${email} SET STATUS='FAILED', LAST_ERROR=:lastError
          WHERE ID=:id AND STATUS='SENDING'`,
          { id, lastError },
        );
      }),
  };

  return {
    async retryPending() {
      assertLabSmtp();
      const pending = await pool.use((connection) =>
        queryRows<{ ID: string }>(
          connection,
          `SELECT ID FROM ${email} WHERE STATUS IN ('PENDING','FAILED') AND ATTEMPTS < 5
          AND LOWER(RECIPIENT) LIKE '%@example.test' ORDER BY CREATED_AT,ID FETCH FIRST 100 ROWS ONLY`,
          {},
        ),
      );
      for (const { ID } of pending) await dispatchMail(ID, outbox);
      return pending.length;
    },
    async notify(
      userId: string,
      type: string,
      title: string,
      message: string,
      emailText?: string,
    ) {
      assertLabSmtp();
      const id = randomUUID();
      const payload = clob(
        encrypt(JSON.stringify({ subject: title, text: emailText || message })),
      );
      await pool.transaction(async (connection) => {
        const [recipient] = await queryRows<{ EMAIL: string }>(
          connection,
          `SELECT EMAIL FROM ${user} WHERE ID=:userId`,
          { userId },
        );
        await connection.execute(
          `INSERT INTO ${notification} (ID,USER_ID,TYPE,TITLE,MESSAGE)
          VALUES (:id,:userId,:type,:title,:message)`,
          { id: randomUUID(), userId, type, title, message: clob(message) },
        );
        await connection.execute(
          `INSERT INTO ${email} (ID,USER_ID,RECIPIENT,TYPE,ENCRYPTED_PAYLOAD)
          VALUES (:id,:userId,:recipient,:type,:payload)`,
          {
            id,
            userId,
            type,
            recipient: requireRecord(recipient).EMAIL,
            payload,
          },
        );
      });
      await dispatchMail(id, outbox);
    },
  };
}
