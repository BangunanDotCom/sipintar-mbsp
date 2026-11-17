import { describe, expect, it } from "vitest";
import { documentChecklistRows } from "../packages/shared/src/document-checklist-status.js";

const doc = (version: number, scanStatus: string, verificationStatus: string, supersededAt: string | null = null) => ({
  category: "premises_plan", version, fileName: `plan-v${version}.pdf`,
  scanStatus, verificationStatus, supersededAt,
});
const state = (documents: ReturnType<typeof doc>[]) =>
  documentChecklistRows("INDIVIDUAL", documents).find((row) => row.category === "premises_plan");

describe("document checklist statuses", () => {
  it("shows missing documents as missing", () => {
    expect(state([])?.state).toBe("MISSING");
  });
  it("does not accept officer VERIFIED when malware scan is pending", () => {
    expect(state([doc(1, "PENDING", "VERIFIED")])?.state).toBe("PENDING_SCAN");
  });
  it("fails closed on infected or failed scan", () => {
    expect(state([doc(1, "INFECTED", "VERIFIED")])?.state).toBe("UNSAFE");
    expect(state([doc(1, "FAILED", "VERIFIED")])?.state).toBe("UNSAFE");
  });
  it("distinguishes clean but unverified and rejected records", () => {
    expect(state([doc(1, "CLEAN", "UNVERIFIED")])?.state).toBe("PENDING_REVIEW");
    expect(state([doc(1, "CLEAN", "REJECTED")])?.state).toBe("REJECTED");
  });
  it("requires both clean scan and officer verification", () => {
    expect(state([doc(1, "CLEAN", "VERIFIED")])?.state).toBe("VERIFIED");
  });
  it("selects latest non-superseded version", () => {
    const row = state([doc(1, "CLEAN", "VERIFIED"), doc(2, "PENDING", "UNVERIFIED")]);
    expect(row?.current?.version).toBe(2);
    expect(row?.state).toBe("PENDING_SCAN");
    const superseded = state([doc(1, "CLEAN", "VERIFIED", "2026-11-17T00:00:00Z")]);
    expect(superseded?.state).toBe("MISSING");
  });
  it("hides company authority category for individual applicants", () => {
    expect(documentChecklistRows("INDIVIDUAL", []).some((row) => row.category === "company_authority")).toBe(false);
    expect(documentChecklistRows("COMPANY", []).some((row) => row.category === "company_authority")).toBe(true);
  });
});
