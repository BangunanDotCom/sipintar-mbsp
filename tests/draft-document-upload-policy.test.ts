import { describe, expect, it } from "vitest";
import { draftDocumentUploadPolicy } from "../apps/api/src/draft-document-upload-policy.js";

describe("draft document upload preparation policy", () => {
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
