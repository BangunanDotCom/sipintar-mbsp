import { DisabledDocumentStore, type PrivateDocumentStore } from "./private-document-store.js";
import { LocalQuarantineDocumentStore } from "./local-quarantine-document-store.js";

// Fail closed by default. Local storage is only available for explicit test/dev use.
// This function must never silently choose local disk in production.
export function configuredDocumentStore(
  env: NodeJS.ProcessEnv = process.env,
): PrivateDocumentStore {
  const mode = env.STAYLINK_DOCUMENT_STORE ?? "disabled";
  if (mode === "disabled") return new DisabledDocumentStore();
  if (mode !== "local") throw new Error("Jenis storan dokumen tidak disokong.");
  // Explicit allowlist: an unset, misspelled or unexpected environment must fail closed.
  if (env.NODE_ENV !== "development" && env.NODE_ENV !== "test")
    throw new Error("Storan dokumen setempat hanya dibenarkan untuk pembangunan atau ujian.");
  if (env.STAYLINK_LOCAL_DOCUMENT_STORE_ENABLED !== "true")
    throw new Error("Storan dokumen setempat memerlukan pengaktifan khusus.");
  const root = env.STAYLINK_LOCAL_DOCUMENT_ROOT;
  if (!root || !root.trim())
    throw new Error("STAYLINK_LOCAL_DOCUMENT_ROOT wajib ditetapkan.");
  return new LocalQuarantineDocumentStore(root);
}
