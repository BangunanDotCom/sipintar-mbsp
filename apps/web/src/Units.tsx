import React from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApplicantDraftWorkspace } from "./ApplicationDraft";
import { api, ApiError } from "./api";
import { Loading, Notice } from "./main";
import {
  premiseUnitsSaveSchema,
  type PremiseUnitInput,
  type PremiseUnitsRecord,
} from "../../../packages/shared/src/premise-units";
import "./premises.css";

function UnitEditor({ draftId }: { draftId: string }) {
  const client = useQueryClient();
  const key = ["draft-units", draftId];
  const path = `/application-drafts/${draftId}/units`;
  const query = useQuery({
    queryKey: key,
    queryFn: (): Promise<PremiseUnitsRecord> => api(path),
    retry: false,
  });
  const [working, setWorking] = React.useState<{
    version: number;
    units: PremiseUnitInput[];
  }>();
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState("");
  const [conflict, setConflict] = React.useState(false);

  if (query.error instanceof ApiError && query.error.status === 401) {
    return (
      <Navigate
        replace
        to={`/log-masuk?next=${encodeURIComponent(`/permohonan/draf/${draftId}/unit`)}`}
      />
    );
  }
  if (query.isPending) return <Loading />;
  if (query.isError) return <Notice error>{query.error.message}</Notice>;
  const record = query.data;
  const units = working?.units ?? record.units;
  const version = working?.version ?? record.version;
  const edit = (next: PremiseUnitInput[]) => {
    setWorking({ version, units: next });
    setMessage("");
  };
  const update = (index: number, item: PremiseUnitInput) =>
    edit(units.map((unit, unitIndex) => (unitIndex === index ? item : unit)));

  return (
    <div className="container">
      <div className="draft-heading">
        <span className="kicker">DRAF PERMOHONAN · BUTIRAN PREMIS</span>
        <h1>Unit fizikal premis</h1>
        <p>
          Setiap unit dikira sekali walaupun dipaut kepada beberapa tingkat.
        </p>
        <Link to={`/permohonan/draf/${draftId}/tingkat`}>
          Kembali ke butiran tingkat
        </Link>
      </div>
      <section className="panel" aria-label="Ringkasan unit">
        <p>
          Bilangan diisytiharkan:{" "}
          {record.totals.declaredCount ?? "Tidak dinyatakan"}
        </p>
        <p>Unit berdaftar dalam draf: {record.totals.unitCount}</p>
        {record.inventoryStatus === "NOT_RECORDED" && (
          <Notice>
            Inventori unit belum direkod. Angka agregat premis kekal sebagai
            maklumat yang diisytiharkan.
          </Notice>
        )}
        {record.inventoryStatus === "MISMATCH" && (
          <Notice error>
            Bilangan unit direkod berbeza daripada angka diisytiharkan. Semak
            kedua-dua bahagian.
          </Notice>
        )}
      </section>
      {!record.premiseId ? (
        <Notice error>
          <Link to={`/permohonan/draf/${draftId}/premis`}>
            Simpan maklumat premis dahulu
          </Link>
          .
        </Notice>
      ) : (
        <form
          className="panel"
          onSubmit={async (event) => {
            event.preventDefault();
            setError("");
            setConflict(false);
            const parsed = premiseUnitsSaveSchema.safeParse({ version, units });
            if (!parsed.success) {
              setError(
                parsed.error.issues.map((issue) => issue.message).join(" "),
              );
              return;
            }
            setBusy(true);
            try {
              const saved: PremiseUnitsRecord = await api(
                path,
                "PUT",
                parsed.data,
              );
              client.setQueryData(key, saved);
              setWorking(undefined);
              setMessage("Unit berjaya disimpan sebagai draf.");
              await Promise.all([
                client.invalidateQueries({ queryKey: ["application-draft"] }),
                client.invalidateQueries({ queryKey: ["application-drafts"] }),
                client.invalidateQueries({
                  queryKey: ["draft-floors", draftId],
                }),
                client.invalidateQueries({ queryKey: ["premises", draftId] }),
              ]);
            } catch (cause) {
              setError(
                cause instanceof Error ? cause.message : "Unit gagal disimpan.",
              );
              setConflict(cause instanceof ApiError && cause.status === 409);
            } finally {
              setBusy(false);
            }
          }}
        >
          {units.map((unit, index) => {
            const linked = record.units.some(
              (saved) =>
                saved.unitId === unit.unitId && saved.floorIds.length > 0,
            );
            return (
              <fieldset
                className="company-record"
                key={unit.unitId ?? `new-${index}`}
                disabled={busy}
              >
                <legend>Unit {index + 1}</legend>
                <label>
                  Label unit
                  <input
                    value={unit.unitLabel}
                    required
                    maxLength={80}
                    onChange={(event) =>
                      update(index, { ...unit, unitLabel: event.target.value })
                    }
                  />
                </label>
                <p>Tingkat yang dipaut</p>
                {record.floors.length === 0 && (
                  <p>Simpan butiran tingkat untuk menambah pautan.</p>
                )}
                {record.floors.map(({ floorId, floorLabel }) => (
                  <label key={floorId} className="check">
                    <input
                      type="checkbox"
                      checked={unit.floorIds.includes(floorId)}
                      onChange={(event) =>
                        update(index, {
                          ...unit,
                          floorIds: event.target.checked
                            ? [...unit.floorIds, floorId]
                            : unit.floorIds.filter((id) => id !== floorId),
                        })
                      }
                    />
                    {floorLabel}
                  </label>
                ))}
                {linked && (
                  <p>
                    Simpan unit tanpa pautan tingkat dahulu untuk membuangnya.
                  </p>
                )}
                <button
                  type="button"
                  className="button secondary small"
                  disabled={linked}
                  onClick={() => edit(units.filter((_, i) => i !== index))}
                >
                  Buang unit
                </button>
              </fieldset>
            );
          })}
          <div className="premises-actions">
            <button
              type="button"
              className="button secondary"
              disabled={busy || units.length >= 200}
              onClick={() => edit([...units, { unitLabel: "", floorIds: [] }])}
            >
              Tambah unit
            </button>
            <button
              type="submit"
              className="button"
              disabled={busy || !working}
            >
              {busy ? "Menyimpan…" : "Simpan draf unit"}
            </button>
          </div>
          {error && <Notice error>{error}</Notice>}
          {conflict && (
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={async () => {
                const refreshed = await query.refetch();
                if (refreshed.isSuccess) {
                  setWorking(undefined);
                  setConflict(false);
                  setError("");
                }
              }}
            >
              Muat semula draf unit (perubahan belum disimpan akan hilang)
            </button>
          )}
          {message && <Notice>{message}</Notice>}
        </form>
      )}
      <Link to={`/permohonan/draf/${draftId}/semakan`}>Ke Semakan Draf</Link>
    </div>
  );
}

export default function Units() {
  return (
    <ApplicantDraftWorkspace>
      {({ draft }) => <UnitEditor key={draft.id} draftId={draft.id} />}
    </ApplicantDraftWorkspace>
  );
}
