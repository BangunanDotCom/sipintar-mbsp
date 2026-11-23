import { Link } from "react-router-dom";
import { preliminarySupportingDocuments } from "../../../packages/shared/src/supporting-documents";
import { SyntheticInvoice } from "./SyntheticInvoice";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import {
  SyntheticFeedback,
  SyntheticLoadError,
  syntheticErrorMessage,
  syntheticReviewStatus,
  type ActionFeedback,
  type SyntheticReviewStatus,
} from "./synthetic-portal-ui";

type Requirement = {
  requirement: string;
  categories: string[];
  scope: "DRAFT" | "UNIT" | "FLOOR";
  applicability: "REQUIRED" | "CONDITIONAL" | "NOT_APPLICABLE" | "UNKNOWN";
  eligibleTargets: number;
  requiredTargets: number;
  requireVerified: boolean;
};
const requirementLabels = {
  REQUIRED: "Wajib",
  CONDITIONAL: "Bersyarat",
  NOT_APPLICABLE: "Tidak berkaitan",
  UNKNOWN: "Syarat belum diketahui",
};
const scopes = { DRAFT: "Permohonan", UNIT: "Unit fizikal", FLOOR: "Tingkat" };
const categoryLabel = (category: string) =>
  preliminarySupportingDocuments.find((entry) => entry.category === category)
    ?.label ?? category;

type ApplicantState = {
  draftVersion: number;
  policyVersion: string;
  policyFingerprint: string;
  declaration: { version: string; text: string };
  latest: { id: string; draftVersion: number } | null;
  reviewStatus: SyntheticReviewStatus | null;
  reference: string | null;
  correctionReason: string | null;
  correctionRequested: boolean;
  evidence: {
    id: string;
    category: string;
    version: number;
    scanStatus: string;
  }[];
  requirements: Requirement[];
  inventory: { unitCount: number; floorCount: number };
  blocker: string;
  ready: boolean;
};

export function SyntheticApplicantPanel({
  draftId,
  userId,
}: {
  draftId: string;
  userId: string;
}) {
  const qc = useQueryClient();
  const root = `/synthetic-portal/drafts/${draftId}`;
  const query = useQuery<ApplicantState>({
    queryKey: ["synthetic-applicant", userId, draftId],
    queryFn: () => api(root),
    retry: false,
  });
  const [acceptedFor, setAcceptedFor] = useState<string | null>(null);
  const [verdict, setVerdict] = useState("CLEAN");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<ActionFeedback | null>(null);
  const key = useRef<{ context: string; value: string } | null>(null);
  const state = query.data;
  if (query.isError)
    return (
      <SyntheticLoadError
        title="Serahan latihan sintetik"
        error={query.error}
        retry={() => void query.refetch()}
      />
    );
  if (!state) return null;
  const editable = !state.latest || state.correctionRequested;
  const previousId = state.latest?.id ?? null;
  const draftVersion = state.draftVersion;
  const declarationVersion = state.declaration.version;
  const policyFingerprint = state.policyFingerprint;
  const context = `${draftId}:${state.draftVersion}:${state.declaration.version}:${state.policyFingerprint}:${previousId}`;
  const accepted = acceptedFor === context;
  const base = `/permohonan/draf/${draftId}`;
  const step = editable ? (state.ready ? "declaration" : "evidence") : "status";

  async function act(path: string, body: unknown, success: string) {
    setPending(true);
    setMessage(null);
    try {
      await api(`${root}/${path}`, "POST", body);
      setAcceptedFor(null);
      setMessage({ text: success });
      await query.refetch();
      if (path === "evidence") {
        await Promise.all([
          qc.invalidateQueries({
            queryKey: ["application-documents", userId, draftId],
          }),
          qc.invalidateQueries({
            queryKey: ["draft-document-readiness", userId, draftId],
          }),
          qc.invalidateQueries({
            queryKey: ["premises", draftId],
            refetchType: "none",
          }),
        ]);
      }
    } catch (error) {
      setMessage({ text: syntheticErrorMessage(error), error: true });
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
        version: draftVersion,
        declarationVersion,
        policyFingerprint,
      },
      "Serahan sintetik diterima.",
    );
  }

  return (
    <section
      className="panel synthetic-panel"
      aria-labelledby="synthetic-applicant-title"
      aria-busy={pending}
    >
      <div className="synthetic-journey-heading">
        <span className="synthetic-status">LATIHAN / SINTETIK</span>
        <h2 id="synthetic-applicant-title">Serahan latihan sintetik</h2>
      </div>
      <nav aria-label="Langkah latihan pemohon" className="synthetic-steps">
        <ol>
          <li>
            <Link to={base + "/premis"}>Premis</Link>
          </li>
          <li>
            <Link to={base + "/unit"}>
              Unit fizikal ({state.inventory.unitCount})
            </Link>
          </li>
          <li>
            <Link to={base + "/tingkat"}>
              Tingkat dan kemudahan ({state.inventory.floorCount})
            </Link>
          </li>
          <li>
            <a
              href="#uat-bukti"
              aria-current={step === "evidence" ? "step" : undefined}
            >
              Bukti
            </a>
          </li>
          <li>
            {editable ? (
              <a
                href="#uat-akuan"
                aria-current={step === "declaration" ? "step" : undefined}
              >
                Akuan dan serahan
              </a>
            ) : (
              <span>Akuan dan serahan</span>
            )}
          </li>
          <li>
            <a
              href="#uat-status"
              aria-current={step === "status" ? "step" : undefined}
            >
              Status dan invois
            </a>
          </li>
        </ol>
      </nav>
      <div className="synthetic-meta">
        <span className="synthetic-status" role="status">
          {state.reviewStatus
            ? syntheticReviewStatus[state.reviewStatus]
            : state.ready
              ? "Sedia untuk serahan"
              : "Draf latihan"}
        </span>
        <small>
          Polisi bukti {state.policyVersion} · Draf v{state.draftVersion}
        </small>
      </div>
      <h3 id="uat-bukti">Bukti mengikut polisi latihan</h3>
      <ul
        className="synthetic-requirements"
        aria-label="Keperluan dokumen mengikut polisi latihan"
      >
        {state.requirements.map((rule, index) => (
          <li key={`${rule.requirement}:${index}`}>
            <strong>{rule.categories.map(categoryLabel).join(" / ")}</strong>
            <span>
              {requirementLabels[rule.applicability]} · {scopes[rule.scope]}
            </span>
            {rule.applicability === "REQUIRED" ||
            rule.applicability === "CONDITIONAL" ? (
              <small>
                {rule.requiredTargets
                  ? `${rule.eligibleTargets}/${rule.requiredTargets} sasaran dengan bukti layak`
                  : "Tambah sasaran pada inventori dahulu."}
                {rule.requireVerified && " · Pengesahan diperlukan"}
              </small>
            ) : null}
          </li>
        ))}
      </ul>
      <p>
        Gunakan metadata latihan untuk menyemak bukti sebelum mengesahkan akuan.
      </p>
      {state.evidence.length > 0 && (
        <ul className="synthetic-evidence" aria-label="Bukti latihan">
          {state.evidence.map((item) => (
            <li key={item.id}>
              {item.category} · v{item.version} · {item.scanStatus}
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <div className="synthetic-controls">
          <label htmlFor="synthetic-verdict">
            Keputusan imbasan tiruan
            <select
              id="synthetic-verdict"
              value={verdict}
              disabled={pending}
              onChange={(event) => setVerdict(event.target.value)}
            >
              <option value="CLEAN">Lulus (CLEAN)</option>
              <option value="PENDING">Menunggu (PENDING)</option>
              <option value="FAILED">Gagal (FAILED)</option>
              <option value="INFECTED">Tidak selamat (INFECTED)</option>
            </select>
          </label>
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
      {state.correctionReason && (
        <p>Alasan pembetulan: {state.correctionReason}</p>
      )}
      {state.correctionRequested && (
        <p>
          Pembetulan diminta. Simpan pembetulan pada draf ini dan sahkan akuan
          semula.
        </p>
      )}
      {state.blocker && <p className="synthetic-note">{state.blocker}</p>}
      {editable && (
        <>
          <h3 id="uat-akuan">Akuan dan serahan latihan</h3>
          <label className="synthetic-check">
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
        </>
      )}
      {pending && <p role="status">Memproses tindakan latihan…</p>}
      <SyntheticFeedback feedback={message} />
      <div className="synthetic-meta">
        <h3 id="uat-status">Status dan invois latihan</h3>
        <button
          type="button"
          className="button secondary small"
          disabled={query.isFetching || pending}
          onClick={() => void query.refetch()}
        >
          Semak status terkini
        </button>
      </div>
      {!state.latest && (
        <p>Resit latihan akan muncul selepas serahan diterima.</p>
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
      {state.reviewStatus === "REGISTERED" && (
        <SyntheticInvoice path={`${root}/billing`} identity={userId} />
      )}
    </section>
  );
}
