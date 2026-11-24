# Panduan Personal Demo STAYLink MBSP

**Untuk seorang pegawai Jabatan Bangunan.** Semua orang, premis, dokumen, keputusan semakan dan bayaran dalam sesi ini ialah data latihan. Gunakan alamat e-mel yang berakhir dengan `@example.test` bagi latihan aplikasi. Masukkan identiti organisasi hanya pada skrin Cloudflare Access yang diluluskan.

## Log masuk

1. Buka URL HTTPS dalam kit privat. Sahkan hostname yang dibekalkan oleh JTIK, kemudian log masuk di Cloudflare Access dengan akaun organisasi anda.
2. Di halaman **Log masuk** STAYLink, gunakan e-mel dan kata laluan bagi peranan yang hendak diuji. `accounts.json` mengandungi `loginUrl`, label, UUID akaun (`id`), e-mel, kata laluan dan rahsia MFA latihan. E-mel digunakan sebagai ID log masuk.
3. Untuk lima akaun pegawai, tambah rahsia Base32 bagi akaun itu ke aplikasi pengesah sebagai TOTP 6 digit, tempoh 30 saat. Masukkan kod semasa. Jika kod sudah digunakan, tunggu kod baharu. Simpan entri berlabel mengikut peranan. Rahsia MFA dan kata laluan hendaklah dihantar melalui akses individu dalam peti simpanan yang diluluskan.
4. Gunakan satu profil pelayar bagi setiap peranan. Tingkap biasa dan inkognito boleh digunakan untuk dua sesi. Beberapa tab dalam profil yang sama berkongsi kuki. Log keluar apabila selesai.

| Akaun kit | Tindakan yang dijangka tersedia |
| --- | --- |
| `pemohon` | Mulakan draf individu dari kosong, lengkapkan dua tingkat dan unit, terima pembetulan, hantar semula dan semak bil tiruan. |
| `wakil` | Pilih syarikat latihan dengan kuasa aktif. Akses draf syarikat berkuasa luput dan draf peribadi akaun lain ditolak. |
| `pic-spu` | Semak barisan SPU, nasihat AI tiruan dan metadata bukti. Minta pembetulan atau sahkan lengkap. |
| `pic-spt` | Semak kes SPT. Kes SPU dan SPS tersembunyi serta ditolak pada pautan terus. |
| `pic-sps` | Semak kes SPS. Kes SPU dan SPT tersembunyi serta ditolak pada pautan terus. |
| `ppsk` | Semak kes SPU, daftar serahan yang PIC telah lengkapkan, terbit invois dan rekonsiliasi tiruan. |
| `pentadbir` | Semak pengurusan pengguna dan konfigurasi sedia ada. Kelulusan bagi pihak PIC/PPSK tidak tersedia. |

## Perjalanan lengkap SPU

1. **Pemohon** membuka `/permohonan/baharu` daripada portal. Pilih individu dan simpan. Sebagai contoh, masukkan alamat rekaan “Premis Latihan Maya”, tandakan daerah SPU, isi butiran premis dan dua tingkat, kemudian pautkan **satu** unit fizikal kepada kedua-dua tingkat. Semak bahawa jumlah kekal satu unit. Draf kosong dan contoh sedia ada boleh digunakan dalam sesi yang sama.
2. Buka semakan. Cuba verdict **FAILED** dalam panel bukti latihan. Serahan perlu disekat. Pilih **CLEAN** untuk menjana metadata bukti contoh. Semak akuan digital dan hantar. Catat rujukan serahan tanpa menyalin sebarang token. [Contoh bahan dokumen latihan](../../deploy/personal-demo/DOKUMEN-SINTETIK.md)
3. **PIC SPU** membuka dashboard. Cari serahan, semak nasihat AI tiruan dan minta pembetulan dengan alasan. **Pemohon** membaca alasan, simpan perubahan dan hantar semula selepas menerima akuan. **PIC SPU** bandingkan versi dan sahkan lengkap. Semakan manusia tetap wajib.
4. **PPSK** membuka barisan SPU dan daftar serahan lengkap. Rujukan bermula dengan `SYNTHETIC-`. Terbitkan invois latihan dan gunakan kawalan simulasi pada panel bil untuk merekod serta merekonsiliasi bayaran. Satu unit merentasi dua tingkat menghasilkan **RM50** dan dua unit unik menghasilkan **RM100**. Semak status dari profil pemohon. Tiada pembayaran sebenar dibuat.
5. **PIC SPT** dan **PIC SPS** membuka barisan masing-masing dan menyemak contoh di daerah sendiri. Akaun PPSK latihan diperuntukkan dalam SPU. Perjalanan penuh sehingga invois disediakan untuk SPU.

## Contoh yang disediakan

Gunakan `draftPath` dari kit dalam profil yang betul. Arahan penyediaan contoh menggunakan laluan aplikasi biasa untuk mewujudkan jejak audit.

| Contoh | Keadaan awal selepas penyediaan penuh |
| --- | --- |
| `single-unit` | Serahan SPU sedia disemak. Satu unit fizikal merentasi dua tingkat. |
| `multiple-units` | PIC SPU sudah meminta pembetulan. Baiki dan hantar semula untuk menguji dua unit fizikal. |
| `failed-evidence` | Draf belum dihantar dengan bukti gagal. |
| `company-active` | Draf syarikat berkuasa sah. |
| `company-expired` | Draf syarikat berkuasa luput. Akses hendaklah ditolak. |
| `district-spt` | Serahan SPT untuk PIC SPT dan ujian pengasingan daerah. |
| `district-sps` | Serahan SPS untuk PIC SPS dan ujian pengasingan daerah. |

## Senarai semak dan laporan

- [ ] Kesemua tujuh akaun log masuk. Lima akaun pegawai memerlukan MFA sebelum akses fungsi dilindungi.
- [ ] Pemohon boleh bermula dari kosong dan menguji aliran hingga status invois tiruan.
- [ ] Sahkan kiraan RM50/RM100, snapshot selepas pembetulan, penolakan bukti gagal, kuasa luput dan akses rentas daerah.
- [ ] Cuba profil mudah alih, papan kekunci, mesej ralat dan peralihan antara peranan.
- [ ] Rekod setiap item sebagai **Lulus**, **Gagal** atau **Tersekat**, dengan tarikh MYT dan SHA yang dipaparkan oleh pengendali.

Untuk setiap isu, rekod ID senario, peranan, pelayar/peranti, masa MYT, langkah, jangkaan, hasil dan rujukan tangkapan skrin yang telah disunting. Buang e-mel, kata laluan, QR/MFA, token dan butiran privat daripada bukti. Gunakan saluran laporan dalaman yang diluluskan. [Borang sesi UAT](UAT-SESSION-WORKSHEET.md) · [Kaedah triage dan ujian semula](UAT-FEEDBACK-TRIAGE.md)

Ujian semula menggunakan SHA pembetulan dan akaun/draf yang jelas. Jika keadaan asal diperlukan, minta pengendali membuat reset ke DB latihan baharu mengikut pakej operasi. Simpan bukti awal, jalankan langkah yang sama, semak fungsi berkaitan dan rekod keputusan secara berasingan.

## Batasan penerimaan

Keputusan **SK, SKB, Tangguh dan Tolak**, aliran rujukan jabatan teknikal, surat keputusan rasmi dan penutupan/arkib kes belum tersedia sebagai aliran portal. Status lengkap/daftar dan invoice mock membuktikan perjalanan semakan latihan. Penyelesaian bayaran tidak menutup kes. Dashboard mempunyai barisan dan ringkasan dalam skop peranan. Pemantauan pengurusan merentas daerah, SLA dan laporan agregat fasa penuh masih terbuka. [Matriks kelengkapan dan keputusan](PERSONAL-DEMO-COMPLETENESS.md)
