import {
  scenarios,
  summarizeObservation,
  type Entry,
  type UatSession,
} from "./uat-feedback-model.js";

export type ReportRecord = { id: string; entries: Entry[] };

export function renderFeedbackReport(
  session: UatSession,
  records: ReportRecord[],
  format: "md" | "csv",
) {
  const summary = records.map(({ id, entries }) => ({
    id,
    entries,
    ...summarizeObservation(entries),
  }));
  const header = [
    "Sesi",
    "Tarikh MYT",
    "Commit",
    "Rekod",
    "Versi",
    "Pelaku",
    "Senario",
    "Komponen",
    "Isu",
    "Jangkaan",
    "Hasil sebenar",
    "Keputusan",
    "Keterukan",
    "Kebolehulangan",
    "Langkah mengulang",
    "Bukti",
    "Penanggungjawab",
    "Pembetulan",
    "Commit pembetulan",
    "Ujian",
    "Ujian semula",
    "Bukti ujian semula",
    "Semakan dalaman",
    "Status",
    "Dikemas kini UTC",
  ];
  const rows = summary.map(
    ({ id, entries, first, state, assignment, fix, retest, review }) => [
      session.id,
      session.dateMyt,
      session.commit,
      id,
      entries.length,
      first.actor,
      first.scenario,
      first.component,
      first.issueRef,
      first.expected,
      first.actual,
      first.outcome,
      first.severity,
      first.reproducibility,
      first.reproductionSteps,
      first.evidenceRef,
      assignment ? `${assignment.team} / ${assignment.assignee}` : null,
      fix?.resolution,
      fix?.commit,
      fix?.testRef,
      retest ? `${retest.result} · ${retest.actual}` : null,
      retest?.evidenceRef,
      review ? `${review.result} · ${review.by} · ${review.note}` : null,
      state,
      entries.at(-1)?.at,
    ],
  );
  if (format === "csv") {
    const cell = (value: string | number | null | undefined) => {
      const text = String(value ?? "");
      const neutral = /^[\s\uFEFF]*[=+@-]/.test(text) ? "'" + text : text;
      return '"' + neutral.replaceAll('"', '""') + '"';
    };
    return (
      [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n") +
      "\r\n"
    );
  }
  const escape = (input: string | number | null | undefined) =>
    String(input ?? "—")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replace(/[\\|`*_[\]()!~]/g, "\\$&");
  const report = [
    "# Laporan maklum balas UAT sintetik",
    "",
    `Sesi ${session.id} · ${session.dateMyt} MYT · commit \`${session.commit}\``,
    "",
    "Rekod latihan untuk semakan dalaman. Penerimaan MBSP, staging dan produksi memerlukan rekod kelulusan berasingan.",
    "",
    "## Liputan senario",
    "",
    "| Senario | Direkod | Disahkan dalaman | Menunggu semakan / pembetulan |",
    "| --- | ---: | ---: | ---: |",
    ...[
      ...new Set([...scenarios, ...summary.map(({ first }) => first.scenario)]),
    ].map((scenario) => {
      const matches = summary.filter(
        ({ first }) => first.scenario === scenario,
      );
      const verified = matches.filter(
        ({ state }) => state === "VERIFIED_INTERNAL",
      ).length;
      return `| ${scenario} | ${matches.length || "Belum diuji"} | ${verified} | ${matches.length - verified} |`;
    }),
    "",
    "## Jejak rekod dan pembetulan",
    "",
    ...rows.flatMap((row, index) => [
      `### ${escape(summary[index].id)} · ${escape(summary[index].first.scenario)}`,
      "",
      ...header
        .slice(4)
        .map((label, field) => `- **${label}** · ${escape(row[field + 4])}`),
      "",
      ...summary[index].entries.map(
        ({ at, event }, eventIndex) =>
          `- Versi ${eventIndex + 1} · ${escape(at)} · ${escape(event.type)} · ${escape(event.by)}`,
      ),
      "",
    ]),
  ];
  return report.join("\n") + "\n";
}
