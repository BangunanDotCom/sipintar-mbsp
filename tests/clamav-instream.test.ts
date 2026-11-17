import { createServer, type Server } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { ClamAvScanner } from "../apps/api/src/clamav-scanner.js";

const servers: Server[] = [];
async function mockClamd(reply: string) {
  const server = createServer((socket) => {
    let received = Buffer.alloc(0);
    socket.on("data", (chunk: Buffer) => {
      received = Buffer.concat([received, chunk]);
      const header = Buffer.from("zINSTREAM\0");
      if (received.length < header.length + 4 || !received.subarray(0, header.length).equals(header))
        return;
      let offset = header.length;
      while (received.length >= offset + 4) {
        const size = received.readUInt32BE(offset);
        if (received.length < offset + 4 + size) return;
        offset += 4 + size;
        if (size === 0) {
          socket.write(reply + "\0");
          socket.end();
          return;
        }
      }
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  return address.port;
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) =>
    new Promise<void>((resolve) => server.close(() => resolve()))));
});
describe("ClamAV INSTREAM TCP protocol", () => {
  it("handles clean response from mock clamd", async () => {
    const port = await mockClamd("stream: OK");
    await expect(new ClamAvScanner("127.0.0.1", port, 2000).scan(
      Buffer.from("%PDF-1.7\nmock"),
    )).resolves.toEqual({ status: "CLEAN", engine: "ClamAV" });
  });
  it("does not turn a FOUND result into CLEAN", async () => {
    const port = await mockClamd("stream: Eicar-Test-Signature FOUND");
    await expect(new ClamAvScanner("127.0.0.1", port, 2000).scan(
      Buffer.from("malicious test"),
    )).resolves.toEqual({ status: "INFECTED", engine: "ClamAV" });
  });
  it("enforces a total deadline when the daemon trickles bytes", async () => {
    const server = createServer((socket) => {
      socket.on("data", () => undefined);
      const interval = setInterval(() => {
        if (!socket.destroyed) socket.write(" ");
      }, 100);
      socket.on("close", () => clearInterval(interval));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No test port");
    const started = Date.now();
    await expect(new ClamAvScanner("127.0.0.1", address.port, 1000)
      .scan(Buffer.from("test"))).rejects.toThrow("tamat masa");
    expect(Date.now() - started).toBeLessThan(2500);
  });
  it("fails closed when daemon reports an error", async () => {
    const port = await mockClamd("stream: INSTREAM size limit exceeded. ERROR");
    await expect(new ClamAvScanner("127.0.0.1", port, 2000).scan(
      Buffer.from("test"),
    )).rejects.toThrow("tidak sah");
  });
});
