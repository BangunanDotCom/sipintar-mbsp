# Panduan fasilitator UAT dalaman STAYLink MBSP

Gunakan alat baris arahan Bahasa Melayu untuk sesi sintetik Jabatan Bangunan. Pakej Markdown merumuskan liputan dan jejak perubahan. CSV membolehkan fasilitator menapis mengikut komponen, keterukan, penanggungjawab dan status.

## Sediakan sesi

1. Ikut [persediaan cockpit](INTERNAL-UAT-COCKPIT.md) dengan PostgreSQL loopback kosong bernama `staylink_issue54_<label>_test` dan Mailpit tempatan. Tetapkan kedua-dua URL pangkalan data kepada pangkalan data latihan yang sama. Jalankan `npm run db:generate`, `npm run db:test:migrate`, `npm run db:seed` dan `npm run db:uat-demo`. Aktifkan gerbang portal sintetik untuk penjana kit. Kekalkan storan dokumen ditutup dan gunakan bil tiruan sahaja.
2. Buka profil pelayar berasingan bagi pemohon, PIC dan PPSK. Gunakan akaun dan MFA daripada kit. Simpan kelayakan kit secara setempat.
3. Tetapkan `TMPDIR` yang sama untuk setiap arahan. Jalankan penawanan pada akaun OS fasilitator yang dikawal. Alat ini menggunakan fail persendirian di luar checkout Git. Alias `SYN-*` membantu menjejak tindakan. Pengesahan identiti dan pemisahan tugas sebenar semasa sesi ialah tanggungjawab fasilitator.
4. Untuk mengulang demonstrasi dari awal, gunakan pangkalan data kosong, kit baharu dan ID sesi baharu. Simpan sejarah sesi terdahulu mengikut tatacara ICT yang diluluskan. Direktori sementara boleh dibersihkan oleh sistem. Simpan salinan laporan yang telah disemak di lokasi dalaman yang dibenarkan sebelum sesi mesin tamat.

## Rakam dengan Markdown dan CSV

```bash
export NODE_ENV=development STAYLINK_UAT_FEEDBACK=true
umask 077
session="$(npm run --silent uat:feedback -- init --session UAT-DEMO-54 --date "$(TZ=Asia/Kuala_Lumpur date +%F)" --commit "$(git rev-parse HEAD)")"
inputs="$(mktemp -d)"
cat > "$inputs/record.json" <<'JSON'
{
  "type": "RECORD",
  "by": "SYN-FASILITATOR",
  "actor": "PIC",
  "scenario": "failed-evidence",
  "expected": "Paparan menerangkan mengapa bukti latihan gagal.",
  "actual": "Dalam contoh triage ini sebab kegagalan tidak jelas.",
  "outcome": "FAIL",
  "severity": "MEDIUM",
  "reproducibility": "ALWAYS",
  "reproductionSteps": "Buka draf fixture dan semak paparan bukti berstatus FAILED.",
  "evidenceRef": "EV-DEMO-001",
  "component": "BUKTI",
  "issueRef": "GH-54"
}
JSON
id="$(npm run --silent uat:feedback -- record --dir "$session" --input "$inputs/record.json")"
npm run uat:feedback -- export --dir "$session" --format md
npm run uat:feedback -- export --dir "$session" --format csv
```

Satu rekod bagi setiap dapatan, termasuk keputusan `PASS`. Gunakan `severity: null` untuk PASS. Bagi FAIL atau BLOCKED, sertakan keterukan dan langkah mengulang. Nilai kebolehulangan ialah `ALWAYS`, `INTERMITTENT`, `ONCE` atau `NOT_APPLICABLE`. Untuk senario tambahan gunakan ID seperti `ADD-fokus-carian`. Guna ID bukti `EV-*` dan ID isu `GH-*` atau `UAT-*`. Catat rujukan sahaja. Elakkan nama, alamat, nombor peribadi, kata laluan, token, tangkap layar log masuk dan fail permohonan sebenar. Semak kandungan bebas sebelum berkongsi. Hasil eksport berizin 0600 dan direktori sesi 0700.

Jalankan `npm run uat:feedback -- update --dir "$session" --id "$id" --version N --input FAIL_JSON` bagi setiap tindakan. Ganti `N` dengan versi terkini daripada laporan atau output arahan.

| Tindakan | Contoh kandungan JSON | Langkah susulan |
| --- | --- | --- |
| Tetapkan penanggungjawab | `{"type":"ASSIGN","by":"SYN-FASILITATOR","team":"ICT","assignee":"SYN-PEMBAIKI"}` | Sahkan isu dan komponen agar penanggungjawab dapat mencari ujian. |
| Rekod pembetulan | `{"type":"FIX","by":"SYN-PEMBAIKI","commit":"1234abc","testRef":"tests/e2e/synthetic-portal.spec.ts","resolution":"Paparan sebab kegagalan disemak."}` | Gantikan contoh SHA dan laluan dengan nilai sebenar. |
| Uji semula | `{"type":"RETEST","by":"SYN-PENGUJI","result":"PASS","actual":"Sebab dipaparkan dalam fixture.","evidenceRef":"EV-RETEST-001"}` | Penguji berbeza daripada pembaik. FAIL/BLOCKED membuka semula rekod. |
| Semak rekod | `{"type":"REVIEW","by":"SYN-PENYEMAK","result":"VERIFIED_INTERNAL","note":"Bukti latihan dan hasil ujian semula disemak."}` | Penyemak berbeza daripada pembaik dan penguji atau perakam PASS. `CHANGES_REQUESTED` membuka semula rekod. |

`OPEN` menunggu triage, `ASSIGNED` menunggu tindakan, `FIX_RECORDED` menunggu ujian semula, `PASS_CAPTURED` atau `RETEST_PASSED` menunggu semakan, `REOPENED` memerlukan tindakan lanjut dan `VERIFIED_INTERNAL` memuktamadkan rekod latihan. Jika versi bercanggah, eksport semula sebelum mencuba lagi. Jika dapatan timbul semula selepas rekod dimuktamadkan, tambah rekod dengan rujukan isu yang sama. Gunakan [matriks keputusan pemilik](OWNER-DECISION-PACK.md) untuk penerimaan rasmi berasingan.

| Keterukan | Contoh | Tindakan |
| --- | --- | --- |
| BLOCKER | Pengasingan peranan gagal, pembayaran/storan sebenar terdedah, atau aliran utama tidak boleh diselesaikan | Hentikan sesi bagi aliran berkenaan dan maklumkan ICT serta pemilik. Sahkan pembetulan secara bebas sebelum dibuka semula. |
| HIGH | Kuasa luput masih boleh bertindak, kiraan unit/invois salah atau tiada laluan pembetulan | Eskalasi pada sesi yang sama dan jalankan regresi sebelum penerimaan dalaman. |
| MEDIUM | Navigasi papan kekunci tersekat pada satu kawalan atau arahan pemulihan kurang jelas | Tetapkan penanggungjawab dan semak semula senario dan resolusi skrin terjejas. |
| LOW | Pelabelan atau jarak visual mengganggu tanpa menghalang tugas | Rekod dan jadualkan pembetulan atau terima melalui keputusan yang direkodkan. |

## Jalankan demonstrasi dan semak penerimaan

Jalankan [skrip 25 minit](INTERNAL-UAT-COCKPIT.md#demonstrasi-25-minit) bagi aliran penuh. Tambah blok susulan untuk menguji baki fixture dan liputan silang peranan.

| Masa | Senario kit | Semakan |
| --- | --- | --- |
| 0–25 minit | `single-unit` | Draf pemohon, bukti FAILED/CLEAN, akuan, arahan pembetulan PIC, serahan semula, perbandingan, pendaftaran PPSK, RM50 bagi satu unit yang merentasi dua tingkat dan rekonsiliasi tiruan. |
| Susulan | `multiple-units` | Dua unit fizikal unik menghasilkan RM100 dalam latihan. |
| Susulan | `failed-evidence` | Bukti metadata FAILED menghalang serahan. |
| Susulan | `company-active` | Wakil aktif memilih kapasiti dan menyediakan bukti bagi draf latihan yang dibenarkan. |
| Susulan | `company-expired` | Kuasa luput menyekat bacaan dan tindakan. Gunakan regresi API bagi kuasa ditarik balik. |
| Susulan | `district-spt` | PIC SPU tidak melihat tugasan, perbandingan atau invois SPT. |
| Susulan | `ADD-fokus-carian` | Cari dan kosongkan carian pegawai menggunakan papan kekunci. Semak fokus pada lebar 320 dan 390 px. |

- Rekod ID sesi, tarikh MYT, SHA, peranan, keputusan setiap senario dan mana-mana liputan belum diuji. Catat pembeza antara keputusan diperhatikan, dijangka dan dibuktikan oleh CI.
- Tapis FAIL/BLOCKED, semak versi paling baharu dan dapatkan bukti ujian semula untuk dapatan pembetulan. Rujuk isu dan laluan ujian untuk setiap pembetulan.
- Sertakan laporan sintetik disemak, nombor larian CI, keputusan restore dan jadual risiko dalam pakej penerimaan teknikal. Rekod sebarang penerimaan Jabatan Bangunan secara berasingan selepas sesi fasilitator sebenar.

## Sahkan semula pada commit akhir

```bash
npm ci
npm run db:generate
npm run typecheck
npm run lint
npx vitest run --exclude tests/api.test.ts
npm run build
npm audit
```

Pada DB API sintetik yang berasingan, jalankan `npm run db:test:migrate`, `npm run db:seed` dan `npx vitest run tests/api.test.ts`. Pada DB pelayar yang lain, jalankan migrasi, seed, mulakan API dan web pada loopback, kemudian `npm run test:e2e`. Ulang spec `tests/e2e/synthetic-portal.spec.ts` dengan kit peranan yang dihasilkan pada DB ketiga. Untuk pemulihan, sediakan DB sasaran kosong berlabel `staylink_issue54_restore_<label>_test`; jalankan `bash scripts/rehearse-synthetic-restore.sh <bekas-lokal> <peranan-db-latihan> <db-api> <db-pemulihan>`. Workflow **STAYLink synthetic portal UAT** menyediakan langkah lengkap dan memisahkan ketiga-tiga job integrasi. Gunakan [gerbang penerimaan dan daftar risiko](OWNER-DECISION-PACK.md#gerbang-dan-risiko-terbuka) untuk semakan seterusnya.
