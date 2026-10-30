const databaseCodes = new Set([
  "P1000",
  "P1001",
  "P1002",
  "P1003",
  "P1008",
  "P1010",
  "P1011",
  "P1017",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "28P01",
  "3D000",
  "57P01",
]);
const schemaCodes = new Set(["P2021", "P2022", "42P01", "42703"]);
const configurationCodes = new Set([
  "DATABASE_NOT_CONFIGURED",
  "REGISTRATION_NOT_CONFIGURED",
]);

export function safeServerFailure(error: unknown) {
  const value = error as {
    code?: unknown;
    errorCode?: unknown;
    statusCode?: unknown;
    meta?: { driverAdapterError?: { cause?: { kind?: unknown } } };
  };
  const code =
    typeof value?.code === "string"
      ? value.code
      : typeof value?.errorCode === "string"
        ? value.errorCode
        : "";
  // The pg adapter can wrap a connection failure as P2010. Only inspect its
  // bounded kind; host, credentials, SQL, originalMessage and stack stay private.
  const kind = value?.meta?.driverAdapterError?.cause?.kind;
  const adapterFailures: Record<string, string> = {
    DatabaseNotReachable: "PG_UNREACHABLE",
    DatabaseDoesNotExist: "PG_DATABASE_MISSING",
    AuthenticationFailed: "PG_AUTHENTICATION_FAILED",
    TlsConnectionError: "PG_TLS_FAILURE",
    ConnectionClosed: "PG_CONNECTION_CLOSED",
    SocketTimeout: "PG_TIMEOUT",
  };
  if (typeof kind === "string" && Object.hasOwn(adapterFailures, kind))
    return {
      status: 503,
      code: "DATABASE_UNAVAILABLE",
      diagnosticCode: adapterFailures[kind],
      message: "Sambungan pangkalan data tidak tersedia. Hubungi pentadbir.",
    };
  if (kind === "TableDoesNotExist" || kind === "ColumnNotFound")
    return {
      status: 503,
      code: "DATABASE_SCHEMA_NOT_READY",
      diagnosticCode:
        kind === "TableDoesNotExist" ? "PG_TABLE_MISSING" : "PG_COLUMN_MISSING",
      message:
        "Pendaftaran belum tersedia. Pentadbir perlu menyemak versi pangkalan data.",
    };
  if (databaseCodes.has(code))
    return {
      status: 503,
      code: "DATABASE_UNAVAILABLE",
      diagnosticCode: code,
      message: "Sambungan pangkalan data tidak tersedia. Hubungi pentadbir.",
    };
  if (schemaCodes.has(code))
    return {
      status: 503,
      code: "DATABASE_SCHEMA_NOT_READY",
      diagnosticCode: code,
      message:
        "Pendaftaran belum tersedia. Pentadbir perlu menyemak versi pangkalan data.",
    };
  if (configurationCodes.has(code))
    return {
      status: 503,
      code: "SERVICE_NOT_CONFIGURED",
      diagnosticCode: code,
      message: "Pendaftaran belum dikonfigurasi. Hubungi pentadbir.",
    };
  const status =
    typeof value?.statusCode === "number" &&
    value.statusCode >= 500 &&
    value.statusCode <= 599
      ? value.statusCode
      : 500;
  return {
    status,
    code: "INTERNAL_ERROR",
    diagnosticCode:
      /^P\d{4}$/.test(code) || /^[0-9A-Z]{5}$/.test(code)
        ? code
        : "UNCLASSIFIED",
    message: "Perkhidmatan tidak dapat diproses. Cuba lagi.",
  };
}

export function assertDatabaseConfigured() {
  const raw =
    process.env.NODE_ENV === "test"
      ? process.env.TEST_DATABASE_URL
      : process.env.DATABASE_URL;
  try {
    const url = new URL(raw || "");
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname ||
      url.pathname.length < 2
    )
      throw new Error();
  } catch {
    throw Object.assign(
      new Error("Pendaftaran belum dikonfigurasi. Hubungi pentadbir."),
      { code: "DATABASE_NOT_CONFIGURED", statusCode: 503 },
    );
  }
}
