# Matriks calon integrasi surat kuasa P0

## Calon gabungan selepas audit `850ad35`

Calon pada Draft PR #74 mengambil kontrak PostgreSQL `0fe8c7a3984e9472dd38ad2bc686a87f37952a9d` dan adapter Oracle `3d1477c927e1dad5294d081b258a73b768b6ac34`. Fungsi bersama mengira ikatan token v2 menggunakan identiti syarikat, rekod wakil pemberi, penerima dan mandat. Bagi surat kuasa, ikatan turut memerlukan ID, versi, SHA-256 dan tarikh CLEAN. Simpanan kekal hash token; migrasi tambahan tidak diperlukan. Jemputan lama perlu dikeluarkan semula. Penerimaan mengesahkan identiti, kuasa dan kelayakan semasa dalam transaksi yang menulis keahlian, tuntutan, audit dan notifikasi. Serahan menyemak semula bukti terkunci selepas penulisan audit sebelum komit.

| ID | Bukti pada calon gabungan | Baki penerimaan |
| --- | --- | --- |
| A-N01 | Dua laluan bait menolak setiap status kuarantin, LEGACY dan CLEAN tanpa bukti. | Team 3 ulang pada SHA calon. |
| A-N02 | Perbezaan bait/saiz dan kegagalan baca yang disuntik selepas gerbang menghasilkan respons bersih tanpa lampiran atau bait separa pada kedua-dua enjin. | Ulang gangguan dengan stor yang diluluskan JTIK. |
| A-N03 | Dashboard menggugurkan metadata surat kuasa. Paparan syarikat dan PIC dihadkan kepada syarikat, wakil, skop kuasa dan versi semasa. Playwright menguji dua akaun dan dua syarikat. | Semakan bebas Team 3. |
| A-N04 | Penarikan kuasa ketika pengimbas memegang pajakan menolak verdict lapuk. Runtime Oracle tidak boleh menulis verdict dan worker tidak boleh mengesahkan wakil. | ClamAV terurus dan grants SE2. |
| A-N05 | Playwright melalui proksi Vite, Fastify no-store dan permintaan semula akaun lain. | Jalankan probe cache/redaksi pada proksi TLS JTIK. |
| A-P01 | Kedua-dua laluan memulangkan bait dan audit yang dijangka untuk CLEAN sintetik. | Ulang dengan scanner terurus. |
| B-N01 | Penerima lain, dokumen silang wakil/syarikat dan versi tiada ditolak. | Semakan bebas Team 3. |
| B-N02 | Verdict luput, imbasan semula, versi ganti yang diluluskan, penarikan dokumen dan kehilangan mandat menolak jemputan asal. Ujian melambatkan audit serahan sehingga CLEAN luput dan mengesahkan serahan dan audit tidak dikomit. | Pengesahan bebas dan Oracle 19.30 SE2. |
| B-N03 | Peranan, daerah, MFA, Origin, CSRF dan pengesahan sendiri diuji dalam suite P0. | Pengesahan bebas Team 3. |
| B-N04 | Penerimaan bertindih dengan pembatalan menghasilkan penolakan selepas kunci dilepaskan. | Ulang di bawah beban SE2. |
| B-N05 | Kegagalan audit/notifikasi dan replay diperiksa. Kegagalan penerimaan meninggalkan tuntutan kosong serta sifar keahlian, audit dan notifikasi kejayaan. | Latihan DR dan penghantaran notifikasi di staging. |
| B-P01 | Jemputan bukti tepat dan mandat langsung masing-masing diterima sekali. | Pengesahan bebas Team 3. |

Oracle Free 23.26.4, PostgreSQL dan Mailpit menggunakan data sintetik. Skrip probe dan checklist JTIK disertakan. Bukti bagi Oracle 19.30 SE2, ClamAV terurus, cache/redaksi proksi produksi, prestasi, backup fizikal dan DR masih menunggu persekitaran yang diluluskan. P0 A/B masih terbuka dan Personal Demo kekal ditangguhkan. [Audit PR #72](https://github.com/BangunanDotCom/sipintar-mbsp/blob/850ad35/docs/audit-pr67/AUDIT-CALON-P0.md) · [Checklist JTIK](ORACLE-JTIK-CHECKLIST.md)

Calon berasingan `integration/oracle-team2-p0` bermula pada kepala Draft PR #71 `035fb7ebf14441d1dbadaeb5849dc6a55215bf86`. Sumber PostgreSQL Team 1 dipinkan pada `2b6ee2268cb44bca74ecfb9e6e7b0c672e7b1cec` dan kriteria penerimaan pada draf audit `4a15d22c615f121e5e1060776ae0ac5d8f604bdb`. Head Team 1 yang lebih baharu daripada `f0fdb02` menyemak semula bukti hidup ketika mencipta dan menerima jemputan. [Calon Team 1](https://github.com/BangunanDotCom/sipintar-mbsp/commit/2b6ee2268cb44bca74ecfb9e6e7b0c672e7b1cec) · [Kriteria A/B](https://github.com/BangunanDotCom/sipintar-mbsp/blob/4a15d22c615f121e5e1060776ae0ac5d8f604bdb/docs/audit-pr67/PENERIMAAN-SURAT-KUASA.md) · [Draft PR #71](https://github.com/BangunanDotCom/sipintar-mbsp/pull/71)

Calon mengekalkan migrasi, gerbang HTTP dan worker PostgreSQL Team 1. Ia menyambungkan bukti berikat kepada adapter Team 2 tanpa mengubah cabang sumber. Oracle menggunakan migrasi tambahan 003 yang mengasingkan rekod warisan daripada versi baharu, mengikat FK komposit wakil–versi–syarikat dan mengehadkan setiap wakil kepada satu versi semasa. Runtime Oracle memasukkan rekod PENDING melalui lalai skema. Akaun worker berasingan memiliki hak kemas kini lajur verdict dan pajakan. Kunci Oracle disusun mengikut pengguna/peranan/sesi, syarikat, wakil dan dokumen agar sepadan dengan kunci draf dan jemputan sedia ada. PostgreSQL terus menggunakan kunci dalam pengendali Team 1.

## Bukti terdahulu pada PR #74 `3d1477c`

## Kriteria penerimaan

Bukti di bawah menggunakan fail dan verdict sintetik pada PostgreSQL dan Oracle Free 23.26.4. Keputusan rasmi bagi A/B kekal terbuka sehingga Team 3 mengesahkan baki dan JTIK mengesahkan persekitaran.

| ID | Bukti larian pada calon | Baki |
| --- | --- | --- |
| A-N01 | Kedua-dua laluan menolak PENDING, SCANNING, INFECTED, FAILED, CLEAN tanpa bukti dan LEGACY. Audit kejayaan hanya muncul bagi release sah. | Polisi imbas semula warisan dan scanner terurus. |
| A-N02 | Hash verdict salah, saiz BLOB/bytea salah, ID tiada dan versi superseded ditolak. Percubaan ubah identiti ditolak oleh DB. | Uji gangguan semasa baca pada stor yang diluluskan jika backend berubah. |
| A-N03 | Sesi tamat/tiada, pegawai salah daerah, pegawai tanpa MFA dan wakil lain diuji. Senarai syarikat memaparkan metadata wakil berskop. | Regresi pelayar dan audit semua laluan metadata bersama Team 1 dan Team 3. |
| A-N04 | Tuntutan worker kedua, pajakan luput, penggantian serentak, jawapan lapuk dan timeout pengimbas fixture diuji. Runtime Oracle tidak boleh mengemas kini verdict. | Pengasingan akaun worker rasmi dan percubaan dengan scanner terurus. |
| A-N05 | Kedua-dua laluan memberi `private, no-store`, `nosniff`, `sandbox` dan `no-referrer`. Permintaan semula wakil lain ditolak. | Cache dan redaksi log proksi yang diluluskan. |
| A-P01 | Kedua-dua laluan memulangkan bait fixture yang sepadan, attachment dan dua audit kejayaan. | Bukti pelayar/proksi dan konfigurasi scanner rasmi. |
| B-N01 | ID tiada/tidak wujud, syarikat asing dan wakil lain ditolak. DML silang wakil gagal pada FK komposit. | Semakan migrasi pada Oracle 19.30 SE2. |
| B-N02 | Verdict/hash tidak layak, versi diganti dan pembatalan wakil menghalang keputusan atau operasi yang menggunakan bukti. Jemputan berasaskan bukti ditolak pada penciptaan/penerimaan selepas penarikan. Mandat pengurusan terus dikekalkan. | Perjalanan syarikat Issue #68 menguji penarikan selepas penutupan dan menolak replay. Uji perlumbaan sebenar luput ketika serahan sedang dikomit. |
| B-N03 | Pemohon, PIC salah daerah, PPSK, MFA tiada, Origin dan CSRF salah ditolak. | Tambah bukti khusus bagi pemuat naik dengan pelantikan PIC serentak dalam fixture yang diluluskan. |
| B-N04 | Dua keputusan serentak menghasilkan satu kejayaan dan satu konflik. Penggantian serentak dan replay revisi lapuk ditolak. | Jadual perlumbaan tambahan revoke/expiry dengan jemputan dan serahan. |
| B-N05 | Kegagalan audit atau notifikasi menggulung perubahan ikatan dan revisi pada kedua-dua enjin. Sejarah audit kekal selepas penarikan. | Sahkan penyelarasan penghantaran antara servis pada persekitaran diluluskan. |
| B-P01 | Hanya wakil yang disasar mendapat ikatan. FK, revisi dan kiraan audit diperiksa pada dua enjin. Eksport/pulih mengekalkan pasangan wakil–versi. | Ujian UI/proksi pada calon penuh Team 1/Team 3. |

## Larian dan keputusan

- Regresi dengan DB PostgreSQL loopback `staylink_issue58_p0integration_test`, Oracle Free dan Mailpit mencatat 463 ujian lulus dan 7 dilangkau. Termasuk enam kes matriks bersama, suite PostgreSQL Team 1 dan suite integrasi Oracle. Dua skip khusus Oracle memang tidak terpakai pada varian PostgreSQL. Empat perjalanan API Issue #68 dijalankan dalam larian fokus dengan persekitaran khusus. Kes Issue #24 lulus pada DB khusus berasingan.
- Larian fokus Issue #68 pada kedua-dua enjin mencatat 8 ujian lulus. Perjalanan individu dan syarikat pada kedua-dua enjin sampai ke penutupan. Penarikan surat kuasa menolak replay serahan dan capaian aliran selepas penutupan. Empat ujian domain Team 1 turut lulus. TypeScript, lint dan binaan lulus. Binaan melaporkan amaran saiz chunk frontend sedia ada.
- Naik taraf 002→003 pada salinan sintetik berisi data mengelaskan 21 PDF warisan sebagai LEGACY dan mengekalkan semua nilai lajur lama. SHA-256 selepas naik taraf ialah `f0b17b7b95cb4a736a8bab13084bfc80037b722cbc6b6d31cb91dc4fe807a136`. Satu pemasangan awal yang gagal mengkompil pencetus mengekalkan penanda APPLYING dan ditolak oleh preflight. Larian berjaya menggunakan skema bersih dan pencetus yang dibetulkan.
- Eksport dan pemulihan logik Oracle dalam skema kosong kedua memadankan SHA-256 `9ff6821165e94698977a01e4e4956749bb55573f3b0e0a738adc6d55140dbe61` bagi 31 jadual dan tiga ikatan bukti aktif. Import PostgreSQL ke Oracle memadankan eksport dengan SHA-256 `da84732cc1cfe48111e3809435e93736285bdbffd2406417342e451133c46002` dan empat ikatan. Kedua-dua latihan mengekalkan kuarantin dan dokumen LEGACY.
- Ujian gangguan menghentikan setiap kontena DB makmal secara bergilir. Muat turun berautentikasi bertukar daripada 200 kepada 503 tanpa bait PDF atau lampiran. Proses API yang sama kembali memberikan 200 dengan bait yang sepadan selepas DB dimulakan semula.
- Tiada ujian pelayar/proksi atau scanner terurus dijalankan pada calon ini. Data, pendengar HTTP dan pangkalan data berada dalam makmal. Personal Demo kekal ditangguhkan.

Jalankan suite bersama dengan `STAYLINK_TEST_P0_POSTGRES=true` dan `ORACLE_P0_OWNER_ENV`, `ORACLE_P0_RUNTIME_ENV`, `ORACLE_P0_SCANNER_ENV` menunjuk kepada fail env persendirian bagi skema makmal khusus. Sediakan DB PostgreSQL tersebut, set URL ujian dan URL aplikasi kepada DB loopback yang sama, dan jalankan `npm run db:test:migrate`. Pasang 001–003, kemudian seed dengan akaun runtime dan worker berasingan. Gunakan `npx vitest run tests/delegation-provider-parity.test.ts`. Ujian menggunakan scanner fixture. [Checklist teknikal JTIK](ORACLE-JTIK-CHECKLIST.md)
