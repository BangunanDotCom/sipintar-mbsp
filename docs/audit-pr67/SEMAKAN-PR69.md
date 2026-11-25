# Audit bebas calon Fasa 1 · PR #69

**Keputusan 25 November 2026 (MYT): NO-GO untuk Complete Release dan penggunaan rasmi.** Head semakan ialah `7970f1f857d245937fd0baaaf848e78e6f0ad1e7`. Satu-satunya perubahan daripada SHA larian `91a0e40685d9eb0c28fa0469b4d5eb1c613de9a2` ialah enam baris dokumentasi bukti. Aliran latihan PostgreSQL kini berjalan selepas bayaran pertama hingga penutupan. Dua gerbang P0 surat kuasa kekal terbuka. Status di bawah menilai PR #69 dan menyimpan laporan PR #67 sebagai rekod sejarah. [PR #69](https://github.com/BangunanDotCom/sipintar-mbsp/pull/69) · [Baseline PR #67](README.md) · [Keputusan operasi](../DECISIONS-OPERATIONS-2026-11.md)

**Status matriks.** **Lengkap sintetik** bermaksud fungsi asas yang disenaraikan lulus dalam skop fixture. **Separa** bermaksud sebahagian fungsi beroperasi atau sebahagian bukti masih tiada. **Simulasi** menandakan pengganti proses atau integrasi rasmi. **Belum siap** menandakan tiada pelaksanaan berkenaan pada SHA ini. **Rasmi belum disahkan** memerlukan pemilik, integrasi atau persekitaran yang diluluskan.

## Matriks K01–K11 dan proses lanjutan

| ID | Status pada PR #69 | Bukti / baki pelepasan |
|---|---|---|
| K01 · Premis dan fi | **Lengkap sintetik** untuk satu lokasi, inventori berbilang unit/aras dan kiraan unit fizikal. **Simulasi** untuk kadar dan invois | UI/API dan fixture unit rentas tingkat. Kewangan perlu mengesahkan kadar, pengecualian dan aturan unit apabila keputusan aras bercampur |
| K02 · Identiti dan pautan | **Lengkap sintetik** untuk UUID dan pautan unit–tingkat berversi serta keputusan mengikut pasangan. **Separa** bagi pengenalan fizikal rasmi | Snapshot dan kiraan deduplikasi diuji. GIS/sempadan daerah, unit gabung/tanpa label, migrasi warisan dan aturan kebergantungan keputusan kekal terbuka |
| K03 · Pemohon/wakil | **Lengkap sintetik** untuk akaun, jemputan, tamat kuasa terpilih dan pemilikan draf. **Separa** untuk verifikasi wakil | Gerbang **B** terbuka. Kontrak rasmi mesti menyemak ikatan wakil–versi surat kuasa ketika pengesahan dan serahan |
| K04 · Polisi bukti | **Simulasi** untuk bukti/polisi dokumen berversi. **Belum siap** untuk muat naik fail kes rasmi dan bukti lampiran susulan | Snapshot dan gerbang metadata latihan ada. Lengkapkan rules, kelayakan CLEAN, alternatif dan lampiran susulan yang diluluskan |
| K05 · Akuan | **Simulasi** untuk akuan berversi, pelaku, snapshot dan akuan semula | API serahan latihan lulus. Teks, kuasa dan kesan rasmi masih menunggu pemilik/perundangan |
| K06 · Serahan dan pembetulan | **Lengkap sintetik** untuk simpan/konflik draf. **Simulasi** untuk hantar, pembetulan, idempotensi, snapshot dan penguncian draf teras selepas tutup | Larian biasa, compatibility dan API Completion meliputi bahagian tersebut. **Belum siap** semakan ketidakaktifan 60 hari, skop pindaan rasmi dan gerbang serahan rasmi |
| K07 · Keselamatan dokumen | **Separa**. Komponen kuarantin/verdict dan metadata kes tersedia pada fixture | Gerbang **A** terbuka pada PDF surat kuasa. Storan, pengimbas, pengesahan fail legacy, retensi dan DR merentas DB/objek/kunci belum disahkan |
| K08 · AI, semakan manusia dan daftar | **Simulasi** untuk bantuan AI, tindakan PIC dan daftar PPSK | Fixture mengesahkan tindakan manusia sebelum daftar dan bayaran pertama. Penyedia AI, fallback manual berjejak yang lengkap, siri rujukan rasmi dan prosedur PPSK berbilang daerah masih terbuka |
| K09 · MBSPPay | **Simulasi** untuk invois pertama/kedua dan settlement ulangan | Jumlah, deduplikasi unit, versi, callback dan penutupan selepas settlement diuji dengan fixture. **Rasmi belum disahkan** untuk penyedia, kontrak sandbox, reconciliation, lejar, refund dan pertikaian |
| K10 · Peranan dan kuasa | **Lengkap sintetik** untuk MFA, pengasingan peranan/daerah terpilih dan peralihan dalam fixture. **Separa** untuk model tugasan rasmi | 11 akaun pada profil Completion. Empat peranan tambahan dan tindakan per daerah konfigurasi. Pelantikan rasmi, pemangkuan, kuasa BKT/JK, kawalan pembuka semula dan audit tahan ubah masih terbuka |
| K11 · Pekerja dan majikan | **Lengkap sintetik** untuk jumlah pekerja dan aliran tanpa majikan. **Separa** bagi keluaran surat dan data pilihan | Surat latihan sentiasa menggunakan frasa JTK. Sokongan nilai kapasiti yang dinyatakan JK dan aturan data pilihan majikan belum ditunjukkan. Data majikan kekal pilihan |

| Proses selepas bayaran pertama | Status pada PR #69 | Baki |
|---|---|---|
| Perancang dan Kejuruteraan | **Lengkap sintetik** untuk rujukan selari selepas bayar, MFA, ulasan umum/per pasangan, tempoh tujuh hari kalendar, kawalan tugasan dan notifikasi terpilih | Tugasan per kes berbilang daerah, proses pengecualian, peringatan dan eskalasi rasmi |
| KP / BKT | **Separa**. Hantar KP sintetik dan salinan ulasan tersimpan, arahan tiada ulasan selepas SLA, late comment direkod dengan makluman Urus Setia | Tiada aliran penerimaan/triage BKT rasmi dalam sistem. Pemulangan, pengesahan versi dan prosedur BKT perlu diterima pemilik |
| SK/SKB/TANGGUH/TOLAK | **Simulasi** untuk keputusan bercampur per pasangan, had kumulatif SKB, tarikh susulan dan semakan bebas | Lampiran susulan, peringatan berkala jika tarikh tiada, eskalasi, rayuan dan peraturan keputusan unit/aras bergantung. Kelulusan rasmi belum disahkan |
| Surat induk dan susulan | **Simulasi**. Fail teks berlabel LATIHAN, versi asal/susulan dan akses pemohon teruji pada HTTPS | PDF keputusan, versi templat rasmi, kapasiti JK, pengesahan sijil, timestamp dan revokasi, penyedia tandatangan dan tatacara terbit |
| Bayaran peringkat kedua | **Simulasi**. Kadar sen konfigurasi, deduplikasi UUID, callback, settlement dan idempotensi | Peranan Kewangan, lejar pengeluaran, aturan kadar/muktamad/layak caj, provider dan refund/dispute |
| Penutupan, rekod dan SLA | **Separa**. Tutup jika keputusan muktamad dan bayaran yang diperlukan selesai. Draf teras dikunci, surat kekal boleh dibaca. Ringkasan daerah hingga 50 kes | **Belum siap** arkib, legal hold, retensi, buka semula dan analitik keseluruhan berkuasa. Perlu bukti peralihan apabila skop yang ditutup dibaca semula atau dipulihkan |
| Integrasi dan hos | **Rasmi belum disahkan** untuk Oracle 19.30 SE2, MBSPPay, tandatangan, stor/pengimbas, SMTP, identiti dan GIS yang termasuk dalam skop keluaran | PR #70 menawarkan kontrak persistensi Completion terpilih, PR #71 menawarkan parity API dalam makmal. Bukti #70/#71 ialah laporan makmal yang disemak sebagai kebergantungan. Tiada larian Oracle 19c hujung ke hujung dalam audit ini. Hos, log, DR dan penerimaan pemilik masih perlu sign-off |

Sumber. [Kod Completion](https://github.com/BangunanDotCom/sipintar-mbsp/blob/91a0e40685d9eb0c28fa0469b4d5eb1c613de9a2/apps/api/src/synthetic-portal-completion.ts) · [Peralihan domain](https://github.com/BangunanDotCom/sipintar-mbsp/blob/91a0e40685d9eb0c28fa0469b4d5eb1c613de9a2/packages/shared/src/synthetic-completion.ts) · [Oracle #64](https://github.com/BangunanDotCom/sipintar-mbsp/pull/64) · [Oracle #70](https://github.com/BangunanDotCom/sipintar-mbsp/pull/70) · [Oracle #71](https://github.com/BangunanDotCom/sipintar-mbsp/pull/71)

## Daftar gerbang pelepasan aktif

| Gerbang | Status | Bukti diperlukan dan pemilik |
|---|---|---|
| P0 A / F-01 | **Terbuka**, PDF boleh dikeluarkan tanpa gerbang keputusan imbasan | Team 1/JTIK membekalkan SHA pembetulan, kod dan ujian A1–A4, A-N01–05 dan A-P01 |
| P0 B / F-02 | **Terbuka**, pengesahan wakil belum terikat pada versi dokumen tertentu | Team 1/Jabatan Bangunan membekalkan SHA pembetulan, transaksi dan regresi B1–B4, B-N01–05 dan B-P01 |
| Dokumen/kuasa rasmi, proses pascakeputusan dan rekod | **Terbuka**. Gerakan ke penutupan wujud dalam latihan | Jabatan Bangunan/Unit Rekod mengesahkan dasar, BKT/JK, lampiran susulan, kapasiti JK, surat, arkib, hold dan retensi |
| Pembayaran dan tandatangan | **Terbuka**. Simulasi lulus | Kewangan/JTIK/Jabatan Bangunan mengesahkan sandbox, penguatkuasaan peranan, lejar, refund/settlement, penyedia tanda dan pengesahan artifak |
| Oracle, hos, kapasiti dan kesinambungan | **Terbuka**. Ujian setempat PostgreSQL/Mailpit/Nginx tersedia | JTIK/DBA mengesahkan hos, kawalan log/TLS/fail, Oracle 19c penuh, SLO serta restore DB+objek+kunci yang memenuhi RPO/RTO |
| UAT pemilik dan Complete Release | **Terbuka** | Bukti penerimaan semua peranan dan daerah pada SHA sama. Tandatangan Jabatan Bangunan, Kewangan dan JTIK |

[A/B · Kriteria teknikal dan ujian negatif](PENERIMAAN-SURAT-KUASA.md) · [Daftar lengkap risiko dan kebergantungan baseline](PENEMUAN.md)

## Bukti ujian untuk SHA ini

| Sumber | Hasil |
|---|---|
| CI GitHub, run 45526316808 | Tujuh job lulus. Ini termasuk Personal dan Completion, API, browser, kit, demo dan validate. Job Personal pada run 45524207627 gagal pada commit terdahulu `3b0dfac`. Ujian HEAD memasukkan keadaan loading barisan pegawai |
| Audit tempatan · alat dan suite umum | `npm ci`, Prisma generate, lint, typecheck/build lulus. Kedua-dua audit npm melaporkan 0 penemuan. Vitest 340 lulus, satu ujian Completion bersyarat dijalankan berasingan |
| Audit tempatan · PostgreSQL/Mailpit | 79 API lulus dan satu compatibility lulus dalam fixture khusus. Ujian integrasi Completion dengan kit 11 akaun lulus. Liputan termasuk pendaftaran, bayaran pertama, rujukan, versi lapuk, mixed decision, surat susulan, callback, penutupan dan penolakan mutasi draf teras selepas tutup |
| Audit tempatan · HTTPS | Playwright Completion lulus untuk status tertutup dan muat turun dua surat latihan. Playwright Personal Demo tujuh akaun lulus, termasuk loading barisan PIC, MFA dan pengasingan daerah. Ujian browser umum 27 kes menggunakan bukti CI pada SHA ini |
| Audit tempatan · restore Completion | Restore ke DB kosong lulus. Skrip membandingkan cap jari rekod termasuk peristiwa audit Completion dan trigger snapshot. Kiraan acara Completion 17 di kedua-dua DB. DB objek/kunci servis dan Oracle 19c tiada dalam larian |
| Dua gerbang surat kuasa | Belum ditutup. Semakan sumber pada SHA ini mengesahkan pengendali A/B belum berubah. Ujian regresi selepas patch memerlukan SHA Team 1 |

[CI HEAD](https://github.com/BangunanDotCom/sipintar-mbsp/actions/runs/45526316808) · [CI commit terdahulu](https://github.com/BangunanDotCom/sipintar-mbsp/actions/runs/45524207627) · [Ujian API Completion](https://github.com/BangunanDotCom/sipintar-mbsp/blob/91a0e40685d9eb0c28fa0469b4d5eb1c613de9a2/tests/synthetic-completion-api.test.ts)

## Checklist Complete Release

- [ ] A dan B lulus pada SHA calon. Bukti meliputi pemohon, PIC, fail warisan, versi ganti, revokasi, race, audit atomik dan semua laluan yang mengeluarkan fail.
- [ ] Polisi K01–K11 dan peraturan BKT/JK/Kewangan diluluskan. E01–E16 lulus untuk perjalanan dan pelaku rasmi menggunakan data rekaan.
- [ ] Oracle 19c pada persekitaran diluluskan membuktikan parity, kapasiti, migrasi dan rollback jika diperlukan oleh keluaran.
- [ ] MBSPPay dan tandatangan rasmi dibuktikan dalam sandbox. Peranan, pengesahan artifak, rekonsiliasi, pemulihan serta audit sepadan dengan SOP.
- [ ] Semakan JTIK meliputi boundary, data/secret/log, pemulihan DB bersama fail dan kunci, privasi, kapasiti dan aksesibiliti. Unit Rekod mengesahkan arkib/hold.
- [ ] UAT semua peranan pada SHA calon, siap dengan sign-off berasingan Jabatan Bangunan, Kewangan dan JTIK.
