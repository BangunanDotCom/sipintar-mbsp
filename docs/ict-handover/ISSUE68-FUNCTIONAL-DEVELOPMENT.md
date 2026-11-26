# Issue #68 · Pembangunan fungsi susulan

Cabang `issue-68-functional-development` berlapis pada PR #73 `0fe8c7a`, yang menggunakan PR #69 `7970f1f` sebagai asas Completion. Gerbang data dan peranan sintetik sedia ada terpakai. Laporan audit dan calon Oracle menerangkan bukti makmal dan kelulusan operasi yang berasingan. [Issue #68](https://github.com/BangunanDotCom/sipintar-mbsp/issues/68) · [Baki pelepasan](https://github.com/BangunanDotCom/sipintar-mbsp/blob/c0ca4737ca440ea8db3fac6981510e5ce83e08d1/docs/audit-pr67/BAKI-PEMBANGUNAN-PELEPASAN.md) · [PR Oracle #74](https://github.com/BangunanDotCom/sipintar-mbsp/pull/74)

## Aliran yang dibangunkan

| Aliran | Kontrak dan bukti |
| --- | --- |
| K08 semakan awal | PIC dalam skop daerah dengan MFA merekod semakan melalui `POST /api/synthetic-portal/reviews/:id/precheck`. Body `{mode:"AUTO",version}` meminta penyedia, sementara `{mode:"MANUAL",version,reason}` merekod semakan manual. `GET` pada laluan sama memulangkan 20 rekod terkini kepada pegawai yang lulus semakan kes. Keputusan disimpan dalam audit bersama versi serahan. Cubaan lapuk ditolak. UI memaparkan penemuan, sebab dan tindakan pembetulan. Kegagalan penyedia merekod `MANUAL_REQUIRED`. Keputusan PIC dan tindakan berasingan PPSK masih diperlukan. |
| K06 ketidakaktifan | Senarai pemilik draf memulangkan `inactivity.reviewAt` dan `inactivity.reviewDue` daripada perubahan draf terakhir untuk draf tanpa serahan latihan. Ambang ialah 60 hari dan diuji pada sempadan tepat. Notis portal membenarkan pemilik menyambung draf. Status, versi, rekod dan kuasa baca dikekalkan. |
| Kertas Pertimbangan | Urus Setia JK yang ditugaskan boleh menjalankan `RETURN_PAPER` dengan sebab pada versi semasa, sebelum keputusan direkod untuk kertas tersebut. PIC menyerahkan pindaan dan snapshot dipulangkan boleh dibaca oleh pegawai yang berkuasa. Ulasan teknikal yang disalin ke versi lama kekal bersama versi itu. API PostgreSQL meliputi kuasa, konflik versi dan pemeliharaan sejarah. |
| Surat keputusan | `GET /api/synthetic-portal/drafts/:id/completion/letters/:number?format=pdf` menjana PDF induk atau susulan daripada keputusan yang ditandatangani dalam latihan. Templat latihan `SYNTHETIC-DECISION-LETTER-v1` dan tarikh snapshot menentukan keluaran, termasuk bagi rekod SIGN lama. Akses pemohon, `no-store` dan rekod induk kekal sama selepas susulan. Keluaran teks UTF-8 kekal tersedia. PDF menggunakan fon Latin; aksara di luar set fon dipaparkan sebagai `?`. |
| Ringkasan Completion | Penapis status menggunakan tetingkap 50 kes terkini yang sama. Eksport CSV terhad kepada PIC/PPSK dengan peruntukan daerah aktif dan hanya memulangkan kiraan. |
| Had sejarah Completion | Had 500 digunakan ketika baca dan sebelum menambah perubahan. PostgreSQL menguji 499 dan 500 dapat dibaca, peralihan ke-501 ditolak tanpa menambah acara, dan sejarah sedia rosak dengan 501 acara gagal tertutup. Ulangan bayaran yang telah direkonsiliasi masih menggunakan laluan idempotent. |

Penyedia semakan awal lalai ialah manual. `STAYLINK_SYNTHETIC_PRECHECK_PROVIDER=synthetic-rules` membolehkan peraturan deterministik di dalam proses ujian, dan sebarang nilai lain memerlukan semakan manual. Antara muka menerima kiraan unit, tingkat dan kelayakan bukti. Penulisan ini menggunakan jadual draf dan log audit sedia ada.

## Baki kerja dan keputusan pemilik

| Skop | Kerja yang masih diperlukan |
| --- | --- |
| K01–K04, K07 dan P0 | Audit bebas Team 3 dan kesetaraan versi bukti, proksi, stor, AV dan pemulihan di persekitaran JTIK yang diluluskan. |
| K06 dan K11 | Laluan penyelia untuk draf tidak aktif memerlukan takrif skop draf yang boleh dibaca pegawai serta aturan peringatan. Penomboran rasmi memerlukan siri, aturan reset dan kelulusan pemilik. Maklumat majikan kekal pilihan. |
| K08 dan K10 | Kelulusan penyedia sebenar dan tujuan pemprosesan. Delegasi sementara, pemangku dan tugasan berbilang daerah memerlukan aturan pemberi kuasa, skop dan kesan penarikan yang disahkan. |
| Rujukan dan BKT | Rujukan serentak dan SLA tujuh hari sudah tersedia dalam Completion latihan. Penerimaan/triage BKT serta penghantaran peringatan, jadual konsolidasi dan eskalasi rasmi memerlukan pemilik, penerima sah dan kekerapan yang ditetapkan. |
| Keputusan dan templat | Surat PDF dan templat v1 tersedia untuk latihan. Pratonton bagi Template Manager, versi templat rasmi, kapasiti JK, tandatangan digital, pengesahan sijil dan pembatalan perlu diselaraskan dengan Jabatan Bangunan serta JTIK. |
| K09 | Bayaran dan callback kedua-dua peringkat kekal simulasi, termasuk kiraan unit fizikal unik. Lejar dan kontrak refund/dispute memerlukan peristiwa kewangan, peraturan peruntukan, peranan dan SLA yang disahkan. Integrasi MBSPPay menunggu Kewangan dan JTIK. |
| Penutupan dan rekod | Penutupan dan penguncian versi diuji dalam latihan. Arkib, legal hold, retensi, pemulihan fail/kunci dan buka semula memerlukan dasar Unit Rekod dan laluan kuasa yang diluluskan. |
| Dashboard, notifikasi dan pentadbiran | Dashboard latihan menyediakan penapis dan eksport ringkasan daerah. Statistik semua kes, eksport terperinci, pengurusan peranan lanjutan, jadual peringatan dan deduplikasi outbox memerlukan aturan penerima, tindakan yang boleh dieksport dan operasi yang dipersetujui. SMTP rasmi kekal tidak aktif. |

Team 2 boleh mengekalkan padanan acara PostgreSQL–Oracle dengan menambah `RETURN_PAPER` dan pilihan `letterTemplate` pada penghurai jurnal Completion, merekod semakan awal di bawah `SYNTHETIC_PRECHECK_RECORDED`, serta menguatkuasakan had 500 secara atomik pada baris serahan. Rekod SIGN lama mengambil templat latihan v1 dan pembaca Oracle perlu mengekalkan aturan ini. Kesetaraan calon susulan belum dibuktikan.

**Complete Release dan Go Live kekal NO-GO.**
