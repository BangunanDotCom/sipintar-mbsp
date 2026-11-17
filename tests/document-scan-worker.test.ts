import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { processPendingDocumentScan } from "../apps/api/src/document-scan-worker.js";
import type { PrivateDocumentStore } from "../apps/api/src/private-document-store.js";
import type { DocumentMalwareScanner } from "../apps/api/src/document-malware-scanner.js";
import { createPrivateDocumentKey } from "../apps/api/src/private-document-keys.js";

const draftId = "550e8400-e29b-41d4-a716-446655440000";
const bytes = Buffer.from("%PDF-1.7\nexample");
const document = {
  id: "550e8400-e29b-41d4-a716-446655440002",
  draftId, storageKey: createPrivateDocumentKey(draftId, "premises_plan"),
  sha256: createHash("sha256").update(bytes).digest("hex"),
  byteSize: bytes.length,
  scanStatus: "PENDING", supersededAt: null,
};
function setup(overrides: { scanStatus?: string; supersededAt?: string | null } = {}) {
  const findUnique = vi.fn(async () => ({ ...document, ...overrides }));
  const updateMany = vi.fn(async () => ({ count: 1 }));
  const db = { applicationDocument: { findUnique, updateMany } } as unknown as PrismaClient;
  const store: PrivateDocumentStore = {
    putQuarantined: async () => undefined,
    readQuarantined: async () => bytes,
    deleteQuarantined: async () => undefined,
  };
  const scan = vi.fn(async () => ({ status: "CLEAN" as const, engine: "test" }));
  const scanner: DocumentMalwareScanner = { scan };
  return { db, store, scanner, findUnique, updateMany, scan };
}
describe("document scan worker state transition", () => {
  it("persists CLEAN only after a successful scan", async () => {
    const s = setup();
    await expect(processPendingDocumentScan(s.db, s.store, s.scanner, document.id)).resolves.toBe("CLEAN");
    expect(s.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ scanStatus: "SCANNING", supersededAt: null, byteSize: bytes.length }),
      data: { scanStatus: "CLEAN", scanLeaseToken: null, scanLeaseExpiresAt: null },
    }));
  });
  it("passes persisted byte size into the integrity check", async () => {
    const s = setup();
    s.findUnique.mockResolvedValueOnce({ ...document, byteSize: bytes.length + 1 });
    await expect(processPendingDocumentScan(s.db, s.store, s.scanner, document.id))
      .resolves.toBe("FAILED");
    expect(s.scan).not.toHaveBeenCalled();
    expect(s.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { scanStatus: "FAILED", scanLeaseToken: null, scanLeaseExpiresAt: null },
    }));
  });
  it("persists FAILED if scanner cannot run", async () => {
    const s = setup();
    s.scan.mockRejectedValueOnce(new Error("daemon offline"));
    await expect(processPendingDocumentScan(s.db, s.store, s.scanner, document.id)).resolves.toBe("FAILED");
    expect(s.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { scanStatus: "FAILED", scanLeaseToken: null, scanLeaseExpiresAt: null } }));
  });
  it("skips already processed or superseded records", async () => {
    for (const override of [{ scanStatus: "CLEAN" }, { supersededAt: new Date().toISOString() }]) {
      const s = setup(override);
      await expect(processPendingDocumentScan(s.db, s.store, s.scanner, document.id)).resolves.toBe("SKIPPED");
      expect(s.scan).not.toHaveBeenCalled();
      expect(s.updateMany).not.toHaveBeenCalled();
    }
  });
  it("includes the recorded byte size when claiming a scan lease", async () => {
    const s = setup();
    await processPendingDocumentScan(s.db, s.store, s.scanner, document.id);
    expect(s.updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({ byteSize: bytes.length, sha256: document.sha256 }),
    }));
  });
  it("does not scan when another worker owns the lease", async () => {
    const s = setup({ scanStatus: "SCANNING" });
    s.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(processPendingDocumentScan(s.db, s.store, s.scanner, document.id))
      .resolves.toBe("SKIPPED");
    expect(s.scan).not.toHaveBeenCalled();
    expect(s.updateMany).toHaveBeenCalledTimes(1);
  });
  it("does not report CLEAN when its lease expires before completion", async () => {
    const s = setup();
    s.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await expect(processPendingDocumentScan(s.db, s.store, s.scanner, document.id))
      .resolves.toBe("SKIPPED");
    expect(s.scan).toHaveBeenCalledOnce();
    expect(s.updateMany).toHaveBeenCalledTimes(2);
  });
  it("persists FAILED when the scanner returns an invalid result", async () => {
    const s = setup();
    s.scan.mockResolvedValueOnce({ status: "CLEAN", engine: "" });
    await expect(processPendingDocumentScan(s.db, s.store, s.scanner, document.id))
      .resolves.toBe("FAILED");
    expect(s.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { scanStatus: "FAILED", scanLeaseToken: null, scanLeaseExpiresAt: null },
    }));
  });
  it("does not claim success if another worker already changed the row", async () => {
    const s = setup();
    s.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(processPendingDocumentScan(s.db, s.store, s.scanner, document.id)).resolves.toBe("SKIPPED");
  });
});
