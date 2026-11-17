import { useId, useState } from "react";
import {
  documentReviewQueue,
  criticalDocumentReviewQueue,
  documentReviewQueueSummary,
  documentReviewStatusSummary,
  filterDocumentReviewQueue,
  documentReviewNextActionLabels,
  documentStatusLabels,
  hiddenCriticalDocumentCount,
  type DocumentChecklistRow,
  type DocumentReviewPriorityFilter,
  type DocumentReviewOwnerFilter,
  type DocumentScopeFilter,
  type DocumentReviewStatusFilter,
} from "../../../packages/shared/src/document-checklist-status";

const priorityLabels = {
  CRITICAL: "Kritikal",
  ACTION: "Perlu tindakan",
  WAITING: "Menunggu proses",
} as const;
const ownerLabels = {
  OFFICER: "Pegawai",
  APPLICANT: "Pemohon",
  SYSTEM: "Sistem",
} as const;

/**
 * Presentation-only component for a future authorized officer route.
 * Does not fetch records, grant permissions, update verification or submit applications.
 * The parent route and API must enforce active officer role, MFA and district scope.
 */
export function OfficerDocumentTriagePreview({ rows }: { rows: readonly DocumentChecklistRow[] }) {
  const instanceId = useId();
  const headingId = `${instanceId}-heading`;
  const priorityId = `${instanceId}-priority`;
  const ownerId = `${instanceId}-owner`;
  const scopeId = `${instanceId}-scope`;
  const searchId = `${instanceId}-search`;
  const statusId = `${instanceId}-status`;
  const [priority, setPriority] = useState<DocumentReviewPriorityFilter>("ALL");
  const [owner, setOwner] = useState<DocumentReviewOwnerFilter>("ALL");
  const [scope, setScope] = useState<DocumentScopeFilter>("ALL");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<DocumentReviewStatusFilter>("ALL");
  const missingRows = rows.filter((row) => row.state === "MISSING");
  const missingCount = missingRows.length;
  const missingPriorityCount = missingRows.filter((row) => row.applicability !== "IF_AVAILABLE").length;
  const missingOptionalCount = missingRows.filter((row) => row.applicability === "IF_AVAILABLE").length;
  const verifiedRows = rows.filter((row) => row.state === "VERIFIED");
  const verifiedCount = verifiedRows.length;
  const verifiedPrimaryCount = verifiedRows.filter((row) => row.applicability !== "IF_AVAILABLE").length;
  const verifiedOptionalCount = verifiedRows.filter((row) => row.applicability === "IF_AVAILABLE").length;
  const queue = documentReviewQueue(rows);
  const summary = documentReviewQueueSummary(queue);
  const filtered = filterDocumentReviewQueue(queue, priority, scope, search, owner, status);
  const filteredSummary = documentReviewQueueSummary(filtered);
  const visibleStatusCounts = documentReviewStatusSummary(filtered);
  const filtersActive = priority !== "ALL" || owner !== "ALL" || scope !== "ALL" || status !== "ALL" || search.trim().length > 0;
  const criticalUnfiltered = summary.critical > 0;
  const hiddenCritical = hiddenCriticalDocumentCount(queue, filtered);
  const allCritical = criticalDocumentReviewQueue(queue);
  const criticalFocusActive = priority === "CRITICAL" && owner === "ALL" && scope === "ALL" && status === "ALL" && search.trim() === "";
  const criticalFocusComplete = criticalFocusActive && filtered.length === allCritical.length && hiddenCritical === 0;
  const showCriticalOnly = () => {
    setPriority("CRITICAL");
    setOwner("ALL");
    setScope("ALL");
    setStatus("ALL");
    setSearch("");
  };
  const resetFilters = () => {
    setPriority("ALL");
    setOwner("ALL");
    setScope("ALL");
    setStatus("ALL");
    setSearch("");
  };


  return (
    <section className="panel" aria-labelledby={headingId}>
      <h2 id={headingId}>Pratonton keutamaan semakan dokumen</h2>
      <p>Ringkasan untuk pegawai yang diberi kuasa sahaja. Cadangan tindakan bukan keputusan kelulusan.</p>
      <p role="status">Kategori tanpa rekod aktif: {missingCount}. Kategori dengan dokumen disahkan: {verifiedCount}. Kedua-duanya tidak termasuk dalam senarai tindakan susulan; status ini bukan pengesahan kelengkapan permohonan.</p>
      {missingRows.length > 0 && (
        <details>
          <summary>Lihat {missingRows.length} kategori tanpa rekod aktif (panduan persediaan sahaja)</summary>
          <p>Persediaan utama: {missingPriorityCount} kategori. Dokumen tambahan jika berkaitan: {missingOptionalCount} kategori.</p>
          <ul>{missingRows.map((row) => <li key={row.category}>{row.label} — {row.applicability === "IF_AVAILABLE" ? "jika berkaitan" : row.applicability === "COMPANY" ? "pemohon syarikat" : "semua pemohon"}{row.note ? ` — ${row.note}` : ""}</li>)}</ul>
          <p>Senarai ini bukan penetapan syarat wajib atau keputusan kelulusan MBSP.</p>
        </details>
      )}
      {verifiedRows.length > 0 && (
        <details>
          <summary>Lihat {verifiedRows.length} kategori dengan dokumen disahkan pegawai</summary>
          <p>Persediaan utama disahkan: {verifiedPrimaryCount} kategori. Dokumen tambahan disahkan jika berkaitan: {verifiedOptionalCount} kategori.</p>
          <ul>{verifiedRows.map((row) => <li key={row.category}>{row.label}{row.current ? ` — Versi ${row.current.version}` : ""}</li>)}</ul>
          <p>Pengesahan dokumen individu tidak bermaksud keseluruhan permohonan lengkap atau diluluskan.</p>
        </details>
      )}
      <p role="status">
        Jumlah memerlukan pemantauan: {summary.total}. Kritikal: {summary.critical}.
        {" "}Tindakan pegawai: {summary.officerTasks}. Tindakan pemohon: {summary.applicantTasks}.
        {" "}Proses sistem: {summary.systemTasks}.
      </p>
      {criticalUnfiltered && (
        <div role="alert">
          <p>Terdapat {summary.critical} rekod dokumen kritikal yang memerlukan perhatian. {hiddenCritical > 0 && `${hiddenCritical} rekod kritikal tidak dipaparkan kerana penapis semasa. `}Paparan ini tidak memberikan kelulusan automatik.</p>
          {hiddenCritical > 0 && <button className="button secondary small" type="button" onClick={resetFilters}>Paparkan semua termasuk isu kritikal</button>}
          <button className="button secondary small" type="button" disabled={criticalFocusActive} aria-pressed={criticalFocusActive} onClick={showCriticalOnly}>Fokus isu kritikal</button>
        </div>
      )}
      {criticalFocusComplete && <p role="status">Paparan fokus menunjukkan semua {allCritical.length} rekod kritikal yang dikenal pasti.</p>}
      <label htmlFor={priorityId}>Keutamaan</label>
      <select id={priorityId} value={priority} onChange={(e) => setPriority(e.target.value as DocumentReviewPriorityFilter)}>
        <option value="ALL">Semua keutamaan</option>
        <option value="CRITICAL">Kritikal</option>
        <option value="ACTION">Perlu tindakan</option>
        <option value="WAITING">Menunggu proses</option>
      </select>
      <label htmlFor={ownerId}>Pihak bertanggungjawab</label>
      <select id={ownerId} value={owner} onChange={(e) => setOwner(e.target.value as DocumentReviewOwnerFilter)}>
        <option value="ALL">Semua pihak</option>
        <option value="OFFICER">Pegawai</option>
        <option value="APPLICANT">Pemohon</option>
        <option value="SYSTEM">Sistem</option>
      </select>
      <label htmlFor={scopeId}>Kategori dokumen</label>
      <select id={scopeId} value={scope} onChange={(e) => setScope(e.target.value as DocumentScopeFilter)}>
        <option value="ALL">Semua kategori</option>
        <option value="PRIORITY">Persediaan utama</option>
        <option value="OPTIONAL">Tambahan jika berkaitan</option>
      </select>
      <label htmlFor={statusId}>Status dokumen</label>
      <select id={statusId} value={status} onChange={(e) => setStatus(e.target.value as DocumentReviewStatusFilter)}>
        <option value="ALL">Semua status</option>
        <option value="CONFLICT">Konflik versi</option>
        <option value="UNSAFE">Isu keselamatan</option>
        <option value="REJECTED">Ditolak pegawai</option>
        <option value="PENDING_REVIEW">Menunggu pengesahan</option>
        <option value="PENDING_SCAN">Menunggu imbasan</option>
      </select>
      <label htmlFor={searchId}>Cari dokumen</label>
      <input id={searchId} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nama atau kategori dokumen" />
      <button className="button secondary small" type="button" disabled={!filtersActive} onClick={resetFilters}>Kosongkan penapis</button>
      <p role="status">Memaparkan {filtered.length} daripada {queue.length} rekod pemantauan.
        {" "}Dalam hasil semasa: {filteredSummary.critical} kritikal, {filteredSummary.action} perlu tindakan dan {filteredSummary.waiting} menunggu proses.
        {" "}Mengikut pihak: {filteredSummary.officerTasks} pegawai, {filteredSummary.applicantTasks} pemohon dan {filteredSummary.systemTasks} sistem.
        {" "}Mengikut status: {visibleStatusCounts.CONFLICT} konflik, {visibleStatusCounts.UNSAFE} isu keselamatan, {visibleStatusCounts.REJECTED} ditolak, {visibleStatusCounts.PENDING_SCAN} menunggu imbasan dan {visibleStatusCounts.PENDING_REVIEW} menunggu pengesahan.
      </p>
      {filtered.length > 0 && <div style={{ overflowX: "auto" }}>
        <table>
          <caption>Senarai tindakan susulan dokumen mengikut keutamaan dan pihak bertanggungjawab</caption>
          <thead><tr><th scope="col">Dokumen</th><th scope="col">Status dokumen</th><th scope="col">Keutamaan</th><th scope="col">Pihak</th><th scope="col">Versi</th><th scope="col">Panduan tindakan</th></tr></thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.category}>
                <th scope="row">{item.label}</th>
                <td>{documentStatusLabels[item.state]}</td>
                <td>{priorityLabels[item.priority]}</td>
                <td>{ownerLabels[item.actionOwner]}</td>
                <td>{item.version ?? "Tiada versi aktif"}</td>
                <td>{documentReviewNextActionLabels[item.nextAction]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}
      {filtered.length === 0 && (
        <div role="status">
          <p>{queue.length === 0
            ? "Tiada rekod berstatus tindakan susulan dalam senarai semasa. Ini bukan pengesahan dokumen lengkap atau permohonan layak diluluskan."
            : filtersActive
              ? "Tiada rekod sepadan dengan penapis. Kosongkan penapis untuk melihat semua rekod."
              : "Tiada rekod pemantauan untuk dipaparkan."}</p>
          {queue.length > 0 && filtersActive && (
            <button className="button secondary small" type="button" onClick={resetFilters}>
              Paparkan semula semua rekod
            </button>
          )}
        </div>
      )}
      <p><small>Pratonton baca sahaja. Pengesahan dokumen, muat naik dan penghantaran rasmi tidak tersedia melalui komponen ini.</small></p>
    </section>
  );
}
