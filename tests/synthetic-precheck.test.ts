import { expect, it } from "vitest";
import {
  configuredPrecheckProvider,
  runSyntheticPrecheck,
} from "../apps/api/src/synthetic-precheck";
import { draftInactivity } from "../packages/shared/src/draft-inactivity";

it("uses a safe metadata-only provider and falls back without leaking provider errors", async () => {
  const facts = {
    units: 1,
    floors: 2,
    expectedEvidence: 2,
    cleanEvidence: 1,
    unverifiedEvidence: 1,
  };
  expect(
    await runSyntheticPrecheck(
      configuredPrecheckProvider("synthetic-rules"),
      facts,
    ),
  ).toMatchObject({
    source: "SYNTHETIC_RULES",
    findings: ["EVIDENCE_INELIGIBLE", "EVIDENCE_UNVERIFIED"],
  });
  const disabled = await runSyntheticPrecheck(
    configuredPrecheckProvider("external"),
    facts,
  );
  expect(disabled.source).toBe("MANUAL_REQUIRED");
  expect(
    await runSyntheticPrecheck(
      {
        async run() {
          throw new Error("private");
        },
      },
      facts,
    ),
  ).toEqual(disabled);
});

it("flags only at the exact 60-day boundary", () => {
  const previous = new Date("2026-01-01T00:00:00.000Z");
  expect(
    draftInactivity(previous, new Date("2026-03-01T23:59:59.999Z")).reviewDue,
  ).toBe(false);
  expect(
    draftInactivity(previous, new Date("2026-03-02T00:00:00.000Z")),
  ).toEqual({
    reviewAt: "2026-03-02T00:00:00.000Z",
    reviewDue: true,
  });
});

it("falls back when a provider never resolves", async () => {
  const facts = {
    units: 1,
    floors: 1,
    expectedEvidence: 1,
    cleanEvidence: 1,
    unverifiedEvidence: 0,
  };
  let aborted = false;
  const result = await runSyntheticPrecheck(
    {
      run(_facts, signal) {
        signal.addEventListener("abort", () => {
          aborted = true;
        });
        return new Promise(() => {});
      },
    },
    facts,
  );
  expect(result.source).toBe("MANUAL_REQUIRED");
  expect(aborted).toBe(true);
});
