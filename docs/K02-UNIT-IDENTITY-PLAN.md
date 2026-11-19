# Pelan identiti unit fizikal K02

Reka bentuk susulan untuk [Issue #18](https://github.com/BangunanDotCom/sipintar-mbsp/issues/18). UUID tingkat menggunakan `PremiseFloor.id` sedia ada. `ApplicationPremises.accommodationUnits` ialah angka agregat. Skema semasa tiada rekod unit fizikal atau hubungan unit–tingkat. [Skema Prisma](../prisma/schema.prisma) · [Kontrak tingkat](API.md)

## Perubahan yang memerlukan kelulusan

- **Unit fizikal.** Tambah rekod ber-ID pelayan yang dimiliki oleh premis dalam draf, dengan label paparan dan kekangan label ternormal dalam skop premis. Kekalkan UUID semasa penamaan semula. Jangan terbitkan unit baharu daripada angka agregat lama.
- **Hubungan fizikal.** Tambah rekod pautan unik unit–tingkat. Sahkan kedua-dua rekod berada dalam draf/premis yang sama melalui kekangan DB. Kekangan komposit terhadap unit dan tingkat boleh menggunakan pasangan ID dan draf. Penghapusan tingkat atau unit berangkai perlu ditolak dengan 409 jika pautan masih aktif, melainkan perubahan pautan diluluskan dan disimpan dalam transaksi sama.
- **Keserasian.** Kekalkan laluan draf, respons tambahan `id` dan pemadanan label untuk klien lama. Sebelum melaksanakan penukaran angka agregat, paparkan status unit belum disahkan dan minta pemilik menyemak inventori. Ujian keserasian mesti meliputi draf lama tanpa rekod unit, konflik versi antara bahagian dan percubaan klien lama membuang tingkat yang dipaut.
- **Bukti sebelum migrasi.** Sediakan cadangan skema dan perubahan indeks/FK untuk semakan ICT. Uji migrasi tambahan pada salinan PostgreSQL sintetik, sahkan ID dan bilangan tingkat lama tidak berubah, sertakan pelan keserasian versi aplikasi, backup/restore dan rollback. Kelulusan diperlukan untuk menulis dan menguji migrasi serta untuk sebarang perubahan keizinan wakil atau skop bercaj.

## Pecahan PR selepas kelulusan

| PR cadangan | Prasyarat dan bukti |
| --- | --- |
| Unit dan pautan unit–tingkat | Kelulusan migrasi dan aturan identiti unit. API berversi, pengasingan pemilik/draf, label pendua, FK rentas draf dan penarikan tingkat yang masih dipaut diuji. Satu unit merentas dua tingkat kekal satu unit. |
| Dokumen berkuasa dan kuarantin (K03/K04/K07) | Polisi dokumen, akses dan penyimpanan disahkan. Pautan menggunakan ID unit/tingkat yang stabil, dan imbasan gagal tertutup diluluskan pada staging. |
| Akuan, serahan dan pembetulan (K05/K06) | Selepas unit dan dokumen tersedia. Snapshot, idempotensi, versi dan bukti akuan diuji tanpa membuka aliran rasmi lebih awal. |
| Semakan manusia dan rujukan (K08/K10), kemudian bil sandbox (K09) | Selepas serahan dan matriks kuasa disahkan. AI kekal sebagai bantuan; sandbox kewangan berasingan daripada transaksi sebenar. |

Kelulusan semasa untuk pembetulan tingkat dapat dilaksanakan dengan jadual sedia ada. Spesifikasi ini ialah cadangan untuk kelulusan migrasi berasingan.
