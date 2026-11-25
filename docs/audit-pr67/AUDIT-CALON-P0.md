# Audit semula calon pembetulan surat kuasa

**Keputusan: P0 A dan B kekal terbuka. Personal Demo pengguna kekal ditangguhkan dan Go Live kekal NO-GO.** Semakan ini mempin calon PostgreSQL Draft PR #73 pada `0fe8c7a3984e9472dd38ad2bc686a87f37952a9d` dan calon makmal PostgreSQL/Oracle Free Draft PR #74 pada `3d1477c927e1dad5294d081b258a73b768b6ac34`. Keputusan calon terdahulu digunakan sebagai perbandingan sejarah sahaja. [PR #73](https://github.com/BangunanDotCom/sipintar-mbsp/pull/73) · [PR #74](https://github.com/BangunanDotCom/sipintar-mbsp/pull/74) · [Kriteria A/B](PENERIMAAN-SURAT-KUASA.md)

## Larian bebas pada SHA dipin

| Sasaran | Bukti larian Team 3 |
|---|---|
| #73 `0fe8c7a`, PostgreSQL tempatan | `vitest run tests/api.test.ts tests/delegation-evidence.test.ts --reporter=verbose`. **107 lulus, 1 dilangkau** kerana memerlukan profil DB Issue #24. Ujian itu dijalankan pada DB sintetik khusus dalam larian berasingan dan **lulus** |
| #73 `0fe8c7a`, Chromium dan proksi pembangunan | Playwright `portal.spec.ts`, perjalanan dua syarikat, satu PDF dan wakil yang dijemput. **1 lulus** |
| #74 `3d1477c`, PostgreSQL dan Oracle Free 23.26.4 | Migrasi termasuk Oracle 003, seed dengan akaun owner/runtime/scanner berasingan dan `vitest run tests/delegation-provider-parity.test.ts tests/delegation-evidence.test.ts`. **19 lulus**, termasuk tiga senario integrasi pada setiap enjin dan ujian unit |

Larian menggunakan akaun, PDF dan pangkalan data sintetik di loopback. Perkhidmatan dan fail aplikasi pada cabang calon kekal read-only bagi Team 3. Verdict datang daripada pengimbas fixture. Kesemua tujuh job CI PR #73 pada SHA yang sama turut berjaya dan direkod secara berasingan daripada bukti bebas. [CI #73](https://github.com/BangunanDotCom/sipintar-mbsp/actions/runs/45577867750) · [Ujian #73](https://github.com/BangunanDotCom/sipintar-mbsp/blob/0fe8c7a3984e9472dd38ad2bc686a87f37952a9d/tests/api.test.ts#L793) · [Ujian #74](https://github.com/BangunanDotCom/sipintar-mbsp/blob/3d1477c927e1dad5294d081b258a73b768b6ac34/tests/delegation-provider-parity.test.ts#L272)

## Keputusan setiap kriteria

**PASS** bermaksud asersi yang dinyatakan lulus dalam skop makmal dan pada SHA yang dilabel. **FAIL** bermaksud semakan menemui perbezaan daripada kontrak yang diterima. **BLOCKED** bermaksud sebahagian syarat masih memerlukan ujian, kontrak gabungan atau persekitaran yang diluluskan. Bukti daripada #74 hanya terpakai pada kontrak yang terdapat pada SHA itu.

| ID | Keputusan | Bukti dan baki penerimaan |
|---|---|---|
| A-N01 | **PASS · makmal** | #73 menolak PENDING, SCANNING, INFECTED, FAILED dan CLEAN tanpa bukti pada kedua-dua laluan bait. Ujian unit menolak verdict tidak dikenali. #74 menguji kedua-dua laluan untuk PDF LEGACY dan memastikan tiada kandungan dilepas sebelum kelayakan |
| A-N02 | **BLOCKED** | #73/#74 membuktikan penolakan hash/saiz tidak sepadan, verdict luput atau versi diganti dalam asersi suite. Bukti bebas kegagalan baca stor/DB dengan tiada pendedahan separa pada calon gabungan masih diperlukan |
| A-N03 | **PASS · #73**, **BLOCKED · kesetaraan penuh** | #73 membuktikan dashboard menggugurkan metadata surat kuasa. Paparan syarikat/PIC mengehadkan metadata mengikut syarikat, wakil, versi semasa dan kuasa. Sesi tamat, wakil ditarik, PIC luar skop, pegawai tanpa MFA dan wakil lain ditolak. Playwright menyemak dua akaun. #74 membuktikan penolakan akses laluan bait dalam makmal. Ulang matriks metadata terkini pada calon gabungan |
| A-N04 | **BLOCKED** | Suite #73/#74 menguji worker berganda, lease/verdict lapuk, kegagalan pengimbas fixture dan penggantian. Bukti pengimbas terurus dan penamatan kuasa sewaktu imbas pada calon gabungan masih diperlukan |
| A-N05 | **BLOCKED** | #73/#74 mengesahkan `private, no-store`, pengasingan akaun dan asersi header melalui Fastify. Playwright #73 turut melalui proksi pembangunan. Cache silang sesi dan redaksi log pada proksi diluluskan masih perlu dibuktikan |
| A-P01 | **PASS · makmal** | Kedua-dua laluan mengeluarkan bait fixture yang tepat selepas CLEAN pada #73/#74. Asersi menyemak attachment, header dan dua audit kejayaan. Pengimbas terurus kekal prasyarat operasi |
| B-N01 | **PASS · makmal** | #73/#74 menolak versi tiada, bukti syarikat lain dan bukti milik wakil lain dalam syarikat sama. #73 turut menolak penerima lain dan pertukaran syarikat ketika terima jemputan |
| B-N02 | **PASS · #73**, **FAIL · kesetaraan #74** | #73 menolak keempat-empat penerimaan apabila verdict luput, bukti diganti dan diluluskan semula, surat dibatalkan, atau kuasa wakil ditarik. Setiap kes mengesahkan jemputan belum digunakan dan tiada keahlian dicipta. #74 menyemak kelayakan semasa menggunakan kontrak terdahulu tanpa ikatan kepada versi bukti ketika jemputan dikeluarkan |
| B-N03 | **PASS · makmal** | #73 menolak pengesahan diri walaupun PIC global mempunyai MFA. Asersi peranan, daerah, MFA, Origin, CSRF dan sesi tamat lulus. #74 menguji pengasingan peranan dan pengesahan berskop pada kontraknya |
| B-N04 | **PASS · #73**, **BLOCKED · jemputan Oracle** | #73 membuktikan penerimaan menunggu kunci pembatalan, kemudian ditolak dengan jemputan belum digunakan, tiada keahlian serta tiada kuasa baharu. Revisi lapuk dan semakan bersaing turut diuji. #74 meliputi penggantian dan verifikasi bersaing. Ulang perlumbaan penerimaan dengan revokasi pada kontrak Oracle terkini |
| B-N05 | **PASS · transaksi makmal**, **BLOCKED · operasi** | #73/#74 menguji rollback pengesahan dan audit. #73 turut menguji kegagalan notifikasi, replay, pembatalan dan keadaan tanpa keahlian. Ujian pemulihan dan notifikasi merentas servis pada calon gabungan masih diperlukan |
| B-P01 | **PASS · verifikasi makmal**, **BLOCKED · kontrak jemputan gabungan** | #73/#74 menguji pengesah bebas, ikatan dokumen bagi dua wakil dan audit versi sasaran. #73 menerima jemputan bukti tepat sekali. Ulang positif dan negatif ikatan jemputan terkini pada SHA gabungan |

## Tindakan Team 2 dan keputusan penerimaan

**Kontrak yang berbeza.** Pada #73, jemputan mengikat syarikat, wakil yang mengeluarkan jemputan dan penerima kepada mandat langsung atau bukti tepat ketika dikeluarkan, termasuk ID, versi, hash dan tempoh sah keputusan imbasan. Penerimaan menyemak semula ikatan tersebut dalam transaksi. Pada #74, adapter menyemak kelayakan semasa tetapi belum mengesahkan bahawa ia sepadan dengan bukti ketika jemputan dikeluarkan. Team 2 perlu menyelaraskan kontrak, semantik jemputan terdahulu, skop metadata dan semakan serentak, kemudian mengulang matriks pada satu SHA gabungan dengan Team 1. [Kontrak #73](https://github.com/BangunanDotCom/sipintar-mbsp/blob/0fe8c7a3984e9472dd38ad2bc686a87f37952a9d/apps/api/src/company-invitations.ts#L52) · [Adapter Oracle #74](https://github.com/BangunanDotCom/sipintar-mbsp/blob/3d1477c927e1dad5294d081b258a73b768b6ac34/apps/api/src/oracle/company-invitations.ts#L150) · [Laluan PostgreSQL #74](https://github.com/BangunanDotCom/sipintar-mbsp/blob/3d1477c927e1dad5294d081b258a73b768b6ac34/apps/api/src/delegation-company-invitations.ts#L172)

**Bukti operasi.** JTIK perlu menyediakan persekitaran yang diluluskan untuk Oracle 19.30 SE2, ClamAV terurus, proksi/cache/log serta ujian kegagalan stor dan pemulihan. A/B kekal terbuka sehingga bukti bebas pada calon gabungan yang sama memenuhi kriteria. [Checklist JTIK #74](https://github.com/BangunanDotCom/sipintar-mbsp/blob/3d1477c927e1dad5294d081b258a73b768b6ac34/docs/ORACLE-JTIK-CHECKLIST.md)
