# Daftar keputusan pemilik STAYLink MBSP

Status setiap baris ialah **TERSEKAT** bagi operasi rasmi sehingga keputusan berkuasa, versi SOP, tarikh kuat kuasa dan bukti penerimaan direkodkan. Skop terbuka ini menggabungkan MBSP-01–08, Issue #68 dan penemuan audit. Gerbang makmal yang disebut di bawah memerlukan opt-in pada PostgreSQL sintetik. [Keputusan pemilik terdahulu](OWNER-DECISION-PACK.md) · [Matriks sistem](STAYLINK-DEVELOPMENT-STATUS.md) · [Issue #68](https://github.com/BangunanDotCom/sipintar-mbsp/issues/68)

| Keputusan yang perlu direkodkan | Pemilik | Peraturan dan penerimaan yang masih diperlukan |
| --- | --- | --- |
| Bukti, premis, wakil dan akuan | Jabatan Bangunan, JTIK, Unit Rekod | Kategori dokumen, alternatif, pengesahan GIS/daerah, kesan luput/penarikan surat kepada pembetulan, aturan rekod warisan, teks akuan, dan ujian P0 bebas pada calon sama. |
| Kuasa pegawai dan draf tidak aktif | Jabatan Bangunan, JTIK | Pemberi kuasa, had daerah, pemangku, konflik yang perlu ditolak, penyerahan kes, pengagihan semula, tahap data penyelia dan kesan 60 hari. Gerbang konflik latihan tidak menentukan pemilik kes rasmi. |
| BKT, rujukan dan KP | Jabatan Bangunan, Urus Setia JK, Perancang, Kejuruteraan | Pegawai penerima sah, klasifikasi BKT/lampiran, aturan pengembalian selepas snapshot, tarikh konsolidasi, SLA tujuh hari, tahap eskalasi, keputusan BKT dan kes lewat. |
| Notifikasi | Jabatan Bangunan, JTIK | Jadual, penerima, versi templat, kelulusan kandungan, syarat batal, polisi percubaan semula bagi hasil SMTP tidak pasti, kelayakan hos dan saluran insiden. |
| Nombor rujukan, AI dan prestasi | Jabatan Bangunan, JTIK | Siri/reset, tujuan serta sempadan data penyedia, fallback, kaedah metrik individu dan audit akses. |
| Fi, refund/dispute dan pelarasan | Kewangan, JTIK, Jabatan Bangunan | Asas unit unik, kadar kedua/pengecualian, akaun lejar, padanan resit, pemisahan pemohon/pegawai/pelulus, catatan pembetulan, reversal, refund/dispute dan kontrak MBSPPay sandbox. |
| Arkib, legal hold, retensi dan buka semula | Unit Rekod, Jabatan Bangunan, JTIK | Klasifikasi, jadual retensi, kuasa letak/lepas hold, proses kelulusan bebas, versi baharu selepas buka semula, kunci/pemulihan fail, pembatalan hak yang luput dan syarat pelupusan. |
| Surat, identiti dan integrasi | Jabatan Bangunan, JTIK | Kuasa lulus templat, jadual unit/tingkat, semakan fon/script, tandatangan dan revokasi sijil, GIS/SSO, SMTP/AI, secrets dan kontrak timeout/retry setiap penyedia. |
| Pekerja dan majikan | Jabatan Bangunan, JTK, Unit Rekod | Medan majikan pilihan, tujuan sah, had capaian dan retensi, kapasiti JK dan frasa surat. |
| Oracle, penerimaan dan operasi | Team 2, Team 3, JTIK, pemilik proses | Kesetaraan API dan skema pada Oracle 19.30 SE2, kuota dan skop `STL_`, bukti restore, proksi, stor, pengimbas, UAT dan kelulusan operasi. |

## Fon Han dan Jawi

Noto Sans CJK dan Noto Naskh Arabic mempunyai fail lesen OFL. Sebelum memilih subset atau mengedar pakej, semak syarat lesen fon dan nama rizab. Untuk Han, pilih variasi aksara yang dikehendaki dan uji nama/alamat berbilang skrip serta jadual merentas halaman. Untuk Jawi, uji set aksara khusus Jawi, pembentukan huruf, kedudukan diakritik dan teks bidirectional yang bercampur angka, mata wang serta nama jalan Latin. Semak paparan dan salinan teks pada Chromium serta pembaca PDF lain. PDF latihan v1/v2 kekal menggunakan laluan sedia ada dengan alternatif UTF-8. [Lesen Noto CJK](https://github.com/notofonts/noto-cjk/blob/main/Sans/LICENSE) · [Lesen Noto Naskh Arabic](https://github.com/google/fonts/blob/main/ofl/notonaskharabic/OFL.txt)

## Kontrak penyedia yang memerlukan penerimaan

| Sempadan | Input dan keputusan minimum | Kegagalan yang perlu ditangani |
| --- | --- | --- |
| MBSPPay | Rujukan invois bertandatangan, jumlah sen MYR, idempotency key, status/provenans, padanan settlement dan identiti pelulus | Timeout memerlukan semakan status sebelum retry, event ID ulangan mesti sepadan, callback luar skop ditolak, pelarasan melalui catatan baharu. |
| AI Pre-Check | Tujuan, metadata minimum, versi penyedia dan kod penemuan yang disahkan | Tamat masa dan respons tidak sah mengarah kepada semakan manusia tanpa kelulusan automatik. |
| Tandatangan | Hash dokumen, versi keputusan/templat, identiti penandatangan, sijil dan timestamp | Semak identiti, skop, integriti dan status sijil sebelum penerbitan. |
| SMTP | Penerima yang diluluskan, klasifikasi, ID deduplikasi dan respons penyampaian | Auto-retry hanya bagi penolakan sementara yang diketahui. Hasil tidak pasti masuk kuarantin operasi. |
| GIS dan identiti/SSO | Versi sempadan, provenance, audience/issuer dan skop aplikasi | Respons hilang atau tidak sah mengekalkan semakan manual atau akses tertutup. |

Pada prototaip makmal berasingan, kedua-dua fon menemui glyph untuk sampel Han dan Jawi yang dipilih. Ekstraksi Han menghasilkan teks yang dijangka, sementara pembaca PDF melaporkan amaran embedding fon. Ekstraksi Jawi bercampur Latin menyusun aksara RTL secara berbeza daripada input, dan satu aksara sampel bertukar pada ekstraksi. Sokongan Han/Jawi kekal belum diterima. Jadual berbilang skrip, pemisahan halaman, bentuk visual dan round-trip teks merentas pembaca perlu dibuktikan sebelum renderer v3 dipilih.

## Perkara pada calon penyatuan

Kewangan perlu menerima sumber yang layak untuk rekonsiliasi, rawatan percanggahan selepas komit dan pengasingan kuasa sebelum klasifikasi rasmi bagi tunggakan, kegagalan, refund/dispute, reversal atau pelarasan. Padanan dan backfill baharu menggunakan rekod sintetik per serahan. Jabatan Bangunan, JTIK dan Unit Rekod perlu menentukan klasifikasi lampiran BKT dan siapa boleh menerima atau meminda lampiran selepas snapshot. Team 2 dan JTIK perlu menerima kesetaraan replay, lock, indeks dan pemulihan Oracle; Team 3 perlu menilai semula A/B pada calon yang akan diuji pengguna. [Matriks penerimaan sistem](STAYLINK-SYSTEM-ACCEPTANCE-MATRIX.md)

## Penerimaan calon baki fungsi

- **Jabatan Bangunan dan JTIK** perlu menerima aturan pemangku, pengagihan semula dan konflik peranan, skop lampiran BKT, jadual notifikasi, penerima e-mel serta format surat. Peringatan kes digunakan dalam latihan dan kandungan e-mel hanya meminta pengguna menyemak portal.
- **Unit Rekod** perlu menerima tarikh mula retensi, pengecualian legal hold, proses kelulusan buka semula bebas, perubahan versi serta bukti pelupusan. Tempoh konfigurasi retensi calon digunakan untuk senarai semakan latihan.
- **Kewangan** perlu menerima pemisahan pemohon/penyemak/pelulus, kaedah menentukan baki layak refund dan peralihan reversal/dispute, serta spesifikasi MBSPPay sandbox.
- **Team 2, Team 3 dan JTIK** perlu menerima reka bentuk replay sejarah panjang sebelum kontrak skema rentas provider diubah, menjalankan semakan P0 bebas pada calon dan mengesahkan pemulihan stor, kunci serta prestasi Oracle sebenar.

Noto Sans CJK dan Noto Naskh Arabic mempunyai lesen SIL Open Font License. Ujian Chromium/Poppler mengekalkan 120 baris dan mengekstrak Han serta amaun, sementara mod raw Poppler mengekalkan tertib visual Jawi. Mod lalai dan layout memulihkan tertib logik selepas penanda bidirectional dibuang. Ujian ini belum meliputi salinan teks pada pembaca PDF lain. Pengujian terasing menggunakan fon sistem dan tiada fon tambahan diedarkan. [Noto CJK](https://github.com/notofonts/noto-cjk/blob/main/Sans/LICENSE) · [Noto Naskh Arabic](https://github.com/google/fonts/blob/main/ofl/notonaskharabic/OFL.txt)
