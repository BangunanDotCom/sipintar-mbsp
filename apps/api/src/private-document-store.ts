import { createHash } from "node:crypto";
import { isPrivateDocumentKeyForDraft } from "./private-document-keys.js";

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
  if (!input.content.length || input.content.length > 100 * 1024 * 1024)
    throw new Error("Saiz fail tidak dibenarkan.");
  if (!["application/pdf", "image/jpeg", "image/png"].includes(input.mimeType))
    throw new Error("Jenis fail tidak dibenarkan.");
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
