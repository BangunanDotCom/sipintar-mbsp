import { randomUUID } from "node:crypto";
import { z } from "zod";
import { encrypt, hash, origin, token } from "../../apps/api/src/core.js";
import { createOracleAuditRepository } from "../../apps/api/src/oracle/audit.js";
import { oracleConfig } from "../../apps/api/src/oracle/config.js";
import { createOraclePool } from "../../apps/api/src/oracle/pool.js";
import { clob, queryRows } from "../../apps/api/src/oracle/query.js";
import { migrateOracle } from "./migrations.js";

const email = z
  .email()
  .transform((value) => value.toLowerCase())
  .parse(process.env.BOOTSTRAP_EMAIL);
const name = z
  .string()
  .trim()
  .min(3)
  .max(120)
  .parse(process.env.BOOTSTRAP_NAME);
const phone = z
  .string()
  .regex(/^\+?[0-9 -]{8,20}$/)
  .parse(process.env.BOOTSTRAP_PHONE ?? "0000000000");
const appOrigin = new URL(origin);
if (
  process.env.NODE_ENV !== "test" ||
  !email.endsWith("@example.test") ||
  appOrigin.protocol !== "http:" ||
  !["localhost", "127.0.0.1"].includes(appOrigin.hostname) ||
  appOrigin.origin !== origin
)
  throw Error(
    "Bootstrap Oracle memerlukan akaun dan origin loopback sintetik.",
  );

const config = oracleConfig(process.env, "install");
const pool = await createOraclePool(config);
const audit = createOracleAuditRepository(pool);
try {
  if (
    (await pool.use((connection) => migrateOracle(connection, false))) !==
    "APPLIED"
  )
    throw Error("Jalankan migrasi Oracle makmal dahulu.");
  const id = randomUUID();
  const raw = token();
  const title = "Pengaktifan pentadbir Oracle makmal";
  const text = `${origin}/aktifkan?type=OFFICER_INVITE&token=${raw}`;
  const encrypted = clob(encrypt(JSON.stringify({ subject: title, text })));
  await pool.transaction(async (connection) => {
    const [role] = await queryRows(
      connection,
      "SELECT ID FROM STL_ROLES WHERE ID='PENTADBIR_ICT' FOR UPDATE",
      {},
    );
    if (!role) throw Error("Jalankan seed Oracle makmal dahulu.");
    const [existing] = await queryRows(
      connection,
      "SELECT ID FROM STL_USER_ROLE_ASSIGNMENTS WHERE ROLE_ID='PENTADBIR_ICT' AND ROWNUM=1",
      {},
    );
    if (existing)
      throw Error(
        "Pentadbir telah wujud. Gunakan proses jemputan melalui portal.",
      );
    await connection.execute(
      `INSERT INTO STL_USERS (ID,NAME,EMAIL,PHONE,KIND,UPDATED_AT)
       VALUES (:id,:name,:email,:phone,'OFFICER',SYSTIMESTAMP)`,
      { id, name, email, phone },
    );
    await connection.execute(
      `INSERT INTO STL_USER_ROLE_ASSIGNMENTS (ID,USER_ID,ROLE_ID,DEPARTMENT_ID,REFERENCE)
       VALUES (:id,:userId,'PENTADBIR_ICT','ICT','Bootstrap Oracle makmal')`,
      { id: randomUUID(), userId: id },
    );
    await connection.execute(
      `INSERT INTO STL_AUTHENTICATION_IDENTITIES (ID,USER_ID,PROVIDER,TOKEN_HASH,EXPIRES_AT)
       VALUES (:id,:userId,'OFFICER_INVITE',:tokenHash,SYSTIMESTAMP + INTERVAL '1' HOUR)`,
      { id: randomUUID(), userId: id, tokenHash: hash(raw) },
    );
    await connection.execute(
      `INSERT INTO STL_NOTIFICATIONS (ID,USER_ID,TYPE,TITLE,MESSAGE)
       VALUES (:id,:userId,'INVITATION',:title,:message)`,
      {
        id: randomUUID(),
        userId: id,
        title,
        message: clob("Tetapkan kata laluan dan MFA melalui pautan e-mel."),
      },
    );
    await connection.execute(
      `INSERT INTO STL_EMAIL_DELIVERY_LOGS (ID,USER_ID,RECIPIENT,TYPE,ENCRYPTED_PAYLOAD)
       VALUES (:id,:userId,:email,'INVITATION',:encrypted)`,
      { id: randomUUID(), userId: id, email, encrypted },
    );
    await audit.append(connection, {
      actorId: id,
      action: "ADMIN_BOOTSTRAP",
      target: id,
    });
  });
  console.log("Jemputan pentadbir makmal disimpan dalam outbox e-mel.");
} finally {
  await pool.close();
}
