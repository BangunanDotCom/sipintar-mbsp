# STAYLink MBSP — Gerbang pengesahan Fasa 2B (17 November 2026)

Dokumen kerja untuk branch `staylink-mbsp-phase1`. Ini ialah pelan pengesahan, **bukan** laporan ujian lulus atau kelulusan produksi. Jangan ubah `main`, laman utama/identiti emas-navy, atau Cloudflare Worker `dashboard-bangunan-mbsp`.

## Keutamaan sebelum fungsi baharu diaktifkan

1. Jalankan `npm ci`, `npm run lint`, `npm run typecheck`, `npm test` dan `npm run build`; rekod tarikh, persekitaran, keputusan dan kegagalan sebenar dalam laporan ujian.
2. Gunakan PostgreSQL pembangunan dan pangkalan data `_test` berasingan. Jalankan `npm run db:generate`, `npm run db:migrate`, `npm run db:test:migrate`; sahkan migrasi tingkat `202611170001_premise_floors` dan migrasi dokumen terbaharu tanpa memadam data.
3. Uji API GET/PUT tingkat dengan data sintetik: pemilik draf sah, bukan pemilik (403), versi lama (409), aras pendua, angka negatif, dan konsistensi jumlah premis/tingkat.
4. Uji pelayar sebenar: daftar/login, wakil syarikat, simpan premis, sambung draf, tambah/buang tingkat, jadual konsolidasi, semakan draf dan ralat konflik versi; periksa paparan telefon 320/390 px dan desktop.
5. Uji dokumen sokongan: kategori dan pemakaian, had saiz/MIME, tandatangan PDF/PNG, akses antara pengguna, kuarantin, imbasan malware gagal-selamat, tamat pajakan dan rekod audit. **Jangan** anggap ujian adapter mock sebagai bukti pengimbas produksi.
6. Sahkan semua paparan dengan label status sebenar: draf bukan penghantaran rasmi; semakan automatik bukan pengesahan pegawai; GIS UNVERIFIED; keputusan imbasan belum sah bukan CLEAN.
7. Catat halangan luaran: penyedia peta sebenar, SMTP produksi, storan persendirian, antivirus, MBSPPay, data GIS MBSP dan kelulusan ICT. Jangan gunakan identiti, dokumen atau alamat pemohon sebenar untuk ujian.

## Kriteria penerimaan Fasa 2B sebelum penghantaran rasmi

- Agregat premis dan jumlah tingkat sepadan, atau ketidakpadanan jelas dan tidak boleh terlepas gerbang penghantaran.
- Dokumen wajib ditetapkan melalui konfigurasi/keputusan MBSP, dimuat naik, diimbas CLEAN oleh perkhidmatan sebenar dan boleh diakses hanya mengikut kebenaran.
- Akuan digital merekod pengguna, masa dan versi dokumen. Pendaftaran rasmi, nombor rujukan MBSP dan bil tidak diwujudkan hanya kerana draf disimpan.
- Aliran penghantaran rasmi mesti dibangunkan dan diuji secara berasingan sebelum diaktifkan; semakan PIC dan pengesahan lengkap mendahului rujukan rasmi.
- Bil RM50 berdasarkan bilangan **unit premis/kedai**, bukan bilangan tingkat. Bayaran mesti disahkan oleh integrasi MBSPPay sebenar sebelum rujukan teknikal.
- UAT Jabatan Bangunan dan semakan keselamatan ICT diperlukan sebelum sebarang penggunaan produksi.

## Pelaporan setiap sesi pembangunan

Rekod: commit SHA, fail diubah, keputusan lint/typecheck/unit/API/E2E, migrasi yang digunakan, screenshot sebenar, isu terbuka, risiko data/keselamatan dan langkah seterusnya. Jika ujian tidak dapat dijalankan, tulis **BELUM DIUJI** — jangan tulis LULUS.

## Skop sprint berikutnya

Fokus pertama ialah mengesahkan kod tingkat, readiness dan dokumen yang sudah berada dalam branch. Selepas semua gerbang di atas lulus, bina storan dokumen persendirian serta aliran muat naik/imbasan sebenar, diikuti akuan dan penghantaran rasmi. Tiada merge `main` atau deployment tanpa kebenaran pengguna.
