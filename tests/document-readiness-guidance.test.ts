import { describe, expect, it } from "vitest";
import { documentReadinessGuidance } from "../apps/api/src/document-readiness-guidance.js";

describe("applicant document readiness guidance", () => {
  it("explains ready documents without claiming submission is enabled", () => {
    const result = documentReadinessGuidance("INDIVIDUAL", {
      ready: true, blockingCategories: [], pendingScanCategories: [],
      unexpectedActiveDocuments: false,
    });
    expect(result.headline).toBe("Semakan awal dokumen lengkap");
    expect(result.message).toContain("Penghantaran rasmi masih belum dibuka");
    expect(result.issues).toEqual([]);
    expect(result.integrityWarning).toBeNull();
  });
  it("labels pending scans and missing company documents in Malay", () => {
    const result = documentReadinessGuidance("COMPANY", {
      ready: false, blockingCategories: ["floor_layout", "company_authority"],
      pendingScanCategories: ["floor_layout"], unexpectedActiveDocuments: false,
    });
    expect(result.issues).toEqual([
      {
        category: "floor_layout",
        label: "Pelan susun atur setiap tingkat",
        message: "Imbasan keselamatan belum selesai. Sila semak semula kemudian.",
      },
      {
        category: "company_authority",
        label: "Surat kuasa wakil syarikat",
        message: "Dokumen belum lengkap atau memerlukan pembetulan. Sila semak senarai dokumen.",
      },
    ]);
  });
  it("gives a generic integrity warning without exposing unexpected file names", () => {
    const result = documentReadinessGuidance("INDIVIDUAL", {
      ready: false, blockingCategories: [], pendingScanCategories: [],
      unexpectedActiveDocuments: true,
    });
    expect(result.integrityWarning).toContain("hubungi pentadbir sistem");
    expect(JSON.stringify(result)).not.toContain("storageKey");
  });
});
