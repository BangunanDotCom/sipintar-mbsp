# STAYLink MBSP — Handover JTIK untuk Demo Release 1.0

> **Status:** dokumen persediaan teknikal; **bukan** arahan deploy, kelulusan JTIK, bukti UAT atau pengesahan produksi. Rujuk Issue #62, `docs/DEPLOYMENT.md`, `docs/ict-handover/GUIDED-INTERNAL-UAT.md`, dan `docs/ict-handover/GUIDED-UAT-ACCEPTANCE.md`.

## Keputusan yang perlu diperoleh daripada JTIK
- [ ] Pilih VM/host terasing: **Linux (cadangan)** atau Windows Server/IIS (alternatif); rekod versi OS, pemilik aset dan pengendali.
- [ ] Sahkan kapasiti CPU/RAM/storan serta bilangan **pengguna serentak**; 20–30 akaun latihan bukan ukuran kapasiti serentak yang telah diuji.
- [ ] Tentukan nama DNS dalaman, sijil HTTPS, rangkaian MBSP/VPN, port/firewall dan kaedah reverse proxy.
- [ ] Sahkan lokasi PostgreSQL **latihan sahaja**, backup/restore, log, pemantauan dan tempoh pemadaman data latihan.
- [ ] Sahkan pemilik operasi, jadual perubahan, akses pentadbir, pengurusan secrets dan siapa meluluskan pemasangan.
- [ ] Sahkan sama ada capaian peta OSM/OpenFreeMap dibenarkan oleh firewall/CSP; fallback peta bukan bukti peta sebenar berfungsi.

## Topologi cadangan (bukan konfigurasi pelayan MBSP yang sudah tersedia)
Browser pegawai MBSP → HTTPS + DNS dalaman → Nginx (Linux) / IIS (Windows) menyajikan `apps/web/dist` dan proksi `/api/*` → Fastify pada loopback `127.0.0.1:3001` → PostgreSQL **test**. SMTP menggunakan Mailpit atau perkhidmatan e-mel latihan yang tidak menghantar mesej kepada pengguna sebenar.

React SPA memerlukan fallback route kepada `index.html`. Reverse proxy mesti mengekalkan kaedah HTTP, cookie, origin dan header CSRF. Jangan gunakan Vite development server sebagai host demo berbilang pengguna.

## Pemeriksaan wajib sebelum pemasangan
- [ ] Sahkan SHA commit dan cabang sumber, status PR Draft, hasil CI dan keputusan semakan kod. **Jangan gabung `main` secara automatik.**
- [ ] Jalankan lint, typecheck, build, unit, API PostgreSQL latihan, Playwright dan audit; simpan keputusan sebenar.
- [ ] Semak `APP_ORIGIN`, cookie Secure/SameSite, HTTPS, CORS, CSP dan proksi pada host sasaran.
- [ ] Asingkan DB latihan dengan akaun DB keistimewaan minimum; semak nama/URL DB sebelum sebarang migrasi.
- [ ] Bekalkan `MFA_ENCRYPTION_KEY` dan `IDENTITY_DATA_KEY` melalui mekanisme rahsia yang diluluskan; jangan simpan dalam Git.
- [ ] Kekalkan synthetic portal gate; jangan sambungkan MBSPPay, nombor rujukan rasmi, SSO, storan dokumen rasmi atau SMTP produksi.
- [ ] Gunakan akaun latihan individu mengikut peranan; pengendali ICT menyimpan dan menyerahkan kelayakan secara terkawal.
- [ ] Uji backup dan restore pada DB latihan, serta prosedur rollback aplikasi yang serasi dengan skema.
- [ ] Sahkan tiada laluan masuk awam tanpa kebenaran dan tiada laluan rangkaian ke sistem produksi.

## Pelan ujian oleh Jabatan Bangunan
Fasilitator memainkan peranan pemohon individu/syarikat, PIC dan PPSK menggunakan akaun berasingan. Jalankan enam senario berpandu yang didokumenkan: `single-unit`, `multiple-units`, `failed-evidence`, `company-active`, `company-expired`, `district-spt`. Semak jumlah fi **RM50 bagi setiap UUID unit fizikal**, bukan setiap tingkat. Rekod PASS/FAIL/BLOCKED, isu, tahap keutamaan, pembetulan dan retest. Uji Chrome/Edge, telefon sebenar, 320/390px, papan kekunci, MFA dan peta secara nyata; CI tidak menggantikan UAT pegawai.

## Gerbang kelulusan
1. **Sekarang:** pembangunan, dokumentasi dan ujian sintetik pada cabang kerja.
2. **Selepas persetujuan JTIK:** pemasangan terkawal pada VM/host latihan, DNS/TLS dan ujian teknikal.
3. **Selepas demo:** UAT pegawai sebenar dan penerimaan Jabatan Bangunan direkodkan secara berasingan.
4. **Produksi:** memerlukan keputusan pemilik MBSP-01..08, semakan keselamatan, kelulusan ICT dan kuasa berasingan.

**Larangan:** jangan ubah Worker Cloudflare `dashboard-bangunan-mbsp`; jangan guna data sebenar, deploy, merge, kos baharu atau akses sensitif tanpa kelulusan khusus.


## Pemeriksaan konfigurasi statik (dibangunkan pada Issue #62)
Skrip `node scripts/demo-host-readiness.mjs --prepare` memeriksa konfigurasi statik sebelum kit dijana. Jalankan tanpa `--prepare` selepas menetapkan pemboleh ubah daripada kit. Kedua-dua mod mengembalikan kod gagal bagi konfigurasi tidak selamat atau artifak tidak lengkap. Pemeriksaan mengesahkan origin HTTPS tepat, opt-in demo, loopback, nama DB khusus Issue #62, tetapan Mailpit dan kunci berasingan. `npm run uat:preflight` mengesahkan perkhidmatan dan fixture secara baca sahaja.


## Pakej hos dan aliran latihan

Gunakan [pakej pemasangan Demo Release 1.0](../../deploy/demo/README.md) untuk konfigurasi Linux/Nginx atau Windows Server/IIS. Pakej menyediakan gerbang runtime demo, templat tanpa rahsia, arahan membaca sahaja sebelum pemasangan dan langkah operasi/pemulihan. Ujian Nginx/TLS menggunakan hos loopback sementara. Templat IIS dan ACL perlu dibuktikan pada platform yang dipilih JTIK.

| Fungsi | Skop demonstrasi |
| --- | --- |
| Pendaftaran dan log masuk | Daftar hanya dengan `@example.test`, aktifkan melalui Mailpit tempatan. Log masuk ke peranan kit dengan kata laluan unik. |
| Akaun individu, wakil, PIC, PPSK, pentadbir | Enam akaun kit berasingan termasuk PIC SPT untuk semakan pengasingan. Akaun pegawai termasuk pentadbir menggunakan MFA. Pentadbir menunjukkan pengurusan akaun/pelantikan melalui kebenaran sedia ada. |
| Permohonan dan bukti | Simpan draf, unit, tingkat dan akuan latihan. Jana bukti metadata CLEAN/FAILED melalui panel latihan. Ujian binary berjalan hanya dalam suite kuarantin lokal berasingan. Muat naik fail binary dan storan operasi pada hos demo kekal tertutup. |
| Nasihat AI dan keputusan | Nasihat berasaskan fixture, semakan pegawai mandatori, pembetulan, serahan semula dan banding snapshot. PIC mengesahkan lengkap. PPSK berasingan mendaftar dengan rujukan sintetik. |
| Status, notifikasi dan invois | Status di panel pemohon. Notifikasi dalam aplikasi bagi pembetulan, kelengkapan dan pendaftaran. Invois dan rekonsiliasi tiruan menggunakan RM50 bagi setiap UUID fizikal unik. |
| Akaun rasmi dan operasi | SSO, keputusan rasmi, rekod operasi, storan dokumen dan MBSPPay menunggu keputusan pemilik serta kelulusan lain. |

### Langkah ringkas peserta

1. Gunakan profil pelayar berasingan dan akaun yang ditetapkan oleh fasilitator. Pengendali membaca kelayakan daripada kit privat serta menyediakan akses MFA. Jangan edarkan kit, rahsia atau tangkap layar masuk.
2. Ikut urutan [enam senario dan skrip 25 minit](GUIDED-INTERNAL-UAT.md#skrip-teras-25-minit). Pada profil wakil, buka `company-active` dan `company-expired`. Dalam profil pentadbir, sahkan MFA, semak senarai pengguna dan pelantikan latihan. Gunakan DB baharu untuk sesi baharu.
3. Isi [laporan maklum balas dan triage](UAT-FEEDBACK-TRIAGE.md) serta [senarai semak penerimaan](GUIDED-UAT-ACCEPTANCE.md). Catat SHA, masa MYT, peranan, PASS/FAIL/BLOCKED dan rujukan bukti. Rekod penerimaan bertandatangan hanya selepas sesi pegawai.

### Keputusan JTIK dan penerimaan

| Gerbang | Bukti yang diperlukan | Pemegang keputusan |
| --- | --- | --- |
| Kod siap untuk semakan | Commit, templat, hasil CI, had demo dan senarai risiko | Penyemak teknikal |
| Pemasangan hos latihan | OS dan versi, akaun servis, TLS/DNS, rangkaian/VPN, sempadan log/rahsia/peta, sandaran dan ujian hos terpilih | JTIK |
| UAT Jabatan Bangunan | Sesi pegawai, keputusan senario, pengesahan mudah alih dan rekod penutupan isu | Fasilitator dan pemegang kuasa Jabatan Bangunan |
| Pengaktifan operasi | MBSP-01 hingga MBSP-08, rekod kelulusan sistem, kawalan dan penerimaan risiko | JTIK dan pemilik proses berkaitan |

| SHA dan tarikh MYT | Hos / pelayar | Keputusan | Rujukan bukti / minit | Pelulus dan kuasa |
| --- | --- | --- | --- | --- |
| | | | | |
