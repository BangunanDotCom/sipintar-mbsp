import React from "react";
import { preliminarySupportingDocuments } from "../../../packages/shared/src/supporting-documents";

export function PreliminaryDocumentChecklist() {
  return (
    <section className="panel" aria-labelledby="supporting-documents-heading">
      <h2 id="supporting-documents-heading">Senarai semak dokumen sokongan (cadangan awal)</h2>
      <p>
        Senarai ini untuk persediaan pemohon sahaja. Muat naik dan pengesahan
        dokumen bagi permohonan belum diaktifkan; tiada dokumen dianggap diterima
        atau disahkan oleh MBSP melalui paparan ini.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th scope="col">Dokumen</th><th scope="col">Pemakaian</th><th scope="col">Catatan</th><th scope="col">Status</th></tr></thead>
          <tbody>
            {preliminarySupportingDocuments.map((item) => (
              <tr key={item.category}>
                <th scope="row">{item.label}</th>
                <td>{item.applicability === "ALL" ? "Semua pemohon" : item.applicability === "COMPANY" ? "Pemohon syarikat" : "Jika berkaitan / tersedia"}</td>
                <td>{item.note}</td>
                <td>Belum boleh dimuat naik</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p><small>Senarai dan keperluan dokumen wajib tertakluk kepada pengesahan pentadbiran Jabatan Bangunan MBSP.</small></p>
    </section>
  );
}
