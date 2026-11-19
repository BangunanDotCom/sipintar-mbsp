import { SyntheticInvoice } from "./SyntheticInvoice";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  const query = useQuery<{ role: string; district: string; reviews: Review[] }>(
    {
      queryKey: ["synthetic-review", userId, activeRole],
      queryFn: () => api("/synthetic-portal/reviews"),
      retry: false,
    },
  );
  const [filter, setFilter] = useState("all");
  if (query.isError)
    return (
      <SyntheticLoadError
        title="Tugasan semakan sintetik"
        error={query.error}
        retry={() => void query.refetch()}
      />
    );
  if (!query.data) return null;
  const { reviews, role, district } = query.data;
  const actionable = reviews.filter((review) =>
    role === "PIC_KAWASAN"
      ? review.status === "SUBMITTED"
      : review.status === "COMPLETE",
  );
  const visible = filter === "action" ? actionable : reviews;
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
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">Semua ({reviews.length})</option>
            <option value="action">Perlu tindakan ({actionable.length})</option>
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
      {!visible.length && (
        <p role="status">
          {filter === "action"
            ? "Tiada serahan yang memerlukan tindakan."
            : "Tiada serahan sintetik untuk disemak."}
        </p>
      )}
      {visible.map((review) => (
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
