# Pemantapan UAT dan keselamatan STAYLink MBSP · Issue #36

Rujuk [kontrak asas portal sintetik](SYNTHETIC-PORTAL.md) dan [skrip fasilitator](DEMO.md). Asas pembangunan ialah PR #35, di atas PR #32–#34.

## Kontrak API dan matriks akses

Semua laluan di bawah mempunyai awalan `/api/synthetic-portal`, respons peribadi tanpa cache, dan hanya wujud apabila gerbang sintetik mengesahkan DB PostgreSQL loopback aktif. Mutasi portal memerlukan sesi, Origin sepadan dan CSRF.

| Laluan | Pemohon / wakil | PIC | PPSK | Lain |
| --- | --- | --- | --- | --- |
| `GET /drafts/:id`, `GET /drafts/:id/billing` | Pemilik dengan kuasa semasa, termasuk kuasa yang terikat pada snapshot | — | — | — |
| `POST /drafts/:id/evidence`, `POST /drafts/:id/submit` | Pemilik dengan versi semasa. Bukti, akuan dan pembetulan berversi. Serahan ulangan dengan kunci sama memulangkan resit sama. | — | — | — |
| `GET /reviews` | — | Pelantikan latihan dan daerah sepadan, kebenaran semasa dan MFA | Pelantikan latihan dan daerah sepadan, kebenaran semasa dan MFA | — |
| `POST /reviews/:id` | — | `REQUEST_CORRECTION`, `CONFIRM_COMPLETE` pada versi terkini | `REGISTER` selepas PIC lain mengesahkan | — |
| `GET /reviews/:id/billing` | — | Bacaan dalam skop. Invois selepas pendaftaran | Bacaan dalam skop. Invois selepas pendaftaran | — |
| `POST /reviews/:id/billing` | — | — | `ISSUE`, `SIMULATE_SETTLEMENT` selepas pendaftaran | — |
| `POST /callbacks/payment/:id` | — | — | — | Penjana latihan dengan HMAC-SHA256 sah |

Kod lazim ialah 400 untuk input tidak sah, 401 untuk sesi atau tandatangan tidak sah, 403 untuk Origin/CSRF/MFA/peranan, 404 untuk gerbang atau rekod di luar skop, 409 untuk versi, peralihan, bukti atau amaun tidak sepadan, dan 429 untuk had permintaan. Perlindungan 120 permintaan seminit serta kawalan log masuk kekal berkuat kuasa.

`GET /reviews` hanya menyenaraikan metadata bukti yang masih CLEAN dan tidak diganti. `evidenceEligible` menjadi palsu apabila pautan sasaran, versi, kategori, imbasan atau tahap pengesahan menyimpang daripada snapshot. Kelayakan tersebut disemak semula dalam transaksi kelengkapan, pendaftaran dan penjanaan invois baharu. Rekonsiliasi invois sedia ada kekal terikat kepada invois, jumlah dan resitnya. DTO menyembunyikan rahsia, kunci objek dan data yang tidak diperlukan. Log turut menyunting CSRF, HMAC, kelayakan sesi dan badan permintaan.

## Prestasi dan kebolehgunaan

- Bundle JavaScript permulaan turun daripada 508.94 kB kepada 471.80 kB (7.3%), dan daripada 156.63 kB kepada 147.18 kB selepas gzip. Dashboard dimuat atas permintaan pada laluan sendiri. Pengukuran ini ialah saiz hasil binaan Vite, bukan masa muat pengguna.
- Senarai pegawai mengambil peristiwa semakan secara berkelompok. Butiran invois hanya mengambil data apabila dibuka. Semakan kuasa tetap berjalan bagi setiap rekod syarikat yang layak untuk disenaraikan.
- Amaran saiz MapLibre kekal pada kira-kira 1.06 MB dalam chunk peta yang dimuat secara berasingan. Profil masa muat pada peranti dan rangkaian sebenar masih diperlukan dalam staging.
- Fastify menggunakan pengawal log semasa dengan log permintaan automatik dinyahaktifkan seperti sebelumnya. Amaran deprecation lama tidak lagi muncul dalam suite API.

## Persekitaran dan pemulihan

| Persekitaran | Aliran yang dibenarkan |
| --- | --- |
| Pembangunan / Cloud | DB loopback `staylink_issue31_<label>_test` atau `staylink_issue36_<label>_test`, flag eksplisit, Mailpit tempatan dan akaun latihan. |
| CI | DB tersendiri per job API atau browser, kunci sementara dijana pada runner dan Chromium Playwright. Workflow khas bertindak pada push cabang pakej UAT. |
| Staging | Menunggu kelulusan berasingan untuk data, identiti, storage, pengimbas, audit dan UAT. |
| Produksi | Gerbang sintetik gagal tertutup walaupun flag diminta. |

Sahkan integriti dengan sandaran format tersuai dan pemulihan ke DB sintetik lain yang kosong. Bandingkan kiraan serahan, pautan bukti, acara keputusan/invois/rekonsiliasi dan pencetus perlindungan snapshot. Gunakan arahan serta konfigurasi dalam pakej dahulu. Pelan undur aplikasi ialah menutup flag dan kembali ke versi aplikasi yang diluluskan. Issue #36 menggunakan skema sedia ada.

## Daftar risiko dan keputusan

| Pemilik | Perkara untuk keputusan dan langkah sementara |
| --- | --- |
| Jabatan Bangunan | Polisi bukti, akuan, tempoh pembetulan, delegasi, peruntukan per kes dan nombor rasmi. Gunakan sempadan latihan berasaskan peruntukan daerah sementara. |
| ICT dan Unit Rekod | Storan dan pengimbas sebenar, log audit yang tahan ubah, retensi, legal hold, pemulihan objek, RPO/RTO dan pengendalian bukti selepas kes pernah didaftarkan. Bukti yang merosot selepas semakan menyekat pendaftaran atau invois baharu sehingga bukti disahkan semula. |
| Kewangan dan ICT | Sumber unit bercaj, sandbox rasmi, kontrak callback, lejar kewangan, refund dan pembatalan. Penyimpan latihan menjalankan acara pada PostgreSQL dengan kunci per serahan. |
| Pemilik sistem | Penerimaan mudah alih pada peranti sebenar, prestasi peta staging dan semakan operasi. Kelulusan rintis dan pelepasan direkodkan berasingan daripada keputusan UAT. |

## Bukti uji terakam · 19 November 2026 (MYT)

| Pemeriksaan | Keputusan latihan |
| --- | --- |
| Vitest tanpa DB | 285 ujian lulus dalam 44 fail. Termasuk gerbang sintetik dan redaksi log. |
| Integrasi PostgreSQL | 75 ujian lulus dalam DB Issue #36. Kes lama Issue #24 menggunakan DB khusus dan dilangkau oleh suite ini. |
| Playwright | 27 ujian lulus dalam Chromium, termasuk aliran merentas tiga pelaku, pemeriksaan sempit 320/390 px, fokus kawalan dan ujian bahawa butiran invois dimuat atas permintaan. |
| Alat pembangunan dan audit | Pemasangan, penjanaan Prisma, TypeScript, lint dan build lulus. Audit npm melaporkan 0 kelemahan kebergantungan. |
| Rehearsal pemulihan | Migrasi sedia ada berjaya pada DB latihan baharu dan pada ulangan. Sandaran dipulihkan pada DB sintetik kosong. Kiraan sampel sepadan untuk 3 serahan, 10 pautan bukti, 1 acara kelengkapan, 1 invois, 1 rekonsiliasi dan pencetus perlindungan snapshot aktif. |
| Kit demonstrasi | Penjana berjaya mencipta fixture. Ujian HTTP mengesahkan log masuk ketiga-tiga akaun, MFA kedua-dua pegawai dan akses senarai, serta kesiapsiagaan selepas dua bukti latihan dijana. |

Suite automatik menggunakan metadata dan verdict tiruan. Ujian pengimbas sebenar, pemulihan storan objek dan penerimaan pengguna MBSP menunggu kelulusan staging.
