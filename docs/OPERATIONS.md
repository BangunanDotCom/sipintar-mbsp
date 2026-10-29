# Panduan operasi Fasa 1

## Pendaftaran individu dan syarikat

1. Daftar individu menggunakan nama, nombor pengenalan unik (MyKad/pasport), telefon, satu e-mel unik dan kata laluan. Semak peti masuk dan sahkan e-mel.
2. Log masuk, pilih peranan Pemohon dan buka **Syarikat & wakil**.
3. Masukkan nama, SSM, alamat, e-mel, telefon dan jenis kuasa. Tarikh tamat pilihan mesti pada masa hadapan.
4. Status akaun syarikat **ACTIVE** tidak sama dengan maklumat atau perwakilan disahkan.
5. Muat naik surat kuasa PDF maksimum 2 MiB. Backend memeriksa nama, saiz dan tandatangan PDF. Akses muat turun memerlukan hubungan perwakilan sah.
6. Jika SSM sudah wujud, hentikan pendaftaran pendua. Hubungi bantuan melalui saluran rasmi MBSP untuk semakan pemilikan/perwakilan. Tiada aliran tuntutan SSM kendiri dalam versi ini.
7. Pengurus profil (pencipta profil baharu) atau wakil VERIFIED boleh menjemput pemegang akaun pemohon lain yang e-melnya sudah disahkan. Penerima membuka pautan e-mel, login sebagai diri sendiri, menyemak nama/SSM dan menerima dalam 24 jam. Hubungan hanya wujud selepas penerimaan dan bermula **UNVERIFIED** tanpa kuasa mengurus jemputan.

Tarikh sah dokumen disokong API; borang muat naik asas belum menyediakan medan tarikh sah. Paparan status perwakilan membezakan `UNVERIFIED`, `VERIFIED`, `DOCUMENT_UPDATE_REQUIRED`. Pengesahan e-mel bukan pengesahan dokumen rasmi.

## Jemput dan urus pegawai

Pentadbir ICT: **Pengguna & pelantikan → Jemput pegawai baharu**. Pilih jabatan, peranan, skop daerah, rujukan dan tarikh pelantikan. Gunakan e-mel rasmi yang disahkan pengendali; sistem tidak mengandaikan senarai domain rasmi MBSP.

Jemputan luput satu jam. Pegawai menetapkan kata laluan dan mendaftar TOTP. Jika jemputan luput, akaun yang belum mengaktifkan kata laluan boleh menggunakan pemulihan kata laluan ke e-mel jemputan yang sama. Tiada kata laluan plaintext dihantar.

Tambah pelantikan kepada pegawai melalui **Lantik peranan**. Tamatkan pelantikan melalui butiran pelantikan. Backend menyemak masa pelantikan pada setiap permintaan; sesi dibatalkan apabila pelantikan ditamatkan melalui UI.

Status digantung membatalkan sesi. Reset MFA memerlukan pentadbir lain serta sebab sekurang-kurangnya 10 aksara. Pengesahan identiti manusia perlu dibuat mengikut SOP ICT sebelum reset; sistem tidak membuktikan identiti manusia secara automatik.

## Konfigurasi kawasan dan PIC

1. Pentadbir Operasi mencipta kawasan bagi SPU, SPT atau SPS mengikut skop.
2. Pastikan pegawai PIC mempunyai pelantikan aktif bagi daerah yang berkenaan.
3. PPSK atau Operasi memilih kawasan dan PIC, kemudian memasukkan sebab sekurang-kurangnya 10 aksara.
4. Penugasan terdahulu ditamatkan; sejarah, audit dan notifikasi disimpan.
5. Tiada agihan kes sebenar kerana modul permohonan belum tersedia. Resolver kawasan boleh diperiksa melalui API.

Mengubah nama/sempadan kawasan sedia ada dan sempadan geografi belum disediakan; penambahan kawasan dan penugasan semula tersedia.

## Templat dan konfigurasi

Pentadbir Templat sahaja boleh mencipta draf, menambah versi dan mengaktifkan format induk. Pengaktifan versi baharu mengarkibkan versi aktif terdahulu. Kandungan dipaparkan sebagai teks, bukan HTML boleh laksana. Daftar kategori asas diseed tanpa dokumen rasmi rekaan.

Konfigurasi berasingan `technical.*` dan `operations.*` mempunyai sejarah versi dan sebab perubahan. Daftar ini menyimpan nilai rujukan; ia tidak mengubah kod polisi keselamatan atau SLA secara automatik.

## Notifikasi dan e-mel

Portal menunjukkan notifikasi pemilik sahaja dan menyediakan tanda dibaca. Penghantaran e-mel menggunakan outbox disulitkan dan log status. `npm run mail:retry` memproses PENDING/FAILED, maksimum lima percubaan. Jalankan melalui scheduler OS yang diluluskan jika perlu; tiada scheduler produksi dicipta.

Satu worker menuntut rekod secara atomik sebelum menghantar. Jika proses mati semasa `SENDING`, pengendali perlu menyiasat dan memulihkan status secara terkawal; janji penghantaran exactly-once tidak dibuat. Payload e-mel dipadamkan selepas berjaya (diganti objek kosong disulitkan), tetapi SMTP/mailbox penerima masih menyimpan pautan. Lindungi Mailpit dan jangan dedahkan portnya kepada Internet.

## Backup dan masa

Backup PostgreSQL merangkumi metadata dan PDF. Simpan kunci AES berasingan melalui secret manager yang diluluskan serta prosedur backup terhad. Uji restore sebelum produksi. Paparan UI menggunakan waktu Malaysia; database dan audit disimpan UTC. Kunci AES yang hilang menyebabkan faktor MFA dan outbox tertangguh tidak dapat dinyahsulitkan.

## Akaun lama dan pengenalan

Akaun pemohon lama tanpa nombor pengenalan boleh login seperti biasa. Lengkapkan nombor itu sekali di **Profil saya** menggunakan pengesahan kata laluan semasa sebelum mencipta syarikat baharu/menerima jemputan. Profil memaparkan empat aksara akhir sahaja. Pembetulan nombor yang telah direkodkan memerlukan SOP bantuan manusia; tiada fungsi tukar kendiri atau dakwaan pengesahan JPN.

Profil syarikat lama yang tiada pengurus dan belum disahkan memerlukan semakan pegawai berkuasa mengikut SOP. Jangan beri hak pengurus secara pukal. Pendua SSM tidak boleh digunakan untuk mengambil alih profil syarikat orang lain. UI tamat/revokasi wakil dan workflow tuntutan SSM belum tersedia.

Simpan `IDENTITY_DATA_KEY` bersama prosedur backup berasingan yang terhad. Kehilangan/penukaran kunci merosakkan kebolehan menyahsulit dan mengesan pendua; putaran memerlukan migrasi re-encryption dan pengiraan semula indeks terkawal. Jangan sekadar jana semula kunci pada setiap restart.

## Menyediakan draf PPTT

1. Klik Permohonan Baharu. Login jika diminta; portal kembali ke halaman draf. Sahkan e-mel/lengkapkan pengenalan dalam Profil saya jika belum lengkap.
2. Pilih individu atau wakil syarikat. Senarai syarikat hanya memaparkan profil ACTIVE dengan hubungan perwakilan semasa. Maklumat diisi daripada profil; betulkan profil melalui dashboard jika perlu.
3. Isi catatan pilihan dan tekan Simpan Draf. Draf tidak dihantar kepada MBSP dan tidak mendapat nombor rujukan rasmi.
4. Sambung melalui senarai draf pada dashboard/halaman permohonan. Hanya akaun asal boleh membuka/mengubahnya. Senarai menunjukkan 50 draf terkini. Versi lapuk memerlukan muat semula sebelum menyimpan; jangan anggap perubahan tab lama telah disimpan jika menerima ralat.
5. Jika kuasa syarikat tamat/dibatalkan atau profil syarikat tidak aktif, draf disembunyikan dan buka/simpan ditolak. Rekod kekal; pemulihan kuasa memerlukan proses sah. Wakil lain tidak mendapat draf pemilik secara automatik.

Kemas kini ini memerlukan codegen dan migrasi `202610290003_application_drafts` pada setiap persekitaran. Kunci identiti/MFA dan konfigurasi SMTP Fasa 2A dikekalkan. Butiran premis dan penghantaran rasmi menunggu fasa seterusnya.
