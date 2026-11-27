import oracledb, { type Connection } from "oracledb";
import type { OracleConfig } from "./config.js";

export async function createOraclePool(config: OracleConfig) {
  if (!oracledb.thin) throw Error("Oracle makmal memerlukan Thin mode.");
  const pool = await oracledb.createPool({
    user: config.user,
    password: config.password,
    connectString: `127.0.0.1:${config.port}/${config.service}`,
    poolMin: 0,
    poolMax: config.purpose === "install" ? 1 : 3,
    poolIncrement: 1,
    queueMax: 12,
    queueTimeout: 5000,
    poolTimeout: 60,
    stmtCacheSize: 25,
    expireTime: 1,
    sessionCallback(connection, _requestedTag, done) {
      connection
        .execute(
          "ALTER SESSION SET NLS_CALENDAR='GREGORIAN' NLS_NUMERIC_CHARACTERS='.,' TIME_ZONE='+00:00'",
        )
        .then(() => done(), done);
    },
  });
  async function withConnection<T>(
    callback: (connection: Connection, discard: () => void) => Promise<T>,
  ) {
    const connection = await pool.getConnection();
    connection.callTimeout = 20_000;
    let result: T;
    let drop = false;
    try {
      const identity = await connection.execute<{
        DB_NAME: string;
        CON_NAME: string;
        SESSION_USER: string;
        CURRENT_SCHEMA: string;
      }>(
        `SELECT SYS_CONTEXT('USERENV', 'DB_NAME') AS DB_NAME,
                 SYS_CONTEXT('USERENV', 'CON_NAME') AS CON_NAME,
                 SYS_CONTEXT('USERENV', 'SESSION_USER') AS SESSION_USER,
                 SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA') AS CURRENT_SCHEMA
          FROM DUAL`,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const actual = identity.rows?.[0];
      if (
        actual?.DB_NAME !== config.database ||
        actual.CON_NAME !== config.service ||
        actual.SESSION_USER !== config.user ||
        actual.CURRENT_SCHEMA !== config.user ||
        ![19, 23].includes(
          Number(connection.oracleServerVersionString.split(".")[0]),
        ) ||
        (config.expectedVersion !== undefined &&
          connection.oracleServerVersionString !== config.expectedVersion)
      ) {
        drop = true;
        throw Object.assign(
          Error("Identiti atau versi Oracle/PDB/sesi makmal tidak sepadan."),
          {
            code: "ORACLE_LAB_IDENTITY_MISMATCH",
          },
        );
      }
      result = await callback(connection, () => {
        drop = true;
      });
    } catch (error) {
      await connection.close({ drop }).catch(() => {});
      throw error;
    }
    await connection.close({ drop });
    return result;
  }

  return {
    owner: config.owner,
    purpose: config.purpose,
    connections: () => ({
      open: pool.connectionsOpen,
      inUse: pool.connectionsInUse,
    }),
    use: <T>(callback: (connection: Connection) => Promise<T>) =>
      withConnection(callback),
    transaction: <T>(callback: (connection: Connection) => Promise<T>) =>
      withConnection(async (connection, discard) => {
        try {
          const result = await callback(connection);
          await connection.commit();
          return result;
        } catch (error) {
          try {
            await connection.rollback();
          } catch {
            discard();
          }
          throw error;
        }
      }),
    close: () => pool.close(0),
  };
}

export type OraclePool = Awaited<ReturnType<typeof createOraclePool>>;
