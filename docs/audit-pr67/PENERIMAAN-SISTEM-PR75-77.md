# Penerimaan bebas STAYLink MBSP · PR #75–#77

**26 November 2026 (MYT). Complete Release dan Go Live kekal NO-GO. Personal Demo kekal ditangguhkan.** Audit ini meliputi calon pembangunan sintetik, kemungkinan regresi, dan gerbang operasi K01–K11 dan Issue #68.

| Calon | SHA tepat | Skop |
|---|---|---|
| [#75](https://github.com/BangunanDotCom/sipintar-mbsp/pull/75) | `78710c16340fa9c3280745b3c2ab2025041b288c` | Berdasarkan #73. AI Pre-Check, draf, KP, surat PDF v1 dan ringkasan |
| [#76](https://github.com/BangunanDotCom/sipintar-mbsp/pull/76) | `945645449aa15ed2b95e9dd53325c7884ba5eddd` | Berdasarkan #75. Analitik, arkib, outbox draf dan surat PDF v2 |
| [#77](https://github.com/BangunanDotCom/sipintar-mbsp/pull/77) | `20cf889af36250f9a88e90ee0cfd2b9f6e740ef2` | Berdasarkan #76. Calon gabungan PostgreSQL yang disemak. BKT, SLA, lejar, rekod dan pelantikan |
| [#74](https://github.com/BangunanDotCom/sipintar-mbsp/pull/74) | `5f7303a4976f930e6cbde5578fd594699d875bc0` | Calon Oracle Free/PG P0 terdahulu pada laluan berasingan |
| [#73](https://github.com/BangunanDotCom/sipintar-mbsp/pull/73) | `0fe8c7a3984e9472dd38ad2bc686a87f37952a9d` | Asas kawalan PostgreSQL yang diwarisi oleh #75–#77 |

**PASS** merujuk kepada asersi yang diperhatikan pada SHA yang dinyatakan. **FAIL** merujuk kepada ketidakpadanan kod, kontrak atau ujian yang dinyatakan. **SEPARA** merujuk kepada pelaksanaan tersedia yang memerlukan ujian tambahan. **BLOCKED** menunjukkan kebergantungan yang belum dipenuhi. Simulasi yang lulus di makmal masih memerlukan penerimaan operasi. [Matriks terdahulu](AUDIT-KUMULATIF.md) · [Spesifikasi K01–K11](https://github.com/BangunanDotCom/sipintar-mbsp/blob/06b02f9/docs/PHASE1-MBSP-SPECIFICATION.md) · [Issue #68](https://github.com/BangunanDotCom/sipintar-mbsp/issues/68)

## K01–K11

| ID | Keputusan makmal tumpukan #77 dan bukti | Baki penerimaan |
|---|---|---|
| K01 · Satu lokasi, unit/aras, asas fi | **PASS terpilih.** Satu lokasi, unit fizikal unik merentas aras dan kiraan integer sen. Bayaran dan lejar kekal latihan | Kewangan menentukan kadar peringkat 1/2, pengecualian dan caj bagi keputusan bercampur. Jabatan Bangunan sahkan definisi premis |
| K02 · Identiti unit/aras dan pautan stabil | **PASS terpilih.** UUID, pemetaan silang tingkat, validasi draf dan snapshot kekal dalam suite; keputusan mengikut pasangan | Padanan GIS/sempadan, unit gabung/tanpa label, data lama dan pembetulan rasmi. Uji ID stabil semasa import dan pemulihan |
| K03 · Akaun, pemohon, syarikat dan wakil | **PASS terpilih.** Pendaftaran, pengasingan syarikat, MFA pegawai dan ikatan versi diuji dalam profil bersesuaian. **BLOCKED P0 B** untuk penerimaan gabungan | Luput peranan pemberi sebelum komit Oracle, jemputan warisan dan kesetaraan calon bersama. Lihat P0 |
| K04 · Bukti dan polisi dokumen | **SEPARA.** Kaedah berversi menyokong bukti latihan dan aturan bersyarat CCC/CFO/OC yang tersedia dalam fixture. Lampiran kes rasmi belum diterima | Jabatan Bangunan menetapkan pencetus dan alternatif lokasi, tingkat, hak guna, foto, kebakaran serta bukti susulan. JTIK sahkan stor dan proses imbas rasmi |
| K05 · Akuan versi dan snapshot | **PASS terpilih · simulasi.** Akuan serta cap jari polisi berversi diuji dalam serahan latihan, termasuk pelaku dan kapasiti | Teks akuan, kuasa, masa kuat kuasa, bukti undang-undang dan peraturan akuan semula disahkan pemilik |
| K06 · Draf, serahan, pembetulan, 60 hari | **PASS terpilih.** #75 menunjukkan status tidak aktif tanpa mutasi. #76/#77 menambah pemantauan PPSK, peringatan berversi dan sambung draf. Serahan dan konflik versi di skop sintetik | Dasar 60 hari dan tindakan rasmi belum diputuskan. Uji kehilangan kuasa ketika kerja outbox, skop pembetulan dan notifikasi yang tidak pasti. Oracle tertunggak |
| K07 · Akses/storan dokumen, imbas, integriti dan DR | **PASS terpilih di #74.** Dua laluan PDF, integriti, revokasi, pengasingan dan audit. **BLOCKED P0 A** bagi operasi dan calon gabungan | ClamAV terurus, grant PostgreSQL, konfigurasi TLS/cache/log, stor, pemulihan bersama DB/fail/kunci dan polisi legacy |
| K08 · AI penasihat, PIC, daftar PPSK | **PASS terpilih · simulasi.** #75 menambah keputusan pre-check dan sebab berversi, fallback manual dan jejak semakan; daftar masih memerlukan pegawai | Jabatan Bangunan/JTIK sahkan tujuan, data minimum, respons penyedia, kegagalan/fallback di UI, kuasa PPSK dan siri rujukan |
| K09 · Bayaran dan rekonsiliasi | **PASS terpilih · simulasi.** #77 menambah lejar append-only dua peringkat, rekod unik, replay dan rollback pada PostgreSQL | Legacy tiada backfill, refund/dispute/pelarasan belum siap; CSV belum lengkap untuk padanan invois. Kewangan/JTIK sahkan sandbox, settlement dan pemisahan tugas |
| K10 · Peranan, daerah, MFA dan kebebasan keputusan | **PASS terpilih.** Pelantikan/revokasi, penamatan sesi sasaran, larangan pelantikan sendiri, skop daerah dan MFA melalui suite. **SEPARA** bagi kebenaran transaksi pelaku serta dasar pemangkuan | Audit pelaku perlu revalidasi masa guna pada perubahan pelantikan. Pemilik meluluskan BKT/JK/Unit Rekod, tugasan dan kuasa berbilang daerah |
| K11 · Pekerja dan majikan pilihan | **PASS terpilih.** Aliran latihan boleh berjalan tanpa pengenalan majikan dan tanpa PII pekerja wajib. **SEPARA** pada model keluaran | Jabatan Bangunan/JTK/Unit Rekod sahkan kapasiti yang dibenarkan, pilihan medan majikan, tujuan, retensi, dan frasa surat |

## Issue #68 dan semua perubahan fungsi

| Fungsi | Status antara calon | Bukti penerimaan makmal dan baki |
|---|---|---|
| AI Pre-Check dan tindakan PIC | #75, diwarisi #76–#77 | **PASS terpilih** untuk simpan keputusan, sebab, versi dan audit latihan. Pembekal AI dan pengendalian PII rasmi **BLOCKED**. Fallback manual mesti kekal tersedia |
| 60 hari, sambung draf, PPSK dan notifikasi draf | #75 indikator, #76 pemantauan/outbox, #77 migrasi dedupe | **PASS terpilih** untuk pemilikan, penapis daerah dan peringatan berversi. **SEPARA** untuk operasi berjadual, dashboard rekonsiliasi SMTP `UNCERTAIN`, failover dan tindakan pemilik selepas 60 hari |
| Bayaran pertama dan BKT | #77 terima BKT sebelum rujukan, queue Urus Setia | **PASS terpilih · latihan**. Uji kewajipan BKT silang peranan, semakan pembayaran, penugasan semula dan pemulihan keadaan. Tiada aturan penerimaan BKT/MBSPPay rasmi yang disahkan |
| Rujukan Perancang/Kejuruteraan | #77 ACK, pulang dan hantar semula ulasan berversi | **PASS terpilih** untuk dua peranan, ACK, pemulangan, resubmission dan sejarah. **FAIL semakan kontrak** untuk kiraan SLA dashboard selepas ulasan dipulangkan. Uji penggantian penyandang, re-queue dan notifikasi lama |
| SLA 7 hari, notis dan eskalasi | #76 analitik, #77 peringatan teknikal berasaskan epoch | **PASS terpilih** untuk tarikh, scope/epoch dan pekerja bersaing dalam suite. **SEPARA** bagi peringatan semula selepas status ulasan berubah, penutupan setelah worker menuntut kerja dan polisi SMTP |
| Kertas Pertimbangan | #75 pulang sebab/pinda versi, #77 BKT dan ulasan teknikal | **PASS terpilih** untuk snapshot terdahulu, sebab pemulangan dan cap 499/500/501. Baki pemilikan KP/BKT rasmi, lampiran susulan serta uji kes lama selepas upgrade |
| SK/SKB/Tangguh/Tolak | #69 kontrak asas, diwarisi #75–#77 | **PASS terpilih · simulasi** untuk keputusan bercampur, pengiraan had enam bulan, susulan dan penutupan. Rayuan, ulang kaji keputusan rasmi, semakan kapasiti dan aturan JK belum diterima |
| Surat induk/susulan, Template Manager | #75 PDF Latin v1. #76/#77 Unicode v2, digest, fallback SIGN v1 | **PASS terpilih · simulasi** untuk artifak yang lulus ujian, versi templat dan digest. Han/Jawi PDF **BLOCKED** walaupun ada alternatif UTF-8. Perlu penerimaan cetakan, bidi, pembaca PDF dan integrasi tandatangan |
| Bayaran kedua dan lejar | #77 invoice/receipt untuk dua peringkat, skop PPSK, CSV | **PASS terpilih · simulasi** bagi replay, transaksi, padanan amaun dan sejarah. **SEPARA** bagi eksport hasil padanan, backfill, refund/dispute dan settlement rasmi |
| Dashboard, laporan dan arkib | #75 ringkasan 50, #76 SQL keseluruhan skop, penapis MYT/CSV, arkib paginated, #77 hubungan rekod | **PASS terpilih** untuk penapisan dan peranan yang diuji. **SEPARA** bagi SLA selepas pulang ulasan, prestasi beban, polisi akses rekod selepas revokasi, aksesibiliti manual dan laporan rasmi |
| Tutup dan rekod | #77 hold/lepas hold dan permohonan buka semula | **PASS terpilih · simulasi** untuk keadaan tertutup/versi dan audit perubahan. **Belum siap** kelulusan bebas, tindakan buka semula sebenar dan pelupusan rasmi |
| Pentadbiran dan audit trail | #77 kesan pelantikan/revokasi, guard konflik latihan | **PASS terpilih** untuk asersi pelantikan, revokasi, sesi sasaran dan transaksi dengan audit. **SEPARA** untuk revalidasi pelaku, audit tahan ubah, eksport dan pengasingan servis |
| Integrasi dan rollback | #75–#77 PostgreSQL, #74 Oracle P0 berasingan | **BLOCKED** satu SHA kedua-dua provider. JTIK perlu pengesahan versi/enjin, grant, migrasi/restore, prestasi, integrasi serta UAT rasmi |

## Daftar penemuan dan tindakan

| ID | Prioriti dan bukti | Tindakan dan syarat tutup |
|---|---|---|
| A | **P0 terbuka.** Calon #74 telah menunjukkan dua laluan PDF, integriti, revokasi, fail-closed dan cache fixture. #77 mewarisi #73 PostgreSQL. Tiada satu SHA yang menggabungkan fungsi #77 pada kedua-dua enjin | Team 1/2 pin SHA bersama. Team 3 ulang A-N01–05/A-P01. JTIK buktikan ClamAV terurus, proksi/log dan pengasingan privilege PostgreSQL |
| B | **P0 terbuka.** Ikatan jemputan versi lulus pada #74, termasuk luput/rescan/replacement. Semakan akhir Oracle masih tidak mengesahkan tempoh peranan pemberi seperti PostgreSQL. Jurang dikenal pasti melalui semakan kod | Team 2 selaraskan revalidasi peranan pada transaksi, kemudian Team 3 ulang keseluruhan B-N01–05/B-P01 pada SHA gabungan |
| SA-01 | **P1 BLOCKED.** Oracle #74 tiada perubahan kontrak #75–#77. PostgreSQL menggunakan API khusus dan migrasi 202611260001/002; ujian PostgreSQL tidak menyediakan bukti parity | Team 2 implementasi/verify pre-check, BKT, `RETURN_PAPER`, event cap, analytics, outbox, digest, ledger/rekod/pelantikan. Uji migrasi, grant, restore serta parity di Oracle 19.30 SE2 |
| SA-02 | **P1 SEPARA · semakan kod.** #77 menulis tugasan dan audit dalam transaksi, tetapi pelaku `roles.manage` disahkan sebelum transaksi. Kunci dalam transaksi tertumpu pada pengguna sasaran. Penerimaan tiada bukti revalidasi pelaku selepas perubahan sesi/peranan | Team 1/JTIK semak kuasa pelaku di dalam transaksi dan buktikan operasi ditolak tanpa perubahan data atau audit kejayaan apabila kuasa tidak lagi sah |
| SA-03 | **P1 BLOCKED.** Lejar, rekod, pembayaran, tandatangan, AI/SMTP, dokumen dan data pilihan masih tertakluk kepada dasar rasmi. Tiada latihan restore fizikal Oracle, stor, kunci dan failover rasmi | Kewangan, JTIK, Jabatan Bangunan dan Unit Rekod lulus SOP/akaun, bukti sandbox, UAT, pemulihan, undur dan pengasingan tugas |
| SA-04 | **P2 FAIL · kontrak kod.** Dashboard SLA #77 menganggap satu acara `COMMENT` selepas rujukan masih memadai selepas `RETURN_COMMENT`. Model Completion menggugurkan ulasan semasa apabila dipulangkan. Angka lewat boleh terkurang sehingga jabatan menghantar ulasan semula | Team 1 guna keadaan ulasan terkini per epoch/department. Asersi angka berubah antara ulasan dipulang dan dihantar semula, termasuk dua jabatan dan MYT |
| SA-05 | **P2 SEPARA · penyelarasan lejar.** JSON memuatkan `invoiceId`, CSV menghantar peringkat/acara/amaun/waktu sahaja. Upgrade hanya menambah jadual, jadi rekod sebelum migrasi boleh tiada dalam lejar permohonan | Team 1/Kewangan tentukan ID eksport, tampilkan status liputan sejarah dan buktikan migrasi data lama dengan padanan invois/resit dan catatan pelarasan |
| SA-06 | **P2 SEPARA.** Penghantaran SMTP berlaku selepas transaksi tuntutan. `UNCERTAIN` dikuarantin, dan notis yang sudah dituntut mungkin bertindih dengan perubahan kuasa/penutupan. Skop dan kaedah operasi perlu diputuskan | Team 1/JTIK putuskan semantik in-flight, status pemulihan dan proses pemeriksaan penghantaran tanpa replay automatik. Uji expiry, perubahan skop dan restart worker |
| SA-07 | **P2 SEPARA · UX.** Han/Jawi PDF belum diterima. Alternatif UTF-8 tersedia. Laporan arkib mengecualikan kes syarikat yang kuasanya tidak lagi aktif. SOP perlu membezakan semakan pemohon semasa daripada akses pegawai/Unit Rekod kepada sejarah | Jabatan Bangunan/Unit Rekod putuskan akses sejarah. Uji paparan/copy cetak PDF, papan kekunci, pembaca skrin dan arkib selepas kuasa luput dalam UAT |
| SA-08 | **P3 SEPARA.** Status latihan, kesan sebenar hold dan ketiadaan padanan sejarah diperlukan dalam teks bantuan apabila fungsi dipratonton kepada pemilik | Team 1/Jabatan Bangunan sahkan kandungan BM dan matriks bantuan. Guideline hanya untuk latihan |

Rujukan penemuan. [SLA SQL](https://github.com/BangunanDotCom/sipintar-mbsp/blob/20cf889af36250f9a88e90ee0cfd2b9f6e740ef2/apps/api/src/synthetic-analytics.ts#L96-L112) · [Pemulangan ulasan](https://github.com/BangunanDotCom/sipintar-mbsp/blob/20cf889af36250f9a88e90ee0cfd2b9f6e740ef2/packages/shared/src/synthetic-completion.ts#L145-L151) · [Pelantikan](https://github.com/BangunanDotCom/sipintar-mbsp/blob/20cf889af36250f9a88e90ee0cfd2b9f6e740ef2/apps/api/src/routes.ts#L285-L367) · [Lejar](https://github.com/BangunanDotCom/sipintar-mbsp/blob/20cf889af36250f9a88e90ee0cfd2b9f6e740ef2/apps/api/src/synthetic-portal-completion.ts#L413-L431) · [Semakan akhir Oracle](https://github.com/BangunanDotCom/sipintar-mbsp/blob/5f7303a4976f930e6cbde5578fd594699d875bc0/apps/api/src/oracle/company-invitations.ts#L313-L321)

## Semakan semula P0 pada #74

Ujian lagi pada `5f7303a4976f930e6cbde5578fd594699d875bc0` menggunakan PostgreSQL dan Oracle Free 23.26.4 dengan data sintetik, scanner fixture, akaun Oracle runtime dan scanner berasingan. **31 lulus**, termasuk **18 kes integrasi**. Ujian bersama ini berada pada #74; kotak penerimaan #77 pada Oracle masih terbuka.

| ID | Keputusan dan had pada #74 |
|---|---|
| A-N01 | **PASS makmal.** Kedua-dua laluan fail-closed bagi kuarantin, status warisan dan verdict tanpa bukti sah |
| A-N02 | **PASS makmal.** Hash/saiz salah dan ralat baca terasing selepas gerbang tidak mendedahkan PDF. Bukti stor rasmi **BLOCKED** |
| A-N03 | **PASS makmal** bagi skop metadata/akses yang dinyatakan oleh suite. Larian pelayar Oracle terdahulu pada SHA sama menerima satu HTTP 500 semasa syarikat kedua dibuat, kemudian lulus. Punca dan kesetaraan calon gabungan masih **BLOCKED** |
| A-N04 | **PASS makmal** bagi lease bersaing, hasil lapuk dan revokasi semasa imbas. Grant PostgreSQL sasaran dan ClamAV JTIK **BLOCKED** |
| A-N05 | **PASS makmal** bagi header dan pengasingan akses. Nginx cache setempat serta redaksi diuji dalam larian bebas terdahulu pada SHA sama. Proksi/log rasmi **BLOCKED** |
| A-P01 | **PASS makmal.** Bait dan metadata PDF sepadan selepas CLEAN, dengan audit kejayaan bagi kedua-dua laluan |
| B-N01 | **PASS makmal.** Versi/rekod yang tiada, syarikat atau wakil lain, penerima yang salah ditolak |
| B-N02 | **PASS makmal** bagi luput, rescan, ganti dan batal bukti jemputan. Tempoh peranan pemberi pada semakan terakhir Oracle kekal jurang penerimaan |
| B-N03 | **PASS makmal** bagi peranan, daerah, MFA, Origin, CSRF dan larangan pengesahan sendiri dalam suite |
| B-N04 | **PASS makmal** bagi revokasi yang dikomit dahulu dan tindakan versi lapuk. Kes tempoh peranan pemberi tepat sebelum komit belum disahkan |
| B-N05 | **PASS makmal.** Rollback tidak meninggalkan keahlian, audit kejayaan atau notifikasi; replay ditolak. DR dan penyampaian rasmi **BLOCKED** |
| B-P01 | **PASS makmal.** Bukti tepat dan mandat langsung yang sah masing-masing diterima sekali |

[Ujian gabungan #74](https://github.com/BangunanDotCom/sipintar-mbsp/blob/5f7303a4976f930e6cbde5578fd594699d875bc0/tests/delegation-provider-parity.test.ts) · [Kriteria A/B](PENERIMAAN-SURAT-KUASA.md) · [Bukti bebas calon terdahulu](AUDIT-CALON-P0.md)

## Bukti larian bebas

Node 24.22.3, `npm ci` daripada lockfile setiap SHA, Prisma generate, PostgreSQL 16 dan Mailpit setempat. Data, kata laluan, PDF dan pengguna latihan dijana dalam fixture. Tiada panggilan penyedia rasmi. SHA penuh setiap PR disenaraikan pada awal laporan.

| SHA | Unit dan komponen | API PostgreSQL | Profil Completion |
|---|---|---|---|
| #75 `78710c1` | **357 lulus, 1 skip bersyarat** | **95 lulus, 1 skip bersyarat** | **1 lulus** menggunakan kit 11 akaun |
| #76 `9456454` | **358 lulus, 1 skip bersyarat** | **98 lulus, 1 skip bersyarat** | **1 lulus** menggunakan kit 11 akaun |
| #77 `20cf889` | **358 lulus, 1 skip bersyarat** | **99 lulus, 1 skip bersyarat** | **1 API dan 2 pelayar HTTPS lulus** melalui Nginx loopback. Pemohon membuka kes tertutup dan dua surat, PPSK menyaring laporan/rekod dan mengeksport CSV |

Suite unit mengecualikan `tests/api.test.ts`. Ujian Completion yang skip kerana tiada kit dijalankan semula berasingan pada setiap SHA. Ujian API skip ialah kes Issue #24 yang memerlukan DB khusus. Ujian itu **lulus** pada #77 dalam larian fokus yang berasingan. Penyediaan awal kit berhenti pada semakan binaan React. Selepas binaan dibuat, ketiga-tiga larian Completion lulus. #77 turut lulus lint, typecheck dan binaan. Binaan melaporkan amaran saiz chunk. Ujian HTTPS memeriksa dua perjalanan pelayar desktop. Tiga lagi ujian Chromium melalui Vite loopback #77 **lulus** bagi navigasi responsif, PDF syarikat dan wakil jemputan, serta perjalanan pemohon–PIC–PPSK termasuk peringatan dan invois latihan. Ujian WCAG manual, pelayar tambahan dan beban sasaran masih **BLOCKED**.

**Migrasi dan pemulihan #77.** Naik taraf daripada snapshot pangkalan data sintetik #76 mengekalkan kedua-dua rekod outbox dengan kunci dedupe baharu. Kedua-dua trigger lejar diaktifkan. Pulih pangkalan data Completion #77 ke DB kosong yang berasingan. Fingerprint sumber dan pulih sepadan bagi rekod serahan, bukti, audit dan notifikasi yang dipilih, lapan rekod outbox, empat entri lejar dan acara kawalan rekod. RPO/RTO rasmi dan pemulihan stor serta kunci memerlukan ujian JTIK.

Sumber untuk larian bebas. [API #75](https://github.com/BangunanDotCom/sipintar-mbsp/blob/78710c16340fa9c3280745b3c2ab2025041b288c/tests/api.test.ts) · [API #76](https://github.com/BangunanDotCom/sipintar-mbsp/blob/945645449aa15ed2b95e9dd53325c7884ba5eddd/tests/api.test.ts) · [API Completion #77](https://github.com/BangunanDotCom/sipintar-mbsp/blob/20cf889af36250f9a88e90ee0cfd2b9f6e740ef2/tests/synthetic-completion-api.test.ts) · [HTTPS #77](https://github.com/BangunanDotCom/sipintar-mbsp/blob/20cf889af36250f9a88e90ee0cfd2b9f6e740ef2/tests/e2e/synthetic-completion.spec.ts)

## Gerbang penerimaan

- [ ] **P0 A/B.** Semua A-N01–05/A-P01 dan B-N01–05/B-P01 pada calon yang sama. Log peranan, jurang masa transaksi, pertukaran versi, rollback dan audit dibuktikan tanpa data sebenar.
- [ ] **Complete Release.** K01–K11 dan semua perjalanan Issue #68 diliputi, parity dua provider, semua P0/P1 yang menghalang ditutup dengan bukti, kuasa dan polisi rasmi diluluskan, regresi negatif serta aksesibiliti/kapasiti diuji pada sasaran.
- [ ] **Personal Demo.** Penangguhan ditarik balik oleh pemilik dan persekitaran/hos diluluskan untuk fixture sintetik. Kit sementara, reset, sesi, skop peranan/daerah serta batas latihan diuji dan direkod.
- [ ] **Go Live.** JTIK sahkan TLS/cache/log, pengimbas/stor, vault, Oracle SE2, beban dan restore/DR/undur. Kewangan sahkan kadar, sandbox, lejar, refund/dispute dan settlement. Jabatan Bangunan/Unit Rekod meluluskan kuasa, AI manusia, BKT/JK, tandatangan, retensi, hold dan buka semula. Pemilik merekod keputusan UAT rasmi.

[Keputusan pemilik yang belum selesai](https://github.com/BangunanDotCom/sipintar-mbsp/blob/20cf889af36250f9a88e90ee0cfd2b9f6e740ef2/docs/ict-handover/STAYLINK-OWNER-DECISIONS-CORE.md) · [Penerimaan A/B](PENERIMAAN-SURAT-KUASA.md) · [Prosedur JTIK](PENERIMAAN-OPERASI-P0.md)
