# Kesetaraan fungsi Oracle dan PostgreSQL

Calon `integration/oracle-final-functional-parity` bertindan pada Oracle PR #81 `765b374545dbed54f3d33ca5ae44db4ca52cbdab`. Kontrak PostgreSQL ialah PR #82 `a4916a5adc0c2ff620f7bd40875372fafef35976`. Kontrak ujian adapter luar talian, semantik SLA dan penapisan retensi disemak semula terhadap PR #83 `2d4c43663e64a227ccaa05abb3db7d57e52e4542`. Kod penyatuan awal ialah `a89ea234b558beed2786b59a916fbc54ee3bf404`. [Draft PR #84](https://github.com/BangunanDotCom/sipintar-mbsp/pull/84) · [Audit Team 3](https://github.com/BangunanDotCom/sipintar-mbsp/pull/72)

Perubahan provider terakhir berada pada `4d9ac369efcc6cf0b71e2b46d1732a694fbe720b`. [CI perubahan provider](https://github.com/BangunanDotCom/sipintar-mbsp/actions/runs/45942933783)

Status **PASS** di bawah merujuk kepada larian Team 2 pada PostgreSQL dan Oracle Free 23.26.4 dalam makmal. Status **BLOCKED** menyatakan bukti atau keputusan yang masih diperlukan.

| Fungsi | PostgreSQL | Oracle Free | Bukti dan baki |
| --- | --- | --- | --- |
| Outbox pembetulan pemohon | PASS | PASS | Tindakan PIC menambah rekod pada transaksi semakan. Worker menyemak serahan terkini dan status CORRECTION_REQUESTED. Satu peringatan dihantar sebelum pembetulan dan satu dibatalkan selepas serahan semula pada kedua-dua enjin. |
| Bayaran pertama tertunggak | PASS | PASS | Penjanaan invois menjadualkan peringatan dengan rujukan invois pertama. Bayaran membatalkan peringatan tertunggak. |
| Bayaran kedua tertunggak | PASS | PASS | Penjanaan invois menjadualkan peringatan dengan rujukan invois kedua. Bayaran membatalkan peringatan tertunggak. Dua callback bagi invois yang sama menghasilkan satu penyelesaian. |
| Tamat SKB | PASS | PASS | Peringatan dijadualkan pada tengah malam MYT selepas tarikh tamat. Ujian membatalkan peringatan lapuk selepas keputusan susulan dan kes ditutup. Ujian kelayakan menggunakan jurnal DB sebenar sebelum, tepat dan selepas tengah malam. Penghantaran SMTP sebenar pada detik sempadan masih BLOCKED. |
| Surat keputusan dan susulan | PASS | PASS | Dua surat sah dihantar sekali apabila dua worker bersaing. Notifikasi portal kekal unik per versi surat. |
| Penutupan | PASS | PASS | Dua worker bersaing untuk satu peristiwa dan hanya satu penghantaran dikomit. Mesej generik tidak mengandungi ID kes. |
| Kelayakan akhir pegawai | PASS | PASS | Semakan, pra-semakan, bayaran dan Completion mengesahkan semula peranan sebelum komit. Ujian BKT menahan sisipan audit sehingga pelantikan luput pada jam DB, mendapat 403, kemudian menerima ulangan selepas pelantikan dipulihkan. |
| SLA P1 selepas RETURN_COMMENT | PASS | PASS | Sebelum, tepat dan selepas sempadan tujuh hari diuji menggunakan masa yang sama pada butiran, dashboard, laporan JSON dan CSV. Ulasan dipulangkan menjadi tertunggak dalam rujukan semasa. Rujukan semula memulakan epoch sendiri. Laporan lama tanpa cap masa peristiwa menggunakan masa audit asal. |
| Semakan retensi | PASS | PASS | Hanya PPSK dalam skop boleh menyemak calon. Tahanan aktif dan permohonan buka semula mengecualikan rekod. Tapisan dijalankan sebelum kiraan 20 item halaman. Akses beraudit. Pelupusan tidak diaktifkan. |
| P0 B gerbang jemputan | PASS | PASS | PR #80 mengekalkan semakan pengguna, pelantikan, sesi, kuasa dan bukti asal menggunakan jam DB. Kegagalan menggulung tuntutan, keahlian, audit dan notifikasi. Team 3 mengesahkan makmal PR #80. Keputusan pemilik proses tentang sela antara SQL terakhir dan komit fizikal serta audit tepat SHA baharu masih BLOCKED. |
| P0 A dan akaun outbox | PASS | PASS | Akaun PostgreSQL berasingan menjadual dan menghantar peringatan sebenar dalam makmal. DDL, kemas kini verdict/kuasa dan pengubahan konteks atau pemadaman outbox ditolak. Oracle menjalankan outbox dengan akaun worker berasingan dan grant kemas kini hanya pada lajur penghantaran. ClamAV, proksi dan grants rasmi masih BLOCKED. |
| Naik taraf dan ulangan | PASS | PASS | PostgreSQL menggunakan migrasi PR #82 serta fungsi kunci scoped worker. Oracle 006 menambah constraint baharu dan menggantikan constraint jenis lama. 007 meluaskan KIND untuk nama acara penuh. Inventori dan checksum 001–005 kekal. Latihan Oracle undur ke 005 memadankan checksum bagi 33 jadual daripada titik sebelum naik taraf. |
| Pemulihan, hash dan MFA | PASS sebagai sumber import | PASS | Oracle Free memulihkan 33 jadual, 106 baris lejar dan 222 baris outbox. 156 PDF sepadan dengan SHA-256 dan tujuh ketidakpadanan LEGACY kekal dikuarantin. Kunci makmal menyahsulit faktor MFA yang dipulihkan. Import PostgreSQL ke Oracle turut memuatkan 33 jadual, 17 PDF dengan hash sepadan, 116 catatan lejar dan 282 item outbox. Pemulihan fizikal masih BLOCKED. |
| Pelayar dengan kit 11 akaun | PASS | PASS | BKT, rujukan, pengesahan dua jabatan, pemulangan dan serahan ulasan, KP, keputusan, tandatangan, rekonsiliasi kedua, penutupan dan muat turun PDF melalui klik UI. PostgreSQL melalui HTTPS loopback dan Oracle melalui HTTP loopback. |
| Pelayar umum dan pembetulan pemohon | PASS | PASS | 27 ujian umum lulus per enjin. PIC meminta pembetulan melalui UI dan pemohon menjana semula bukti, menyemak akuan dan menyerahkan versi baharu melalui UI. Draf, peta, jemputan pegawai, MFA dan semakan kuasa syarikat juga disahkan. |
| Pemangku | BLOCKED | BLOCKED | Menunggu keputusan pemilik proses tentang skop dan tempoh kuasa. |
| Serah tugas | BLOCKED | BLOCKED | Menunggu kontrak serah tugas dan audit pemindahan kuasa. |
| Lampiran BKT | BLOCKED | BLOCKED | Menunggu kontrak versi lampiran dan dasar imbasan. |
| Refund | BLOCKED | BLOCKED | Menunggu kontrak transaksi pulangan dan polisi operasi. |
| Dispute | BLOCKED | BLOCKED | Menunggu kontrak peristiwa pertikaian serta status yang dibenarkan. |
| Pelarasan lejar | BLOCKED | BLOCKED | Menunggu kontrak jurnal dan kelulusan berasingan. |
| Kelulusan buka semula | BLOCKED | BLOCKED | Penapisan retensi mengecualikan permohonan buka semula. Aliran kelulusan masih menunggu kontrak kuasa berasingan. |
| Kontrak adapter luar talian PR #83 | PASS | PASS | Fixture bersama untuk MBSPPay, pra-semakan AI, tandatangan, SMTP, GIS dan SSO. Tiada laluan operasi. |
| Jurnal melebihi 500 acara | BLOCKED | BLOCKED | Menunggu kontrak replay dan keadaan bagi jurnal panjang. |
| Notifikasi penugasan | BLOCKED | BLOCKED | Menunggu kontrak penerima, masa penghantaran dan deduplikasi. |
| Adapter rasmi | BLOCKED | BLOCKED | Menunggu konfigurasi, kredensial staging dan penerimaan JTIK. |

## Prestasi laporan makmal

Setiap isipadu menggunakan 21 permintaan pada konkurensi tiga selepas warm-up dan memeriksa kiraan kes dalam setiap respons. Semua permintaan dalam pengukuran di bawah memberikan HTTP 200. Jadual menunjukkan p50/p95/p99 dalam milisaat.

| Kes | PostgreSQL p50/p95/p99 | Oracle Free p50/p95/p99 |
| --- | ---: | ---: |
| 100 | 84 / 102 / 107 | 201 / 301 / 315 |
| 1,000 | 230 / 314 / 314 | 2,392 / 2,603 / 2,626 |
| 5,000 | 697 / 1,058 / 1,071 | 5,390 / 7,065 / 7,143 |

Penggunaan pool mencapai tiga sambungan aktif pada kedua-dua enjin. Sampel `pg_stat_activity` PostgreSQL dan 48 sampel lock wait daripada `V$SESSION` Oracle merekodkan sifar penantian kunci. Pengukuran ini melibatkan laporan serahan individu dalam satu daerah pada sumber makmal bersama. Ujian sebelum pengoptimuman PostgreSQL menghasilkan lima timeout transaksi pada 5,000 kes, dan satu percubaan warm-up lain juga tamat masa. Pengoptimuman memilih ID yang layak sekali dan membaca peristiwa dalam lot. Ujian volum campuran, beban operasi, penahanan panjang dan SLO rasmi masih BLOCKED.

## Menjalankan semula bukti

- Pembetulan SLA, transaksi, retensi dan dua worker menggunakan `tests/completion-provider-parity.test.ts`. Jalankan PostgreSQL dan Oracle Free dengan fail env makmal masing-masing. Suite P0 jemputan dan pengasingan menggunakan `tests/delegation-provider-parity.test.ts`, `tests/delegation-postgres-privileges.test.ts` dan `tests/training-outbox-postgres-privileges.test.ts`.
- Gunakan `STAYLINK_COMPLETION_PARITY_KIT_DIR` dengan direktori kosong dan persendirian untuk menghasilkan kit 11 akaun kedua-dua enjin. Untuk aliran tindakan UI gunakan `STAYLINK_COMPLETION_PARITY_UI_FLOW=true` ketika menjana fixture dan menjalankan Playwright. Fixture menyediakan kes berdaftar dengan bayaran pertama diselesaikan. Aplikasi dibuka pada HTTPS loopback PostgreSQL dan HTTP loopback Oracle Free. Satu kit aliran tindakan hanya boleh digunakan sekali kerana peralihan sebenar dikomit. Jalankan `scripts/serve-provider-parity-proxy.mjs` dengan `STAYLINK_TEST_PARITY_PROXY=true` dan sijil/kunci loopback. Ia menggunakan sumber loopback berasingan untuk pelakon sintetik dan mengekalkan had kadar aplikasi. Vite menggunakan port 5174, API 3001, dan proksi membuka HTTP 5173 serta HTTPS 5443.
- Jalankan `scripts/benchmark-provider-reports.ts` dengan `STAYLINK_BENCH_REPORTS=true` pada DB PostgreSQL `staylink_issue62_personal_completionbench_test` atau skema Oracle `STL_LAB_FP_BENCH` yang boleh dibuang, dengan kit, pelantikan dan grants sintetik sepadan. Skrip menghasilkan 100, 1,000 dan 5,000 serahan individu dan mengukur laporan pada konkurensi tiga. Ukuran Oracle `connectionsInUse` datang daripada driver. PostgreSQL menggunakan sampel `pg_stat_activity`. Ukur lock wait Oracle di peringkat DBA staging.
- Jalankan `scripts/oracle/verify-restored-fixtures.ts` dengan `STAYLINK_VERIFY_SYNTHETIC_RESTORE=true` dan dua fail snapshot persendirian. Tetapkan `STAYLINK_VERIFY_SYNTHETIC_MFA_EMAIL` bagi probe pilihan pada akaun `@example.test` menggunakan kunci MFA makmal. Skrip hanya mencetak kiraan dan status.

## Larian regresi berasingan

- Suite Vitest umum merekodkan 516 lulus dan lapan dilangkau. Empat senario Completion yang diasingkan daripada larian umum lulus pada kedua-dua penyedia. Dua ujian spesifik kepada Oracle memerlukan proses Oracle. Satu ujian Issue #24 memerlukan pangkalan data latihan khusus yang berasingan.
- Ujian API Completion PostgreSQL dengan kit 11 akaun lulus dalam larian fokus. Ia mengesahkan tujuh peringatan teknikal dan dua peringatan pembayaran dibatalkan selepas kes ditutup. Dua surat dan satu notis penutupan kekal layak dan dihantar tepat sekali.
- Playwright umum merekodkan 27 lulus dan 11 dilangkau per enjin. Larian ini tidak memuatkan kit Completion dan hos HTTPS. Perjalanan pelayar Completion dengan 11 akaun dijalankan secara berasingan. Proksi sintetik menyediakan satu alamat loopback per senario ujian dan menggunakan had kadar aplikasi sedia ada.

## Penerimaan operasi

Bukti makmal Oracle Free tidak menyediakan pengesahan Oracle 19.30 SE2. JTIK perlu meluluskan PDB, INDECS/STL_, 15 indeks dalaman `SYS_IL`, grants, ClamAV terurus, TLS/cache/redaksi, kapasiti, RMAN, RPO/RTO, DR dan cutover. P0 kekal terbuka. Complete Release dan Go Live kekal **NO-GO**. [Checklist JTIK](ORACLE-JTIK-CHECKLIST.md)
