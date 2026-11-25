import { expect, it } from "vitest";
import {
  applyCompletion,
  completionState,
  noTechnicalComment,
  sixMonthLimit,
  type CompletionCommand,
  type CompletionRole,
} from "../packages/shared/src/synthetic-completion";
import { completionConfig } from "../apps/api/src/synthetic-portal-completion";

const now = Date.UTC(2026, 7, 31, 12);
const unitId = "9a9bf093-e801-4135-a615-cc6ee6f89f02";
const floorId = "a78c8455-e65f-4c0b-afff-21f25d270bf1";
const scopes = [{ unitId, floorId }];
const day = 86_400_000;
function engine() {
  let state = completionState();
  return {
    apply(
      command: CompletionCommand,
      role: CompletionRole,
      time = now,
      firstPaid = true,
    ) {
      state = applyCompletion(state, command, {
        scopes,
        role,
        actorId: role,
        now: time,
        feeSen: null,
        firstPaid,
      }).state;
      return state;
    },
  };
}

it("records absence after seven calendar days without overwriting the paper when a late response arrives", () => {
  const flow = engine();
  expect(() =>
    flow.apply({ action: "REFER" }, "PIC_KAWASAN", now, false),
  ).toThrow("Bayaran");
  flow.apply({ action: "REFER" }, "PIC_KAWASAN");
  const paper = { action: "SUBMIT_PAPER", summary: "KP selepas SLA" } as const;
  expect(() => flow.apply(paper, "PIC_KAWASAN", now + 7 * day - 1)).toThrow(
    "belum sedia",
  );
  expect(
    flow.apply(paper, "PIC_KAWASAN", now + 7 * day).papers[0].comments[0].text,
  ).toBe(noTechnicalComment);
  const late = flow.apply(
    { action: "COMMENT", general: "Ulasan diterima kemudian", details: [] },
    "PERANCANG_BANDAR",
    now + 8 * day,
  );
  expect(late.papers[0].comments[0].text).toBe(noTechnicalComment);
  expect(late.referral?.comments.PERANCANG_BANDAR?.general).toBe(
    "Ulasan diterima kemudian",
  );
});

it("caps total conditional approval at six Malaysian calendar months across reconsideration", () => {
  const flow = engine();
  flow.apply({ action: "REFER" }, "PIC_KAWASAN");
  flow.apply(
    { action: "SUBMIT_PAPER", summary: "KP lengkap" },
    "PIC_KAWASAN",
    now + 7 * day,
  );
  const first = now + 7 * day;
  const end = sixMonthLimit(first);
  const next = {
    action: "DECIDE",
    decisions: [
      {
        unitId,
        floorId,
        reason: "Syarat latihan",
        outcome: "SKB",
        conditionUntil: end,
      },
    ],
  } as const;
  const decide = (conditionUntil: string, time: number) =>
    flow.apply(
      { ...next, decisions: [{ ...next.decisions[0], conditionUntil }] },
      "URUS_SETIA_JK",
      time,
    );
  expect(() => decide("2027-05-01", first)).toThrow("enam bulan");
  expect(decide(end, first).decisions[0].firstConditionAt).toBe(first);
  flow.apply({ action: "SIGN" }, "PEGAWAI_PENANDATANGAN", first);
  flow.apply(
    { action: "RESPOND", note: "Jawapan latihan" },
    "PEMOHON",
    first + day,
  );
  flow.apply({ action: "CHECK_RESPONSE" }, "PIC_KAWASAN", first + day);
  flow.apply({ action: "ALLOW_RECONSIDERATION" }, "PPSK", first + day);
  flow.apply(
    { action: "SUBMIT_PAPER", summary: "KP susulan" },
    "PIC_KAWASAN",
    first + day,
  );
  expect(() => decide("2027-05-01", first + day)).toThrow("enam bulan");
  expect(decide(end, first + day).decisions[0].firstConditionAt).toBe(first);
  expect(sixMonthLimit(now)).toBe("2027-02-28");
});

it("keeps completion unavailable in production and rejects missing distinct role assignments", () => {
  expect(
    completionConfig({
      NODE_ENV: "production",
      STAYLINK_SYNTHETIC_COMPLETION: "true",
    }),
  ).toBeNull();
  expect(completionConfig({ NODE_ENV: "test" })).toBeNull();
  expect(() =>
    completionConfig({
      NODE_ENV: "test",
      STAYLINK_SYNTHETIC_COMPLETION: "true",
    }),
  ).toThrow("pelantikan");
});

it("records the JK follow-up date and flags a late response without changing the decision", () => {
  const flow = engine();
  flow.apply({ action: "REFER" }, "PIC_KAWASAN");
  const meeting = now + 7 * day;
  flow.apply(
    { action: "SUBMIT_PAPER", summary: "KP latihan" },
    "PIC_KAWASAN",
    meeting,
  );
  const decision = {
    unitId,
    floorId,
    reason: "Perlu maklumat susulan",
    outcome: "TANGGUH" as const,
  };
  expect(() =>
    flow.apply(
      {
        action: "DECIDE",
        decisions: [
          {
            ...decision,
            followUpBy: "2026-09-06",
          },
        ],
      },
      "URUS_SETIA_JK",
      meeting,
    ),
  ).toThrow("Tarikh susulan");
  flow.apply(
    {
      action: "DECIDE",
      decisions: [
        {
          ...decision,
          followUpBy: "2026-09-08",
        },
      ],
    },
    "URUS_SETIA_JK",
    meeting,
  );
  const signed = flow.apply(
    { action: "SIGN" },
    "PEGAWAI_PENANDATANGAN",
    meeting,
  );
  expect(signed.letters[0].decisions[0].followUpBy).toBe("2026-09-08");
  const late = flow.apply(
    { action: "RESPOND", note: "Jawapan lewat untuk semakan" },
    "PEMOHON",
    meeting + 2 * day,
  );
  expect(late.response?.lateScopes).toEqual(scopes);
  expect(late.response?.allowed).toBe(false);
  expect(late.decisions[0].outcome).toBe("TANGGUH");
  expect(late.closed).toBe(false);
});
