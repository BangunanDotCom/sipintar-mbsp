# STAYLink MBSP · Asas migrasi Oracle 19c SE2

Baseline rujukan ialah `72b04f61b195d031a07f2079f0f8c14523ee1ef7`. Cabang ini menyediakan skema dan alat migrasi Oracle 19c, repository awal Oracle melalui Thin mode, seed makmal dan ujian berasingan. API aplikasi masih menggunakan PostgreSQL. Tetapan `STAYLINK_DB_PROVIDER=oracle` menghentikan permulaan sehingga port semua laluan API selesai.

## Sambungan daripada commit `298f6679`

**Status runtime penuh: fail-closed.** Laluan HTTP yang disenaraikan di bawah menggunakan repository Oracle apabila didaftarkan secara eksplisit dalam ujian makmal. Permulaan API biasa masih menolak `STAYLINK_DB_PROVIDER=oracle`.

| Skop | Kemajuan sambungan |
| --- | --- |
| Akaun | Pendaftaran, emel pengaktifan, log masuk dan keluar, sesi, CSRF, pertukaran peranan, penukaran kata laluan, token pemulihan dan MFA melalui repository Oracle. Test HTTP meliputi pengaktifan, penolakan pengulangan kod dan pembatalan sesi. |
| Syarikat dan kuasa wakil | Repository Oracle untuk jemputan, pratonton, senarai wakil dan penerimaan sekali sahaja. Penerimaan mengunci syarikat dan wakil pemberi jemputan, menyemak kuasa semula dan mencatat audit dalam transaksi yang sama. CRUD syarikat, profil, surat kuasa dan pengesahan wakil oleh PIC masih menggunakan PostgreSQL. |
| Dokumen | Worker makmal Oracle untuk lease imbasan, pemeriksaan integriti, pengambilan semula lease tamat dan penolakan keputusan worker lama. API pengurusan draf, premis, unit, tingkat serta metadata dokumen masih menggunakan PostgreSQL. |
| Notifikasi dan pentadbiran | Notifikasi, outbox, percubaan semula SMTP, penandaan notifikasi dibaca, konfigurasi berversi, audit berskop dan status perkhidmatan. Pengurusan pegawai, peranan, kawasan, templat dan dashboard masih memerlukan port. |
| Serahan, PIC/PPSK dan bil | Laluan penyerahan, semakan, invois sintetik, lejar fi dan rekonsiliasi masih menggunakan PostgreSQL. |
| Operasi data | Seed rujukan Oracle, migrasi DDL makmal, import PostgreSQL sintetik, sandaran logik dan pemulihan ke skema Oracle makmal kosong. Bootstrap, kit UAT Oracle, prosedur DBA sasaran dan pemulihan stor dokumen masih diperlukan. |

### Skop makmal dan cadangan SYS_IL

Jejak audit pemulihan melaporkan `proposedLobIndexExceptions` daripada padanan `USER_LOBS` dan `USER_INDEXES`. Entri mesti merupakan indeks LOB janaan Oracle dengan awalan `SYS_IL`, terikat kepada jadual dan segmen `STL_`. Oracle Free 23.26.4 melaporkan 14 entri. Kekalkan penamaan `STL_` bagi semua objek yang ditakrifkan oleh aplikasi dalam schema gunasama INDECS. Pengecualian ini dicadangkan khusus untuk indeks LOB dalaman tersebut dan tertakluk pada persetujuan JTIK.

`oracle:seed` menyediakan rol, izin, daerah, jabatan, kategori templat dan fixture sesi. Akaun runtime makmal lalai mendapat grant minimum baseline. Tetapkan flag `ORACLE_LAB_ENABLE_AUTH`, `ORACLE_LAB_ENABLE_MANAGEMENT`, `ORACLE_LAB_ENABLE_COMPANY_INVITATIONS` dan `ORACLE_LAB_ENABLE_DOCUMENT_SCAN` kepada `true` pada arahan seed untuk memberi grant tambahan bagi skop makmal yang dipilih. Ujian integrasi menggunakan kedua-dua fail env Oracle serta Mailpit loopback pada port SMTP 1025 dan HTTP 8025.

```bash
node --env-file="$ORACLE_LAB_RUNTIME_ENV" --import tsx scripts/oracle/retry-email.ts
node --env-file="$ORACLE_LAB_RUNTIME_ENV" --import tsx scripts/oracle/scan-documents.ts
```

Percubaan semula emel Oracle terhad kepada SMTP loopback dan penerima `@example.test`. Rekod dengan status `SENDING` memerlukan rekonsiliasi jika pengesahan pangkalan data gagal selepas SMTP menerima mesej. Worker pengimbas memerlukan stor kuarantin dan ClamAV yang sah mengikut prasyarat sedia ada.

### Latihan import dan pemulihan logik

Sediakan skema sumber dan skema pemulihan berasingan dengan nama makmal dan DDL baseline sepadan. Pembacaan eksport menggunakan satu transaksi baca sahaja. Pemulihan menyemak cap SHA-256, susunan kebergantungan FK dan cap jari baris sebelum komit. Oracle mengekalkan constraint serta pencetus semasa latihan. Fail dicipta dengan mod `0600`, had 64 MiB dan nama baharu. Letakkan fail data sintetik di luar Git.

```bash
node --env-file="$ORACLE_LAB_OWNER_ENV" --import tsx scripts/oracle/backup.ts export "$ORACLE_LAB_BACKUP"
node --env-file="$ORACLE_LAB_RESTORE_ENV" --import tsx scripts/oracle/install.ts apply
node --env-file="$ORACLE_LAB_RESTORE_ENV" --import tsx scripts/oracle/backup.ts restore "$ORACLE_LAB_BACKUP"
```

Untuk latihan lintas enjin, tetapkan `ORACLE_LAB_POSTGRES_URL` dengan URL PostgreSQL loopback khusus berformat `staylink_*_test`. Gunakan satu lagi skema destinasi makmal kosong yang telah melalui `install.ts apply`.

```bash
node --env-file="$ORACLE_LAB_IMPORT_ENV" --import tsx scripts/oracle/backup.ts import-postgres
```

Import meliputi 31 jadual aplikasi daripada manifest. Konfigurasi JSON disimpan dalam objek berversi supaya nilai skalar seperti `false` dan rentetan kosong boleh digunakan dengan kekangan Oracle 19c. Latihan menguji data aplikasi dalam jadual. Objek fail persendirian, kunci penyulitan, grant, konfigurasi luaran, Data Pump dan RMAN memerlukan prosedur operasi serta pengesahan pemulihan berasingan.

**Bukti sambungan.** Oracle Free 23.26.4 digunakan untuk ujian DDL, repository, HTTP terpilih dan latihan import serta pemulihan dengan cap jari sepadan. Pemulihan ke destinasi berisi dan input dengan cap jari yang berubah ditolak. Pengesahan Oracle 19.30 SE2 dan portal Oracle hujung ke hujung masih terbuka.

## Rekod baseline awal

Jadual dan bukti di bawah ialah rekod sebelum sambungan ini.

## Inventori dan audit baseline

- `prisma/schema.prisma` mempunyai 31 model berpeta. `database/oracle/001-baseline.sql` meliputi kesemuanya. `000-history.sql` menambah jadual sejarah. Senarai nama jadual, indeks, constraint, pencetus, segmen LOB dan view ada dalam `001-inventory.json`. Langkah 000 menambah `STL_SCHEMA_MIGRATIONS`, indeks `STL_HIST_PK` dan constraint `STL_HIST_VERSION_NN`, `STL_HIST_CHECKSUM_NN`, `STL_HIST_STATE_NN`, `STL_HIST_START_NN`, `STL_HIST_PK` dan `STL_HIST_STATE_CK`.
- Semakan mengambil kira kesemua 10 migrasi PostgreSQL daripada `202610290001_core` hingga `202611190003_synthetic_submissions`. Foreign key daripada SQL, termasuk hubungan permohonan dan wakil yang tidak digambarkan sebagai relasi Prisma, dibawa ke DDL. Indeks unik bersyarat kawasan dan pembetulan menggunakan indeks fungsi Oracle. Dua pencetus skop STL melindungi serahan tidak berubah dan had catatan draf.
- Skema mengandungi pemetaan penamaan Oracle. Nama daripada camelCase dipetakan kepada UPPER_SNAKE_CASE. Semua nama yang ditakrifkan aplikasi menggunakan STL_ dan maksimum 30 aksara. Oracle boleh menjana indeks dalaman LOB dengan nama sistem `SYS_IL…`. Segmen LOB diberi nama STL_. JTIK perlu mengesahkan layanan objek dalaman Oracle dalam piawaian penamaan sebelum pemasangan schema gunasama.
- Peruntukan collation dan AL32UTF8 serta panjang kolum Oracle perlu disahkan terhadap set aksara sasaran. Lebar VARCHAR2 dihadkan secara eksplisit. Indeks unik untuk medan normalisasi dan rujukan fail tidak bergantung pada Extended Data Types.

## Matriks keserasian PostgreSQL–Oracle

| PostgreSQL / Prisma | Pelaksanaan atau padanan Oracle | Sempadan semakan |
| --- | --- | --- |
| `text` UUID dan hash | UUID aplikasi melalui `randomUUID`, nilai sedia ada disimpan sebagai VARCHAR2 | Port import sebenar memerlukan pemetaan ID dan semakan panjang. Tiada sequence atau identity Oracle. |
| `jsonb`, JSON pada DTO | CLOB dengan `IS JSON STRICT`. Audit membind objek JSON sebagai CLOB | Oracle 19c mempunyai perbezaan untuk nilai JSON skalar. Tentukan envelope khusus konfigurasi sebelum port nilai skalar dan semak ketetapan laluan query. |
| `boolean`, `bytea`, decimal | NUMBER(1,0) dengan CHECK 0/1, BLOB terikat, NUMBER(12,2) untuk keluasan | Penukaran boolean dan bind BLOB diuji di makmal. Baki nilai decimal DTO dan integer besar mesti ditangani tanpa ketepatan JS yang hilang. |
| Timestamp dan tarikh sahaja | TIMESTAMP WITH TIME ZONE, default SYSTIMESTAMP, bind UTC untuk audit. DATE dengan semakan tengah malam bagi tarikh sahaja | Semak data PostgreSQL tanpa zon terhadap kontrak UTC. Kekalkan mikrodetik dalam kursor serahan dan semak tingkah laku Node DATE. |
| String kosong dan NULL | String opsyen kosong dipetakan kepada NULL. Catatan draf menggunakan EMPTY_CLOB dan had pada pencetus | Pemulangan DTO perlu membezakan SQL NULL daripada kosong logik. Audit sendiri tidak mengeluarkan metadata kepada API. |
| FK dan CHECK | FK komposit skop dokumen, floor links dan pembetulan dikekalkan. CHECK kapasiti, pin, nombor versi dan status dibawa ke DDL | Oracle tidak mempunyai ON UPDATE CASCADE. ID rujukan mesti kekal dan perubahan ID tidak dibenarkan melalui repo. |
| Unik separa dan lajur nullable | Indeks berasaskan CASE untuk kawasan aktif dan pembetulan. Baris tanpa previous ID tidak terhad kepada satu setiap draf | Ujian makmal memastikan FK merentas draf ditolak dan pembetulan berganda gagal. |
| `FOR SHARE` dan lock draf | Oracle tiada `FOR SHARE`. Port keadaan tulis memerlukan susunan `FOR UPDATE` dan semakan semula | Jangan buang lock atau semakan kuasa. Uji deadlock, race scan/sesi/tugasan dan retest masa tamat. |
| RepeatableRead, pg advisory lock, Prisma batch | Pertimbang transaksi read-only/serializable serta baris penyelaras bertaraf STL untuk operasi singleton | Deadlock dan ORA-08177 memerlukan kontrak retry pada operasi idempotent. Port bootstrap dan penjana kit belum dibuka. |
| JSONB operators, PostgreSQL cast dan offset pagination | JSON_VALUE/JSON_EXISTS, TO_CHAR UTC dan susunan kursor yang stabil. Nilai kriteria wajib bind | Queue PIC/PPSK, semakan bukti dan penomboran fi memerlukan regresi API yang sama sebelum cutover. |
| `UNIQUE` dan ralat Prisma | Pemetaan ralat Oracle dengan nama constraint yang diketahui | API belum menggunakan pemetaan kod ORA. Jangan tangkap semua kegagalan sebagai 409 tanpa membezakan konflik dan masalah operasi. |
| Trigger PL/pgSQL tidak berubah | BEFORE UPDATE/DELETE Oracle per baris dengan RAISE_APPLICATION_ERROR | Ujian makmal mengesahkan rekod tidak boleh dikemas kini. Kebenaran DBA terhadap DDL ialah gerbang operasi berasingan. |

## Audit penggunaan aplikasi dan kerja port yang masih diperlukan

| Bahagian aplikasi | Perkara diaudit | Status Oracle |
| --- | --- | --- |
| Sesi, peranan dan audit | `auth.ts`, `core.ts`, `synthetic-portal-session.ts`. Prisma join/peranan, Argon2, satu transaksi MFA/recovery, cookie Origin/CSRF, notification/outbox dan audit | Repository membaca sesi dan tugasan PIC melalui satu statement konsisten. Repository audit menulis menggunakan bind dalam transaksi. Log masuk, revoke, MFA/recovery, outbox dan akaun **belum** disambung ke Oracle. |
| Syarikat, wakil dan profil | `company-invitations.ts`, `application-drafts.ts`, `services.ts`, `routes.ts`. FK jemputan, semakan kuasa dan lock wakil | DDL tersedia. Port transaksi penamatan dan lock kuasa wakil diperlukan. |
| Permohonan, premis dan bukti | `application-drafts.ts`, `application-documents.ts`, `premises.ts`, `premise-units.ts`, `premise-floors.ts` dan fail `document-*`. Lock versi, metadata, kuarantin dan sewaan pengimbas | DDL tersedia. Repository draf, bukti dan lease pengimbas belum disambung. Pengambilan dokumen atau fail sebenar memerlukan gerbang operasi sedia ada. |
| Serahan dan pegawai | `synthetic-submissions.ts`, `synthetic-portal.ts`, `synthetic-portal-review.ts`. Lock draf/dokumen, rollback, pagination berkunci, audit, semakan daerah, data JSON | DDL, trigger dan constraint diuji pada fixture. Port kerja PIC/PPSK, polisi dan idempotensi aplikasi masih perlu ujian API penuh. |
| Invois dan rekonsiliasi latihan | `synthetic-portal-billing.ts`. Lock serahan, lejar audit, deduplikasi UUID, callback dan jumlah sen | Algoritma sedia ada kekal pada PostgreSQL. Port lejar/lock/callback belum aktif. |
| Operasi dan templat | `routes.ts`, `services.ts`, `scripts/bootstrap.ts`, `scripts/synthetic-uat-demo.ts`, `scripts/uat-preflight.ts`. Batch DML, advisory locks, health dan seed | CLI Oracle hanya menyediakan makmal dan seed rujukan. Portal dan skrip PostgreSQL sedia ada kekal sebagai rujukan. |

## Matriks keistimewaan JTIK

| Identiti | Minimum yang diperlukan untuk skop ini | Pengasingan |
| --- | --- | --- |
| Pemilik objek/pemasang dalam schema yang dibenarkan | CREATE SESSION, CREATE TABLE, CREATE VIEW, CREATE TRIGGER dan kuota terhingga pada tablespace lalai. Pemilik boleh mencipta indeks atas jadual sendiri, menulis sejarah dan memberi grant objek yang dimilikinya | Penyediaan akaun dan kuota oleh pentadbir DB. Pengesahan akses dalam schema gunasama dan pelan sandbox diasingkan daripada kata laluan aplikasi. |
| Runtime prototaip makmal | CREATE SESSION, SELECT untuk STL_SESSIONS, STL_USERS, STL_USER_ROLE_ASSIGNMENTS dan STL_PERMISSIONS. INSERT sahaja pada STL_AUDIT_LOGS | Identiti lain daripada owner. Nama schema dilayakkan oleh allowlist tetap. Tiada grant DBA, rol ANY, DDL, UPDATE/DELETE audit atau akses ke jadual sistem lain. |
| Runtime aplikasi selepas port lengkap | Semakan grant per endpoint dan per kolum jika perlu. Tambah DML hanya apabila senarai repository dan autorisasi disemak | Tiada grant lintas schema sistem lain. Akses masa hadapan melalui API atau view yang dipersetujui JTIK. |
| Pentadbir sandaran/pemulihan | Keistimewaan operasi disemak dan diberikan JTIK kepada pasukan DB | Pemulihan berdasarkan allowlist STL dan inventori. Akaun runtime aplikasi tidak menerima kuasa sandaran atau pemulihan. |

Kuota 100 MB digunakan dalam makmal untuk pengesahan. JTIK menentukan tablespace, ruang data/index/LOB, jumlah sesi, tetingkap DDL dan impak kapasiti. Runner sendiri tidak meminta CREATE SEQUENCE, CREATE PROCEDURE, CREATE TYPE, keistimewaan DBA atau Oracle Enterprise options.

## Localhost terasing

Sediakan Oracle ujian dan maklumat penyambungannya melalui salinan privat `database/oracle/lab.env.example`. Gunakan loopback, dua akaun `STL_LAB_*` yang berasingan, dan isi nilai SYS_CONTEXT DB_NAME serta nama PDB makmal. Contoh menggunakan Oracle Free sebagai semakan awal. Bukti padanan teknikal 19c memerlukan Oracle 19c SE2 dalam PDB sintetik yang dibenarkan. Gunakan versi Node 22 dan npm lockfile.

```bash
npm ci
node --env-file="$ORACLE_LAB_OWNER_ENV" --import tsx scripts/oracle/install.ts preflight
node --env-file="$ORACLE_LAB_OWNER_ENV" --import tsx scripts/oracle/install.ts apply
node --env-file="$ORACLE_LAB_OWNER_ENV" --import tsx scripts/oracle/seed.ts
ORACLE_LAB_OWNER_ENV="$ORACLE_LAB_OWNER_ENV" ORACLE_LAB_RUNTIME_ENV="$ORACLE_LAB_RUNTIME_ENV" \
  npx vitest run tests/oracle-contract.test.ts tests/oracle-integration.test.ts
```

Seed hanya menghasilkan rol, izin, daerah, seorang pegawai sintetik dan konteks sesi untuk ujian repository. Tiada akaun demo Oracle untuk digunakan pada UI. Tetapkan kata laluan unik di luar Git. `ORACLE_LAB_RUNTIME_USER` diperlukan untuk memberi grant makmal yang kecil. Tanpa fail env, suite Oracle sebenar dilangkau. Portal PostgreSQL setempat boleh dijalankan dengan persediaan baseline.

## Pemasangan dan pemulihan

1. Semak versi, edition, PDB, pemilik, keistimewaan, kuota dan inventori STL pada persekitaran yang diluluskan. `preflight` adalah semakan baca sahaja. CLI semasa sengaja mengehadkan sambungan kepada Oracle makmal loopback dan identiti makmal. Konfigurasi sasaran MBSP perlu disediakan di luar repositori dan memerlukan gerbang kelulusan berasingan.
2. Setujui manifest objek dan pemeriksaan pertindihan. Pemasang menolak sebarang objek STL sedia ada tanpa sejarah/aplikasi yang sepadan. `STL_SCHEMA_MIGRATIONS` menyimpan SHA-256 bagi DDL dan inventori, bersama keadaan APPLYING/APPLIED. Pemasangan lengkap dengan checksum sah boleh diperiksa semula tanpa menjalankan semula DDL.
3. DDL Oracle mempunyai implicit commit. Apabila kunci sejarah APPLYING sudah direkod dan langkah gagal, hentikan pengulangan. Kumpul status objek dan ralat kompilasi tanpa data aplikasi.

```bash
node --env-file="$ORACLE_LAB_OWNER_ENV" --import tsx scripts/oracle/recovery.ts
```

4. Simpan inventori selepas insiden dan padankan dengan senarai awal. Pulihkan ke PDB/schema ujian berasingan melalui prosedur DBA yang diluluskan dan uji versi, FK, trigger, bilangan serta cap jari rekod STL. Pembaikan ke depan atau pemulihan terpilih terhadap objek STL di hos asal memerlukan perubahan khusus yang disemak JTIK. Skrip tiada pemadaman pukal atau percubaan membatalkan DDL secara automatik.
5. Sebelum pertukaran sistem, kekalkan PostgreSQL baseline, takrifkan eksport/import STL, sahkan row count serta hash tanpa mencetak PII, uji pemulihan dan tetapkan tetingkap henti perubahan. Cutover, dual-write dan migrasi data sebenar belum dilaksanakan.

## Gerbang untuk JTIK

Pengesahan Oracle 19.30 SE2 sebenar memerlukan akses PDB terasing yang diluluskan, semakan kuota dan plan/query load, kelulusan reka bentuk runtime yang berasingan dan keputusan penamaan indeks LOB dalaman. API dan Playwright mesti berjalan menggunakan Oracle pada seluruh laluan sebelum penggunaan. Baseline PostgreSQL, laluan produksi dan aplikasi portal sedia ada kekal sebagai rujukan.

## Bukti pengujian penggal ini

| Pemeriksaan | Bukti |
| --- | --- |
| Oracle makmal | Oracle Free `23.26.4.0.0`, driver Thin. Preflight pada schema kosong, pemasangan, pemeriksaan tanpa DDL ulangan dan seed berulang lulus. Semakan ini tidak menggunakan Oracle MBSP. |
| Kegagalan DDL dan pertindihan | Pencetus dengan `UPDATE OF` pada LOB ditolak dalam percubaan awal. Runner mengekalkan APPLYING dan menolak ulang jalan. Pencetus dibetulkan dan diuji dalam schema segar. Ujian pertindihan STL berasingan mengekalkan objek sedia ada tanpa menambah sejarah. |
| Penamaan LOB | 14 indeks dalaman LOB dengan awalan sistem SYS_IL diperhatikan pada Oracle Free. Semua nama objek yang ditakrifkan oleh aplikasi mengikut inventori STL. |
| Vitest | 339 lulus termasuk 11 kontrak Oracle dan 5 integrasi Oracle Free. Integrasi merangkumi transaksi audit dan rollback, sesi/izin/daerah, grant minimum, CLOB/BLOB, constraint idempotensi, FK skop dan pencetus. |
| PostgreSQL rujukan | 79 ujian API dan satu semakan keserasian pada DB berasingan lulus. Playwright biasa 27 lulus. Ujian khusus hos HTTPS dilangkau dalam larian ini dan telah mempunyai bukti pada baseline. |
| Toolchain | TypeScript, lint dan build lulus. npm audit melaporkan 0 kerentanan. Amaran saiz chunk peta sedia ada kekal. |
| Belum dipenuhi | Oracle 19.30 SE2, pengujian API/Playwright hujung ke hujung di Oracle, migrasi data dan cutover. Eksport/import serta pemulihan fizikal Oracle belum diuji. |

## Kontrak skop dan sejarah Issue #68

Repository makmal `apps/api/src/oracle/synthetic-completion.ts` menggunakan objek STL sedia ada. Ia mengunci serahan terkini mengikut daerah dan pelaku yang dikecualikan, memeriksa versi peristiwa dan menulis audit CLOB dinamakan dalam transaksi pemanggil. Ujian makmal meliputi perbezaan daerah, konflik versi, pembacaan CLOB dan rollback. Laluan HTTP Oracle untuk rujukan, keputusan, surat dan penutupan masih memerlukan transaksi sesi, peranan, wakil, pembayaran dan notifikasi yang setara serta gerbang runtime penuh. Ujian Oracle Free tidak mengesahkan Oracle 19.30 SE2.
