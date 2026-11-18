import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { createPrivateDocumentKey } from "../apps/api/src/private-document-keys.js";
import { processPendingDocumentScan } from "../apps/api/src/document-scan-worker.js";
import type { PrivateDocumentStore } from "../apps/api/src/private-document-store.js";
import type { DocumentMalwareScanner } from "../apps/api/src/document-malware-scanner.js";

const draftId = "550e8400-e29b-41d4-a716-446655440000";
const id = "550e8400-e29b-41d4-a716-446655440002";
const bytes = Buffer.from("%PDF-1.7\ntest");
function setup(status = "PENDING") {
  const findUnique = vi.fn(async () => ({
    id, draftId, storageKey: createPrivateDocumentKey(draftId, "premises_plan"),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    byteSize: bytes.length, mimeType: "application/pdf",
    scanStatus: status, supersededAt: null,
  }));
  const updateMany = vi.fn(async (_args: { where: Record<string, unknown>; data: Record<string, unknown> }) => ({ count: 1 }));
  const db = { applicationDocument: { findUnique, updateMany } } as unknown as PrismaClient;
  const store: PrivateDocumentStore = {
    putQuarantined: async () => undefined,
    readQuarantined: async () => bytes,
    deleteQuarantined: async () => undefined,
  };
  const scan = vi.fn(async () => ({ status: "CLEAN" as const, engine: "test" }));
  const scanner: DocumentMalwareScanner = { scan };
  return { db, store, scanner, scan, updateMany };
}
describe("document scan lease ownership", () => {
  it("claims a PENDING document before reading or scanning", async () => {
    const f = setup();
    await expect(processPendingDocumentScan(f.db, f.store, f.scanner, id)).resolves.toBe("CLEAN");
    expect(f.updateMany).toHaveBeenCalledTimes(2);
    const claim = f.updateMany.mock.calls[0][0] as unknown as { where: { OR: unknown }; data: { scanStatus: string; scanLeaseToken: string } };
    const complete = f.updateMany.mock.calls[1][0] as unknown as { where: { scanLeaseToken: string; scanLeaseExpiresAt: unknown } };
    expect(claim.where.OR).toEqual([
      { scanStatus: "PENDING" },
      { scanStatus: "SCANNING", scanLeaseExpiresAt: { lte: expect.any(Date) } },
    ]);
    expect(claim.data.scanStatus).toBe("SCANNING");
    expect(claim.data.scanLeaseToken).toMatch(/^[a-f0-9-]{36}$/);
    expect(complete.where.scanLeaseToken).toBe(claim.data.scanLeaseToken);
    expect(complete.where.scanLeaseExpiresAt).toEqual({ gt: expect.any(Date) });
  });
  it("skips work when another worker owns the lease", async () => {
    const f = setup("SCANNING");
    f.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(processPendingDocumentScan(f.db, f.store, f.scanner, id)).resolves.toBe("SKIPPED");
    expect(f.scan).not.toHaveBeenCalled();
    expect(f.updateMany).toHaveBeenCalledTimes(1);
  });
  it("does not return CLEAN if its lease expires before completion", async () => {
    const f = setup();
    f.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await expect(processPendingDocumentScan(f.db, f.store, f.scanner, id)).resolves.toBe("SKIPPED");
    expect(f.updateMany).toHaveBeenCalledTimes(2);
  });
});
