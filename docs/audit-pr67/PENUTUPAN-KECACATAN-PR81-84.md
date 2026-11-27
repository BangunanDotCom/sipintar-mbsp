# Penerimaan bebas dan daftar penutupan kecacatan · #81–#84

**27 November 2026 (MYT). Syor audit: tangguhkan Personal Demo pengguna. Complete Release dan Go Live kekal NO-GO.** Calon #84 sesuai untuk latihan dalaman terkawal menggunakan fixture. Gerbang operasi P0, sasaran prestasi, dan penerimaan calon serta skop hos oleh JTIK dan pemilik masih terbuka.

| PR | SHA dipin | Kegunaan dalam audit |
|---|---|---|
| [#81](https://github.com/BangunanDotCom/sipintar-mbsp/pull/81) | `765b374545dbed54f3d33ca5ae44db4ca52cbdab` | Calon penyatuan fungsi #79 dan pengasingan peranan Oracle/PG |
| [#82](https://github.com/BangunanDotCom/sipintar-mbsp/pull/82) | `a4916a5adc0c2ff620f7bd40875372fafef35976` | Baseline PostgreSQL untuk regresi retensi |
| [#83](https://github.com/BangunanDotCom/sipintar-mbsp/pull/83) | `2d4c43663e64a227ccaa05abb3db7d57e52e4542` | Pembetulan Team 1 untuk SLA, retensi, P0 dan adapter fixture |
| [#84](https://github.com/BangunanDotCom/sipintar-mbsp/pull/84) | `1d9ac409ad5526d62c5465d5795ce98d7a79955a` | Calon Team 2 untuk pariti kedua-dua enjin termasuk pembetulan SLA dan retensi |

Bukti terdahulu disimpan pada Draft PR #72 dan sejarah commit asal dipelihara. [P0 #80](PENERIMAAN-P0-PR80.md) · [Penerimaan #78/#79](PENERIMAAN-AKHIR-PR78-79.md) · [K01–K11 dan Issue #68](PENERIMAAN-SISTEM-PR75-77.md) · [Keputusan pemilik](https://github.com/BangunanDotCom/sipintar-mbsp/blob/1d9ac409ad5526d62c5465d5795ce98d7a79955a/docs/ict-handover/STAYLINK-OWNER-DECISIONS-CORE.md)

## Bukti bebas

- **#81 P0.** Larian bebas pada SHA ini mencatat 39 ujian lulus termasuk 26 integrasi dua enjin selepas fungsi #79 disepadukan. Satu ujian keistimewaan PostgreSQL lulus dengan login owner, API dan scanner berasingan. Laluan biasa melalui runtime terhad melepaskan PDF CLEAN kepada pengguna sah pada kedua-dua endpoint; sesi tidak layak menerima 404/403. Larian tambahan Oracle Free pada migrasi #81 menggunakan empat sesi DB owner, API, scanner dan worker yang sebenar. Inventori effective grants menunjukkan API tidak mendapat UPDATE verdict surat kuasa, scanner mendapat UPDATE verdict dalam skop bukti yang diuji, worker mendapat UPDATE status outbox tanpa UPDATE verdict, lejar atau status peranan. Ketiga-tiga runtime tiada `CREATE TABLE`. [Probe PostgreSQL #81](https://github.com/BangunanDotCom/sipintar-mbsp/blob/765b374545dbed54f3d33ca5ae44db4ca52cbdab/tests/delegation-postgres-privileges.test.ts) · [Grant Oracle #81](https://github.com/BangunanDotCom/sipintar-mbsp/blob/765b374545dbed54f3d33ca5ae44db4ca52cbdab/scripts/oracle/lab.ts)
- **#84 P0.** 39 lulus dalam dua fail termasuk 26 kes integrasi pada PostgreSQL 16 dan Oracle Free 23.26.4. P0 B mengesahkan luput selepas penulisan, kuasa yang sah, revokasi, versi, audit dan notifikasi serta sifar penulisan kejayaan apabila transaksi ditolak. Dua suite privilege PostgreSQL (delegasi dan outbox) lulus menggunakan empat login sebenar. Bukti ialah fixture di loopback. P0 A dan B **PASS makmal** dan **BLOCKED operasi** sehingga staging JTIK, ClamAV, TLS/cache/log, pemulihan, Oracle 19.30 SE2 dan semantik waktu kelayakan rasmi diterima. [Suite P0 #84](https://github.com/BangunanDotCom/sipintar-mbsp/blob/1d9ac409ad5526d62c5465d5795ce98d7a79955a/tests/delegation-provider-parity.test.ts) · [Worker outbox](https://github.com/BangunanDotCom/sipintar-mbsp/blob/1d9ac409ad5526d62c5465d5795ce98d7a79955a/tests/training-outbox-postgres-privileges.test.ts)
- **SLA sebelum dan selepas.** Pada #79 `4af4851`, selepas `RETURN_COMMENT`, butiran menunjukkan satu kes lewat tetapi laporan memberi sifar. #83 Completion API lulus pada PostgreSQL. #84 empat perjalanan API Completion (individu dan syarikat bagi setiap enjin) lulus. Asersi membandingkan butiran, barisan dashboard, JSON dan CSV ketika kedua-dua ulasan lengkap, kemudian sebelum, tepat dan selepas sempadan tujuh hari bagi ulasan dipulangkan. Rujukan semula menolak ulasan jabatan yang tidak lagi dirujuk dan penutupan dikira. Liputan silang semua kombinasi rujukan semula dan penutupan masih berasingan daripada penerimaan operasi. [Asersi sempadan dan kesetaraan #84](https://github.com/BangunanDotCom/sipintar-mbsp/blob/1d9ac409ad5526d62c5465d5795ce98d7a79955a/tests/completion-provider-parity.test.ts#L1299-L1364)
- **Retensi sebelum dan selepas.** Pada #82, uji 120 serahan sintetik dengan rekod muda, luar daerah, legal hold dan pending reopen. Lima halaman berisi **0, 5, 15, 20, 10** rekod; kesemua 50 ditemui apabila meneruskan walaupun halaman pertama kosong. Pada #83, suite bebas menggunakan bentuk data sama dan mengesahkan **20, 20, 10**, ID unik dan tiada lagi halaman. #84 Completion dua enjin meliputi tarikh kelayakan, skop PPSK, hold, pelepasan hold, pending reopen dan `disposalEnabled=false`. Dalam ulangan Oracle Free #84, fixture 120 juga memberi **20, 20, 10**, 50 ID unik dan tamat pada halaman ketiga. Semakan retensi hanya mengeluarkan calon, dan ujian mengesahkan pelupusan kekal dilumpuhkan. [Ujian volum #83](https://github.com/BangunanDotCom/sipintar-mbsp/blob/2d4c43663e64a227ccaa05abb3db7d57e52e4542/tests/synthetic-completion-api.test.ts#L835-L904) · [Ujian dua enjin #84](https://github.com/BangunanDotCom/sipintar-mbsp/blob/1d9ac409ad5526d62c5465d5795ce98d7a79955a/tests/completion-provider-parity.test.ts#L1820-L1877)

## Daftar kumulatif

ID terdahulu dikekalkan. FA-03 diklasifikasi P1 dalam susulan ini mengikut keutamaan pemilik. Penyeliaan retensi yang menghasilkan halaman kosong ialah isu berasingan RET-01. Status **lulus pembetulan makmal** masih terikat pada SHA, enjin dan asersi di atas.

| ID / risiko | SHA penemuan → SHA pembetulan | Cara semak dan hasil | Status / tanggungjawab |
|---|---|---|---|
| P0-A | `8ecd1e5`, `4af4851` → `765b374`, `1d9ac40` | Dua laluan PDF dan login terasing. Probe bersasar dan suite integrasi lulus. Verdict dan kuasa asing ditolak | **Lulus makmal, BLOCKED operasi** · Team 1/2, JTIK |
| P0-B | `e43fbe8`, `4af4851` → `4679fe9` → `765b374`, `1d9ac40` | Luput pada gerbang akhir, ikatan asal dan rollback empat penulisan. Ujian diulang selepas penyatuan | **Lulus makmal, BLOCKED operasi** · Team 1/2, JTIK, Jabatan Bangunan |
| FA-01 / P1 | `4af4851` → `765b374`, `1d9ac40` | Ulang dua enjin dengan dry-run, rollback, BKT, KP, notifikasi dan laporan. Empat perjalanan API lulus. Pariti semua fungsi luar matriks dan SE2 masih terbuka | **Lulus makmal dalam skop, BLOCKED operasi** · Team 2/JTIK |
| FA-02 / P1 | `20cf889` → `a4916a5`, `1d9ac40` | Pintu akhir untuk review/BKT/bayaran diuji; BKT ditolak apabila peranan luput. Asersi ini belum mengesahkan semua tindakan pentadbir terhadap revokasi pelaku | **Sebahagian disahkan, terbuka** · Team 1/2/JTIK |
| FA-03 / P1 | `4af4851` → `2d4c436`, `1d9ac40` | Pulangkan ulasan sebelum/tepat/selepas tujuh hari; banding butiran, dashboard, JSON dan CSV. Sebelum 1 vs 0. Calon baharu menyamakan kiraan dalam suite. Rujukan semula dan penutupan turut diuji | **Lulus pembetulan makmal** · Team 1/2; JB terima semantik operasi |
| RET-01 / P2 | `a4916a5` → `2d4c436`, `1d9ac40` | 120 rekod dengan hold, pending reopen, tarikh dan daerah. Sebelum halaman awal kosong. Selepas 20/20/10 di #83. #84 lulus kawalan dua enjin dan mengulang 20/20/10 pada Oracle Free | **Lulus pembetulan makmal kedua-dua enjin** · Team 1/2, Unit Rekod |
| FA-04 / P2 | `4af4851` → belum ada SHA penutupan | Semak eksport lejar, rujukan invois, sebab konflik UI dan timestamp. Asersi transaksi lulus. Proses pelarasan dan rujukan eksport belum diterima | **Terbuka** · Team 1/2, Kewangan |
| FA-05 / P2 | `4af4851` → belum ada SHA penutupan | Semak role bebas, PDF pelbagai pembaca, UI pemangku dan kelulusan. V1/v2 latihan ada; tiada renderer Han/Jawi yang diterima. Scope WCAG kekal | **Terbuka** · Team 1/2, JB, JTIK |
| FA-06 / P3 | `4af4851` → rujuk ujian #84 | Ulang laporan volum dan konkurensi, indeks dan lock wait. Sasaran rasmi dan load campuran belum ditetapkan | **BLOCKED operasi** · JTIK |

## Matriks K01–K11 dan Issue #68

Klasifikasi fungsi mencerminkan calon #84 dan bukti bebas yang berkaitan. Kelulusan luar diasingkan dalam lajur terakhir. `COMPLETE AND VERIFIED` digunakan bagi skop latihan yang dinyatakan. `IMPLEMENTED BUT NOT VERIFIED` digunakan apabila kod tersedia tetapi asersi bebas tidak meliputi tuntutan tersebut.

| Keperluan | Status latihan / bukti | Halangan pembangunan | Kelulusan luar |
|---|---|---|---|
| K01 lokasi/unit/fi · K02 UUID unit/tingkat | **COMPLETE AND VERIFIED** bagi inventori fixture, versi, pautan dan kiraan unit fizikal; fi **SIMULATION ONLY** | Data warisan/GIS dan kes unit gabung | **BLOCKED BY EXTERNAL APPROVAL** JB/GIS, Kewangan |
| K03 akaun/syarikat/wakil | **COMPLETE AND VERIFIED** bagi pelaku, pelantikan asas, bukti dan jemputan dalam skop P0 lab | Pemangku dan pindah kuasa berbilang daerah **NOT IMPLEMENTED** | JTIK dan JB untuk scope/pemilik peranan |
| K04 bukti, lampiran · K05 akuan | **PARTIALLY IMPLEMENTED** bukti latihan dan akuan berversi · lampiran BKT **NOT IMPLEMENTED** | Lengkapkan UI/API, skema lampiran+snapshot KP, quarantine, audit dan kes akses negatif | JB, JTIK, Perundangan untuk dokumen, tujuan dan teks akuan |
| K06 draf/serahan/ketidakaktifan | **COMPLETE AND VERIFIED** bagi pembetulan dan serahan semula terpilih. 60 hari **SIMULATION ONLY** | Tindakan selepas tidak aktif dan pemberitahuan tugasan belum lengkap | JB sahkan SLA, siri dan dasar |
| K07 muat turun/kuarantin/log/DR | **COMPLETE AND VERIFIED** P0 A/B makmal #84 dan privilege PostgreSQL | Matrik hak sasaran dan latihan kegagalan rasmi | **BLOCKED BY EXTERNAL APPROVAL** JTIK |
| K08 AI dan pengesahan manusia | **SIMULATION ONLY** pre-check/fallback dan adapter luar talian | AI rasmi, validasi kontrak penyedia | JB/JTIK dan Perundangan |
| K09 bayaran, lejar dan padanan | **SIMULATION ONLY** invois pertama/kedua, rekonsiliasi/backfill. Refund/dispute, reversal, pelarasan **NOT IMPLEMENTED** | UI autorisasi empat mata dan jurnal pembetulan | Kewangan, JTIK, Perundangan |
| K10 peranan, daerah, MFA | **PARTIALLY IMPLEMENTED** asas peranan/daerah dan kawalan akhir dalam fungsi terpilih. Pemangku, serah tugas dan pemindahan kes pelbagai daerah **NOT IMPLEMENTED** | UI dan backend, skema grant berjangka, audit serta penolakan silang daerah | JB/JTIK tentukan mandat |
| K11 pekerja dan majikan pilihan | **COMPLETE AND VERIFIED** perjalanan tanpa majikan. Kapasiti/naratif surat rasmi **PARTIALLY IMPLEMENTED** | Terima format jumlah dan keluaran | Jabatan Bangunan, JTK dan Unit Rekod |
| Issue #68 BKT, rujukan/SLA, KP | **COMPLETE AND VERIFIED** aliran fixture, ACK, pulang/hantar semula, snapshot, SLA dalam suite. Lampiran **NOT IMPLEMENTED** | Quarantine/lease, pautan versi dan audit lampiran | JB/BKT/JK, JTIK |
| Keputusan campuran, surat dan PDF | **SIMULATION ONLY** SK/SKB/Tangguh/Tolak dan PDF v1/v2. Prototaip Han/Jawi **IMPLEMENTED BUT NOT VERIFIED** untuk pengeluaran rasmi | Renderer, embedding, bidi, semakan pembaca; tandatangan sebenar belum ada | JB/JTIK/Perundangan |
| Retensi, tutup/arkib, buka semula | **PARTIALLY IMPLEMENTED** hold/pending reopen dan semakan halaman; pelupusan dilumpuhkan | Kelulusan buka semula, jadual dan pelupusan **NOT IMPLEMENTED** | Unit Rekod, JB dan Perundangan |
| Jurnal >500 acara | **NOT IMPLEMENTED**. Had serta kegagalan terkawal pada 501 kekal | Segmentasi, replay atomik, UI dan sifar kehilangan rekod | JTIK dan pemilik proses |
| Outbox dan adapter | **PARTIALLY IMPLEMENTED** dedupe, lease, notis pembetulan dan SLA, bil/keputusan/tutup. Enam adapter **SIMULATION ONLY** | Penugasan semula, failover dan penyelarasan SMTP, kontrak vendor | JTIK, JB, Kewangan, Perundangan |

Sumber skop kod dan dasar. [Matriks penyatuan #84](https://github.com/BangunanDotCom/sipintar-mbsp/blob/1d9ac409ad5526d62c5465d5795ce98d7a79955a/docs/ORACLE-FINAL-FUNCTIONAL-PARITY.md) · [Daftar keputusan pemilik #84](https://github.com/BangunanDotCom/sipintar-mbsp/blob/1d9ac409ad5526d62c5465d5795ce98d7a79955a/docs/ict-handover/STAYLINK-OWNER-DECISIONS-CORE.md) · [Checklist JTIK](https://github.com/BangunanDotCom/sipintar-mbsp/blob/1d9ac409ad5526d62c5465d5795ce98d7a79955a/docs/ORACLE-JTIK-CHECKLIST.md)

## Prestasi bebas · #84 `1d9ac40`

Ulangan benchmark #84 menggunakan data setara bagi kedua-dua enjin. Setiap kes individu SPU mengandungi satu acara pendaftaran, kategori khusus larian dan tarikh tetap. Pembilang warm-up dan setiap respons mesti sepadan dengan volum. Lima gelombang setiap kombinasi menghasilkan 5 sampel pada konkurensi 1 dan 15 pada konkurensi 3. Semua **120 permintaan diukur** memberi HTTP 200. Fastify inject mengukur laluan API dan pangkalan data tanpa proksi/pelayar. [Skrip benchmark asal](https://github.com/BangunanDotCom/sipintar-mbsp/blob/1d9ac409ad5526d62c5465d5795ce98d7a79955a/scripts/benchmark-provider-reports.ts)

| Kes | Konkurensi | PostgreSQL p50 / p95 (ms) | Oracle Free p50 / p95 (ms) |
|---:|---:|---:|---:|
| 100 | 1 | 33 / 95 | 49 / 63 |
| 100 | 3 | 50 / 95 | 142 / 311 |
| 1,000 | 1 | 52 / 71 | 608 / 671 |
| 1,000 | 3 | 78 / 90 | 695 / 929 |
| 5,000 | 1 | 200 / 210 | 1,263 / 1,472 |
| 5,000 | 3 | 225 / 238 | 3,029 / 3,616 |

RSS proses yang dibaca selepas gelombang ialah 266–316 MiB PostgreSQL dan 185–445 MiB Oracle. Kedua-dua enjin menggunakan sehingga tiga sambungan aktif. Sampel `pg_stat_activity` tidak melihat lock wait, sementara larian bebas Oracle ini mempunyai bacaan pool sahaja. Nilai p95 merupakan nilai tertinggi dalam sampel sekecil ini. Cache tidak dipaksa sejuk. Beban mengasingkan kategori dan meliputi satu daerah, tiada fail/worker/penulisan serentak. Ukuran Team 1 (#83, c=5) dan Team 2 (#84, c=3) menunjukkan bentuk berlainan. Perbandingan indeks bebas terdahulu #79 mengukur satu pertanyaan terasing 12.081→0.067 ms dan tidak memisahkan kesan indeks daripada algoritma laporan #84. Pagination retensi diuji untuk ketepatan rekod layak; latensi/lock halaman dalam di bawah volum operasi belum diuji. **Penerimaan prestasi operasi BLOCKED** sehingga JTIK menentukan SLO, campuran volum, failover dan kaedah sampel lock Oracle. [Bukti indeks #79](PENERIMAAN-AKHIR-PR78-79.md#audit-fungsi-79) · [Penanda aras Team 2](https://github.com/BangunanDotCom/sipintar-mbsp/blob/1d9ac409ad5526d62c5465d5795ce98d7a79955a/docs/ORACLE-FINAL-FUNCTIONAL-PARITY.md)

## Audit fungsi baharu dan baki per lapisan

| Fungsi | UI, backend dan skema | Autorisasi, audit dan bukti negatif |
|---|---|---|
| Pemangku, serah tugas dan pindah daerah | Tiada aliran khusus UI, API atau model pemindahan yang dapat diterima pada calon dipin. Pelantikan asas sudah ada | Belum ada aturan kuasa sementara, pihak pelulus atau jejak pemindahan. Uji tamat mandat, sesi lama, luar daerah dan perubahan serentak selepas implementasi |
| Lampiran BKT | Intake BKT, catatan, rujukan dan snapshot KP tersedia. Aliran dokumen sokongan BKT terikat versi belum lengkap | Ujian intake/tamat pelantikan tersedia. Baki karantina, verdict, rekod perubahan lampiran, pelepasan skop, versi dipulang dan rekod rasmi |
| Refund/dispute/reversal/pelarasan | Dua bayaran tiruan, lejar append-only dan rekonsiliasi tersedia. Tiada UI/endpoint/persistensi untuk lifecycle refund dan dispute, reversal/pelarasan rasmi | Ujian rollback dan pertindihan lejar lulus pada skop latihan. Pemisahan Kewangan/pelulus, auditan dan callback rasmi masih terbuka |
| Buka semula | PPSK boleh merekod permintaan termasuk sebab dan versi. Kes kekal tertutup. Kelulusan bebas dan tulis versi seterusnya belum dibangunkan | Hold, pending reopen, lintas daerah, status 409 untuk revisi lapuk dan audit peristiwa tersedia. Kelulusan bebas dan pengekalan sejarah operasi belum diuji |
| >500 acara | Had journal backend kekal, UI/penyimpanan bersegmen dan replay panjang belum dibangunkan | Ujian 499/500/501 dahulu menunjukkan had. Perlu ujian migrasi, replay merentasi segmen, rollback dan tiada rekod separa |
| Outbox | Monitor PPSK, API, jadual outbox unik, worker dan notis BKT/SLA/keputusan/bayaran/penutupan. Peristiwa pelantikan dan pengagihan semula belum lengkap | Dua enjin meliputi peringatan, lease, dedupe, penamatan skop dan peristiwa pembetulan. Worker dibatasi grant. SMTP rasmi, timeout selepas accept dan operasi `UNCERTAIN` memerlukan penerimaan |
| Adapter luar talian | Enam adapter fixture MBSPPay, AI, tandatangan, SMTP, GIS, SSO. Laluan rasmi masih di luar skop calon | Skim kontrak negatif, timeout dan replay terpilih dalam ujian unit. Tiada penggunaan credential atau penyedia sebenar |
| PDF | UI surat, ijin muat turun, hash dan v1/v2 latihan. Han/Jawi serta penerimaan pembaca dan tandatangan rasmi tertunggak | Fixture muat turun surat sah, ujian aliran dan skop P0. Perlu audit rendering, extraction, integriti apabila cetak, revokasi sijil dan gerbang pengeluaran |

## Syarat syor Personal Demo

Pengesahan kedua-dua provider dalam persekitaran makmal membolehkan semakan dalaman skop terpilih dengan akaun/dokumen sintetik. Syor untuk Personal Demo pengguna kekal **tangguh** sehingga pemilik menerima batas modul dan JTIK meluluskan hos latihan terasing, matriks akaun berasingan, proksi dan redaksi, ClamAV, bekalan fixture serta reset/rollback. Pastikan isu P0, FA-01 (pariti sasaran) dan FA-02 (tindakan pentadbir) diselesaikan mengikut skop demo. SLA dan retensi boleh ditutup sebagai kecacatan kod dalam skop makmal yang lulus. SLO operasi, peranan Kewangan dan Unit Rekod yang berdiri sendiri, tindakan rasmi serta integrasi terus memerlukan bukti berasingan.

## Perjalanan pengguna · bukti pelayar pada #84

Kit 11 akaun dijana daripada fixture API dengan kredensial sintetik berasingan. UI PostgreSQL Completion menggunakan HTTPS loopback, Oracle Free menggunakan HTTP loopback. Test kit bermula dengan kes berdaftar dan bayaran pertama selesai. Ujian onboarding berasingan menjalankan pendaftaran dan aktivasi e-mel, termasuk data dua syarikat dan fail rekaan.

| Perjalanan | Bukti bebas |
|---|---|
| Kes berdaftar hingga tutup | **PASS** PostgreSQL dan Oracle Free. Suite pelayar menjalankan Urus Setia BKT, PIC, Perancang, Kejuruteraan, KP, keputusan, penandatangan, PPSK bayaran kedua dan penutupan. Pemohon membuka kes ditutup dan mendapat surat/PDF. Kit juga menyemak pelaku lain dan laluan daerah |
| PPSK dan tujuh skop pegawai | **PASS** PostgreSQL dan Oracle Free. Ujian semak MFA, skop SPU/SPT/SPS dan pegawai teknikal. PPSK menyemak ringkasan, CSV, arkib, BKT, konsolidasi, KP dan lejar |
| Pendaftaran, telefon dan syarikat | Ujian menu/responsif dan akaun e-mel lulus pada kedua-dua enjin. Ujian dua syarikat, PDF dan jemputan wakil lulus pada profil HTTP kedua-dua enjin. Ujian dua konteks memerlukan profil HTTP untuk kedua-duanya. Pada percubaan HTTPS PostgreSQL, konteks kedua dalam ujian menggunakan base URL HTTP literal, lalu semakan Origin menolak pemilihan peranan dengan 403 |
| Kes negatif dan parallel | API dua enjin meliputi penolakan syarikat/daerah dan status lama, rollback, revalidation, sesi/MFA dan konflik yang disebut dalam suite. Dua larian khusus pembetulan lulus pada #84, termasuk notis sebelum pembetulan dan pembatalan selepas serahan semula. Ujian adapter luar talian #84 dan #83 masing-masing 9 lulus. #83 API PostgreSQL 100 lulus, 1 fixture Issue #24 dilangkau dalam larian ini |
| Baki perjalanan | Pendaftaran hingga tutup mempunyai bukti beberapa perjalanan pelayar bersambung mengikut peranan. Bukti perjalanan tunggal yang bermula dengan pendaftaran dan meliputi semua pengecualian, konflik serentak dan sesi luput melalui UI masih terbuka. Pemangku, pemindahan tugas, Kewangan dan Unit Rekod belum mempunyai perjalanan operasi berasingan |

Percubaan awal pelayar terbantut oleh pemuatan JSON persekitaran shell dan dataset benchmark dalam skema yang sama. Ulangan menggunakan konfigurasi fixture yang tepat serta pangkalan data pelayar berasingan. PPSK kemudian lulus pada kedua-dua enjin dan perjalanan penutupan lulus. Jumlah **13 ujian pelayar lulus per enjin**, terdiri daripada 10 Completion dan 3 onboarding. Kegagalan awal dan ulangan dilabel berasingan daripada penemuan kod. [Suite Completion #84](https://github.com/BangunanDotCom/sipintar-mbsp/blob/1d9ac409ad5526d62c5465d5795ce98d7a79955a/tests/e2e/synthetic-completion.spec.ts) · [Setup dua konteks syarikat](https://github.com/BangunanDotCom/sipintar-mbsp/blob/1d9ac409ad5526d62c5465d5795ce98d7a79955a/tests/e2e/portal.spec.ts#L296-L321)
