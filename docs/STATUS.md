# Status pelaksanaan STAYLink MBSP

Tarikh semakan: 29 Oktober 2026. Projek ini menyediakan asas aplikasi yang boleh dijalankan dan diuji. Ia belum melalui penerimaan ICT/UAT MBSP dan **tidak didakwa sebagai Fasa 1 produksi yang diluluskan**.

## Fungsi yang mempunyai backend dan database

- Portal Bahasa Melayu, reka bentuk responsif, logo STAYLink asal dan identiti warna terpusat.
- Pendaftaran individu, consent, e-mel unik, pengesahan e-mel dan pemulihan kata laluan melalui pautan sekali guna.
- Login, sesi HTTP-only, CSRF, had kadar, perubahan profil/kata laluan serta pembatalan sesi.
- Satu individu mewakili banyak syarikat; banyak wakil bagi satu syarikat; SSM unik dinormalisasi.
- Profil syarikat, status maklumat/perwakilan berasingan, PDF surat kuasa peribadi dan penambahan wakil oleh wakil yang disahkan.
- Jemputan pegawai oleh ICT sahaja, pengaktifan, pelbagai pelantikan dengan skop/tarikh, penggantungan, pembatalan pelantikan dan pemulihan MFA.
- TOTP sebenar, QR, recovery codes sekali guna, penolakan kod berulang dan penguatkuasaan MFA pegawai dalam backend.
- Sebelas peranan, role switcher, semakan pelantikan aktif dan permission database pada setiap tindakan berkuasa.
- Dashboard pemohon, PIC, PPSK, jabatan teknikal serta pentadbir mengikut kuasa; rekod permohonan kosong, bukan statistik rekaan.
- Master SPU/SPT/SPS, cipta kawasan, senarai PIC aktif, penugasan semula dengan sebab/sejarah, resolver tanpa agihan rawak.
- Daftar semua kategori templat, versi immutable dan pengaktifan format induk oleh Pentadbir Templat.
- Daftar konfigurasi teknikal/operasi berasingan dengan sejarah versi.
- Pusat notifikasi, tanda dibaca, SMTP ujian, log penghantaran/failure dan command retry.
- Audit aktiviti penting dan paparan terhad mengikut kuasa.
- PostgreSQL sebenar, 22 jadual teras, SQL migrasi, seed master data, seed demonstrasi pilihan serta OpenAPI.
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

Permohonan/premis/aras dan UUID penghantaran, rujukan rasmi MBSP, pembetulan, AI Pre-Check, bil/MBSPPay, GIS, rujukan/ulasan teknikal serentak, KP-PPTT, mesyuarat/keputusan mengikut skop, penjanaan DOCX/PDF, tandatangan, penutupan/arkib dan WhatsApp.

Semua menu berkaitan menunjukkan **Akan Tersedia Dalam Fasa Seterusnya**. Tiada integrasi rasmi atau kelulusan perniagaan simulasi dipersembahkan sebagai selesai.
