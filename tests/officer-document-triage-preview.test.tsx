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
  it("renders a read-only priority overview without submission or upload controls", () => {
    const rows = documentChecklistRows("COMPANY", [
      record("floor_layout", "INFECTED", "UNVERIFIED"),
      record("premises_plan", "CLEAN", "UNVERIFIED"),
      record("fire_safety", "PENDING", "UNVERIFIED"),
    ]);
    const markup = renderToStaticMarkup(createElement(OfficerDocumentTriagePreview, { rows }));
    expect(markup).toContain("Terdapat 1 kategori dokumen kritikal");
    expect(markup).not.toContain("kategori kritikal tidak dipaparkan");
    expect(markup).not.toContain("Paparkan semua termasuk isu kritikal");
    expect(markup).toContain("Fokus isu kritikal");
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).not.toContain("Paparan fokus menunjukkan semua");
    expect(markup).toContain("Tindakan pegawai: 2");
    expect(markup).toContain("Proses sistem: 1");
    expect(markup).not.toContain("Semak percanggahan versi");
    expect(markup).toContain("Senarai tindakan susulan dokumen");
    expect(markup).toContain("Status dokumen");
    expect(markup).toContain("Semua status");
    expect(markup).toContain("Menunggu pengesahan pegawai");
    expect(markup).toContain("Menunggu imbasan keselamatan");
    expect(markup).not.toContain("type=\"submit\"");
    expect(markup).not.toContain("type=\"file\"");
  });

  it("keeps critical warnings visible when filters are available", () => {
    const rows = documentChecklistRows("INDIVIDUAL", [
      record("floor_layout", "INFECTED", "UNVERIFIED"),
      record("premises_plan", "CLEAN", "UNVERIFIED"),
    ]);
    const markup = renderToStaticMarkup(createElement(OfficerDocumentTriagePreview, { rows }));
    expect(markup).toContain("Terdapat 1 kategori dokumen kritikal");
    expect(markup).toContain("Dalam hasil semasa: ");
    expect(markup).toContain("1 kritikal");
  });

  it("escapes untrusted document labels rather than interpreting them as HTML", () => {
    const rows = documentChecklistRows("INDIVIDUAL", [
      record("premises_plan", "CLEAN", "UNVERIFIED"),
    ]);
    const modified = rows.map((row) => row.category === "premises_plan"
      ? { ...row, label: '<img src=x onerror=alert(1)>' }
      : row);
    const markup = renderToStaticMarkup(createElement(OfficerDocumentTriagePreview, { rows: modified }));
    expect(markup).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(markup).not.toContain("<img src=x onerror=alert(1)>");
    expect(markup).not.toContain('type="submit"');
  });

  it("shows a clear empty state and no critical alert when nothing needs triage", () => {
    const rows = documentChecklistRows("INDIVIDUAL", [
      record("premises_plan", "CLEAN", "VERIFIED"),
    ]);
    const markup = renderToStaticMarkup(createElement(OfficerDocumentTriagePreview, { rows }));
    expect(markup).toContain("Tiada dokumen yang memerlukan tindakan susulan");
    expect(markup).not.toContain("role=\"alert\"");
    expect(markup).not.toContain("Fokus isu kritikal");
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
    expect(ids.length).toBe(12);
    expect((markup.match(/aria-labelledby=/g) ?? []).length).toBe(2);
    const labels = [...markup.matchAll(/\bfor="([^"]+)"/g)].map((match) => match[1]);
    expect(labels).toHaveLength(10);
    expect(labels.every((id) => ids.includes(id))).toBe(true);
    const headingRefs = [...markup.matchAll(/aria-labelledby="([^"]+)"/g)].map((match) => match[1]);
    expect(headingRefs.every((id) => ids.includes(id))).toBe(true);
  });
});
