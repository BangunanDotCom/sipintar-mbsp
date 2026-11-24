# Pakej hos Linux Personal Demo STAYLink MBSP

Pakej ini menggunakan Demo Release 1.0 dan sempadan Access/Tunnel dalam [Draft PR #65](https://github.com/BangunanDotCom/sipintar-mbsp/pull/65). Gunakan hos Linux latihan terasing yang diluluskan JTIK, berasingan daripada deployment demo lain kerana servis menggunakan port loopback yang sama. Nama cadangan Access App, tunnel, dan awalan hostname ialah `staylink-mbsp-personal`. PostgreSQL latihan ialah `staylink_issue62_personal_<sesi>_test` dengan `<sesi>` 1–24 huruf kecil atau digit.

## Sediakan kit pada hos yang diluluskan

1. Guna direktori release pada SHA yang disemak. Jalankan `npm ci`, `npm run db:generate` dan `npm run build` melalui akaun pemasangan. Akaun aplikasi hanya memerlukan akses baca kepada binaan dan rahsia aplikasi.
2. DBA menyediakan DB PostgreSQL kosong dan akaun DB khusus dengan hak minimum bagi pangkalan data latihan tersebut. PostgreSQL 16 pada 127.0.0.1:5432 dan Mailpit 1025/8025 kekal terikat pada loopback. Tiada relay SMTP. Semak [pakej hos Demo Release 1.0](../demo/README.md).
3. Guna [templat hos](../demo/demo.env.example) untuk `demo.env`. Tetapkan URL DB latihan yang sama bagi kedua-dua pemboleh ubah, APP_ORIGIN HTTPS tepat dan kunci latihan rawak yang berasingan. Simpan `demo.env` di luar checkout, pemilik akaun yang menjalankan penyediaan dan mod 0600. Tetapkan `TMPDIR` kepada lokasi privat yang dikawal jika kit perlu disimpan melebihi hayat direktori sementara biasa.
4. Jalankan penyediaan dengan akaun terhad. Skrip mengesahkan nama DB, Mailpit, migrasi, tujuh akaun dan tujuh draf sebelum membuat tiga serahan daerah dan satu contoh pembetulan melalui API aplikasi. Ia hanya mencetak laluan kit.

```bash
bash deploy/personal-demo/prepare.sh prepare "$DEMO_ENV"
```

5. Simpan `accounts.json`, `portal.env` dan `preflight.json` dalam direktori privat 0700 dengan fail 0600. Salin **hanya** `portal.env` ke `/etc/staylink-mbsp-personal/private/portal.env` dengan pemilik akaun aplikasi dan mod 0600. Storan aplikasi yang dapat dicapai Nginx hanyalah binaan `apps/web/dist`. `portal.env` mengandungi kunci callback dan disimpan untuk pengendali. `accounts.json` ialah kit penguji dan mengandungi kedua-dua faktor latihan bagi akaun pegawai. Simpan dalam peti simpanan yang membenarkan akses akaun organisasi tunggal, serahkan hanya selepas gerbang lulus, dan tamatkan akses pada akhir sesi. [Panduan penguji](../../docs/ict-handover/PERSONAL-DEMO-GUIDE.md)

## Sempadan Access dan pengesahan selepas kelulusan

1. JTIK mengesahkan VM, zon/DNS miliknya, pelan dan kapasiti Zero Trust sedia ada, penerima yang diluluskan, TLS, aturan sandaran serta tetingkap perubahan. Sediakan satu aplikasi Access jenis self-hosted untuk **seluruh hostname**. Polisi Allow menyenaraikan **satu identiti pegawai bernama** melalui IdP ber-MFA. Semua identiti lain tertolak secara lalai. Elakkan Everyone, Bypass dan token servis untuk laluan portal.
2. Lengkapkan [templat Cloudflare](cloudflare.env.example) di luar Git. Nilai UUID tunnel dan AUD terikat pada app khusus itu. CA origin mengesahkan SAN `localhost`. Jana konfigurasi secara setempat dan semak sebelum memasang.

```bash
generated="$(node --env-file="$DEMO_ENV" --env-file="$CF_PERSONAL_ENV" deploy/cloudflare/render.mjs)"
cloudflared tunnel --config "$generated/cloudflared.yaml" ingress validate
```

3. Uji `nginx -t` dengan include yang dijana. Pasang unit [Fastify](staylink-mbsp-personal-origin.service) dan [connector](staylink-mbsp-personal-cloudflared.service) selepas kelulusan. Akaun Unix, laluan sijil serta pemilikan fail mesti sepadan dengan templat. Sebelum menghidupkan ingress, sahkan hostname tunggal, audience tepat, TLS diverifikasi, catch-all 404, asal hanya loopback dan Cache Bypass untuk seluruh hostname. Tiada laluan ke Mailpit, PostgreSQL atau kit. [Sempadan dan gerbang PR #65](../cloudflare/README.md)
4. Selepas diluluskan dan disediakan, uji melalui browser dengan satu identiti Access yang dinamakan dan satu identiti negatif yang dibenarkan untuk menguji penolakan. Uji HTML, aset, API, token tiada/luput/audience salah dan akses origin terus dari rangkaian peserta. Semak `Cache-Control: private, no-store` dan bahawa kuki aplikasi mengekalkan Secure, HttpOnly dan SameSite. Uji tujuh peranan mengikut panduan. Hanya selepas ujian sasaran itu lulus, sampaikan URL HTTPS sebenar dan grant peti simpanan privat kepada satu identiti tersebut.
5. Had kesan akses gagal meliputi sesi pendek IdP, MFA aplikasi, peranan dan tugasan daerah aktif, CSRF, tiada cache dan DB latihan terasing. Log edge dan aplikasi tidak sepatutnya mengandungi kata laluan, token, OTP atau isi dokumen. Jika kawalan gagal, tutup akses/connector khusus dan maklumkan JTIK.

## Reset terkawal dan undur

- Tutup akses penguji untuk tetingkap reset. Simpan sandaran DB latihan lama dengan SHA/checksum, konfigurasi polisi dan rujukan rahsia melalui kawalan JTIK. Sediakan **DB kosong baharu** dan konfigurasi privat baharu. Guna fail konfigurasi untuk sasaran baharu serta nama DB lama yang sebenar.

```bash
bash deploy/personal-demo/prepare.sh reset "$NEW_DEMO_ENV" "$PREVIOUS_TRAINING_DB"
```

- Arahan reset menolak nama sama, sasaran bukan Personal Demo dan DB yang sudah ada objek. Ia menyediakan kit baharu dalam DB baharu. Hentikan servis aplikasi semasa pertukaran dan gantikan konfigurasi DB serta `portal.env` bersama-sama. Selepas servis pulih, sahkan hostname, sesi lama telah tamat, kuasa peranan dan contoh baharu. Serahkan kit baharu melalui peti simpanan dan tamatkan akses kit lama.
- Untuk undur, tutup Access sementara dan pulihkan set konfigurasi lama yang serasi bersama versi aplikasi serta DB lama yang dikekalkan. Gunakan proses [latihan sandaran dan pemulihan](../cloudflare/README.md#sandaran-pemulihan-dan-undur) atas DB terasing. Pembersihan tertakluk kepada retensi dan kelulusan JTIK.
