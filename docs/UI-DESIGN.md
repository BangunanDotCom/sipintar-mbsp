# Naik taraf antaramuka STAYLink MBSP

Tarikh: 29 Oktober 2026. Branch: `staylink-mbsp-phase1`. Tiada deployment dilakukan.

## Arah visual yang dipersetujui

Papan identiti STAYLink pada awalnya menunjukkan logo bangunan/pautan biru-hijau. Pengguna kemudian membekalkan rujukan portal baharu dan mengarahkan **“gunakan ini”**: wordmark STAYLink MBSP perak/emas dengan simbol penginapan, panorama bandar waktu malam, panel kaca biru dan butang emas. Rujukan terkini ini menjadi arah pelaksanaan akhir. Biru gelap, biru elektrik, hijau dan cyan dikekalkan; emas digunakan sebagai aksen tindakan utama.

- Header mempunyai jata MBSP dan nama **Majlis Bandaraya Seberang Perai**.
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
| `apps/web/public/assets/brand/mbsp-bandaraya.png` | Olahan aset jata yang dibekalkan pengguna. Atas arahan pengguna, teks jalur ditukar daripada “MAJLIS PERBANDARAN SEBERANG PERAI” kepada “MAJLIS BANDARAYA SEBERANG PERAI”. Ini aset review berasaskan rujukan, bukan dakwaan fail induk vektor rasmi daripada MBSP. |
| `apps/web/public/assets/city/staylink-waterfront.png` | Olahan generatif panorama daripada rujukan portal pengguna. **Visual konsep**, bukan foto dokumentari atau pengesahan rupa sebenar Menara Bandaraya MBSP. Keterangan alt dan kredit visual menyatakan status konsep. |

Nama terkini Bandaraya disemak terhadap [portal Sistem Perolehan Bersepadu MBSP](https://ep.mbsp.gov.my/) dan [rekod logo semasa yang merujuk MBSP](https://commons.wikimedia.org/wiki/File:Seberang_Perai_City_Council_(MBSP_-_Majlis_Bandaraya_Seberang_Perai)_Logo.png). Fail induk jata rasmi boleh menggantikan aset review dengan menukar laluan dalam `apps/web/src/brand.ts` apabila tersedia.

Foto sebenar Menara Bandaraya telah dikenal pasti pada [Wikimedia Commons — MBSP Bandar Perda](https://commons.wikimedia.org/wiki/File:MBSP_Bandar_Perda_(221003)_(cropped).jpg), oleh *angys*, lesen CC BY-SA 4.0. Muat turun dari Wikimedia dan domain aset rasmi MBSP disekat polisi rangkaian sesi ini. Foto tersebut **tidak digunakan** dan tidak didakwa tersedia. Pengguna kemudian memilih rujukan panorama konsep di atas. Keperluan foto dokumentari/asset master rasmi kekal untuk semakan ICT jika diperlukan sebelum produksi.

## Semakan

Screenshot penuh yang dikemas kini berada dalam `docs/screenshots/staylink-desktop.png` dan `docs/screenshots/staylink-mobile.png`. Pemeriksaan frontend/API, lint, typecheck, Vitest dan Playwright dijalankan selepas perubahan; keputusan akhir diringkaskan dalam `docs/verification.json`.
