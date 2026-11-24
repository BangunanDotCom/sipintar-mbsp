import { createHash } from "node:crypto";
import { oracleConfig } from "../../apps/api/src/oracle/config.js";
import { createOraclePool } from "../../apps/api/src/oracle/pool.js";
import { newOracleId } from "../../apps/api/src/oracle/codecs.js";
import { permissions, roles } from "../../packages/shared/src/index.js";
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
    });
    await pool.transaction(async (connection) => {
      for (const [id, label] of Object.entries(roles)) {
        await connection.execute(
          `MERGE INTO STL_ROLES R USING (SELECT :id AS ID FROM DUAL) S ON (S.ID=R.ID)
          WHEN NOT MATCHED THEN INSERT (ID,LABEL) VALUES (S.ID,:label)`,
          { id, label },
        );
        for (const action of permissions[id as keyof typeof permissions])
          await connection.execute(
            `MERGE INTO STL_PERMISSIONS P USING (SELECT :role AS ROLE_ID,:action AS ACTION FROM DUAL) S
            ON (S.ROLE_ID=P.ROLE_ID AND S.ACTION=P.ACTION)
            WHEN NOT MATCHED THEN INSERT (ID,ROLE_ID,ACTION) VALUES (:id,S.ROLE_ID,S.ACTION)`,
            { id: newOracleId(), role: id, action },
          );
      }
      for (const id of ["SPU", "SPT", "SPS"])
        await connection.execute(
          `MERGE INTO STL_DISTRICTS D USING (SELECT :id AS ID FROM DUAL) S ON (S.ID=D.ID)
          WHEN NOT MATCHED THEN INSERT (ID,NAME) VALUES (S.ID,:name)`,
          { id, name: `Latihan ${id}` },
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
