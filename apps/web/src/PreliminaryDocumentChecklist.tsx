import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { documentChecklistRows, documentStatusLabels, type DocumentStatusRecord } from "../../../packages/shared/src/document-checklist-status";

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
  const documents = query.isSuccess ? query.data.documents : [];
  const visible = documentChecklistRows(capacity, documents);
  const policyByCategory = new Map(
    (query.isSuccess ? query.data.uploadPolicy ?? [] : []).map((row) => [row.category, row]),
  );
  const mimeLabel = (mime: string) => mime === "application/pdf" ? "PDF" :
    mime === "image/jpeg" ? "JPEG" : mime === "image/png" ? "PNG" : mime;
  return (
    <section className="panel" aria-labelledby="supporting-documents-heading">
      <h2 id="supporting-documents-heading">Dokumen sokongan permohonan</h2>
      <p>Senarai persediaan awal, tertakluk kepada pengesahan MBSP. Muat naik dokumen permohonan belum diaktifkan.</p>
      {query.isPending && <p role="status">Memuatkan status dokumen...</p>}
      {query.isError && <p role="alert">Status dokumen tidak dapat diperoleh. Tiada dokumen dianggap lengkap.</p>}
      {query.isSuccess && <div style={{ overflowX: "auto" }}>
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
