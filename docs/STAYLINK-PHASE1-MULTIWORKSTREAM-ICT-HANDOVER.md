# STAYLink MBSP Fasa 1 — pelan pembangunan berkelompok dan pakej serahan ICT

Status: pelan pelaksanaan untuk Issue #24. Bukan kelulusan produksi, bukan pengesahan dasar ICT/Unit Rekod.

## Prinsip
- Jalankan kerja berkelompok A–E, bukan hentikan selepas setiap commit; pecahkan PR mengikut sempadan keselamatan dan kebergantungan, bukan mengikut langkah kecil.
- Gunakan data sintetik dan persekitaran ujian terasing. Tiada dokumen pemohon sebenar, transaksi sebenar, migrasi produksi, merge atau deployment tanpa kelulusan berasingan.
- Dasar belum disahkan: konfigurasi berversi, disabled/fail-closed dan dicatat dalam daftar keputusan. Pengesahan akhir ICT/Unit Rekod dikumpulkan semasa handover selepas pembangunan lengkap.
- PR #19 -> #21 -> #23 ialah dependency; selesaikan review sebelum sebarang cadangan integrasi. Worker `dashboard-bangunan-mbsp` dilarang diubah.

## Gelombang A: K03/K04/K07
Polisi kategori dokumen dinamik; bukti kuasa wakil ber-ID dan pautan UUID K02; metadata versi dan snapshot; kawalan akses semasa; storan sintetik kuarantin dengan malware verdict fail-closed; unit/API/e2e/security tests. Peraturan kategori wajib, pengesahan pegawai, penyedia storan, retensi dan had fail ialah keputusan tertunggak, bukan polisi rasmi.

## Gelombang B: K05/K06
Akuan digital, simpan draf, pembetulan, serahan idempotent dengan optimistic concurrency, audit dan immutable snapshot. Gate serahan sebenar tidak diaktifkan sebelum keputusan operasi.

## Gelombang C: K08/K10
AI pre-check sebagai nasihat sahaja; keputusan PIC manusia, permission berasingan, MFA dan segregation of duties; mock AI tanpa pendedahan data sebenar.

## Gelombang D: K09
Satu invois berdasarkan unit fizikal yang disahkan, RM50/unit seperti baseline; satu unit merentasi beberapa tingkat dikira sekali. MBSPPay mock/sandbox sahaja; callback auth, idempotency, reconciliation, ledger dan ujian negatif.

## Gelombang E: ICT handover pack
Sediakan direktori `docs/ict-handover/` secara berperingkat dengan artifak berikut:

| Artifak | Bukti minimum | Pengesah akhir |
| --- | --- | --- |
| Architecture & data flow | diagram servis, aliran PII/dokumen, dependensi, trust boundaries | ICT |
| Inventori kod dan API | branch/commit, modul, OpenAPI/kontrak, konfigurasi & rahsia tanpa nilai | ICT |
| Skema dan migrasi | ERD, FK, migrasi additive, restore rehearsal sintetik, rollback | ICT/DBA |
| Matriks kuasa dan dokumen | kategori wajib/bersyarat, wakil, role, scope, segregation | Jabatan Bangunan |
| Kawalan storan dan malware | penyedia/region TBD, kunci, kuarantin, fail-closed, akses muat turun | ICT |
| Audit dan keselamatan | model ancaman, log redaction, MFA, access tests, penemuan risiko | ICT |
| Retensi dan pelupusan | klasifikasi, jadual rekod TBD, legal hold, backup lifecycle | Unit Rekod/ICT |
| SOP dan manual | manual pemohon, pegawai, admin, insiden, recovery, operasi | Jabatan Bangunan/ICT |
| Laporan pengesahan | unit/API/e2e/security tests, audit dependencies, penemuan & mitigasi | ICT/Jabatan Bangunan |
| Deployment & acceptance | environment matrix, rollback, UAT, sign-off, release checklist | ICT/pemilik sistem |

## Gerbang sebelum produksi
Semua dasar dan konfigurasi yang mempengaruhi pemohon, akses, rekod atau kewangan mesti mendapat kelulusan pihak berkuasa yang sesuai. ICT dan Unit Rekod mengesahkan artifak berkaitan; UAT, ujian keselamatan, pemulihan dan kebenaran deployment direkod secara berasingan. Jangan aktifkan operasi sebenar semata-mata kerana ujian sintetik lulus.

## Kriteria kemajuan Codex
Setiap PR draf mengandungi perubahan fungsi, ujian sebenar yang dijalankan, bukti dan risiko, kebergantungan, serta senarai TBD. Jika kerja dalam satu gelombang tersekat oleh dasar, teruskan gelombang lain yang selamat. Jangan mendakwa kerja autonomi berjalan selepas sesi tamat tanpa runner/automasi yang sah.
