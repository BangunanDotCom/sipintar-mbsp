# Kawalan surat kuasa dan pengesahan wakil

Asas perubahan ialah [PR #69](https://github.com/BangunanDotCom/sipintar-mbsp/pull/69). Kriteria penerimaan datang daripada [PR audit #72](https://github.com/BangunanDotCom/sipintar-mbsp/pull/72), dokumen `docs/audit-pr67/PENERIMAAN-SURAT-KUASA.md`. Status P0 menunggu keputusan Team 3.

## Kontrak dan operasi

- `POST /api/companies/:id/documents` menyimpan PDF ke kuarantin PostgreSQL privat dengan ID, versi wakil, skop kuasa, saiz dan SHA-256 bait asal. Penggantian memerlukan `expectedDocumentId` yang sepadan dan membatalkan ikatan kelayakan dalam transaksi yang sama. Dokumen boleh dimuat naik oleh wakil sendiri atau pengurus wakil syarikat yang aktif. `POST /api/companies/:id/documents/:documentId/revoke` membatalkan versi semasa secara atomik dan menyimpan sejarah.
- `GET /api/documents/:id` dan `GET /api/representation-documents/:id` berkongsi gerbang. Gerbang menyemak sesi, kelayakan pengguna, keahlian, peranan dan MFA pegawai, versi dan skop kuasa, serta verdict dan integriti bait. Respons menggunakan attachment, `private, no-store`, `nosniff`, `sandbox` dan `no-referrer`. Audit berjaya ditulis sebelum penghantaran respons.
- `POST /api/representations/:id/verify` memerlukan `documentId`, `expectedRevision`, keputusan dan sebab. PIC dengan peruntukan global yang sedia dibenarkan, MFA aktif dan bebas daripada pemohon/pemuat naik boleh menyemak surat kuasa. Peruntukan daerah kekal terhad kerana bukti ini berinduk pada syarikat. Pengesahan, audit dan notifikasi diterapkan dalam satu transaksi. Penggantian, pembatalan dan semakan bersaing menggunakan kunci rekod wakil dan padanan versi/revisi.
- Draf syarikat boleh disimpan sebelum pengesahan. Serahan sintetik dan replay mengesahkan bukti langsung sebelum menggunakan snapshot. Snapshot menyimpan ID wakil, ID/versi dokumen dan hash. Snapshot lama tanpa ikatan tepat kekal tertutup. Penghantaran rasmi kekal tertakluk pada gerbang sedia ada.
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

Ini kontrak pindaan untuk PR #70. Team 2 perlu menggunakan migrasi berversi tambahan, inventori dan semakan perlanggaran `STL_` sebelum DDL. Tiada DDL Oracle atau hubungan ke persekitaran MBSP diperlukan untuk perubahan PostgreSQL ini.

## Pemetaan ujian

| Kriteria | Bukti dalam repositori |
| --- | --- |
| A-N01 dan A-P01 | `tests/api.test.ts`, keadaan kuarantin/warisan pada kedua-dua laluan dan muat turun CLEAN yang memadankan bait serta audit |
| A-N02 dan A-N03 | Persetujuan hash, ketakbolehubahan bait, penolakan versi diganti, akses syarikat lain, daerah dan MFA |
| A-N04 dan A-N05 | Pengimbas gagal, tuntutan kerja duplikat dan hasil lewat selepas penggantian. Periksa no-store dan silang pengguna. |
| B-N01 dan B-N02 | Bukti tiada, salah wakil, hash salah, versi diganti atau dibatalkan, dan akses serahan wakil tamat atau ditarik |
| B-N03 dan B-N04 | MFA/peranan/daerah/CSRF, revisi lapuk dan pengesahan serentak |
| B-N05 dan B-P01 | Suntikan kegagalan audit dan notifikasi di PostgreSQL ujian, replay, pengesahan bebas dua wakil, semakan snapshot sintetik |
| Pelayar | `tests/e2e/portal.spec.ts` menguji paparan kuarantin dan pengasingan dokumen antara wakil |

Ujian bersepadu menggunakan verdict pengimbas sintetik. Penerimaan operasi memerlukan pengesahan ClamAV terurus dan polisi cache proksi sebenar. Matriks ini perlu disemak Team 3 bersama bukti ujian.
