import { SyntheticInvoice } from "./SyntheticInvoice";
import { useState } from "react";
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

export function SyntheticOfficerPanel({
  userId,
  activeRole,
}: {
  userId: string;
  activeRole: string;
}) {
  const [filter, setFilter] = useState("all");
  const [pages, setPages] = useState<(string | null)[]>([null]);
  const cursor = pages.at(-1);
  const search = new URLSearchParams({ view: filter });
  if (cursor) search.set("cursor", cursor);
  const query = useQuery<{
    role: string;
    district: string;
    reviews: Review[];
    nextCursor: string | null;
  }>({
    queryKey: ["synthetic-review", userId, activeRole, filter, cursor],
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
    return cursor || filter !== "all" ? (
      <p className="synthetic-note" role="status">
        Memuatkan tugasan latihan…
      </p>
    ) : null;
  const { reviews, role, district, nextCursor } = query.data;
  return (
    <section
      className="panel synthetic-panel"
      aria-labelledby="synthetic-officer-title"
    >
      <h3 id="synthetic-officer-title">Tugasan semakan sintetik</h3>
      <p>
        Kawasan {district} · {role === "PPSK" ? "PPSK" : "PIC Kawasan"}
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
        </>
      )}
    </article>
  );
}
