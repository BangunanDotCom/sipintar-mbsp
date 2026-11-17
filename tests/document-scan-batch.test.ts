import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { processPendingDocumentScanBatch } from "../apps/api/src/document-scan-batch.js";
import type { PrivateDocumentStore } from "../apps/api/src/private-document-store.js";
import type { DocumentMalwareScanner } from "../apps/api/src/document-malware-scanner.js";
import { createHash } from "node:crypto";
import { createPrivateDocumentKey } from "../apps/api/src/private-document-keys.js";

const draftId = "550e8400-e29b-41d4-a716-446655440000";
const bytes = Buffer.from("%PDF-1.7\nexample");
const ids = ["550e8400-e29b-41d4-a716-446655440002", "550e8400-e29b-41d4-a716-446655440003"];
function fixture() {
  const findMany = vi.fn(async () => ids.map((id) => ({ id })));
  const findUnique = vi.fn(async ({ where }: { where: { id: string } }) => ({
    id: where.id, draftId,
    storageKey: createPrivateDocumentKey(draftId, "premises_plan"),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    scanStatus: "PENDING", supersededAt: null,
  }));
  const updateMany = vi.fn(async () => ({ count: 1 }));
  const db = { applicationDocument: { findMany, findUnique, updateMany } } as unknown as PrismaClient;
  const store: PrivateDocumentStore = {
    putQuarantined: async () => undefined,
    readQuarantined: async () => bytes,
    deleteQuarantined: async () => undefined,
  };
  const scan = vi.fn(async () => ({ status: "CLEAN" as const, engine: "test" }));
  const scanner: DocumentMalwareScanner = { scan };
  return { db, store, scanner, findMany, updateMany, scan };
}
describe("document scan batch orchestration", () => {
  it("processes bounded pending documents and returns counts", async () => {
    const f = fixture();
    await expect(processPendingDocumentScanBatch(f.db, f.store, f.scanner, { limit: 2 }))
      .resolves.toEqual({ examined: 2, clean: 2, infected: 0, failed: 0, skipped: 0 });
    expect(f.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ supersededAt: null, OR: expect.any(Array) }),
      take: 2,
    }));
  });
  it("rejects unbounded batch limits before database access", async () => {
    const f = fixture();
    await expect(processPendingDocumentScanBatch(f.db, f.store, f.scanner, { limit: 100 }))
      .rejects.toThrow();
    expect(f.findMany).not.toHaveBeenCalled();
  });
  it("records scanner failure as FAILED rather than CLEAN", async () => {
    const f = fixture();
    f.scan.mockRejectedValue(new Error("offline"));
    await expect(processPendingDocumentScanBatch(f.db, f.store, f.scanner, { limit: 2 }))
      .resolves.toMatchObject({ clean: 0, failed: 2 });
  });
});
