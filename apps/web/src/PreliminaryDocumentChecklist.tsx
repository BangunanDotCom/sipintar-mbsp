import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { preliminarySupportingDocuments } from "../../../packages/shared/src/supporting-documents";

type DocumentRecord = {
  id: string;
  category: string;
  version: number;
  fileName: string;
  scanStatus: string;
  verificationStatus: string;
  supersededAt: string | null;
};
type DocumentResponse = {
  documents: DocumentRecord[];
  uploadEnabled: boolean;
  submissionEnabled: boolean;
};

export function PreliminaryDocumentChecklist({ draftId, capacity }: {
  draftId: string;
  capacity: "INDIVIDUAL" | "COMPANY";
}) {
  const query = useQuery<DocumentResponse>({
    queryKey: ["application-documents", draftId],
    queryFn: () => api(`/application-drafts/${draftId}/documents`),
    retry: false,
  });
  const documents = query.data?.documents ?? [];
  const visible = preliminarySupportingDocuments.filter((item) =>
    item.applicability !== "COMPANY" || capacity === "COMPANY");
  return (
    <section className="panel" aria-labelledby="supporting-documents-heading">
      <h2 id="supporting-documents-heading">Dokumen sokongan permohonan</h2>
      <p>Senarai persediaan awal, tertakluk kepada pengesahan MBSP. Muat naik dokumen permohonan belum diaktifkan.</p>
      {query.isPending && <p role="status">Memuatkan status dokumen...</p>}
      {query.isError && <p role="alert">Status dokumen tidak dapat diperoleh. Tiada dokumen dianggap lengkap.</p>}
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th scope="col">Dokumen</th><th scope="col">Pemakaian</th><th scope="col">Catatan</th><th scope="col">Rekod sistem</th></tr></thead>
          <tbody>
            {visible.map((item) => {
              const current = documents.find((d) => d.category === item.category && !d.supersededAt);
              return (
                <tr key={item.category}>
                  <th scope="row">{item.label}</th>
                  <td>{item.applicability === "ALL" ? "Semua pemohon" : item.applicability === "COMPANY" ? "Pemohon syarikat" : "Jika berkaitan / tersedia"}</td>
                  <td>{item.note}</td>
                  <td>{current
                    ? `Versi ${current.version} · ${current.fileName} · Imbasan: ${current.scanStatus} · Pengesahan: ${current.verificationStatus}`
                    : "Tiada dokumen direkodkan"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p><small>Rekod fail bukan bukti penerimaan atau pengesahan. Penghantaran rasmi dan muat naik kekal tidak tersedia.</small></p>
    </section>
  );
}
