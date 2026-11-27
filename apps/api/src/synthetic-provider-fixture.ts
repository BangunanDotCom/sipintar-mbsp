import { z } from "zod";

// Test transport fixtures for protocol acceptance. This module has no network
// client, real credentials, or configuration path into production workflows.
const providers = z.enum([
  "MBSPPAY",
  "AI_PRECHECK",
  "SIGNATURE",
  "SMTP",
  "GIS",
  "SSO",
]);
type Provider = z.infer<typeof providers>;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const identifier = z.uuid();
const contracts = {
  MBSPPAY: {
    request: z.strictObject({
      invoiceId: identifier,
      amountSen: z.number().int().positive().max(2147483647),
    }),
    response: z.strictObject({
      invoiceId: identifier,
      amountSen: z.number().int().positive().max(2147483647),
      currency: z.literal("MYR"),
      state: z.literal("SETTLED"),
    }),
  },
  AI_PRECHECK: {
    request: z.strictObject({ evidenceDigest: digest }),
    response: z.strictObject({
      evidenceDigest: digest,
      findings: z.array(z.string().max(120)).max(20),
      humanReviewRequired: z.literal(true),
    }),
  },
  SIGNATURE: {
    request: z.strictObject({ documentDigest: digest }),
    response: z.strictObject({
      documentDigest: digest,
      assurance: z.literal("SYNTHETIC"),
    }),
  },
  SMTP: {
    request: z.strictObject({
      messageId: identifier,
      recipient: z.email().endsWith("@example.test"),
    }),
    response: z.strictObject({
      messageId: identifier,
      state: z.literal("ACCEPTED"),
    }),
  },
  GIS: {
    request: z.strictObject({ pointId: identifier }),
    response: z.strictObject({
      pointId: identifier,
      district: z.enum(["SPU", "SPT", "SPS"]),
    }),
  },
  SSO: {
    request: z.strictObject({
      nonce: identifier,
      audience: z.literal("staylink-training"),
    }),
    response: z.strictObject({
      nonce: identifier,
      audience: z.literal("staylink-training"),
      issuer: z.literal("https://sso.example.test"),
      subject: identifier,
    }),
  },
} as const;
const requestEnvelope = z.strictObject({
  id: identifier,
  provider: providers,
  payload: z.unknown(),
});
const responseEnvelope = requestEnvelope;

type Transport = (
  request: z.infer<typeof requestEnvelope>,
  signal: AbortSignal,
) => Promise<unknown>;
type Result =
  | { status: "SUCCESS"; replay: boolean; data: unknown }
  | {
      status:
        | "DISABLED"
        | "INVALID"
        | "CONFLICT"
        | "BUSY"
        | "TIMEOUT"
        | "UNAVAILABLE"
        | "CAPACITY";
    };

export function syntheticProviderFixture(
  transport: Transport,
  options: {
    enabled: boolean;
    timeoutMs: number;
  },
) {
  const enabled = options.enabled && process.env.NODE_ENV === "test";
  if (
    !Number.isInteger(options.timeoutMs) ||
    options.timeoutMs < 1 ||
    options.timeoutMs > 1000
  )
    throw Error("Invalid synthetic provider timeout");

  const operations = new Map<
    string,
    { fingerprint: string; result?: unknown }
  >();
  return async (input: unknown): Promise<Result> => {
    if (!enabled) return { status: "DISABLED" };
    const envelope = requestEnvelope.safeParse(input);
    if (!envelope.success) return { status: "INVALID" };
    const { id, provider } = envelope.data;
    const contract = contracts[provider];
    const request = contract.request.safeParse(envelope.data.payload);
    if (!request.success) return { status: "INVALID" };

    const fingerprint = JSON.stringify([provider, request.data]);
    const existing = operations.get(id);
    if (existing) {
      if (existing.fingerprint !== fingerprint) return { status: "CONFLICT" };
      if (existing.result === undefined) return { status: "BUSY" };
      return {
        status: "SUCCESS",
        replay: true,
        data: structuredClone(existing.result),
      };
    }
    if (operations.size >= 128) return { status: "CAPACITY" };

    const operation: { fingerprint: string; result?: unknown } = {
      fingerprint,
    };
    operations.set(id, operation);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(Error("Fixture timed out"));
        }, options.timeoutMs);
      });
      const output = responseEnvelope.safeParse(
        await Promise.race([
          timeout,
          transport(
            { id, provider, payload: structuredClone(request.data) },
            controller.signal,
          ),
        ]),
      );
      if (
        !output.success ||
        output.data.id !== id ||
        output.data.provider !== provider
      )
        return { status: "INVALID" };
      const checked = contract.response.safeParse(output.data.payload);
      if (!checked.success) return { status: "INVALID" };
      const available = new Map(Object.entries(checked.data));
      // Request tuples that also appear in the response must agree exactly.
      if (
        Object.entries(request.data).some(
          ([key, value]) => available.has(key) && available.get(key) !== value,
        )
      )
        return { status: "INVALID" };
      operation.result = structuredClone(checked.data);
      return { status: "SUCCESS", replay: false, data: checked.data };
    } catch {
      return { status: controller.signal.aborted ? "TIMEOUT" : "UNAVAILABLE" };
    } finally {
      clearTimeout(timer);
      if (operation.result === undefined) operations.delete(id);
    }
  };
}

export function mockSyntheticProvider(
  provider: Provider,
  payload: Record<string, unknown>,
) {
  switch (provider) {
    case "MBSPPAY":
      return { ...payload, currency: "MYR", state: "SETTLED" };
    case "AI_PRECHECK":
      return {
        ...payload,
        findings: ["SYNTHETIC_REVIEW"],
        humanReviewRequired: true,
      };
    case "SIGNATURE":
      return { ...payload, assurance: "SYNTHETIC" };
    case "SMTP":
      return { messageId: payload.messageId, state: "ACCEPTED" };
    case "GIS":
      return { ...payload, district: "SPU" };
    case "SSO":
      return {
        ...payload,
        issuer: "https://sso.example.test",
        subject: "c585db61-b7e1-4c96-8a99-8332eee4c761",
      };
  }
}
