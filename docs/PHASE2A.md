# STAYLink MBSP Fasa 2A — Akaun pemohon

## Skop yang berfungsi

Butang **Permohonan Baharu** dan **Daftar Sekarang** membuka `/daftar`. Borang nama, pengenalan MyKad/pasport, telefon, e-mel, kata laluan dan consent menggunakan backend Fastify serta PostgreSQL sedia ada. Akaun diaktifkan selepas pengesahan e-mel. Login, logout dan pemulihan kata laluan menggunakan sesi/token sebenar; kawalan MFA pegawai serta RBAC dikekalkan.

Satu pengenalan dan satu e-mel dinormalisasi hanya boleh digunakan satu akaun. Database menguatkuasakan keunikan, termasuk permintaan serentak. Pengenalan disimpan AES-256-GCM dengan HMAC keyed bagi carian pendua; UI hanya memaparkan empat aksara terakhir. Nombor ialah pengisytiharan pengguna dan belum disahkan JPN/SSM. Akaun lama melengkapkannya sekali dengan kata laluan semasa tanpa identiti rekaan.

Pemohon boleh mencipta beberapa profil syarikat berasingan dengan nama, SSM, alamat, telefon/e-mel, jenis kuasa dan PDF surat kuasa. SSM unik menghalang profil pendua; tiada pengambilalihan syarikat sedia ada secara automatik. Pencipta profil boleh menjemput pemohon berdaftar yang telah mengesahkan e-mel. Penerima perlu login sebagai diri sendiri, melihat nama/SSM syarikat dan bersetuju melalui pautan sekali guna 24 jam. Penerimaan menambah hubungan UNVERIFIED, tanpa kuasa pengurus jemputan.

Dashboard memaparkan profil individu, pengenalan bertopeng, status e-mel, syarikat yang diwakili dan status perwakilan. PDF kekal peribadi untuk wakil berkuasa. Pengesahan rasmi maklumat/dokumen/surat kuasa tidak diberi secara automatik; pegawai MBSP membuat semakan rasmi pada peringkat permohonan. Modul penghantaran permohonan belum dibina.

## Konfigurasi dan operasi

1. Sediakan `IDENTITY_DATA_KEY` bebas 32 bait hex melalui secret manager (contoh penjanaan: `openssl rand -hex 32`). Jangan kongsi nilainya, commit `.env`, tukar atau jana semula ketika restart. Kekalkan backup terhad; putaran memerlukan re-encryption dan indeks semula terkawal. Kunci MFA sedia ada tidak ditukar.
2. Jalankan `npm run db:generate`, `npm run db:migrate`, dan `npm run db:test:migrate` bagi database ujian berasingan. Migrasi `202610290002_applicant_accounts` menambah medan/jadual tanpa memadam data lama atau menaikkan kuasa lama secara automatik.
3. Konfigurasi SMTP diluluskan ICT sebelum menghantar e-mel sebenar. Mailpit tempatan digunakan dalam pengujian; domain/origin sebenar, TLS dan kelayakan produksi belum disahkan. Outbox/retry sedia ada dikekalkan.
4. Akaun lama perlu lengkapkan pengenalan dalam Profil saya sebelum mencipta syarikat baharu/menerima jemputan. Profil syarikat lama yang belum disahkan dan tiada pengurus memerlukan semakan kuasa manusia, bukan pemberian hak secara pukal. Pendua SSM/pembetulan pengenalan menggunakan bantuan manusia mengikut SOP.

Tiada JPN/SSM API, KYC rasmi, tuntutan SSM kendiri, UI revokasi wakil atau penjadual retry produksi baharu disediakan. Tiada Cloudflare deployment, perubahan Worker, merge PR atau perubahan branch main dilakukan.

## Semakan sebenar

Lint, typecheck, 53 ujian unit/API, build dan 6 aliran Playwright lulus. Ujian melibatkan PostgreSQL sebenar, e-mel Mailpit, token, MFA, dua pemohon, dua syarikat, PDF, persetujuan wakil dan pemulihan kata laluan. Semakan lebar 320–1440 piksel tiada overflow/ralat JavaScript. Semua data ujian sintetik. Ujian ini belum menggantikan UAT/semakan keselamatan produksi.

Halaman utama, logo rasmi MBSP, logo emas STAYLink, panorama malam, CSS dan animasi diluluskan tidak diubah. Screenshot utama desktop/telefon sepadan byte dengan versi sebelum Fasa 2A.

| Paparan | Desktop | Telefon |
|---|---|---|
| Pendaftaran | [PNG desktop](screenshots/phase2a-registration-desktop.png) | [PNG telefon](screenshots/phase2a-registration-mobile.png) |
| Dashboard pemohon | [PNG desktop](screenshots/phase2a-dashboard-desktop.png) | [PNG telefon](screenshots/phase2a-dashboard-mobile.png) |

Rujuk [ujian](TESTING.md), [API](API.md), [keselamatan](SECURITY.md), [RBAC](RBAC.md) dan [operasi](OPERATIONS.md) untuk batas terperinci.
