import { useId, useState } from "react";
import {
  documentReviewQueue,
  criticalDocumentReviewQueue,
  documentReviewQueueSummary,
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
  const queue = documentReviewQueue(rows);
  const summary = documentReviewQueueSummary(queue);
  const filtered = filterDocumentReviewQueue(queue, priority, scope, search, owner, status);
  const filteredSummary = documentReviewQueueSummary(filtered);
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
      <p role="status">
        Jumlah memerlukan pemantauan: {summary.total}. Kritikal: {summary.critical}.
        {" "}Tindakan pegawai: {summary.officerTasks}. Tindakan pemohon: {summary.applicantTasks}.
        {" "}Proses sistem: {summary.systemTasks}.
      </p>
      {criticalUnfiltered && (
        <div role="alert">
          <p>Terdapat {summary.critical} kategori dokumen kritikal yang memerlukan perhatian. {hiddenCritical > 0 && `${hiddenCritical} kategori kritikal tidak dipaparkan kerana penapis semasa. `}Paparan ini tidak memberikan kelulusan automatik.</p>
          {hiddenCritical > 0 && <button className="button secondary small" type="button" onClick={resetFilters}>Paparkan semua termasuk isu kritikal</button>}
          <button className="button secondary small" type="button" disabled={criticalFocusActive} aria-pressed={criticalFocusActive} onClick={showCriticalOnly}>Fokus isu kritikal</button>
        </div>
      )}
      {criticalFocusComplete && <p role="status">Paparan fokus menunjukkan semua {allCritical.length} kategori kritikal yang dikenal pasti.</p>}
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
      </p>
      <div style={{ overflowX: "auto" }}>
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
      </div>
      {filtered.length === 0 && (
        <p>{queue.length === 0 ? "Tiada dokumen yang memerlukan tindakan susulan dalam senarai semasa." : "Tiada rekod sepadan dengan penapis. Kosongkan penapis untuk melihat semua rekod."}</p>
      )}
      <p><small>Pratonton baca sahaja. Pengesahan dokumen, muat naik dan penghantaran rasmi tidak tersedia melalui komponen ini.</small></p>
    </section>
  );
}
