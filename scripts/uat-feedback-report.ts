import {
  scenarios,
  summarizeObservation,
  type Entry,
  type UatSession,
} from "./uat-feedback-model.js";

export type ReportRecord = { id: string; entries: Entry[] };

function history({ at, event }: Entry, index: number) {
  const label = `Versi ${index + 1} · ${at} · ${event.type} · ${event.by}`;
  switch (event.type) {
    case "RECORD":
      return `${label} · ${event.outcome} · ${event.evidenceRef}`;
    case "ASSIGN":
      return `${label} · ${event.team} / ${event.assignee}`;
    case "FIX":
      return `${label} · ${event.commit} · ${event.testRef} · ${event.resolution}`;
    case "RETEST":
      return `${label} · ${event.result} · ${event.evidenceRef} · ${event.actual}`;
    case "REVIEW":
      return `${label} · ${event.result} · ${event.note}`;
  }
}

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
    "Sejarah versi",
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
      entries.map(history).join(" | "),
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
  const covered = new Set(summary.map(({ first }) => first.scenario));
  const baselineCovered = scenarios.filter((scenario) => covered.has(scenario));
  const unresolved = summary.filter(
    ({ state }) => state !== "VERIFIED_INTERNAL",
  );
  const counts = (entries: typeof summary) =>
    ["PASS", "FAIL", "BLOCKED"].map(
      (outcome) =>
        entries.filter(({ first }) => first.outcome === outcome).length,
    );
  const [passes, failures, blocked] = counts(summary);
  const report = [
    "# Laporan maklum balas UAT sintetik",
    "",
    `Sesi ${session.id} · ${session.dateMyt} MYT · commit \`${session.commit}\``,
    "",
    "Rekod latihan untuk semakan dalaman. Penerimaan MBSP, staging dan produksi memerlukan rekod kelulusan berasingan.",
    "",
    "## Liputan senario",
    "",
    `Senario asas direkod **${baselineCovered.length}/${scenarios.length}**. Rekod awal **${passes} PASS**, **${failures} FAIL**, **${blocked} BLOCKED**.`,
    "",
    `Dapatan belum disahkan mengikut keterukan · ${["BLOCKER", "HIGH", "MEDIUM", "LOW"].map((severity) => `${severity} ${unresolved.filter(({ first }) => first.severity === severity).length}`).join(" · ")}.`,
    "",
    "| Senario | Direkod | PASS | FAIL | BLOCKED | Disahkan dalaman | Menunggu semakan / pembetulan |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...[
      ...new Set([...scenarios, ...summary.map(({ first }) => first.scenario)]),
    ].map((scenario) => {
      const matches = summary.filter(
        ({ first }) => first.scenario === scenario,
      );
      const verified = matches.filter(
        ({ state }) => state === "VERIFIED_INTERNAL",
      ).length;
      return `| ${scenario} | ${matches.length || "Belum diuji"} | ${counts(matches).join(" | ")} | ${verified} | ${matches.length - verified} |`;
    }),
    "",
    "## Jejak rekod dan pembetulan",
    "",
    ...rows.flatMap((row, index) => [
      `### ${escape(summary[index].id)} · ${escape(summary[index].first.scenario)}`,
      "",
      ...header
        .slice(4, -1)
        .map((label, field) => `- **${label}** · ${escape(row[field + 4])}`),
      "",
      ...summary[index].entries.map(
        (entry, eventIndex) => `- ${escape(history(entry, eventIndex))}`,
      ),
      "",
    ]),
    "## Borang pengesahan manual",
    "",
    "Isi dalam salinan penerimaan terkawal selepas bukti disemak. Pengesahan dalaman sesuatu dapatan tidak mengisi borang ini.",
    "",
    "| Peringkat | Rujukan bukti / minit | Keputusan dan tarikh MYT | Nama, kuasa dan tandatangan |",
    "| --- | --- | --- | --- |",
    "| CI untuk SHA diuji | | | |",
    "| Kesiapsiagaan demo teknikal ICT | | | |",
    "| UAT pegawai dilaksanakan | | | |",
    "| Penerimaan Jabatan Bangunan | | | |",
    "| Kelulusan staging | | | |",
    "| Kebenaran produksi | | | |",
  ];
  return report.join("\n") + "\n";
}
