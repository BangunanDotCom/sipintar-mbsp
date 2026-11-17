import { describe, expect, it } from "vitest";
import { documentSubmissionReadiness } from "../apps/api/src/document-submission-readiness.js";
import type { DocumentStatusRecord } from "../packages/shared/src/document-checklist-status.js";

function document(category: string, overrides: Partial<DocumentStatusRecord> = {}): DocumentStatusRecord {
  return {
    category, version: 1, fileName: category + ".pdf", scanStatus: "CLEAN",
    verificationStatus: "UNVERIFIED", supersededAt: null, ...overrides,
  };
}
const mandatory = ["premises_plan", "floor_layout", "ownership_or_tenancy", "premises_photos"];
const readyDocs = mandatory.map((category) => document(category));

describe("preliminary document submission readiness", () => {
  it("blocks missing mandatory categories for individuals", () => {
    expect(documentSubmissionReadiness("INDIVIDUAL", []).blockingCategories)
      .toEqual(mandatory);
  });
  it("allows clean pending officer review and optional missing documents", () => {
    expect(documentSubmissionReadiness("INDIVIDUAL", readyDocs)).toEqual({
      ready: true, blockingCategories: [], pendingScanCategories: [],
    });
  });
  it("requires company authority only for company submissions", () => {
    const result = documentSubmissionReadiness("COMPANY", readyDocs);
    expect(result.ready).toBe(false);
    expect(result.blockingCategories).toEqual(["company_authority"]);
    expect(documentSubmissionReadiness("COMPANY", [
      ...readyDocs, document("company_authority"),
    ]).ready).toBe(true);
  });
  it("blocks pending scans, infected files and rejected documents", () => {
    const result = documentSubmissionReadiness("INDIVIDUAL", [
      ...readyDocs.filter((d) => d.category !== "floor_layout"),
      document("floor_layout", { scanStatus: "PENDING" }),
      document("premises_photos", { scanStatus: "INFECTED" }),
      document("ownership_or_tenancy", { verificationStatus: "REJECTED" }),
    ]);
    expect(result.ready).toBe(false);
    expect(result.blockingCategories).toEqual([
      "floor_layout", "ownership_or_tenancy", "premises_photos",
    ]);
    expect(result.pendingScanCategories).toEqual(["floor_layout"]);
  });
  it("uses current non-superseded version rather than old verified files", () => {
    const result = documentSubmissionReadiness("INDIVIDUAL", [
      ...readyDocs.filter((d) => d.category !== "premises_plan"),
      document("premises_plan", { version: 1, verificationStatus: "VERIFIED", supersededAt: "2026-11-17" }),
      document("premises_plan", { version: 2, scanStatus: "SCANNING" }),
    ]);
    expect(result.blockingCategories).toEqual(["premises_plan"]);
  });
});
