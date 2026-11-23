# Penerimaan teknikal pra-staging STAYLink MBSP · Issue #40

Semakan 19 November 2026 (MYT). Asas ialah `54ec5fb` daripada PR #39, di atas PR #37 dan #38. [CI Issue #36 lulus](https://github.com/BangunanDotCom/sipintar-mbsp/actions/runs/44498823105). UAT Issue #40 beroperasi dalam PostgreSQL loopback dengan fixture dan Mailpit tempatan. Keluaran staging tertakluk pada kelulusan berasingan.

## Semakan keselamatan dan kebolehpercayaan

| Sempadan | Semakan dan hasil |
| --- | --- |
| Portal sintetik dan data | Flag eksplisit, `NODE_ENV=test/development`, padanan kedua-dua URL dan nama DB ujian aktif. Laluan produksi gagal tertutup. Tiada perubahan skema. |
| Sesi, MFA dan akses | Asingkan akaun dan daerah, semak peranan serta hak semasa. Transaksi penulisan bukti dan serahan menyemak sekali lagi sesi pemohon, peranan, kelayakan identiti dan CSRF. Transaksi pegawai juga menyemak MFA dan daerah. Kunci baca menyelaras semakan dengan perubahan rekod sesi atau peruntukan. |
| Origin dan CSRF | Token terikat kepada rahsia cookie sesi HttpOnly menggunakan HMAC berlabel khusus. Tab serentak menerima token yang sama. Sesi lain menerima token berbeza. Sesi lama beralih sekali pada bacaan `/api/auth/me` melalui kemas kini bersyarat. Respons log masuk dan bacaan sesi menetapkan `private, no-store`. Origin dan sesi terus diperiksa pada mutasi. |
| Kuasa wakil dan draf | API semak pemilikan, wakil semasa serta konteks asal pada snapshot. Ujian memeriksa luput, pembatalan, pertukaran kapasiti dan akses silang draf, unit, tingkat, bukti dan invois. Pelantikan daerah disaring sebelum halaman tugasan dibentuk. |
| Bukti dan keputusan | Bukti fixture diperiksa semula sebelum kelengkapan, pendaftaran dan invois baharu. Bukti gagal atau berubah sasaran tersekat. PIC meminta pembetulan atau mengesahkan. PPSK yang berasingan mendaftar. Snapshot terdahulu kekal dan pencetus menyekat kemas kini. |
| Audit dan callback | Semakan log menyembunyikan rahsia sesi, CSRF, tandatangan dan badan. Callback tiruan mengesahkan HMAC dan mengikat rujukan, amaun dan tempoh kepada invois. Replay sah memulangkan hasil terdahulu, termasuk apabila dua callback tiba serentak. |
| Kegagalan dan beban | API kekal dihadkan. Portal memaparkan tempoh `Retry-After` apabila tersedia dan mengekalkan status ralat untuk respons gateway yang tiada JSON. Tindakan gagal tidak dimainkan semula secara automatik. |

Pengesahan menggunakan semakan sumber dan regresi defensif dalam Cloud Environment. Penilaian keselamatan staging, pengimbas sebenar dan pengesahan pemilik masih perlu dijadualkan.

## Kontrak tambahan

- `GET /api/synthetic-portal/reviews` menerima `view=all|action` dan `cursor` pilihan. Pemohon lain, rekod daerah berbeza, kes yang diganti dan syarikat tanpa kuasa sah dikecualikan sebelum had halaman. Mod `action` memaparkan serahan belum disemak kepada PIC dan serahan lengkap belum didaftarkan kepada PPSK.
- Respons mengandungi sehingga 20 serahan dan `nextCursor` atau `null`. Gunakan kursor sebagaimana dipulangkan dan reset ke halaman pertama apabila menukar penapis. Tambatan `createdAt,id` mengekalkan tertib walaupun beberapa serahan mempunyai masa sama. Kursor rosak ditolak dengan 400. UI mengehadkan tindakan sementara halaman baharu dimuat.
- Matriks akses pemohon, PIC, PPSK dan penjana callback kekal dalam [kontrak UAT ICT](UAT-SECURITY.md). Akses skop disemak semula pada setiap permintaan.

## Skrip UAT dan hasil latihan

Ikut [skrip fasilitator](DEMO.md) dengan DB baharu `staylink_issue40_demo_test`. Penjana `npm run db:uat-demo` menyimpan konfigurasi dan akaun latihan dalam fail mod `0600`. Varian Playwright boleh menggunakan `STAYLINK_UAT_KIT_FILE` yang menunjuk ke `accounts.json`. Sumberkan `portal.env` sebelum mula API dan gunakan fail yang dijana pada DB yang sama. Tetapkan `STAYLINK_UAT_EVIDENCE_DIR` untuk menyimpan potongan panel terpilih dan ukuran masa. Kecualikan fail akaun dan rakaman sesi daripada serahan.

| Ujian penerimaan | Jangkaan | Hasil pada fixture baharu |
| --- | --- | --- |
| Log masuk dan MFA | Tiga akaun latihan boleh membuka peranan sah. PIC/PPSK disekat sebelum MFA. | Lulus melalui API log masuk dan MFA dalam konteks penyemak imbas berasingan. |
| Draf dan serahan | FAILED menyekat serahan, CLEAN membolehkan akuan dan resit. | Lulus pada viewport 320 dan 390 px. Fokus papan kekunci pada kawalan bukti disahkan. |
| PIC dan pembetulan | Alasan muncul pada portal pemohon. Serahan semula mengeluarkan resit baharu. | Lulus. PIC menilai semula resit baharu kemudian mengesahkan kelengkapan. |
| PPSK dan bil | PPSK mendaftar berasingan. Satu unit pada dua tingkat menghasilkan RM50. | Lulus. Butiran invois hanya diminta apabila dibuka. |
| Rekonsiliasi | Status tiruan muncul pada kedua-dua portal. Callback ulangan tidak menggandakan acara. | Lulus melalui UAT dan regresi API serentak. Butang serahan rasmi kekal disabled. |
| Paginasi | Had 20 per halaman, tiada rekod berganda pada masa seri, penapis mengikut peranan. | Lulus melalui PostgreSQL dengan 25 rekod latihan termasuk dua di luar skop. |

Potongan visual latihan meliputi bukti FAILED, alasan pembetulan PIC dan rekonsiliasi PPSK. Potongan dihadkan pada panel sintetik; fail rahsia dan halaman log masuk tidak termasuk.

## Pemerhatian prestasi

Satu larian Chromium tempatan menggunakan fixture baharu. Bacaan API dari pemerhatian pelayar merangkumi masa respons pada loopback. Bacaan UI merangkumi navigasi sehingga panel atau kawalan dijumpai.

| Ukuran | Sampel | Hasil |
| --- | --- | --- |
| API status draf | 8 | 43–188 ms |
| API senarai tugasan | 8 | 35–132 ms |
| API serahan | 2 | 73–212 ms |
| UI pemohon, PIC, PPSK | 1 setiap peranan | 952 ms, 1,167 ms, 1,325 ms |
| Build JavaScript | 1 | Bundle permulaan 472.12 kB. Chunk MapLibre lazy 1,059.32 kB. |

Paginasi mengehadkan pembacaan metadata dan peristiwa kepada kes pada halaman. Angka Cloud tersebut belum merupakan SLA, ujian beban atau ukuran staging. Profil masa muat peta pada peranti sebenar dan pengoptimuman aset gaya atau modul pilihan boleh dinilai dengan data staging yang diluluskan.

## Serahan, pemulihan dan gerbang

- **Pengesahan teknikal.** Prapengesahan lulus 286 Vitest, 77 API PostgreSQL Issue #40 serta perjalanan Chromium berasaskan kit baharu. Jalankan suite penuh sekali lagi pada commit serahan. Workflow GitHub menambah latihan pulih sandaran kepada job API sintetik.
- **Pemulihan.** Selepas API ujian, sediakan DB pemulihan sintetik kosong berasingan. Jalankan `bash scripts/rehearse-synthetic-restore.sh <bekas-ujian> <peranan-fixture> <db-ujian> <db-restore-ujian>`. Skrip memeriksa nama DB, berhenti jika sasaran tidak kosong, dan membandingkan serahan, hubungan bukti, kelengkapan, invois, rekonsiliasi serta pencetus. Dapatan tidak merangkumi pemulihan storan objek.
- **Gerbang staging.** Semak keputusan pemilik yang ditandatangani, konfigurasi persekitaran dan kunci, pelan pemulihan serta pemantauan, UAT pengguna dan pengasingan data. Kelulusan keluaran dan kelulusan operasi direkod berasingan.

| Keputusan / risiko | Bertanggungjawab | Pelulus | Rujuk |
| --- | --- | --- | --- |
| Dokumen sah, teks akuan, aturan pembetulan, kuasa wakil dan tugas per kes | Jabatan Bangunan | Pemilik proses MBSP | ICT, Unit Rekod |
| Storan, kunci, pengimbas, retensi, legal hold, audit tahan ubah dan RPO/RTO | ICT, Unit Rekod | Pemilik keselamatan dan rekod MBSP | Jabatan Bangunan |
| Kontrak callback dan lejar serta definisi unit bercaj sebenar | Kewangan, ICT | Kewangan MBSP | Jabatan Bangunan |
| UAT peranti sebenar, prestasi peta dan kesediaan staging | ICT, fasilitator UAT | Pemilik sistem MBSP | Semua pemilik proses |

**Ringkasan mesyuarat.** Aliran latihan dan pengasingan boleh didemonstrasikan. Bawa sebarang kelulusan bersama nama pelulus, tarikh kuat kuasa dan rujukan SOP. Pemilik sistem menetapkan bila gerbang semakan staging boleh dipertimbangkan.

## Semakan advisori susulan · 23 November 2026 (MYT)

Audit pada `35b648e` melaporkan lima entri tinggi daripada satu advisori terhadap `effect` melalui rantaian Prisma. Override terhad kepada `@prisma/config@6.19.3` menaikkan `effect` daripada 3.21.0 kepada versi yang ditampal, 3.22.1. Prisma kekal 6.19.3 dan lockfile hanya berubah bagi pakej `effect`. Audit lockfile selepas kemas kini melaporkan sifar kelemahan. Pengesahan commit akhir turut meliputi pemasangan bersih, penjanaan Prisma, integrasi dan pemulihan sintetik. [GHSA-7589-6fvf-x4pw](https://github.com/advisories/GHSA-7589-6fvf-x4pw)
