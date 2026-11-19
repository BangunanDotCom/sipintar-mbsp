import { SyntheticInvoice } from "./SyntheticInvoice";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export function SyntheticApplicantPanel({
  draftId,
  userId,
}: {
  draftId: string;
  userId: string;
}) {
  const qc = useQueryClient();
  const root = `/synthetic-portal/drafts/${draftId}`;
  const query = useQuery({
    queryKey: ["synthetic-applicant", userId, draftId],
    queryFn: () => api(root),
    retry: false,
  });
  const [acceptedFor, setAcceptedFor] = useState<string | null>(null);
  const [verdict, setVerdict] = useState("CLEAN");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const key = useRef<{ context: string; value: string } | null>(null);
  const state = query.data;
  if (!state || query.isError) return null;
  const previousId = state.latest?.id ?? null;
  const context = `${draftId}:${state.draftVersion}:${state.declaration.version}:${previousId}`;
  const accepted = acceptedFor === context;

  async function act(path: string, body: unknown, success: string) {
    setPending(true);
    setMessage("");
    try {
      await api(`${root}/${path}`, "POST", body);
      setAcceptedFor(null);
      setMessage(success);
      await qc.invalidateQueries();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Simulasi gagal.");
      await query.refetch();
    } finally {
      setPending(false);
    }
  }

  function submit() {
    if (key.current?.context !== context)
      key.current = { context, value: crypto.randomUUID() };
    void act(
      "submit",
      {
        previousId,
        key: key.current.value,
        accepted: true,
        version: state.draftVersion,
        declarationVersion: state.declaration.version,
      },
      "Serahan sintetik diterima.",
    );
  }

  return (
    <section className="panel" aria-labelledby="synthetic-applicant-title">
      <h2 id="synthetic-applicant-title">Serahan latihan sintetik</h2>
      <p>
        Data ujian sahaja. Jangan muat naik dokumen atau maklumat pemohon
        sebenar.
      </p>
      <p>Polisi bukti {state.policyVersion}</p>
      {state.evidence.length > 0 && (
        <ul>
          {state.evidence.map(
            (item: {
              id: string;
              category: string;
              version: number;
              scanStatus: string;
            }) => (
              <li key={item.id}>
                {item.category} · v{item.version} · {item.scanStatus}
              </li>
            ),
          )}
        </ul>
      )}
      {(!state.latest || state.correctionRequested) && (
        <div>
          <label htmlFor="synthetic-verdict">Keputusan imbasan tiruan</label>
          <select
            id="synthetic-verdict"
            value={verdict}
            onChange={(event) => setVerdict(event.target.value)}
          >
            <option value="CLEAN">Lulus (CLEAN)</option>
            <option value="PENDING">Menunggu (PENDING)</option>
            <option value="FAILED">Gagal (FAILED)</option>
            <option value="INFECTED">Tidak selamat (INFECTED)</option>
          </select>{" "}
          <button
            className="button secondary small"
            type="button"
            disabled={pending}
            onClick={() =>
              void act(
                "evidence",
                { version: state.draftVersion, verdict },
                "Bukti tiruan dikemas kini.",
              )
            }
          >
            Jana bukti tiruan
          </button>
        </div>
      )}
      {state.latest && (
        <p>
          Resit sintetik <code>{state.latest.id}</code>
        </p>
      )}
      {state.reference && (
        <p>
          Rujukan simulasi <code>{state.reference}</code>
        </p>
      )}
      {state.correctionReason && (
        <p>Alasan pembetulan: {state.correctionReason}</p>
      )}
      {state.correctionRequested && (
        <p>
          Pembetulan diminta. Simpan pembetulan pada draf ini dan sahkan akuan
          semula.
        </p>
      )}
      {state.blocker && <p>{state.blocker}</p>}
      <label>
        <input
          type="checkbox"
          checked={accepted}
          disabled={!state.ready || pending}
          onChange={(event) =>
            setAcceptedFor(event.target.checked ? context : null)
          }
        />{" "}
        {state.declaration.text} ({state.declaration.version})
      </label>
      <p>
        <button
          className="button primary"
          type="button"
          disabled={!state.ready || !accepted || pending}
          onClick={submit}
        >
          {state.latest
            ? "Serah pembetulan sintetik"
            : "Serah permohonan sintetik"}
        </button>
      </p>
      {message && <p role="status">{message}</p>}
      {state.reviewStatus === "REGISTERED" && (
        <SyntheticInvoice path={`${root}/billing`} identity={userId} />
      )}
    </section>
  );
}
