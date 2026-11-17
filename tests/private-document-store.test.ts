import { describe, expect, it, vi } from "vitest";
import {
  DisabledDocumentStore,
  storeQuarantinedDocument,
  type PrivateDocumentStore,
} from "../apps/api/src/private-document-store.js";
import { createPrivateDocumentKey } from "../apps/api/src/private-document-keys.js";

const draftId = "550e8400-e29b-41d4-a716-446655440000";
const otherDraft = "550e8400-e29b-41d4-a716-446655440001";
const bytes = Buffer.from("%PDF-1.7\nexample");
function store() {
  const putQuarantined = vi.fn(async () => undefined);
  const adapter: PrivateDocumentStore = {
    putQuarantined,
    readQuarantined: async () => bytes,
    deleteQuarantined: async () => undefined,
  };
  return { adapter, putQuarantined };
}
describe("private document quarantine adapter", () => {
  it("persists only after scoped key validation and computes digest", async () => {
    const { adapter, putQuarantined } = store();
    const key = createPrivateDocumentKey(draftId, "premises_plan");
    const result = await storeQuarantinedDocument(adapter, {
      draftId, storageKey: key, content: bytes, mimeType: "application/pdf",
    });
    expect(result.byteSize).toBe(bytes.length);
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(putQuarantined).toHaveBeenCalledOnce();
  });
  it("rejects cross-draft keys before storage access", async () => {
    const { adapter, putQuarantined } = store();
    await expect(storeQuarantinedDocument(adapter, {
      draftId, storageKey: createPrivateDocumentKey(otherDraft, "premises_plan"),
      content: bytes, mimeType: "application/pdf",
    })).rejects.toThrow();
    expect(putQuarantined).not.toHaveBeenCalled();
  });
  it("rejects empty payloads before storage access", async () => {
    const { adapter, putQuarantined } = store();
    await expect(storeQuarantinedDocument(adapter, {
      draftId, storageKey: createPrivateDocumentKey(draftId, "premises_plan"),
      content: Buffer.alloc(0), mimeType: "application/pdf",
    })).rejects.toThrow();
    expect(putQuarantined).not.toHaveBeenCalled();
  });
  it("rejects MIME spoofing before writing to quarantine", async () => {
    const { adapter, putQuarantined } = store();
    await expect(storeQuarantinedDocument(adapter, {
      draftId, storageKey: createPrivateDocumentKey(draftId, "premises_plan"),
      content: Buffer.from("not really a pdf"), mimeType: "application/pdf",
    })).rejects.toThrow("Kandungan fail");
    expect(putQuarantined).not.toHaveBeenCalled();
  });
  it("does not allow PDF content in photo category", async () => {
    const { adapter, putQuarantined } = store();
    await expect(storeQuarantinedDocument(adapter, {
      draftId, storageKey: createPrivateDocumentKey(draftId, "premises_photos"),
      content: bytes, mimeType: "application/pdf",
    })).rejects.toThrow("Jenis fail");
    expect(putQuarantined).not.toHaveBeenCalled();
  });
  it("does not enable uploads without an actual configured store", async () => {
    await expect(storeQuarantinedDocument(new DisabledDocumentStore(), {
      draftId, storageKey: createPrivateDocumentKey(draftId, "premises_plan"),
      content: bytes, mimeType: "application/pdf",
    })).rejects.toThrow("Storan dokumen belum diaktifkan.");
  });
});
