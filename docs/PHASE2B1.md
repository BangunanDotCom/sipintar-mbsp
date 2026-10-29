# STAYLink MBSP Fasa 2B.1 — Permulaan permohonan PPTT

## Fungsi tersedia

- Pautan **Permohonan Baharu** menuju `/permohonan/baharu`. Tanpa sesi, portal mengarah ke login dan kembali selepas login. Resume terus menggunakan `/permohonan/draf/:id` juga dikekalkan selepas login. Destinasi login menggunakan allowlist, bukan URL luar daripada input pengguna.
- Pemohon aktif dengan e-mel disahkan, peranan berkuat kuasa dan pengenalan lengkap boleh memilih individu atas kapasiti sendiri atau wakil syarikat. Peranan pemohon dipilih apabila perlu untuk aliran ini; akaun pegawai tidak mendapat akses draf pemohon melalui peranan pegawai.
- Individu: nama, e-mel, telefon dan pengenalan bertopeng daripada profil backend. Syarikat: nama, SSM, alamat, telefon/e-mel serta identiti/jenis kuasa wakil daripada rekod backend. Pilihan syarikat terhad kepada hubungan perwakilan belum dibatalkan, sudah bermula, belum tamat dan profil syarikat ACTIVE.
- Hubungan UNVERIFIED/DOCUMENT_UPDATE_REQUIRED yang masih sah boleh menyediakan draf; ini **tidak** memberi pengesahan rasmi dokumen MBSP. Semakan rasmi kekal pada fasa permohonan seterusnya.
- Pengguna boleh menyimpan kapasiti dan catatan pilihan sehingga 2,000 aksara, kemudian menyambung melalui senarai draf (50 terkini) pada halaman draf atau dashboard. Fail PDF syarikat sedia ada dikekalkan dalam modul profil, bukan disalin ke draf.
- `initiatedByUserId` dan snapshot pengguna yang memulakan kekal; individu rasmi direkod melalui `officialApplicantUserId`, atau syarikat rasmi melalui `companyId`, bersama snapshot pemohon/wakil yang diambil di server. Pelanggan tidak boleh menetapkan identiti, status atau snapshot sendiri.
- Maklumat profil semasa dipratonton apabila draf dibuka dan snapshot pemohon/wakil disegarkan apabila disimpan semula. Snapshot pengguna yang memulakan tidak ditukar. UI turut menunjukkan nama pemohon yang tersimpan dan masa simpanan terakhir.
- Hanya pemilik asal boleh melihat/mengemas kini draf. Wakil lain syarikat sama dan ICT tidak diberi akses. Kebenaran syarikat dinilai semula ketika buka/simpan; draf dengan kuasa tamat/dibatalkan/belum bermula atau syarikat tidak aktif disembunyikan dan tidak boleh dibuka/disimpan sehingga kuasa dipulihkan secara sah. Rekod tidak dipadam.
- Semakan versi menghalang simpanan tab lama menimpa perubahan terkini (409). Penciptaan, simpanan dan sambungan draf diaudit dengan actor sebenar, tanpa kandungan catatan atau pengenalan penuh dalam metadata audit.

## Tiada penghantaran rasmi

Status database dihadkan kepada DRAFT. Tiada nombor rujukan rasmi, timestamp penghantaran, penerimaan rasmi atau rekod kes pegawai dijana. Butang hantar dinyahaktifkan; percubaan terus ke API submit ditolak 409 bagi pemilik sah. UUID draf ialah ID dalaman sahaja dan bukan nombor rujukan MBSP. Butiran premis, muat naik dokumen permohonan dan workflow penghantaran belum dibina.

## Migrasi dan konfigurasi

Migrasi tambahan `202610290003_application_drafts` menambah jadual `application_drafts`, index pemilik/masa, FK, kekangan kapasiti/status/versi dan permission `applications.draft` bagi PEMOHON/WAKIL_SYARIKAT. Jumlah jadual teras kini 24. Tiada migrasi lama atau struktur modul Fasa 2A diubah.

```bash
npm run db:generate
npm run db:migrate
# Pada database ujian berasingan sahaja:
npm run db:test:migrate
```

PostgreSQL serta `IDENTITY_DATA_KEY`, kunci MFA dan SMTP yang sah daripada Fasa 2A masih diperlukan. Jangan jana semula kunci sedia ada. Fasa ini tiada rahsia baharu. Penggunaan production masih memerlukan migrasi, origin/domain HTTPS dan SMTP diluluskan ICT; pengujian e-mel menggunakan Mailpit tempatan. Tiada Cloudflare deployment atau perubahan Worker dilakukan.

## Keputusan ujian

Lint, typecheck, build, **67 ujian unit/API (56 API, 11 unit)** dan **8 aliran pelayar** lulus. Ujian tambahan meliputi login-return/deep-link, autofill individu/syarikat, simpan/sambung selepas reload, PostgreSQL sebenar, identiti pemula berasingan, isolasi antara pemilik dan wakil syarikat sama, CSRF, spoofing input, kuasa luput/dibatalkan/belum bermula, syarikat tidak aktif, simpanan serentak, audit dan penolakan penghantaran pada API/database.

Semakan lebar 320, 390, 768, 1024 dan 1440 piksel dilakukan pada ruang draf syarikat. Semua data ialah sintetik bertanda DATA UJIAN dan `example.test`. Fixture dua aliran draf mencipta akaun e-mel disahkan secara terkawal; aliran pengesahan e-mel sebenar tetap diliputi ujian Fasa 2A dengan Mailpit. Aliran draf individu menggunakan login sebenar; fixture sesi syarikat mengelakkan pengulangan login melebihi had kadar semasa suite. Had kadar keselamatan aplikasi tidak dilonggarkan.

Reka bentuk/logo/CSS asal halaman utama dikekalkan. Hanya destinasi pautan Permohonan Baharu berubah. Screenshot halaman utama desktop/telefon disahkan byte-identik dengan screenshot diluluskan.

| Screenshot draf syarikat tersimpan | Pautan |
|---|---|
| Desktop | [PNG desktop](screenshots/phase2b1-draft-desktop.png) |
| Telefon | [PNG telefon](screenshots/phase2b1-draft-mobile.png) |

Keputusan ini ialah pengujian pembangunan; konfigurasi production, UAT dan pengesahan rasmi dokumen tidak dianggap selesai.

Suite pelayar menunggu baki kuota API mencukupi sebelum dua aliran draf tambahan, menggunakan header had kadar sebenar. Had 120/minit dan had pengesahan asal tidak dilonggarkan. Gunakan instance pembangunan baharu bagi setiap suite penuh untuk mengasingkan tetingkap had login 15 minit.

## Sambungan selepas revisi ini

Maklumat premis agregat kini dibina dalam [Fasa 2B.2](PHASE2B2.md). Seterusnya pada bahagian pemohon menyimpan dan membuka premis; catatan premis belum tersedia di atas menerangkan keadaan sejarah Fasa 2B.1. Penghantaran rasmi kekal belum tersedia.
