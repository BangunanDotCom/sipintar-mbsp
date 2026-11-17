import { describe, expect, it, vi } from "vitest";
import {
  DisabledDocumentStore,
  storeQuarantinedDocument,
  readVerifiedQuarantinedDocument,
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
  it("verifies stored quarantine content against the recorded digest and size", async () => {
    const { adapter } = store();
    const storageKey = createPrivateDocumentKey(draftId, "premises_plan");
    const prepared = await storeQuarantinedDocument(adapter, {
      draftId, storageKey, content: bytes, mimeType: "application/pdf",
    });
    await expect(readVerifiedQuarantinedDocument(adapter, {
      draftId, storageKey, expectedSha256: prepared.sha256, expectedByteSize: prepared.byteSize,
    })).resolves.toEqual(bytes);
    await expect(readVerifiedQuarantinedDocument(adapter, {
      draftId, storageKey, expectedSha256: "0".repeat(64), expectedByteSize: prepared.byteSize,
    })).rejects.toThrow("Integriti dokumen");
    await expect(readVerifiedQuarantinedDocument(adapter, {
      draftId, storageKey, expectedSha256: prepared.sha256, expectedByteSize: prepared.byteSize + 1,
    })).rejects.toThrow("Integriti dokumen");
  });
  it("rejects invalid metadata and cross-draft reads before accessing storage", async () => {
    const readQuarantined = vi.fn(async () => bytes);
    const adapter: PrivateDocumentStore = {
      putQuarantined: async () => undefined,
      readQuarantined,
      deleteQuarantined: async () => undefined,
    };
    const storageKey = createPrivateDocumentKey(draftId, "premises_plan");
    await expect(readVerifiedQuarantinedDocument(adapter, {
      draftId: otherDraft, storageKey, expectedSha256: "0".repeat(64), expectedByteSize: 1,
    })).rejects.toThrow();
    await expect(readVerifiedQuarantinedDocument(adapter, {
      draftId, storageKey, expectedSha256: "invalid", expectedByteSize: 1,
    })).rejects.toThrow("Metadata integriti");
    await expect(readVerifiedQuarantinedDocument(adapter, {
      draftId, storageKey, expectedSha256: "0".repeat(64),
      expectedByteSize: 101 * 1024 * 1024,
    })).rejects.toThrow("Metadata integriti");
    expect(readQuarantined).not.toHaveBeenCalled();
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
  it("accepts a structurally valid JPEG photo in quarantine", async () => {
    const { adapter, putQuarantined } = store();
    const photo = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0xff, 0xd9]);
    const result = await storeQuarantinedDocument(adapter, {
      draftId, storageKey: createPrivateDocumentKey(draftId, "premises_photos"),
      content: photo, mimeType: "image/jpeg",
    });
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.byteSize).toBe(photo.length);
    expect(putQuarantined).toHaveBeenCalledOnce();
  });
  it("rejects a JPEG without its closing marker before writing", async () => {
    const { adapter, putQuarantined } = store();
    await expect(storeQuarantinedDocument(adapter, {
      draftId, storageKey: createPrivateDocumentKey(draftId, "premises_photos"),
      content: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00]),
      mimeType: "image/jpeg",
    })).rejects.toThrow("Kandungan fail");
    expect(putQuarantined).not.toHaveBeenCalled();
  });
  it("rejects truncated PNG headers before writing to quarantine", async () => {
    const { adapter, putQuarantined } = store();
    const truncated = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      Buffer.from([0, 0, 0, 13]),
      Buffer.from("IHDR"),
      Buffer.alloc(8),
    ]);
    await expect(storeQuarantinedDocument(adapter, {
      draftId, storageKey: createPrivateDocumentKey(draftId, "premises_photos"),
      content: truncated, mimeType: "image/png",
    })).rejects.toThrow("Kandungan fail");
    expect(putQuarantined).not.toHaveBeenCalled();
  });
  it("rejects zero-dimension PNG headers before writing to quarantine", async () => {
    const { adapter, putQuarantined } = store();
    const invalid = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      Buffer.from([0, 0, 0, 13]),
      Buffer.from("IHDR"),
      Buffer.alloc(17),
    ]);
    await expect(storeQuarantinedDocument(adapter, {
      draftId, storageKey: createPrivateDocumentKey(draftId, "premises_photos"),
      content: invalid, mimeType: "image/png",
    })).rejects.toThrow("Kandungan fail");
    expect(putQuarantined).not.toHaveBeenCalled();
  });
  it("does not enable uploads without an actual configured store", async () => {
    await expect(storeQuarantinedDocument(new DisabledDocumentStore(), {
      draftId, storageKey: createPrivateDocumentKey(draftId, "premises_plan"),
      content: bytes, mimeType: "application/pdf",
    })).rejects.toThrow("Storan dokumen belum diaktifkan.");
  });
});
