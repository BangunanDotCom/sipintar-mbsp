# Pakej keputusan pemilik proses STAYLink MBSP

Bahan mesyuarat Jabatan Bangunan, ICT, Unit Rekod dan Kewangan. Semua cadangan MBSP-01 hingga MBSP-08 masih menunggu keputusan. Tarikh kuat kuasa, nombor versi dasar dan pelulus bernama ialah TBD bagi setiap baris. Konfigurasi sintetik sedia ada membolehkan ujian dan demonstrasi terkawal. Kelulusan operasi direkod melalui proses pemilik. [Asas reka bentuk dan konfigurasi Issue #45](OWNER-PROPOSALS.md)

| ID dan pelulus | Syor dan pilihan mesyuarat | Kesan, risiko dan bukti yang perlu dibawa | Gerbang atau konfigurasi terjejas |
| --- | --- | --- | --- |
| MBSP-01 · Jabatan Bangunan, semakan ICT | Syorkan kategori versi mengikut kapasiti, premis dan skop. Pilih senarai penuh, senarai rintis terhad, atau tangguh. | Senarai penuh merangkumi lebih banyak kes dan memerlukan peraturan pengecualian. Rintis mengurangkan variasi tetapi memerlukan skop diterbitkan. Tangguh mengekalkan serahan rasmi tertutup. Bawa matriks bukti, had fail, dokumen alternatif/luput dan bukti ujian CLEAN/FAILED serta skop. | `documents` latihan. Kategori, lampiran dan serahan rasmi kekal tertutup selepas semakan dokumen sahaja. |
| MBSP-02 · Jabatan Bangunan, semakan ICT dan penasihat undang-undang | Syorkan akuan berversi terikat pada snapshot. Pilih persetujuan eksplisit dengan sesi dan CSRF sedia ada, pengesahan tambahan terpilih, atau tangguh. | Pengesahan tambahan menambah langkah serta keperluan pemulihan dan aksesibiliti. Bawa teks BM, pencetus pengakuan semula, kuasa penandatangan dan bukti penolakan cap jari lama. MFA pegawai kekal wajib. | `declaration` latihan. Serahan rasmi tertutup sementara menunggu teks, kuasa dan kelulusan. |
| MBSP-03 · Jabatan Bangunan, semakan ICT | Syorkan PIC dan PPSK berasingan mengikut daerah. Pilih tugasan daerah standard, pengecualian berjangka dengan kuasa dan audit, atau tangguh. | Pengecualian memerlukan pemberi kuasa, had masa, konflik kepentingan dan prosedur batal. Bawa jadual pelantikan, liputan silang daerah, MFA, delegasi dan pemisahan tugas. | `review.enabled` dengan `DISTRICT_FIXTURE` untuk latihan. Akses rasmi baharu memerlukan kelulusan matriks kuasa. |
| MBSP-04 · Jabatan Bangunan dan ICT | Syorkan UUID dalaman stabil dan nombor rasmi berasingan. Pilih siri pusat atau siri daerah/tahun. Tangguh jika kontrak dan pemilik daftar belum diputuskan. | Pilihan mempengaruhi keunikan, pertukaran daerah, audit nombor terlangkau dan integrasi daftar. Bawa contoh format, penomboran atomik, ujian serentak, pembatalan dan rekonsiliasi sejarah. | `reference.strategy=SYNTHETIC_UUID`. Tiada nombor rasmi dijana. |
| MBSP-05 · ICT dan Unit Rekod | Syorkan storan persendirian, kuarantin gagal tertutup, retensi berversi dan legal hold. Pilih jadual mengikut kelas rekod, jadual tunggal dengan pengecualian, atau tangguh. | Jadual salah berisiko menyimpan berlebihan atau melupuskan terlalu awal. Bawa klasifikasi, lokasi, kunci, SLA pengimbas, bukti pemulihan objek dan cadangan RPO 24 jam/RTO 8 jam untuk pengesahan ICT. | `records.mode=DISABLED`. Pengaktifan memerlukan aturan storan, pengimbas, akses dan retensi yang dipersetujui. |
| MBSP-06 · ICT, Jabatan Bangunan dan Unit Rekod | Syorkan sesi, Origin/CSRF, MFA, skop, audit dan pengesahan manusia selepas nasihat AI. Pilih penilaian ICT berperingkat selepas bukti, atau tangguh pelepasan. | Bawa matriks peranan, hak minimum, penjagaan kunci, pengawasan, audit tahan ubah dan bukti ujian negatif/pemulihan. Persekitaran staging memerlukan penilaian keselamatan yang diluluskan. | `security.mode=ENFORCED`. Tiada pilihan konfigurasi untuk melonggarkan kawalan. |
| MBSP-07 · Kewangan, ICT dan Jabatan Bangunan | Syorkan penilaian sandbox berasingan untuk model RM50 bagi setiap UUID unit fizikal unik bersama lejar idempotent. Pilih semakan model dan sandbox kemudian, pulangkan model fi untuk keputusan baharu, atau kekalkan tertutup. | Bawa kuasa fi, asas unit/pengecualian, tamat tempoh, refund, kontrak callback dan imbangan lejar. Pembayaran rasmi memerlukan keputusan berasingan daripada penerimaan sandbox. | `billing.mode=DISABLED` atau `MOCK` untuk latihan. RM50 ialah kadar fixture semasa. Pembayaran rasmi tertutup. |
| MBSP-08 · Jabatan Bangunan, JTK dan Unit Rekod | Syorkan kekalkan ringkasan pekerja, dengan maklumat majikan pilihan hanya selepas tujuan disahkan. Pilih ringkasan sedia ada, cadangkan medan minimum dengan asas kuasa, atau tangguh pengembangan. | Medan tambahan menambah tanggungjawab akses, retensi dan perkongsian rentas agensi. Bawa peta aliran data, asas kutipan, tujuan dan semakan borang serta hak akses. | Tiada medan baharu daripada Issue #54. Perubahan kutipan memerlukan reka bentuk dan kelulusan tersendiri. |

## Rekod keputusan semasa mesyuarat

Salin satu baris bagi setiap keputusan. Catat sebab keputusan dan tindakan sebelum menutup baris.

| ID | Pilihan dan status cadangan/diterima/ditolak/kembali | Pelulus bernama dan kuasa | Versi dan tarikh kuat kuasa MYT | Minit/SOP dan sebab | Pemilik pelaksanaan, bukti, regresi dan pelan undur |
| --- | --- | --- | --- | --- | --- |
| MBSP-__ | Cadangan, TBD | TBD | TBD | TBD | TBD |

Bagi cadangan yang diterima, rekod skop, had, tarikh semakan semula dan risiko yang diterima. Pautkan kriteria diterima kepada isu pelaksanaan, konfigurasi versi, penguji bebas, kaedah undur dan gerbang pengaktifan. Jika perubahan menyentuh pihak lain, dapatkan tandatangan fungsi berkenaan dalam rekod yang sama.

## Gerbang dan risiko terbuka

| Gerbang | Bukti yang diperlukan | Pemegang keputusan |
| --- | --- | --- |
| Kesiapsiagaan demo teknikal | SHA, keputusan suite, kit sintetik, eksport maklum balas, keputusan restore dan senarai sekatan. | ICT mengesahkan pakej demo. |
| UAT dalaman dilaksana dan diterima | Sesi difasilitasi dengan ID, tarikh MYT, peserta berkuasa, keputusan per senario, bukti ujian semula, isu terbuka dan rekod penerimaan yang ditandatangani. | Jabatan Bangunan dengan saksi ICT. CI membuktikan regresi teknikal sahaja. |
| Staging dibenarkan | Keputusan dasar diperlukan, penilaian keselamatan, semakan akses/rahsia, sandbox diluluskan, SOP insiden/undur dan pemulihan latihan, serta tarikh dan skop kebenaran. | ICT dan pemilik sistem, bersama Unit Rekod dan Kewangan bagi bidang masing-masing. |
| Produksi dibenarkan | Kelulusan keluaran berasingan dengan bukti staging, gerbang storan dan pembayaran, risiko diterima, operator, pemantauan dan pelan pemulihan. | Pemilik sistem dan fungsi berkuasa MBSP. |

| Risiko | Pemilik | Mitigasi sementara dan bukti penutupan |
| --- | --- | --- |
| Fasilitasi sebenar dan penerimaan belum direkodkan | Jabatan Bangunan | Jadualkan sesi enam senario. Lampirkan laporan yang disemak, bukti sama versi dan tandatangan pemegang kuasa. |
| Kebocoran melalui catatan bebas atau lampiran | Fasilitator, ICT dan Unit Rekod | Alias sintetik, rujukan bukti, fail setempat persendirian, semakan redaksi dan pelupusan mengikut arahan ICT. Tag bukti tidak memuat naik apa-apa. Sahkan lokasi simpanan dan penanggungjawab sebelum sesi sebenar. |
| Polisi kuasa, dokumen dan retensi belum ditetapkan | Jabatan Bangunan, ICT dan Unit Rekod | Kekalkan gerbang rasmi tertutup dan semak MBSP-01 hingga MBSP-06 serta MBSP-08. Bukti pemulihan PostgreSQL sintetik hanya meliputi DB latihan. |
| Kontrak MBSPPay, settlement dan refund belum diterima | Kewangan dan ICT | Gunakan lejar tiruan sahaja. Sahkan keputusan MBSP-07 dan bukti sandbox sebelum permohonan akses rasmi. |
| Aksesibiliti/peranti sebenar dan prestasi beban belum ditandatangani | ICT dan Jabatan Bangunan | Ujian Chromium, lebar 320/390 px dan ukuran kecil fixture. Sahkan pembaca skrin, peranti sasaran dan sasaran prestasi dengan pengguna dalaman. |
