import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPrivateDocumentKey } from "../apps/api/src/private-document-keys.js";
import { LocalQuarantineDocumentStore } from "../apps/api/src/local-quarantine-document-store.js";
import { storeQuarantinedDocument } from "../apps/api/src/private-document-store.js";
import { processPendingDocumentScan } from "../apps/api/src/document-scan-worker.js";

const draftId = "550e8400-e29b-41d4-a716-446655440000";
const documentId = "550e8400-e29b-41d4-a716-446655440001";
const directories: string[] = [];

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "staylink-integration-"));
  directories.push(root);
  const store = new LocalQuarantineDocumentStore(root);
  const storageKey = createPrivateDocumentKey(draftId, "premises_plan");
  const bytes = Buffer.from("%PDF-1.7\nlocal integration fixture");
  const prepared = await storeQuarantinedDocument(store, {
    draftId, storageKey, content: bytes, mimeType: "application/pdf",
  });
  const document = {
    id: documentId, draftId, storageKey, sha256: prepared.sha256,
    byteSize: bytes.length, mimeType: "application/pdf",
    scanStatus: "PENDING", supersededAt: null,
  };
  const findUnique = vi.fn(async () => document);
  const updateMany = vi.fn(async (_input: unknown) => ({ count: 1 }));
  const db = { applicationDocument: { findUnique, updateMany } } as unknown as PrismaClient;
  const scan = vi.fn(async (_bytes: Buffer) => ({ status: "CLEAN" as const, engine: "fixture" }));
  return { store, db, scan, updateMany, bytes, storageKey, document };
}
afterEach(async () => {
  await Promise.all(directories.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("local quarantine to scan worker integration", () => {
  it("reads stored bytes, verifies SHA-256 and persists CLEAN after scanning", async () => {
    const f = await fixture();
    await expect(processPendingDocumentScan(f.db, f.store, { scan: f.scan }, documentId))
      .resolves.toBe("CLEAN");
    expect(f.scan).toHaveBeenCalledWith(f.bytes);
    expect(f.updateMany).toHaveBeenCalledTimes(2);
    expect(f.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: { scanStatus: "CLEAN", scanLeaseToken: null, scanLeaseExpiresAt: null },
    }));
  });

  it("fails closed if stored bytes change after metadata was prepared", async () => {
    const f = await fixture();
    await f.store.deleteQuarantined(f.storageKey);
    await f.store.putQuarantined({
      key: f.storageKey, content: Buffer.from("%PDF-1.7\ntampered"),
      mimeType: "application/pdf",
    });
    await expect(processPendingDocumentScan(f.db, f.store, { scan: f.scan }, documentId))
      .resolves.toBe("FAILED");
    expect(f.scan).not.toHaveBeenCalled();
    expect(f.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: { scanStatus: "FAILED", scanLeaseToken: null, scanLeaseExpiresAt: null },
    }));
  });

  it("fails closed if the quarantine object is missing", async () => {
    const f = await fixture();
    await f.store.deleteQuarantined(f.storageKey);
    await expect(processPendingDocumentScan(f.db, f.store, { scan: f.scan }, documentId))
      .resolves.toBe("FAILED");
    expect(f.scan).not.toHaveBeenCalled();
  });
});
