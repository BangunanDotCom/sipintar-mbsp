import { createHash, timingSafeEqual } from "node:crypto";
import { matchesDeclaredFileSignature } from "./document-file-signatures.js";
import { isPrivateDocumentKeyForDraft } from "./private-document-keys.js";
import { UPLOAD_CATEGORIES } from "./upload-policy.js";
import { uploadKindForSupportingDocument } from "./draft-document-upload-policy.js";
import { supportingDocumentCategorySchema } from "../../../packages/shared/src/supporting-documents.js";

// Storage adapter contract. No public URLs or applicant-supplied storage keys.
// A production adapter must enforce private access, server-side encryption,
// malware scanning and retention controls before upload can be enabled.
export interface PrivateDocumentStore {
  putQuarantined(input: {
    key: string;
    content: Buffer;
    mimeType: string;
  }): Promise<void>;
  readQuarantined(key: string): Promise<Buffer>;
  deleteQuarantined(key: string): Promise<void>;
}

export type PreparedDocument = {
  storageKey: string;
  sha256: string;
  byteSize: number;
  mimeType: string;
};

export async function storeQuarantinedDocument(
  store: PrivateDocumentStore,
  input: { draftId: string; storageKey: string; content: Buffer; mimeType: string },
): Promise<PreparedDocument> {
  if (!isPrivateDocumentKeyForDraft(input.storageKey, input.draftId))
    throw new Error("Kunci dokumen tidak sepadan dengan permohonan.");
  const category = input.storageKey.split("/")[2];
  const parsedCategory = supportingDocumentCategorySchema.parse(category);
  const policy = UPLOAD_CATEGORIES[uploadKindForSupportingDocument(parsedCategory)];
  if (!input.content.length || input.content.length > policy.ceilingMiB * 1024 * 1024)
    throw new Error("Saiz fail tidak dibenarkan.");
  if (!policy.mime.split(",").includes(input.mimeType))
    throw new Error("Jenis fail tidak dibenarkan bagi kategori dokumen.");
  if (!matchesDeclaredFileSignature(input.content, input.mimeType))
    throw new Error("Kandungan fail tidak sepadan dengan MIME.");
  const sha256 = createHash("sha256").update(input.content).digest("hex");
  await store.putQuarantined({
    key: input.storageKey,
    content: input.content,
    mimeType: input.mimeType,
  });
  return {
    storageKey: input.storageKey,
    sha256,
    byteSize: input.content.length,
    mimeType: input.mimeType,
  };
}

// Internal quarantine integrity check. Call only after authorization for the draft;
// never return quarantined bytes to an applicant or a public URL.
export async function readVerifiedQuarantinedDocument(
  store: PrivateDocumentStore,
  input: { draftId: string; storageKey: string; expectedSha256: string; expectedByteSize: number; expectedMimeType?: string },
): Promise<Buffer> {
  if (!isPrivateDocumentKeyForDraft(input.storageKey, input.draftId))
    throw new Error("Kunci dokumen tidak sepadan dengan permohonan.");
  const category = supportingDocumentCategorySchema.parse(input.storageKey.split("/")[2]);
  const policy = UPLOAD_CATEGORIES[uploadKindForSupportingDocument(category)];
  if (!/^[a-f0-9]{64}$/i.test(input.expectedSha256) ||
      !Number.isSafeInteger(input.expectedByteSize) || input.expectedByteSize < 1 ||
      input.expectedByteSize > policy.ceilingMiB * 1024 * 1024)
    throw new Error("Metadata integriti dokumen tidak sah.");
  if (input.expectedMimeType !== undefined &&
      !policy.mime.split(",").includes(input.expectedMimeType))
    throw new Error("Metadata MIME dokumen tidak sah.");
  const content = await store.readQuarantined(input.storageKey);
  // A storage adapter is a trust boundary: reject unexpected or oversized bytes
  // before computing a digest, even when the recorded metadata was valid.
  if (!Buffer.isBuffer(content) || content.length !== input.expectedByteSize ||
      content.length > policy.ceilingMiB * 1024 * 1024)
    throw new Error("Integriti dokumen kuarantin gagal.");
  const actual = createHash("sha256").update(content).digest();
  if (!timingSafeEqual(actual, Buffer.from(input.expectedSha256, "hex")))
    throw new Error("Integriti dokumen kuarantin gagal.");
  if (input.expectedMimeType !== undefined &&
      !matchesDeclaredFileSignature(content, input.expectedMimeType))
    throw new Error("Kandungan fail kuarantin tidak sepadan dengan MIME.");
  return content;
}

// Explicitly disabled until a private object store and scanner are configured.
export class DisabledDocumentStore implements PrivateDocumentStore {
  async putQuarantined(): Promise<void> {
    throw new Error("Storan dokumen belum diaktifkan.");
  }
  async readQuarantined(): Promise<Buffer> {
    throw new Error("Storan dokumen belum diaktifkan.");
  }
  async deleteQuarantined(): Promise<void> {
    throw new Error("Storan dokumen belum diaktifkan.");
  }
}
