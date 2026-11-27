import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  mockSyntheticProvider,
  syntheticProviderFixture,
} from "../apps/api/src/synthetic-provider-fixture";

const hash = "a".repeat(64);
const requestCases = [
  [
    "MBSPPAY",
    { invoiceId: randomUUID(), amountSen: 5000 },
    { currency: "MYR" },
  ],
  ["AI_PRECHECK", { evidenceDigest: hash }, { humanReviewRequired: true }],
  ["SIGNATURE", { documentDigest: hash }, { assurance: "SYNTHETIC" }],
  [
    "SMTP",
    { messageId: randomUUID(), recipient: "training@example.test" },
    { state: "ACCEPTED" },
  ],
  ["GIS", { pointId: randomUUID() }, { district: "SPU" }],
  [
    "SSO",
    { nonce: randomUUID(), audience: "staylink-training" },
    { issuer: "https://sso.example.test" },
  ],
] as const;

it.each(requestCases)(
  "validates and replays %s without repeating the transport",
  async (provider, payload, outcome) => {
    const input = { id: randomUUID(), provider, payload };
    const transport = vi.fn(async () => ({
      ...input,
      payload: mockSyntheticProvider(provider, payload),
    }));
    const run = syntheticProviderFixture(transport, {
      enabled: true,
      timeoutMs: 100,
    });
    expect(await run(input)).toMatchObject({
      status: "SUCCESS",
      replay: false,
      data: outcome,
    });
    expect(await run(input)).toMatchObject({
      status: "SUCCESS",
      replay: true,
      data: outcome,
    });
    expect(transport).toHaveBeenCalledTimes(1);
  },
);

it("rejects malformed and mismatched responses, supports retry and prevents changed replay", async () => {
  const id = randomUUID();
  const payload = { invoiceId: randomUUID(), amountSen: 5000 };
  const input = { id, provider: "MBSPPAY", payload };
  const transport = vi
    .fn()
    .mockResolvedValueOnce({
      ...input,
      payload: { ...payload, state: "SUCCESS" },
    })
    .mockResolvedValueOnce({
      ...input,
      payload: {
        ...mockSyntheticProvider("MBSPPAY", payload),
        amountSen: 5001,
      },
    })
    .mockRejectedValueOnce(Error("Fixture temporarily unavailable"))
    .mockResolvedValue({
      ...input,
      payload: mockSyntheticProvider("MBSPPAY", payload),
    });
  const run = syntheticProviderFixture(transport, {
    enabled: true,
    timeoutMs: 100,
  });
  expect(await run(input)).toEqual({ status: "INVALID" });
  expect(await run(input)).toEqual({ status: "INVALID" });
  expect(await run(input)).toEqual({ status: "UNAVAILABLE" });
  expect(await run(input)).toMatchObject({ status: "SUCCESS", replay: false });
  expect(
    await run({ ...input, payload: { ...payload, amountSen: 10000 } }),
  ).toEqual({ status: "CONFLICT" });
  expect(transport).toHaveBeenCalledTimes(4);
});

it("times out and aborts a fixture, rejects concurrent replay, and permits recovery", async () => {
  const input = {
    id: randomUUID(),
    provider: "GIS",
    payload: { pointId: randomUUID() },
  };
  let signal: AbortSignal | undefined;
  const fixture = syntheticProviderFixture(
    vi
      .fn()
      .mockImplementationOnce((_request, current) => {
        signal = current;
        return new Promise(() => undefined);
      })
      .mockResolvedValue({
        ...input,
        payload: mockSyntheticProvider("GIS", input.payload),
      }),
    { enabled: true, timeoutMs: 20 },
  );
  const waiting = fixture(input);
  expect(await fixture(input)).toEqual({ status: "BUSY" });
  expect(await waiting).toEqual({ status: "TIMEOUT" });
  expect(signal?.aborted).toBe(true);
  expect(await fixture(input)).toMatchObject({
    status: "SUCCESS",
    replay: false,
  });
});

it("fails closed outside test mode and rejects external recipients", async () => {
  const transport = vi.fn();
  const input = {
    id: randomUUID(),
    provider: "SMTP",
    payload: { messageId: randomUUID(), recipient: "outside@example.com" },
  };
  vi.stubEnv("NODE_ENV", "production");
  try {
    expect(
      await syntheticProviderFixture(transport, {
        enabled: true,
        timeoutMs: 50,
      })(input),
    ).toEqual({ status: "DISABLED" });
  } finally {
    vi.unstubAllEnvs();
  }
  expect(
    await syntheticProviderFixture(transport, {
      enabled: false,
      timeoutMs: 50,
    })(input),
  ).toEqual({ status: "DISABLED" });
  expect(
    await syntheticProviderFixture(transport, { enabled: true, timeoutMs: 50 })(
      input,
    ),
  ).toEqual({ status: "INVALID" });
  expect(transport).not.toHaveBeenCalled();
});
