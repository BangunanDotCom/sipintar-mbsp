import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, malaysiaTime } from "./api";
import { syntheticErrorMessage } from "./synthetic-portal-ui";

export function CompletionFinancialLedger({ path, identity }: { path: string; identity: string }) {
  const [open, setOpen] = useState(false);
  const ledger = useQuery<{
    entries: {
      stage: number;
      event: string;
      invoiceId: string;
      amountSen: number;
      createdAt: string;
    }[];
  }>({
    queryKey: ["completion-financial-ledger", identity, path],
    queryFn: () => api(path + "/financial-ledger"),
    enabled: open,
    retry: false,
  });
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Lejar kewangan latihan</summary>
      {ledger.isLoading && <p role="status">Memuatkan lejar…</p>}
      {ledger.isError && (
        <p role="alert">{syntheticErrorMessage(ledger.error)}</p>
      )}
      {ledger.data && (
        <>
          {ledger.data.entries.length === 0 && (
            <p>Tiada catatan dalam jurnal baharu.</p>
          )}
          <ul>
            {ledger.data.entries.map((entry) => (
              <li key={entry.invoiceId + entry.event}>
                Peringkat {entry.stage} ·{" "}
                {entry.event === "INVOICE" ? "Invois" : "Resit"} ·{" "}
                {entry.amountSen} sen · {malaysiaTime(entry.createdAt)}
              </li>
            ))}
          </ul>
          <a href={`/api${path}/financial-ledger?format=csv`}>
            Eksport CSV lejar latihan
          </a>
        </>
      )}
    </details>
  );
}

type Overlay = {
  version: number;
  legalHold: boolean;
  reopenRequested: boolean;
  history: {
    version: number;
    action: string;
    reason: string;
    createdAt: string;
  }[];
};
const descriptions: Record<string, string> = {
  PLACE_HOLD: "Letak tahanan rekod latihan",
  RELEASE_HOLD: "Lepas tahanan rekod latihan",
  REQUEST_REOPEN: "Rekod permohonan buka semula",
};

export function CompletionRecordOverlay({ path, identity }: { path: string; identity: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const query = useQuery<Overlay>({
    queryKey: ["completion-record-overlay", identity, path],
    queryFn: () => api(path + "/records"),
    enabled: open,
    retry: false,
  });
  async function record(action: string) {
    if (!query.data) return;
    setBusy(true);
    setFeedback("");
    try {
      await api(path + "/records", "POST", {
        version: query.data.version,
        action,
        reason,
      });
      setReason("");
      await query.refetch();
    } catch (error) {
      setFeedback(syntheticErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Daftar kawalan rekod latihan</summary>
      {query.isLoading && <p role="status">Memuatkan rekod…</p>}
      {query.isError && (
        <p role="alert">{syntheticErrorMessage(query.error)}</p>
      )}
      {feedback && <p role="alert">{feedback}</p>}
      {query.data && (
        <>
          <p>
            {query.data.legalHold ? "Rekod ditahan" : "Tiada tahanan rekod"}
          </p>
          {query.data.reopenRequested && (
            <p>Permohonan buka semula direkodkan. Kes kekal ditutup.</p>
          )}
          <label>
            Sebab tindakan rekod
            <textarea
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {[
            query.data.legalHold ? "RELEASE_HOLD" : "PLACE_HOLD",
            ...(!query.data.reopenRequested ? ["REQUEST_REOPEN"] : []),
          ].map((action) => (
            <button
              key={action}
              type="button"
              className="button small secondary"
              disabled={busy || reason.trim().length < 5}
              onClick={() => void record(action)}
            >
              {descriptions[action]}
            </button>
          ))}
          <ul>
            {query.data.history.map((item) => (
              <li key={item.version}>
                {descriptions[item.action]} · {item.reason} ·{" "}
                {malaysiaTime(item.createdAt)}
              </li>
            ))}
          </ul>
        </>
      )}
    </details>
  );
}
