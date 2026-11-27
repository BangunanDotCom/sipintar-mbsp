# Kesetaraan API PostgreSQL dan Oracle

Semakan bebas 25 November 2026. PostgreSQL pada PR #69 `7970f1f`, Oracle API makmal pada PR #71 `035fb7e`, dan repositori peristiwa Completion pada PR #70 `bfc4683`. Inventori diambil daripada operasi HTTP Fastify/OpenAPI yang didaftarkan semasa aplikasi dibina dalam profil ujian setiap cabang. Startup Oracle makmal memeriksa status migrasi 002 dalam skema sintetik. Inventori mendaftarkan operasi tanpa memanggil setiap endpoint. Laluan Swagger sendiri, HEAD automatik dan handler framework tidak dikira. **Makmal berdaftar** mengesahkan kewujudan kontrak pada adapter, manakala kesetaraan tingkah laku hanya terbukti bagi senario yang benar-benar diuji. Startup aplikasi biasa Oracle masih gagal tertutup. [PR #69](https://github.com/BangunanDotCom/sipintar-mbsp/pull/69) · [PR #70](https://github.com/BangunanDotCom/sipintar-mbsp/pull/70) · [PR #71](https://github.com/BangunanDotCom/sipintar-mbsp/pull/71)

**83 operasi pada setiap enjin dengan Completion diaktifkan.** Head terdahulu #71 `be329ed0` mendaftarkan 76. Head `035fb7e` mendaftarkan tujuh operasi Completion tambahan yang sama dengan PostgreSQL dan lulus ujian perjalanan terpilih pada kedua-dua enjin. Semua laluan rasmi memerlukan bukti sasaran Oracle 19.30 SE2 dan kelulusan berasingan. Dua P0 surat kuasa turut terpakai kepada konfigurasi makmal Oracle dan kekal di luar penutupan.

## Setiap operasi API

| Kaedah | Laluan | PostgreSQL #69 | Oracle #71 | Lingkup / bukti yang diperlukan |
|---|---|---|---|---|
| DELETE | `/api/admin/appointments/{id}` | Berdaftar | Makmal berdaftar | Kontrak read/write pentadbiran berskop |
| GET | `/api/admin/departments` | Berdaftar | Makmal berdaftar | Kontrak read/write pentadbiran berskop |
| POST | `/api/admin/officers` | Berdaftar | Makmal berdaftar | Kontrak read/write pentadbiran berskop |
| GET | `/api/admin/roles` | Berdaftar | Makmal berdaftar | Kontrak read/write pentadbiran berskop |
| GET | `/api/admin/services` | Berdaftar | Makmal berdaftar | Kontrak read/write pentadbiran berskop |
| GET | `/api/admin/users` | Berdaftar | Makmal berdaftar | Kontrak read/write pentadbiran berskop |
| POST | `/api/admin/users/{id}/mfa-reset` | Berdaftar | Makmal berdaftar | Kontrak read/write pentadbiran berskop |
| POST | `/api/admin/users/{id}/roles` | Berdaftar | Makmal berdaftar | Kontrak read/write pentadbiran berskop |
| PATCH | `/api/admin/users/{id}/status` | Berdaftar | Makmal berdaftar | Kontrak read/write pentadbiran berskop |
| GET | `/api/application-drafts` | Berdaftar | Makmal berdaftar | Kontrak hak pemilikan dan versi draf |
| POST | `/api/application-drafts` | Berdaftar | Makmal berdaftar | Kontrak hak pemilikan dan versi draf |
| GET | `/api/application-drafts/context` | Berdaftar | Makmal berdaftar | Kontrak hak pemilikan dan versi draf |
| GET | `/api/application-drafts/{id}` | Berdaftar | Makmal berdaftar | Kontrak hak pemilikan dan versi draf |
| PATCH | `/api/application-drafts/{id}` | Berdaftar | Makmal berdaftar | Kontrak hak pemilikan dan versi draf |
| GET | `/api/application-drafts/{id}/documents` | Berdaftar | Makmal berdaftar | Kontrak hak pemilikan dan versi draf |
| GET | `/api/application-drafts/{id}/floors` | Berdaftar | Makmal berdaftar | Kontrak hak pemilikan dan versi draf |
| PUT | `/api/application-drafts/{id}/floors` | Berdaftar | Makmal berdaftar | Kontrak hak pemilikan dan versi draf |
| GET | `/api/application-drafts/{id}/premises` | Berdaftar | Makmal berdaftar | Kontrak hak pemilikan dan versi draf |
| PUT | `/api/application-drafts/{id}/premises` | Berdaftar | Makmal berdaftar | Kontrak hak pemilikan dan versi draf |
| GET | `/api/application-drafts/{id}/submission-readiness` | Berdaftar | Makmal berdaftar | Kontrak hak pemilikan dan versi draf |
| POST | `/api/application-drafts/{id}/submit` | Berdaftar | Makmal berdaftar | Kontrak hak pemilikan dan versi draf |
| GET | `/api/application-drafts/{id}/units` | Berdaftar | Makmal berdaftar | Kontrak hak pemilikan dan versi draf |
| PUT | `/api/application-drafts/{id}/units` | Berdaftar | Makmal berdaftar | Kontrak hak pemilikan dan versi draf |
| GET | `/api/areas` | Berdaftar | Makmal berdaftar | Kontrak read/write pentadbiran berskop |
| POST | `/api/areas` | Berdaftar | Makmal berdaftar | Kontrak read/write pentadbiran berskop |
| POST | `/api/areas/assign` | Berdaftar | Makmal berdaftar | Kontrak read/write pentadbiran berskop |
| GET | `/api/areas/pics` | Berdaftar | Makmal berdaftar | Kontrak read/write pentadbiran berskop |
| GET | `/api/areas/{id}/resolve` | Berdaftar | Makmal berdaftar | Kontrak read/write pentadbiran berskop |
| GET | `/api/audit` | Berdaftar | Makmal berdaftar | Kontrak profil, konfigurasi, rekod atau metadata |
| POST | `/api/auth/activate` | Berdaftar | Makmal berdaftar | Kontrak identiti, pelantikan dan sesi |
| POST | `/api/auth/login` | Berdaftar | Makmal berdaftar | Kontrak identiti, pelantikan dan sesi |
| POST | `/api/auth/logout` | Berdaftar | Makmal berdaftar | Kontrak identiti, pelantikan dan sesi |
| GET | `/api/auth/me` | Berdaftar | Makmal berdaftar | Kontrak identiti, pelantikan dan sesi |
| POST | `/api/auth/mfa/recovery` | Berdaftar | Makmal berdaftar | Kontrak identiti, pelantikan dan sesi |
| POST | `/api/auth/mfa/setup` | Berdaftar | Makmal berdaftar | Kontrak identiti, pelantikan dan sesi |
| POST | `/api/auth/mfa/verify` | Berdaftar | Makmal berdaftar | Kontrak identiti, pelantikan dan sesi |
| POST | `/api/auth/password` | Berdaftar | Makmal berdaftar | Kontrak identiti, pelantikan dan sesi |
| POST | `/api/auth/recover` | Berdaftar | Makmal berdaftar | Kontrak identiti, pelantikan dan sesi |
| POST | `/api/auth/register` | Berdaftar | Makmal berdaftar | Kontrak identiti, pelantikan dan sesi |
| POST | `/api/auth/role` | Berdaftar | Makmal berdaftar | Kontrak identiti, pelantikan dan sesi |
| GET | `/api/companies` | Berdaftar | Makmal berdaftar | Kontrak syarikat, wakil dan jemputan |
| POST | `/api/companies` | Berdaftar | Makmal berdaftar | Kontrak syarikat, wakil dan jemputan |
| PATCH | `/api/companies/{id}` | Berdaftar | Makmal berdaftar | Kontrak syarikat, wakil dan jemputan |
| POST | `/api/companies/{id}/documents` | Berdaftar | Makmal berdaftar | Surat kuasa legacy. P0 A |
| POST | `/api/companies/{id}/invitations` | Berdaftar | Makmal berdaftar | Kontrak syarikat, wakil dan jemputan |
| GET | `/api/companies/{id}/representatives` | Berdaftar | Makmal berdaftar | Kontrak syarikat, wakil dan jemputan |
| POST | `/api/companies/{id}/representatives` | Berdaftar | Makmal berdaftar | Kontrak syarikat, wakil dan jemputan |
| POST | `/api/company-invitations/accept` | Berdaftar | Makmal berdaftar | Kontrak syarikat, wakil dan jemputan |
| POST | `/api/company-invitations/preview` | Berdaftar | Makmal berdaftar | Kontrak syarikat, wakil dan jemputan |
| GET | `/api/config/{scope}` | Berdaftar | Makmal berdaftar | Kontrak profil, konfigurasi, rekod atau metadata |
| POST | `/api/config/{scope}` | Berdaftar | Makmal berdaftar | Kontrak profil, konfigurasi, rekod atau metadata |
| GET | `/api/dashboard` | Berdaftar | Makmal berdaftar | Kontrak profil, konfigurasi, rekod atau metadata |
| GET | `/api/documents/{id}` | Berdaftar | Makmal berdaftar | Surat kuasa legacy. P0 A |
| GET | `/api/health` | Berdaftar | Makmal berdaftar | Liveness PG dan pemeriksaan sambungan Oracle lab |
| POST | `/api/notifications/{id}/read` | Berdaftar | Makmal berdaftar | Kontrak profil, konfigurasi, rekod atau metadata |
| PATCH | `/api/profile` | Berdaftar | Makmal berdaftar | Kontrak profil, konfigurasi, rekod atau metadata |
| POST | `/api/profile/identification` | Berdaftar | Makmal berdaftar | Kontrak profil, konfigurasi, rekod atau metadata |
| GET | `/api/public/districts` | Berdaftar | Makmal berdaftar | Kontrak profil, konfigurasi, rekod atau metadata |
| GET | `/api/representation-documents/{id}` | Berdaftar | Makmal berdaftar | Surat kuasa legacy. P0 A |
| GET | `/api/representations` | Berdaftar | Makmal berdaftar | Semakan wakil. P0 B |
| POST | `/api/representations/{id}/verify` | Berdaftar | Makmal berdaftar | Semakan wakil. P0 B |
| POST | `/api/synthetic-portal/callbacks/payment-second/{id}` | Berdaftar | Makmal berdaftar | Completion pada #71 terkini. #70 ialah persistensi sahaja |
| POST | `/api/synthetic-portal/callbacks/payment/{id}` | Berdaftar | Makmal berdaftar | Kontrak snapshot, semakan atau bil pertama latihan |
| GET | `/api/synthetic-portal/completion/queue` | Berdaftar | Makmal berdaftar | Completion pada #71 terkini. #70 ialah persistensi sahaja |
| GET | `/api/synthetic-portal/completion/{id}` | Berdaftar | Makmal berdaftar | Completion pada #71 terkini. #70 ialah persistensi sahaja |
| POST | `/api/synthetic-portal/completion/{id}` | Berdaftar | Makmal berdaftar | Completion pada #71 terkini. #70 ialah persistensi sahaja |
| GET | `/api/synthetic-portal/drafts/{id}` | Berdaftar | Makmal berdaftar | Kontrak snapshot, semakan atau bil pertama latihan |
| GET | `/api/synthetic-portal/drafts/{id}/billing` | Berdaftar | Makmal berdaftar | Kontrak snapshot, semakan atau bil pertama latihan |
| GET | `/api/synthetic-portal/drafts/{id}/completion` | Berdaftar | Makmal berdaftar | Completion pada #71 terkini. #70 ialah persistensi sahaja |
| POST | `/api/synthetic-portal/drafts/{id}/completion` | Berdaftar | Makmal berdaftar | Completion pada #71 terkini. #70 ialah persistensi sahaja |
| GET | `/api/synthetic-portal/drafts/{id}/completion/letters/{number}` | Berdaftar | Makmal berdaftar | Completion pada #71 terkini. #70 ialah persistensi sahaja |
| POST | `/api/synthetic-portal/drafts/{id}/evidence` | Berdaftar | Makmal berdaftar | Kontrak snapshot, semakan atau bil pertama latihan |
| POST | `/api/synthetic-portal/drafts/{id}/submit` | Berdaftar | Makmal berdaftar | Kontrak snapshot, semakan atau bil pertama latihan |
| GET | `/api/synthetic-portal/reviews` | Berdaftar | Makmal berdaftar | Kontrak snapshot, semakan atau bil pertama latihan |
| POST | `/api/synthetic-portal/reviews/{id}` | Berdaftar | Makmal berdaftar | Kontrak snapshot, semakan atau bil pertama latihan |
| GET | `/api/synthetic-portal/reviews/{id}/billing` | Berdaftar | Makmal berdaftar | Kontrak snapshot, semakan atau bil pertama latihan |
| POST | `/api/synthetic-portal/reviews/{id}/billing` | Berdaftar | Makmal berdaftar | Kontrak snapshot, semakan atau bil pertama latihan |
| GET | `/api/synthetic-portal/reviews/{id}/comparison` | Berdaftar | Makmal berdaftar | Kontrak snapshot, semakan atau bil pertama latihan |
| POST | `/api/template-versions/{id}/activate` | Berdaftar | Makmal berdaftar | Kontrak read/write pentadbiran berskop |
| GET | `/api/templates` | Berdaftar | Makmal berdaftar | Kontrak read/write pentadbiran berskop |
| POST | `/api/templates` | Berdaftar | Makmal berdaftar | Kontrak read/write pentadbiran berskop |
| POST | `/api/templates/{id}/versions` | Berdaftar | Makmal berdaftar | Kontrak read/write pentadbiran berskop |
| GET | `/api/upload-limits` | Berdaftar | Makmal berdaftar | Kontrak profil, konfigurasi, rekod atau metadata |

## Semakan transaksi, migrasi dan pemulihan

| Bidang | Bukti audit | Baki / pemilik |
|---|---|---|
| PR #70 · persistensi Completion | Kunci baris serahan dengan daerah dan pelaku, tolak snapshot yang sudah mempunyai pengganti, CLOB metadata, susunan versi dan rollback diperiksa pada Oracle Free. Repository bergantung pada caller untuk sesi, role dan peralihan domain | #71 terkini menyambung adapter HTTP dan berkongsi peralihan domain. Sahkan pada SHA calon dan hos JTIK |
| PR #71 · kontrak asas | HTTP dan DB sebenar loopback pada kedua-dua enjin untuk bukti/serahan/semakan/bil pertama, ID/ownership dan rollback, kawasan/peranan/templat, serta pengasingan perwakilan. Ujian Oracle khusus meliputi variasi tambahan seperti kursor dan transaksi | Lengkapkan ujian per endpoint dan peranan, terutama dokumen A/B, variasi konfigurasi dan respons kegagalan |
| Had 500 peristiwa | #69 dan handler bersama #71 terkini membaca sehingga 501 dan menolak sejarah melebihi 500. Jalur HTTP menulis melalui fungsi append tanpa had sebelum tulis pada kedua-dua adapter. #70 mempunyai pemeriksaan 500 dalam helper terdahulu. Analisis statik menunjukkan kemungkinan menerima rekod ke-501 ketika transisi masih layak, kemudian menolak bacaan kes | P1-01 untuk ketersediaan Completion. Setujui polisi panjang sejarah, semak had secara atomik sebelum append dan buktikan sempadan 499/500/501 serta pemulihan |
| Migrasi Oracle | Oracle DDL menggunakan implicit commit dan jejak APPLYING/APPLIED serta checksum. Migrasi 002 pada #71 menambah indeks audit Completion. Naik taraf skema berisi mengekalkan cap jari data. Grant owner/runtime makmal berasingan, kuota owner 100 MB. Audit menggunakan persekitaran Oracle Free 23.26.4 loopback | JTIK/DBA sahkan PDB 19.30 SE2 sasaran, hak objek minimum, kuota, grants tanpa DDL runtime, penamaan indeks LOB dalaman, pelan akses JSON, kebuntuan, cutover, undur dan hasil commit tidak tentu |
| Backup/restore | Export dan restore logik ke skema Oracle sintetik kosong dengan SHA sama, termasuk 17 peristiwa Completion di sumber dan sasaran. PostgreSQL pulih ke DB kosong pada latihan Completion terdahulu | Pulih DB/fail/konfigurasi/vault bersama, uji lesen/versi sasaran, rotation kunci, checksum objek, grant, RPO/RTO, Data Pump/RMAN, restore lejar/notifikasi dan failover dalam persekitaran JTIK yang diluluskan |
| Penyambung rasmi | Aliran bayaran dan tandatangan bahan latihan sahaja. Outbox/e-mel menggunakan Mailpit setempat. Storan/worker latihan dan kontrak model dokumen tersedia dalam skop terpilih | Kewangan/JTIK sahkan sandbox MBSPPay, lejar/refund dan callback. Jabatan Bangunan/JTIK sahkan sijil, penyedia dan stempel masa. JTIK luluskan stor/AV, SMTP, kunci dan log. Operasi rasmi kekal tertutup |

Sumber. [Kunci dan kontrak peristiwa #70](https://github.com/BangunanDotCom/sipintar-mbsp/blob/bfc468351091318d6a0f451c54709b8ca1e60110/apps/api/src/oracle/synthetic-completion.ts) · [Pendaftaran API Oracle #71](https://github.com/BangunanDotCom/sipintar-mbsp/blob/035fb7ebf14441d1dbadaeb5849dc6a55215bf86/apps/api/src/oracle/provider.ts) · [Pemproses Completion PostgreSQL #69](https://github.com/BangunanDotCom/sipintar-mbsp/blob/7970f1f857d245937fd0baaaf848e78e6f0ad1e7/apps/api/src/synthetic-portal-completion.ts) · [Serahan Team 2](https://github.com/BangunanDotCom/sipintar-mbsp/blob/be329ed0bd05daea5c4d64f056ea0e1e751d91dd/docs/ORACLE-TEAM2-HANDOVER.md)

[Kontrak Issue #68 pada head #71](https://github.com/BangunanDotCom/sipintar-mbsp/blob/035fb7ebf14441d1dbadaeb5849dc6a55215bf86/docs/ORACLE-ISSUE68-PARITY.md) · [Handler bersama](https://github.com/BangunanDotCom/sipintar-mbsp/blob/035fb7ebf14441d1dbadaeb5849dc6a55215bf86/apps/api/src/synthetic-portal-completion.ts) · [Adapter Oracle Completion](https://github.com/BangunanDotCom/sipintar-mbsp/blob/035fb7ebf14441d1dbadaeb5849dc6a55215bf86/apps/api/src/oracle/completion-runtime.ts)
