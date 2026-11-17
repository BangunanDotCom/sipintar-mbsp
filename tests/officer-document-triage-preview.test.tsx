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
    expect(markup).toContain("Kategori tanpa rekod aktif: 4");
    expect(markup).toContain("Lihat 4 kategori tanpa rekod aktif");
    expect(markup).toContain("Persediaan utama: 3 kategori. Dokumen tambahan jika berkaitan: 1 kategori.");
    expect(markup).toContain("jika berkaitan");
    expect(markup).toContain("Senarai ini bukan penetapan syarat wajib");
    expect(markup).toContain("Dokumen berkaitan hak penggunaan premis");
    expect(markup).toContain("Untuk permohonan atas nama syarikat");
    expect(markup).toContain("Kategori dengan dokumen disahkan: 0");
    expect(markup).not.toContain("Lihat 1 kategori dengan dokumen disahkan pegawai");
    expect(markup).toContain("Terdapat 1 rekod dokumen kritikal");
    expect(markup).not.toContain("rekod kritikal tidak dipaparkan");
    expect(markup).not.toContain("Paparkan semua termasuk isu kritikal");
    expect(markup).toContain("Fokus isu kritikal");
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).not.toContain("Paparan fokus menunjukkan semua");
    expect(markup).toContain("Tindakan pegawai: 2");
    expect(markup).toContain("Proses sistem: 1");
    expect(markup).toContain("Mengikut pihak: ");
    expect(markup).toContain("2 pegawai, ");
    expect(markup).toContain("0 pemohon dan ");
    expect(markup).toContain("1 sistem.");
    expect(markup).toContain("Mengikut status: ");
    expect(markup).toContain("0 konflik, 1 isu keselamatan, 0 ditolak, 1 menunggu imbasan dan 1 menunggu pengesahan.");
    expect(markup).not.toContain("Semak percanggahan versi");
    expect(markup).toContain("Senarai tindakan susulan dokumen");
    expect(markup).toContain("Status dokumen");
    expect(markup).toContain("Semua status");
    expect(markup).toContain("Menunggu pengesahan pegawai");
    expect(markup).toContain("Menunggu imbasan keselamatan");
    expect(markup).not.toContain("type=\"submit\"");
    expect(markup).not.toContain("type=\"file\"");
  });

  it("flags conflicting superseded-only history without claiming an active version", () => {
    const historical = {
      ...record("premises_plan", "CLEAN", "VERIFIED"),
      supersededAt: "2026-11-17T00:00:00Z",
    };
    const rows = documentChecklistRows("INDIVIDUAL", [historical, { ...historical }]);
    const markup = renderToStaticMarkup(createElement(OfficerDocumentTriagePreview, { rows }));
    expect(markup).toContain("Terdapat 1 rekod dokumen kritikal");
    expect(markup).toContain("Tiada versi aktif");
    expect(markup).toContain("Semak percanggahan versi dan sejarah dokumen");
    expect(markup).not.toContain("Paparan fokus menunjukkan semua");
  });

  it("keeps critical warnings visible when filters are available", () => {
    const rows = documentChecklistRows("INDIVIDUAL", [
      record("floor_layout", "INFECTED", "UNVERIFIED"),
      record("premises_plan", "CLEAN", "UNVERIFIED"),
    ]);
    const markup = renderToStaticMarkup(createElement(OfficerDocumentTriagePreview, { rows }));
    expect(markup).toContain("Terdapat 1 rekod dokumen kritikal");
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
    expect(markup).toContain("Kategori dengan dokumen disahkan: 1");
    expect(markup).toContain("Lihat 1 kategori dengan dokumen disahkan pegawai");
    expect(markup).toContain("Pelan lokasi dan premis — Versi 1");
    expect(markup).toContain("Pengesahan dokumen individu tidak bermaksud keseluruhan permohonan lengkap atau diluluskan.");
    expect(markup).toContain("Kategori tanpa rekod aktif: 5");
    expect(markup).toContain("Lihat 5 kategori tanpa rekod aktif");
    expect(markup).toContain("Persediaan utama: 3 kategori. Dokumen tambahan jika berkaitan: 2 kategori.");
    expect(markup).toContain("Tiada rekod berstatus tindakan susulan");
    expect(markup).toContain("bukan pengesahan dokumen lengkap atau permohonan layak diluluskan");
    expect(markup).not.toContain("<table>");
    expect(markup).not.toContain("<caption>");
    expect(markup).not.toContain("Paparkan semula semua rekod");
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
