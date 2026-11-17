import { describe, expect, it } from "vitest";
import { validateDocumentScanConfiguration } from "../apps/api/src/document-scan-preflight.js";

const valid: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  STAYLINK_DOCUMENT_SCAN_BATCH_ENABLED: "true",
  STAYLINK_DOCUMENT_STORE: "local",
  STAYLINK_LOCAL_DOCUMENT_STORE_ENABLED: "true",
  STAYLINK_LOCAL_DOCUMENT_ROOT: "/tmp/staylink-preflight",
  STAYLINK_CLAMAV_ENABLED: "true",
  STAYLINK_CLAMAV_HOST: "127.0.0.1",
};

describe("document scan CLI preflight", () => {
  it("accepts explicitly configured development/test storage and scanner", () => {
    expect(validateDocumentScanConfiguration(valid)).toBe(10);
    expect(validateDocumentScanConfiguration({
      ...valid, STAYLINK_DOCUMENT_SCAN_BATCH_LIMIT: "50",
    })).toBe(50);
  });
  it("rejects disabled batch processing before creating a database connection", () => {
    expect(() => validateDocumentScanConfiguration({
      ...valid, STAYLINK_DOCUMENT_SCAN_BATCH_ENABLED: "false",
    })).toThrow("belum diaktifkan");
  });
  it("rejects unsupported environments even with local storage opt-in", () => {
    for (const nodeEnv of [undefined, "production", "staging"]) {
      expect(() => validateDocumentScanConfiguration({
        ...valid, NODE_ENV: nodeEnv,
      })).toThrow("pembangunan atau ujian");
    }
  });
  it("rejects missing ClamAV host and invalid limits", () => {
    expect(() => validateDocumentScanConfiguration({
      ...valid, STAYLINK_CLAMAV_HOST: undefined,
    })).toThrow("STAYLINK_CLAMAV_HOST");
    for (const limit of ["0", "51", "NaN", "1.5", ""]) {
      expect(() => validateDocumentScanConfiguration({
        ...valid, STAYLINK_DOCUMENT_SCAN_BATCH_LIMIT: limit,
      })).toThrow("1 hingga 50");
    }
  });
});
