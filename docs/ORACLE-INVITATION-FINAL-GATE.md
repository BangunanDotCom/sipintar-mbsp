# P0 B · Gerbang akhir penerimaan jemputan

Penerimaan menggunakan transaksi tunggal untuk tuntutan jemputan, keahlian baharu, audit dan notifikasi. Akaun pemberi dan penerima serta pelantikan dikunci mengikut ID. Sesi penerima, syarikat, wakil asal dan bukti terpilih kekal terkunci selepas sah awal. Gerbang akhir memberi keputusan selepas keempat-empat penulisan dan sebelum komit.

1. Baca semula mandat wakil dan, jika menggunakan surat kuasa, bukti yang dikunci. Sahkan ikatan token asal dan integriti bait. Baca semula verdict serta versi semasa. Penggantian atau imbasan dengan verdict baharu tidak mengaktifkan token lama.
2. Pernyataan SQL terakhir menggunakan jam pangkalan data. Ia mengesahkan syarikat aktif, status kedua-dua pengguna, peranan dan pelantikan pemberi, sesi dan peranan penerima, skop wakil asal serta tempoh jemputan, wakil, bukti dan CLEAN. Sempadan akhir adalah eksklusif. Nilai tepat pada waktu luput ditolak. PostgreSQL menggunakan `clock_timestamp()` dalam UTC dan Oracle menggunakan `SYSTIMESTAMP`.
3. Kegagalan menggulung empat penulisan. Revokasi yang memegang kunci dahulu dilihat oleh penerimaan yang menunggu. Jika penerimaan komit dahulu, revokasi kemudian tidak memadamkan sejarah penerimaan yang sudah sah.

Terdapat sela kecil antara pernyataan terakhir dan komit pemacu. Kunci menghalang perubahan baris bersekutu dalam sela itu. Masa terus bergerak, termasuk ketika DB menunggu log komit. Invarian ialah kelayakan pada pernyataan gerbang akhir sambil memegang kunci, bukan jaminan bahawa masa fizikal komit mendahului setiap tarikh luput.

Suite `tests/delegation-provider-parity.test.ts` menggunakan kandungan sintetik sahaja. Tempoh luput semasa penulisan diuji dengan pencetus makmal yang bermula semasa pelantikan masih hidup, menunggu jam pangkalan data mencapai tarikh luput, kemudian menyemak tuntutan, keahlian, audit dan notifikasi masih kosong. Bukti Oracle Free tertakluk pada semakan bebas Team 3 dan penerimaan JTIK.
