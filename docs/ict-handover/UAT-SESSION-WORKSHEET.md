# Borang kerja UAT pegawai — STAYLink MBSP (templat kosong)

**Jangan isi keputusan PASS sebelum ujian oleh pegawai sebenar.** Templat ini disediakan sebelum hos JTIK diluluskan.

| Metadata sesi | Catatan |
| --- | --- |
| ID sesi / tarikh dan masa MYT | |
| Hos dan URL dalaman (selepas JTIK) | |
| Commit SHA / URL GitHub Actions | |
| Versi polisi dan cap jari | |
| ID DB latihan (tanpa kelayakan) | |
| Fasilitator / pemerhati / penguji | |
| OS, pelayar, peranti dan rangkaian | |
| Rekod kelulusan JTIK untuk hos latihan | |

## Ujian akses awal
- [ ] URL HTTPS hanya boleh diakses peserta yang dibenarkan melalui rangkaian dalaman/VPN
- [ ] Health API berjaya; tiada ralat pelayar/console yang menghalang
- [ ] Pengaktifan akaun `@example.test` melalui Mailpit tanpa relay keluar
- [ ] MFA PIC/PPSK/pentadbir, Secure/HttpOnly/SameSite cookies dan tamat sesi
- [ ] Pemohon tidak boleh mencapai fungsi pegawai; PIC SPU tidak boleh membaca kes SPT
- [ ] Pembayaran dan nombor rasmi tidak diaktifkan; storan binari pada hos demo ditutup
- [ ] Peta atau fallback koordinat boleh digunakan; rekod sekatan rangkaian
- [ ] Papan kekunci, paparan 320/390px dan telefon sebenar diuji
- [ ] Sandaran dan pemulihan DB latihan telah dibuktikan pada hos pilihan

## Peranan dan alias

| Alias kit | Peranan sesi | Semakan awal |
| --- | --- | --- |
| `pemohon` | Pemohon individu | Buka draf individu. |
| `wakil` | Wakil syarikat | Semak draf kuasa aktif dan kuasa luput. |
| `pic-spu` | PIC SPU | Lengkapkan semakan MFA dan uji penolakan kes SPT. |
| `pic-spt` | PIC SPT | Lengkapkan MFA dan pastikan tugasan demo SPU tidak dipaparkan. |
| `ppsk` | PPSK SPU | Lengkapkan MFA dan daftar kes latihan selepas PIC. |
| `pentadbir` | Pentadbir ICT | Lengkapkan MFA dan semak pengurusan akaun latihan. |

Pengendali sahaja mengurus fail kit privat. Borang ini merekod alias dan rujukan bukti.

## Matriks senario pengujian

| ID | Pelaku / tindakan utama | Keputusan dijangka | PASS/FAIL/BLOCKED | Bukti EV-* / isu | Ujian semula |
| --- | --- | --- | --- | --- | --- |
| UAT-01 `single-unit` | Pemohon → PIC SPU → PPSK, bukti CLEAN, pembetulan dan pendaftaran | Satu UUID merentasi tingkat = RM50; status dan notifikasi betul | | | |
| UAT-02 `multiple-units` | Dua UUID fizikal unik, satu unit pada beberapa tingkat | RM100, tiada kiraan berganda | | | |
| UAT-03 `failed-evidence` | Pemohon cuba hantar bukti FAILED | Serahan ditolak dengan sebab jelas | | | |
| UAT-04 `company-active` | Wakil syarikat dengan kuasa sah | Akses draf dan tindakan yang dibenarkan | | | |
| UAT-05 `company-expired` | Wakil syarikat dengan kuasa tamat | Akses bacaan dan tindakan ditolak | | | |
| UAT-06 `district-spt` | PIC SPU cuba membaca tugasan SPT | Akses silang daerah ditolak | | | |
| UAT-07 tambahan | Pentadbir: MFA, pengurusan pengguna latihan dan had peranan | Hanya tindakan yang diberi kuasa | | | |
| UAT-08 tambahan | Navigasi papan kekunci, 320/390px, peranti sebenar, peta | Tiada halangan kritikal; catat pemerhatian | | | |

## Log isu / pembetulan

| ID isu | Senario | Keutamaan BLOCKER/HIGH/MEDIUM/LOW | Langkah ulang dan jangkaan | Hasil sebenar | Pemilik | SHA pembetulan | Retest dan penyemak |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | |

**Peraturan keputusan:** BLOCKER/HIGH belum disahkan menahan penerimaan sehingga dibetulkan dan diuji semula secara bebas, atau keputusan eskalasi rasmi direkodkan. Rekod `BLOCKED` bukan `PASS`. Laporan automatik bukan pengganti tandatangan penerimaan.

## Pengesahan selepas sesi sebenar

**Rumusan hasil / pengecualian:** ____________________

**Fasilitator Jabatan Bangunan / tarikh:** ____________________

**Penyemak bebas / tarikh:** ____________________

**Pegawai diberi kuasa menerima UAT / tarikh dan keputusan:** ____________________

**Rujukan minit / kelulusan:** ____________________

*Ruang tandatangan kekal kosong sehingga sesi sebenar dilaksanakan.*
