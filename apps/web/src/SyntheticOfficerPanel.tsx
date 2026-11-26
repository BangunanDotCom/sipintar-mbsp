import { SyntheticCompletionCase } from "./SyntheticCompletion";
import { SyntheticReviewComparison } from "./SyntheticReviewComparison";
import { SyntheticInvoice } from "./SyntheticInvoice";
import { useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "./api";
import {
  SyntheticFeedback,
  SyntheticLoadError,
  syntheticErrorMessage,
  syntheticReviewStatus,
  type ActionFeedback,
  type SyntheticReviewStatus,
} from "./synthetic-portal-ui";

type Review = {
  id: string;
  version: number;
  status: SyntheticReviewStatus;
  evidenceEligible: boolean;
  reference: string | null;
  correctionReason: string | null;
  units: { label: string; floorCount: number }[];
  evidence: { category: string; version: number; scanStatus: string }[];
  advice: { missing: string[] };
};

const adviceMessages: Record<string, string> = {
  UNITS_MISSING: "Inventori unit belum lengkap.",
  FLOORS_MISSING: "Inventori tingkat belum lengkap.",
  EVIDENCE_MISSING: "Bukti yang layak belum lengkap.",
};

function ApplicationReport({ userId, role }: { userId:string; role:string }) {
  const [filters, setFilters] = useState({ from:"", to:"", category:"" });
  const [query, setQuery] = useState<string | null>(null);
  const report = useQuery<{
    district:string;
    rows: {status:SyntheticReviewStatus;cases:number;firstPaid:number;secondPaid:number;referred:number;overdue:number;closed:number}[];
  }>({
    queryKey:["synthetic-application-report",userId,role,query],
    queryFn: () => api(`/synthetic-portal/reports/applications?${query}`),
    enabled: query !== null,
    retry:false,
  });
  return (
    <details className="company-record">
      <summary>Laporan semua serahan dalam skop</summary>
      <form className="synthetic-controls" onSubmit={(event) => {
        event.preventDefault();
        const params = new URLSearchParams();
        for (const [key,value] of Object.entries(filters)) if (value.trim()) params.set(key,value.trim());
        const next = params.toString();
        if (query === next) void report.refetch();
        else setQuery(next);
      }}>
        <label>Dari tarikh serahan<input type="date" value={filters.from} onChange={(e) => setFilters({...filters,from:e.target.value})} /></label>
        <label>Hingga tarikh serahan<input type="date" value={filters.to} onChange={(e) => setFilters({...filters,to:e.target.value})} /></label>
        <label>Jenis bangunan<input maxLength={160} value={filters.category} onChange={(e)=>setFilters({...filters,category:e.target.value})} /></label>
        <button className="button small" disabled={report.isFetching}>Papar laporan</button>
      </form>
      {report.isFetching && <p role="status">Memuatkan laporan…</p>}
      {report.isError && <p role="alert">{syntheticErrorMessage(report.error)}</p>}
      {report.data && !report.isError && (
        <>
          <p>{report.data.district} · {report.data.rows.reduce((total, row)=>total+row.cases,0)} serahan</p>
          {report.data.rows.map((row) => (
            <p key={row.status}>{syntheticReviewStatus[row.status]} · {row.cases} kes · Bayaran 1 {row.firstPaid} · Bayaran 2 {row.secondPaid} · Dirujuk {row.referred} · Lewat {row.overdue} · Ditutup {row.closed}</p>
          ))}
          <a href={`/api/synthetic-portal/reports/applications?format=csv${query ? "&"+query : ""}`}>Eksport laporan serahan CSV</a>
        </>
      )}
    </details>
  );
}

function ApplicationArchive({userId, role}:{userId:string;role:string}) {
  const [page,setPage] = useState(0);
  const query = useQuery<{district:string;items:{id:string;closedAt:string}[];nextPage:number|null}>({
    queryKey:["synthetic-archive",userId,role,page],
    queryFn:()=>api(`/synthetic-portal/reports/archive?page=${page}`),
    enabled:page>0,
    retry:false,
  });
  return (
    <details className="company-record" onToggle={(event)=>{
      if (event.currentTarget.open) setPage((previous)=>previous || 1);
    }}>
      <summary>Arkib kes latihan ditutup</summary>
      {query.isFetching && <p role="status">Memuatkan arkib…</p>}
      {query.isError && <p role="alert">{syntheticErrorMessage(query.error)}</p>}
      {query.data && <p>{query.data.district} · Halaman {page}</p>}
      {query.data?.items.length===0 && <p>Tiada kes dalam skop halaman ini.</p>}
      <ul>{query.data?.items.map(({id,closedAt})=>(
        <li key={id}><code>{id}</code> · {new Date(closedAt).toLocaleString("ms-MY",{timeZone:"Asia/Kuala_Lumpur"})}</li>
      ))}</ul>
      {query.data && <div>
        <button className="button small secondary" type="button" disabled={page<=1} onClick={()=>setPage(page-1)}>Sebelumnya</button>
        <button className="button small secondary" type="button" disabled={!query.data.nextPage}
          onClick={()=>query.data?.nextPage && setPage(query.data.nextPage)}>Seterusnya</button>
      </div>}
    </details>
  );
}

export function SyntheticOfficerPanel({
  userId,
  activeRole,
}: {
  userId: string;
  activeRole: string;
}) {
  const [filter, setFilter] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchError, setSearchError] = useState(false);
  const [pages, setPages] = useState<(string | null)[]>([null]);
  const searchField = useRef<HTMLInputElement>(null);
  const cursor = pages.at(-1);
  const search = new URLSearchParams({ view: filter });
  if (cursor) search.set("cursor", cursor);
  if (searchTerm) search.set("search", searchTerm);
  const query = useQuery<{
    role: string;
    district: string;
    reviews: Review[];
    nextCursor: string | null;
  }>({
    queryKey: [
      "synthetic-review",
      userId,
      activeRole,
      filter,
      searchTerm,
      cursor,
    ],
    queryFn: () => api(`/synthetic-portal/reviews?${search}`),
    retry: false,
    placeholderData: keepPreviousData,
  });
  if (query.isError)
    return (
      <SyntheticLoadError
        title="Tugasan semakan sintetik"
        error={query.error}
        retry={() => (cursor ? setPages([null]) : void query.refetch())}
      />
    );
  if (!query.data)
    return (
      <section className="panel synthetic-panel" aria-labelledby="synthetic-officer-title" aria-busy="true">
        <h3 id="synthetic-officer-title">Tugasan semakan sintetik</h3>
        <p className="synthetic-note" role="status">Memuatkan tugasan latihan…</p>
      </section>
    );
  const { reviews, role, district, nextCursor } = query.data;
  return (
    <section
      className="panel synthetic-panel"
      aria-labelledby="synthetic-officer-title"
    >
      <span className="synthetic-status">LATIHAN / SINTETIK</span>
      <h3 id="synthetic-officer-title">Tugasan semakan sintetik</h3>
      <ApplicationReport userId={userId} role={activeRole} />
      <ApplicationArchive userId={userId} role={activeRole} />
      <p>
        Kawasan {district} · {role === "PPSK" ? "PPSK" : "PIC Kawasan"}
      </p>
      <form
        className="synthetic-controls"
        role="search"
        aria-label="Carian tugasan latihan"
        onSubmit={(event) => {
          event.preventDefault();
          const value = searchInput.trim();
          const invalid = Boolean(
            value && !/^(?:SYNTHETIC-)?[0-9a-f]{4}[0-9a-f-]{0,32}$/i.test(value),
          );
          setSearchError(invalid);
          if (invalid) return;
          setSearchTerm(value);
          setPages([null]);
        }}
      >
        <label>
          ID serahan atau rujukan latihan
          <input
            ref={searchField}
            type="search"
            value={searchInput}
            maxLength={46}
            onChange={(event) => setSearchInput(event.target.value)}
            aria-invalid={searchError}
            aria-describedby="uat-review-search-help"
          />
        </label>
        <button className="button secondary small" type="submit">
          Cari tugasan
        </button>
        {searchTerm && (
          <button
            type="button"
            className="button secondary small"
            onClick={() => {
              setSearchInput("");
              setSearchTerm("");
              setSearchError(false);
              setPages([null]);
              searchField.current?.focus();
            }}
          >
            Kosongkan carian
          </button>
        )}
      </form>
      <p id="uat-review-search-help" role={searchError ? "alert" : undefined}>
        {searchError
          ? "Masukkan sekurang-kurangnya empat aksara ID yang sah."
          : "Gunakan awal UUID serahan atau rujukan berawalan SYNTHETIC-."}
      </p>
      <div className="synthetic-controls">
        <label>
          Penapis tugasan
          <select
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setPages([null]);
            }}
          >
            <option value="all">Semua</option>
            <option value="action">Perlu tindakan</option>
            <option value="submitted">Menunggu PIC</option>
            <option value="correction">Pembetulan diminta</option>
            <option value="complete">Menunggu PPSK</option>
            <option value="registered">Berdaftar dalam simulasi</option>
          </select>
        </label>
        <button
          className="button secondary small"
          type="button"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isFetching ? "Memuat semula…" : "Muat semula senarai"}
        </button>
      </div>
      {query.isPlaceholderData && (
        <p role="status">Memuatkan tugasan latihan…</p>
      )}
      {!query.isPlaceholderData && !reviews.length && (
        <p role="status">
          {filter === "action"
            ? "Tiada serahan yang memerlukan tindakan."
            : "Tiada serahan sintetik untuk disemak."}
        </p>
      )}
      {!query.isPlaceholderData &&
        reviews.map((review) => (
          <SyntheticReviewCard
            key={review.id}
            review={review}
            role={role}
            userId={userId}
            refresh={async () => {
              await query.refetch();
            }}
          />
        ))}
      {(pages.length > 1 || nextCursor) && (
        <nav className="synthetic-controls" aria-label="Halaman tugasan">
          <button
            className="button secondary small"
            type="button"
            disabled={pages.length === 1 || query.isFetching}
            onClick={() => setPages((previous) => previous.slice(0, -1))}
          >
            Halaman sebelumnya
          </button>
          <span role="status">Halaman {pages.length}</span>
          <button
            className="button secondary small"
            type="button"
            disabled={!nextCursor || query.isFetching}
            onClick={() =>
              nextCursor && setPages((previous) => [...previous, nextCursor])
            }
          >
            Halaman seterusnya
          </button>
        </nav>
      )}
    </section>
  );
}

const findings: Record<string, { reason: string; suggestion: string }> = {
  NO_UNITS: { reason: "Tiada unit fizikal dalam serahan.", suggestion: "Semak inventori unit." },
  NO_FLOORS: { reason: "Tiada tingkat dalam serahan.", suggestion: "Semak inventori tingkat." },
  EVIDENCE_INELIGIBLE: { reason: "Bukti semasa tidak sepadan dengan serahan.", suggestion: "Semak versi, skop dan status imbasan dokumen." },
  EVIDENCE_UNVERIFIED: { reason: "Bukti layak masih menunggu pengesahan manusia.", suggestion: "Semak setiap bukti sebelum mengesahkan kelengkapan." },
};

function PrecheckHistory({ review, userId, role, canRecord }: {
  review: Review; userId:string; role:string; canRecord:boolean;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const path = `/synthetic-portal/reviews/${review.id}/precheck`;
  const history = useQuery<{ history: {
    id:string; version:number; createdAt:string;
    result: { source:string; findings:string[]; reason:string|null };
  }[] }>({
    queryKey: ["synthetic-precheck", userId, role, review.id],
    queryFn: () => api(path),
    retry: false,
  });
  async function record(mode: "AUTO" | "MANUAL") {
    setError("");
    setBusy(true);
    try {
      await api(path, "POST", { mode, version:review.version, ...(mode === "MANUAL" && { reason }) });
      setReason("");
      await history.refetch();
    } catch (error) {
      setError(syntheticErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p>Penemuan semakan awal ialah panduan. Pengesahan kelengkapan kekal di bawah tanggungjawab PIC.</p>
      {canRecord && (
        <>
          <button type="button" className="button secondary small" disabled={busy}
            onClick={() => void record("AUTO")}>Jalankan semakan awal latihan</button>
          <label>
            Catatan semakan manual
            <textarea value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} />
          </label>
          <button type="button" className="button secondary small" disabled={busy || reason.trim().length < 3}
            onClick={() => void record("MANUAL")}>Rekod semakan manual</button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {history.isPending && <p role="status">Memuatkan sejarah semakan…</p>}
      {history.isError && <SyntheticLoadError title="Sejarah semakan awal" error={history.error} retry={() => void history.refetch()} />}
      {history.data?.history.length === 0 && <p>Belum ada rekod semakan.</p>}
      <ol>
        {history.data?.history.map(({id,version,createdAt,result}) => (
          <li key={id}>
            <strong>{result.source === "MANUAL" ? "Manual" : result.source === "MANUAL_REQUIRED"
              ? "Semakan manual diperlukan" : "Peraturan latihan"} · v{version}</strong>
            {" · "}<time dateTime={createdAt}>{new Date(createdAt).toLocaleString("ms-MY", {timeZone:"Asia/Kuala_Lumpur"})}</time>
            {result.reason && <p>{result.reason}</p>}
            {result.findings.length > 0 && <ul>{result.findings.map((code) => (
              <li key={code}>{findings[code]?.reason} {findings[code]?.suggestion}</li>
            ))}</ul>}
            {result.source === "SYNTHETIC_RULES" && !result.findings.length && <p>Tiada penemuan daripada peraturan latihan.</p>}
          </li>
        ))}
      </ol>
    </>
  );
}

function SyntheticReviewCard({
  review,
  role,
  refresh,
  userId,
}: {
  review: Review;
  role: string;
  refresh: () => Promise<void>;
  userId: string;
}) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<ActionFeedback | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [precheckOpen, setPrecheckOpen] = useState(false);
  const picCanReview = role === "PIC_KAWASAN" && review.status === "SUBMITTED";
  const supervisorCanRegister = role === "PPSK" && review.status === "COMPLETE";
  async function decide(action: string) {
    setPending(true);
    setMessage(null);
    try {
      await api(`/synthetic-portal/reviews/${review.id}`, "POST", {
        action,
        reason,
        version: review.version,
      });
      setReason("");
      setMessage({ text: "Keputusan simulasi direkodkan." });
    } catch (error) {
      setMessage({ text: syntheticErrorMessage(error), error: true });
    } finally {
      await refresh();
      setPending(false);
    }
  }
  return (
    <article
      className="company-record synthetic-panel"
      aria-busy={pending}
      aria-label={`Serahan sintetik ${review.id}`}
    >
      <h4>
        Serahan sintetik <code>{review.id}</code>
      </h4>
      <div className="synthetic-meta">
        <span className="synthetic-status">
          {syntheticReviewStatus[review.status]} · v{review.version}
        </span>
      </div>
      {review.reference && (
        <p>
          Rujukan simulasi <code>{review.reference}</code>
        </p>
      )}
      {review.correctionReason && (
        <p>Alasan pembetulan: {review.correctionReason}</p>
      )}
      <ul className="synthetic-evidence" aria-label="Unit fizikal">
        {review.units.map((unit, index) => (
          <li key={index}>
            {unit.label} · {unit.floorCount} tingkat
          </li>
        ))}
      </ul>
      {!review.evidenceEligible && (
        <p className="synthetic-note">
          Sebahagian bukti dalam serahan ini tidak lagi layak. Sahkan status
          bukti dengan penyelaras latihan sebelum meneruskan.
        </p>
      )}
      <p>
        Bukti layak:{" "}
        {review.evidence
          .map(
            (item) => `${item.category} v${item.version} (${item.scanStatus})`,
          )
          .join(", ") || "Tiada bukti layak."}
      </p>
      <p>
        Nasihat AI tiruan sahaja.{" "}
        {review.advice.missing.length
          ? review.advice.missing
              .map((item) => adviceMessages[item] ?? "Semak maklumat serahan.")
              .join(" ")
          : "Tiada amaran berdasarkan kiraan."}
      </p>
      <button type="button" className="button secondary small" aria-expanded={precheckOpen}
        aria-controls={`precheck-${review.id}`} onClick={() => setPrecheckOpen((open) => !open)}>
        Sejarah semakan awal
      </button>
      <section id={`precheck-${review.id}`} hidden={!precheckOpen}>
        {precheckOpen && <PrecheckHistory review={review} userId={userId} role={role} canRecord={picCanReview} />}
      </section>
      <button
        type="button"
        className="button secondary small"
        aria-expanded={comparisonOpen}
        aria-controls={`synthetic-comparison-${review.id}`}
        onClick={() => setComparisonOpen((open) => !open)}
      >
        {comparisonOpen ? "Tutup perbandingan" : "Bandingkan versi serahan"}
      </button>
      <div id={`synthetic-comparison-${review.id}`} hidden={!comparisonOpen}>
        {comparisonOpen && (
          <SyntheticReviewComparison
            id={review.id}
            identity={`${userId}:${role}`}
          />
        )}
      </div>
      {review.status === "SUBMITTED" && (
        <p>Langkah seterusnya · PIC menyemak bukti dan mencatat keputusan.</p>
      )}
      {review.status === "CORRECTION_REQUESTED" && (
        <p>Langkah seterusnya · Tunggu pemohon membuat serahan semula.</p>
      )}
      {review.status === "COMPLETE" && (
        <p>Langkah seterusnya · PPSK mendaftar keputusan latihan.</p>
      )}
      {(picCanReview || supervisorCanRegister) && (
        <div>
          <label htmlFor={`synthetic-reason-${review.id}`}>
            Alasan keputusan sintetik
          </label>
          <textarea
            id={`synthetic-reason-${review.id}`}
            value={reason}
            aria-describedby={`synthetic-reason-help-${review.id}`}
            disabled={pending}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
          />
          <small id={`synthetic-reason-help-${review.id}`}>
            Masukkan 3–500 aksara. Alasan direkodkan dalam audit latihan.
          </small>
          <div className="actions synthetic-controls">
            {picCanReview && (
              <>
                <button
                  className="button secondary small"
                  type="button"
                  disabled={pending || reason.trim().length < 3}
                  onClick={() => void decide("REQUEST_CORRECTION")}
                >
                  Minta pembetulan sintetik
                </button>
                <button
                  className="button primary small"
                  type="button"
                  disabled={
                    pending ||
                    !review.evidenceEligible ||
                    reason.trim().length < 3
                  }
                  onClick={() => void decide("CONFIRM_COMPLETE")}
                >
                  Sahkan lengkap sintetik
                </button>
              </>
            )}
            {supervisorCanRegister && (
              <button
                className="button primary small"
                type="button"
                disabled={
                  pending ||
                  !review.evidenceEligible ||
                  reason.trim().length < 3
                }
                onClick={() => void decide("REGISTER")}
              >
                Daftar keputusan sintetik
              </button>
            )}
          </div>
        </div>
      )}
      <SyntheticFeedback feedback={message} />
      {review.status === "REGISTERED" && (
        <>
          <button
            className="button secondary small"
            type="button"
            aria-expanded={invoiceOpen}
            aria-controls={`synthetic-invoice-${review.id}`}
            onClick={() => setInvoiceOpen((open) => !open)}
          >
            {invoiceOpen ? "Tutup butiran invois" : "Buka butiran invois"}
          </button>
          <div id={`synthetic-invoice-${review.id}`} hidden={!invoiceOpen}>
            {invoiceOpen && (
              <SyntheticInvoice
                path={`/synthetic-portal/reviews/${review.id}/billing`}
                identity={userId + role}
                manage={role === "PPSK"}
              />
            )}
          </div>
          <SyntheticCompletionCase path={`/synthetic-portal/completion/${review.id}`} identity={userId} role={role} />
        </>
      )}
    </article>
  );
}
