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

## Akaun pemohon Fasa 2A

- `POST /api/auth/register`: `{name, identificationNumber, phone, email, password, consent:true}`; pengenalan diwajibkan, e-mel dan HMAC pengenalan unik. Token aktivasi hanya melalui e-mel. Kunci identiti tiada/tidak sah: 503.
- `POST /api/profile/identification`: `{identificationNumber,currentPassword}`; pemohon sedia ada yang belum mempunyai pengenalan, sekali sahaja. Respons nombor bertopeng; duplicate: 409.
- `GET /api/auth/me`, `PATCH /api/profile`: hanya `identificationMasked`; tiada nombor penuh, ciphertext atau HMAC dalam DTO pengguna.
- `GET /api/companies/:id/representatives`: ahli syarikat sah sahaja; nama, status, jenis kuasa dan tarikh.
- `POST /api/companies/:id/invitations`: `{email,authorityType,endsAt?}`; pengurus profil atau wakil VERIFIED; penerima ialah pemohon aktif/e-mel disahkan. E-mel pautan 24 jam; respons tidak mendedahkan token.
- `POST /api/company-invitations/preview`: `{token}`; penerima yang login sahaja. Nama/SSM/jenis kuasa untuk persetujuan.
- `POST /api/company-invitations/accept`: `{token}`; penerima yang login, pengenalan lengkap, token sah. Tuntutan token + perwakilan UNVERIFIED secara transaksi; tiada kuasa pengurus diberikan.
- `POST /api/companies/:id/representatives` lama kini mengembalikan 409 untuk ahli sah dengan arahan menggunakan jemputan. Tiada penambahan tanpa persetujuan penerima.

Mutasi/preview memerlukan sesi dan CSRF seperti endpoint sesi lain. Semakan penciptaan syarikat/menerima jemputan memerlukan pengenalan lengkap; SSM sedia ada mengembalikan 409 tanpa menghubungkan pemohon secara automatik. OpenAPI dijana semula bersama perubahan ini.

## Draf PPTT Fasa 2B.1

Semua endpoint berikut memerlukan pemohon aktif, e-mel disahkan, pengenalan lengkap, peranan semasa dan permission database `applications.draft`. Mutasi memerlukan Origin/CSRF. Status draf tidak boleh ditetapkan pelanggan.

| Endpoint | Kontrak |
|---|---|
| `GET /api/application-drafts/context` | Profil individu bertopeng, pengguna yang memulakan, senarai syarikat/wakil yang sah dan `submissionEnabled:false` |
| `GET /api/application-drafts` | 50 draf terkini milik sendiri, ditapis mengikut kebenaran syarikat semasa |
| `POST /api/application-drafts` | `{capacity:"INDIVIDUAL",notes?}` atau `{capacity:"COMPANY",companyId,notes?}`; status 201, snapshot diambil server |
| `GET /api/application-drafts/:id` | Buka/sambung draf sendiri; audit sambungan; 404 bagi bukan pemilik/kuasa syarikat tidak sah |
| `PATCH /api/application-drafts/:id` | Badan seperti POST, tambah `version` integer positif; versi lapuk 409; snapshot semasa disegarkan |
| `POST /api/application-drafts/:id/submit` | Penghantaran tidak disediakan: 409 bagi pemilik sah, 404 bagi bukan pemilik |

`notes` maksimum 2,000 aksara. Badan strict menolak medan tambahan seperti owner/status/snapshot; companyId tidak dibenarkan bagi kapasiti individu. Sesi/permission/pengenalan tidak sah ditolak sebelum menyimpan. ID draf ialah UUID dalaman, bukan rujukan rasmi MBSP. Lihat PHASE2B1.md untuk pemilikan dan status perwakilan.

## Maklumat premis Fasa 2B.2

- `GET /api/application-drafts/:id/premises`: pemilik asal dengan permission `applications.draft` dan kuasa syarikat semasa; memulangkan `{draftId,version,status,applicant,premises,complete,locationSource,boundaryStatus,updatedAt,submissionEnabled:false}`. Bahagian belum pernah disimpan memulangkan semua medan NULL dan tidak mencipta rekod rekaan.
- `PUT /api/application-drafts/:id/premises`: `{version,action:"SAVE"|"CONTINUE",premises:{...}}`. `action` lalai SAVE. Semua 17 medan `premises` diperlukan dalam badan, tetapi nullable untuk draf separa. CONTINUE mewajibkan medan asas/pin lengkap dan nombor sijil jika CCC/CFO/OC dipilih. Baca OpenAPI untuk nama dan had tepat.

CSRF/Origin, verified email, pengenalan dan permission peranan aktif diwajibkan. Satu versi dikongsi bahagian pemohon dan premis; konflik 409 tidak menyimpan sebahagian data. 404 bagi bukan pemilik/kuasa syarikat tidak sah; 400 bagi validasi. Data lokasi/sijil/owner/status GIS tambahan ditolak jika di luar schema. `complete` menandakan kelengkapan medan sahaja; bukan pengesahan MBSP atau penghantaran. Tiada API geocoding/sempadan GIS atau penghantaran rasmi baharu.
