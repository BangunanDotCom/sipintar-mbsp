import { createServer, type Server } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { ClamAvScanner } from "../apps/api/src/clamav-scanner.js";

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) =>
    new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("ClamAV INSTREAM framing regression", () => {
  it("sends the exact NUL-terminated command and 64KiB length-prefixed frames", async () => {
    const bytes = Buffer.alloc(150000, 0x41);
    let observedLengths: number[] = [];
    let observedTrailingBytes = -1;
    const server = createServer((socket) => {
      let received = Buffer.alloc(0);
      socket.on("data", (part: Buffer) => {
        received = Buffer.concat([received, part]);
        const header = Buffer.from("zINSTREAM\0");
        if (received.length < header.length) return;
        if (!received.subarray(0, header.length).equals(header)) {
          socket.end("stream: invalid ERROR\0");
          return;
        }
        let offset = header.length;
        const lengths: number[] = [];
        while (received.length >= offset + 4) {
          const length = received.readUInt32BE(offset);
          if (received.length < offset + 4 + length) return;
          lengths.push(length);
          offset += 4 + length;
          if (length === 0) {
            observedLengths = lengths;
            observedTrailingBytes = received.length - offset;
            socket.end("stream: OK\0");
            return;
          }
        }
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test port");
    await expect(new ClamAvScanner("127.0.0.1", address.port, 3000).scan(bytes))
      .resolves.toEqual({ status: "CLEAN", engine: "ClamAV" });
    expect(observedLengths).toEqual([65536, 65536, 18928, 0]);
    expect(observedTrailingBytes).toBe(0);
  });
});
