const labName = /^STL_LAB_[A-Z][A-Z0-9_]{0,19}$/;
const labService = /^(?:FREEPDB1|XEPDB1|STLTEST[A-Z0-9_]{0,20})$/;

export type OraclePurpose = "install" | "runtime";
export type OracleConfig = ReturnType<typeof oracleConfig>;

export function oracleConfig(env: NodeJS.ProcessEnv, purpose: OraclePurpose) {
  const owner = env.ORACLE_SCHEMA;
  const user = env.ORACLE_USER;
  const service = env.ORACLE_SERVICE;
  const database = env.ORACLE_EXPECTED_DB_NAME;
  const password = env.ORACLE_PASSWORD;
  const port = Number(env.ORACLE_PORT);
  if (
    env.ORACLE_ENV !== "isolated-synthetic" ||
    env.ORACLE_HOST !== "127.0.0.1" ||
    !/^\d{1,5}$/.test(env.ORACLE_PORT ?? "") ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !owner ||
    !labName.test(owner) ||
    !user ||
    !labName.test(user) ||
    !service ||
    !labService.test(service) ||
    !database ||
    !/^(?:FREEPDB1|XEPDB1|FREE|XE|STLTEST[A-Z0-9_]{0,19})$/.test(database) ||
    !password ||
    (purpose === "install" ? user !== owner : user === owner)
  )
    throw Error(
      "Konfigurasi Oracle makmal tidak sah. Gunakan akaun dan Oracle loopback sintetik yang berasingan.",
    );
  return { owner, user, service, database, password, port, purpose };
}
