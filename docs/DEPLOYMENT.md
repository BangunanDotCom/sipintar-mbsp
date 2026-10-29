# Nota deployment untuk semakan ICT MBSP

Tiada deployment produksi dilakukan. Docker bukan syarat produksi dan Linux tidak diandaikan sebagai platform MBSP.

## Binaan dan runtime

`npm run build` menghasilkan `apps/web/dist`. Sajikan fail ini menggunakan pelayan statik yang diluluskan, dengan fallback semua laluan React kepada `index.html`. Proksi `/api/*` kepada Fastify pada `127.0.0.1:3001`, mengekalkan HTTP method, cookie, origin dan header CSRF. Jangan guna Vite dev server untuk produksi.

Backend boleh dijalankan menggunakan `node --import tsx apps/api/src/index.ts` dengan dependencies dikunci dan pengurus servis OS yang diluluskan. Pipeline seterusnya boleh mengkompil backend kepada JavaScript jika diperlukan; build semasa menyemak jenis backend dan membina frontend.

Tetapkan `NODE_ENV=production`, `APP_ORIGIN=https://domain-yang-diluluskan`, database role berkeistimewaan minimum, `MFA_ENCRYPTION_KEY`, serta SMTP diluluskan. `SMTP_PRODUCTION_ENABLED=true` diperlukan untuk penghantaran produksi. Sertakan `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` jika pembekal memerlukannya. Gunakan secret manager, bukan nilai dalam Git.

## Pilihan Windows / IIS

- Pasang Node.js LTS yang diluluskan, PostgreSQL/sambungan DB, dan dependencies melalui `npm ci`.
- Konfigurasikan IIS static site untuk `apps/web/dist` dengan rewrite SPA.
- Gunakan URL Rewrite/ARR atau reverse proxy lain yang diluluskan bagi `/api/*`.
- Jalankan Fastify sebagai Windows service melalui pengurus servis yang diluluskan; jangan bergantung pada terminal interaktif.
- Simpan secrets sebagai environment servis dengan ACL sesuai.
- Contoh PowerShell untuk bootstrap: `$env:BOOTSTRAP_EMAIL='alamat-yang-diluluskan'; $env:BOOTSTRAP_NAME='Nama Pengendali'; npm run admin:bootstrap`. Kosongkan variable selepas operasi.

Konfigurasi IIS sebenar, sijil TLS, port firewall, akaun servis dan domain perlu dibekalkan/diuji ICT. Projek ini tidak mendakwa konfigurasi tersebut sudah disahkan pada pelayan MBSP.

## Migrasi dan rollback

Ambil backup dan uji pada staging. Jalankan `db:generate` dalam build dan `db:migrate` sebagai langkah deployment terkawal dengan kelayakan migrasi yang sesuai. Runner memeriksa checksum dan menggunakan advisory lock/transaksi. Kekalkan SQL lama; tambah migrasi baharu untuk pembetulan. Jangan campur jadual migrasi runner dengan Prisma Migrate CLI.

Deploy kod aplikasi yang serasi dengan skema. Rollback aplikasi hanya jika skema serasi; restore database perlu kelulusan pemulihan dan ujian terasing. Tiada arahan pemadaman database automatik disediakan.

## Sebelum penerimaan

Tentukan backup/RPO/RTO, log dan monitoring, SMTP, kuota fail, pengurusan sesi berbilang instance, pentest, pemulihan MFA, domain rasmi dan peraturan data. Dapatkan aset sah MBSP, kelulusan branding, polisi privasi dan UAT setiap peranan. Integrasi SSO, MBSPPay, AI, GIS dan tandatangan digital memerlukan spesifikasi/akses serta kelulusan berasingan.
