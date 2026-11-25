# STAYLink MBSP · Kesetaraan pangkalan data Issue #68

Draft PR #71 melaksanakan keseluruhan aliran penyelesaian sintetik melalui adapter PostgreSQL dan Oracle makmal. Kepala Team 1 yang disemak ialah PR #69 pada `7970f1f857d245937fd0baaaf848e78e6f0ad1e7` dan PR #70 pada `bfc468351091318d6a0f451c54709b8ca1e60110`. Aturan peralihan `synthetic-completion.ts` sepadan dengan PR #69. Kontrak peristiwa `synthetic-completion-contract.ts` sepadan dengan kedua-dua PR. Asas Oracle datang daripada PR #64 pada `4b55f385455216bf3c73a06dacad1bd2e333224e`. [PR #69](https://github.com/BangunanDotCom/sipintar-mbsp/pull/69) · [PR #70](https://github.com/BangunanDotCom/sipintar-mbsp/pull/70) · [Draft PR #71](https://github.com/BangunanDotCom/sipintar-mbsp/pull/71)

## Kontrak Team 1 dan matriks pembangunan

Semua laluan di bawah bermula dengan `/api/synthetic-portal`. Kedua-dua adapter menggunakan validasi HTTP dan aturan peralihan yang sama. Draf, premis, unit, tingkat, bukti dan daftar PIC/PPSK menggunakan snapshot yang telah diterima. Pautan UUID unit/tingkat menjadi skop keputusan. Kelayakan fi peringkat kedua menggunakan UUID unit unik.

| Aliran | Operasi | Bukti pada kedua-dua enjin |
| --- | --- | --- |
| Rujukan dan SLA | `GET /completion/queue`, `GET /completion/:id`, `REFER`, `REREFER` | Rujukan Perancang dan Kejuruteraan secara serentak, dua notifikasi dalam transaksi, giliran lewat dan pengasingan daerah. Tarikh akhir Team 1 ialah tujuh hari kalendar daripada cap rujukan. |
| Ulasan teknikal dan KP | `COMMENT`, `SUBMIT_PAPER` | Ulasan berskop unit/tingkat, konflik versi penulis serentak, KP berversi dan sejarah rujukan terdahulu. |
| Keputusan dan surat | `DECIDE`, `SIGN`, `GET /drafts/:id/completion/letters/:number` | Satu kes mengandungi SK, SKB, Tangguh dan Tolak. Surat induk dan susulan dieksport mengikut versi sebagai dokumen teks latihan. |
| Susulan pemohon | `GET /drafts/:id/completion`, `POST /drafts/:id/completion` dengan `RESPOND`, `CHECK_RESPONSE`, `ALLOW_RECONSIDERATION` | Skop pemohon, tindakan susulan SKB, ruang pertimbangan semula dan keputusan susulan. |
| Fi kedua dan rekonsiliasi | `ISSUE_SECOND`, `SETTLE_SECOND`, `POST /callbacks/payment-second/:id` | Fi per unit unik, kebergantungan pada bayaran pertama, pengesahan HMAC dan dua callback serentak menghasilkan satu penyelesaian. |
| Penutupan | `CLOSE` | Penutupan berversi dan sekatan pindaan draf atau bukti selepas tutup. |

Arahan pegawai dihantar ke `POST /completion/:id` dengan badan `{ version, command }`. Callback menggunakan badan `{ payload }` dan pengepala `x-staylink-synthetic-signature`. Kedua-dua enjin menyimpan `SYNTHETIC_PORTAL_COMPLETION` berstatus `SUCCESS` dengan sasaran ID serahan, pelaku, peranan dan metadata `{ version, timestamp, firstPaid, feeSen, invoiceId?, command }`. Peranan kosong sah bagi peristiwa `SETTLE_SECOND` oleh penyedia sintetik yang ditetapkan. Bacaan Oracle CLOB dan PostgreSQL JSONB mengesahkan struktur serta versi berturutan sebelum memainkan semula peristiwa.

Laluan Team 1 asal memanggil Prisma secara langsung. PR #71 menggantikannya dengan adapter khusus pangkalan data dan mengekalkan kontrak HTTP serta peristiwa. Tiada perubahan pada bentuk payload, migrasi Prisma atau frontend. Kunci serahan menyusun penulis. Kunci draf menyusun penutupan dengan suntingan dan tangkapan bukti. Peristiwa, lejar berkaitan dan notifikasi menggunakan transaksi yang berkenaan. Bacaan konsisten menggunakan PostgreSQL Repeatable Read dan Oracle Serializable. Oracle menunggu kunci serahan maksimum lima saat dan memetakan kegagalan kunci yang dijangka kepada HTTP 409.

## Pemasangan dan pemulihan

Gunakan skema owner dan runtime daripada panduan Team 2, dengan polisi semakan aktif dan bil sintetik `MOCK`. Jalankan `install.ts apply` sebelum `seed.ts` dengan `ORACLE_LAB_ENABLE_COMPLETION=true` agar runtime mendapat hak baca sejarah migrasi. Oracle memerlukan `NODE_ENV=test`, `STAYLINK_ORACLE_LAB_SYNTHETIC=true`, `STAYLINK_SYNTHETIC_COMPLETION=true` dan proses tanpa `STAYLINK_DEMO_HOST=true`. Runner HTTP memerlukan tambahan `STAYLINK_ORACLE_LAB_HTTP=true` serta origin loopback. Tetapkan empat UUID sintetik dalam JSON `STAYLINK_SYNTHETIC_COMPLETION_ASSIGNMENTS` dengan kekunci `PERANCANG_BANDAR`, `KEJURUTERAAN`, `URUS_SETIA_JK` dan `PEGAWAI_PENANDATANGAN`. Asingkan identiti tersebut daripada PIC dan PPSK. Tetapkan daerah, kunci callback latihan serta `STAYLINK_SYNTHETIC_SECOND_UNIT_FEE_SEN` bagi ujian pengeluaran invois kedua. [Panduan Team 2](ORACLE-TEAM2-HANDOVER.md)

Migrasi `002-completion-audit` mempunyai SQL, manifest dan checksum tersendiri. Indeks biasa `STL_IX_COMPLETION_AUDIT` menggunakan `ACTION, TARGET, OUTCOME` pada `STL_AUDIT_LOGS`. Inventori jadual, data dan checksum migrasi 001 dikekalkan. Sebelum naik taraf, eksport sandaran ke fail persendirian. Jika DDL terhenti pada `APPLYING`, semak `recovery.ts` dan gunakan skema makmal kosong lain untuk pemulihan teruji. DDL Oracle melakukan implicit commit. Data storan fail luaran dan kunci dipulihkan melalui proses berasingan. Cadangan pengecualian penamaan `SYS_IL` terhad kepada 14 indeks LOB janaan Oracle yang dipadankan dengan jadual dan segmen `STL_`, tertakluk kepada kelulusan JTIK.

## Bukti makmal

Tetapkan `DATABASE_URL` dan `TEST_DATABASE_URL` kepada DB ujian loopback yang sama. Bagi larian PostgreSQL yang menguji gerbang Personal Demo, gunakan `APP_ORIGIN=https://localhost:5444`. Jalankan `npm run db:test:migrate` sebelum suite. Gunakan fail env persendirian untuk kedua-dua skema Oracle dan bekalkan kunci sintetik untuk MFA, identiti dan callback.

```bash
STAYLINK_TEST_COMPLETION_PARITY=true \
ORACLE_LAB_COMPLETION_OWNER_ENV="$ORACLE_LAB_OWNER_ENV" \
ORACLE_LAB_COMPLETION_RUNTIME_ENV="$ORACLE_LAB_RUNTIME_ENV" \
  npx vitest run tests/completion-provider-parity.test.ts tests/synthetic-completion.test.ts
```

- Larian regresi Team 2 mencatatkan 438 ujian lulus dan 5 dilangkau. Larian fokus berasingan dengan kedua-dua DB diaktifkan mencatatkan 6 ujian lulus, termasuk aliran API hujung ke hujung pada setiap enjin dan 4 ujian domain Team 1. PostgreSQL menggunakan DB loopback khusus `staylink_issue62_personal_completionparity_test` dan `STAYLINK_TEST_COMPLETION_PARITY=true`. Oracle Free 23.26.4 menggunakan `ORACLE_LAB_COMPLETION_OWNER_ENV` dan `ORACLE_LAB_COMPLETION_RUNTIME_ENV` yang menunjuk kepada skema makmal khusus.
- Suntikan kegagalan FK pada notifikasi teknikal kedua mengesahkan bahawa peristiwa rujukan dan notifikasi pertama ditarik balik dalam kedua-dua enjin. Larian turut menguji akses pegawai daerah lain, peranan yang salah, pengulangan callback dan versi ulasan serentak. TypeScript, lint dan binaan aplikasi lulus.
- Naik taraf skema baseline berisi data ke 002 mengekalkan SHA-256 snapshot `0b726b1f89907c2939982f400e92c96de91f3f92742a86ce9fbfa1e339c77673`. Import PostgreSQL, eksport Oracle dan pemulihan Oracle bagi 31 jadual mempunyai SHA-256 sepadan `6b586b805f320467245b95687c4c72388a7c8e8cd49ee8712c855f90978d3384`. Dua kes pulih dengan 17 versi berturutan setiap kes dan `CLOSE` sebagai peristiwa akhir. Kedua-dua migrasi berstatus `APPLIED`, tanpa ralat kompilasi objek `STL_`.
- Ujian putus sambungan menghentikan kontena Oracle Free. API loopback memberi `503 DATABASE_UNAVAILABLE` semasa gangguan dan kembali kepada `200` dalam proses yang sama. Sandaran sebelum dan selepas gangguan sepadan dan mengandungi 34 peristiwa penyelesaian.

## Serahan JTIK

Oracle Free 23.26.4 menyediakan bukti makmal. Pengesahan Oracle 19.30 SE2 memerlukan PDB terasing yang diluluskan JTIK, peranan owner/runtime untuk pelan schema INDECS, semakan pelan akses dan had pool di bawah beban bersama, serta latihan pemulihan fizikal dan cutover. Pemilik proses dan Team 1 menentukan kadar fi, SLA rasmi, tandatangan, templat, retensi, storan dan integrasi rasmi. Perubahan lanjut pada kontrak perlu dirujuk kepada Team 1 sebelum adapter diubah. [Asas Oracle dan inventori INDECS](ORACLE-19C-MIGRATION.md)
