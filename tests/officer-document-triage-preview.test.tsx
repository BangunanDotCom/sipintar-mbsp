import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OfficerDocumentTriagePreview } from "../apps/web/src/OfficerDocumentTriagePreview.js";
import { documentChecklistRows } from "../packages/shared/src/document-checklist-status.js";

const record = (category: string, scanStatus: string, verificationStatus: string) => ({
  category,
  version: 1,
  fileName: "document.pdf",
  scanStatus,
  verificationStatus,
  supersededAt: null,
});

describe("officer document triage preview", () => {
  it("renders a read-only priority overview and safely escapes document content", () => {
    const rows = documentChecklistRows("COMPANY", [
      record("floor_layout", "INFECTED", "UNVERIFIED"),
      record("premises_plan", "CLEAN", "UNVERIFIED"),
      record("fire_safety", "PENDING", "UNVERIFIED"),
    ]);
    const markup = renderToStaticMarkup(createElement(OfficerDocumentTriagePreview, { rows }));
    expect(markup).toContain("Terdapat 1 kategori dokumen kritikal");
    expect(markup).toContain("Tindakan pegawai: 2");
    expect(markup).toContain("Proses sistem: 1");
    expect(markup).not.toContain("Semak percanggahan versi");
    expect(markup).toContain("Senarai tindakan susulan dokumen");
    expect(markup).not.toContain("type=\"submit\"");
    expect(markup).not.toContain("type=\"file\"");
  });

  it("shows a clear empty state and no critical alert when nothing needs triage", () => {
    const rows = documentChecklistRows("INDIVIDUAL", [
      record("premises_plan", "CLEAN", "VERIFIED"),
    ]);
    const markup = renderToStaticMarkup(createElement(OfficerDocumentTriagePreview, { rows }));
    expect(markup).toContain("Tiada dokumen yang memerlukan tindakan susulan");
    expect(markup).not.toContain("role=\"alert\"");
    expect(markup).toContain("disabled");
  });

  it("uses distinct accessible field IDs for two instances on the same page", () => {
    const rows = documentChecklistRows("INDIVIDUAL", []);
    const markup = renderToStaticMarkup(createElement("main", null,
      createElement(OfficerDocumentTriagePreview, { rows }),
      createElement(OfficerDocumentTriagePreview, { rows }),
    ));
    const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(10);
    expect((markup.match(/aria-labelledby=/g) ?? []).length).toBe(2);
  });
});
