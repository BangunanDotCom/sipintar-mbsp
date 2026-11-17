import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

type ReadinessResponse = {
  draftId: string;
  ready: boolean;
  submissionEnabled: boolean;
  guidance: {
    headline: string;
    message: string;
    issues: Array<{ category: string; label: string; message: string }>;
    integrityWarning: string | null;
  };
};

// Read-only applicant guidance; this component never initiates submission.
export function DraftDocumentReadiness({ draftId }: { draftId: string }) {
  const q = useQuery<ReadinessResponse>({
    queryKey: ["draft-document-readiness", draftId],
    queryFn: () => api(`/application-drafts/${encodeURIComponent(draftId)}/submission-readiness`),
    retry: false,
    staleTime: 0,
  });
  return (
    <section className="panel" aria-labelledby="draft-readiness-title">
      <h2 id="draft-readiness-title">Semakan awal dokumen sokongan</h2>
      {q.isPending ? (
        <p role="status">Memuatkan status dokumen…</p>
      ) : q.isError ? (
        <p role="alert">Status dokumen tidak dapat dipaparkan. Sila cuba semula.</p>
      ) : (
        <div aria-live="polite">
          <h3>{q.data.guidance.headline}</h3>
          <p>{q.data.guidance.message}</p>
          {q.data.guidance.integrityWarning && (
            <p role="alert">{q.data.guidance.integrityWarning}</p>
          )}
          {q.data.guidance.issues.length > 0 && (
            <ul>
              {q.data.guidance.issues.map((issue) => (
                <li key={issue.category}>
                  <strong>{issue.label}</strong>: {issue.message}
                </li>
              ))}
            </ul>
          )}
          <p className="muted">
            Ini semakan awal sahaja, bukan pengesahan pegawai atau kelulusan MBSP.
          </p>
        </div>
      )}
      <button className="button secondary small" type="button"
        onClick={() => void q.refetch()} disabled={q.isFetching}>
        {q.isFetching ? "Menyemak…" : "Semak semula status dokumen"}
      </button>
    </section>
  );
}
