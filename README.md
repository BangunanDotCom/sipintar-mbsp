# STAYLink MBSP

**Smart Temporary Accommodation Link**

**Digital Services, Practical Solutions.**

Aplikasi pembangunan Fasa 1 dan modul akaun pemohon Fasa 2A untuk Jabatan Bangunan, Majlis Bandaraya Seberang Perai. Identiti paparan sentiasa **STAYLink MBSP**. Nama direktori checkout lama `sipintar-mbsp` tidak mengubah nama aplikasi.

Ini aplikasi React + Fastify + PostgreSQL yang boleh dijalankan, bukan laman statik. Statusnya **calon semakan pembangunan**, belum disahkan sebagai sistem produksi MBSP. Baca [skop dan batas](docs/STATUS.md) sebelum UAT.

## Keperluan

- Node.js 22.12+ atau Node.js 24 LTS; npm 10+.
- PostgreSQL 16+; satu database pembangunan dan satu database berasingan berakhir `_test`.
- SMTP ujian, contohnya Mailpit. Docker Compose hanya pilihan pembangunan.
- Chromium untuk Playwright; tetapkan `CHROMIUM_PATH` kepada binary pelayar yang dipasang atau ubah konfigurasi kepada browser Playwright yang diluluskan.

## Pemasangan tempatan

```bash
npm ci
cp .env.example .env
```

Kemas kini `DATABASE_URL`, `TEST_DATABASE_URL`, `MFA_ENCRYPTION_KEY` dan `IDENTITY_DATA_KEY` dalam `.env`. Gunakan dua kunci berasingan dan kekalkan nilainya merentas restart/kemas kini. Jana setiap kunci 32 bait menggunakan `openssl rand -hex 32` atau penjana kriptografi ICT. Jangan commit `.env`.

Pilihan Docker Compose (tetapkan kata laluan anda sendiri; gunakan nilai sama dalam kedua-dua URL database):

```bash
POSTGRES_PASSWORD='KATA_LALUAN_TEMPATAN_ANDA' docker compose -f docker/compose.yml up -d
```

Compose mengikat PostgreSQL dan Mailpit ke loopback. Init SQL mencipta `staylink_test` pada volume baharu sahaja. Untuk database sedia ada, cipta database ujian secara manual: `CREATE DATABASE staylink_test OWNER staylink;`.

```bash
npm run db:generate
npm run db:migrate
npm run db:test:migrate
npm run db:seed
npm run dev
```

URL dijangka:

| Perkhidmatan | URL |
|---|---|
| Portal React | http://localhost:5173 |
| API | http://localhost:3001/api/health |
| OpenAPI interaktif | http://localhost:3001/api/docs |
| Mailpit ujian | http://localhost:8025 |

Vite memproksi `/api` kepada Fastify, mengekalkan origin tunggal untuk cookie dan CSRF. API mengikat `127.0.0.1`; proksi produksi perlu berada pada host yang sama atau konfigurasi bind disemak ICT.

## Pentadbir pertama — tiada kata laluan lalai

Pastikan SMTP ujian tersedia. Pada database baharu:

```bash
BOOTSTRAP_EMAIL='pentadbir@example.test' BOOTSTRAP_NAME='DATA UJIAN Pentadbir' npm run admin:bootstrap
```

1. Buka e-mel di Mailpit. Jangan gunakan alamat ujian untuk produksi.
2. Buka pautan jemputan sekali guna (luput satu jam).
3. Tetapkan kata laluan sendiri: minimum 12 aksara, huruf besar, kecil, nombor dan simbol.
4. Log masuk, klik **Daftar MFA**, imbas QR dalam aplikasi pengesah.
5. Masukkan kod 6 digit dan simpan lapan recovery codes yang dipaparkan sekali sahaja.
6. Pilih peranan **Pentadbir ICT**. Jemput pegawai lain melalui dashboard.

Bootstrap dikunci pada peringkat transaksi PostgreSQL dan berhenti jika pelantikan Pentadbir ICT sudah wujud. Pentadbir pertama mendapat kuasa teknikal; tiada kuasa meluluskan permohonan atau mengurus format induk secara automatik.

Sintaks penetapan environment variable berbeza dalam PowerShell; lihat [deployment](docs/DEPLOYMENT.md).

## Data demonstrasi pilihan

Seed asas hanya memasukkan peranan, permission, jabatan, daerah dan daftar kategori templat. Tiada akaun dengan kata laluan umum.

```bash
DEMO_DATA_ALLOWED=true DEMO_PASSWORD='PILIH_KATA_LALUAN_KUKUH_SENDIRI' npm run db:demo
```

Arahan ini hanya dibenarkan di luar produksi. Semua akaun dan syarikat dilabel **DATA UJIAN**, domain `example.test`. Kata laluan dipilih pengendali; tiada nilai lalai. Akaun pegawai tetap perlu daftar MFA. Akaun demo sengaja menandakan e-mel disahkan untuk latihan, dan tidak menguji pengesahan e-mel; gunakan pendaftaran biasa untuk aliran penuh.

## Ujian dan binaan

```bash
npm run lint
npm run typecheck
npm test
npm run build
# Dengan npm run dev sedang berjalan dan Mailpit tersedia:
npm run test:e2e
```

Vitest hanya menggunakan `TEST_DATABASE_URL`, dengan nama database berakhir `_test`. Playwright menggunakan pelayan pembangunan aktif; jalankannya hanya terhadap instance pembangunan dengan data sintetik. Butiran dan keputusan sebenar: [TESTING.md](docs/TESTING.md).

## Struktur folder

```text
apps/api/src/       Fastify, authorization, authentication, services, OpenAPI
apps/web/src/       React, dashboard, portal, design tokens CSS, i18n scaffold
packages/shared/   Zod, peranan, matriks permission, aturan pelantikan
prisma/            Schema ORM, migrasi SQL berversi, seed master data
docker/            Compose PostgreSQL/Mailpit pilihan untuk pembangunan
scripts/           Bootstrap, migrasi, codegen, demo, retry e-mel
tests/             Vitest unit/API + Playwright e2e
docs/              Seni bina, DB, keselamatan, RBAC, operasi, Fasa 2
```

Logik akses data dan proses berada di backend; komponen React hanya mengurus interaksi. Tiada integrasi rasmi AI, MBSPPay, GIS, SSO atau tandatangan digital diaktifkan.

## Nota Prisma

Prisma 6.19 dipin bersama adapter PostgreSQL dan JavaScript engine. Rangkaian pembangunan menyekat muat turun native Prisma; `db:generate` menggunakan generator Prisma yang dipin melalui pakej `@prisma/internals` dengan parser WASM. API dalaman ini ialah pergantungan pembangunan yang perlu disemak apabila naik taraf Prisma.

`db:migrate` menggunakan runner SQL bertandatangan SHA-256 dan advisory lock PostgreSQL, dengan jadual `_staylink_migrations`. **Jangan campur dengan `prisma migrate deploy` pada database sama.** SQL disemak dan dijejak dalam repositori. Perubahan schema selepas ini memerlukan fail migrasi baharu; tiada `db push` atau pemadaman jadual automatik.

Dokumentasi lanjut: [Seni bina dan database](docs/ARCHITECTURE.md), [RBAC](docs/RBAC.md), [Operasi](docs/OPERATIONS.md), [Keselamatan](docs/SECURITY.md), [API](docs/API.md), [Deployment ICT](docs/DEPLOYMENT.md), [Fasa 2](docs/PHASE2.md).

## Reka bentuk premium

Antaramuka menggunakan rujukan portal terkini yang dibekalkan pengguna, tema malam biru/cyan/hijau dengan aksen emas, nama **Majlis Bandaraya Seberang Perai** dan logo rasmi MBSP daripada fail asal yang dimuat naik pengguna. Rujuk [asal aset, had foto konsep dan semakan visual](docs/UI-DESIGN.md).

## Akaun pemohon Fasa 2A

Pendaftaran `/daftar` memerlukan nama, nombor pengenalan unik, telefon, e-mel, kata laluan dan consent. Pengaktifan e-mel, login/logout, pemulihan kata laluan, dashboard profil, pelbagai syarikat serta jemputan wakil menggunakan API dan PostgreSQL sebenar. Halaman utama dan aset diluluskan tidak berubah.

Selepas mendapatkan kod ini, jalankan `npm run db:generate`, `npm run db:migrate` dan `npm run db:test:migrate`. `IDENTITY_DATA_KEY` mesti diisi dengan kunci baharu berasingan daripada MFA (32 bait hex); simpan secara selamat dan jangan tukar setelah identiti direkodkan. Tanpa kunci sah pendaftaran ditolak 503. Konfigurasi SMTP produksi masih perlu dibuat ICT; aliran e-mel diuji melalui Mailpit tempatan sahaja. Lihat [skop, cara penggunaan dan screenshot Fasa 2A](docs/PHASE2A.md).
