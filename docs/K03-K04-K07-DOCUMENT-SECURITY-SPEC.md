# Spesifikasi keselamatan dan pengurusan dokumen STAYLink MBSP

**Draf untuk semakan MBSP dan ICT · 19 November 2026**

Skop K03, K04 dan K07 dalam [Issue #22](https://github.com/BangunanDotCom/sipintar-mbsp/issues/22). Baseline `issue-20-k02-unit-floor-links` pada `8625617`. [PR #19](https://github.com/BangunanDotCom/sipintar-mbsp/pull/19) menyediakan identiti tingkat stabil dan [PR #21](https://github.com/BangunanDotCom/sipintar-mbsp/pull/21) menyediakan unit fizikal serta pautan unit–tingkat dalam satu draf. Spesifikasi Fasa 1 dirujuk daripada commit `7e4cd53`, dengan konteks [Issue #15](https://github.com/BangunanDotCom/sipintar-mbsp/issues/15) dan [pelan K02](K02-UNIT-IDENTITY-PLAN.md).

## Kedudukan keputusan dan kelulusan

**Asas dipersetujui** ialah prinsip yang direkod dalam spesifikasi Fasa 1 dan Issue #22. **Cadangan teknikal** menerangkan cara memenuhi prinsip itu untuk semakan. **Pengesahan tertunggak** memerlukan pemilik dasar yang disenaraikan. Kelulusan Issue #22 meliputi kerja dokumentasi.

| Perkara | Asas dipersetujui | Pengesahan tertunggak dan pemilik |
| --- | --- | --- |
| K03 · Identiti dan persetujuan | Penyerah, pemohon rasmi dan wakil direkod berasingan; kuasa semasa disemak semula. Penerimaan jemputan merekodkan persetujuan. | Pegawai diberi kuasa dan Jabatan Bangunan mengesahkan dokumen sah, skop/unit/tempoh kuasa, status wajib ketika hantar, dan SOP penggantian atau pembatalan wakil. |
| K04 · Kelengkapan | Bukti wajib mesti tersedia sebelum serahan; versi polisi dan dokumen perlu boleh dijejak. | Jabatan Bangunan meluluskan kategori, syarat mengikut pemohon dan premis, kesegaran, bilangan fail dan pengganti. ICT mengesahkan format, had teknikal dan keupayaan operasi. |
| K07 · Akses dan verifikasi | Dokumen persendirian, semakan akses semasa, kuarantin dan imbasan gagal tertutup. Keputusan manusia dan imbasan direkod berasingan. | Pegawai diberi kuasa mengesahkan skop peranan, pengasingan pegawai, aliran eskalasi dan siapa boleh mengesahkan atau membuka semula keputusan. ICT mengesahkan model akses dan cara penguatkuasaan. |
| K07 · Pengendalian data | Versi serahan perlu dipelihara dan akses boleh diaudit. | ICT dan Unit Rekod mengesahkan klasifikasi, penyedia/lokasi storan, kunci enkripsi, polisi log, retensi, pelupusan, legal hold, backup dan pemulihan. |
| K07 · Kesiapan operasi | Kawalan dibuktikan pada data sintetik sebelum melibatkan data sebenar. | ICT, pemilik proses dan Unit Rekod menandatangani bukti keselamatan dan operasi sebelum cadangan pengaktifan. |

Bagi setiap pengesahan, catat keputusan, pelulus, rujukan minit/SOP, versi, tarikh kuat kuasa dan kesan pada rekod lama. Polisi belum diterbitkan dan keputusan bercanggah menghalang pengaktifan bagi skop terjejas. Nilai retensi atau pengecualian memerlukan sumber rasmi.

## Kedudukan kod semasa

- Pemilik draf dan kuasa wakil disemak dalam transaksi. Laluan profil syarikat menyimpan surat kuasa PDF berasingan; had dan pemeriksaan format di laluan itu tidak menghasilkan verdict malware. Pengesahan perwakilan semasa mempunyai skop khas bagi PIC seluruh daerah dan semakan pengesah bebas. Pakej ini tidak menetapkan skop pegawai baharu. [Draf](../apps/api/src/application-drafts.ts) · [Laluan profil dan perwakilan](../apps/api/src/routes.ts)
- Metadata dokumen draf boleh dibaca dengan `no-store`; respons mengecualikan kunci storan dan memulangkan `uploadEnabled:false` serta `submissionEnabled:false`. Model semasa mengikat versi kepada draf dan kategori. Ia belum mengikat set dokumen kepada UUID unit/tingkat atau versi polisi. [Metadata](../apps/api/src/application-documents.ts) · [Skema](../prisma/schema.prisma)
- Penyesuai storan lalai dinyahaktifkan; storan setempat memerlukan opt-in dalam pembangunan atau ujian. Scanner opt-in dan pekerja imbasan sudah mempunyai lease, pengesahan hash, serta perlindungan terhadap keputusan pekerja lapuk. Ini bukti kod dan ujian sedia ada bagi komponen, bukan bukti operasi storan sebenar, jadual retensi atau kesediaan produksi. [Konfigurasi storan](../apps/api/src/document-store-config.ts) · [Pekerja imbasan](../apps/api/src/document-scan-worker.ts)

## K03 · Bukti dan pengesahan kuasa

1. Pemohon individu bertindak untuk dirinya. Bagi syarikat, sistem mendapatkan akaun penyerah dan identiti syarikat daripada sesi dan rekod server-side. Pemilik draf kekal pemulanya. Keahlian syarikat yang sama tidak memberikan akses kepada draf orang lain. Wakil individu di luar kapasiti sendiri kekal memerlukan keputusan MBSP.
2. Cadangkan `AuthorityEvidence` sebagai pautan antara pelantikan wakil, pemohon rasmi, dokumen versi tertentu, skop draf/premis/unit/tingkat dan tempoh sah. Bukti hak guna premis dan surat kuasa wakil ialah dua syarat berasingan. Bagi surat warisan, paut semula hanya selepas skop, tarikh, integriti dan verdict imbasan disahkan melalui aliran yang diluluskan.
3. Persetujuan jemputan, keputusan imbasan dan keputusan pegawai mempunyai status sendiri. Pegawai menyemak pemberi/penerima kuasa, skop, tarikh dan dokumen asal yang dibenarkan, kemudian merekod keputusan, sebab, peranan aktif, masa dan versi bukti. Bukti berstatus `CLEAN` boleh dipertimbangkan; syarat `VERIFIED` pada saat serahan bergantung pada polisi K03/K04 yang diluluskan. Cadangkan pengesah bebas daripada penyerah, pemberi kuasa dan subjek bukti, mengikut matriks yang MBSP sahkan.
4. Semak status pelantikan, skop dan tempoh pada baca, tulis, muat turun dan pengesahan, serta dekat titik commit untuk tindakan yang mengubah keadaan. Pembatalan, luput atau syarikat tidak aktif menamatkan akses semasa. Snapshot terdahulu kekal sebagai bukti; dokumen tidak diwarisi oleh wakil baharu sehingga SOP pengambilalihan memberi kuasa.

## K04 · Polisi dinamik dan matriks cadangan

`DocumentPolicyVersion` yang diterbitkan mengandungi tarikh kuat kuasa, jenis pemohon, jenis premis, keadaan yang diluluskan, kategori, skop, bukti wajib/bersyarat/pilihan, syarat pemakaian, bukti alternatif, kardinaliti dan tahap pengesahan. Setiap polisi merujuk konfigurasi had ICT yang diluluskan. Evaluator pelayan menentukan satu keputusan bagi setiap kategori dan skop. Peraturan bersyarat hanya terpakai apabila fakta pencetus boleh disahkan; fakta tidak cukup, versi tidak diketahui atau lebih daripada satu peraturan muktamad memberi sekatan semakan. Alternatif atau pengecualian memerlukan peraturan berversi dan sebab yang boleh diaudit.

Bagi draf, pratonton menyatakan versi polisi dan sebab sekatan. Semasa serahan, pelayan menilai semula versi polisi, dokumen, kesahihan kuasa dan skop; klien perlu semak semula jika versi berubah. Snapshot serahan menyimpan versi polisi, keputusan kelengkapan serta UUID dokumen yang tepat. Pembetulan seterusnya menggunakan versi berkuat kuasa yang diluluskan bagi proses pembetulan, tanpa mengubah snapshot lama.

| Kategori cadangan | Individu | Syarikat melalui wakil | Skop cadangan dan pencetus | Format dalam kod semasa |
| --- | --- | --- | --- | --- |
| `premises_plan` | Wajib | Wajib | Premis; pelan lokasi dan lot meliputi unit terlibat. | PDF |
| `floor_layout` | Wajib | Wajib | Aras terlibat; bukti gabungan hanya jika polisi mengiktiraf liputan setiap aras. | PDF |
| `ownership_or_tenancy` | Wajib | Wajib | Premis/unit; hak milik, pajakan atau kebenaran sah, dengan padanan skop. MBSP menentukan kesegaran dan alternatif. | PDF |
| `premises_photos` | Wajib | Wajib | Premis/unit; foto luar/dalaman mengikut jenis premis. MBSP tetapkan bilangan; ICT mengesahkan pengendalian metadata dan pendedahan peribadi. | JPEG/PNG |
| `company_authority` | Tidak terpakai jika bertindak sendiri | Wajib | Syarikat dan wakil; paut ke skop kuasa yang benar-benar diliputi. | PDF |
| `building_certificate` | Bersyarat | Bersyarat | Premis/unit; jenis bangunan, kegunaan dan status CCC/CFO/OC mengikut dasar diluluskan. | PDF |
| `fire_safety` | Bersyarat | Bersyarat | Premis/aras; jenis kegunaan, keperluan teknikal dan risiko seperti ditetapkan MBSP. | PDF |

Senarai ini berasaskan tujuh kategori awal. Pencetus sebenar, ambang tempoh/saiz/bilangan, ekstrak SSM, permit khas dan dokumen pengenalan tambahan perlu diputuskan MBSP/ICT. Gunakan metadata teknikal sedia ada sebagai rujukan: pelan PDF 50/100 MiB, bukti sokongan PDF 20/50 MiB, foto JPEG/PNG 10/20 MiB, dan surat kuasa profil PDF 10/20 MiB, semuanya lalai/siling semasa. Had ini bukan sasaran penggunaan mutlak; had berkesan ialah minimum polisi kategori, kapasiti proksi/API, storan dan pengimbas yang disahkan. [Kategori](../packages/shared/src/supporting-documents.ts) · [Polisi teknikal semasa](../apps/api/src/upload-policy.ts)

## K07 · Pemilikan, akses dan versi

- Cadangkan set bukti dengan UUID server-side bagi kategori dan skop `APPLICATION`, `PREMISE`, `UNIT` atau `FLOOR`. `draftId` mengikat pemilik; sasaran bukan peringkat permohonan menggunakan UUID sah dalam draf/premis yang sama. UUID fizikal K02 dan FK komposit ialah asas, dengan pengesahan kembali dalam transaksi dan pertahanan DB apabila skema diluluskan. Dokumen yang meliputi beberapa aras/unit boleh dipaut kepada beberapa sasaran yang sah dalam draf yang sama jika polisi membenarkannya.
- Set bukti mempunyai item fail dan `documentVersionId` immutable. Untuk setiap item, hanya satu versi aktif. Versi baharu merakam pembuat, masa pelayan, MIME disahkan, saiz, checksum, identiti objek dan kaitan versi lama. Penggantian atomik menentukan versi aktif baharu sebagai `PENDING`; keputusan versi `CLEAN` yang diganti tidak boleh digunakan untuk melepasi gerbang. Snapshot serahan merujuk versi sejarah secara tepat. Versi lama kekal tertakluk kepada polisi rekod dan akses sejarah.
- Pengasingan DB dan storan perlu disemak bersama. Server menjana kunci objek dan memadankannya dengan versi serta skop draf; identiti objek, token dan alamat storan tidak muncul dalam DTO atau audit pengguna. Rujukan yatim atau penggantian separa perlu dikesan dan didamaikan secara idempotent sebelum fail boleh digunakan.

| Aktor | Akses cadangan | Pemisahan tugas dan sempadan |
| --- | --- | --- |
| Pemohon pemilik | Lihat metadata sendiri, muat naik/ganti dalam draf apabila ciri diluluskan, muat turun versi yang dibenarkan. | Akaun aktif, e-mel disahkan, sesi/CSRF/Origin untuk mutasi. Akses silang pemilik gagal tertutup. |
| Wakil syarikat | Seperti pemilik bagi draf sendiri dengan pelantikan semasa dan syarikat aktif. | Kuasa diperiksa mengikut skop bukti. Jemputan diterima tidak memberi akses draf rakan wakil. |
| Pegawai semakan | Cadangan baca fail `CLEAN` dalam kes ditugaskan dengan MFA dan kuasa sah. | Pecahkan hak baca dan membuat keputusan. Matriks baharu menunggu MBSP; permission semasa `representation.verify` tidak diperluas secara tersirat. |
| ICT/Unit Rekod | Cadangan pentadbiran konfigurasi, operasi rekod dan paparan audit berskop. | Pentadbir log, kunci atau konfigurasi tidak mendapat akses kandungan secara automatik. Akses kecemasan memerlukan SOP, sebab, kelulusan dan jejak audit. |
| Pengimbas/identiti perkhidmatan | Membaca objek kuarantin dan menulis verdict bagi versi/lease sendiri. | Tiada hak meluluskan bukti, mengubah skop atau menawarkan muat turun kepada pengguna. |

### Penyimpanan, muat turun dan audit

Cadangkan pemisahan kuarantin dan ruang dokumen lulus secara logik atau fizikal, akses minimum, kawalan tulis kondisional, TLS semasa transit dan enkripsi di storan serta backup. ICT memilih penyedia/region, KMS, pemilik kunci, rotasi, pemisahan tugasan kunci, pemulihan dan kaedah pembuktian tiada URL awam. Elakkan cache awam/CDN bagi fail persendirian.

Utamakan muat turun melalui API berautorisasikan sesi yang menyemak pemilikan, peranan, skop, status `CLEAN` dan polisi versi bagi setiap permintaan. Gunakan attachment, jenis MIME yang diluluskan serta `private, no-store`. Jika ICT meluluskan pautan terhad, ikat token kepada aktor, objek/versi, operasi dan masa luput, dengan penebusan melalui API. TTL, penggunaan sekali dan keperluan pembatalan perlu disahkan ICT. URL storan jenis bearer yang terus boleh ditebus tidak memenuhi syarat pembatalan serta-merta. Rekod permintaan dan keputusan muat turun, bukan token atau bait fail.

Audit cadangan merekod pelaku, peranan aktif, draf dan versi dokumen, tindakan, keputusan, sebab berstruktur, versi polisi, ID korelasi dan masa pelayan. Auditkan perubahan kuasa, muat naik, penolakan, keputusan imbasan/pegawai, muat turun dan pelupusan. Password, token, kunci objek, bait fail dan pengenalan penuh dikecualikan daripada log. Polisi akses audit, redaksi nama fail, pengumpulan log, bukti integriti append-only dan retensi log memerlukan pengesahan.

| Kelas rekod untuk diputuskan | Pencetus dan kaedah cadangan | Pengesahan |
| --- | --- | --- |
| Fail draf/kuarantin dan objek yatim | Bezakan kegagalan sementara, versi diganti, objek separa dan draf ditinggal. Sahkan tiada pautan sah sebelum sebarang pelupusan. | ICT/Unit Rekod tetapkan klasifikasi, tempoh, retry, kelulusan dan eskalasi. |
| Fail diterima, versi sejarah dan bukti kuasa | Kitar hayat mengikut keadaan kes, versi polisi dan legal hold. Pelupusan tidak merosakkan integriti bukti yang perlu dikekalkan. | Unit Rekod/MBSP tetapkan mula kira tempoh, retensi, pengecualian, pegawai pelulus dan bukti pelupusan. |
| Audit, backup dan replika | Rangkumi akses, redaksi, salinan replika, enkripsi, legal hold dan pemulihan. Padam atau hentikan pemulihan data tamat tempoh hanya ikut SOP. | ICT/Unit Rekod sahkan tempoh berasingan, pelupusan, kawalan backup, RPO/RTO dan bukti pemulihan. |

Sehingga jadual rekod disahkan, hanya data sintetik digunakan untuk pengesahan reka bentuk. Saiz, TTL dan retensi tidak dipilih sebagai keputusan dasar oleh spesifikasi ini.

### Muat naik dan kuarantin

1. Pelayan mengesahkan sesi, kuasa, versi draf, kategori, skop dan kuota sebelum menerima fail. Gunakan penstriman terhad; periksa had bait sebenar, jenis yang dibenarkan, tandatangan dan struktur. Guna label fail yang dibersihkan untuk paparan, sementara kunci objek dijana pelayan. Dasar fail yang tidak dapat diperiksa seperti format tidak disokong atau kandungan tersulit menunggu keputusan ICT dan gagal tertutup.
2. Simpan dalam kuarantin persendirian dan rekod versi `PENDING`. Gunakan checksum, version compare dan idempotensi untuk menyelaras metadata, fail dan outbox/job. Jika storan atau transaksi gagal separa, dedahkan tiada fail boleh guna; kerja penyelarasan hanya menangani objek yang dibuktikan yatim.
3. Pekerja menuntut `PENDING → SCANNING` dengan lease unik, memeriksa integriti kandungan dan menggunakan keputusan yang sepadan versi serta lease aktif. Hasil scan ialah `CLEAN`, `INFECTED` atau `FAILED`. Timeout, scanner tidak tersedia, keputusan tidak dikenali atau hash tidak sepadan gagal tertutup. Retry berhad dan eskalasi memerlukan polisi ICT; hanya tugas sah boleh mengambil lease tamat. Hasil lapuk tidak boleh menimpa keputusan lebih baharu.
4. Fail `PENDING`, `SCANNING`, `FAILED` atau `INFECTED` tidak boleh dimuat turun oleh pengguna atau memenuhi gerbang. Verdict `CLEAN` hanya melayakkan semakan seterusnya; pengesahan pegawai `UNVERIFIED → VERIFIED/REJECTED` ialah tindakan berasingan. Syarat tepat untuk dokumen pilihan yang dipautkan dan kategori yang memerlukan verifikasi sebelum hantar kekal pada polisi K04 diluluskan.

### Kontrak API cadangan

| Laluan/tindakan | Kontrak minimum dan penguatkuasaan |
| --- | --- |
| `GET …/documents` dan `GET …/submission-readiness` | Metadata selamat, skop, versi polisi, verdict terhad dan sebab sekatan. Kekalkan `no-store` dan bezakan kesiapan draf daripada pengaktifan serahan. |
| `POST …/documents` | Multipart terhad dengan versi draf, kategori, skop, UUID sasaran, versi yang diganti jika ada dan fail. Kunci idempotensi mencegah versi berganda; respons `202` dengan UUID versi dan `PENDING` hanya apabila rekod dan penyelarasan kuarantin sedia. |
| `GET …/documents/{documentVersionId}/download` | Semak semula sesi, skop, peranan dan integriti; attachment no-store bagi kandungan yang layak. Pautan terhad opsyenal selepas kelulusan. |
| Tindakan pengesahan pegawai yang dicadangkan | Periksa kelayakan pegawai, penugasan, MFA, pemisahan tugas, versi bukti dan sebab; hasil diikat pada versi dokumen. Laluan dan permission khusus belum diluluskan. |

Cadangan status: 401 bagi sesi tidak sah, 403 bagi CSRF atau kebenaran tindakan, 404 bagi sumber di luar skop, 409 bagi versi lapuk, penggantian serentak atau fail belum layak, 413/415 bagi had/jenis fail dan 503 bagi kebergantungan gagal. Respons tidak mendedahkan kewujudan objek merentas skop.

## Ancaman, ujian penerimaan dan PR berfasa

| Ancaman atau kegagalan | Ujian keselamatan dan hasil diterima |
| --- | --- |
| Akses silang draf, unit, aras, syarikat | Duplikasi skop sintetik, UUID asing, wakil rakan syarikat, pelantikan dibatalkan/luput, pegawai luar skop. Tiada respons kandungan atau metadata sensitif. |
| Pemalsuan tindakan dan kuasa berlebihan | Tolak sesi tamat, Origin/CSRF salah, peranan tidak berkuasa, pegawai tanpa MFA dan pengesahan sendiri. Login-return mengekalkan laluan yang dibenarkan. |
| Kandungan tidak selamat atau berlebihan | Fixture sintetik untuk verdict infected/gagal, fail yang diisytihar dengan format salah, had bait/kuota, hash berubah dan scan timeout. Tiada fail menjadi `CLEAN` sebagai lalai. |
| Konflik proses dan versi | Simpan bersaing, versi lapuk/pengganti, lease luput, pekerja lapuk, job berulang, kegagalan DB/storan separa. Tiada kehilangan snapshot atau versi aktif berganda; kerja yatim boleh dikenal pasti. |
| Pendedahan melalui pautan dan log | Tamat tempoh, penebusan oleh aktor lain, hak ditarik selepas penerbitan, cache awam dan redaksi access log. Kandungan disekat dan tiada token atau kunci storan muncul. |
| Retensi/pemulihan yang salah | Fixture backup/restore, legal hold, sejarah serahan dan permintaan pelupusan. Versi bersejarah dan rekod ditahan terpelihara sehingga aturan diluluskan. |

| PR cadangan | Prasyarat | Kriteria penerimaan |
| --- | --- | --- |
| 1 · Polisi dan skop dokumen berversi | MBSP meluluskan matriks kategori dan aturan wakil; permit perubahan skema secara khusus. | Ujian unit deterministik bagi jenis pemohon/premis, alternatif, versi lapuk dan polisi bercanggah. FK skop serta snapshot disahkan pada PostgreSQL sintetik. |
| 2 · Kuarantin dan pengimbasan persekitaran ujian | Kelulusan ICT bagi storan, kunci, had, log dan pengimbas; DB sintetik terasing. | Fail kekal persendirian, queue gagal tertutup dan semua keputusan diikat pada versi/lease. Bukti pemulihan dan pengasingan identiti perkhidmatan. |
| 3 · Muat naik dan muat turun aplikasi | PR 1–2 dan matriks pemohon/pegawai diluluskan. | Playwright dan API meliputi simpan, reload, penggantian, akses silang, pembatalan wakil dan pautan tamat. Tiada pengaktifan sebenar tanpa keputusan ICT. |
| 4 · Bukti kuasa dan semakan pegawai | SOP MBSP, role assignment dan duty separation ditandatangani. | Versi surat kuasa yang sah dan `CLEAN` boleh disemak pegawai bebas; penolakan/luput menghalang gerbang sewajarnya. Jejak keputusan lengkap. |
| 5 · Retensi dan gerbang serahan K05/K06 | Unit Rekod meluluskan retensi, legal hold dan pelupusan; semua fasa sebelumnya terbukti. | Dry-run retensi, backup/restore terasing dan penyeliaan manusia. Gerbang atomik memeriksa scope, kuasa, polisi dan dokumen, serta mengekalkan snapshot lama. |

Keputusan selepas spesifikasi ialah semakan MBSP terhadap K03/K04 dan semakan ICT/Unit Rekod terhadap K07. Pelaksanaan berikutnya boleh bermula dengan kontrak polisi berversi dan ujian skop sintetik selepas pengesahan yang berkaitan.
