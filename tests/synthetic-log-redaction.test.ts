import { Writable } from "node:stream";
import Fastify from "fastify";
import { expect, it } from "vitest";
import { requestLogRedactions } from "../apps/api/src/app";

it("redacts session, CSRF, callback and request body fields when request data is logged", async () => {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      chunks.push(chunk.toString());
      done();
    },
  });
  const app = Fastify({ logger: { stream, redact: requestLogRedactions } });
  try {
    app.log.info(
      {
        req: {
          headers: {
            cookie: "fixture-cookie",
            authorization: "fixture-authorization",
            "x-csrf-token": "fixture-csrf",
            "x-staylink-synthetic-signature": "fixture-signature",
          },
          body: { content: "fixture-body" },
        },
        res: { headers: { "set-cookie": "fixture-set-cookie" } },
      },
      "test-redacted",
    );
    expect(chunks.join("")).toContain("test-redacted");
    expect(chunks.join("")).not.toMatch(
      /fixture-(cookie|authorization|csrf|signature|body|set-cookie)/,
    );
  } finally {
    await app.close();
  }
});
