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
