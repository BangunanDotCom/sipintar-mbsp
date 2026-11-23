# Manifest keluaran STAYLink MBSP Demo Release 1.0

Manifest berisi disertakan sebagai `MANIFEST-KELUARAN.md` dalam arkib serahan. Manifest dibina selepas ujian pada SHA tepat selesai. Ia merujuk commit Git tanpa menyimpan nilai itu secara kendiri dalam commit tersebut. Fail `.sha256` bersebelahan arkib merekod cap jari ZIP.

## Jejak bukti

| Perkara | Rujukan yang perlu dipadankan |
| --- | --- |
| Sumber | Cabang `issue-62-demo-release-readiness`, [Draft PR #63](https://github.com/BangunanDotCom/sipintar-mbsp/pull/63), SHA penuh dan tarikh MYT |
| CI dan ujian | URL Actions pada SHA sama, keputusan TypeScript, lint, build, Vitest, API PostgreSQL, Playwright biasa dan HTTPS, audit npm serta pemulihan |
| Templat hos | [Pakej pemasangan](../../deploy/demo/README.md) termasuk Nginx/systemd, IIS/PowerShell, tetapan tanpa rahsia dan pemeriksaan prasyarat |
| Panduan pegawai | [Pakej pra-JTIK](PRE-JTIK-COMPLETE-PACK.md), [borang peranan dan senario UAT](UAT-SESSION-WORKSHEET.md), [triage dan ujian semula](UAT-FEEDBACK-TRIAGE.md) |
| Keputusan dan penerimaan | [Keputusan JTIK](JTIK-DECISION-AND-UAT-READINESS.md), [agenda teknikal](JTIK-TECHNICAL-SESSION-AGENDA.md), [borang penerimaan](GUIDED-UAT-ACCEPTANCE.md) dan [keputusan pemilik](OWNER-DECISION-PACK.md) |

Gunakan `sha256sum -c <nama-arkib>.sha256` pada Linux atau `Get-FileHash <nama-arkib> -Algorithm SHA256` pada Windows untuk memadankan arkib. Semak cap jari dan SHA Git pada saluran serahan yang diluluskan.

Status **READY FOR JTIK TECHNICAL REVIEW** memerlukan bukti automatik, pakej lengkap dan risiko terbuka direkod. Bukti hos produksi atau Windows sebenar, sesi UAT pegawai serta kelulusan pemasangan dan operasi mempunyai catatan berasingan. Simpan fail kelayakan kit dan rekod penerimaan bertandatangan di lokasi privat yang diluluskan.
