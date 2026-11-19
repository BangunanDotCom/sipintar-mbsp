import { ApiError } from "./api";
import "./synthetic-portal.css";

export const syntheticReviewStatus = {
  SUBMITTED: "Menunggu semakan",
  CORRECTION_REQUESTED: "Pembetulan diminta",
  COMPLETE: "Lengkap dalam simulasi",
  REGISTERED: "Berdaftar dalam simulasi",
};

export type SyntheticReviewStatus = keyof typeof syntheticReviewStatus;
export type ActionFeedback = { text: string; error?: boolean };

export function syntheticUnavailable(error: unknown) {
  return error instanceof ApiError && [401, 403, 404].includes(error.status);
}

export function syntheticErrorMessage(error: unknown) {
  if (!(error instanceof ApiError) || error.status >= 500)
    return "Perkhidmatan latihan tidak dapat dimuatkan. Cuba lagi.";
  if (error.status === 429)
    return error.retryAfterSeconds
      ? `Had permintaan dicapai. Cuba lagi dalam ${error.retryAfterSeconds} saat.`
      : "Had permintaan dicapai. Tunggu sebentar sebelum mencuba lagi.";
  if (error.status === 409) return `${error.message} Semak maklumat terkini.`;
  return error.message;
}

export function SyntheticFeedback({
  feedback,
}: {
  feedback: ActionFeedback | null;
}) {
  return feedback ? (
    <p
      className="synthetic-feedback"
      data-error={Boolean(feedback.error)}
      role={feedback.error ? "alert" : "status"}
    >
      {feedback.text}
    </p>
  ) : null;
}

export function SyntheticLoadError({
  title,
  error,
  retry,
}: {
  title: string;
  error: unknown;
  retry: () => void;
}) {
  if (syntheticUnavailable(error)) return null;
  return (
    <section className="panel synthetic-panel" aria-label={title}>
      <p role="alert">{syntheticErrorMessage(error)}</p>
      <button className="button secondary small" type="button" onClick={retry}>
        Cuba lagi
      </button>
    </section>
  );
}
