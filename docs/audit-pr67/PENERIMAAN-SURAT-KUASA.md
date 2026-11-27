# Gerbang P0 surat kuasa · K03, K04, K07 dan K10

[Audit calon pembetulan PostgreSQL](AUDIT-CALON-P0.md) mencatat hasil bagi setiap ujian A/B. Kedua-dua P0 kekal terbuka.

**Status pada PR #69 `7970f1f857d245937fd0baaaf848e78e6f0ad1e7`: terbuka.** Gerbang A melindungi bait fail dan keputusan pengimbasan. Gerbang B memastikan keputusan pegawai berasaskan bukti bagi wakil, skop dan versi yang tepat. Kedua-duanya mesti lulus pada SHA calon yang sama. Semakan ini hanya menggunakan data dan verdict fixture sintetik. [PR #69](https://github.com/BangunanDotCom/sipintar-mbsp/pull/69)

## A · Muat turun PDF mensyaratkan keputusan imbasan yang sah

Laluan profil syarikat menyimpan PDF selepas validasi format/saiz. Laluan muat turun untuk syarikat dan pegawai mengembalikan bait terus daripada rekod surat kuasa. Semakan sumber pada SHA audit tidak menemui gerbang verdict imbasan pada kedua-duanya. [Laluan surat kuasa](https://github.com/BangunanDotCom/sipintar-mbsp/blob/7970f1f857d245937fd0baaaf848e78e6f0ad1e7/apps/api/src/routes.ts#L218)

**Kriteria penerimaan teknikal**

- A1. Versi baharu disimpan dalam kuarantin persendirian berstatus belum layak untuk muat turun. Hanya worker dibenarkan memberi verdict. Verdict CLEAN hanya terpakai pada versi immutable, hash dan saiz yang telah diperiksa. Status hilang, tidak dikenali atau data lama tanpa bukti yang setara gagal tertutup.
- A2. Setiap laluan byte, termasuk pemohon, PIC, pratonton dan kaedah penghantaran lain yang disokong, menggunakan keputusan kelayakan yang konsisten. Sebelum pendedahan, sahkan sesi, peranan aktif, MFA jika pegawai, kuasa dan skop semasa, kelayakan versi dan integriti bait yang dijangka. Versi lama yang tidak layak untuk portal hanya boleh dipertimbang melalui kuasa rasmi akses sejarah yang diaudit, dengan gerbang pengimbasan yang sama.
- A3. Gagal tertutup apabila stor, DB, scanner atau worker tidak dapat membuktikan kelayakan. Tiada bait/URL objek sebelum gerbang. Gunakan respons minimum dan seragam untuk sumber luar skop. Respons yang dibenarkan menggunakan attachment, jenis kandungan yang ditetapkan pelayan, nosniff dan `Cache-Control: private, no-store`. Log menyimpan ID korelasi dan keputusan minimum.
- A4. Verdict worker lewat atau lease tamat tidak boleh menukar kelayakan versi baharu. Ganti fail, batalkan akses dan pemulihan data mengekalkan semantik versi dan sejarah. Sediakan pelan migrasi yang meletakkan PDF warisan tanpa verdict setara dalam status tertahan sehingga diimbas semula.

| ID | Variasi fixture defensif | Asersi penerimaan |
|---|---|---|
| A-N01 | Versi PENDING, SCANNING, INFECTED, FAILED, verdict hilang atau tidak dikenali, dan rekod legacy tanpa verdict | Setiap laluan bait menolak. Tiada kandungan, URL objek, token, status kejayaan atau acara muat turun berjaya |
| A-N02 | CLEAN untuk versi terdahulu selepas versi pengganti, hash/saiz tidak sepadan, objek tiada, baca stor gagal | Tiada pendedahan separa atau fallback ke versi lain. Peristiwa gagal boleh dikorelasikan tanpa nilai sensitif |
| A-N03 | Sesi tidak sah/tamat, wakil tamat/dibatalkan, pengguna syarikat lain, PIC salah daerah/tugasan, pegawai tanpa MFA | Keputusan sejajar dengan kontrak 401/403/404 dan pendedahan minimum. Auth dan skop konsisten untuk metadata dan kandungan |
| A-N04 | Scanner timeout, worker duplicate, lease tamat, penamatan kuasa semasa pemeriksaan | Gerbang gagal tertutup. Satu verdict berkuat kuasa bagi lease sah; hasil lapuk tidak mengubah versi. Semak semantik perlumbaan dalam integration test terkawal |
| A-N05 | Muat turun melalui proksi dan permintaan ahli berbeza selepas muat turun yang sah | Header no-store, tiada cache awam, akses semula masih memerlukan semakan kuasa; log tiada rahsia atau kandungan |
| A-P01 | Fail rekaan CLEAN, hash/saiz sepadan dan kuasa sah bagi pemohon serta PIC yang dibenarkan | Satu respons attachment dengan metadata minimum, byte fixture tepat, header yang ditetapkan dan bukti audit berpadanan |

## B · Keputusan pengesahan memerlukan wakil dan versi surat kuasa khusus

Pada SHA audit, kontrak permintaan menerima status dan sebab. Pengendali mengira dokumen semasa pada aras syarikat, mengemas kini rekod wakil dan status dokumen syarikat tanpa ikatan keputusan kepada versi tertentu. [Laluan verifikasi](https://github.com/BangunanDotCom/sipintar-mbsp/blob/7970f1f857d245937fd0baaaf848e78e6f0ad1e7/apps/api/src/routes.ts#L314)

**Kriteria penerimaan teknikal**

- B1. Kontrak memerlukan identiti wakil dan versi bukti tertentu yang dipilih daripada bukti berskop. Semak kepunyaan syarikat, wakil, jenis/skop, sah dari/hingga, penggantian, revokasi, verdict CLEAN dan integriti. Sistem menjana pelaku, masa dan status daripada konteks sah. Pengesahan umum berdasarkan kewujudan fail syarikat tidak memadai.
- B2. Keputusan berkait dengan wakil, versi dokumen, skop, pengesah, peranan, masa, sebab dan perubahan status. Kekangan DB atau semakan transaksi yang setara menolak pautan silang syarikat/wakil. Output UI menyatakan versi yang diperiksa. Rekod wakil atau fail lain tidak berubah.
- B3. Revalidasi kuasa pegawai, MFA, pemisahan tugas, versi, verdict, revokasi dan hak semasa dalam transaksi yang menulis keputusan. Konflik atau kegagalan tulis menggulung status, ikatan dan audit bersama. Notifikasi selepas komit berasaskan outbox atau mekanisme idempotent yang dapat diselaraskan.
- B4. Syarat serahan dalam K03 menyemak ikatan masih berkuat kuasa, termasuk selepas pertukaran versi, tamat tempoh atau pembatalan. Keputusan lama kekal sebagai sejarah tanpa memberikan akses baharu. Peralihan data legacy mengekalkan sejarah dan hanya memberi kelayakan semasa selepas versi tertentu disahkan.

| ID | Variasi fixture defensif | Asersi penerimaan |
|---|---|---|
| B-N01 | Tiada ID versi, versi tidak wujud, dokumen syarikat lain, versi bagi wakil lain dalam syarikat sama | Respons penolakan konsisten. Tiada status, rekod ikatan atau acara pengesahan berjaya berubah |
| B-N02 | Versi diganti, dokumen/wakil belum sah, luput atau batal, verdict bukan CLEAN, skop unit atau daerah tidak sepadan | Pengesahan gagal. Kelayakan serahan kekal tertutup dan UI menyatakan sebab yang dibenarkan |
| B-N03 | Pengesah sendiri, pengesah dengan peranan/daerah salah, MFA tidak lengkap, Origin atau CSRF tidak sah | Tindakan ditolak. Kekalkan audit penolakan yang minimum dan tiada perubahan kebenaran |
| B-N04 | Dua pengesahan bersaing, revokasi atau penggantian dokumen sewaktu transaksi, percubaan ulang dengan versi lapuk | Hanya satu keputusan yang konsisten. Tiada naik taraf selepas revokasi berkuat kuasa dan tiada rekod separa |
| B-N05 | Kegagalan ketika menulis audit, gangguan notifikasi, replay permintaan, penamatan kuasa selepas kejayaan | Pengesahan dan audit atomik. Notifikasi boleh diselaraskan tanpa pendua. Serahan baharu dengan kuasa lama disekat. Sejarah kekal |
| B-P01 | Dua wakil pada syarikat yang sama dengan surat kuasa masing-masing. Pengesah bebas mengesahkan satu versi sah | Hanya hubungan wakil–versi sasaran berubah. Semak FK/rekod audit, paparan UI dan gerbang serahan dengan versi tepat |

## Bukti semakan semula Team 3

1. Pin SHA dan PR pembetulan Team 1. Bandingkan setiap laluan akses yang wujud, model rekod, worker, semantik migrasi, transaksi dan polisi pada commit itu. Periksa laluan warisan, variasi respons, UI dan proksi yang disokong.
2. Jalankan ujian regresi defensif projek untuk A/B pada DB dan stor sintetik terasing, diikuti ujian API, perjalanan wakil dengan MFA/CSRF, browser HTTPS dan restore. Jika asersi yang diperlukan tiada, rekod jurang. Kekalkan dokumen/verdik real-time rasmi tertutup.
3. Catat untuk setiap A/B ID hasil jangkaan, hasil sebenar, SHA, job, kontrak penolakan, keadaan sebelum/selepas dan semakan sejarah. Gerbang hanya boleh ditutup dengan semakan kod dan bukti runtime yang sepadan. Jika PR belum ada atau ujian disekat, tandakan **terbuka**.
