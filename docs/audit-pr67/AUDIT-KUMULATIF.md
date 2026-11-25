# Audit kumulatif bebas · 25 November 2026 (MYT)

**Keputusan Complete Release dan Go Live: NO-GO. Personal Demo pengguna kekal ditangguhkan.** Sasaran perbandingan ialah PR #69 `7970f1f857d245937fd0baaaf848e78e6f0ad1e7`, PR #70 `bfc468351091318d6a0f451c54709b8ca1e60110` dan PR #71 `035fb7ebf14441d1dbadaeb5849dc6a55215bf86`. PR #69 mempunyai 7/7 job CI lulus. Audit susulan dibuat pada klon terasing dengan PostgreSQL, Oracle Free 23.26.4, Mailpit, Nginx dan Chromium setempat. Data ujian, fail dan akaun adalah sintetik. [Issue #68](https://github.com/BangunanDotCom/sipintar-mbsp/issues/68) · [CI #69](https://github.com/BangunanDotCom/sipintar-mbsp/actions/runs/45527582124) · [Keputusan reka bentuk K01–K11](https://github.com/BangunanDotCom/sipintar-mbsp/blob/06b02f9/docs/PHASE1-MBSP-SPECIFICATION.md)

## Matriks fungsi dan subfungsi

**Diuji** untuk fungsi asas sebenar pada fixture. **Simulasi** untuk proses yang menggunakan pengganti integrasi rasmi. **Separa** untuk fungsi dengan baki pelaksanaan atau verifikasi. **Belum siap** untuk fungsi tanpa pelaksanaan pada SHA semakan. **Integrasi belum disahkan** memerlukan bukti penyedia atau kelulusan. [Matriks K01–K11](SEMAKAN-PR69.md#matriks-k01k11-dan-proses-lanjutan) · [Inventori API setiap enjin](ORACLE-API-PARITY.md)

| Fungsi | Status dan bukti | Baki atau gerbang |
|---|---|---|
| 1. Daftar individu/syarikat | **Diuji**, aktivasi Mailpit dan cipta profil syarikat | SMTP rasmi dan UAT |
| 2. Wakil pelbagai syarikat | **Diuji** jemputan, terima, switch dan pengasingan. **Separa** kuasa surat | A/B, revokasi semasa serahan dan polisi pemilik |
| 3. Profil dan akaun | **Diuji** identiti sekali, role, MFA, pemulihan dan admin | Pemulihan akaun selepas failover, bukti kunci dan SOP kecemasan |
| 4. Premis, unit, aras, kemudahan | **Diuji** UUID, pautan, versi dan simpan/rollback kedua-dua enjin | Padanan/semakan GIS rasmi dan aturan inventori legacy |
| 5. Kapasiti dan majikan pilihan | **Separa** jumlah pekerja tersedia tanpa memerlukan majikan | K11, frasa atau kapasiti ditetapkan JK, dasar medan majikan jika diperlukan |
| 6. Dokumen dan versi | **Separa** metadata/versi fixture, worker dokumen kes dan scan lease | Stor dan AV rasmi, akses fail kes, retensi, bukti susulan dan A/B |
| 7. AI dan pengesahan manusia | **Simulasi** pre-check dan pegawai menilai fixture | Penyedia sebenar, mod manual, privasi data dan kuasa |
| 8. Akuan dan serahan | **Simulasi** akuan berversi, resit sintetik, snapshot immutable, idempotensi | Teks akuan, tandatangan/kuasa pemohon dan serahan rasmi |
| 9. PIC dan PPSK | **Diuji** skop terpilih, pembetulan, daftar dan MFA pada fixture | Delegasi dan pelantikan sebenar semua daerah |
| 10. Nombor rujukan rasmi | **Belum siap**, pengenal latihan tersedia | Format, daftar pusat dan semakan nombor pendua rasmi |
| 11. Bayaran pertama | **Simulasi**, RM50 per UUID fizikal unik, ledger mock di kedua-dua enjin makmal | Kuasa kadar, lejar rasmi, settlement/refund dan sandbox MBSPPay |
| 12. Rujukan selari | **Simulasi**, dua jabatan selepas bayaran pertama. Perjalanan PostgreSQL dan Oracle makmal lulus | Sahkan 19.30 SE2 dan kuasa rasmi |
| 13. SLA tujuh hari | **Simulasi**, tujuh hari kalendar dan kes ulasan lewat | SOP kalendar, kerja berjadual dan eskalasi |
| 14. Ulasan per unit/tingkat | **Simulasi** untuk peranan, jabatan dan skop latihan | Kuasa tugasan sebenar, timbal balik dan jejak lampiran |
| 15. KP berversi | **Separa**, snapshot KP tersimpan dan notifikasi terpilih | Serahan/penerimaan BKT, pembetulan dan format versi rasmi |
| 16. SK/SKB/Tangguh/Tolak | **Simulasi** keputusan per pasangan dan sejarah | Kuasa JK, peraturan gabungan aras/unit, rayuan dan Oracle |
| 17. Keputusan bercampur/kelulusan sebahagian | **Simulasi** bukti pengeluaran keputusan campur pada fixture | Polisi kelulusan sebahagian, keluaran dokumen rasmi dan caj |
| 18. Surat induk/susulan | **Simulasi**, dua fail teks berlabel LATIHAN dimuat turun pada HTTPS | PDF rasmi, templat berkelulusan dan skop sejarah surat |
| 19. Tandatangan/kawalan kuasa | **Simulasi** penanda latihan dan peranan berasingan | Integrasi belum disahkan untuk penyedia, sijil, timestamp, revokasi dan pengesahan artifak |
| 20. SKB maksimum enam bulan | **Simulasi** had kalendar MYT dan tempoh kumulatif | Penjadualan, bukti, polisi JK dan notifikasi rasmi |
| 21. Susulan Tangguh | **Separa** semak respons, tarikh dan flag lewat, rujukan semula | Lampiran, proses lewat tanpa tarikh dan peringatan berjadual |
| 22. Bayaran kedua | **Simulasi** fi konfigurasi, settlement, replay dan penutupan pada kedua-dua enjin ujian | Sandbox rasmi, refund/dispute, lejar dan Oracle 19.30 SE2 |
| 23. Penutupan/arkib/retensi | **Separa** tutup dan sekat perubahan teras. **Belum siap** arkib, legal hold dan buka semula | P1-01, SOP rekod, pemulihan DB+fail+konfigurasi+kunci |
| 24. Dashboard pengurusan | **Separa** ringkasan maksimum 50 kes daerah fixture | Agregat berkuasa, penapis, eksport dan SLO |
| 25. Template Manager | **Diuji** CRUD berversi dan keaktifan menurut kontrak makmal | Templat surat rasmi dan kaitan dengan versi keputusan |
| 26. Notifikasi portal/e-mel | **Separa** portal dan SMTP loopback, outbox terpilih | Penghantaran rasmi, retry/eskalasi dan bukti delivery |
| 27. Pentadbir dan peranan | **Diuji** pelantikan, revokasi, sekatan diri, MFA dan skop terpilih | Least privilege JTIK, review delegasi, operasi berbilang daerah |
| 28. Audit trail | **Separa** rekod dan bukti transaksi, redaksi, snapshot serta rollback terpilih | Audit atomik A/B, integriti sejarah, penyimpanan tahan ubah, retensi dan eksport bebas |

## Daftar risiko dan pemilik

| ID | Prioriti / status | Alasan, tindakan dan prasyarat |
|---|---|---|
| A / F-01 | **P0 terbuka** | Gerbang bait versi/hash/saiz dan skop metadata lulus pada #73. #74 lulus regresi bait di Oracle Free. Kesetaraan skop metadata terkini, proksi, ClamAV terurus dan 19.30 SE2 masih perlu bukti. Baki A1–A4, A-N01–05 dan A-P01 pada SHA sama. Team 1/Team 2/JTIK |
| B / F-02 | **P0 terbuka** | Calon #73 mengikat keputusan dan jemputan pada versi bukti. #74 lulus verifikasi versi makmal. Adapter Oracle belum mengikat jemputan kepada bukti ketika dikeluarkan. Keputusan perlu ikatan wakil+versi, semak semula revokasi, transaksi dengan audit dan negatif B1–B4, B-N01–05/B-P01. Team 1/Team 2/Jabatan Bangunan |
| P1-01 | **P1 terbuka**, semakan sumber | Had tulis sejarah pada laluan HTTP Completion perlu dikuatkuasakan sebelum commit. Kedua-dua adapter terkini berkongsi risiko kes panjang gagal dibaca. Selaraskan had dan pelan pemulihan. Team 1/Team 2. [Perbandingan](ORACLE-API-PARITY.md#semakan-transaksi-migrasi-dan-pemulihan) |
| P1-02 | **P1 terbuka** | Tujuh operasi Completion kini tersedia pada Oracle Free. Peraturan rasmi, MBSPPay, tandatangan, kuasa BKT/JK dan 19.30 SE2 masih gerbang pelepasan. JTIK/Kewangan/Jabatan Bangunan |
| P1-03 | **P1 terbuka** | Restore DB logik dengan cap jari lulus. Pemulihan kunci, fail, konfigurasi, lejar, pelantikan dan RPO/RTO merentas sistem belum dibuktikan. JTIK/DBA/Unit Rekod |
| P2-01 | **P2 terbuka** | Rate limit diuji dalam proses setempat. Perilaku merentas replika, pemetaan IP, tempoh penahanan login dan privasi log production perlu ujian sasaran. JTIK |
| P2-02 | **P2 terbuka** | Lokasi, aliran ketidakaktifan 60 hari, data legacy, surat sebenar dan pengurusan paparan SLA masih memerlukan pengguna dan keputusan pemilik. Jabatan Bangunan/JTIK |
| P2-03 | **P2 terbuka** | Axe mengesan kontras dan ketidakpadanan nama boleh akses pada paparan sampel. Pengesahan manual dan prestasi beban sasaran masih diperlukan. Team 1/JTIK |
| P3-01 | **P3 terbuka** | Kewujudan endpoint dan liputan assertion perlu dilabel secara konsisten dalam inventori. Semak drift dokumentasi OpenAPI bersama perubahan kontrak pada SHA calon. Team 1/Team 2 |

## Semakan kawalan keselamatan

| Kawalan | Bukti dan sempadan |
|---|---|
| Authentication, MFA, sesi, brute force | Argon2id, pengesahan e-mel, kuki HttpOnly/Strict/Secure pada HTTPS demo, sesi bertempoh dan token CSRF berskop. Larian API menguji MFA, role, CSRF, rate dan kala revokasi. Tingkah laku produksi berbilang replika belum disahkan |
| RBAC, daerah, IDOR, individu/syarikat/wakil | Ujian PG/Oracle terpilih menguji role, hak draf, wakil aktif, sama syarikat dan sekatan silang daerah. Undang kuasa, bukti semantic pemilikan dan cache dokumen legacy kekal A/B |
| CSRF, XSS, SQL injection | Origin dan token disemak untuk mutasi sesi. React dan CSP diperiksa secara statik, termasuk penolakan skrip inline di Nginx lab. SQL PG menggunakan tagged parameter pada laluan disemak. Oracle menggunakan bind parameter dan identifier schema/jadual terkawal. Tiada pengesahan menyeluruh XSS atau SQLi semua input pada hos sasaran |
| Dokumen, stor, malware | Ujian worker/lease, scanner TCP fixture dan kuarantin setempat diperiksa secara bebas. Dalam baseline, surat kuasa legacy berada di luar worker. Calon PostgreSQL menahannya dalam status LEGACY. Gerbang A/B keseluruhan masih terbuka |
| Penyulitan, secrets dan log | AES-GCM untuk bahan sensitif tertentu, hash sesi, redaksi request fields dan konfigurasi kunci luar Git diperiksa. KMS, rotation, observability produksi dan pemulihan kunci bersama rekod belum disahkan |
| Pengasingan latihan dan konfigurasi API | Gerbang DB loopback, profil hosts, konfigurasi sistem, penolakan Oracle provider biasa dan Nginx HTTPS disemak. Perimeter sasaran, egress, pengasingan storage/service dan kawalan polisi production menunggu JTIK |
| Concurrency, duplicate submission, payment replay | Lock/version untuk draf, serahan, bil dan pelantikan. Ujian idempotensi, rollback dan callback mock lulus dalam skop terpilih. P1-01 dan replay/settlement rasmi masih terbuka |
| Audit dan pentadbir | Aksi sendiri dan ACL diperiksa. Audit berurutan/rollback Oracle makmal, auth denies dan log sensitif diuji terpilih. Audit B atomik, penyimpanan append-only yang berkuasa dan pengesahan grant produksi masih terbuka |

## Gerbang pelepasan

| Sasaran | Checklist dan kuasa |
|---|---|
| **Complete Release** | Belum lulus. A/B disahkan secara bebas pada SHA yang sama di kedua-dua enjin. Semua K01–K11, tadbir BKT/JK/Kewangan, API Completion, SOP dokumen dan pemulihan bersama mempunyai bukti. JTIK, Kewangan, Jabatan Bangunan dan Unit Rekod meluluskan bahagian masing-masing |
| **Personal Demo pengguna** | Ditangguhkan. Rekod kelulusan pemilik, skop sintetik, bukti A/B jika aliran surat kuasa termasuk, akses peranan dan daerah, daftar kit privat, UX/A11y, prosedur reset dan penutupan sesi perlu disemak. Sebarang hos atau akses pengguna memerlukan kelulusan |
| **Go Live** | Belum lulus. Pengguna melaksanakan UAT, kecacatan diperbaiki, 19.30 SE2/MBSPPay/tandatangan/e-mel/stor disahkan pada sasaran yang diluluskan, bukti rollback/DR dan pemantauan tersedia, dan pemilik serta pihak berkuasa meluluskan secara rasmi |

Audit semula pada #73 `0fe8c7a` dan #74 `3d1477c` merekod keputusan bagi 12 kriteria. Kedua-dua gerbang kekal terbuka sehingga kontrak jemputan terkini dibuktikan pada calon gabungan dan persekitaran operasi yang diluluskan. [Semakan setiap kriteria calon](AUDIT-CALON-P0.md). [Kriteria A/B](PENERIMAAN-SURAT-KUASA.md) · [Checklist lengkap](PELAN-UJIAN.md#checklist-individu-sebelum-go-live)

## Status penemuan baseline F-03–F-13

| Penemuan asal | Status audit susulan |
|---|---|
| F-03 | Baseline kekal terbuka. Calon PostgreSQL mendahulukan autorisasi pada kedua-dua laluan bait. Skop metadata lulus pada #73. Padanan metadata pada kontrak gabungan Oracle masih terbuka |
| F-04 | Terbuka. Had/kuota stor sebenar dan prestasi muat naik belum dibuktikan |
| F-05 | Separa. Ujian lock/rollback dan revokasi terpilih pada kedua-dua enjin lulus. Bukti transaksi audit atomik bagi surat kuasa dan pengurusan pengunduran masih terbuka |
| F-06 | Terbuka. Redaksi setempat lulus. Vault, rotation, grant dan log sasaran belum disahkan |
| F-07 | Separa. Aliran lengkap latihan kini tersedia pada PostgreSQL/Oracle Free. Gerbang operasi rasmi dan P1-01 masih terbuka |
| F-08 | Terbuka. Bil dan tandatangan latihan sahaja. Kewangan/JTIK perlu bukti penyedia |
| F-09 | Separa. Restore DB logik dan migrasi 002 dibuktikan. DR sistem lengkap masih terbuka |
| F-10 | Terbuka. Skop fixture dan kuasa bersyarat diuji. GIS, delegasi, dasar akaun dan keputusan pemilik belum disahkan |
| F-11 | Separa. HTTPS dan semakan UX automatik berjalan. P2-03 mencatat dapatan yang masih terbuka. Hos JTIK dan aksesibiliti manual belum disahkan |
| F-12 | Separa. Kesetaraan kontrak Completion kini diuji pada Oracle Free. Pengesahan 19.30 SE2 dan kapasiti sasaran masih terbuka |
| F-13 | Terbuka. Inventori 83 operasi dibangunkan untuk audit. Drift antara dokumen rasmi, OpenAPI tersimpan dan runtime perlu pengesahan automatik |

[Daftar asal dan kebergantungan D1–D6](PENEMUAN.md) · [Bukti audit susulan](BUKTI-SUSULAN.md)

## Checklist keputusan

**Complete Release**

- [ ] Team 1 dan Team 2 menutup A/B dengan ujian yang sama dalam calon gabungan PostgreSQL/Oracle. P1-01 ditangani dan regressi sempadan direkod.
- [ ] Jabatan Bangunan mengesahkan aturan K01–K11, kuasa BKT/JK, surat, susulan SKB/Tangguh dan penerimaan semua peranan.
- [ ] Kewangan meluluskan kadar, dua peringkat pembayaran, rekonsiliasi, refund/dispute dan bukti sandbox.
- [ ] JTIK melengkapkan Oracle 19.30 SE2, least privilege, storan/AV, SMTP, keselamatan hos, SLO dan pemulihan DB bersama fail, konfigurasi dan kunci.

**Personal Demo pengguna**

- [ ] Pemilik mengesahkan tamat penangguhan dan skop demo. Tiada dokumen sebenar.
- [ ] SHA demo dipin. Pengasingan peranan/daerah, kerja bengkel sintetik, aksesibiliti dan reset kit disahkan.
- [ ] JTIK meluluskan hos dan akses secara berasingan. Ujian buka hingga tutup dijalankan oleh individu dan kit ditamatkan selepas sesi.

**Go Live**

- [ ] UAT, keselamatan, pemulihan dan rollback sasaran dibuktikan pada calon keluaran.
- [ ] Rekod insiden, penyelenggaraan, pemantauan dan pemilik eskalasi tersedia.
- [ ] Pemilik sistem dan pihak berkuasa berkaitan mengeluarkan keputusan bertulis.
