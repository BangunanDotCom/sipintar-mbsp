import React from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./api";
import { ApplicantDraftWorkspace } from "./ApplicationDraft";
import { Loading, Notice } from "./main";
import { premiseFloorsSchema, summarizePremiseFloors, type PremiseFloor } from "../../../packages/shared/src/floor-summary";
import "./premises.css";

const fields = [
  ["rooms", "Bilik"], ["beds", "Katil"], ["workers", "Pekerja"],
  ["areaSqm", "Keluasan (m²)"],
  ["toilets", "Tandas"], ["bathrooms", "Bilik mandi"], ["sinks", "Sinki"],
  ["diningTables", "Meja makan"], ["diningChairs", "Kerusi makan"],
  ["fireExtinguishers", "Pemadam api"],
] as const;
const facilityKeys = new Set<string>(["toilets", "bathrooms", "sinks", "diningTables", "diningChairs", "fireExtinguishers"]);
function newFloor(): PremiseFloor {
  return { floorLabel: "", rooms: 0, beds: 0, workers: 0, areaSqm: 0,
    facilities: { toilets: 0, bathrooms: 0, sinks: 0, diningTables: 0, diningChairs: 0, fireExtinguishers: 0 } };
}
function FloorEditor({ draftId }: { draftId: string }) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["draft-floors", draftId],
    queryFn: () => api(`/application-drafts/${draftId}/floors`),
    retry: false,
  });
  const [floors, setFloors] = React.useState<PremiseFloor[]>([]);
  const [version, setVersion] = React.useState(1);
  const [dirty, setDirty] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState("");
  const [mismatches, setMismatches] = React.useState<{ field: string; label: string; declared: number; calculated: number }[]>([]);
  React.useEffect(() => {
    if (query.data && !dirty) {
      setFloors(query.data.floors.length ? query.data.floors : [newFloor()]);
      setVersion(query.data.version);
      setMismatches(query.data.mismatches || []);
    }
  }, [query.data, dirty]);
  if (query.error instanceof ApiError && query.error.status === 401)
    return <Navigate replace to={`/log-masuk?next=${encodeURIComponent(`/permohonan/draf/${draftId}/tingkat`)}`} />;
  if (query.isPending) return <Loading />;
  if (query.isError) return <Notice error>{query.error.message}</Notice>;
  const update = (index: number, key: string, raw: string) => {
    setFloors((previous) => previous.map((floor, position) => {
      if (index !== position) return floor;
      if (key === "floorLabel") return { ...floor, floorLabel: raw };
      const number = Number(raw);
      if (facilityKeys.has(key)) return {
        ...floor, facilities: { ...floor.facilities, [key]: number },
      };
      return { ...floor, [key]: number };
    }));
    setDirty(true);
    setMessage("");
  };
  const parsed = premiseFloorsSchema.safeParse(floors);
  const totals = parsed.success ? summarizePremiseFloors(parsed.data) : null;
  return (
    <div className="container">
      <div className="draft-heading">
        <span className="kicker">DRAF PERMOHONAN · MAKLUMAT PENGINAPAN</span>
        <h1>Butiran penginapan mengikut tingkat</h1>
        <p>Isi maklumat setiap aras untuk menjana jadual konsolidasi. Ini bukan pengesahan kapasiti pekerja oleh JTK.</p>
        <Link to={`/permohonan/draf/${draftId}/premis`}>Kembali ke maklumat premis</Link>
      </div>
      <Notice>Maklumat masih berstatus draf. Penghantaran rasmi kepada MBSP belum diaktifkan.</Notice>
      <form className="panel" onSubmit={async (event) => {
        event.preventDefault();
        setError(""); setMessage("");
        const result = premiseFloorsSchema.safeParse(floors);
        if (!result.success) {
          setError(result.error.issues.map((issue) => issue.message).join(" "));
          return;
        }
        setBusy(true);
        try {
          const saved = await api(`/application-drafts/${draftId}/floors`, "PUT", {
            version, floors: result.data,
          });
          setVersion(saved.version);
          setMismatches(saved.mismatches || []);
          setDirty(false);
          setMessage("Maklumat tingkat berjaya disimpan sebagai draf.");
          await qc.invalidateQueries({ queryKey: ["draft-floors", draftId] });
          await qc.invalidateQueries({ queryKey: ["application-drafts"] });
        } catch (cause: any) {
          setError(cause.message || "Maklumat gagal disimpan.");
        } finally { setBusy(false); }
      }}>
        {floors.map((floor, index) => (
          <fieldset key={index} disabled={busy} className="company-record">
            <legend>Aras {index + 1}</legend>
            <div className="premises-fields">
              <label>Nama tingkat
                <input value={floor.floorLabel} maxLength={80} required
                  onChange={(event) => update(index, "floorLabel", event.target.value)}
                  placeholder="Contoh: Tingkat Bawah" />
              </label>
              {fields.map(([key, label]) => (
                <label key={key}>{label}
                  <input type="number" min={0} step={key === "areaSqm" ? "0.01" : "1"}
                    value={facilityKeys.has(key)
                      ? floor.facilities[key as keyof PremiseFloor["facilities"]]
                      : floor[key as "rooms" | "beds" | "workers" | "areaSqm"]}
                    onChange={(event) => update(index, key, event.target.value)} required />
                </label>
              ))}
            </div>
            <button type="button" className="button secondary small" disabled={busy || floors.length === 1}
              onClick={() => { setFloors((current) => current.filter((_, i) => i !== index)); setDirty(true); }}>
              Buang tingkat
            </button>
          </fieldset>
        ))}
        <button type="button" className="button secondary" disabled={busy || floors.length >= 200}
          onClick={() => { setFloors((current) => [...current, newFloor()]); setDirty(true); }}>
          Tambah tingkat
        </button>
        <h2>Jadual jumlah keseluruhan</h2>
        {totals ? (
          <div className="table-scroll"><table>
            <thead><tr><th>Butiran</th><th>Jumlah</th></tr></thead>
            <tbody>
              <tr><td>Tingkat</td><td>{totals.floors}</td></tr>
              <tr><td>Bilik</td><td>{totals.rooms}</td></tr>
              <tr><td>Katil</td><td>{totals.beds}</td></tr>
              <tr><td>Pekerja</td><td>{totals.workers}</td></tr>
              <tr><td>Keluasan (m²)</td><td>{totals.areaSqm}</td></tr>
              {fields.filter(([key]) => facilityKeys.has(key)).map(([key, label]) =>
                <tr key={key}><td>{label}</td><td>{totals.facilities[key as keyof typeof totals.facilities]}</td></tr>)}
            </tbody>
          </table></div>
        ) : <Notice error>Lengkapkan nama tingkat dan semak nilai sebelum menyimpan.</Notice>}
        {mismatches.length > 0 && (
          <Notice error>
            Maklumat agregat premis tidak sepadan dengan butiran tingkat.
            Semak semula sebelum penghantaran rasmi:
            <ul>
              {mismatches.map((item) => (
                <li key={item.field}>
                  {item.label}: maklumat premis {item.declared}; jumlah tingkat {item.calculated}
                </li>
              ))}
            </ul>
            <Link to={`/permohonan/draf/${draftId}/premis`}>Kemaskini maklumat premis</Link>
          </Notice>
        )}
        {error && <Notice error>{error}</Notice>}
        {message && <Notice>{message}</Notice>}
        <button className="button" disabled={busy || !totals}>
          {busy ? "Menyimpan…" : "Simpan butiran tingkat"}
        </button>
        <Link to={`/permohonan/draf/${draftId}/semakan`} className="button secondary">
          Semakan draf
        </Link>
      </form>
    </div>
  );
}
export default function Floors() {
  return <ApplicantDraftWorkspace>{({ draft }) => <FloorEditor draftId={draft.id} />}</ApplicantDraftWorkspace>;
}
