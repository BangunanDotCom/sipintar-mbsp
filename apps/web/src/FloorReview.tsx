import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { Loading, Notice } from "./main";
import { premiseFloorsSchema, summarizePremiseFloors } from "../../../packages/shared/src/floor-summary";
import { comparePremisesTotals } from "../../../packages/shared/src/premises-consistency";

const columns = [
  ["rooms", "Bilik"], ["beds", "Katil"], ["workers", "Pekerja"],
  ["areaSqm", "Keluasan (m²)"],
] as const;
const facilities = [
  ["toilets", "Tandas"], ["bathrooms", "Bilik mandi"], ["sinks", "Sinki"],
  ["diningTables", "Meja makan"], ["diningChairs", "Kerusi makan"],
  ["fireExtinguishers", "Pemadam api"],
] as const;

export function FloorReview({ draftId, premises }: { draftId: string; premises: any }) {
  const q = useQuery({
    queryKey: ["draft-floors", draftId],
    queryFn: () => api(`/application-drafts/${draftId}/floors`),
    retry: false,
  });
  if (q.isPending) return <section className="panel"><Loading /></section>;
  if (q.isError) return <section className="panel"><Notice error>{q.error.message}</Notice></section>;
  const result = premiseFloorsSchema.safeParse(q.data.floors);
  if (!result.success) return (
    <section className="panel">
      <h2>Butiran tingkat</h2>
      <Notice error>Data tingkat belum lengkap atau tidak sah.</Notice>
      <Link to={`/permohonan/draf/${draftId}/tingkat`}>Kemaskini butiran tingkat</Link>
    </section>
  );
  const floors = result.data;
  const totals = summarizePremiseFloors(floors);
  const mismatches = comparePremisesTotals({
    involvedFloors: premises.involvedFloors,
    totalRooms: premises.totalRooms,
    proposedWorkers: premises.proposedWorkers,
    floorAreaSqm: premises.floorAreaSqm,
  }, totals);
  return (
    <section className="panel">
      <h2>Jadual konsolidasi penginapan mengikut tingkat</h2>
      <p>Maklumat diisytiharkan pemohon untuk semakan MBSP; bukan pengesahan kapasiti oleh JTK.</p>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead><tr>
            <th scope="col">Tingkat</th>
            {columns.map(([key, label]) => <th scope="col" key={key}>{label}</th>)}
            {facilities.map(([key, label]) => <th scope="col" key={key}>{label}</th>)}
          </tr></thead>
          <tbody>
            {floors.map((floor, index) => (
              <tr key={index}>
                <th scope="row">{floor.floorLabel}</th>
                {columns.map(([key]) => <td key={key}>{floor[key]}</td>)}
                {facilities.map(([key]) => <td key={key}>{floor.facilities[key]}</td>)}
              </tr>
            ))}
            <tr>
              <th scope="row">JUMLAH</th>
              {columns.map(([key]) => <td key={key}><strong>{totals[key]}</strong></td>)}
              {facilities.map(([key]) => <td key={key}><strong>{totals.facilities[key]}</strong></td>)}
            </tr>
          </tbody>
        </table>
      </div>
      {mismatches.length > 0 && (
        <Notice error>
          Jumlah tingkat tidak sepadan dengan maklumat premis. Semak semula:
          <ul>{mismatches.map((item) => (
            <li key={item.field}>{item.label}: premis {item.declared}, tingkat {item.calculated}</li>
          ))}</ul>
        </Notice>
      )}
      <Link className="button secondary" to={`/permohonan/draf/${draftId}/tingkat`}>
        {mismatches.length ? "Betulkan butiran tingkat" : "Kemaskini butiran tingkat"}
      </Link>
      {mismatches.length > 0 && (
        <Link className="button secondary" to={`/permohonan/draf/${draftId}/premis`}>
          Betulkan maklumat premis
        </Link>
      )}
    </section>
  );
}
