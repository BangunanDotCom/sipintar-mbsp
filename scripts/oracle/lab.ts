import { createHash } from "node:crypto";
import { oracleConfig } from "../../apps/api/src/oracle/config.js";
import { createOraclePool } from "../../apps/api/src/oracle/pool.js";
import { newOracleId } from "../../apps/api/src/oracle/codecs.js";
import { departments, districts } from "../../prisma/reference-data.js";
import {
  permissions,
  roles,
  templateCategories,
} from "../../packages/shared/src/index.js";
import { migrateOracle } from "./migrations.js";

export const labActorId = "00000000-0000-4000-8000-000000000062";
export const labSessionHash = createHash("sha256")
  .update("STL_LAB_SESSION_62")
  .digest("hex");

export async function prepareOracleLab(env: NodeJS.ProcessEnv) {
  const config = oracleConfig(env, "install");
  const runtime = oracleConfig(
    { ...env, ORACLE_USER: env.ORACLE_LAB_RUNTIME_USER },
    "runtime",
  );
  const pool = await createOraclePool(config);
  try {
    await pool.use(async (connection) => {
      if ((await migrateOracle(connection, false)) !== "APPLIED")
        throw Error("Skema makmal Oracle belum disediakan.");
      // GRANT commits implicitly. It is deliberately separate from seed DML.
      for (const object of [
        "STL_SESSIONS",
        "STL_USERS",
        "STL_USER_ROLE_ASSIGNMENTS",
        "STL_PERMISSIONS",
      ])
        await connection.execute(
          `GRANT SELECT ON ${object} TO ${runtime.user}`,
        );
      await connection.execute(
        `GRANT INSERT ON STL_AUDIT_LOGS TO ${runtime.user}`,
      );
      if (env.ORACLE_LAB_ENABLE_AUTH === "true") {
        const grants = [
          [
            "STL_USERS",
            "SELECT, INSERT, UPDATE (EMAIL_VERIFIED, PASSWORD_HASH, UPDATED_AT)",
          ],
          ["STL_ROLES", "SELECT"],
          ["STL_USER_ROLE_ASSIGNMENTS", "INSERT"],
          [
            "STL_SESSIONS",
            "INSERT, UPDATE (ACTIVE_ROLE, CSRF_HASH, MFA_VERIFIED), DELETE",
          ],
          [
            "STL_AUTHENTICATION_IDENTITIES",
            "SELECT, INSERT, UPDATE (CONSUMED_AT)",
          ],
          [
            "STL_MFA_FACTORS",
            "SELECT, INSERT, UPDATE (ENCRYPTED_SECRET, VERIFIED, LAST_STEP)",
          ],
          ["STL_RECOVERY_CODES", "SELECT, INSERT, UPDATE (USED_AT), DELETE"],
          ["STL_NOTIFICATIONS", "INSERT"],
          [
            "STL_EMAIL_DELIVERY_LOGS",
            "SELECT, INSERT, UPDATE (STATUS, ATTEMPTS, SENT_AT, LAST_ERROR, ENCRYPTED_PAYLOAD)",
          ],
        ];
        for (const [table, privileges] of grants)
          await connection.execute(
            `GRANT ${privileges} ON ${table} TO ${runtime.user}`,
          );
      }
      if (env.ORACLE_LAB_ENABLE_COMPANY_INVITATIONS === "true") {
        const grants = [
          ["STL_COMPANIES", "SELECT"],
          ["STL_COMPANY_REPRESENTATIVES", "SELECT, INSERT"],
          [
            "STL_COMPANY_REP_INVITATIONS",
            "SELECT, INSERT, UPDATE (ACCEPTED_AT)",
          ],
        ];
        for (const [table, privileges] of grants)
          await connection.execute(
            `GRANT ${privileges} ON ${table} TO ${runtime.user}`,
          );
      }
      if (env.ORACLE_LAB_ENABLE_ADMIN === "true") {
        const grants = [
          ["STL_USERS", "UPDATE (STATUS, UPDATED_AT)"],
          ["STL_MFA_FACTORS", "DELETE"],
          ["STL_USER_ROLE_ASSIGNMENTS", "UPDATE (STATUS, ENDS_AT)"],
          ["STL_DEPARTMENTS", "SELECT"],
          ["STL_DISTRICTS", "SELECT"],
          ["STL_AREAS", "SELECT, INSERT"],
          ["STL_AREA_ASSIGNMENTS", "SELECT, INSERT, UPDATE (ENDS_AT)"],
          ["STL_TEMPLATE_DEFINITIONS", "SELECT, INSERT"],
          [
            "STL_TEMPLATE_VERSIONS",
            "SELECT, INSERT, UPDATE (STATUS, ACTIVATED_BY)",
          ],
        ];
        for (const [table, privileges] of grants)
          await connection.execute(
            `GRANT ${privileges} ON ${table} TO ${runtime.user}`,
          );
      }
      if (env.ORACLE_LAB_ENABLE_DASHBOARD === "true") {
        for (const table of [
          "STL_NOTIFICATIONS",
          "STL_AREAS",
          "STL_AREA_ASSIGNMENTS",
          "STL_DISTRICTS",
        ])
          await connection.execute(
            `GRANT SELECT ON ${table} TO ${runtime.user}`,
          );
      }
      if (env.ORACLE_LAB_ENABLE_APPLICANTS === "true") {
        const grants = [
          [
            "STL_USERS",
            "UPDATE (NAME, PHONE, IDENTIFICATION_HASH, IDENTIFICATION_ENCRYPTED, IDENTIFICATION_MASKED, UPDATED_AT)",
          ],
          ["STL_DISTRICTS", "SELECT"],
          [
            "STL_COMPANIES",
            "SELECT, INSERT, UPDATE (NAME, ADDRESS, PHONE, EMAIL, INFORMATION_STATUS)",
          ],
          [
            "STL_COMPANY_REPRESENTATIVES",
            "SELECT, INSERT, UPDATE (STATUS, VERIFIED_BY)",
          ],
          ["STL_DELEGATION_DOCUMENTS", "SELECT, INSERT, UPDATE (STATUS)"],
          ["STL_SYSTEM_CONFIGURATIONS", "SELECT"],
        ];
        for (const [table, privileges] of grants)
          await connection.execute(
            `GRANT ${privileges} ON ${table} TO ${runtime.user}`,
          );
      }
      if (env.ORACLE_LAB_ENABLE_DRAFTS === "true") {
        const grants = [
          ["STL_COMPANIES", "SELECT"],
          ["STL_COMPANY_REPRESENTATIVES", "SELECT"],
          ["STL_APPLICATION_DRAFTS", "SELECT, INSERT, UPDATE"],
          ["STL_APPLICATION_PREMISES", "SELECT, INSERT, UPDATE"],
          ["STL_PREMISE_FLOORS", "SELECT, INSERT, UPDATE, DELETE"],
          ["STL_PREMISE_UNITS", "SELECT, INSERT, UPDATE, DELETE"],
          ["STL_PREMISE_UNIT_FLOORS", "SELECT, INSERT, DELETE"],
          ["STL_APPLICATION_DOCUMENTS", "SELECT"],
          ["STL_DRAFT_DOCUMENT_SCOPES", "SELECT"],
        ];
        for (const [table, privileges] of grants)
          await connection.execute(
            `GRANT ${privileges} ON ${table} TO ${runtime.user}`,
          );
      }
      if (env.ORACLE_LAB_ENABLE_COMPLETION === "true")
        await connection.execute(
          `GRANT SELECT ON STL_SCHEMA_MIGRATIONS TO ${runtime.user}`,
        );
      if (env.ORACLE_LAB_ENABLE_SUBMISSIONS === "true") {
        const grants = [
          ["STL_SYNTHETIC_SUBMISSIONS", "SELECT, INSERT"],
          ["STL_AUDIT_LOGS", "SELECT"],
          [
            "STL_APPLICATION_DOCUMENTS",
            "SELECT, INSERT, UPDATE (SUPERSEDED_AT)",
          ],
          ["STL_DRAFT_DOCUMENT_SCOPES", "SELECT, INSERT"],
          ["STL_NOTIFICATIONS", "INSERT"],
        ];
        for (const [table, privileges] of grants)
          await connection.execute(
            `GRANT ${privileges} ON ${table} TO ${runtime.user}`,
          );
      }
      if (env.ORACLE_LAB_ENABLE_DOCUMENT_SCAN === "true")
        await connection.execute(
          `GRANT SELECT, UPDATE (SCAN_STATUS, SCAN_LEASE_TOKEN, SCAN_LEASE_EXPIRES_AT)
            ON STL_APPLICATION_DOCUMENTS TO ${runtime.user}`,
        );
      if (env.ORACLE_LAB_ENABLE_MANAGEMENT === "true") {
        const grants = [
          ["STL_NOTIFICATIONS", "SELECT, UPDATE (READ_AT)"],
          [
            "STL_SYSTEM_CONFIGURATIONS",
            "SELECT, INSERT, UPDATE (VALUE, UPDATED_AT)",
          ],
          ["STL_CONFIGURATION_VERSIONS", "SELECT, INSERT"],
          ["STL_AUDIT_LOGS", "SELECT"],
          ["STL_AREAS", "SELECT"],
          ["STL_AREA_ASSIGNMENTS", "SELECT"],
          ["STL_EMAIL_DELIVERY_LOGS", "SELECT"],
        ];
        for (const [table, privileges] of grants)
          await connection.execute(
            `GRANT ${privileges} ON ${table} TO ${runtime.user}`,
          );
      }
    });
    await pool.transaction(async (connection) => {
      await connection.execute("LOCK TABLE STL_ROLES IN EXCLUSIVE MODE");
      for (const [id, label] of Object.entries(roles)) {
        await connection.execute(
          `MERGE INTO STL_ROLES R USING (SELECT :id AS ID,:label AS LABEL FROM DUAL) S ON (S.ID=R.ID)
          WHEN MATCHED THEN UPDATE SET R.LABEL=S.LABEL
          WHEN NOT MATCHED THEN INSERT (ID,LABEL) VALUES (S.ID,S.LABEL)`,
          { id, label },
        );
        const actions = permissions[id as keyof typeof roles];
        const binds = Object.fromEntries(
          actions.map((action, i) => [`action${i}`, action]),
        );
        await connection.execute(
          `DELETE FROM STL_PERMISSIONS WHERE ROLE_ID=:role${
            actions.length
              ? ` AND ACTION NOT IN (${Object.keys(binds)
                  .map((key) => `:${key}`)
                  .join(",")})`
              : ""
          }`,
          { role: id, ...binds },
        );
        for (const action of actions)
          await connection.execute(
            `MERGE INTO STL_PERMISSIONS P USING (SELECT :role AS ROLE_ID,:action AS ACTION FROM DUAL) S
            ON (S.ROLE_ID=P.ROLE_ID AND S.ACTION=P.ACTION)
            WHEN NOT MATCHED THEN INSERT (ID,ROLE_ID,ACTION) VALUES (:id,S.ROLE_ID,S.ACTION)`,
            { id: newOracleId(), role: id, action },
          );
      }
      for (const [table, values] of [
        ["STL_DISTRICTS", districts],
        ["STL_DEPARTMENTS", departments],
      ] as const)
        for (const [id, name] of Object.entries(values))
          await connection.execute(
            `MERGE INTO ${table} R USING (SELECT :id AS ID,:name AS NAME FROM DUAL) S ON (S.ID=R.ID)
             WHEN MATCHED THEN UPDATE SET R.NAME=S.NAME
             WHEN NOT MATCHED THEN INSERT (ID,NAME) VALUES (S.ID,S.NAME)`,
            { id, name },
          );
      for (const category of templateCategories)
        await connection.execute(
          `INSERT INTO STL_TEMPLATE_DEFINITIONS (ID,NAME,CATEGORY)
            SELECT :id,:category,:category FROM DUAL WHERE NOT EXISTS (
              SELECT 1 FROM STL_TEMPLATE_DEFINITIONS WHERE CATEGORY=:category
            )`,
          { id: newOracleId(), category },
        );
      await connection.execute(
        `MERGE INTO STL_USERS U USING (SELECT :id AS ID FROM DUAL) S ON (S.ID=U.ID)
        WHEN NOT MATCHED THEN INSERT (ID,NAME,EMAIL,PHONE,KIND,EMAIL_VERIFIED,UPDATED_AT)
        VALUES (S.ID,:name,:email,:phone,'OFFICER',1,SYSTIMESTAMP)`,
        {
          id: labActorId,
          name: "Pegawai Oracle Sintetik",
          email: "stl-oracle-lab@example.test",
          phone: "0100000000",
        },
      );
      await connection.execute(
        `MERGE INTO STL_USER_ROLE_ASSIGNMENTS A USING (SELECT :id AS ID FROM DUAL) S ON (S.ID=A.ID)
        WHEN NOT MATCHED THEN INSERT (ID,USER_ID,ROLE_ID,DISTRICT_ID,REFERENCE) VALUES (S.ID,:actor,'PIC_KAWASAN','SPU',:reference)`,
        {
          id: "00000000-0000-4000-8000-000000000063",
          actor: labActorId,
          reference: "STL ORACLE LAB",
        },
      );
      await connection.execute(
        `MERGE INTO STL_SESSIONS S USING (SELECT :id AS ID FROM DUAL) X ON (X.ID=S.ID)
        WHEN NOT MATCHED THEN INSERT (ID,USER_ID,ACTIVE_ROLE,MFA_VERIFIED,CSRF_HASH,EXPIRES_AT)
        VALUES (X.ID,:actor,'PIC_KAWASAN',1,:csrf,SYSTIMESTAMP + INTERVAL '1' DAY)`,
        {
          id: labSessionHash,
          actor: labActorId,
          csrf: createHash("sha256").update("STL_LAB_CSRF_62").digest("hex"),
        },
      );
    });
  } finally {
    await pool.close();
  }
}
