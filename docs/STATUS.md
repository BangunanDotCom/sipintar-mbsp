# Status pelaksanaan STAYLink MBSP

Tarikh semakan: 29 Oktober 2026. Projek ini menyediakan asas aplikasi yang boleh dijalankan dan diuji. Ia belum melalui penerimaan ICT/UAT MBSP dan **tidak didakwa sebagai Fasa 1 produksi yang diluluskan**.

## Fungsi yang mempunyai backend dan database

- Portal Bahasa Melayu, reka bentuk responsif, logo STAYLink berdasarkan rujukan pengguna dan identiti warna terpusat.
- Pendaftaran individu, nombor pengenalan unik tersulit/bertopeng, consent, e-mel unik, pengesahan e-mel dan pemulihan kata laluan melalui pautan sekali guna.
- Login, sesi HTTP-only, CSRF, had kadar, perubahan profil/kata laluan serta pembatalan sesi.
- Satu individu mewakili banyak syarikat; banyak wakil bagi satu syarikat; SSM unik dinormalisasi.
- Profil syarikat, status maklumat/perwakilan berasingan, PDF surat kuasa peribadi dan jemputan wakil dengan persetujuan penerima, oleh pengurus profil atau wakil yang disahkan (lihat RBAC).
- Jemputan pegawai oleh ICT sahaja, pengaktifan, pelbagai pelantikan dengan skop/tarikh, penggantungan, pembatalan pelantikan dan pemulihan MFA.
- TOTP sebenar, QR, recovery codes sekali guna, penolakan kod berulang dan penguatkuasaan MFA pegawai dalam backend.
- Sebelas peranan, role switcher, semakan pelantikan aktif dan permission database pada setiap tindakan berkuasa.
- Dashboard pemohon, PIC, PPSK, jabatan teknikal serta pentadbir mengikut kuasa; rekod permohonan kosong, bukan statistik rekaan.
- Master SPU/SPT/SPS, cipta kawasan, senarai PIC aktif, penugasan semula dengan sebab/sejarah, resolver tanpa agihan rawak.
- Daftar semua kategori templat, versi immutable dan pengaktifan format induk oleh Pentadbir Templat.
- Daftar konfigurasi teknikal/operasi berasingan dengan sejarah versi.
- Pusat notifikasi, tanda dibaca, SMTP ujian, log penghantaran/failure dan command retry.
- Audit aktiviti penting dan paparan terhad mengikut kuasa.
- PostgreSQL sebenar, 25 jadual teras, SQL migrasi, seed master data, seed demonstrasi pilihan serta OpenAPI.
- Ujian unit, API dengan database berasingan, dan Playwright pada Chromium sebenar.

## Batas Fasa 1 yang masih memerlukan kerja

- Tuntutan SSM sedia ada/penyelesaian pertindihan memerlukan bantuan manusia. Tiada workflow tiket pertindihan lengkap.
- UI belum menyediakan tamat/revokasi wakil syarikat, pengurusan tarikh sah dokumen, pengubahsuaian sempadan kawasan atau pagination besar. Tarikh sah dokumen disokong dalam API.
- PIC berskop daerah tidak boleh mengesahkan dokumen syarikat global tanpa pautan lokasi permohonan. Pengesahan awal hanya untuk PIC dengan pelantikan seluruh daerah; tiada kuasa itu diberi kepada PTD/kaunter atau ICT.
- Skop jabatan disimpan dan dashboard teknikal disediakan; tiada rujukan kes teknikal untuk menguji aliran ulasan jabatan penuh.
- Konfigurasi ialah daftar berversi; mengubah nilai tidak secara automatik menukar SLA/aliran proses yang belum dilaksanakan.
- Worker retry SMTP, cleanup token/sesi dan pemantauan memerlukan scheduler operasi. Pemulihan outbox `SENDING` selepas proses terhenti belum automatik.
- SSO mempunyai kontrak interface sahaja; authentication sedia ada masih local-session.
- Nota deployment Windows/IIS disediakan tetapi tidak diuji pada pelayan MBSP. Ujian beban, pentest, accessibility audit formal dan UAT belum dijalankan.
- Pengukuhan audit append-only di database, putaran kunci, quarantine/antivirus fail, retention dan polisi privasi rasmi memerlukan semakan ICT.
- Prisma codegen menggunakan API dalaman yang dipin kerana domain native engine disekat; naik taraf memerlukan semakan. Migrasi menggunakan runner SQL projek, bukan Prisma Migrate CLI.

## Fungsi Fasa 2 yang belum dibina

Penghantaran permohonan/premis/aras dan UUID penghantaran, rujukan rasmi MBSP, pembetulan, AI Pre-Check, bil/MBSPPay, GIS, rujukan/ulasan teknikal serentak, KP-PPTT, mesyuarat/keputusan mengikut skop, penjanaan DOCX/PDF, tandatangan, penutupan/arkib dan WhatsApp.

Semua menu berkaitan menunjukkan **Akan Tersedia Dalam Fasa Seterusnya**. Tiada integrasi rasmi atau kelulusan perniagaan simulasi dipersembahkan sebagai selesai.

Naik taraf visual terkini dan status aset jata/panorama: lihat [UI-DESIGN.md](UI-DESIGN.md).

Pemuktamadan visual: identiti emas/bumbung dan panorama malam yang diluluskan dikekalkan. Halaman utama tidak diubah dalam Fasa 2A; Daftar Sekarang membuka pendaftaran akaun; Permohonan Baharu kini membuka penyediaan draf Fasa 2B.1 dengan login-return. Modul penghantaran rasmi kekal belum tersedia.

Logo rasmi MBSP kini dipasang daripada `apps/web/public/assets/logo mbsp-png.png` yang dimuat naik pengguna. Fail asal dan ketelusannya dikekalkan; tiada reka bentuk semula atau penjanaan logo.

## Fasa 2A — modul akaun pemohon

Pendaftaran dengan pengenalan unik, aktivasi e-mel, login/logout, pemulihan kata laluan, dashboard profil/status, beberapa syarikat berasingan, surat kuasa PDF dan jemputan wakil berasaskan persetujuan telah diuji menggunakan PostgreSQL, Mailpit dan browser sebenar. Halaman utama desktop/telefon sepadan byte screenshot terdahulu. Lihat [PHASE2A.md](PHASE2A.md) dan [TESTING.md](TESTING.md).

Persekitaran lain memerlukan migrasi tambahan, `IDENTITY_DATA_KEY` stabil dan SMTP diluluskan. SMTP produksi/JPN/SSM tidak diuji atau disambungkan. Nombor pengenalan ialah pengisytiharan pengguna, bukan KYC. Pengesahan rasmi dokumen/surat kuasa semasa semakan awal permohonan kekal tugasan pegawai; modul penghantaran permohonan belum dibina. Akaun/profil syarikat lama memerlukan pelengkapan identiti/semakan kuasa yang sah seperti OPERATIONS.md.

## Fasa 2B.1 — draf permohonan PPTT

Pilihan kapasiti individu/syarikat, autofill profil sebenar, identiti pemula berasingan, simpan/sambung PostgreSQL, senarai draf dashboard, pemeriksaan pemilikan/kuasa semasa, kawalan versi serentak dan audit telah dibina. 67 unit/API serta 8 aliran pelayar lulus. [Skop dan screenshot](PHASE2B1.md).

Rekod draf bukan penghantaran rasmi. Tiada butiran premis, nombor rujukan, penerimaan rasmi atau kes pegawai dicipta. Senarai `applications` pada API dashboard kekal untuk penghantaran masa depan; draf sebenar dibaca melalui endpoint `application-drafts`. Konfigurasi production, pengesahan dokumen dan UAT kekal pending.

## Fasa 2B.2 — maklumat premis

Lokasi/daerah diisytiharkan, pin koordinat automatik, bangunan agregat, CCC/CFO/OC, simpan separa/lengkap, Sebelumnya/Seterusnya dan semakan draf telah disambungkan ke PostgreSQL serta kawalan pemilik/audit/versi yang sama. 83 unit/API dan 10 aliran pelayar lulus. Tiada penghantaran rasmi atau kelulusan.

**PENDING:** jubin OSM tidak boleh dicapai dalam rangkaian Codex (HTTP CONNECT 403), jadi screenshot menunjukkan grid/amaran sebenar. Enjin pin/koordinat diuji; penghantaran peta asas sebenar belum berjaya diuji. Tiada data GIS rasmi MBSP untuk mengesahkan sempadan. Lihat [skop, batas dan screenshot](PHASE2B2.md). Catatan terdahulu tentang premis belum dibina ialah sejarah sebelum revisi ini; agregat premis kini tersedia, penghantaran rasmi/rekod unit atau aras terperinci belum tersedia.

## Pembetulan peta — 30 Oktober 2026

Sumber utama HTTPS OSM dikekalkan; fallback OpenFreeMap, status pemuatan semasa, timeout/retry terhad dan cleanup layer/renderer telah diuji. Konfigurasi frontend kini mempunyai template sendiri dalam apps/web/.env.example. 91 unit/API dan 15 pelayar lulus tanpa perubahan backend/login/Simpan Draf.

**PENDING sebenar:** Codex menyekat kedua-dua penyedia melalui CONNECT 403. Jalan/bangunan/nama lokasi dan Chrome luar belum disahkan. Screenshot terkini menunjukkan grid/amaran sebenar, bukan peta simulasi. [Laporan lengkap](MAP-FIX.md).
