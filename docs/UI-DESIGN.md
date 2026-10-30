# Naik taraf antaramuka STAYLink MBSP

Tarikh: 29 Oktober 2026. Branch: `staylink-mbsp-phase1`. Tiada deployment dilakukan.

## Arah visual yang dipersetujui

Papan identiti STAYLink pada awalnya menunjukkan logo bangunan/pautan biru-hijau. Pengguna kemudian membekalkan rujukan portal baharu dan mengarahkan **“gunakan ini”**: wordmark STAYLink MBSP perak/emas dengan simbol penginapan, panorama bandar waktu malam, panel kaca biru dan butang emas. Rujukan terkini ini menjadi arah pelaksanaan akhir. Biru gelap, biru elektrik, hijau dan cyan dikekalkan; emas digunakan sebagai aksen tindakan utama.

- Header menggunakan **fail asal logo rasmi MBSP yang dimuat naik pengguna**, di sebelah nama **Majlis Bandaraya Seberang Perai**. Tiada jata dijana atau direka semula.
- Nama penuh **Smart Temporary Accommodation Link** dan tagline **Digital Services, Practical Solutions.** dikekalkan sebagai teks sebenar yang boleh dibaca.
- Hero sinematik menggunakan aset panorama setempat, lapisan gelap bagi kebolehbacaan, garis sambungan SVG dan panel kaca. Elemen digital ialah visual konsep, bukan metrik pemantauan sebenar.
- Enam perkhidmatan mengekalkan laluan asal. Modul belum tersedia terus menyatakan Fasa seterusnya.
- Borang, dashboard, pilihan peranan dan semua endpoint sedia ada dikekalkan. Tiada perubahan schema, proses, nombor rujukan, permission atau MFA.
- Tema berasingan dalam `apps/web/src/premium.css` menggunakan tokens asal bersama aksen baharu. Font Montserrat dibekalkan secara tempatan melalui `@fontsource/montserrat` (SIL Open Font License); tiada panggilan Google Fonts runtime.
- Animasi CSS perlahan, focus states dan `prefers-reduced-motion` disokong. Aset disimpan secara tempatan tanpa hotlink.

## Asal dan status aset

| Fail | Asal / penggunaan |
|---|---|
| `apps/web/public/assets/brand/staylink-primary.png` | Olahan/ekstrak generatif daripada logo dalam rujukan portal terkini pengguna; simbol rumah/katil, STAY perak, Link emas, MBSP perak. Bukan ikon Lucide generik. |
| `apps/web/public/assets/logo mbsp-png.png` | Fail asal PNG RGBA 2572 × 2540 yang dimuat naik pengguna dalam commit `0ca1f44`. Digunakan terus melalui `/assets/logo%20mbsp-png.png`, tanpa suntingan, pemotongan, penjanaan semula atau perubahan ketelusan. |
| `apps/web/public/assets/city/staylink-waterfront.png` | Olahan generatif panorama daripada rujukan portal pengguna. **Visual konsep**, bukan foto dokumentari atau pengesahan rupa sebenar Menara Bandaraya MBSP. Keterangan alt dan kredit visual menyatakan status konsep. |

Nama terkini Bandaraya disemak terhadap [portal Sistem Perolehan Bersepadu MBSP](https://ep.mbsp.gov.my/) dan [rekod logo semasa yang merujuk MBSP](https://commons.wikimedia.org/wiki/File:Seberang_Perai_City_Council_(MBSP_-_Majlis_Bandaraya_Seberang_Perai)_Logo.png). Fail induk jata rasmi boleh dipasang melalui `mbspLogo` dalam `apps/web/src/brand.ts` apabila dibekalkan; jangan menjana, menjejak semula atau menyunting sendiri jata rasmi.

Foto sebenar Menara Bandaraya telah dikenal pasti pada [Wikimedia Commons — MBSP Bandar Perda](https://commons.wikimedia.org/wiki/File:MBSP_Bandar_Perda_(221003)_(cropped).jpg), oleh *angys*, lesen CC BY-SA 4.0. Muat turun dari Wikimedia dan domain aset rasmi MBSP disekat polisi rangkaian sesi ini. Foto tersebut **tidak digunakan** dan tidak didakwa tersedia. Pengguna kemudian memilih rujukan panorama konsep di atas. Keperluan foto dokumentari/asset master rasmi kekal untuk semakan ICT jika diperlukan sebelum produksi.

## Semakan

Screenshot penuh yang dikemas kini berada dalam `docs/screenshots/staylink-desktop.png` dan `docs/screenshots/staylink-mobile.png`. Pemeriksaan frontend/API, lint, typecheck, Vitest dan Playwright dijalankan selepas perubahan; keputusan akhir diringkaskan dalam `docs/verification.json`.

## Animasi dan pemuktamadan

Animasi jata 32 saat dan lapisan cahaya sedia ada digunakan untuk aset rasmi yang kini telah dipasang. Logo rasmi asal kini tersedia; animasi sedia ada diaktifkan semula dengan sokongan reduced motion. `prefers-reduced-motion: reduce` mematikan semua animasi portal. Animasi panel digital menggunakan opacity; animasi cahaya latar menggunakan transform/opacity untuk mengurangkan kerja paint.

Reka bentuk emas dengan simbol penginapan/bumbung, panorama malam dan konsep biru gelap/emas telah diluluskan. Kedua-dua fail logo STAYLink dan panorama dikekalkan byte-for-byte; tiada pertukaran kepada versi biru-hijau atau reka semula halaman utama.

- Menu telefon mempunyai status buka/tutup, Escape untuk menutup dan pemulangan fokus kepada butang menu.
- Penanda Utama hanya aktif pada halaman utama.
- Permohonan Baharu → `/daftar`: pendaftaran akaun berfungsi, dengan makluman jelas bahawa penghantaran permohonan belum tersedia.
- Semak Status → `/status`: maklumat pembangunan, tanpa semakan status palsu.
- Log Masuk Pegawai → `/log-masuk`: aliran login dan MFA sedia ada.
- Semakan manual Chromium meliputi 320, 360, 390, 600, 601, 768, 820, 1024, 1280, 1440 dan 1920 piksel: tiada overflow mendatar, menu muat, semua imej dimuatkan, tiada ralat JavaScript dan semua animasi dimatikan dalam reduced motion.
- Lint, typecheck, 42 ujian unit/API, build dan 4 aliran Playwright lulus selepas pemuktamadan. Aliran pelayar turut menyemak tiga butang utama dan kawalan menu papan kekunci.

## Pemasangan fail rasmi pengguna

Fail logo asal dikekalkan byte-for-byte dengan SHA-256 `29d1cee0f4fab1a36f26c742dc7486eec1498527ca8439d6c768c627237d016d`. Fail yang diterima oleh pelayar mempunyai checksum sama. Header menggunakan `object-fit: contain`, tanpa latar putih atau bingkai tambahan; alpha asal dikekalkan. Paparan disemak pada 320, 390, 600, 601, 768, 1024 dan 1440 piksel. Logo emas STAYLink serta panorama tidak berubah. Lint, typecheck, 42 ujian unit/API, build dan 4 aliran pelayar lulus. Screenshot desktop/telefon dikemas kini.

## Sambungan draf Fasa 2B.1

Destinasi Permohonan Baharu kini `/permohonan/baharu` dengan semakan sesi/login-return. Daftar Sekarang kekal `/daftar`. Layout, teks, warna, logo rasmi asal, logo emas STAYLink, panorama dan animasi halaman utama tidak diubah. Screenshot utama desktop/telefon diuji semula dan byte-identik dengan fail diluluskan. CSS ruang draf baharu diskop dalam `application-draft.css`, dengan radio kapasiti, maklumat profil, catatan, simpan/resume dan status penghantaran belum tersedia. [Screenshot ruang draf](PHASE2B1.md).

## Ruang premis Fasa 2B.2

Halaman utama, logo asal, latar, warna dan animasi tidak diubah. Borang premis menggunakan komponen kad/form korporat, susun atur dua kolum desktop dan satu kolum telefon. CSS baharu diskop pada ruang premis; Leaflet/CSS peta dimuatkan apabila diperlukan. Pin berwarna biru/emas adalah penanda lokasi, bukan logo rasmi baharu. Screenshot memaparkan keadaan rangkaian sebenar (peta asas OSM disekat, grid/amaran kelihatan). Lihat PHASE2B2.md.

## Status/fallback peta

Pembetulan peta hanya menyentuh komponen sumber peta/status/retry di Maklumat Premis. Identiti/homepage tidak diubah. Snapshot baharu menggunakan keadaan rangkaian sebenar; provider terkawal dalam ujian tidak dianggap visual portal sebenar. [Screenshot dan batas pengesahan Chrome](MAP-FIX.md).
