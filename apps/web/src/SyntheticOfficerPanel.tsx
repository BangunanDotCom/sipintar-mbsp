import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

type Review = {
  id: string;
  version: number;
  status: "SUBMITTED" | "CORRECTION_REQUESTED" | "COMPLETE" | "REGISTERED";
  reference: string | null;
  correctionReason: string | null;
  units: { label: string; floorCount: number }[];
  evidence: { category: string; version: number; scanStatus: string }[];
  advice: { missing: string[] };
};

const reviewStatus = {
  SUBMITTED: "Menunggu semakan",
  CORRECTION_REQUESTED: "Pembetulan diminta",
  COMPLETE: "Lengkap dalam simulasi",
  REGISTERED: "Berdaftar dalam simulasi",
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
  if (query.isError || !query.data) return null;
  const { reviews, role, district } = query.data;
  return (
    <section className="panel" aria-labelledby="synthetic-officer-title">
      <h3 id="synthetic-officer-title">Tugasan semakan sintetik</h3>
      <p>Kawasan {district} · Data latihan sahaja.</p>
      {!reviews.length && <p>Tiada serahan sintetik untuk disemak.</p>}
      {reviews.map((review) => (
        <SyntheticReviewCard
          key={review.id}
          review={review}
          role={role}
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
}: {
  review: Review;
  role: string;
  refresh: () => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const picCanReview = role === "PIC_KAWASAN" && review.status === "SUBMITTED";
  const supervisorCanRegister = role === "PPSK" && review.status === "COMPLETE";
  async function decide(action: string) {
    setPending(true);
    setMessage("");
    try {
      await api(`/synthetic-portal/reviews/${review.id}`, "POST", {
        action,
        reason,
        version: review.version,
      });
      setReason("");
      setMessage("Keputusan simulasi direkodkan.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Semakan gagal.");
    } finally {
      await refresh();
      setPending(false);
    }
  }
  return (
    <article
      className="company-record"
      aria-label={`Serahan sintetik ${review.id}`}
    >
      <h4>
        Serahan sintetik <code>{review.id}</code>
      </h4>
      <p>
        {reviewStatus[review.status]} · v{review.version}
      </p>
      {review.reference && (
        <p>
          Rujukan simulasi <code>{review.reference}</code>
        </p>
      )}
      {review.correctionReason && (
        <p>Alasan pembetulan: {review.correctionReason}</p>
      )}
      <ul>
        {review.units.map((unit, index) => (
          <li key={index}>
            {unit.label} · {unit.floorCount} tingkat
          </li>
        ))}
      </ul>
      <p>
        Bukti layak:{" "}
        {review.evidence
          .map(
            (item) => `${item.category} v${item.version} (${item.scanStatus})`,
          )
          .join(", ")}
      </p>
      <p>
        Nasihat AI tiruan sahaja.{" "}
        {review.advice.missing.length
          ? review.advice.missing.join(", ")
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
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
          />
          <div className="actions">
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
                  disabled={pending || reason.trim().length < 3}
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
                disabled={pending || reason.trim().length < 3}
                onClick={() => void decide("REGISTER")}
              >
                Daftar keputusan sintetik
              </button>
            )}
          </div>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </article>
  );
}
