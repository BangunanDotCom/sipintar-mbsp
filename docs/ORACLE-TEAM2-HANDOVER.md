# STAYLink MBSP · Serahan teknikal Oracle Team 2

Branch `feature/oracle-team2-parity` bermula daripada kepala Draft PR #64, `4b55f385455216bf3c73a06dacad1bd2e333224e`. PR draf berlapis menggunakan `feature/oracle-19c-migration` sebagai base supaya diff Team 2 boleh disemak secara berasingan. Aplikasi biasa kekal fail-closed untuk `STAYLINK_DB_PROVIDER=oracle`. API Oracle hanya tersedia dalam proses ujian dengan akaun makmal runtime yang disahkan.

## Liputan kumulatif

| Kontrak stabil | Adapter dan kawalan |
| --- | --- |
| Akaun, profil dan MFA | Pendaftaran, sesi, emel, MFA dan pemulihan daripada PR #64. Team 2 menyambung profil, pengenalan sekali sahaja, dashboard dan penggantungan akaun. |
| K01–K03 | Pemohon individu, syarikat, surat kuasa PDF, jemputan dan pengesahan wakil. Draf, premis, unit fizikal, tingkat dan kemudahan menggunakan kontrak bersama kedua-dua enjin. UUID kekal semasa susunan dan label berubah. |
| K04–K07 | Metadata dan versi dokumen, skop unit atau tingkat, kuarantin dan lease imbasan. Gerbang rasmi kekal tertutup. Bukti sintetik diberi versi dan dipautkan kepada snapshot serahan. Versi draf, akuan dan kunci idempotensi disemak dalam transaksi. |
| K08/K10 | Pelantikan daerah, giliran semakan PIC/PPSK, pembetulan, perbandingan versi, semakan bukti semasa dan pengasingan pegawai. Keputusan manusia dan pendaftaran diaudit. |
| K09 | Invois peringkat pertama untuk latihan, lejar audit, pengesahan HMAC dan rekonsiliasi idempotent. RM50 setiap UUID unit unik ialah nilai kontrak sintetik sedia ada. |
| Issue #68 | Rujukan Perancang dan Kejuruteraan, SLA tujuh hari kalendar, ulasan unit/tingkat, KP berversi, keputusan bercampur, surat versi induk/susulan, bayaran kedua, tindakan susulan dan penutupan. Adapter PostgreSQL dan Oracle menggunakan kontrak Team 1 yang sama. [Matriks kontrak dan bukti Issue #68](ORACLE-ISSUE68-PARITY.md) |
| K11 | Ringkasan pekerja baseline. Medan majikan pilihan kekal keputusan Team 1 dan pemilik proses. |
| Operasi | Templat berversi, konfigurasi, audit berskop, notifikasi, senarai pegawai, tugasan kawasan, seed, migrasi, import 31 jadual dan pemulihan skema sintetik. |

## Penyelarasan Team 1

Peristiwa Issue #68 dalam PR #69 dan #70 sepadan byte demi byte. PR #71 menggunakan peristiwa tersebut dalam audit sedia ada dan menambah indeks Oracle untuk carian sejarah. Laluan Team 1 yang menggunakan Prisma secara terus dipisahkan kepada adapter PostgreSQL dan Oracle dengan satu pelaksanaan HTTP bersama. Pemilik proses menentukan peraturan rasmi, kadar fi, retensi dan pengaktifan. [Kontrak yang disemak dan perbezaan adapter](ORACLE-ISSUE68-PARITY.md)

## Pemasangan makmal

Sediakan Oracle loopback berasingan, satu akaun owner `STL_LAB_*` dan satu akaun runtime `STL_LAB_*`. Tetapkan identiti PDB dan `ORACLE_EXPECTED_SERVER_VERSION` jika versi mesti sepadan tepat. Gunakan contoh env dalam repositori dan simpan salinan yang mengandungi kata laluan di luar Git. Berikan hak daftar masuk, kuota dan hak DDL pemasangan kepada owner makmal. Runtime mendapat grant objek daripada seed dan beroperasi tanpa hak DDL.

```bash
npm ci
npm run db:generate
node --env-file="$ORACLE_LAB_OWNER_ENV" --import tsx scripts/oracle/install.ts preflight
node --env-file="$ORACLE_LAB_OWNER_ENV" --import tsx scripts/oracle/install.ts apply

export ORACLE_LAB_ENABLE_AUTH=true ORACLE_LAB_ENABLE_MANAGEMENT=true
export ORACLE_LAB_ENABLE_COMPANY_INVITATIONS=true ORACLE_LAB_ENABLE_DOCUMENT_SCAN=true
export ORACLE_LAB_ENABLE_DRAFTS=true ORACLE_LAB_ENABLE_APPLICANTS=true
export ORACLE_LAB_ENABLE_DASHBOARD=true ORACLE_LAB_ENABLE_SUBMISSIONS=true ORACLE_LAB_ENABLE_ADMIN=true
export ORACLE_LAB_ENABLE_COMPLETION=true
node --env-file="$ORACLE_LAB_OWNER_ENV" --import tsx scripts/oracle/seed.ts

NODE_ENV=test STAYLINK_ORACLE_LAB_HTTP=true STAYLINK_ORACLE_LAB_SYNTHETIC=true \
  node --env-file="$ORACLE_LAB_RUNTIME_ENV" --import tsx scripts/oracle/serve-lab.ts
```

Untuk endpoint pegawai dan callback, sediakan UUID pegawai sintetik berasingan bagi `STAYLINK_SYNTHETIC_PIC_ID` dan `STAYLINK_SYNTHETIC_SUPERVISOR_ID`, daerah pelantikan dalam `STAYLINK_SYNTHETIC_DISTRICT`, dan kunci HMAC latihan 64 aksara heksadesimal. Gunakan kunci penyulitan MFA dan identiti sintetik serta Mailpit loopback jika menguji emel. API makmal mendengar di `127.0.0.1:3301` secara lalai dan menyemak identiti sambungan sebelum mendengar.

Aktifkan `STAYLINK_SYNTHETIC_COMPLETION=true` hanya dalam proses Oracle makmal dengan polisi semakan sintetik dan pembayaran `MOCK` yang sah. Gunakan pelantikan, grant dan DB ujian khusus untuk Issue #68. [Konfigurasi dan ujian](ORACLE-ISSUE68-PARITY.md)

Skema makmal baharu boleh memulakan seorang pentadbir ICT dengan `scripts/oracle/bootstrap.ts` menggunakan fail env owner, `NODE_ENV=test`, `BOOTSTRAP_NAME`, `BOOTSTRAP_EMAIL` berakhiran `@example.test` serta kunci MFA latihan. Jalankan `scripts/oracle/retry-email.ts` menggunakan runtime dan Mailpit loopback untuk menghantar jemputan. Bootstrap bersiri merekodkan akaun, pelantikan, token bercap, outbox dan audit dalam satu transaksi. Kata laluan dan MFA ditetapkan selepas pengaktifan.

## Kesetaraan dan pemulihan

1. Gunakan DB PostgreSQL loopback khusus `staylink_issue58_*_test`, tetapkan `DATABASE_URL` dan `TEST_DATABASE_URL` sama, dan jalankan `npm run db:test:migrate`. Aktifkan `STAYLINK_TEST_DB_PARITY=true`, `STAYLINK_SYNTHETIC_PORTAL=true`, `STAYLINK_ORACLE_LAB_SYNTHETIC=true` serta fail env owner/runtime Oracle untuk menjalankan `npx vitest run tests/draft-provider-parity.test.ts`. Ujian kontrak menggunakan API HTTP yang sama pada kedua-dua adapter.
2. Gunakan `scripts/oracle/backup.ts import-postgres` dengan `ORACLE_LAB_POSTGRES_URL` sumber sintetik. Eksport `backup.ts export` dan pulih `backup.ts restore` ke skema kedua yang kosong dan dipasang dengan checksum yang sama. Bandingkan cap SHA-256 sebelum dan selepas pemulihan.
3. Transaksi DML gagal dibatalkan sebelum sambungan dikembalikan. Buang sambungan yang gagal dibatalkan. Perlanggaran versi, ulang callback dan semakan serentak mempunyai ujian bebas. Semak rekod lejar dan audit sebelum cuba semula operasi dengan hasil commit yang belum diketahui.
4. DDL Oracle melakukan implicit commit. Pada status `APPLYING`, hentikan pemasangan dan jalankan `scripts/oracle/recovery.ts`. Pilihan undur makmal ialah kembali kepada aplikasi PostgreSQL dan pulihkan snapshot yang disahkan ke skema Oracle makmal kosong yang lain. Pembaikan produksi atau DDL songsang memerlukan keputusan DBA dan bukti berasingan. Storan fail luar DB, kunci, konfigurasi dan grant memerlukan pemulihan operasi sendiri.

## Bukti larian Team 2

Bukti di bawah merujuk baseline Team 2 pada `be329ed`. Bukti sambungan termasuk migrasi 002, pemulihan dengan 34 peristiwa Issue #68 dan larian kedua-dua adapter direkodkan bersama matriks Issue #68. [Bukti sambungan](ORACLE-ISSUE68-PARITY.md)

- 433 ujian Vitest lulus dan tiga dilangkau dalam larian gabungan. Ujian keserasian PostgreSQL Issue #24 lulus pada DB khusus berasingan. Enam ujian Oracle sahaja turut lulus dengan URL PostgreSQL dikosongkan.
- Pada Oracle Free 23.26.4, HTTP loopback mengembalikan 503 ketika kontena makmal dihentikan. Proses API yang sama memberikan respons rujukan yang sepadan selepas kontena dimulakan semula.
- Import, eksport dan pemulihan 31 jadual lulus dengan SHA-256 yang sepadan. Laporan pemulihan menunjukkan 14 indeks LOB dalaman dan sifar ralat kompilasi. Bootstrap pertama menghasilkan satu jemputan. Bootstrap kedua ditolak.
- Lima senario Playwright lulus pada backend Oracle. Senario meliputi pendaftaran dan emel, syarikat dan jemputan wakil dengan PDF, pemulihan kata laluan, identiti tingkat selepas nama ditukar dan pautan unit merentas tingkat.
- Untuk Playwright menggunakan frontend baseline, jalankan API makmal dengan `ORACLE_LAB_API_PORT=3001` supaya proksi Vite sedia ada dapat digunakan. Jalankan Vite pada loopback port 5173 dan Playwright dengan `STAYLINK_ORACLE_LAB_HTTP=true`. Senario tingkat dan unit menyediakan akaun melalui pendaftaran makmal apabila flag ini aktif.

## Semakan Oracle 19.30 SE2 dan INDECS

- Runtime Thin mengasingkan owner dan runtime, mengesahkan PDB, pengguna, schema dan versi pada setiap pinjaman sambungan. Maksimum tiga sesi runtime, satu sesi pemasangan dan masa tunggu maksimum lima saat ialah tetapan makmal. JTIK tentukan had sesi dan pelan beban bersama berdasarkan staging. Semak `V$VERSION` untuk edition dan RU dalam PDB 19.30 SE2 sebenar yang diluluskan.
- Semua objek yang ditakrifkan aplikasi menggunakan `STL_`, termasuk indeks `STL_IX_COMPLETION_AUDIT` dalam migrasi 002. Nama dalaman `SYS_IL` untuk LOB yang dipadankan dengan jadual serta segmen `STL_` dicadangkan sebagai pengecualian teknikal tertakluk kepada persetujuan JTIK. ID aplikasi menggunakan UUID.
- Kunci utama transaksi ialah baris draf, serahan, kawasan atau templat, bersama semakan sesi dan skop yang berkaitan. Ordinal tingkat dan label unik dipelihara semasa pertukaran. Giliran semakan menapis daerah dan kuasa sebelum had halaman dan menggunakan cap masa UTC enam perpuluhan serta UUID sebagai pemutus seri.
- Uji pelan akses 19c untuk giliran dokumen/semakan, predikat `JSON_VALUE`, audit mengikut sasaran dan indeks FK di bawah beban serentak. Sebarang indeks tambahan memerlukan migrasi additive dengan nama `STL_`, pelan sebelum dan selepas dan persetujuan pemilik INDECS.
- Bukti Oracle Free 23.26.4 terhad kepada makmal. Ruang tablespace, 19.30 SE2, kesetaraan beban, regresi browser Oracle penuh, pemulihan fizikal dan cutover JTIK masih memerlukan latihan terasing serta pengesahan. Infra dan laluan Cloudflare Demo tidak terlibat.

[PR #64 dan bukti baseline](https://github.com/BangunanDotCom/sipintar-mbsp/pull/64) · [Skop Team 1](https://github.com/BangunanDotCom/sipintar-mbsp/issues/68) · [Pemasangan, inventori dan pemulihan baseline](ORACLE-19C-MIGRATION.md)
