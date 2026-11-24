# Penilaian STAYLink MBSP pada Cloudflare Workers Free dan D1

**Status pada 24 November 2026 MYT** — Sedia untuk semakan teknikal dan latihan setempat. Portal penuh belum sedia untuk deployment serverless. Baseline `72b04f61b195d031a07f2079f0f8c14523ee1ef7` kekal sebagai rujukan PostgreSQL. Semua perubahan cabang ini berada dalam `deploy/serverless/`.

## Keputusan seni bina

Calon seni bina tanpa hos tambahan ialah satu Worker bernama `staylink-mbsp-demo` yang menyampaikan binaan React dan API melalui origin HTTPS yang sama, dengan satu pangkalan data D1 khusus bernama `staylink-mbsp-demo-db`. Cloudflare Access akan melindungi origin tersebut. Pengasingan sesi latihan, peranan, daerah dan data tetap dikuatkuasakan oleh aplikasi. D1 hanya akan diikat pada Worker itu. Baris dalam D1 perlu ditapis secara eksplisit oleh setiap pertanyaan. D1 tidak menyediakan peranan dan polisi per baris seperti PostgreSQL.

Migrasi penuh memerlukan pemindahan lapisan HTTP, autentikasi dan pangkalan data, termasuk menguji semula jaminan transaksi bagi setiap aliran. Penilaian ini berhenti pada bukti konsep D1 dan konfigurasi tempatan yang menolak semua trafik. Perubahan seni bina tersebut memerlukan keputusan selepas semakan alternatif.

| Pilihan | Pengalaman pegawai dan kos |
| --- | --- |
| A. Portal penuh melalui Workers + D1 | Padanan terbaik bagi syarat tanpa hos. Perlu pembangunan berperingkat dan semakan keselamatan sebelum menguji had CPU dan kuota pada edge. RM0 ialah sasaran yang tertakluk pada keputusan ujian. |
| B. Portal penuh melalui Cloudflare Tunnel + origin PostgreSQL | Menyediakan fungsi baseline dengan kerja porting minimum. Draf #65 sudah merangkumi pilihan ini. Memerlukan hos Linux yang sentiasa hidup dan hostname yang diluluskan. Kos tambahan hanya boleh kekal RM0 jika hos serta zon DNS tersedia. [Draft PR #65](https://github.com/BangunanDotCom/sipintar-mbsp/pull/65) |
| C. Lawatan berpandu statik melalui Workers | Boleh menunjukkan reka bentuk dan perjalanan sintetik tanpa hos, dengan kandungan dilindungi Access. Tiada log masuk latihan, transaksi, atau operasi tulis. Sesuai hanya jika JTIK menerima skop demonstrasi yang lebih kecil. |

## Audit keserasian baseline

| Komponen | Penemuan dan kerja yang diperlukan |
| --- | --- |
| API Node dan Fastify | `apps/api/src/index.ts` menggunakan `listen`. Workers menyediakan jambatan `node:http` melalui `httpServerHandler` dengan flag `nodejs_compat` dan `enable_nodejs_http_server_modules`. Uji entry point dan kitar hayat plugin sebelum memilih jambatan atau pengendali `fetch` khusus. Semak versi terkunci Fastify serta plugin cookie, Helmet, rate-limit, Swagger dan Swagger UI, termasuk penguatkuasaan had rentas isolate, aset dokumentasi, pengepala dan pemetaan IP. [Cloudflare node:http](https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/) |
| Prisma, pg dan migrasi | Baseline menggunakan `@prisma/client`, `@prisma/adapter-pg`, `pg`, 31 model dan 10 migrasi PostgreSQL. D1 menggunakan SQLite. Adapter D1 tersedia untuk skema SQLite, tetapi ia tidak memindahkan model, native types, migrasi atau SQL PostgreSQL secara automatik. Ukur pilihan adapter berbanding repository D1 dengan SQL yang terikat sebelum memilih. [Prisma SQLite](https://www.prisma.io/docs/orm/overview/databases/sqlite) · [Cloudflare D1 SQL](https://developers.cloudflare.com/d1/sql-api/) |
| Transaksi, integriti dan audit | `application-drafts.ts`, `synthetic-submissions.ts`, `synthetic-portal-session.ts`, `synthetic-portal-review.ts`, `synthetic-portal-billing.ts`, `routes.ts`, `services.ts` dan skrip data menggunakan transaksi interaktif, `FOR UPDATE`, `FOR SHARE`, advisory lock atau JSONB. Port perlu menginventori setiap transaksi dan menerbitkan versi serta audit bersama perubahan, menggunakan SQL bersyarat, constraint, trigger atau kelompok `batch()` atomik. Semak FK, JSON, Decimal/fi, tarikh, UUID, indeks, data lama dan serentak. [D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch) |
| Kata laluan, sesi, MFA dan CSRF | `auth.ts` bergantung pada binding Node natif `argon2`, termasuk semakan dummy bagi pengguna tidak dikenali. Keserasian API Node tidak memuatkan addon tersebut. Calon pengganti perlu melalui semakan keselamatan dan pengukuran CPU pada Workers Free tanpa merendahkan kekuatan hash atau membocorkan kewujudan akaun. OTPAuth, qrcode dan crypto boleh dinilai secara berasingan. Port mesti menguji TOTP, penyulitan kunci, pencegahan ulang guna, pembatalan sesi, cookie HTTPS, origin dan token CSRF. Token Access membuktikan akses ke demo. Identiti latihan dan kelayakan tindakan kekal berasingan. [Keserasian Node](https://developers.cloudflare.com/workers/runtime-apis/nodejs/) |
| Konfigurasi, SMTP, dokumen dan operasi | `dotenv`, Nodemailer/SMTP, Mailpit, preflight hos dan stor fail kuarantin setempat bergantung pada persekitaran Node dan hos. Calon port menggunakan bindings atau secrets. Ia memerlukan pengganti setara untuk pemulihan akaun dan e-mel latihan sebelum aliran tersebut dianggap lengkap. Kekalkan stor dokumen sebenar, SMTP produksi dan MBSPPay rasmi dalam keadaan disabled. Peraturan bukti sintetik, callback berulang, fi fizikal dan rekonsiliasi mesti dibuktikan semula. |
| Frontend dan alat binaan | React/React DOM, TanStack Query, React Hook Form, React Router, Lucide, Leaflet, MapLibre dan Montserrat kekal di browser. Vite menghasilkan 31 fail statik, fail terbesar kira-kira 2.4 MiB. Semak pemetaan SPA, API origin sama, CSP, pemuatan peta pada rangkaian MBSP, cache, dan liputan Access untuk semua fail. Zod kekal untuk validasi di sempadan API. Prisma CLI, tsx, TypeScript, ESLint, Vitest, Playwright, concurrently dan Prettier kekal alat binaan atau ujian. [Had aset statik](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) |

Pakej baseline mengandungi enam akaun latihan sebenar dalam konteks sintetik dan enam perjalanan UAT, termasuk laluan syarikat aktif dan luput serta akses daerah. Seed D1 dalam penilaian ini merekodkan enam identiti tanpa kata laluan dan enam penanda senario. Hanya bacaan draf peribadi dan satu peralihan pembetulan PIC diuji pada D1. Akauan digital, pendaftaran, log masuk, MFA sebenar, CSRF, wakil, dokumen, PPSK, pembayaran serta semua skrin kekal diwajibkan dalam ujian portal penuh sebelum kelulusan. [Panduan UAT baseline](../../docs/ict-handover/GUIDED-INTERNAL-UAT.md)

## Had yang disahkan daripada dokumentasi rasmi

| Perkhidmatan | Had pelan Free dan kesan |
| --- | --- |
| Workers | 100,000 permintaan dinamik sehari bagi akaun, 10 ms masa CPU setiap permintaan, 128 MB memori dan 50 subpermintaan setiap invocation. Aset yang dilayan tanpa menjalankan skrip Worker adalah percuma dan tanpa had permintaan, dengan had 20,000 fail bagi versi dan 25 MiB bagi setiap fail. Binaan semasa sesuai dari segi jumlah dan saiz fail. Hash kata laluan, MFA, pangkalan data, bundle Worker dan beban serentak belum diukur pada edge. [Had Workers](https://developers.cloudflare.com/workers/platform/limits/) · [Had aset](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) |
| D1 | 5 juta baris dibaca dan 100,000 baris ditulis sehari. Penulisan indeks dikira. Maksimum 10 pangkalan data bagi akaun, 500 MB setiap pangkalan data, 5 GB agregat, 50 panggilan DB setiap invocation (satu `batch()` dikira sebagai satu panggilan), 100 parameter terikat setiap penyataan dan 2,000,000 bait bagi string/BLOB/baris. Pemulihan Time Travel bagi pelan Free ialah 7 hari. Had berkongsi dengan sumber lain pada akaun. Sahkan trend baris dibaca, indeks, kapasiti dan tingkah laku apabila kuota habis pada demonstrasi rintis. [Had D1](https://developers.cloudflare.com/d1/platform/limits/) · [Harga D1](https://developers.cloudflare.com/d1/platform/pricing/) |
| Cloudflare Access | Dokumentasi mengesahkan Access boleh melindungi URL HTTPS `workers.dev` dan URL pratonton tanpa pembelian domain. Pilihan ini memerlukan persediaan Zero Trust dan pengesahan kelayakan serta had tempat duduk pada akaun sebenar. [Access pada workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/#manage-access-to-workersdev) |

## Latihan tempatan

Gunakan Node.js 22. Fail kunci alat ujian berasingan daripada aplikasi. Wrangler 4.167.0 menggunakan Miniflare 5 beta untuk emulasi setempat. Sahkan semula sebelum sebarang perubahan versi atau ujian edge.

```sh
cd deploy/serverless
npm ci
npm test
npm run rehearse
```

`npm run rehearse` menggunakan direktori sementara dan menjalankan migrasi serta seed dengan flag `--local`. Hasil semakan dijangka enam identiti dan enam senario. Direktori latihan dibuang selepas selesai. `npm test` menggunakan workerd/Miniflare dengan storan setempat terasing. Ujian meliputi respons 503 tanpa cache, seed boleh diulang, akses draf pemilik, penolakan rentas daerah/peranan/MFA yang tidak ditanda, versi lapuk, idempotensi serentak dan rollback apabila audit gagal. Nilai MFA dalam ujian datang daripada identiti sintetik yang direka oleh ujian. Tiada input HTTP diteruskan ke repository.

## Bukti semakan

| Pemeriksaan | Keputusan |
| --- | --- |
| Pakej D1 setempat | 6/6 ujian lulus. Wrangler menggunakan binding setempat dan mengesahkan 6 identiti serta 6 penanda selepas migrasi dan seed. |
| Aplikasi rujukan | TypeScript, lint dan build lulus. 323 ujian Vitest, 79 ujian API PostgreSQL sintetik dan satu ujian keserasian data lama berasingan lulus. Vite mengeluarkan amaran saiz chunk peta sedia ada. |
| Playwright pada aplikasi rujukan | 27 lulus, termasuk aliran pemohon, PIC, penyelia dan invois tiruan. Ujian hos HTTPS dikhususkan kepada larian baseline di bawah. |
| Audit npm | Audit lockfile aplikasi dan lockfile makmal masing-masing melaporkan 0 advisori. |
| Penerimaan Demo Release 1.0 | Rekod CI asal merangkumi PostgreSQL, Playwright, ujian enam akaun dan enam perjalanan, serta latihan TLS dan pemulihan pada hos. [CI pada baseline](https://github.com/BangunanDotCom/sipintar-mbsp/actions/runs/45151512805) |
| Cloudflare edge | CPU dan kuota sebenar, Access pada akaun MBSP, backup/restore D1 jauh dan perjalanan penuh portal D1 menunggu pelaksanaan dan kelulusan. |

## Gerbang sebelum sebarang deployment

1. JTIK pilih skop A, B atau C, bilangan pegawai dan penanggungjawab akaun. Untuk A, kelulusan merangkumi reka bentuk autentikasi, semantik transaksi dan sasaran kuota. Rekod setiap peraturan domain, ujian penerimaan dan dasar yang kekal disabled.
2. Untuk ujian edge yang diluluskan, sediakan Worker dan D1 khusus. Simpan ID binding dan sebarang kunci sesi, TOTP atau callback ujian dalam konfigurasi/secret yang dilindungi. Hadkan token penerbitan kepada akaun dan resource demo. Fail lab menggunakan ID dummy serta mematikan URL awam dan pratonton.
3. Gunakan skop Access satu Worker dengan polisi tolak lalai dan kumpulan pegawai melalui IdP yang diluluskan. Sahkan tandatangan, issuer, audience dan tamat tempoh JWT Access sebelum API memproses data. Cloudflare menyatakan bahawa penghala Static Assets boleh melindungi seluruh aplikasi tetapi tidak menghantar `ctx.access` kepada Worker pengguna. Untuk API yang menggunakan penghala itu, uji pengesahan JWT melalui pengepala `Cf-Access-Jwt-Assertion`. Uji laluan aset secara terus, pengguna anonim, akaun yang ditarik balik, token salah, pemohon/wakil, PIC rentas daerah dan PPSK. Aktifkan URL demo hanya apabila perlindungan disahkan. Kekalkan pratonton dimatikan. [Access untuk Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
4. Gunakan migrasi **portal lengkap** dan seed **enam akaun latihan** apabila kedua-duanya telah lulus ujian. Sebelum migrasi, catat bookmark Time Travel yang diluluskan. Simpan eksport SQL sintetik yang telah disahkan di ruang akses terhad. Latih pemulihan pada D1 latihan terasing dan semak kiraan, audit, invois dan rekonsiliasi. Rekod versi Worker yang sepadan dengan skema. Jika pembetulan gagal, tutup akses dahulu dan pulihkan versi Worker/skema yang serasi menggunakan pelan tersebut. [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) · [D1 import dan eksport](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
5. Jalankan keseluruhan Vitest, API D1, Playwright enam akaun/enam senario, semakan akses silang, MFA, CSRF, callback/tindakan berulang dan pemulihan. Ukur CPU sebenar edge, baris D1 dan prestasi serentak menggunakan sasaran JTIK. Apabila had gagal, kekalkan laluan tertutup dan semak semula pilihan RM0.
