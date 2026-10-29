# Panduan API

OpenAPI JSON: `docs/openapi.json`, dihasilkan daripada Fastify menggunakan `npx tsx scripts/export-openapi.ts`. UI semasa: `/api/docs`; JSON runtime: `/api/docs/json`.

## Sesi dan CSRF

1. `POST /api/auth/login` dengan `{email,password}` mengembalikan `csrf`, `user`, `mfaRequired` dan cookie HTTP-only.
2. `GET /api/auth/me` memulangkan identiti selamat, pelantikan semasa, peranan aktif dan token CSRF baharu. Simpan token terbaru di memori frontend.
3. Untuk permintaan mutasi selepas login, hantar cookie, `Origin` sama `APP_ORIGIN`, `X-CSRF-Token`, dan `Content-Type: application/json` hanya apabila ada badan JSON.
4. Pegawai memerlukan `/auth/mfa/setup` dan `/auth/mfa/verify` sebelum tindakan berkuasa. Setup hanya boleh bagi faktor belum disahkan. Login seterusnya mengesahkan TOTP atau recovery code.
5. `POST /api/auth/role` memilih roleId daripada pelantikan aktif. Backend menilai permission sebenar setiap kali.

## Kumpulan endpoint

| Laluan | Fungsi / kawalan |
|---|---|
| `/api/auth/register`, `/login`, `/activate`, `/recover` | Identiti awam; tidak menerima kuasa pegawai daripada input |
| `/api/auth/me`, `/logout`, `/role`, `/password` | Akaun/sesi sendiri |
| `/api/auth/mfa/setup`, `/verify`, `/recovery` | Faktor TOTP/recovery akaun pegawai sendiri |
| `/api/profile`, `/api/dashboard` | Profil dan dashboard peranan aktif |
| `/api/public/districts`, `/api/health` | Master daerah / liveness awam |
| `/api/companies`, `/:id`, `/:id/representatives`, `/:id/documents` | Hubungan syarikat sendiri yang belum tamat |
| `/api/documents/:id` | Muat turun PDF peribadi wakil syarikat |
| `/api/representations`, `/:id/verify`, `/api/representation-documents/:id` | PIC seluruh daerah; deny jika lokasi belum dapat dipastikan bagi PIC berskop |
| `/api/notifications/:id/read` | Penerima notifikasi sahaja |
| `/api/admin/users`, `/roles`, `/departments`, `/officers` | Pentadbir ICT |
| `/api/admin/users/:id/status`, `/mfa-reset`, `/roles` | Status, pemulihan MFA, pelantikan oleh ICT |
| `/api/admin/appointments/:id` (DELETE) | Tamatkan pelantikan, bukan padam sejarah |
| `/api/areas`, `/pics`, `/assign`, `/:id/resolve` | Master/penugasan mengikut permission dan skop daerah |
| `/api/templates`, `/:id/versions`, `/api/template-versions/:id/activate` | Pentadbir Templat |
| `/api/config/:scope` | `technical` untuk ICT; `operations` untuk Operasi |
| `/api/audit`, `/api/admin/services` | Audit mengikut kuasa; status servis untuk ICT |

Tiada endpoint yang menghasilkan nombor rujukan MBSP, keputusan AI, keputusan JK atau pengesahan pembayaran dalam versi ini.

## Respons ralat

`{ "message": "Mesej dalam Bahasa Melayu" }`. Status: 400 validasi, 401 sesi/login, 403 kuasa/CSRF/MFA, 404 rekod tidak dapat dicapai, 409 pendua, 429 rate limit, 500 kegagalan dalaman. Rekod silang pengguna tidak mendedahkan kandungan syarikat/dokumen.

Senarai pengguna, audit, notifikasi dan perwakilan dihadkan 50/100 rekod dalam UI asas; pagination lengkap ialah penambahbaikan sebelum skala produksi. Contoh peranan dan skop sah berada dalam matriks RBAC.
