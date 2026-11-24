import { oracleGeneratedLobIndexes } from "./lob-indexes.js";
import oracledb from "oracledb";
import { oracleConfig } from "../../apps/api/src/oracle/config.js";
import { createOraclePool } from "../../apps/api/src/oracle/pool.js";

const pool = await createOraclePool(oracleConfig(process.env, "install"));
try {
  await pool.use(async (connection) => {
    const options = { outFormat: oracledb.OUT_FORMAT_OBJECT };
    const objects = await connection.execute<{ OBJECT_NAME: string }>(
      "SELECT OBJECT_TYPE, OBJECT_NAME, STATUS FROM USER_OBJECTS WHERE SUBSTR(OBJECT_NAME,1,4)='STL_' ORDER BY OBJECT_TYPE,OBJECT_NAME",
      {},
      options,
    );
    const errors = await connection.execute(
      "SELECT NAME, TYPE, LINE, POSITION, MESSAGE_NUMBER FROM USER_ERRORS WHERE SUBSTR(NAME,1,4)='STL_' ORDER BY NAME,SEQUENCE",
      {},
      options,
    );
    const proposedLobIndexExceptions =
      await oracleGeneratedLobIndexes(connection);
    let history: unknown = null;
    if (
      objects.rows?.some((row) => row.OBJECT_NAME === "STL_SCHEMA_MIGRATIONS")
    ) {
      try {
        history = (
          await connection.execute(
            "SELECT VERSION, STATE, STARTED_AT, APPLIED_AT FROM STL_SCHEMA_MIGRATIONS ORDER BY VERSION FETCH FIRST 25 ROWS ONLY",
            {},
            options,
          )
        ).rows;
      } catch {
        history = "UNREADABLE";
      }
    }
    console.log(
      JSON.stringify(
        {
          objects: objects.rows,
          errors: errors.rows,
          history,
          proposedLobIndexExceptions,
        },
        null,
        2,
      ),
    );
  });
} finally {
  await pool.close();
}
