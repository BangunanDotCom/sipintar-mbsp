import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "./api";
import { Link } from "react-router-dom";
import { documentChecklistRows, documentStatusLabels, isDocumentStatusRecord, type DocumentStatusRecord } from "../../../packages/shared/src/document-checklist-status";

type DocumentRecord = DocumentStatusRecord & {
  uploadedAt: string;
  byteSize: number;
  mimeType: string;
};
type UploadPolicyRow = {
  category: string;
  label: string;
  mimeTypes: string[];
  defaultMaxMiB: number;
  hardCeilingMiB: number;
};
type DocumentResponse = {
  uploadPolicy: UploadPolicyRow[];
  documents: DocumentRecord[];
  uploadEnabled: boolean;
  submissionEnabled: boolean;
};

export function PreliminaryDocumentChecklist({ draftId, capacity, userId }: {
  draftId: string;
  capacity: "INDIVIDUAL" | "COMPANY";
  userId: string;
}) {
  const query = useQuery<DocumentResponse>({
    queryKey: ["application-documents", userId, draftId, capacity],
    queryFn: () => api(`/application-drafts/${draftId}/documents`),
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    gcTime: 0,
  });
  // Never show a cached document list after a failed authorization or refresh.
  const validDocuments = query.isSuccess && Array.isArray(query.data?.documents) && query.data.documents.every(isDocumentStatusRecord);
  const documents = validDocuments ? query.data!.documents : [];
  const visible = documentChecklistRows(capacity, documents);
  const priorityCategories = visible.filter((item) => item.applicability === "ALL" || item.applicability === "COMPANY");
  const recordedPriority = priorityCategories.filter((item) => Boolean(item.current)).length;
  const verifiedPriority = priorityCategories.filter((item) => item.state === "VERIFIED").length;
  const pendingSafetyPriority = priorityCategories.filter((item) => item.state === "UNSAFE" || item.state === "PENDING_SCAN").length;
  const conflictPriority = priorityCategories.filter((item) => item.state === "CONFLICT").length;
  const missingPriority = priorityCategories.filter((item) => !item.current);
  // API policy is untrusted: malformed entries must not crash the checklist.
  const uploadPolicy = query.isSuccess && Array.isArray(query.data?.uploadPolicy)
    ? query.data!.uploadPolicy.filter((row): row is UploadPolicyRow =>
      typeof row === "object" && row !== null &&
      typeof row.category === "string" && row.category.length > 0 &&
      typeof row.label === "string" &&
      Array.isArray(row.mimeTypes) && row.mimeTypes.every((mime) => typeof mime === "string") &&
      typeof row.defaultMaxMiB === "number" && Number.isFinite(row.defaultMaxMiB) && row.defaultMaxMiB > 0 &&
      typeof row.hardCeilingMiB === "number" && Number.isFinite(row.hardCeilingMiB) &&
      row.hardCeilingMiB >= row.defaultMaxMiB
    )
    : [];
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
          <thead><tr><th scope="col">Dokumen</th><th scope="col">Pemakaian</th><th scope="col">Catatan</th><th scope="col">Format & saiz fail (panduan)</th><th scope="col">Rekod sistem</th></tr></thead>
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
