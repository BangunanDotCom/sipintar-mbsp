import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, malaysiaTime } from "./api";
import { syntheticErrorMessage } from "./synthetic-portal-ui";

const root = "/synthetic-portal";
type Draft = {
  id: string;
  version: number;
  updatedAt: string;
  reminders: {
    draftVersion: number;
    status: string;
    source: string;
    attempts: number;
    createdAt: string;
  }[];
};

export function TrainingInactiveDrafts({ userId }: { userId: string }) {
  const query = useQuery<{ district: string; drafts: Draft[] }>({
    queryKey: ["training-inactive-drafts", userId],
    queryFn: () => api(root + "/inactive-drafts"),
    retry: false,
  });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  async function remind(draft: Draft) {
    setBusy(true);
    setFeedback("");
    try {
      const { queued } = await api(
        root + `/inactive-drafts/${draft.id}/remind`,
        "POST",
        { version: draft.version },
      );
      setFeedback(
        queued
          ? "Peringatan latihan ditambah pada baris gilir."
          : "Peringatan untuk versi ini sudah direkodkan.",
      );
      await query.refetch();
    } catch (error) {
      setFeedback(syntheticErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel synthetic-panel">
      <h3>Draf latihan tidak aktif</h3>
      {query.isError && (
        <p role="alert">{syntheticErrorMessage(query.error)}</p>
      )}
      {query.isPending && <p role="status">Memuatkan draf…</p>}
      {feedback && <p role="status">{feedback}</p>}
      {query.data && (
        <>
          <p>
            {query.data.district} · 50 draf paling lama tanpa kemas kini
            melebihi ambang 60 hari
          </p>
          {query.data.drafts.length === 0 && (
            <p>Tiada draf menunggu peringatan.</p>
          )}
          {query.data.drafts.map((draft) => (
            <article className="company-record" key={draft.id}>
              <p>
                <code>{draft.id}</code> · v{draft.version} ·{" "}
                {malaysiaTime(draft.updatedAt)}
              </p>
              <button
                className="button small secondary"
                type="button"
                disabled={
                  busy ||
                  draft.reminders.some(
                    (entry) => entry.draftVersion === draft.version,
                  )
                }
                onClick={() => void remind(draft)}
              >
                Ingatkan pemohon
              </button>
              {draft.reminders.length > 0 && (
                <ul>
                  {draft.reminders.map((entry) => (
                    <li key={entry.draftVersion}>
                      v{entry.draftVersion} · {entry.status} · {entry.attempts}{" "}
                      percubaan · {malaysiaTime(entry.createdAt)}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </>
      )}
    </section>
  );
}

export function TrainingReminderMonitor({ userId }: { userId: string }) {
  const query = useQuery<{ counts: { status: string; count: number }[] }>({
    queryKey: ["training-reminder-monitor", userId],
    queryFn: () => api(root + "/reminder-monitor"),
    retry: false,
  });
  return (
    <section className="panel">
      <h3>Pemantauan peringatan latihan</h3>
      {query.isPending && <p role="status">Memuatkan status…</p>}
      {query.isError && (
        <p role="alert">{syntheticErrorMessage(query.error)}</p>
      )}
      {query.data?.counts.map(({ status, count }) => (
        <p key={status}>
          {status} · {count}
        </p>
      ))}
      {query.data?.counts.length === 0 && <p>Tiada rekod penghantaran.</p>}
    </section>
  );
}
