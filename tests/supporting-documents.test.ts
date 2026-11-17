import { describe, expect, it } from "vitest";
import {
  preliminaryDocumentChecklist,
  preliminaryDocumentStatus,
  supportingDocumentCategorySchema,
} from "../packages/shared/src/supporting-documents.js";

describe("preliminary supporting document checklist", () => {
  it("includes company authority only for company applications", () => {
    expect(preliminaryDocumentChecklist("INDIVIDUAL").some((d) => d.category === "company_authority")).toBe(false);
    expect(preliminaryDocumentChecklist("COMPANY").some((d) => d.category === "company_authority")).toBe(true);
  });
  it("keeps all checklist statuses advisory and never implies upload approval", () => {
    for (const capacity of ["INDIVIDUAL", "COMPANY"] as const) {
      const items = preliminaryDocumentStatus(capacity);
      expect(items.length).toBe(preliminaryDocumentChecklist(capacity).length);
      expect(items.every((item) => item.advisoryOnly === true)).toBe(true);
      expect(items.every((item) => !("uploaded" in item) && !("verified" in item) && !("mandatory" in item))).toBe(true);
    }
  });
  it("does not include unknown document categories", () => {
    expect(supportingDocumentCategorySchema.safeParse("unverified_external_document").success).toBe(false);
  });
  it("does not mark documents as uploaded or verified", () => {
    expect(preliminaryDocumentChecklist("COMPANY").every((d) => !("verified" in d) && !("uploaded" in d))).toBe(true);
  });
});
