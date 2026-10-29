import React from "react";
import {
  Link,
  Navigate,
  useNavigate,
  useParams,
  useLocation,
} from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Building2,
  FileText,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { api, ApiError, malaysiaTime, setCsrf } from "./api";
import { applicationDraftSchema } from "../../../packages/shared/src/index";
import { Loading, Notice } from "./main";
import "./application-draft.css";

function ProfileDetails({ profile }: { profile: any }) {
  return (
    <dl className="draft-details">
      <div>
        <dt>Nama</dt>
        <dd>{profile.name}</dd>
      </div>
      {profile.registrationNumber && (
        <div>
          <dt>Nombor pendaftaran SSM</dt>
          <dd>{profile.registrationNumber}</dd>
        </div>
      )}
      {profile.identificationMasked && (
        <div>
          <dt>Nombor pengenalan</dt>
          <dd>{profile.identificationMasked}</dd>
        </div>
      )}
      {profile.address && (
        <div>
          <dt>Alamat berdaftar</dt>
          <dd>{profile.address}</dd>
        </div>
      )}
      <div>
        <dt>E-mel</dt>
        <dd>{profile.email}</dd>
      </div>
      <div>
        <dt>Nombor telefon</dt>
        <dd>{profile.phone}</dd>
      </div>
    </dl>
  );
}
export function DraftList({ userId }: { userId: string }) {
  const q = useQuery({
    queryKey: ["application-drafts", userId],
    queryFn: () => api("/application-drafts"),
    retry: false,
  });
  return (
    <section className="panel draft-list" aria-labelledby="draft-list-title">
      <div className="panel-heading">
        <h2 id="draft-list-title">Draf permohonan saya</h2>
        <span className="badge">Belum dihantar</span>
      </div>
      {q.isPending ? (
        <p>Memuatkan draf…</p>
      ) : q.isError ? (
        <Notice error>{q.error.message}</Notice>
      ) : q.data.length ? (
        <>
          <p className="muted">
            Sehingga 50 draf terkini yang masih dalam kebenaran anda.
          </p>
          {q.data.map((d: any) => (
            <article className="company-record draft-list-row" key={d.id}>
              <div>
                <h3>{d.applicantSnapshot.name}</h3>
                <p>
                  {d.capacity === "INDIVIDUAL" ? "Individu" : "Wakil syarikat"}{" "}
                  · Draf
                </p>
                <small>Disimpan {malaysiaTime(d.updatedAt)}</small>
              </div>
              <Link
                className="button secondary small"
                to={`/permohonan/draf/${d.id}`}
              >
                Sambung Semula <ArrowRight size={16} />
              </Link>
            </article>
          ))}
        </>
      ) : (
        <p>Belum ada draf. Pilih kapasiti dan simpan untuk bermula.</p>
      )}
    </section>
  );
}
function DraftEditor({ context, draft }: { context: any; draft?: any }) {
  const nav = useNavigate(),
    qc = useQueryClient();
  const [capacity, setCapacity] = React.useState<string>(draft?.capacity || ""),
    [companyId, setCompanyId] = React.useState(draft?.companyId || ""),
    [notes, setNotes] = React.useState(draft?.notes || ""),
    [version, setVersion] = React.useState(draft?.version),
    [savedAt, setSavedAt] = React.useState(draft?.updatedAt || ""),
    [busy, setBusy] = React.useState(false),
    [message, setMessage] = React.useState(""),
    [error, setError] = React.useState("");
  const company = context.companies.find((c: any) => c.id === companyId);
  const applicant = capacity === "INDIVIDUAL" ? context.individual : company;
  const initiator = draft?.initiatorSnapshot || context.initiatedBy;
  return (
    <>
      <div className="draft-heading">
        <span className="kicker">PENGINAPAN PEKERJA TEMPOH TERHAD</span>
        <h1>{draft ? "Sambung Draf PPTT" : "Permohonan Baharu PPTT"}</h1>
        <p>Mulakan urusan anda dengan memilih kapasiti pemohon.</p>
        <Link to="/dashboard" className="text-button">
          Kembali ke dashboard
        </Link>
      </div>
      <Notice>
        Fasa 2B.2 — Penyediaan draf sahaja. Penghantaran rasmi, nombor rujukan
        MBSP dan semakan permohonan belum dibuka.
      </Notice>
      <div className="draft-layout">
        <form
          className="panel draft-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const next =
              (e.nativeEvent as SubmitEvent).submitter?.getAttribute(
                "value",
              ) === "premises";
            setError("");
            setMessage("");
            const result = applicationDraftSchema.safeParse({
              capacity,
              ...(capacity === "COMPANY" ? { companyId } : {}),
              notes,
            });
            if (!result.success) {
              setError(
                "Pilih kapasiti yang sah, pilih syarikat jika berkenaan dan hadkan catatan kepada 2,000 aksara.",
              );
              return;
            }
            setBusy(true);
            try {
              const saved = await api(
                draft
                  ? `/application-drafts/${draft.id}`
                  : "/application-drafts",
                draft ? "PATCH" : "POST",
                { ...result.data, ...(draft ? { version } : {}) },
              );
              setVersion(saved.version);
              setSavedAt(saved.updatedAt);
              setMessage("Draf berjaya disimpan. Belum dihantar kepada MBSP.");
              await qc.invalidateQueries({ queryKey: ["application-drafts"] });
              if (next) nav(`/permohonan/draf/${saved.id}/premis`);
              else if (!draft)
                nav(`/permohonan/draf/${saved.id}`, { replace: true });
            } catch (err: any) {
              if (err instanceof ApiError && err.status === 401)
                nav(
                  `/log-masuk?next=${encodeURIComponent(draft ? `/permohonan/draf/${draft.id}` : "/permohonan/baharu")}`,
                  { replace: true },
                );
              else setError(err.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>
            <span className="draft-step">01</span> Kapasiti permohonan
          </h2>
          <fieldset disabled={busy} className="draft-capacities">
            <legend>Pilih kapasiti anda</legend>
            <label className={capacity === "INDIVIDUAL" ? "selected" : ""}>
              <input
                type="radio"
                name="capacity"
                value="INDIVIDUAL"
                checked={capacity === "INDIVIDUAL"}
                onChange={() => {
                  setCapacity("INDIVIDUAL");
                  setMessage("");
                }}
                required
              />
              <UserRound size={21} />
              <span>Individu atas kapasiti sendiri</span>
            </label>
            <label className={capacity === "COMPANY" ? "selected" : ""}>
              <input
                type="radio"
                name="capacity"
                value="COMPANY"
                checked={capacity === "COMPANY"}
                onChange={() => {
                  setCapacity("COMPANY");
                  setMessage("");
                }}
              />
              <Building2 size={21} />
              <span>Wakil syarikat</span>
            </label>
          </fieldset>
          {capacity === "COMPANY" && (
            <div className="draft-company-select">
              <label>
                Syarikat yang diwakili
                <select
                  aria-label="Syarikat yang diwakili"
                  value={companyId}
                  onChange={(e) => {
                    setCompanyId(e.target.value);
                    setMessage("");
                  }}
                  required
                  disabled={busy}
                >
                  <option value="">Pilih syarikat</option>
                  {context.companies.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.registrationNumber}
                    </option>
                  ))}
                </select>
              </label>
              {!context.companies.length && (
                <Notice>
                  Tiada profil syarikat dengan kebenaran aktif. Urus profil atau
                  jemputan wakil melalui <Link to="/dashboard">dashboard</Link>{" "}
                  terlebih dahulu.
                </Notice>
              )}
            </div>
          )}
          <section
            className="draft-official"
            aria-labelledby="official-applicant-title"
          >
            <h2 id="official-applicant-title">
              <span className="draft-step">02</span> Pemohon rasmi
            </h2>
            {applicant ? (
              <>
                <p className="muted">
                  Maklumat diisi daripada profil anda. Perubahan profil akan
                  digunakan apabila draf disimpan semula.
                </p>
                <ProfileDetails profile={applicant} />
                {capacity === "COMPANY" && (
                  <p className="draft-pending">
                    Pengesahan rasmi maklumat syarikat dan surat kuasa masih
                    tertakluk kepada semakan MBSP.
                  </p>
                )}
              </>
            ) : (
              <p>
                Pilih kapasiti dan syarikat, jika berkenaan, untuk melihat
                maklumat pemohon.
              </p>
            )}
          </section>
          <label>
            Catatan draf (pilihan)
            <textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setMessage("");
              }}
              maxLength={2000}
              rows={4}
              disabled={busy}
            />
            <small>
              {notes.length}/2,000 aksara. Jangan masukkan kata laluan atau
              nombor pengenalan penuh.
            </small>
          </label>
          {draft && (
            <p className="muted">
              Maklumat tersimpan: {draft.applicantSnapshot.name}. Kapasiti boleh
              dikemas kini selagi kebenaran masih sah.
            </p>
          )}
          {savedAt && (
            <p className="draft-saved">
              <ShieldCheck size={16} /> Draf disimpan · {malaysiaTime(savedAt)}
            </p>
          )}
          {message && <Notice>{message}</Notice>}
          {error && <Notice error>{error}</Notice>}
          <div className="draft-actions">
            <button className="button" disabled={busy || !applicant}>
              {busy ? "Menyimpan…" : "Simpan Draf"}
              <Save size={16} />
            </button>
            <button
              className="button secondary"
              name="step"
              value="premises"
              disabled={busy || !applicant}
            >
              Seterusnya <ArrowRight size={16} />
            </button>
            <button
              className="button secondary"
              type="button"
              disabled
              title="Penghantaran rasmi belum tersedia"
            >
              Hantar Permohonan (belum tersedia)
            </button>
          </div>
        </form>
        <aside className="draft-side">
          <section className="panel">
            <h2>
              <UserRound size={21} /> Pengguna yang memulakan
            </h2>
            <p className="muted">
              Identiti akaun ini direkodkan berasingan daripada pemohon rasmi
              dan kekal sebagai pemilik draf.
            </p>
            <ProfileDetails profile={initiator} />
          </section>
          {capacity === "COMPANY" && company && (
            <section className="panel">
              <h2>Wakil syarikat</h2>
              <ProfileDetails profile={company.representative} />
              <p>
                Jenis kuasa:{" "}
                {company.representative.authorityType.replaceAll("_", " ")}
              </p>
              <span className="badge">
                {company.representative.status === "VERIFIED"
                  ? "Perwakilan disahkan"
                  : "Perwakilan menunggu semakan MBSP"}
              </span>
            </section>
          )}
          <section className="panel">
            <h2>
              <FileText size={21} /> Langkah seterusnya
            </h2>
            <p>
              Draf hanya boleh disambung oleh akaun yang memulakannya. Anda
              boleh kembali ke halaman ini melalui senarai draf.
            </p>
            <p>
              Gunakan Seterusnya untuk mengisi maklumat premis. Penghantaran
              rasmi belum tersedia.
            </p>
          </section>
        </aside>
      </div>
      <DraftList userId={context.initiatedBy.userId} />
    </>
  );
}
export function ApplicantDraftWorkspace({
  children,
}: {
  children: (data: { context: any; draft: any }) => React.ReactNode;
}) {
  const { id } = useParams(),
    qc = useQueryClient();
  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const result = await api("/auth/me");
      setCsrf(result.csrf);
      return result;
    },
    retry: false,
    staleTime: 0,
  });
  const me = meQuery.data,
    role = me?.roles.find((r: any) =>
      ["PEMOHON", "WAKIL_SYARIKAT"].includes(r.id),
    );
  const context = useQuery({
    queryKey: ["draft-context", me?.user.id],
    enabled: !!me?.user.emailVerified && me.user.kind === "APPLICANT" && !!role,
    retry: false,
    queryFn: async () => {
      if (!["PEMOHON", "WAKIL_SYARIKAT"].includes(me.activeRole)) {
        await api("/auth/role", "POST", { roleId: role.id });
        qc.setQueryData(["me"], { ...me, activeRole: role.id });
      }
      return api("/application-drafts/context");
    },
  });
  const draft = useQuery({
    queryKey: ["application-draft", me?.user.id, id],
    queryFn: () => api(`/application-drafts/${id}`),
    enabled: !!id && context.isSuccess,
    retry: false,
    staleTime: 0,
  });
  const destination = useLocation().pathname;
  const failed = [meQuery.error, context.error, draft.error].find(
    (e) => e instanceof ApiError && e.status === 401,
  );
  if (failed)
    return (
      <Navigate
        replace
        to={`/log-masuk?next=${encodeURIComponent(destination)}`}
      />
    );
  if (meQuery.isPending) return <Loading />;
  if (meQuery.isError)
    return (
      <div className="container info-page">
        <Notice error>{meQuery.error.message}</Notice>
      </div>
    );
  if (!me.user.emailVerified || me.user.kind !== "APPLICANT" || !role)
    return (
      <div className="container info-page">
        <Notice error>
          {!me.user.emailVerified
            ? "Sahkan e-mel dahulu sebelum memulakan permohonan."
            : "Akaun dan peranan pemohon aktif diperlukan."}
        </Notice>
        <Link className="button" to="/dashboard">
          Urus akaun
        </Link>
      </div>
    );
  if (context.isError || draft.isError)
    return (
      <div className="container info-page">
        <Notice error>{context.error?.message || draft.error?.message}</Notice>
        <Link className="button" to="/dashboard">
          Kembali ke dashboard
        </Link>
      </div>
    );
  if (!context.data || (id && !draft.data)) return <Loading />;
  return (
    <main className="container draft-page">
      {children({ context: context.data, draft: id ? draft.data : undefined })}
    </main>
  );
}

export default function ApplicationDraft() {
  return (
    <ApplicantDraftWorkspace>
      {({ context, draft }) => (
        <DraftEditor key={draft?.id || "new"} context={context} draft={draft} />
      )}
    </ApplicantDraftWorkspace>
  );
}
