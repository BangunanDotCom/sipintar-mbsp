# Semakan bebas P0 A/B · Draft PR #80

**27 November 2026 (MYT).** Calon `4679fe9e7e84753ade4a5b72030cc02f027b184a` berpunca daripada calon penyatuan Oracle #78 `e43fbe8c4c51753303892dee704fcf9894afa37b`. #79 `4af4851428be5265aae09bc404c38b417eac79af` kekal calon PostgreSQL berasingan. Keputusan #80 terpakai pada SHA #80 sahaja. [Draft PR #80](https://github.com/BangunanDotCom/sipintar-mbsp/pull/80) · [Matriks #78/#79 dan bukti fungsi](PENERIMAAN-AKHIR-PR78-79.md) · [Kriteria bebas P0](PENERIMAAN-SURAT-KUASA.md)

## Semantik penerimaan dan batas bukti

Kedua-dua adapter membaca semula ikatan versi asal dan menggunakan jam DB dalam pernyataan terakhir transaksi, selepas tuntutan, keahlian, audit dan notifikasi ditulis. Tempoh sah dibandingkan dengan operator `>` dan baris kuasa dibaca di bawah kunci. Kegagalan sebelum komit menggulung kesemua penulisan. PostgreSQL menggunakan `clock_timestamp()` dalam UTC dan Oracle menggunakan `SYSTIMESTAMP`. [PostgreSQL #80](https://github.com/BangunanDotCom/sipintar-mbsp/blob/4679fe9e7e84753ade4a5b72030cc02f027b184a/apps/api/src/delegation-company-invitations.ts#L297-L348) · [Oracle #80](https://github.com/BangunanDotCom/sipintar-mbsp/blob/4679fe9e7e84753ade4a5b72030cc02f027b184a/apps/api/src/oracle/company-invitations.ts#L313-L382)

Ujian sempadan menetapkan tamat pada masa DB dan menolak permintaan semasa/selepas luput. Ujian kedua memastikan penulisan bergantung masih berlaku ketika grant sah, menghentikan penyelesaian ujian sehingga jam DB mencapai tarikh luput dan mengesahkan rollback. Perbandingan eksklusif pada nilai sama dibuktikan oleh predikat kod. Nilai tepat sama yang disampel oleh pernyataan akhir dan detik fizikal komit belum diukur secara bebas. Dokumentasi calon menetapkan masa sah pada pernyataan akhir; keputusan pemilik diperlukan sekiranya syarat rasmi merujuk kepada detik fizikal komit semasa DB menunggu flush/WAL atau redo. [Ujian masa dan rollback](https://github.com/BangunanDotCom/sipintar-mbsp/blob/4679fe9e7e84753ade4a5b72030cc02f027b184a/tests/delegation-provider-parity.test.ts#L975-L1044) · [Semantik calon](https://github.com/BangunanDotCom/sipintar-mbsp/blob/4679fe9e7e84753ade4a5b72030cc02f027b184a/docs/ORACLE-INVITATION-FINAL-GATE.md)

## Larian bebas pada SHA yang sama

PostgreSQL 16 dan Oracle Free 23.26.4 menggunakan pangkalan data loopback dengan fixture sintetik. Oracle menggunakan akaun pemilik, API dan pengimbas berasingan. Semakan TypeScript serta lint bersasar untuk dua adapter dan suite P0 lulus. Migrasi PostgreSQL serta Oracle 001–004 digunakan. `vitest run tests/delegation-provider-parity.test.ts tests/delegation-evidence.test.ts` menghasilkan **39 lulus**, termasuk **26 kes integrasi**. Bagi kes penolakan yang diliputi, `ACCEPTED_AT` kosong, keahlian serta kuasa wakil baharu tiada, dan audit kejayaan serta notifikasi sifar. [Asersi keadaan selepas penolakan](https://github.com/BangunanDotCom/sipintar-mbsp/blob/4679fe9e7e84753ade4a5b72030cc02f027b184a/tests/delegation-provider-parity.test.ts#L849-L898)

| Kriteria | Hasil #80 pada kedua-dua enjin |
|---|---|
| A-N01 | **PASS makmal.** Kedua-dua laluan menolak status kuarantin, LEGACY dan CLEAN tanpa bukti sah |
| A-N02 | **PASS makmal.** Ketidakpadanan integriti, versi diganti dan kegagalan baca selepas kelayakan ditolak. Hentikan DB setempat dan kedua-dua laluan gagal tanpa bait atau lampiran (PostgreSQL 500/503, Oracle 503/503). Selepas hidup semula, kedua-duanya memberi 200 dengan bait asal |
| A-N03 | **PASS makmal.** Pengasingan syarikat/wakil, daerah, MFA dan sesi bagi kes yang diliputi |
| A-N04 | **PASS makmal.** Persaingan lease dan revokasi ketika imbasan menghalang verdict lapuk. **BLOCKED** profil grant berasingan PostgreSQL dan ClamAV rasmi. Akaun pemilik PostgreSQL yang dipakai API fixture masih mempunyai grant UPDATE verdict |
| A-N05 | **PASS makmal.** Nginx setempat memberi 200/404/200 bagi laluan syarikat dan 200/403/200 bagi laluan PIC pada dua enjin. Kesemuanya cache MISS; respons sah kekal `private, no-store`. Log fixture bebas daripada cookie, token CSRF dan bait PDF. **BLOCKED** konfigurasi rasmi JTIK |
| A-P01 | **PASS makmal.** Dua laluan melepaskan bait CLEAN yang tepat dengan audit; status akses selepas pembatalan menolak PDF |
| B-N01 | **PASS makmal.** Versi/rekod dan penerima luar skop ditolak |
| B-N02 | **PASS makmal.** Luput peranan pemberi, luput selepas penulisan, imbasan semula, ganti, pembatalan bukti dan jemputan lama ditolak |
| B-N03 | **PASS makmal.** Peranan, daerah, MFA, Origin/CSRF dan larangan semakan sendiri dalam suite |
| B-N04 | **PASS makmal.** Penerimaan menunggu revokasi yang memperoleh kunci dahulu, kemudian menolak tanpa tuntutan. Penerimaan yang telah dikomit dikekalkan apabila revokasi berlaku kemudian |
| B-N05 | **PASS makmal.** Gagal audit atau notifikasi, serta luput ketika menulis, semua menggulung tuntutan dan keahlian. Replay ditolak |
| B-P01 | **PASS makmal.** Jemputan bukti tepat dan mandat langsung yang sah diterima sekali |

## Keputusan dan syarat penutupan

- **P0 A kekal terbuka.** Team 1/JTIK perlu membuktikan runtime API PostgreSQL tidak boleh menetapkan verdict dan worker tidak boleh mengubah bait, kuasa wakil, atau rekod di luar skopnya. ClamAV terurus, versi Oracle 19.30 SE2, proksi/cache/log, akses dan pemulihan rasmi masih memerlukan penerimaan JTIK. [Prosedur operasi](PENERIMAAN-OPERASI-P0.md)
- **P0 B lulus pada gerbang akhir makmal #80, penutupan keluaran kekal terbuka.** Team 1/2 perlu membawa gerbang yang sama ke calon keluaran yang turut mengandungi fungsi #79. Pemilik perlu menerima semantik masa gerbang akhir; JTIK perlu mengulang pengesahan pada sasaran. #79 kekal mempunyai penemuan kod yang direkod pada laporan terdahulu sehingga commit pembetulan disepadukan.
- **Complete Release dan Go Live kekal NO-GO. Personal Demo kekal ditangguhkan.** Pembetulan SLA, keputusan Kewangan/Jabatan Bangunan/Unit Rekod dan integrasi rasmi disenaraikan dalam matriks kumulatif.
