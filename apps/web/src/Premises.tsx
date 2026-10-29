import React from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  MapPin,
  Save,
  ShieldCheck,
} from "lucide-react";
import { ApplicantDraftWorkspace } from "./ApplicationDraft";
import { api, ApiError, malaysiaTime } from "./api";
import { Loading, Notice } from "./main";
import {
  premisesFieldsSchema,
  completePremisesSchema,
  type PremisesFields,
} from "../../../packages/shared/src/premises";
import PremisesMap from "./PremisesMap";
import "./premises.css";
const textFields = [
  { name: "address", label: "Alamat penuh premis", max: 1000, area: true },
  { name: "postcode", label: "Poskod", max: 5 },
  { name: "lotNumber", label: "Nombor lot / PT", max: 120 },
  { name: "locality", label: "Mukim atau bandar", max: 160 },
] as const;
const buildingFields = [
  { name: "buildingType", label: "Jenis bangunan", max: 160 },
  { name: "currentUse", label: "Kegunaan bangunan sedia ada", max: 200 },
] as const;
const counts = [
  { name: "involvedFloors", label: "Bilangan tingkat terlibat" },
  { name: "accommodationUnits", label: "Bilangan unit penginapan" },
  { name: "totalRooms", label: "Bilangan bilik keseluruhan" },
  { name: "floorAreaSqm", label: "Jumlah keluasan lantai terlibat (m²)" },
  { name: "proposedWorkers", label: "Jumlah pekerja yang dicadangkan" },
] as const;
const certificates: Record<string, string> = {
  CCC: "CCC — Certificate of Completion and Compliance",
  CFO: "CFO — Certificate of Fitness for Occupation",
  OC: "OC — Occupation Certificate",
  NOT_APPLICABLE: "Tidak berkaitan",
  UNKNOWN: "Belum dipastikan",
};
const districts: Record<string, string> = {
  SPU: "Seberang Perai Utara (SPU)",
  SPT: "Seberang Perai Tengah (SPT)",
  SPS: "Seberang Perai Selatan (SPS)",
};
function Steps({
  draftId,
  review = false,
}: {
  draftId: string;
  review?: boolean;
}) {
  return (
    <nav className="premises-steps" aria-label="Bahagian borang">
      <Link to={`/permohonan/draf/${draftId}`}>1 · Maklumat pemohon</Link>
      <Link
        to={`/permohonan/draf/${draftId}/premis`}
        aria-current={!review ? "step" : undefined}
      >
        2 · Maklumat premis
      </Link>
      <span aria-current={review ? "step" : undefined}>3 · Semakan draf</span>
    </nav>
  );
}
function PremisesSummary({ record }: { record: any }) {
  const p: PremisesFields = record.premises;
  if (!record.complete)
    return (
      <Navigate replace to={`/permohonan/draf/${record.draftId}/premis`} />
    );
  return (
    <>
      <Steps draftId={record.draftId} review />
      <div className="draft-heading">
        <span className="kicker">SEMAKAN MAKLUMAT TERSIMPAN</span>
        <h1>Semakan Draf PPTT</h1>
        <p>
          Maklumat pemohon dan premis telah disimpan. Ini bukan penghantaran
          rasmi kepada MBSP.
        </p>
      </div>
      <Notice>
        Penghantaran rasmi dan kelulusan tidak tersedia. Semakan ini hanya
        memaparkan maklumat draf anda.
      </Notice>
      <div className="premises-review-grid">
        <section className="panel">
          <h2>Pemohon rasmi</h2>
          <dl className="draft-details">
            <div>
              <dt>Nama</dt>
              <dd>{record.applicant.name}</dd>
            </div>
            {record.applicant.registrationNumber && (
              <div>
                <dt>Nombor SSM</dt>
                <dd>{record.applicant.registrationNumber}</dd>
              </div>
            )}
            <div>
              <dt>E-mel</dt>
              <dd>{record.applicant.email}</dd>
            </div>
          </dl>
        </section>
        <section className="panel">
          <h2>Lokasi premis</h2>
          <dl className="draft-details">
            {textFields.map((f) => (
              <div key={f.name}>
                <dt>{f.label}</dt>
                <dd>{p[f.name]}</dd>
              </div>
            ))}
            <div>
              <dt>Daerah diisytiharkan</dt>
              <dd>{districts[p.districtId!]}</dd>
            </div>
            <div>
              <dt>Koordinat pin pengguna</dt>
              <dd>
                {p.latitude?.toFixed(6)}, {p.longitude?.toFixed(6)}
              </dd>
            </div>
          </dl>
          <p className="premises-gis-note">
            Sempadan daerah belum disahkan GIS rasmi MBSP.
          </p>
        </section>
        <section className="panel">
          <h2>Maklumat bangunan agregat</h2>
          <dl className="draft-details">
            {[...buildingFields, ...counts].map((f) => (
              <div key={f.name}>
                <dt>{f.label}</dt>
                <dd>{p[f.name]}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="panel">
          <h2>Maklumat CCC / CFO / OC</h2>
          <dl className="draft-details">
            <div>
              <dt>Jenis sijil</dt>
              <dd>{certificates[p.certificateType!]}</dd>
            </div>
            <div>
              <dt>Nombor rujukan</dt>
              <dd>{p.certificateNumber || "Tidak dinyatakan"}</dd>
            </div>
            <div>
              <dt>Tarikh sijil</dt>
              <dd>{p.certificateDate || "Tidak dinyatakan"}</dd>
            </div>
          </dl>
          <p>
            Kesahihan sijil dan kelayakan premis tertakluk kepada semakan
            pegawai MBSP.
          </p>
        </section>
      </div>
      <div className="premises-actions">
        <Link
          className="button secondary"
          to={`/permohonan/draf/${record.draftId}/premis`}
        >
          <ArrowLeft size={16} />
          Sebelumnya
        </Link>
        <Link className="button" to="/dashboard">
          Kembali ke Dashboard
        </Link>
        <button className="button secondary" disabled>
          Hantar Permohonan (belum tersedia)
        </button>
      </div>
    </>
  );
}
function PremisesEditor({ record }: { record: any }) {
  const nav = useNavigate(),
    qc = useQueryClient();
  const [values, setValues] = React.useState<Record<string, string>>(() =>
      Object.fromEntries(
        Object.entries(record.premises).map(([k, v]) => [
          k,
          v === null ? "" : String(v),
        ]),
      ),
    ),
    [version, setVersion] = React.useState(record.version),
    [savedAt, setSavedAt] = React.useState(record.updatedAt),
    [busy, setBusy] = React.useState(false),
    [error, setError] = React.useState(""),
    [message, setMessage] = React.useState(""),
    [errors, setErrors] = React.useState<Record<string, string>>({});
  const errorBox = React.useRef<HTMLDivElement>(null);
  const set = (key: string, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setMessage("");
    setErrors((e) => ({ ...e, [key]: "" }));
  };
  const number = (k: string) => (values[k] === "" ? null : Number(values[k]));
  async function save(continueNext: boolean, previous = false) {
    setError("");
    setMessage("");
    const raw = Object.fromEntries(
      Object.entries(values).map(([k, v]) => [k, v.trim() === "" ? null : v]),
    );
    for (const k of ["latitude", "longitude", ...counts.map((x) => x.name)])
      raw[k] = number(k) as any;
    const checked = (
      continueNext ? completePremisesSchema : premisesFieldsSchema
    ).safeParse(raw);
    if (!checked.success) {
      const fields: Record<string, string> = {};
      for (const issue of checked.error.issues)
        fields[String(issue.path[0])] = issue.message;
      setErrors(fields);
      setError(
        "Semak medan yang ditandakan sebelum menyimpan atau meneruskan.",
      );
      requestAnimationFrame(() => errorBox.current?.focus());
      return;
    }
    setBusy(true);
    try {
      const data = await api(
        `/application-drafts/${record.draftId}/premises`,
        "PUT",
        {
          version,
          action: continueNext ? "CONTINUE" : "SAVE",
          premises: checked.data,
        },
      );
      setVersion(data.version);
      setSavedAt(data.updatedAt);
      setMessage(
        "Maklumat premis berjaya disimpan sebagai draf. Belum dihantar kepada MBSP.",
      );
      qc.setQueryData(["premises", record.draftId], data);
      qc.setQueriesData({ queryKey: ["application-draft"] }, (old: any) =>
        old?.id === record.draftId ? { ...old, version: data.version } : old,
      );
      await qc.invalidateQueries({ queryKey: ["application-drafts"] });
      if (continueNext) nav(`/permohonan/draf/${record.draftId}/semakan`);
      else if (previous) nav(`/permohonan/draf/${record.draftId}`);
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 401)
        nav(
          `/log-masuk?next=${encodeURIComponent(`/permohonan/draf/${record.draftId}/premis`)}`,
          { replace: true },
        );
      else setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const feedback = (name: string) =>
    errors[name] ? (
      <small id={`error-${name}`} className="premises-field-error">
        {errors[name]}
      </small>
    ) : null;
  return (
    <>
      <Steps draftId={record.draftId} />
      <div className="draft-heading">
        <span className="kicker">BAHAGIAN 2 · BORANG DRAF PPTT</span>
        <h1>Maklumat Premis Penginapan Pekerja Tempoh Terhad</h1>
        <p>Rekodkan lokasi premis dan jumlah agregat bangunan yang terlibat.</p>
      </div>
      <Notice>
        Simpan Draf membenarkan maklumat belum lengkap. Seterusnya memerlukan
        semua medan asas dan pin lokasi. Tiada penghantaran rasmi dibuat.
      </Notice>
      <form
        className="premises-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save(
            (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ===
              "continue",
          );
        }}
      >
        {error && (
          <div ref={errorBox} tabIndex={-1}>
            <Notice error>{error}</Notice>
          </div>
        )}
        <fieldset disabled={busy} className="premises-fieldset">
          <section className="panel">
            <h2>
              <MapPin size={22} /> Maklumat lokasi
            </h2>
            <div className="premises-fields">
              {textFields.map((f) => (
                <label
                  className={f.name === "address" ? "premises-wide" : ""}
                  key={f.name}
                >
                  {f.label}
                  {f.name === "address" ? (
                    <textarea
                      aria-label={f.label}
                      aria-invalid={!!errors[f.name]}
                      aria-describedby={
                        errors[f.name] ? `error-${f.name}` : undefined
                      }
                      value={values[f.name]}
                      onChange={(e) => set(f.name, e.target.value)}
                      maxLength={f.max}
                      rows={3}
                    />
                  ) : (
                    <input
                      aria-label={f.label}
                      aria-invalid={!!errors[f.name]}
                      aria-describedby={
                        errors[f.name] ? `error-${f.name}` : undefined
                      }
                      value={values[f.name]}
                      onChange={(e) => set(f.name, e.target.value)}
                      maxLength={f.max}
                      inputMode={f.name === "postcode" ? "numeric" : "text"}
                    />
                  )}{" "}
                  {feedback(f.name)}
                </label>
              ))}
              <label>
                Daerah (diisytiharkan pemohon)
                <select
                  aria-label="Daerah (diisytiharkan pemohon)"
                  value={values.districtId}
                  aria-invalid={!!errors.districtId}
                  onChange={(e) => set("districtId", e.target.value)}
                >
                  <option value="">Pilih daerah</option>
                  {Object.entries(districts).map(([key, text]) => (
                    <option key={key} value={key}>
                      {text}
                    </option>
                  ))}
                </select>
                {feedback("districtId")}
              </label>
            </div>
            <PremisesMap
              latitude={number("latitude")}
              longitude={number("longitude")}
              disabled={busy}
              onPick={(lat, lng) => {
                set("latitude", String(lat));
                set("longitude", String(lng));
              }}
            />
            {feedback("latitude")}
            {feedback("longitude")}
          </section>
          <section className="panel">
            <h2>
              <Building2 size={22} /> Maklumat bangunan
            </h2>
            <p className="premises-help">
              Jumlah keseluruhan bagi premis ini sahaja. Rekod setiap bilik
              secara individu tidak diperlukan.
            </p>
            <div className="premises-fields">
              {buildingFields.map((f) => (
                <label key={f.name}>
                  {f.label}
                  <input
                    aria-label={f.label}
                    value={values[f.name]}
                    onChange={(e) => set(f.name, e.target.value)}
                    maxLength={f.max}
                    aria-invalid={!!errors[f.name]}
                  />
                  {feedback(f.name)}
                </label>
              ))}
              {counts.map((f) => (
                <label key={f.name}>
                  {f.label}
                  <input
                    aria-label={f.label}
                    type="number"
                    inputMode={
                      f.name === "floorAreaSqm" ? "decimal" : "numeric"
                    }
                    min={f.name === "floorAreaSqm" ? "0.01" : "1"}
                    step={f.name === "floorAreaSqm" ? "0.01" : "1"}
                    max={
                      f.name === "floorAreaSqm" ? "1000000000" : "2147483647"
                    }
                    value={values[f.name]}
                    onChange={(e) => set(f.name, e.target.value)}
                    aria-invalid={!!errors[f.name]}
                  />
                  {feedback(f.name)}
                </label>
              ))}
            </div>
          </section>
          <section className="panel">
            <h2>Maklumat CCC / CFO / OC</h2>
            <p className="premises-help">
              Nyatakan sijil jika berkaitan. Pilihan ini tidak mengesahkan
              kesahihan sijil atau meluluskan premis.
            </p>
            <div className="premises-fields">
              <label>
                Jenis sijil
                <select
                  aria-label="Jenis sijil"
                  value={values.certificateType}
                  aria-invalid={!!errors.certificateType}
                  onChange={(e) => {
                    set("certificateType", e.target.value);
                    if (!["CCC", "CFO", "OC"].includes(e.target.value)) {
                      set("certificateNumber", "");
                      set("certificateDate", "");
                    }
                  }}
                >
                  <option value="">Pilih status sijil</option>
                  {Object.entries(certificates).map(([key, text]) => (
                    <option key={key} value={key}>
                      {text}
                    </option>
                  ))}
                </select>
                {feedback("certificateType")}
              </label>
              {["CCC", "CFO", "OC"].includes(values.certificateType) && (
                <>
                  <label>
                    Nombor rujukan sijil
                    <input
                      aria-label="Nombor rujukan sijil"
                      value={values.certificateNumber}
                      maxLength={120}
                      aria-invalid={!!errors.certificateNumber}
                      onChange={(e) => set("certificateNumber", e.target.value)}
                    />
                    {feedback("certificateNumber")}
                  </label>
                  <label>
                    Tarikh sijil (jika diketahui)
                    <input
                      aria-label="Tarikh sijil (jika diketahui)"
                      type="date"
                      max={new Date().toISOString().slice(0, 10)}
                      value={values.certificateDate}
                      aria-invalid={!!errors.certificateDate}
                      onChange={(e) => set("certificateDate", e.target.value)}
                    />
                    {feedback("certificateDate")}
                  </label>
                </>
              )}
            </div>
          </section>
        </fieldset>
        {message && <Notice>{message}</Notice>}
        {savedAt && (
          <p className="draft-saved">
            <ShieldCheck size={16} />
            Maklumat premis disimpan · {malaysiaTime(savedAt)}
          </p>
        )}
        <div className="premises-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => void save(false, true)}
          >
            <ArrowLeft size={16} />
            Sebelumnya
          </button>
          <button
            className="button secondary"
            name="action"
            value="save"
            disabled={busy}
          >
            <Save size={16} />
            {busy ? "Menyimpan…" : "Simpan Draf"}
          </button>
          <button
            className="button"
            name="action"
            value="continue"
            disabled={busy}
          >
            Seterusnya
            <ArrowRight size={16} />
          </button>
        </div>
        <p className="premises-help">
          Sebelumnya menyimpan perubahan yang sah sebelum kembali ke maklumat
          pemohon.
        </p>
      </form>
    </>
  );
}
function PremisesWorkspace({ draft, review }: { draft: any; review: boolean }) {
  const q = useQuery({
    queryKey: ["premises", draft.id],
    queryFn: () => api(`/application-drafts/${draft.id}/premises`),
    retry: false,
    staleTime: 0,
  });
  if (q.error instanceof ApiError && q.error.status === 401)
    return (
      <Navigate
        replace
        to={`/log-masuk?next=${encodeURIComponent(`/permohonan/draf/${draft.id}/${review ? "semakan" : "premis"}`)}`}
      />
    );
  if (q.isPending) return <Loading />;
  if (q.isError)
    return (
      <>
        <Notice error>{q.error.message}</Notice>
        <Link to="/dashboard">Kembali ke dashboard</Link>
      </>
    );
  return review ? (
    <PremisesSummary record={q.data} />
  ) : (
    <PremisesEditor key={draft.id} record={q.data} />
  );
}
export default function Premises({ review = false }: { review?: boolean }) {
  return (
    <ApplicantDraftWorkspace>
      {({ draft }) => <PremisesWorkspace draft={draft} review={review} />}
    </ApplicantDraftWorkspace>
  );
}
