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
      // Enforce a wall-clock deadline as well as socket inactivity timeout.
      // A daemon sending a byte periodically must not keep a scan open forever.
      let deadline: ReturnType<typeof setTimeout> | undefined;
      const finish = (error?: Error, result?: MalwareScanResult) => {
        if (settled) return;
        settled = true;
        if (deadline) clearTimeout(deadline);
        socket.destroy();
        if (error) reject(error);
        else if (result) resolve(result);
        else reject(new Error("Tiada keputusan imbasan."));
      };
      deadline = setTimeout(() => finish(new Error("Pengimbas ClamAV tamat masa.")), this.timeoutMs);
      socket.setTimeout(this.timeoutMs, () => finish(new Error("Pengimbas ClamAV tamat masa.")));
      socket.on("error", (error) => finish(error));
      socket.on("connect", () => {
        // Respect socket backpressure; do not queue the entire upload in memory.
        let offset = 0;
        let phase: "command" | "length" | "chunk" | "end" | "done" = "command";
        let chunk = Buffer.alloc(0);
        const pump = () => {
          while (!settled && phase !== "done") {
            let frame: Buffer;
            if (phase === "command") {
              frame = Buffer.from("zINSTREAM\0");
              phase = "length";
            } else if (phase === "length") {
              if (offset >= bytes.length) {
                phase = "end";
                continue;
              }
              chunk = bytes.subarray(offset, Math.min(offset + 65536, bytes.length));
              frame = Buffer.alloc(4);
              frame.writeUInt32BE(chunk.length);
              phase = "chunk";
            } else if (phase === "chunk") {
              frame = chunk;
              offset += chunk.length;
              phase = "length";
            } else {
              frame = Buffer.alloc(4);
              phase = "done";
            }
            if (!socket.write(frame)) return;
          }
        };
        socket.on("drain", pump);
        pump();
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
