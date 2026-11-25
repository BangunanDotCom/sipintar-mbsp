import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  CompletionCommand,
  CompletionState,
} from "../../../packages/shared/src/synthetic-completion";
import { api, ApiError, malaysiaTime } from "./api";
import {
  SyntheticFeedback,
  SyntheticLoadError,
  syntheticErrorMessage,
  type ActionFeedback,
} from "./synthetic-portal-ui";

type Scope = {
  unitId: string;
  floorId: string;
  unitLabel: string;
  floorLabel: string;
};
type View = Pick<CompletionState, "version" | "closed"> & {
  id?: string;
  scopes: Scope[];
  decisions?: CompletionState["decisions"];
  letters?: number[];
  papers?: CompletionState["papers"];
  referral?: null | {
    deadline: number;
    assigned?: boolean;
    comment?: unknown;
    comments?: Partial<Record<string, unknown>>;
    departments?: string[];
  };
  response?: CompletionState["response"];
  responseSubmitted?: boolean;
  decisionSigned?: boolean;
  invoice?: CompletionState["invoice"];
  overdue?: boolean;
};
const scopeKey = ({ unitId, floorId }: Scope) => unitId + "/" + floorId;
const terminal = (choice?: string) => choice === "SK" || choice === "TOLAK";
const base = "/synthetic-portal/completion";
const departmentLabels = {
  PERANCANG_BANDAR: "Perancang Bandar",
  KEJURUTERAAN: "Kejuruteraan",
};

export function SyntheticCompletionCase({
  path,
  identity,
  role,
}: {
  path: string;
  identity: string;
  role: string;
}) {
  const query = useQuery<View>({
    queryKey: ["synthetic-completion", identity, role, path],
    queryFn: () => api(path),
    retry: false,
  });
  if (query.error instanceof ApiError && query.error.status === 404)
    return null;
  if (query.isError)
    return (
      <SyntheticLoadError
        title="Keputusan dan penutupan latihan"
        error={query.error}
        retry={() => void query.refetch()}
      />
    );
  if (!query.data) return null;
  return (
    <CompletionForm
      view={query.data}
      path={path}
      role={role}
      reload={async () => {
        await query.refetch();
      }}
    />
  );
}

export function SyntheticCompletionQueue({
  identity,
  role,
}: {
  identity: string;
  role: string;
}) {
  const query = useQuery<{ cases: (View & { id: string })[] }>({
    queryKey: ["synthetic-completion-queue", identity, role],
    queryFn: () => api(base + "/queue"),
    retry: false,
  });
  if (query.error instanceof ApiError && query.error.status === 404)
    return null;
  if (query.isError)
    return (
      <SyntheticLoadError
        title="Tugasan keputusan latihan"
        error={query.error}
        retry={() => void query.refetch()}
      />
    );
  if (!query.data) return null;
  return (
    <section className="panel synthetic-panel">
      <h3>Tugasan keputusan latihan</h3>
      <p>{query.data.cases.length} kes dalam skop</p>
      {query.data.cases.map((view) => (
        <CompletionForm
          key={view.id}
          view={view}
          path={base + "/" + view.id}
          role={role}
          reload={async () => {
            await query.refetch();
          }}
        />
      ))}
    </section>
  );
}

function CompletionForm({
  view,
  path,
  role,
  reload,
}: {
  view: View;
  path: string;
  role: string;
  reload: () => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const [comment, setComment] = useState("");
  const [details, setDetails] = useState<Record<string, string>>({});
  const [choice, setChoice] = useState<
    Record<
      string,
      {
        outcome: "SK" | "SKB" | "TANGGUH" | "TOLAK";
        reason: string;
        date: string;
      }
    >
  >({});
  const [selected, setSelected] = useState<(keyof typeof departmentLabels)[]>(
    [],
  );
  const applicant = role === "PEMOHON" || role === "WAKIL_SYARIKAT";
  const tech = role === "PERANCANG_BANDAR" || role === "KEJURUTERAAN";
  const decisions = new Map(
    (view.decisions ?? []).map((item) => [
      item.unitId + "/" + item.floorId,
      item,
    ]),
  );
  const decisionScopes = view.scopes.filter(
    (scope) => !terminal(decisions.get(scopeKey(scope))?.outcome),
  );
  const letters = view.letters ?? [];
  const papers = view.papers?.length ?? 0;

  async function send(command: CompletionCommand) {
    setPending(true);
    setFeedback(null);
    try {
      await api(path, "POST", { version: view.version, command });
      setFeedback({ text: "Tindakan latihan direkodkan." });
      setComment("");
      setChoice({});
      setDetails({});
      setSelected([]);
    } catch (error) {
      setFeedback({ text: syntheticErrorMessage(error), error: true });
    } finally {
      await reload();
      setPending(false);
    }
  }
  function action(text: string, command: CompletionCommand) {
    return (
      <button
        className="button secondary small"
        type="button"
        disabled={pending}
        onClick={() => void send(command)}
      >
        {text}
      </button>
    );
  }
  function noteForm(
    label: string,
    submit: (event: FormEvent) => void,
    children?: React.ReactNode,
  ) {
    return (
      <form className="synthetic-controls" onSubmit={submit}>
        <label>
          {label}
          <textarea
            required
            minLength={3}
            maxLength={1000}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </label>
        {children}
        <button className="button small" disabled={pending}>
          Rekod tindakan latihan
        </button>
      </form>
    );
  }

  return (
    <section className="company-record synthetic-panel" aria-busy={pending}>
      <h4>
        Keputusan dan penutupan{" "}
        <span className="synthetic-status">LATIHAN</span>
      </h4>
      {view.id && (
        <p>
          ID serahan <code>{view.id}</code>
        </p>
      )}
      <p>
        {view.closed
          ? "Ditutup dalam simulasi"
          : "Versi latihan " + view.version}
      </p>
      {view.referral && (
        <p>
          Tarikh akhir ulasan{" "}
          {malaysiaTime(new Date(view.referral.deadline).toISOString())}
          {view.overdue ? " · Lewat" : ""}
        </p>
      )}
      {view.papers?.map((paper, index) => (
        <details key={index}>
          <summary>Kertas Pertimbangan v{index + 1}</summary>
          <p>{paper.summary}</p>
          <ul>
            {paper.comments.map((row) => (
              <li key={row.department}>
                <strong>{departmentLabels[row.department]}</strong> {row.text}
                <ul>
                  {row.details.map((detail) => {
                    const scope = view.scopes.find(
                      (item) =>
                        scopeKey(item) === detail.unitId + "/" + detail.floorId,
                    );
                    return (
                      <li key={detail.unitId + "/" + detail.floorId}>
                        {scope?.unitLabel} · {scope?.floorLabel} —{" "}
                        {detail.comment}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </details>
      ))}
      {view.referral?.comments && (
        <details>
          <summary>Ulasan teknikal terkini</summary>
          <ul>
            {Object.entries(view.referral.comments).map(
              ([department, comment]) => (
                <li key={department}>
                  {
                    departmentLabels[
                      department as keyof typeof departmentLabels
                    ]
                  }{" "}
                  — {(comment as { general: string }).general}
                </li>
              ),
            )}
          </ul>
        </details>
      )}
      {decisions.size > 0 && (
        <ul>
          {view.scopes.map((scope) => {
            const decision = decisions.get(scopeKey(scope));
            return (
              decision && (
                <li key={scopeKey(scope)}>
                  {scope.unitLabel} · {scope.floorLabel} — {decision.outcome}
                  {decision.conditionUntil &&
                    " hingga " + decision.conditionUntil}
                </li>
              )
            );
          })}
        </ul>
      )}
      {applicant &&
        letters.map((number) => (
          <p key={number}>
            <a href={"/api" + path + "/letters/" + number}>
              Muat turun {number === 1 ? "surat induk" : "surat susulan"}{" "}
              LATIHAN v{number}
            </a>
          </p>
        ))}
      {view.invoice && (
        <p>
          Invois kedua tiruan ·{" "}
          {(view.invoice.amountSen / 100).toLocaleString("ms-MY", {
            style: "currency",
            currency: "MYR",
          })}
          {" · "}
          {view.invoice.settled ? "Direkonsiliasi" : "Menunggu bayaran"}.
        </p>
      )}
      {view.response && <p>Jawapan susulan: {view.response.note}</p>}
      {!view.closed && (
        <>
          {role === "PIC_KAWASAN" &&
            !view.referral &&
            action("Rujuk Perancang dan Kejuruteraan", { action: "REFER" })}
          {role === "PIC_KAWASAN" &&
            view.referral &&
            papers === letters.length &&
            (letters.length === 0 || view.response?.allowed) &&
            noteForm("Ringkasan Kertas Pertimbangan", (e) => {
              e.preventDefault();
              void send({ action: "SUBMIT_PAPER", summary: comment });
            })}
          {role === "PIC_KAWASAN" &&
            view.response?.allowed &&
            !view.response.referred &&
            papers === letters.length && (
              <div className="synthetic-controls">
                {Object.entries(departmentLabels).map(([key, label]) => {
                  const department = key as keyof typeof departmentLabels;
                  return (
                    <label key={key}>
                      <input
                        type="checkbox"
                        checked={selected.includes(department)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, department]
                              : selected.filter((item) => item !== department),
                          )
                        }
                      />
                      {label}
                    </label>
                  );
                })}
                {selected.length > 0 &&
                  action("Rujuk semula jabatan dipilih", {
                    action: "REREFER",
                    departments: selected,
                  })}
              </div>
            )}
          {tech &&
            view.referral?.assigned &&
            !view.referral.comment &&
            noteForm(
              "Ulasan umum jabatan",
              (e) => {
                e.preventDefault();
                void send({
                  action: "COMMENT",
                  general: comment,
                  details: view.scopes.flatMap(({ unitId, floorId }) => {
                    const value = details[unitId + "/" + floorId]?.trim();
                    return value ? [{ unitId, floorId, comment: value }] : [];
                  }),
                });
              },
              <fieldset>
                <legend>Ulasan khusus unit dan tingkat</legend>
                {view.scopes.map((scope) => (
                  <label key={scopeKey(scope)}>
                    {scope.unitLabel} · {scope.floorLabel}
                    <input
                      maxLength={1000}
                      value={details[scopeKey(scope)] ?? ""}
                      onChange={(e) =>
                        setDetails({
                          ...details,
                          [scopeKey(scope)]: e.target.value,
                        })
                      }
                    />
                  </label>
                ))}
              </fieldset>,
            )}
          {role === "URUS_SETIA_JK" &&
            papers === letters.length + 1 &&
            (decisions.size === 0 || view.decisionSigned) && (
              <form
                className="synthetic-controls"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send({
                    action: "DECIDE",
                    decisions: decisionScopes.map(({ unitId, floorId }) => {
                      const item = choice[unitId + "/" + floorId];
                      return {
                        unitId,
                        floorId,
                        outcome: item?.outcome ?? "SK",
                        reason: item?.reason ?? "",
                        ...(item?.outcome === "SKB" && {
                          conditionUntil: item.date,
                        }),
                      };
                    }),
                  });
                }}
              >
                {decisionScopes.map((scope) => {
                  const id = scopeKey(scope);
                  const item = choice[id] ?? {
                    outcome: "SK" as const,
                    reason: "",
                    date: "",
                  };
                  return (
                    <fieldset key={id}>
                      <legend>
                        {scope.unitLabel} · {scope.floorLabel}
                      </legend>
                      <label>
                        Keputusan{" "}
                        <select
                          value={item.outcome}
                          onChange={(e) =>
                            setChoice({
                              ...choice,
                              [id]: {
                                ...item,
                                outcome: e.target.value as typeof item.outcome,
                              },
                            })
                          }
                        >
                          {["SK", "SKB", "TANGGUH", "TOLAK"].map((value) => (
                            <option key={value}>{value}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Alasan{" "}
                        <input
                          required
                          minLength={3}
                          maxLength={1000}
                          value={item.reason}
                          onChange={(e) =>
                            setChoice({
                              ...choice,
                              [id]: { ...item, reason: e.target.value },
                            })
                          }
                        />
                      </label>
                      {item.outcome === "SKB" && (
                        <label>
                          Tarikh tamat syarat{" "}
                          <input
                            type="date"
                            required
                            value={item.date}
                            onChange={(e) =>
                              setChoice({
                                ...choice,
                                [id]: { ...item, date: e.target.value },
                              })
                            }
                          />
                        </label>
                      )}
                    </fieldset>
                  );
                })}
                <button className="button small" disabled={pending}>
                  Rekod keputusan mesyuarat latihan
                </button>
              </form>
            )}
          {role === "PEGAWAI_PENANDATANGAN" &&
            decisions.size > 0 &&
            !view.decisionSigned &&
            action("Tandatangan secara simulasi", { action: "SIGN" })}
          {applicant &&
            letters.length > 0 &&
            decisionScopes.length > 0 &&
            !view.responseSubmitted &&
            noteForm("Jawapan susulan latihan", (e) => {
              e.preventDefault();
              void send({ action: "RESPOND", note: comment });
            })}
          {role === "PIC_KAWASAN" &&
            view.response &&
            !view.response.checkedBy &&
            action("Sahkan semakan jawapan", { action: "CHECK_RESPONSE" })}
          {role === "PPSK" &&
            view.response?.checkedBy &&
            !view.response.allowed &&
            action("Benarkan pertimbangan susulan", {
              action: "ALLOW_RECONSIDERATION",
            })}
          {role === "PPSK" &&
            view.decisionSigned &&
            decisionScopes.length === 0 && (
              <div className="synthetic-controls">
                {!view.invoice &&
                  [...decisions.values()].some(
                    (item) => item.outcome === "SK",
                  ) &&
                  action("Jana invois kedua tiruan", {
                    action: "ISSUE_SECOND",
                  })}
                {view.invoice &&
                  !view.invoice.settled &&
                  action("Simulasi rekonsiliasi kedua", {
                    action: "SETTLE_SECOND",
                  })}
                {(view.invoice?.settled ||
                  ![...decisions.values()].some(
                    (item) => item.outcome === "SK",
                  )) &&
                  action("Tutup permohonan latihan", { action: "CLOSE" })}
              </div>
            )}
        </>
      )}
      {feedback && <SyntheticFeedback feedback={feedback} />}
    </section>
  );
}
