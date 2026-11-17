import { describe, expect, it } from "vitest";
import { documentChecklistRows, isDocumentStatusRecord, isDocumentUploadPolicy, unambiguousDocumentUploadPolicies, validatedDocumentResponse } from "../packages/shared/src/document-checklist-status.js";

const doc = (version: number, scanStatus: string, verificationStatus: string, supersededAt: string | null = null) => ({
  category: "premises_plan", version, fileName: `plan-v${version}.pdf`,
  scanStatus, verificationStatus, supersededAt,
});
const state = (documents: ReturnType<typeof doc>[]) =>
  documentChecklistRows("INDIVIDUAL", documents).find((row) => row.category === "premises_plan");

describe("document checklist statuses", () => {
  it("validates upload policy rows before displaying file guidance", () => {
    const policy = {
      category: "premises_plan", label: "Pelan premis",
      mimeTypes: ["application/pdf"], defaultMaxMiB: 10, hardCeilingMiB: 25,
    };
    expect(isDocumentUploadPolicy(policy)).toBe(true);
    expect(isDocumentUploadPolicy(null)).toBe(false);
    expect(isDocumentUploadPolicy({ ...policy, mimeTypes: [] })).toBe(false);
    expect(isDocumentUploadPolicy({ ...policy, mimeTypes: [null] })).toBe(false);
    expect(isDocumentUploadPolicy({ ...policy, label: "  " })).toBe(false);
    expect(isDocumentUploadPolicy({ ...policy, category: " premises_plan " })).toBe(false);
    expect(isDocumentUploadPolicy({ ...policy, defaultMaxMiB: Infinity })).toBe(false);
    expect(isDocumentUploadPolicy({ ...policy, hardCeilingMiB: 5 })).toBe(false);
  });
  it("does not select an arbitrary policy when duplicate categories conflict", () => {
    const policy = {
      category: "premises_plan", label: "Pelan premis",
      mimeTypes: ["application/pdf"], defaultMaxMiB: 10, hardCeilingMiB: 25,
    };
    expect(unambiguousDocumentUploadPolicies(null)).toEqual([]);
    expect(unambiguousDocumentUploadPolicies([policy])).toEqual([policy]);
    expect(unambiguousDocumentUploadPolicies([
      policy, { ...policy, defaultMaxMiB: 5 },
    ])).toEqual([]);
    expect(unambiguousDocumentUploadPolicies([
      policy, { ...policy, defaultMaxMiB: -1 },
    ])).toEqual([]);
    expect(unambiguousDocumentUploadPolicies([
      policy, { category: "premises_plan", mimeTypes: null },
    ])).toEqual([]);
    expect(unambiguousDocumentUploadPolicies([
      policy, { ...policy, category: " premises_plan " },
    ])).toEqual([]);
    expect(unambiguousDocumentUploadPolicies([
      policy, { ...policy, category: "company_authority" }, null,
    ])).toHaveLength(2);
  });
  it("requires a complete document API response before displaying statuses", () => {
    const response = {
      documents: [doc(1, "CLEAN", "VERIFIED")],
      uploadPolicy: [],
      uploadEnabled: false,
      submissionEnabled: false,
    };
    expect(validatedDocumentResponse(response)?.documents).toHaveLength(1);
    expect(validatedDocumentResponse(null)).toBeNull();
    expect(validatedDocumentResponse({ ...response, documents: null })).toBeNull();
    expect(validatedDocumentResponse({ ...response, documents: [null] })).toBeNull();
    expect(validatedDocumentResponse({ ...response, uploadPolicy: null })).toBeNull();
    expect(validatedDocumentResponse({ ...response, uploadEnabled: "false" })).toBeNull();
    expect(validatedDocumentResponse({ ...response, submissionEnabled: undefined })).toBeNull();
  });
  it("rejects malformed API document records", () => {
    expect(isDocumentStatusRecord(doc(1, "CLEAN", "VERIFIED"))).toBe(true);
    expect(isDocumentStatusRecord(null)).toBe(false);
    expect(isDocumentStatusRecord({ ...doc(1, "CLEAN", "VERIFIED"), scanStatus: null })).toBe(false);
    expect(isDocumentStatusRecord({ ...doc(1, "CLEAN", "VERIFIED"), version: "1" })).toBe(false);
    expect(isDocumentStatusRecord({ ...doc(1, "CLEAN", "VERIFIED"), supersededAt: false })).toBe(false);
    expect(isDocumentStatusRecord({ ...doc(1, "CLEAN", "VERIFIED"), category: "  " })).toBe(false);
    expect(isDocumentStatusRecord({ ...doc(1, "CLEAN", "VERIFIED"), category: " premises_plan " })).toBe(false);
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
