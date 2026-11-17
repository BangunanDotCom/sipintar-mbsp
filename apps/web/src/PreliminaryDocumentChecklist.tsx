import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "./api";
import { Link } from "react-router-dom";
import { documentChecklistRows, documentChecklistSummary, documentStatusLabels, documentNextStepLabels, validatedDocumentResponse } from "../../../packages/shared/src/document-checklist-status";

export function PreliminaryDocumentChecklist({ draftId, capacity, userId }: {
  draftId: string;
  capacity: "INDIVIDUAL" | "COMPANY";
  userId: string;
}) {
  const query = useQuery<unknown>({
    queryKey: ["application-documents", userId, draftId, capacity],
    queryFn: () => api(`/application-drafts/${draftId}/documents`),
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    gcTime: 0,
  });
  // Never show a cached document list after a failed authorization or refresh.
  const validated = query.isSuccess ? validatedDocumentResponse(query.data) : null;
  const validDocuments = validated !== null;
  const documents = validated?.documents ?? [];
  const visible = documentChecklistRows(capacity, documents);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ATTENTION" | "PENDING" | "VERIFIED" | "MISSING">("ALL");
  const filteredRows = visible.filter((row) => {
    if (statusFilter === "ATTENTION") return ["CONFLICT", "UNSAFE", "REJECTED"].includes(row.state);
    if (statusFilter === "PENDING") return ["PENDING_SCAN", "PENDING_REVIEW"].includes(row.state);
    if (statusFilter === "VERIFIED") return row.state === "VERIFIED";
    if (statusFilter === "MISSING") return row.state === "MISSING";
    return true;
  });
  const summary = documentChecklistSummary(visible);
  const { total, recorded, verified, unsafe, pendingScan, pendingScanRows, conflicts, pendingReview, rejected, missing, attentionRows, pendingReviewRows, optionalTotal, optionalRecorded, optionalAttention, optionalAttentionRows, optionalPendingReviewRows } = summary;
  // Reject malformed upload guidance from the API.
  const uploadPolicy = validated?.uploadPolicy ?? [];
  const policyByCategory = new Map(uploadPolicy.map((row) => [row.category, row]));
  const mimeLabel = (mime: string) => mime === "application/pdf" ? "PDF" :
    mime === "image/jpeg" ? "JPEG" : mime === "image/png" ? "PNG" : mime;
  return (
    <section className="panel" aria-labelledby="supporting-documents-heading">
      <h2 id="supporting-documents-heading">Dokumen sokongan permohonan</h2>
      <p>Senarai persediaan awal, bukan senarai syarat wajib rasmi MBSP. Muat naik dokumen permohonan belum diaktifkan.</p>
      {query.isPending && <p role="status">Memuatkan status dokumen...</p>}
      {query.isError && (
        <div role="alert">
          <p>Status dokumen tidak dapat diperoleh. Tiada dokumen dianggap lengkap.</p>
          {query.error instanceof ApiError && query.error.status === 401 && (
            <Link to={`/log-masuk?next=${encodeURIComponent(`/permohonan/draf/${draftId}/semakan`)}`}>
              Log masuk semula
            </Link>
          )}
          {query.error instanceof ApiError && query.error.status === 409 && (
            <p>Maklumat draf perlu disemak semula sebelum status dokumen boleh dipaparkan.</p>
          )}
        </div>
      )}
      {query.isSuccess && !validDocuments && (
        <p role="alert">Respons status dokumen tidak lengkap. Sila semak semula kemudian.</p>
      )}
      {validDocuments && (
        <p role="status">
          <strong>Rekod kategori persediaan utama: {recorded} daripada {total} kategori.</strong>{" "}
          <strong> Disahkan pegawai selepas imbasan bersih: {verified} kategori.</strong>{" "}
          {pendingScan > 0 && <strong> Menunggu imbasan keselamatan: {pendingScan} kategori.</strong>}
          {unsafe > 0 && <strong> Isu keselamatan dokumen: {unsafe} kategori — rujuk pegawai.</strong>}{" "}
          {conflicts > 0 && <strong> Konflik sejarah/versi dokumen: {conflicts} kategori — rujuk pegawai.</strong>}{" "}
          {pendingReview > 0 && <strong> Menunggu pengesahan pegawai: {pendingReview} kategori.</strong>}{" "}
          {rejected > 0 && <strong> Ditolak pegawai: {rejected} kategori — semak maklum balas.</strong>}{" "}
          Dokumen tambahan jika berkaitan: {optionalRecorded} daripada {optionalTotal} kategori mempunyai rekod.{" "}
          {optionalAttention > 0 && <strong> Dokumen tambahan memerlukan perhatian: {optionalAttention} kategori.</strong>}{" "}
          Bilangan rekod bukan pengesahan keselamatan,
          kesahihan dokumen atau kelayakan untuk menghantar permohonan.
        </p>
      )}
      {validDocuments && pendingScanRows.length > 0 && (
        <div role="status">
          <p>Dokumen yang sedang menunggu imbasan keselamatan (belum boleh dianggap selamat atau disahkan):</p>
          <ul>
            {pendingScanRows.map((item) => (
              <li key={item.category}>{item.label}: {documentNextStepLabels[item.state]}</li>
            ))}
          </ul>
        </div>
      )}
      {validDocuments && attentionRows.length > 0 && (
        <div role="status">
          <p>Kategori persediaan utama yang memerlukan tindakan atau pemantauan:</p>
          <ul>
            {attentionRows.map((item) => (
              <li key={item.category}>{item.label}: {documentStatusLabels[item.state]}. {documentNextStepLabels[item.state]}</li>
            ))}
          </ul>
        </div>
      )}
      {validDocuments && (pendingReviewRows.length > 0 || optionalPendingReviewRows.length > 0) && (
        <div role="status">
          <p>Dokumen yang sedang menunggu pengesahan pegawai (tiada tindakan pembetulan diperlukan setakat ini):</p>
          <ul>
            {[...pendingReviewRows, ...optionalPendingReviewRows].map((item) => (
              <li key={item.category}>{item.label}{item.applicability === "IF_AVAILABLE" ? " (jika berkaitan)" : ""}: {documentNextStepLabels[item.state]}</li>
            ))}
          </ul>
        </div>
      )}
      {validDocuments && optionalAttentionRows.length > 0 && (
        <div role="status">
          <p>Dokumen tambahan yang memerlukan perhatian (jika berkaitan):</p>
          <ul>
            {optionalAttentionRows.map((item) => (
              <li key={item.category}>{item.label}: {documentStatusLabels[item.state]}. {documentNextStepLabels[item.state]}</li>
            ))}
          </ul>
        </div>
      )}
      {validDocuments && missing.length > 0 && (
        <div>
          <p>Kategori persediaan utama yang belum mempunyai rekod aktif (belum ditetapkan sebagai syarat wajib rasmi):</p>
          <ul>
            {missing.map((item) => <li key={item.category}>{item.label}</li>)}
          </ul>
        </div>
      )}
      {validDocuments && (
        <div>
          <label htmlFor="document-status-filter">Tapis senarai dokumen mengikut status</label>{" "}
          <select id="document-status-filter" value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
            <option value="ALL">Semua dokumen</option>
            <option value="ATTENTION">Perlu perhatian atau pembetulan</option>
            <option value="PENDING">Menunggu imbasan atau pengesahan</option>
            <option value="VERIFIED">Telah disahkan pegawai</option>
            <option value="MISSING">Tiada rekod aktif</option>
          </select>
          <p role="status">Memaparkan {filteredRows.length} daripada {visible.length} kategori dokumen.</p>
        </div>
      )}
      {validDocuments && <div style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th scope="col">Dokumen</th><th scope="col">Pemakaian</th><th scope="col">Catatan</th><th scope="col">Format & saiz fail (panduan)</th><th scope="col">Rekod sistem</th><th scope="col">Tindakan seterusnya</th></tr></thead>
          <tbody>
            {filteredRows.map((item) => {
              const current = item.current;
              return (
                <tr key={item.category}>
                  <th scope="row">{item.label}</th>
                  <td>{item.applicability === "ALL" ? "Semua pemohon" : item.applicability === "COMPANY" ? "Pemohon syarikat" : "Jika berkaitan / tersedia"}</td>
                  <td>{item.note}</td>
                  <td>{policyByCategory.has(item.category) ? (
                    <>
                      {policyByCategory.get(item.category)!.mimeTypes.map(mimeLabel).join(", ")}
                      {" · "}{policyByCategory.get(item.category)!.defaultMaxMiB} MiB (had lalai)
                    </>
                  ) : "Panduan belum tersedia"}</td>
                  <td>{current ? `Versi ${current.version} · ${current.fileName} · ` : ""}{documentStatusLabels[item.state]}</td>
                  <td>{documentNextStepLabels[item.state]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredRows.length === 0 && <p>Tiada kategori dokumen bagi penapis yang dipilih.</p>}
      </div>}
      <p><small>Saiz yang dipaparkan ialah had lalai untuk persediaan sahaja; had sebenar mungkin berubah mengikut tetapan pentadbir. Rekod fail bukan bukti penerimaan atau pengesahan. Penghantaran rasmi dan muat naik kekal tidak tersedia.</small></p>
      <button className="button secondary small" type="button"
        onClick={() => void query.refetch()} disabled={query.isFetching}>
        {query.isFetching ? "Menyemak…" : "Semak semula senarai dokumen"}
      </button>
    </section>
  );
}
