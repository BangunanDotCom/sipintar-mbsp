import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { SyntheticLoadError } from "./synthetic-portal-ui";

type Summary = {
  draftVersion: number;
  policyVersion: string;
  floorCount: number;
  unitCount: number;
  evidenceCount: number;
  floors: {
    id: string;
    floorLabel: string;
    rooms?: number;
    beds?: number;
    workers?: number;
    facilities?: {
      toilets: number;
      bathrooms: number;
      sinks: number;
      diningTables: number;
      diningChairs: number;
      fireExtinguishers: number;
    };
  }[];
};
type Unit = { label: string; floors: number };
type Comparison = {
  current: Summary;
  previous: Summary | null;
  unitChanges: { id: string; before: Unit | null; after: Unit | null }[];
  newEvidence: { id: string; category: string; version: number }[];
};

export function SyntheticReviewComparison({
  id,
  identity,
}: {
  id: string;
  identity: string;
}) {
  const query = useQuery<Comparison>({
    queryKey: ["synthetic-comparison", identity, id],
    queryFn: () => api(`/synthetic-portal/reviews/${id}/comparison`),
    retry: false,
  });
  if (query.isError)
    return (
      <SyntheticLoadError
        title="Perbandingan serahan latihan"
        error={query.error}
        retry={() => void query.refetch()}
      />
    );
  if (!query.data) return <p role="status">Memuatkan perbandingan…</p>;
  const { current, previous, unitChanges, newEvidence } = query.data;
  return <p>Tiada versi terdahulu yang boleh dibandingkan dalam skop anda.</p>;
  return (
    <section
      className="synthetic-comparison"
      aria-label="Perbandingan serahan latihan"
    >
      <div className="synthetic-comparison-grid">
        {[...(previous ? [previous] : []), current].map((summary) => (
          <div key={summary.draftVersion}>
            <h5>{summary === previous ? "Versi terdahulu" : "Versi semasa"}</h5>
            <p>
              Draf v{summary.draftVersion} · Dasar {summary.policyVersion}
            </p>
            <p>
              {summary.unitCount} unit · {summary.floorCount} tingkat ·{" "}
              {summary.evidenceCount} bukti
            </p>
          </div>
        ))}
      </div>
      <details>
        <summary>Inventori tingkat dan kemudahan semasa</summary>
        <ul>
          {current.floors.map((floor) => (
            <li key={floor.id}>
              <strong>{floor.floorLabel}</strong>
              {floor.rooms !== undefined && (
                <span>
                  {" "}
                  · {floor.rooms} bilik · {floor.beds} katil · {floor.workers}{" "}
                  pekerja
                </span>
              )}
              {floor.facilities && (
                <p>
                  {floor.facilities.toilets} tandas ·{" "}
                  {floor.facilities.bathrooms} bilik mandi ·{" "}
                  {floor.facilities.sinks} singki ·{" "}
                  {floor.facilities.diningTables} meja ·{" "}
                  {floor.facilities.diningChairs} kerusi ·{" "}
                  {floor.facilities.fireExtinguishers} pemadam api
                </p>
              )}
            </li>
          ))}
        </ul>
      </details>
      {previous ? (
        <>
          {unitChanges.length ? (
            <ul aria-label="Perubahan unit fizikal">
              {unitChanges.map(({ id, before, after }) => (
                <li key={id}>
                  {before
                    ? `${before.label} (${before.floors} tingkat)`
                    : "Unit baharu"}{" "}
                  →{" "}
                  {after
                    ? `${after.label} (${after.floors} tingkat)`
                    : "Unit dikeluarkan"}
                </li>
              ))}
            </ul>
          ) : (
            <p>Tiada perubahan pada unit fizikal atau pautan tingkat.</p>
          )}
          {newEvidence.length ? (
            <ul aria-label="Versi bukti baharu">
              {newEvidence.map((item) => (
                <li key={item.id}>
                  {item.category} · v{item.version}
                </li>
              ))}
            </ul>
          ) : (
            <p>Tiada versi bukti baharu.</p>
          )}
        </>
      ) : (
        <p>Tiada versi terdahulu yang boleh dibandingkan dalam skop anda.</p>
      )}
    </section>
  );
}
