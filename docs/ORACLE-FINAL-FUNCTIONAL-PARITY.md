# Kesetaraan fungsi Oracle dan PostgreSQL

Calon `integration/oracle-final-functional-parity` bertindan pada Oracle PR #81 `765b374545dbed54f3d33ca5ae44db4ca52cbdab`. Kontrak PostgreSQL ialah PR #82 `a4916a5adc0c2ff620f7bd40875372fafef35976`. Kontrak ujian adapter luar talian, semantik SLA dan penapisan retensi disemak semula terhadap PR #83 `2d4c43663e64a227ccaa05abb3db7d57e52e4542`. Kod penyatuan awal ialah `a89ea234b558beed2786b59a916fbc54ee3bf404`. [Draft PR #84](https://github.com/BangunanDotCom/sipintar-mbsp/pull/84) · [Audit Team 3](https://github.com/BangunanDotCom/sipintar-mbsp/pull/72)

Status **PASS** di bawah merujuk kepada larian Team 2 pada PostgreSQL dan Oracle Free 23.26.4 dalam makmal. Status **BLOCKED** menyatakan bukti atau keputusan yang masih diperlukan.

| Fungsi | PostgreSQL | Oracle Free | Bukti dan baki |
| --- | --- | --- | --- |
| Outbox pembetulan pemohon | PASS | PASS | Tindakan PIC menambah rekod pada transaksi semakan. Worker menyemak serahan terkini dan status CORRECTION_REQUESTED. Regresi khusus penghantaran sebelum dan selepas serahan semula masih BLOCKED. |
| Bayaran pertama dan kedua | PASS | PASS | Invois menjadualkan peringatan dengan rujukan tepat. Ujian penyelesaian membatalkan kedua-dua peringatan tertunggak. Dua callback menghasilkan satu penyelesaian. |
| Tamat SKB | PASS | PASS | Peringatan dijadualkan pada tengah malam MYT selepas tarikh tamat. Ujian membatalkan peringatan lapuk selepas keputusan susulan dan kes ditutup. Bukti penghantaran positif tepat di sempadan masih BLOCKED. |
| Surat keputusan dan penutupan | PASS | PASS | Dua surat sah dan satu penutupan dihantar sekali apabila dua worker bersaing. Mesej generik tidak mengandungi ID kes dan portal tidak mengulangi notifikasi yang telah dikeluarkan. |
| Kelayakan akhir pegawai | PASS | PASS | Semakan, pra-semakan, bayaran dan Completion mengesahkan semula peranan sebelum komit. Ujian BKT menahan sisipan audit sehingga pelantikan luput pada jam DB, mendapat 403, kemudian menerima ulangan selepas pelantikan dipulihkan. |
| SLA P1 selepas RETURN_COMMENT | PASS | PASS | Sebelum, tepat dan selepas sempadan tujuh hari diuji menggunakan masa yang sama pada butiran, dashboard, laporan JSON dan CSV. Ulasan dipulangkan menjadi tertunggak dalam rujukan semasa. Rujukan semula memulakan epoch sendiri. Laporan lama tanpa cap masa peristiwa menggunakan masa audit asal. |
| Semakan retensi | PASS | PASS | Hanya PPSK dalam skop boleh menyemak calon. Tahanan aktif dan permohonan buka semula mengecualikan rekod. Tapisan dijalankan sebelum kiraan 20 item halaman. Akses beraudit. Pelupusan tidak diaktifkan. |
| P0 B gerbang jemputan | PASS | PASS | PR #80 mengekalkan semakan pengguna, pelantikan, sesi, kuasa dan bukti asal menggunakan jam DB. Kegagalan menggulung tuntutan, keahlian, audit dan notifikasi. Team 3 mengesahkan makmal PR #80. Keputusan pemilik proses tentang sela antara SQL terakhir dan komit fizikal serta audit tepat SHA baharu masih BLOCKED. |
| P0 A dan akaun outbox | PASS | PASS | Akaun PostgreSQL berasingan menjadual dan menghantar peringatan sebenar dalam makmal. DDL, kemas kini verdict/kuasa dan pengubahan konteks atau pemadaman outbox ditolak. Oracle menjalankan outbox dengan akaun worker berasingan dan grant kemas kini hanya pada lajur penghantaran. ClamAV, proksi dan grants rasmi masih BLOCKED. |
| Naik taraf dan ulangan | PASS | PASS | PostgreSQL menggunakan migrasi PR #82 serta fungsi kunci scoped worker. Oracle 006 menambah constraint baharu dan menggantikan constraint jenis lama. 007 meluaskan KIND untuk nama acara penuh. Inventori dan checksum 001–005 kekal. Latihan Oracle undur ke 005 memadankan checksum bagi 33 jadual daripada titik sebelum naik taraf. |
| Pemulihan, hash dan MFA | BLOCKED | PASS | Oracle Free memulihkan 33 jadual, 106 baris lejar dan 222 baris outbox. 156 PDF sepadan dengan SHA-256 dan tujuh ketidakpadanan LEGACY kekal dikuarantin. Kunci makmal menyahsulit faktor MFA yang dipulihkan. Import PostgreSQL semasa dan pemulihan fizikal masih memerlukan bukti lanjut. |
| Pemangku, serah tugas, lampiran BKT | BLOCKED | BLOCKED | Kontrak dan keputusan pemilik proses belum stabil. |
| Refund, dispute, pelarasan lejar dan buka semula | BLOCKED | BLOCKED | Menunggu kelulusan kontrak, kuasa bebas dan polisi operasi. |
| Kontrak adapter luar talian PR #83 | PASS | PASS | Fixture bersama untuk MBSPPay, pra-semakan AI, tandatangan, SMTP, GIS dan SSO. Tiada laluan operasi. |
| Jurnal melebihi 500 acara, notifikasi penugasan dan adapter rasmi | BLOCKED | BLOCKED | Menunggu kontrak replay, deduplikasi dan penerimaan JTIK. |

## Menjalankan semula bukti

- Pembetulan SLA, transaksi, retensi dan dua worker menggunakan `tests/completion-provider-parity.test.ts`. Jalankan PostgreSQL dan Oracle Free dengan fail env makmal masing-masing. Suite P0 jemputan dan pengasingan menggunakan `tests/delegation-provider-parity.test.ts`, `tests/delegation-postgres-privileges.test.ts` dan `tests/training-outbox-postgres-privileges.test.ts`.
- Gunakan `STAYLINK_COMPLETION_PARITY_KIT_DIR` dengan direktori kosong dan persendirian untuk menghasilkan kit 11 akaun kedua-dua enjin. Untuk aliran tindakan UI gunakan `STAYLINK_COMPLETION_PARITY_UI_FLOW=true` ketika menjana fixture dan menjalankan Playwright. Fixture menyediakan kes berdaftar dengan bayaran pertama diselesaikan. Aplikasi dibuka pada HTTPS loopback PostgreSQL dan HTTP loopback Oracle Free. Satu kit aliran tindakan hanya boleh digunakan sekali kerana peralihan sebenar dikomit.
- Jalankan `scripts/benchmark-provider-reports.ts` dengan `STAYLINK_BENCH_REPORTS=true` pada DB PostgreSQL `staylink_issue62_personal_completionbench_test` atau skema Oracle `STL_LAB_FP_BENCH` yang boleh dibuang, dengan kit, pelantikan dan grants sintetik sepadan. Skrip menghasilkan 100, 1,000 dan 5,000 serahan individu dan mengukur laporan pada konkurensi tiga. Ukuran Oracle `connectionsInUse` datang daripada driver. PostgreSQL menggunakan sampel `pg_stat_activity`. Ukur lock wait Oracle di peringkat DBA staging.
- Jalankan `scripts/oracle/verify-restored-fixtures.ts` dengan `STAYLINK_VERIFY_SYNTHETIC_RESTORE=true` dan dua fail snapshot persendirian. Tetapkan `STAYLINK_VERIFY_SYNTHETIC_MFA_EMAIL` bagi probe pilihan pada akaun `@example.test` menggunakan kunci MFA makmal. Skrip hanya mencetak kiraan dan status.

## Penerimaan operasi

Bukti makmal Oracle Free tidak menyediakan pengesahan Oracle 19.30 SE2. JTIK perlu meluluskan PDB, INDECS/STL_, 15 indeks dalaman `SYS_IL`, grants, ClamAV terurus, TLS/cache/redaksi, kapasiti, RMAN, RPO/RTO, DR dan cutover. P0 kekal terbuka. Complete Release dan Go Live kekal **NO-GO**. [Checklist JTIK](ORACLE-JTIK-CHECKLIST.md)
