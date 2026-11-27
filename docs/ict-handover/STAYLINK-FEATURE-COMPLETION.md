# Matriks pelaksanaan Issue #68

Calon `issue-68-complete-remaining-features` berasaskan Draft PR #83 pada `2d4c43663e64a227ccaa05abb3db7d57e52e4542`. Rujukan penilaian ialah calon penyatuan #84 dan audit bebas #72 pada `33b962638ab7c62eba084ca948296bf8aa28d794`. Complete Release dan Go Live kekal **NO-GO**. Personal Demo kekal ditangguhkan. [PR #83](https://github.com/BangunanDotCom/sipintar-mbsp/pull/83) · [PR #84](https://github.com/BangunanDotCom/sipintar-mbsp/pull/84) · [Audit Team 3](https://github.com/BangunanDotCom/sipintar-mbsp/blob/33b962638ab7c62eba084ca948296bf8aa28d794/docs/audit-pr67/PENUTUPAN-KECACATAN-PR81-84.md)

| Kumpulan | Status | Kod, UI, skema dan bukti | Baki |
| --- | --- | --- | --- |
| A · Pengurusan pegawai | PARTIAL | `routes.ts`, `Dashboard.tsx`, migrasi `202611270010`. API dan UI pelantikan pemangku dan sementara memerlukan daerah, tarikh tamat dan akaun latihan. Satu transaksi mencipta satu rekod skop bagi setiap daerah, menolak pertindihan dan merekod audit. Revokasi membatalkan sesi lama. | Pemilikan kes individu, pemindahan antara daerah, serah tugas dan skop semasa pengguna tunggal dalam Completion masih memerlukan aliran tambahan. Pelantikan berbilang daerah tidak mengubah peraturan fixture semakan semasa. |
| B · FA-02 | PARTIAL | `staff-mutation-authority.ts`, `routes.ts`, `services.ts`, gerbang Completion dan P0. Ujian API mengesahkan satu tindakan status selepas luput dengan rollback audit, notifikasi, sesi dan e-mel. Tiga ujian tindakan yang sudah bermula meliputi revokasi, perubahan daerah dan perubahan peranan. | Pengulangan sekatan dan rollback setiap endpoint serta pengesahan bebas Team 3 dan Oracle masih terbuka. |
| C · Lampiran BKT | PARTIAL | Intake BKT sedia ada dan gerbang P0 sedia ada kekal diuji bagi domain asal masing-masing. | Muat naik BKT, kuarantin, pemilikan lampiran, ikatan hash dan versi pada snapshot KP, UI dan perjalanan pelayar masih belum dibangunkan. |
| D · Refund dan pelarasan | PARTIAL | Lejar, rekonsiliasi, eksport dan padanan bil latihan sedia ada. | Lifecycle refund/dispute/reversal, kelulusan bebas, laporan pelarasan dan regresi baharu belum dibangunkan. Integrasi rasmi kekal ditutup. |
| E · Rekod | PARTIAL | Penapisan retensi, legal hold dan permintaan buka semula sedia ada. | Kelulusan bebas, penolakan dan versi kesinambungan masih belum dibangunkan. Pelupusan kekal ditutup. |
| F · Sejarah panjang | PARTIAL | `synthetic-completion-journal.ts`, `synthetic-completion.ts`, migrasi indeks `202611270050`. PostgreSQL memproses 499, 500, 501, 1,000 dan 5,000 acara dalam segmen. Duplikasi dan 5,001 acara ditolak. Had 8 MiB diperiksa sebelum setiap append. | Bukti Oracle dan penerimaan had operasi masih terbuka. |
| G · Notifikasi pegawai | PARTIAL | `training-staffing.ts` dan `training-reminders.ts`. Outbox latihan untuk mula dan batal pelantikan, dengan deduplikasi berdasarkan ID pelantikan dan jenis tindakan. Ujian dua worker mengesahkan penghantaran sekali dan pembatalan apabila kuasa berubah atau akaun digantung. | Notis pemindahan kes dan serah tugas menunggu aliran A. SMTP rasmi kekal ditutup. |
| HTTPS dua konteks | COMPLETE | `tests/e2e/portal.spec.ts` mewarisi base URL dan tetapan TLS Playwright untuk konteks wakil kedua. Rehearsal Nginx menjalankan ujian syarikat dan ujian pemangku melalui HTTPS. | Jangkauan ini terhad pada kit sintetik. |

## Inventori gerbang mutasi pegawai

Gerbang bersama mengunci pelaku dan pengguna terjejas mengikut ID, kemudian mengunci peranan dan sesi. Dalam transaksi, semak tahap pengesahan, peranan aktif, permission, skop daerah apabila berkaitan dan jam sebenar pangkalan data sebelum dan selepas kerja. Notifikasi pentadbir dan audit dikomit bersama mutasi. SMTP dijalankan selepas komit. Override peranan, Origin dan CSRF kekal dikawal pada sesi HTTP.

| Laluan | Kuasa dan gerbang | Bukti negatif tersedia |
| --- | --- | --- |
| `POST /api/admin/officers` | `users.manage`, MFA, gerbang bersama. Akaun, pelantikan, token aktivasi, audit dan notifikasi dalam transaksi yang sama | Suite RBAC dan aliran jemputan/pengesahan |
| `PATCH /api/admin/users/:id/status`, `POST /api/admin/users/:id/mfa-reset` | `users.manage`, MFA, gerbang bersama dan sekatan tindakan sendiri | Luput kuasa semasa transaksi status membatalkan keempat-empat kesan. Pemulihan MFA regresi sedia ada |
| `POST /api/admin/users/:id/roles`, `DELETE /api/admin/appointments/:id` | `roles.manage`, MFA, gerbang bersama dan lock pengguna | Akses tanpa kuasa, pendua serentak, tarikh tidak sah, sesi lama, audit dan notis lapuk |
| `POST /api/areas`, `POST /api/areas/assign` | `areas.write` atau `areas.assign`, skop daerah dan MFA. Pelantikan PIC disahkan sebelum dan selepas penugasan | Revokasi dan perubahan skop/peranan semasa menunggu serta akses silang daerah |
| `POST /api/templates`, `POST /api/templates/:id/versions`, `POST /api/template-versions/:id/activate` | `templates.write`, MFA dan gerbang bersama; versi dikunci mengikut templat | Peranan berlainan ditolak dan pengaktifan versi diuji |
| `POST /api/config/:scope` | Permission teknikal/operasi yang berasingan, MFA dan gerbang bersama | Pengasingan scope serta penolakan input semasa regresi |
| `POST /api/representations/:id/verify` | PIC global, MFA, dokumen CLEAN yang terkunci dan kuasa akhir | P0 negatif sedia ada, pengesah bebas serta revokasi dan verdict luput |
| `POST /api/synthetic-portal/reviews/:id`, `/precheck`, `/billing` | PIC/PPSK yang diperuntuk, MFA, skop dan semakan kuasa akhir | Luar daerah, pertukaran versi, bayaran dan bukti tidak layak |
| `POST /api/synthetic-portal/completion/:id`, `/records`, `/financial-ledger/reconciliation` | Peranan tindakan Completion atau PPSK dengan MFA dan skop; guard akhir | Luput ketika BKT, rollback lejar, legal hold, sesi dan versi |
| `POST /api/synthetic-portal/inactive-drafts/:id/remind` | PPSK dengan MFA dan skop. Guard akhir sebelum deduplikasi dan notis dikomit | Silang daerah, versi lapuk, percubaan serentak dan rollback |
| Callback sintetik | Tandatangan dan semakan skop transaksi mesin sedia ada | Replay, callback di luar skop dan amaun tidak sepadan |

## Kontrak Team 2 dan penerimaan Team 3

- `appointmentKind` lalai `STANDARD`. `ACTING` dan `TEMPORARY` memerlukan daerah, tarikh tamat dan opt-in `STAYLINK_SYNTHETIC_STAFFING=true`. Semak pertindihan separuh terbuka `[startsAt, endsAt)`. Pembuatan skop berbilang adalah atomik. Revokasi membatalkan sesi. Peristiwa `STAFF_APPOINTMENT` mempunyai `draftId` dan `draftVersion` null serta rujukan pelantikan dalam konteks yang disahkan.
- Jurnal kanonik menyimpan acara sedia ada. Replay memeriksa versi bulat positif berturutan, peranan pelaku dan kesahan peralihan. Segmen 250 versi dibaca dalam turutan stabil. Had keseluruhan ialah 5,000 acara dan 8 MiB JSONB bersiri. Larian replay yang gagal membuang unjuran memori. Tiada checkpoint berterusan. Team 2 perlu memadankan kuota byte, urutan versi/ID dan masa lock sebelum port Oracle.
- Team 3 perlu mengulang race luput sebelum komit, perubahan skop/peranan, revokasi lama, integriti replay selepas restore serta aliran HTTPS. Kelayakan rasmi pemangku, penyerahan, refund, rekod dan lampiran kekal dalam daftar keputusan.

[CI cabang calon](https://github.com/BangunanDotCom/sipintar-mbsp/actions/workflows/staylink-synthetic-uat.yml?query=branch%3Aissue-68-complete-remaining-features)
