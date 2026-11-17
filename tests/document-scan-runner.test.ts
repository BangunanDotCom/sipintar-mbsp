import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { runConfiguredDocumentScanBatch } from "../apps/api/src/document-scan-runner.js";

const db = {
  applicationDocument: { findMany: vi.fn(async () => []) },
} as unknown as PrismaClient;
const configured = {
  NODE_ENV: "test",
  STAYLINK_DOCUMENT_STORE: "local",
  STAYLINK_LOCAL_DOCUMENT_STORE_ENABLED: "true",
  STAYLINK_LOCAL_DOCUMENT_ROOT: "/tmp/staylink-scan-runner-test",
  STAYLINK_CLAMAV_ENABLED: "true",
  STAYLINK_CLAMAV_HOST: "127.0.0.1",
  STAYLINK_DOCUMENT_SCAN_BATCH_ENABLED: "true",
};

describe("configured document scan batch runner", () => {
  it("rejects execution without explicit batch opt-in", async () => {
    await expect(runConfiguredDocumentScanBatch(db, {
      ...configured, STAYLINK_DOCUMENT_SCAN_BATCH_ENABLED: "false",
    })).rejects.toThrow("belum diaktifkan");
  });
  it("rejects disabled storage or malware scanning", async () => {
    await expect(runConfiguredDocumentScanBatch(db, {
      ...configured, STAYLINK_DOCUMENT_STORE: "disabled",
    })).rejects.toThrow("mesti diaktifkan");
    await expect(runConfiguredDocumentScanBatch(db, {
      ...configured, STAYLINK_CLAMAV_ENABLED: "false",
    })).rejects.toThrow("mesti diaktifkan");
  });
  it("rejects invalid batch limits before querying documents", async () => {
    await expect(runConfiguredDocumentScanBatch(db, {
      ...configured, STAYLINK_DOCUMENT_SCAN_BATCH_LIMIT: "51",
    })).rejects.toThrow("1 hingga 50");
  });
  it("returns an empty batch summary when no documents are pending", async () => {
    const summary = await runConfiguredDocumentScanBatch(db, configured);
    expect(summary).toEqual({
      examined: 0, clean: 0, infected: 0, failed: 0, skipped: 0,
    });
  });
});
