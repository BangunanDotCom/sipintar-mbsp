import { connect } from "node:net";
import type { DocumentMalwareScanner, MalwareScanResult } from "./document-malware-scanner.js";

// clamd INSTREAM protocol over private TCP only. No shell or file paths.
// Deployment must restrict CLAMD_HOST to a trusted internal network.
export class ClamAvScanner implements DocumentMalwareScanner {
  constructor(
    private readonly host: string,
    private readonly port = 3310,
    private readonly timeoutMs = 30000,
  ) {
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535 ||
        !Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000)
      throw new Error("Konfigurasi pengimbas ClamAV tidak sah.");
  }
  scan(bytes: Buffer): Promise<MalwareScanResult> {
    if (!bytes.length || bytes.length > 100 * 1024 * 1024)
      return Promise.reject(new Error("Saiz imbasan tidak dibenarkan."));
    return new Promise((resolve, reject) => {
      const socket = connect({ host: this.host, port: this.port });
      let response = "";
      let settled = false;
      const finish = (error?: Error, result?: MalwareScanResult) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (error) reject(error);
        else if (result) resolve(result);
        else reject(new Error("Tiada keputusan imbasan."));
      };
      socket.setTimeout(this.timeoutMs, () => finish(new Error("Pengimbas ClamAV tamat masa.")));
      socket.on("error", (error) => finish(error));
      socket.on("connect", () => {
        // zINSTREAM uses a NUL-terminated command and length-prefixed chunks.
        socket.write(Buffer.from("zINSTREAM\0"));
        for (let offset = 0; offset < bytes.length; offset += 65536) {
          const chunk = bytes.subarray(offset, Math.min(offset + 65536, bytes.length));
          const length = Buffer.alloc(4);
          length.writeUInt32BE(chunk.length);
          socket.write(length);
          socket.write(chunk);
        }
        // Zero-length chunk ends INSTREAM; keep TCP writable until the reply arrives.
        socket.write(Buffer.alloc(4));
      });
      socket.on("data", (data: Buffer) => {
        response += data.toString("utf8");
        if (response.length > 4096) {
          finish(new Error("Respons pengimbas terlalu panjang."));
          return;
        }
        const terminator = response.indexOf("\0");
        if (terminator === -1 && !response.includes("\n")) return;
        const line = response.slice(0, terminator === -1 ? response.indexOf("\n") : terminator).trim();
        if (/^stream: OK$/.test(line)) finish(undefined, { status: "CLEAN", engine: "ClamAV" });
        else if (/^stream: .+ FOUND$/.test(line)) finish(undefined, { status: "INFECTED", engine: "ClamAV" });
        else finish(new Error("Pengimbas ClamAV memulangkan keputusan tidak sah."));
      });
      socket.on("close", () => {
        if (!settled) finish(new Error("Sambungan ClamAV ditutup tanpa keputusan."));
      });
    });
  }
}
