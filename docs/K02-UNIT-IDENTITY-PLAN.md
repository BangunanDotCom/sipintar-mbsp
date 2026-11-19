# Pelan identiti unit fizikal K02

Asas [Issue #18](https://github.com/BangunanDotCom/sipintar-mbsp/issues/18) menggunakan `PremiseFloor.id` sebagai UUID tingkat dan `ApplicationPremises.accommodationUnits` sebagai angka agregat. [Issue #20](https://github.com/BangunanDotCom/sipintar-mbsp/issues/20) meluluskan penambahan identiti unit fizikal, pautan unit–tingkat dan ujian migrasi pada PostgreSQL sintetik. [Skema Prisma](../prisma/schema.prisma) · [Kontrak tingkat](API.md)

## Keputusan reka bentuk dan sempadan kelulusan

- **Unit fizikal.** Tambah rekod ber-ID pelayan yang dimiliki oleh premis dalam draf, dengan label paparan dan kekangan label ternormal dalam skop premis. Kekalkan UUID semasa penamaan semula. Jangan terbitkan unit baharu daripada angka agregat lama.
- **Hubungan fizikal.** Tambah rekod pautan unik unit–tingkat. Sahkan kedua-dua rekod berada dalam draf/premis yang sama melalui kekangan DB. Kekangan komposit terhadap unit dan tingkat boleh menggunakan pasangan ID dan draf. Penghapusan tingkat atau unit berangkai perlu ditolak dengan 409 jika pautan masih aktif, melainkan perubahan pautan diluluskan dan disimpan dalam transaksi sama.
- **Keserasian.** Kekalkan laluan draf, respons tambahan `id` dan pemadanan label untuk klien lama. Sebelum melaksanakan penukaran angka agregat, paparkan status unit belum disahkan dan minta pemilik menyemak inventori. Ujian keserasian mesti meliputi draf lama tanpa rekod unit, konflik versi antara bahagian dan percubaan klien lama membuang tingkat yang dipaut.
- **Bukti sebelum migrasi.** Sediakan skema dan perubahan indeks/FK untuk semakan ICT. Uji migrasi tambahan pada salinan PostgreSQL sintetik, sahkan ID dan bilangan tingkat lama tidak berubah, sertakan pelan keserasian versi aplikasi, backup/restore dan rollback. Penggunaan pada persekitaran sebenar serta perubahan keizinan wakil atau skop bercaj memerlukan kelulusan berasingan.

## Pecahan PR selepas kelulusan

| PR cadangan | Prasyarat dan bukti |
| --- | --- |
| Unit dan pautan unit–tingkat | Kelulusan migrasi dan aturan identiti unit. API berversi, pengasingan pemilik/draf, label pendua, FK rentas draf dan penarikan tingkat yang masih dipaut diuji. Satu unit merentas dua tingkat kekal satu unit. |
| Dokumen berkuasa dan kuarantin (K03/K04/K07) | Polisi dokumen, akses dan penyimpanan disahkan. Pautan menggunakan ID unit/tingkat yang stabil, dan imbasan gagal tertutup diluluskan pada staging. |
| Akuan, serahan dan pembetulan (K05/K06) | Selepas unit dan dokumen tersedia. Snapshot, idempotensi, versi dan bukti akuan diuji tanpa membuka aliran rasmi lebih awal. |
| Semakan manusia dan rujukan (K08/K10), kemudian bil sandbox (K09) | Selepas serahan dan matriks kuasa disahkan. AI kekal sebagai bantuan; sandbox kewangan berasingan daripada transaksi sebenar. |

## Pelaksanaan K02 untuk Issue #20

Migrasi `202611190001_premise_unit_identity` menambah jadual unit dan pautan unit–tingkat, dua kekangan komposit pada jadual sedia ada, serta indeks pautan. Migrasi tidak menulis semula rekod lama. FK komposit memastikan unit dan tingkat berkongsi draf yang sama; model sedia ada membenarkan satu premis bagi setiap draf. Kata label ternormal diekalkan oleh API. Pengesahan hak guna dan pautan bukti dokumen kekal pada peringkat K03/K04.

Editor unit boleh dicapai daripada premis, tingkat dan semakan draf. API menggunakan versi draf yang dikongsi dengan bahagian lain, menyimpan audit tanpa label atau maklumat peribadi, dan membezakan angka agregat lama daripada inventori sebenar. [Kontrak API](API.md#identiti-unit-fizikal-k02)

### Pemulihan untuk semakan ICT

Migrasi menggunakan runner SQL berchecksum sedia ada. Uji pada PostgreSQL sintetik dengan backup sebelum migrasi, semakan nama pangkalan data dan peranan ujian, perbandingan rekod premis dan tingkat selepas migrasi, dan backup/restore selepas rekod unit dicipta. Rollback transaksi sebelum commit boleh menanggalkan perubahan DDL tanpa perubahan rekod asal. Selepas commit dan penggunaan, restore backup hanya pada sasaran terasing untuk mengesahkan pemulihan. Pemulihan backup lama akan mengecualikan unit yang dicipta selepas backup; simpan salinan data selepas migrasi dan dapatkan pelan rekonsiliasi ICT sebelum sebarang rollback sebenar. Versi aplikasi terdahulu tidak mengenali unit: kekangan DB masih melindungi pautan, tetapi versi lama boleh memulangkan ralat generik bagi penghapusan tingkat berangkai.
