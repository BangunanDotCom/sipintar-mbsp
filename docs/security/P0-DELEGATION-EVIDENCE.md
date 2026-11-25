# Kawalan surat kuasa dan pengesahan wakil

Asas perubahan ialah [PR #69](https://github.com/BangunanDotCom/sipintar-mbsp/pull/69). Kriteria penerimaan datang daripada [PR audit #72](https://github.com/BangunanDotCom/sipintar-mbsp/pull/72), dokumen `docs/audit-pr67/PENERIMAAN-SURAT-KUASA.md`. Status P0 menunggu keputusan Team 3.

## Kontrak dan operasi

- `POST /api/companies/:id/documents` menyimpan PDF ke kuarantin PostgreSQL privat dengan ID, versi wakil, skop kuasa, saiz dan SHA-256 bait asal. Penggantian memerlukan `expectedDocumentId` yang sepadan dan membatalkan ikatan kelayakan dalam transaksi yang sama. Dokumen boleh dimuat naik oleh wakil sendiri atau pengurus wakil syarikat yang aktif. `POST /api/companies/:id/documents/:documentId/revoke` membatalkan versi semasa secara atomik dan menyimpan sejarah.
- `GET /api/documents/:id` dan `GET /api/representation-documents/:id` berkongsi gerbang. Gerbang menyemak sesi, kelayakan pengguna, keahlian, peranan dan MFA pegawai, versi dan skop kuasa, serta verdict dan integriti bait. Respons menggunakan attachment, `private, no-store`, `nosniff`, `sandbox` dan `no-referrer`. Audit berjaya ditulis sebelum penghantaran respons.
- `POST /api/representations/:id/verify` memerlukan `documentId`, `expectedRevision`, keputusan dan sebab. PIC dengan peruntukan global yang sedia dibenarkan, MFA aktif dan bebas daripada pemohon/pemuat naik boleh menyemak surat kuasa. Peruntukan daerah kekal terhad kerana bukti ini berinduk pada syarikat. Pengesahan, audit dan notifikasi diterapkan dalam satu transaksi. Penggantian, pembatalan dan semakan bersaing menggunakan kunci rekod wakil dan padanan versi/revisi.
- Draf syarikat boleh disimpan sebelum pengesahan. Kuasa jemputan yang berpunca daripada status VERIFIED juga memerlukan surat kuasa yang masih sah. Hak pengurusan eksplisit sedia ada kekal tertakluk pada keahlian aktif. Serahan sintetik dan replay mengesahkan bukti langsung sebelum menggunakan snapshot. Snapshot menyimpan ID wakil, ID/versi dokumen dan hash. Snapshot lama tanpa ikatan tepat kekal tertutup. Penghantaran rasmi kekal tertakluk pada gerbang sedia ada.
- Kuarantin dan imbasan diurus di sisi pelayan. Jalankan `npm run delegations:scan` secara berkala dengan `STAYLINK_DELEGATION_SCAN_ENABLED=true`, `STAYLINK_CLAMAV_ENABLED=true` dan `STAYLINK_CLAMAV_HOST` menghala ke ClamAV privat terurus. Port lalai ialah 3310. Had ClamAV `StreamMaxLength` mesti meliputi had muat naik, sehingga 20 MiB. Sambungan atau keputusan yang gagal kekal tertutup. Satu proses mengambil maksimum 10 rekod, pajakan 60 saat dengan tempoh tunggu ClamAV 30 saat dan verdict CLEAN sah 24 jam. Imbasan CLEAN luput boleh diproses semula. Untuk FAILED atau INFECTED, penggantian melalui muat naik baru memulakan penilaian baru. Ambang operasi ini digunakan untuk semakan Team 3 dan ICT.
- Migrasi mengekalkan bait dan hash sejarah. Surat lama dalam keadaan LEGACY mesti dimuat naik semula bagi wakil yang tepat. Elakkan melancarkan semula binari sebelum P0 dengan pangkalan data berisi kuarantin kerana laluan lama tidak memeriksa verdict. Jika pemulihan aplikasi diperlukan, henti servis dan tutup kedua-dua laluan muat turun serta laluan pengesahan sebelum memulakan versi lama. Uji pemulihan daripada salinan sandaran sintetik dan sahkan ketiadaan bait melalui HTTP sebelum membuka semula portal.

## Pemetaan Oracle PR #70 untuk Team 2

| Kontrak PostgreSQL | Padanan Oracle 19c |
| --- | --- |
| Rekod syarikat dan wakil | `STL_COMPANY_REPRESENTATIVES` menambah `VERIFIED_DOCUMENT_ID VARCHAR2(128 CHAR)` dan `VERIFICATION_REVISION NUMBER(10,0) DEFAULT 0 NOT NULL`. Tambah kunci unik `(ID, COMPANY_ID)`. |
| Versi kuarantin | `STL_DELEGATION_DOCUMENTS` menggunakan `REPRESENTATIVE_ID VARCHAR2(128 CHAR)`, `VERSION NUMBER(10,0)`, `BYTE_SIZE NUMBER(10,0)`, `AUTHORITY_TYPE VARCHAR2(256 CHAR)`, `CONTENT BLOB` dan hash heksadesimal 64 aksara bagi rekod baharu. Medan status/pajakan/vendor semakan disimpan secara berasingan. Rekod lama bermula sebagai LEGACY. |
| Tarikh sah, akhir imbasan, superseded dan revoked | Guna `TIMESTAMP(6) WITH TIME ZONE` dan perbandingan bind UTC. Uji kes sempadan sama dengan waktu luput. |
| Ikatan dan satu versi semasa | Dua FK komposit mengekalkan kaitan syarikat dan wakil. Unik `(REPRESENTATIVE_ID, VERSION)`. Indeks unik berasaskan `CASE WHEN SUPERSEDED_AT IS NULL AND REVOKED_AT IS NULL THEN REPRESENTATIVE_ID END` memastikan satu versi semasa. |
| Ketakbolehubahan | Lindungi semua lajur identiti dan BLOB selepas INSERT dengan trigger `STL_` dan model keistimewaan yang menghadkan penulis runtime. Elakkan DML melalui locator BLOB runtime. Status penarikan bergerak sehala. |
| Susunan kunci | Oracle gunakan `SELECT … FOR UPDATE` bagi pembacaan yang memerlukan perlindungan, urutan pengguna/peranan/sesi, wakil, syarikat, dokumen. Semak semula selepas kunci, simpan audit/notifikasi dalam transaksi yang sama, semak bilangan baris untuk kehilangan pajakan/konflik. |
| Gerbang bait | Pilih metadata dahulu, sahkan akses dan verdict, baca BLOB privat secara terbatas, kira SHA-256 bait dibaca, kemudian pulangkan respons. Normalisasi string kosong Oracle kepada nilai tidak sah bagi enjin, hash, skop dan token. |

Ini kontrak pindaan untuk PR #70. Team 2 perlu menggunakan migrasi berversi tambahan, inventori dan semakan perlanggaran `STL_` sebelum DDL. Migrasi dan ujian keserasian Oracle kekal dalam skop Team 2.

## Pemetaan ujian

| Kriteria | Bukti dalam repositori |
| --- | --- |
| A-N01 dan A-P01 | `tests/api.test.ts`, keadaan kuarantin/warisan pada kedua-dua laluan dan muat turun CLEAN yang memadankan bait serta audit |
| A-N02 dan A-N03 | Persetujuan hash, ketakbolehubahan bait, penolakan versi diganti, akses syarikat lain, daerah dan MFA |
| A-N04 dan A-N05 | Pengimbas gagal, tuntutan kerja duplikat dan hasil lewat selepas penggantian. Periksa no-store dan silang pengguna. |
| B-N01 dan B-N02 | Bukti tiada, salah wakil, hash salah, versi diganti atau dibatalkan, dan akses serahan wakil tamat atau ditarik |
| B-N03 dan B-N04 | MFA/peranan/daerah/CSRF, revisi lapuk dan pengesahan serentak |
| B-N05 dan B-P01 | Suntikan kegagalan audit dan notifikasi di PostgreSQL ujian, replay, pengesahan bebas dua wakil, semakan snapshot sintetik |
| Pelayar | `tests/e2e/portal.spec.ts` menguji paparan kuarantin, muat turun CLEAN melalui proksi pelayar, dan pengasingan dokumen antara wakil |

Ujian bersepadu menggunakan verdict pengimbas sintetik. Penerimaan operasi memerlukan pengesahan ClamAV terurus dan polisi cache proksi sebenar. Matriks ini perlu disemak Team 3 bersama bukti ujian.

## Semakan susulan PR #73

Calon kod `ca0633006d318af7edcd714a60b3424f58d3c758` menggantikan calon `2b6ee226` yang disemak Team 3. Matriks ini merekod bukti latihan Team 1 dan baki penerimaan bebas. Gunakan [run yang sepadan dengan commit terkini PR #73](https://github.com/BangunanDotCom/sipintar-mbsp/pull/73/checks) untuk bukti CI.

| Kriteria | Bukti pada calon susulan | Baki penerimaan |
| --- | --- | --- |
| A-N01 | Lulus API. Kedua-dua laluan bait menolak kuarantin, verdict hilang dan dokumen warisan. Unit menolak verdict tidak dikenali. | Sahkan dengan pengimbas terurus. |
| A-N02 | Lulus API dan unit. Digest/saiz salah dan versi diganti gagal tertutup. Ketakbolehubahan bait dikuatkuasakan oleh PostgreSQL. | Jalankan senario stor terurus tidak tersedia jika seni bina sasaran menggunakan stor luaran. |
| A-N03 | Lulus API. Dashboard menggugurkan butiran dokumen. Paparan syarikat dan pegawai menapis syarikat, wakil, skop kuasa dan versi semasa. Sesi tamat, wakil ditarik dan PIC luar skop ditolak. Playwright menyemak pengasingan yang sama untuk akaun jemputan. | Semakan bebas Team 3. |
| A-N04 | Lulus API. Pengimbas duplikat, hasil selepas pajakan luput, penggantian semasa imbasan dan kegagalan imbasan kekal tertutup. | Jalankan semula pada ClamAV terurus. |
| A-N05 | Lulus API. Muat turun dan metadata peribadi menggunakan `no-store`. Akaun lain disemak semula. Playwright menguji gerbang melalui proksi setempat. | Proksi/cache yang diluluskan. |
| A-P01 | Lulus API dengan bait tepat, header dan audit bagi pemohon serta PIC global dengan MFA. | Pengimbas dan proksi yang diluluskan. |
| B-N01 | Lulus API. Dokumen tiada, salah wakil atau salah syarikat ditolak. Jemputan menolak penerima salah dan parameter syarikat tambahan. | Semakan bebas Team 3. |
| B-N02 | Lulus API. Penerimaan ditolak selepas verdict luput, surat dibatalkan, kuasa ditarik atau surat pengganti sudah disahkan. | Semakan bebas dan kesetaraan Oracle. |
| B-N03 | Lulus API. Pengesah sendiri, PIC luar skop, peranan salah, MFA tiada, CSRF/Origin salah dan sesi tamat ditolak. | Semakan bebas Team 3. |
| B-N04 | Lulus API. Ujian PostgreSQL menunggu sehingga transaksi penerimaan disekat oleh kunci pembatalan, kemudian memeriksa penolakan dan jemputan kekal belum digunakan. Revisi lapuk dan pengesahan bersaing turut ditolak. | Semak semantik kunci Oracle. |
| B-N05 | Lulus API. Kegagalan audit/notifikasi pengesahan menggulung balik transaksi. Penerimaan yang ditolak tidak menghasilkan keahlian. Replay ditolak. | Semakan bebas dan kesetaraan Oracle. |
| B-P01 | Lulus API. Wakil disahkan secara bebas, satu penerimaan dibenarkan dengan bukti tepat dan mandat pengurusan langsung aktif masih boleh menjemput tanpa surat. | Semakan bebas Team 3. |

Jemputan baharu mengekalkan format 64 aksara heksadesimal dan penyimpanan hash sedia ada. Token mengikat syarikat, pemberi, penerima serta mandat langsung atau versi surat kuasa dengan hash bait dan tarikh luput verdict. Penerimaan mengira semula ikatan pada bukti semasa dalam transaksi yang memegang kunci wakil, syarikat dan dokumen. Imbasan semula yang menghasilkan tarikh luput baharu memerlukan jemputan baharu. Pautan lama yang diterbitkan sebelum pengikatan ini juga perlu dijana semula. Perubahan ini menggunakan skema sedia ada. Kontrak tersebut disediakan untuk semakan kesetaraan dalam PR Oracle #74.

P0 A/B kekal **OPEN** sehingga Team 3 mengesahkan calon yang sama dan menilai baki bukti operasi.
