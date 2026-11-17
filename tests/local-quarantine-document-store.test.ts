import { mkdtemp, rm, symlink, mkdir, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createPrivateDocumentKey } from "../apps/api/src/private-document-keys.js";
import { LocalQuarantineDocumentStore } from "../apps/api/src/local-quarantine-document-store.js";
import { storeQuarantinedDocument } from "../apps/api/src/private-document-store.js";

const draftId = "550e8400-e29b-41d4-a716-446655440000";
const roots: string[] = [];
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "staylink-quarantine-"));
  roots.push(root);
  return new LocalQuarantineDocumentStore(root);
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
describe("local quarantine development adapter", () => {
  it("stores, reads and deletes private PDF bytes", async () => {
    const store = await setup();
    const key = createPrivateDocumentKey(draftId, "premises_plan");
    const bytes = Buffer.from("%PDF-1.7\nlocal test");
    const saved = await storeQuarantinedDocument(store, {
      draftId, storageKey: key, content: bytes, mimeType: "application/pdf",
    });
    expect(saved.byteSize).toBe(bytes.length);
    expect(await store.readQuarantined(key)).toEqual(bytes);
    await store.deleteQuarantined(key);
    await expect(store.readQuarantined(key)).rejects.toThrow();
  });
  it("rejects empty and oversized direct writes", async () => {
    const store = await setup();
    const key = createPrivateDocumentKey(draftId, "premises_plan");
    await expect(store.putQuarantined({
      key, content: Buffer.alloc(0), mimeType: "application/pdf",
    })).rejects.toThrow("Saiz");
    await expect(store.putQuarantined({
      key, content: Buffer.alloc(100 * 1024 * 1024 + 1), mimeType: "application/pdf",
    })).rejects.toThrow("Saiz");
  });
  it("rejects oversized stored objects before reading their contents", async () => {
    const root = await mkdtemp(join(tmpdir(), "staylink-oversize-"));
    roots.push(root);
    const store = new LocalQuarantineDocumentStore(root);
    const key = createPrivateDocumentKey(draftId, "premises_plan");
    const location = join(root, ...key.split("/"));
    await mkdir(join(root, ...key.split("/").slice(0, -1)), { recursive: true });
    const handle = await (await import("node:fs/promises")).open(location, "w");
    try {
      await handle.truncate(100 * 1024 * 1024 + 1);
    } finally {
      await handle.close();
    }
    await expect(store.readQuarantined(key)).rejects.toThrow("Saiz");
  });
  it("rejects duplicate keys rather than overwriting documents", async () => {
    const store = await setup();
    const key = createPrivateDocumentKey(draftId, "premises_plan");
    const input = { draftId, storageKey: key, content: Buffer.from("%PDF-1.7\nfile"), mimeType: "application/pdf" };
    await storeQuarantinedDocument(store, input);
    await expect(storeQuarantinedDocument(store, input)).rejects.toThrow();
  });
  it("rejects symlink objects instead of reading their targets", async () => {
    const root = await mkdtemp(join(tmpdir(), "staylink-symlink-"));
    roots.push(root);
    const store = new LocalQuarantineDocumentStore(root);
    const key = createPrivateDocumentKey(draftId, "premises_plan");
    const target = join(root, "outside.txt");
    await writeFile(target, "private");
    const location = join(root, ...key.split("/"));
    await mkdir(join(root, ...key.split("/").slice(0, -1)), { recursive: true });
    await symlink(target, location);
    await expect(store.readQuarantined(key)).rejects.toThrow();
    await expect(store.deleteQuarantined(key)).rejects.toThrow();
  });
  it("rejects symlinked intermediate directories even when targets remain inside root", async () => {
    const root = await mkdtemp(join(tmpdir(), "staylink-dir-symlink-"));
    roots.push(root);
    const store = new LocalQuarantineDocumentStore(root);
    const key = createPrivateDocumentKey(draftId, "premises_plan");
    const [prefix, draft, category] = key.split("/");
    const target = join(root, "redirected");
    await mkdir(join(target, draft, category), { recursive: true });
    await symlink(target, join(root, prefix), "dir");
    await expect(store.putQuarantined({
      key, content: Buffer.from("%PDF-1.7\\ntest"), mimeType: "application/pdf",
    })).rejects.toThrow("symlink");
  });
  it("rejects a symlinked quarantine root", async () => {
    const root = await mkdtemp(join(tmpdir(), "staylink-root-target-"));
    const aliasParent = await mkdtemp(join(tmpdir(), "staylink-root-alias-"));
    roots.push(root, aliasParent);
    const alias = join(aliasParent, "quarantine");
    await symlink(root, alias, "dir");
    const store = new LocalQuarantineDocumentStore(alias);
    const key = createPrivateDocumentKey(draftId, "premises_plan");
    await expect(store.putQuarantined({
      key, content: Buffer.from("%PDF-1.7\\nroot"), mimeType: "application/pdf",
    })).rejects.toThrow("symlink");
  });
  it("rejects path traversal and arbitrary object keys", async () => {
    const store = await setup();
    await expect(store.readQuarantined("../../etc/passwd")).rejects.toThrow("Kunci");
    await expect(store.deleteQuarantined("application-documents/not-a-uuid/plan/file")).rejects.toThrow("Kunci");
  });
});
