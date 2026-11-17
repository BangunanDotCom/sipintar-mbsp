import { mkdir, open, lstat, realpath, unlink } from "node:fs/promises";
import { constants } from "node:fs";
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

  private async assertSafeParents(location: string): Promise<void> {
    const root = await realpath(this.root);
    if (root !== this.root) throw new Error("Direktori kuarantin tidak boleh menggunakan symlink.");
    const parent = await realpath(join(location, ".."));
    if (!parent.startsWith(root + sep))
      throw new Error("Laluan kuarantin tidak selamat.");
    const stat = await lstat(parent);
    if (!stat.isDirectory()) throw new Error("Direktori kuarantin tidak sah.");
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
    await this.assertSafeParents(location);
    const handle = await open(location, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
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
    await this.assertSafeParents(location);
    const handle = await open(location, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      return await handle.readFile();
    } finally {
      await handle.close();
    }
  }

  async deleteQuarantined(key: string): Promise<void> {
    const location = this.location(key);
    await this.assertSafeParents(location);
    const stat = await lstat(location);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Objek kuarantin tidak sah.");
    await unlink(location);
  }
}
