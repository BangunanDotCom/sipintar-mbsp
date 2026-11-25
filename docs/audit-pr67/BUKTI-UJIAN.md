# Bukti larian, liputan, prestasi dan pemulihan

Baseline `8ecd1e5e6d823af900937b619674f28f665080df`. Larian 25 November 2026, waktu Malaysia. Toolchain audit Node 24.22.3, npm 11.19.1, Vitest 4.1.12, Vite 7.3.7, Chromium 156.0.8078.79, PostgreSQL 16.16, Mailpit v1.27 dan Nginx 1.28 Alpine untuk HTTPS setempat. Workflow asal menggunakan Node 22. DB per suite dibina melalui migrasi baseline dan menggunakan dataset rekaan. Mailpit dan semua app test hosts terikat pada loopback.

## Hasil larian semula

| Arahan / pemeriksaan | Keputusan sebenar | Had tafsiran |
|---|---|---|
| `npm ci` dengan cache ditetapkan ke direktori audit | **Lulus**, 443 pakej | Percubaan awal gagal kerana cache npm lalai di luar ruang tulis. Lockfile dikekalkan, cache ditukar |
| `npm run db:generate`, `npm run lint`, `npm run build` | **Lulus**, termasuk `tsc --noEmit` yang dipanggil oleh build | Amaran chunk peta melebihi 500 kB. npm melaporkan deprecation ESLint 9.39.5 |
| `npx vitest run --exclude tests/api.test.ts` | **336 lulus** dalam 49 fail, 72.85 s | Suite komponen, log, storan sementara dan mock TCP. Tiada peratus line/branch/function coverage yang dihasilkan |
| `npx vitest run tests/api.test.ts`, fixture `staylink_issue58_api_test` selepas migrasi/seed | **79 lulus**, 1 ujian bersyarat dilangkau, 44.77 s | PostgreSQL/Mailpit setempat. Fastify `inject` mengesahkan aplikasi tanpa proksi Internet |
| Ujian API terpilih pada `staylink_issue24_audit_test` selepas migrasi | **1 lulus**, 79 dikecualikan oleh penapis, 4.44 s | Ujian bersyarat asal bagi bukti silang draf, serahan tepat sekali dan snapshot lama. Jumlah unik API **80 lulus** merentas dua konfigurasi |
| `npm run test:e2e`, fixture browser biasa | **27 lulus**, 2 ujian khusus HTTPS dilangkau, 4.6 min | Liputan termasuk akaun, Mailpit, MFA, pemilikan, aksesibiliti terpilih, fallback peta dan aliran mock |
| Kit UAT, preflight dan `synthetic-portal.spec.ts` | **1 lulus**, 18.1 s | Akaun/servis latihan dan semakan perjalanan dengan kit |
| Hosted Demo pada Nginx/TLS 5443 | **2 lulus**, 1.1 min | Host demo dan aliran portal sintetik. TLS setempat dengan sijil latihan |
| Personal Demo pada Nginx/TLS 5444 | **1 lulus**, 19.2 s | Skrip persediaan kes fixture menjalankan satu ujian dengan tujuh akaun; ujian termasuk pemohon, PIC tiga daerah, PPSK dan ICT |
| `scripts/rehearse-cloudflare-boundary.sh` | **Lulus** untuk Nginx/TLS setempat, SPA, no-store, hos, header dan kuki | Simulasi sempadan origin. Perkhidmatan Cloudflare, Access dan DNS sasaran tidak dihubungi |
| `npm audit`, `npm audit --omit=dev` | **0 kerentanan dilaporkan** pada kedua-duanya pada tarikh larian | Dapatan pangkalan data advisori bagi dependency set. Lihat penemuan audit kod untuk kawalan aplikasi |
| PostgreSQL restore API, Hosted Demo dan Personal Demo | **Lulus** pada tiga DB pemulihan kosong berasingan | Bukti cap jari/trigger di jadual pemulihan |
| `deploy/personal-demo/prepare.sh reset` | **Lulus** ke DB kosong baharu: 7 akaun, 7 draf, 4 serahan. Sasaran sama ditolak (kod 2), sasaran sudah berisi ditolak (kod 1) | DB sebelumnya kekal tersedia. Percubaan dengan nama sesi yang mengandungi garis bawah turut ditolak mengikut format. Larian merekod amaran deprecation panggilan serentak `pg` bagi keserasian pg 9.0 |
| Oracle PR #64 `tests/oracle-contract.test.ts tests/oracle-integration.test.ts` pada `4b55f38` | **11 kontrak lulus**, **10 integrasi dilangkau**, 3.64 s | Fail env owner/runtime Oracle lab tiada, PDB Oracle 19c SE2 tidak disediakan. Failover, import/restore dan UAT penuh 19c belum disahkan |
| Semakan laluan OpenAPI melalui `buildApp().swagger()` | **Perbezaan disahkan**. JSON disimpan 51 laluan; runtime 56 dalam profil biasa dan 65 dalam profil latihan dengan kunci | Lima laluan biasa tambahan ialah readiness, floors, units, documents dan upload-limits. Sembilan laluan tambahan latihan merangkumi draft, review, billing dan callback |

Percubaan awal hos berakhir pada port pembangunan 3001 yang masih dipegang proses larian audit. Kit awal menggunakan pelayan lama dan menerima 429. Larian semula menggunakan DB, proses dan port yang telah diasingkan dan lulus. Fail pemasa `/usr/bin/time` tiada selepas ujian Hosted Demo lulus. Restore hos kemudian dijalankan terus dengan `time` Bash dan lulus. Pengukuran prestasi pertama menunggu `networkidle` dan tamat masa, lalu diganti dengan sampel berhad selepas `DOMContentLoaded`. Tiada kegagalan fungsi berulang diperhatikan pada larian semula ini.

**Bukti sejarah CI.** Metadata GitHub Actions menyenaraikan enam job success pada run #45363894534: validate, api, browser, kit, demo dan personal. Angka larian tempatan di atas dikira daripada output tempatan. [GitHub Actions #45363894534](https://github.com/BangunanDotCom/sipintar-mbsp/actions/runs/45363894534)

## Liputan yang dibuktikan dan jurang

| Aras | Skop bukti | Jurang paling penting |
|---|---|---|
| Unit / komponen | Policy engine, deduplikasi invois, tindakan review, CSRF web, input permohonan, identiti model, konfigurasi hos, log redaction, map fallback, laporan UAT, ClamAV framing, lease/scan, kuarantin setempat | Coverage kuantitatif tidak dikonfigurasi/direkodkan. Tambah ukuran dalam pipeline selepas menerima skop; test count sahaja tidak mengukur cabang kod. Gerbang baharu E09–E15 memerlukan unit khusus |
| API dengan DB | Auth/MFA, rate limit, IDOR, e-mel, kuasa wakil, pelantikan, templat, audit, konflik versi, scope FK, audit dan snapshot immutable, replay submission/callback, cross-role/district terpilih | Semua mutasi dan revalidasi masa komit, kadar/kuota, akses PDF yang konsisten, fault-injection outbox, retry selepas komit tidak pasti, load representative, parity Oracle |
| Browser biasa | Perjalanan individu/wakil, monitor draf, borang mudah alih, kata laluan keyboard, pin dan kegagalan peta, ujian journey mock dan bajet permintaan | Kes rasmi, browser/device matrix/Safari/Firefox, pembaca skrin, zoom 400%, kontrak production CSP, lampiran, surat dan pembayaran sandbox rasmi |
| Browser HTTPS / Personal | Kuki dan aliran terpilih di Nginx, MFA, tujuh akaun dan sempadan tiga PIC, satu PPSK SPU, persediaan fixture dan laluan merentas peranan | Access/Tunnel sasaran dan penolakan IdP/AUD sebenar, PPSK SPT/SPS, aktor rujukan/JK/kewangan/penandatangan. Gerbang end-to-end Complete Release terbuka |
| Pemulihan dan lintas enjin | Cap jari/trigger PostgreSQL sintetik, manifest, konfigurasi dan kontrak codec Oracle | Oracle 19c SE2, parity semua API/endpoints, mekanisme DR sasaran, dokumen + vault + audit + perkhidmatan pembekal dipulihkan bersama |

## Prestasi yang diukur

Pengukuran halaman utama menggunakan binaan Vite tempatan, Chromium headless, cache browser dinyahaktifkan, konteks baharu setiap kali dan permintaan bukan loopback disekat. Lima sampel setiap profil. Desktop 1366×768 tanpa throttle, profil mobile 390×844 dengan 100 ms latency emulasi, 200,000 bait/s muat turun, 93,750 bait/s muat naik dan CPU 4× lebih perlahan. Masa diambil daripada Navigation Timing dan pemerhati LCP. Profil mobile diuji dalam emulasi, menggunakan rangkaian setempat. Ralat dan perubahan UI daripada perkhidmatan sebenar belum termasuk.

| Ukuran | Desktop | Mobile emulasi |
|---|---:|---:|
| Median TTFB | 13 ms | 28 ms |
| Median load event end | 252 ms | 1,539 ms |
| Median LCP | 932 ms | 2,420 ms |
| Min–maks LCP | 836–1,216 ms | 2,116–3,104 ms |
| Lebihan lebar mendatar halaman utama dalam lima sampel | 0 px | 0 px |

- `/api/health` terus ke Fastify loopback: 30 sampel berturutan selepas satu warm-up. Semua HTTP 200, p50 **4.28 ms**, p95 **19.66 ms**, maks. **20.33 ms**. Health ini memeriksa liveness aplikasi.
- Hosted Demo: lima login dan bacaan sesi dalam batch **572 ms**. Enam bacaan health serentak melalui Nginx/TLS selesai dalam **108 ms** dan semuanya HTTP 200.
- Build: JS awal **472.12 kB** minified (**147.31 kB** gzip kalkulasi build). Chunk MapLibre/fallback **1,059.32 kB** minified (**290.33 kB** gzip). Chunk peta dimuat apabila diperlukan. Angka build tidak mewakili bait rangkaian pengguna sasaran.
- Tiada INP/CLS hasil lapangan, p95/p99 beban pengguna, statistik query Oracle, penggunaan memori muat naik atau SLO produksi yang telah dibuktikan. Data ini menetapkan garis dasar awal setempat. Ujian O03 memerlukan dataset dan kadar kerja yang diluluskan.

## Sandaran, pemulihan dan DR

Ketiga-tiga larian menggunakan `pg_dump -Fc` dan `pg_restore --exit-on-error --no-owner`. Dalam setiap larian, skrip mengesahkan destinasi kosong, bilangan rekod, cap jari kandungan terpilih dan satu trigger immutable aktif. Turutan angka ialah serahan / pautan bukti / pengesahan lengkap / invois / settlement / notifikasi review / trigger.

| Fixture | Hasil | Masa |
|---|---|---|
| Selepas API integrasi PostgreSQL | **29 / 12 / 1 / 1 / 1 / 3 / 1**, bilangan dan cap jari sepadan | Tidak diukur berasingan |
| Selepas Hosted Demo HTTPS | **4 / 14 / 2 / 2 / 1 / 5 / 1**, bilangan dan cap jari sepadan | 2.313 s masa dinding setempat untuk skrip |
| Selepas Personal Demo HTTPS | **4 / 9 / 1 / 0 / 0 / 2 / 1**, bilangan dan cap jari sepadan | 1.443 s masa dinding setempat untuk skrip |

Untuk gerbang DR, perlukan RPO/RTO yang ditandatangani, pemulihan DB dan objek/kunci pada titik konsisten, semakan hash surat dan dokumen, smoke MFA/sesi, pembayaran dan outbox, pengesahan akses, legal hold, bukti alert dan rehearsal pengunduran. Draf Owner Decision Pack menyebut RPO 24 jam/RTO 8 jam untuk pengesahan. Kedua-duanya tertakluk kepada keputusan JTIK dan pemilik data. [Owner Decision Pack](../ict-handover/OWNER-DECISION-PACK.md)

## Sempadan kesediaan Oracle

PR #64 dan PR #67 berkongsi asas `72b04f61b195d031a07f2079f0f8c14523ee1ef7`. Pokok Oracle yang diaudit belum mempunyai aset, penyediaan dan ujian Personal Demo tujuh akaun yang ditambah pada PR #67. Pakej gabungan perlu dibina dan disahkan sebelum menganggap parity.

- DDL, inventori dan alat seed/import/backup logik menggunakan manifest 31 jadual aplikasi. Dokumentasi melaporkan Oracle Free 23.26.4 dalam makmal. Semakan audit ini mengesahkan kontrak setempat, bukan larian Oracle Free yang dilaporkan pembangun.
- Repository dan HTTP terpilih wujud bagi auth/MFA, jemputan wakil, scanner dan pengurusan. Percubaan startup setempat dengan provider Oracle mengesahkan proses ditolak sebelum sambungan, seperti ditetapkan dalam `core.ts`. Draf/premis/unit, serahan/PIC/PPSK, fi dan pengurusan lain memerlukan port dan pengujian parity.
- Gerbang 19c termasuk AL32UTF8, normalisasi masa/NULL, constraint dan locking, peranan owner/runtime minimum, pengecualian indeks LOB dalaman, prestasi/kuota, semakan drift STL, hash import, rollback dan pemulihan merentas DB/objek/kunci. Data Pump/RMAN memerlukan SOP dan bukti sasaran. [PR #64](https://github.com/BangunanDotCom/sipintar-mbsp/pull/64) · [Dokumen migrasi](https://github.com/BangunanDotCom/sipintar-mbsp/blob/4b55f385455216bf3c73a06dacad1bd2e333224e/docs/ORACLE-19C-MIGRATION.md)
