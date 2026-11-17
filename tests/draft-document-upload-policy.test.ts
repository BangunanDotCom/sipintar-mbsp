import { describe, expect, it } from "vitest";
import { draftDocumentUploadPolicy, uploadKindForSupportingDocument } from "../apps/api/src/draft-document-upload-policy.js";

describe("draft document upload preparation policy", () => {
  it("maps every supported document to the correct server upload policy", () => {
    const expected = {
      premises_plan: "plan",
      floor_layout: "plan",
      ownership_or_tenancy: "supporting",
      building_certificate: "supporting",
      fire_safety: "supporting",
      company_authority: "supporting",
      premises_photos: "photo",
    } as const;
    for (const [category, kind] of Object.entries(expected)) {
      expect(uploadKindForSupportingDocument(category as keyof typeof expected)).toBe(kind);
    }
    expect(draftDocumentUploadPolicy("COMPANY").map((row) => row.category).sort())
      .toEqual(Object.keys(expected).sort());
  });
  it("uses plan limits for plans and layouts", () => {
    const rows = draftDocumentUploadPolicy("INDIVIDUAL");
    for (const category of ["premises_plan", "floor_layout"]) {
      expect(rows.find((row) => row.category === category)).toMatchObject({
        mimeTypes: ["application/pdf"], defaultMaxMiB: 50, hardCeilingMiB: 100,
      });
    }
  });
  it("restricts photographs to JPEG and PNG", () => {
    expect(draftDocumentUploadPolicy("INDIVIDUAL").find((row) => row.category === "premises_photos"))
      .toMatchObject({
        mimeTypes: ["image/jpeg", "image/png"], defaultMaxMiB: 10, hardCeilingMiB: 20,
      });
  });
  it("does not expose company authority requirements to individual applicants", () => {
    expect(draftDocumentUploadPolicy("INDIVIDUAL").some((row) => row.category === "company_authority")).toBe(false);
    expect(draftDocumentUploadPolicy("COMPANY").find((row) => row.category === "company_authority"))
      .toMatchObject({ mimeTypes: ["application/pdf"], defaultMaxMiB: 20, hardCeilingMiB: 50 });
  });
});
