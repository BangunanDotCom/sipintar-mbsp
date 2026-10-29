# Pengujian dan keputusan sebenar

Tarikh: **29 Oktober 2026**, waktu paparan pengguna Malaysia. Runtime yang digunakan: Node.js 24.19, PostgreSQL 16 dalam container tempatan, Mailpit 1.27 dan Chromium `/usr/bin/chromium`.

## Keputusan

| Pemeriksaan | Keputusan |
|---|---|
| Penjanaan klien Prisma JS/adapter PostgreSQL | Lulus |
| Migrasi PostgreSQL pembangunan dan database ujian | Lulus |
| Seed peranan, permission, daerah, jabatan dan kategori | Lulus |
| ESLint | Lulus |
| TypeScript `tsc --noEmit` | Lulus |
| Vitest unit dan API | **53/53 lulus** (44 API, 9 unit) |
| Playwright aliran pelayar | **6/6 lulus** |
| Binaan frontend produksi | Lulus |
| Bootstrap pentadbir pertama pada database baharu | Berjaya; percubaan kedua ditolak |
| Semakan visual desktop 1440px dan telefon 390px | Dilakukan; tiada overflow mendatar pada aliran diuji |

## Liputan unit/API

Validasi kata laluan dan consent, normalisasi/pendua SSM, nombor SSM tidak sah, pelantikan tamat/belum bermula, pemisahan tugas, kesihatan API, akses tanpa sesi, pendaftaran serta SMTP sebenar, token pengesahan sekali guna, cookie keselamatan, CSRF, penolakan pegawai awam, jemputan/pengaktifan pegawai, QR/TOTP/recovery codes, penggunaan semula kod, role switch/forgery, enkripsi faktor, IDOR syarikat/PDF, validasi fail, empty state sebenar, skop daerah, resolver PIC, penugasan semula serentak, permission templat, versi dan arkib templat, skop/sejarah konfigurasi, audit tanpa hash rahsia, isolasi notifikasi, penggantungan sesi, token luput, pemulihan kata laluan dan revokasi sesi, mesej pemulihan generik, sekatan PIC tanpa lokasi, perlindungan pentadbir daripada perubahan sendiri dan rate limit 429.

## Aliran Playwright

1. Portal desktop, navigasi, FAQ dan status modul belum tersedia.
2. Telefon 390px, menu, navigasi borang dan semakan overflow mendatar.
3. Daftar individu → ambil e-mel daripada Mailpit → aktifkan → login → pilih peranan → cipta syarikat → semak status belum disahkan → logout.
4. Jemput pegawai melalui API ICT → pautan e-mel → tetapkan kata laluan → login → daftar QR → TOTP sebenar → simpan recovery codes → pilih peranan → dashboard PIC.

Fixture ICT bagi ujian keempat diwujudkan terus dalam database pembangunan, kemudian jemputan sebenar menggunakan API berkuasa. Ujian bootstrap berasingan mengesahkan cara penciptaan pentadbir pertama. Tiada fixture atau kata laluan ujian digunakan sebagai akaun produksi.

## Menjalankan semula

```bash
npm run db:generate
npm run db:migrate
npm run db:test:migrate
npm run db:seed
npm run lint
npm run typecheck
npm test
npm run build
# Terminal pertama: npm run dev
# Terminal kedua:
npm run test:e2e
```

Vitest memerlukan `TEST_DATABASE_URL` ke database berasingan berakhir `_test`; ia tidak menggunakan `DATABASE_URL` pembangunan. Ujian menghasilkan data sintetik bertanda **DATA UJIAN**; database ujian boleh dibuang mengikut polisi tempatan. Mailpit mesti tersedia pada SMTP 1025 dan HTTP 8025.

Playwright menggunakan instance pembangunan aktif pada localhost:5173 dengan API 3001; ia menyimpan data sintetik dalam database instance tersebut. Jangan menjalankannya pada produksi. Untuk mesin lain, pasang Chromium/Playwright yang sesuai dan tetapkan `CHROMIUM_PATH`; laluan Linux semasa bukan andaian deployment MBSP.

## Batas keputusan

Ini ujian pembangunan pada satu instance. Tiada pentest bebas, load test, high availability, ujian restore produksi, integrasi rasmi MBSP atau UAT pengguna sebenar dilakukan. Peringatan deprecation Fastify dan anotasi build dependency tidak menggagalkan pemeriksaan; ia perlu dipantau semasa naik taraf. Ujian ini tidak membuktikan semua keperluan penerimaan Fasa 1 sudah dipenuhi; lihat STATUS.md.

## Semakan selepas naik taraf visual

Lint, typecheck, 42 ujian Vitest, 4 aliran Playwright dan binaan frontend lulus. Semakan tambahan lebar 320, 390, 768, 1024 dan 1440 piksel mendapati semua gambar dimuatkan, tanpa ralat JavaScript atau limpahan mendatar. Screenshot akhir: desktop 1440 × 3692 dan telefon 390 × 4677 piksel. Lihat `verification.json` dan `UI-DESIGN.md` untuk butiran revisi dan asal aset.

## Pemuktamadan identiti visual yang diluluskan

Lint, typecheck, 42 ujian unit/API, build dan 4 aliran pelayar lulus selepas perubahan akhir. Semakan responsive meliputi 11 lebar antara 320 dan 1920 piksel, termasuk tablet dan sempadan breakpoint 600/601. Menu telefon menyokong Escape dan fokus kembali; tiga butang utama disahkan menuju pendaftaran, halaman pembangunan status dan login. Semua imej dimuatkan, tanpa overflow/ralat JavaScript. Reduced motion menghentikan semua animasi; slot logo rasmi tanpa aset sah kekal statik. Logo emas STAYLink dan panorama disahkan tidak berubah.

## Pemasangan logo rasmi MBSP

Selepas pemasangan fail asal pengguna, lint, typecheck, 42 ujian unit/API, build dan 4 ujian pelayar lulus. Semakan 7 lebar skrin (320–1440 piksel) mengesahkan imej lengkap, object-fit contain, tanpa placeholder/overflow/ralat JavaScript. Byte imej yang dihantar kepada browser sepadan fail asal. Reduced motion dan jeda penuding disahkan; screenshot baharu menunjukkan logo menghadap hadapan.

## Keputusan Fasa 2A semasa

Migrasi tambahan telah diterapkan pada PostgreSQL pembangunan dan database ujian, codegen, lint, typecheck dan build lulus. **53 ujian unit/API (44 API + 9 unit)** dan **6 aliran Playwright** lulus. Catatan 42/4 di bahagian revisi visual terdahulu ialah keputusan sejarah sebelum modul ini.

Tambahan API menguji normalisasi/pendua pengenalan termasuk pendaftaran serentak, enkripsi dan respons bertopeng, kunci identiti tiada (503 tanpa akaun baharu), pelengkapan pengenalan akaun lama sekali dengan kata laluan, beberapa syarikat, SSM unik, jemputan/persetujuan satu guna termasuk penerimaan serentak, penerima salah, token luput, pemberi kuasa REVOKED, isolasi syarikat/PDF, serta penolakan wakil luput dan e-mel belum disahkan. Senarai syarikat/dashboard juga menapis perwakilan REVOKED, tamat atau belum bermula; diuji bersama sekatan PDF/tindakan.

Aliran pelayar kelima menggunakan dua browser context pemohon: daftar kedua-duanya, sahkan e-mel melalui Mailpit, cipta dua syarikat, muat naik PDF sintetik, jemput wakil, lihat butiran sebelum bersetuju, terima melalui akaun penerima dan muat turun dokumen syarikat berkuasa. Screenshot dashboard desktop/telefon diambil daripada akaun pemohon sintetik ini. Aliran keenam menguji terlupa kata laluan melalui e-mel sebenar Mailpit, penolakan kata laluan lama dan login menggunakan kata laluan baharu. Empat aliran asal termasuk MFA pegawai kekal lulus.

Semakan tambahan halaman daftar pada 320, 390, 768, 1024 dan 1440 piksel menunjukkan tiada overflow mendatar atau ralat JavaScript. Kedua-dua CTA halaman utama membuka `/daftar`; screenshot halaman utama desktop 1440 dan telefon 390 adalah byte-identik dengan screenshot diluluskan. Aset/logo/CSS halaman utama tidak berubah. Semua identiti, telefon, SSM dan dokumen ujian ialah sintetik; tiada data sebenar pengguna digunakan.

Screenshot PNG sebenar: [daftar desktop](screenshots/phase2a-registration-desktop.png), [daftar telefon](screenshots/phase2a-registration-mobile.png), [dashboard desktop](screenshots/phase2a-dashboard-desktop.png), [dashboard telefon](screenshots/phase2a-dashboard-mobile.png). Penghantaran e-mel luar Mailpit, KYC/JPN/SSM, pengesahan rasmi pegawai semasa permohonan dan UAT produksi tidak termasuk keputusan lulus ini.
