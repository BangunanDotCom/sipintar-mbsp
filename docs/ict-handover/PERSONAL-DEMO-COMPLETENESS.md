# Kelengkapan Fasa 1 untuk penerimaan Personal Demo

Penilaian berasaskan Demo Release 1.0, PR #65 dan aliran yang dapat dikesan dalam kod aplikasi. “Lengkap untuk latihan” bermaksud fungsi boleh diuji dengan data sintetik. Penerimaan pegawai, status operasi dan kelulusan JTIK ditentukan berasingan. [Pelan Fasa 1](../STAYLINK-PHASE1-MULTIWORKSTREAM-ICT-HANDOVER.md) · [Keputusan pemilik MBSP-01 hingga MBSP-08](OWNER-DECISION-PACK.md)

| Fungsi | Status | Bukti atau jurang |
| --- | --- | --- |
| K01/K02 · Premis, tingkat dan unit | Lengkap untuk latihan | UI menyimpan tingkat dan unit ber-UUID, termasuk satu unit merentasi beberapa tingkat. API membezakan bilangan unit dan tingkat. [Kod inventori](../../apps/api/src/premise-floors.ts) |
| K03/K04/K07 · Wakil, senarai semak dan bukti | Separa lengkap | Kuasa aktif/luput dan skop versi dikuatkuasakan. Hos demo menunjukkan metadata/verdict sintetik. Storan, semakan dokumen rasmi, kuarantin sebenar dan retensi perlu kelulusan. [Serahan portal sintetik](SYNTHETIC-PORTAL.md) |
| K05/K06 · Akuan, serahan dan pembetulan | Lengkap untuk latihan | Akuan berversi, cap jari polisi, snapshot tetap, audit dan pembetulan tersedia. Teks dan pengesahan operasi rasmi belum diluluskan. [Kod serahan](../../apps/api/src/synthetic-submissions.ts) |
| K08/K10 · Nasihat AI, tindakan PIC dan pendaftaran PPSK | Separa lengkap | AI berasaskan kiraan fixture. PIC boleh meminta pembetulan atau mengesahkan kelengkapan. PPSK SPU mendaftar dengan rujukan sintetik. Tiga PIC terikat kepada daerah masing-masing. [Kod semakan pegawai](../../apps/api/src/synthetic-portal-review.ts) |
| Rujukan jabatan teknikal | Belum dibangunkan sebagai aliran kes | Seed jabatan dan tetapan teknikal tersedia. Penghantaran rujukan, barisan jabatan, ulasan, eskalasi dan penutupan semua ulasan belum disediakan. |
| Keputusan mengikut unit dan tingkat | Separa lengkap | Inventori, pautan dan perbandingan versi tersedia. Tindakan keputusan semasa digunakan pada serahan keseluruhan. Peraturan keputusan bercampur/bergantung antara unit dan tingkat belum dilaksanakan. |
| SK, SKB, Tangguh dan Tolak | Belum dibangunkan | Laluan semakan menyokong pembetulan, lengkap dan daftar. Tiada peralihan rasmi SK/SKB/Tangguh/Tolak, skop syarat atau aturan rayuan. |
| Surat keputusan | Belum dibangunkan sebagai dokumen kes | Pentadbiran templat tersedia. Penjanaan surat daripada keputusan, versi lampiran, tandatangan dan penghantaran belum tersedia. |
| K09 · Pengiraan, pembayaran dan rekonsiliasi | Lengkap untuk latihan | RM50 setiap UUID unit fizikal, invois dan callback tiruan berulang dengan audit. Lejar rasmi, kontrak MBSPPay, refund dan proses Kewangan masih terbuka. [Kod bil sintetik](../../apps/api/src/synthetic-portal-billing.ts) |
| Penutupan dan arkib | Belum dibangunkan | Rekonsiliasi menyelesaikan status pembayaran tiruan sahaja. Penutupan kes, kuasa membuka semula, pegangan rekod dan pelupusan menunggu SOP. |
| Dashboard pemantauan / K11 | Separa lengkap | Dashboard peranan dan barisan daerah, carian serta status sintetik tersedia. Analitik pengurusan, pemantauan SLA, laporan agregat merentas daerah dan dasar rekod belum dibuktikan. [Dashboard](../../apps/web/src/Dashboard.tsx) |

## Urutan susulan untuk penerimaan sistem

1. Jabatan Bangunan mengesahkan matriks rujukan jabatan, pemilik keputusan, tindakan SK/SKB/Tangguh/Tolak, skop setiap unit/tingkat dan peralihan kes. Selepas keputusan, bina simulasi dengan jejak audit, penolakan rentas peranan dan senario keputusan bercampur.
2. Jabatan Bangunan dan ICT mengesahkan templat surat, pelulus, tandatangan dan susunan surat apabila sebahagian unit mempunyai keputusan berlainan. Unit Rekod mengesahkan klasifikasi dan tempoh penyimpanan.
3. Kewangan dan ICT mengesahkan kontrak sandbox MBSPPay, rekonsiliasi, audit dan tanggungjawab apabila bayaran gagal atau berulang. Tetapkan aturan penutupan, pembukaan semula serta SLA sebelum dashboard agregat digunakan untuk pemantauan rasmi.

Rintis Personal Demo merakam bukti latihan di SPU, SPT dan SPS. Kelulusan JTIK untuk hos, kuasa Access bagi seorang pegawai, pengesahan dasar dan tandatangan penerimaan kekal gerbang berasingan.
