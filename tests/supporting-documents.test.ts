import { describe, expect, it } from "vitest";
import {
  preliminaryDocumentChecklist,
  supportingDocumentCategorySchema,
} from "../packages/shared/src/supporting-documents.js";

describe("preliminary supporting document checklist", () => {
  it("includes company authority only for company applications", () => {
    expect(preliminaryDocumentChecklist("INDIVIDUAL").some((d) => d.category === "company_authority")).toBe(false);
    expect(preliminaryDocumentChecklist("COMPANY").some((d) => d.category === "company_authority")).toBe(true);
  });
  it("does not include unknown document categories", () => {
    expect(supportingDocumentCategorySchema.safeParse("unverified_external_document").success).toBe(false);
  });
  it("does not mark documents as uploaded or verified", () => {
    expect(preliminaryDocumentChecklist("COMPANY").every((d) => !("verified" in d) && !("uploaded" in d))).toBe(true);
  });
});
