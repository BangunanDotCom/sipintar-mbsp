import { createServer, type Server } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPrivateDocumentKey } from "../apps/api/src/private-document-keys.js";
import { LocalQuarantineDocumentStore } from "../apps/api/src/local-quarantine-document-store.js";
import { storeQuarantinedDocument } from "../apps/api/src/private-document-store.js";
import { processPendingDocumentScan } from "../apps/api/src/document-scan-worker.js";
import { ClamAvScanner } from "../apps/api/src/clamav-scanner.js";

const draftId = "550e8400-e29b-41d4-a716-446655440000";
const documentId = "550e8400-e29b-41d4-a716-446655440001";
const roots: string[] = [];
const servers: Server[] = [];

async function mockDaemon(reply: string) {
  const server = createServer((socket) => {
    let pending = Buffer.alloc(0);
    let done = false;
    socket.on("data", (data: Buffer) => {
      if (done) return;
      pending = Buffer.concat([pending, data]);
      const header = Buffer.from("zINSTREAM\0");
      if (pending.length < header.length || !pending.subarray(0, header.length).equals(header)) return;
      let offset = header.length;
      while (pending.length >= offset + 4) {
        const length = pending.readUInt32BE(offset);
        if (pending.length < offset + 4 + length) return;
        offset += 4 + length;
        if (length === 0) {
          done = true;
          socket.end(reply + "\0");
          return;
        }
      }
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No mock port");
  return address.port;
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "staylink-clamd-integration-"));
  roots.push(root);
  const store = new LocalQuarantineDocumentStore(root);
  const storageKey = createPrivateDocumentKey(draftId, "premises_plan");
  const bytes = Buffer.from("%PDF-1.7\nscan fixture");
  const prepared = await storeQuarantinedDocument(store, {
    draftId, storageKey, content: bytes, mimeType: "application/pdf",
  });
  const findUnique = vi.fn(async () => ({
    id: documentId, draftId, storageKey, sha256: prepared.sha256,
    scanStatus: "PENDING", supersededAt: null,
  }));
  const updateMany = vi.fn(async (_args: unknown) => ({ count: 1 }));
  const db = { applicationDocument: { findUnique, updateMany } } as unknown as PrismaClient;
  return { db, store, updateMany };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  await Promise.all(servers.splice(0).map((server) =>
    new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("quarantine + TCP ClamAV + scan lease integration", () => {
  it.each([
    ["stream: OK", "CLEAN"],
    ["stream: Eicar-Test-Signature FOUND", "INFECTED"],
    ["stream: INSTREAM size limit exceeded. ERROR", "FAILED"],
  ] as const)("maps daemon response %s to %s", async (reply, expected) => {
    const port = await mockDaemon(reply);
    const f = await fixture();
    const outcome = await processPendingDocumentScan(
      f.db, f.store, new ClamAvScanner("127.0.0.1", port, 2000), documentId,
    );
    expect(outcome).toBe(expected);
    expect(f.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: { scanStatus: expected, scanLeaseToken: null, scanLeaseExpiresAt: null },
    }));
  });
});
