import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { isPrivateDocumentKeyForDraft } from "./private-document-keys.js";
import type { PrivateDocumentStore } from "./private-document-store.js";

// Local development/test adapter only. Do not use as production object storage.
// Each key is server-generated, draft-scoped and contains only UUID segments.
export class LocalQuarantineDocumentStore implements PrivateDocumentStore {
  private readonly root: string;
  constructor(rootDirectory: string) {
    if (!rootDirectory.trim()) throw new Error("Direktori kuarantin tidak sah.");
    this.root = resolve(rootDirectory);
  }

  private location(key: string): string {
    const parts = key.split("/");
    if (parts.length !== 4 || !isPrivateDocumentKeyForDraft(key, parts[1]))
      throw new Error("Kunci storan kuarantin tidak sah.");
    const location = resolve(this.root, ...parts);
    if (!location.startsWith(this.root + sep))
      throw new Error("Laluan storan di luar direktori kuarantin.");
    return location;
  }

  async putQuarantined(input: { key: string; content: Buffer; mimeType: string }): Promise<void> {
    const location = this.location(input.key);
    if (!input.content.length) throw new Error("Fail kuarantin kosong.");
    await mkdir(join(location, ".."), { recursive: true, mode: 0o700 });
    // Exclusive create: never overwrite an existing quarantine object.
    const handle = await open(location, "wx", 0o600);
    try {
      await handle.writeFile(input.content);
      await handle.sync();
    } catch (error) {
      await handle.close();
      await unlink(location).catch(() => undefined);
      throw error;
    }
    await handle.close();
  }

  async readQuarantined(key: string): Promise<Buffer> {
    const location = this.location(key);
    const handle = await open(location, "r");
    try {
      return await handle.readFile();
    } finally {
      await handle.close();
    }
  }

  async deleteQuarantined(key: string): Promise<void> {
    await unlink(this.location(key));
  }
}
