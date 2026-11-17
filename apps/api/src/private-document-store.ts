import { createHash } from "node:crypto";
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
  const pdf = input.content.subarray(0, 5).toString("ascii") === "%PDF-";
  const jpeg = input.content.length >= 4 && input.content[0] === 0xff &&
    input.content[1] === 0xd8 && input.content[2] === 0xff &&
    input.content[input.content.length - 2] === 0xff &&
    input.content[input.content.length - 1] === 0xd9;
  const png = input.content.length >= 24 &&
    input.content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    input.content.subarray(12, 16).toString("ascii") === "IHDR";
  if (!(input.mimeType === "application/pdf" && pdf ||
    input.mimeType === "image/jpeg" && jpeg ||
    input.mimeType === "image/png" && png))
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
