import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "./api";
import { Link } from "react-router-dom";
import { documentChecklistRows, documentStatusLabels, documentNextStepLabels, validatedDocumentResponse } from "../../../packages/shared/src/document-checklist-status";

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
  const priorityCategories = visible.filter((item) => item.applicability === "ALL" || item.applicability === "COMPANY");
  const recordedPriority = priorityCategories.filter((item) => Boolean(item.current)).length;
  const verifiedPriority = priorityCategories.filter((item) => item.state === "VERIFIED").length;
  const pendingSafetyPriority = priorityCategories.filter((item) => item.state === "UNSAFE" || item.state === "PENDING_SCAN").length;
  const conflictPriority = priorityCategories.filter((item) => item.state === "CONFLICT").length;
  const pendingReviewPriority = priorityCategories.filter((item) => item.state === "PENDING_REVIEW").length;
  const rejectedPriority = priorityCategories.filter((item) => item.state === "REJECTED").length;
  const missingPriority = priorityCategories.filter((item) => !item.current);
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
          <strong>Rekod kategori persediaan utama: {recordedPriority} daripada {priorityCategories.length} kategori.</strong>{" "}
          <strong> Disahkan pegawai selepas imbasan bersih: {verifiedPriority} kategori.</strong>{" "}
          {pendingSafetyPriority > 0 && <strong> Perlu perhatian keselamatan: {pendingSafetyPriority} kategori.</strong>}{" "}
          {conflictPriority > 0 && <strong> Konflik versi aktif: {conflictPriority} kategori — rujuk pegawai.</strong>}{" "}
          {pendingReviewPriority > 0 && <strong> Menunggu pengesahan pegawai: {pendingReviewPriority} kategori.</strong>}{" "}
          {rejectedPriority > 0 && <strong> Ditolak pegawai: {rejectedPriority} kategori — semak maklum balas.</strong>}{" "}
          Bilangan rekod bukan pengesahan keselamatan,
          kesahihan dokumen atau kelayakan untuk menghantar permohonan.
        </p>
      )}
      {validDocuments && missingPriority.length > 0 && (
        <div>
          <p>Kategori persediaan utama yang belum mempunyai rekod aktif (belum ditetapkan sebagai syarat wajib rasmi):</p>
          <ul>
            {missingPriority.map((item) => <li key={item.category}>{item.label}</li>)}
          </ul>
        </div>
      )}
      {validDocuments && <div style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th scope="col">Dokumen</th><th scope="col">Pemakaian</th><th scope="col">Catatan</th><th scope="col">Format & saiz fail (panduan)</th><th scope="col">Rekod sistem</th><th scope="col">Tindakan seterusnya</th></tr></thead>
          <tbody>
            {visible.map((item) => {
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
      </div>}
      <p><small>Saiz yang dipaparkan ialah had lalai untuk persediaan sahaja; had sebenar mungkin berubah mengikut tetapan pentadbir. Rekod fail bukan bukti penerimaan atau pengesahan. Penghantaran rasmi dan muat naik kekal tidak tersedia.</small></p>
      <button className="button secondary small" type="button"
        onClick={() => void query.refetch()} disabled={query.isFetching}>
        {query.isFetching ? "Menyemak…" : "Semak semula senarai dokumen"}
      </button>
    </section>
  );
}
