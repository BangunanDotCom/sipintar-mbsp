import { describe, expect, it } from "vitest";
import { documentChecklistRows, isDocumentStatusRecord } from "../packages/shared/src/document-checklist-status.js";

const doc = (version: number, scanStatus: string, verificationStatus: string, supersededAt: string | null = null) => ({
  category: "premises_plan", version, fileName: `plan-v${version}.pdf`,
  scanStatus, verificationStatus, supersededAt,
});
const state = (documents: ReturnType<typeof doc>[]) =>
  documentChecklistRows("INDIVIDUAL", documents).find((row) => row.category === "premises_plan");

describe("document checklist statuses", () => {
  it("rejects malformed API document records", () => {
    expect(isDocumentStatusRecord(doc(1, "CLEAN", "VERIFIED"))).toBe(true);
    expect(isDocumentStatusRecord(null)).toBe(false);
    expect(isDocumentStatusRecord({ ...doc(1, "CLEAN", "VERIFIED"), scanStatus: null })).toBe(false);
    expect(isDocumentStatusRecord({ ...doc(1, "CLEAN", "VERIFIED"), version: "1" })).toBe(false);
    expect(isDocumentStatusRecord({ ...doc(1, "CLEAN", "VERIFIED"), supersededAt: false })).toBe(false);
    expect(isDocumentStatusRecord({ ...doc(1, "CLEAN", "VERIFIED"), category: "  " })).toBe(false);
    expect(isDocumentStatusRecord({ ...doc(1, "CLEAN", "VERIFIED"), fileName: "" })).toBe(false);
    expect(isDocumentStatusRecord({ ...doc(1, "CLEAN", "VERIFIED"), scanStatus: " " })).toBe(false);
    expect(isDocumentStatusRecord({ ...doc(1, "CLEAN", "VERIFIED"), verificationStatus: "" })).toBe(false);
  });
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
  it("fails closed on unknown or malformed scan statuses", () => {
    expect(state([doc(1, "UNKNOWN", "VERIFIED")])?.state).toBe("UNSAFE");
    expect(state([doc(1, "", "VERIFIED")])?.state).toBe("UNSAFE");
    expect(state([doc(1, "clean", "VERIFIED")])?.state).toBe("UNSAFE");
    expect(state([doc(1, "SCANNING", "VERIFIED")])?.state).toBe("PENDING_SCAN");
  });
  it("distinguishes clean but unverified and rejected records", () => {
    expect(state([doc(1, "CLEAN", "UNVERIFIED")])?.state).toBe("PENDING_REVIEW");
    expect(state([doc(1, "CLEAN", "REJECTED")])?.state).toBe("REJECTED");
  });
  it("requires both clean scan and officer verification", () => {
    expect(state([doc(1, "CLEAN", "VERIFIED")])?.state).toBe("VERIFIED");
  });
  it("selects latest active version but flags an older active version as a conflict", () => {
    const row = state([doc(1, "CLEAN", "VERIFIED"), doc(2, "PENDING", "UNVERIFIED")]);
    expect(row?.current?.version).toBe(2);
    expect(row?.state).toBe("CONFLICT");
    const superseded = state([doc(1, "CLEAN", "VERIFIED", "2026-11-17T00:00:00Z")]);
    expect(superseded?.state).toBe("MISSING");
  });
  it("does not treat duplicate active versions as verified", () => {
    const row = state([doc(2, "CLEAN", "VERIFIED"), doc(2, "CLEAN", "VERIFIED")]);
    expect(row?.state).toBe("CONFLICT");
  });
  it("fails closed when different versions remain active simultaneously", () => {
    const row = state([doc(1, "CLEAN", "VERIFIED"), doc(2, "CLEAN", "VERIFIED")]);
    expect(row?.current?.version).toBe(2);
    expect(row?.state).toBe("CONFLICT");
  });
  it("accepts a verified replacement after the previous version is superseded", () => {
    const row = state([
      doc(1, "CLEAN", "VERIFIED", "2026-11-17T00:00:00Z"),
      doc(2, "CLEAN", "VERIFIED"),
    ]);
    expect(row?.current?.version).toBe(2);
    expect(row?.state).toBe("VERIFIED");
  });
  it("ignores invalid version numbers and superseded records", () => {
    expect(state([doc(0, "CLEAN", "VERIFIED")])?.state).toBe("MISSING");
    expect(state([doc(-1, "CLEAN", "VERIFIED")])?.state).toBe("MISSING");
    expect(state([doc(1.5, "CLEAN", "VERIFIED")])?.state).toBe("MISSING");
    expect(state([doc(1, "CLEAN", "VERIFIED", "2026-11-17T00:00:00Z")])?.state).toBe("MISSING");
  });
  it("hides company authority category for individual applicants", () => {
    expect(documentChecklistRows("INDIVIDUAL", []).some((row) => row.category === "company_authority")).toBe(false);
    expect(documentChecklistRows("COMPANY", []).some((row) => row.category === "company_authority")).toBe(true);
  });
});
