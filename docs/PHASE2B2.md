# STAYLink MBSP Fasa 2B.2 — Maklumat premis PPTT

## Fungsi tersedia

1. **Seterusnya** pada bahagian pemohon menyimpan draf dan membuka `/permohonan/draf/:id/premis`. Sesi, pengesahan e-mel, pengenalan lengkap, role/permission dan pemilikan draf sedia ada dikekalkan. Deep-link premis/semakan kembali ke laluan asal selepas login.
2. Maklumat lokasi: alamat penuh, poskod lima digit (termasuk sifar awal), nombor lot/PT, mukim/bandar, daerah SPU/SPT/SPS serta pin latitude/longitude. Daerah ialah pengisytiharan pengguna dan tidak diteka daripada koordinat.
3. Peta Leaflet: klik untuk memilih/memindah pin, seret pin, pan/zoom, serta pilihan papan kekunci melalui anak panah dan **Letak Pin di Tengah Peta**. Latitude/longitude diisi automatik, dibundarkan kepada enam tempat perpuluhan, dipaparkan baca sahaja dan disimpan bersama. Reduced motion mematikan animasi zoom/fade peta; peta dimuatkan apabila bahagian premis dibuka.
4. Maklumat bangunan agregat: jenis bangunan, kegunaan sedia ada, bilangan tingkat terlibat, unit, bilik, keluasan lantai dalam m² dan jumlah pekerja dicadangkan. Tiada rekod individu bagi setiap bilik atau penentuan kapasiti/kelulusan automatik.
5. Maklumat sijil: CCC/CFO/OC, nombor rujukan dan tarikh jika diketahui; atau Tidak berkaitan / Belum dipastikan. Rujukan diperlukan untuk meneruskan jika jenis CCC/CFO/OC dipilih. Ini bukan pengesahan kesahihan sijil.
6. **Simpan Draf** menyimpan maklumat separa yang sah; medan kosong disimpan NULL. Nilai yang dibekalkan mesti sah (bukan menerima input rosak sebagai draf). **Sebelumnya** menyimpan secara cara sama dan kembali ke pemohon. **Seterusnya** memerlukan medan asas lengkap serta pin, menyimpan dan membuka ringkasan sebenar `/semakan`. Tiada modul penghantaran atau kelulusan diwujudkan.
7. Satu rekod premis agregat per draf, dengan pemilik asal sahaja boleh akses. Wakil lain syarikat sama dan ICT tidak memperoleh akses. Kuasa syarikat dinilai semula; yang tamat/dibatalkan/belum bermula atau syarikat tidak aktif ditolak.
8. Kedua-dua bahagian berkongsi `version` draf. Simpanan serentak/tab lama menghasilkan 409 dan tidak menimpa kerja bahagian lain. Data premis, kenaikan versi dan audit disimpan dalam satu transaksi. Audit merekod actor/intent/versi, tanpa alamat, koordinat atau kandungan sijil dalam metadata.

## Batas peta dan GIS — PENDING

Jubin sebenar ialah OpenStreetMap (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`) dengan atribusi. Rangkaian Codex menolak sambungan ke domain itu melalui HTTP CONNECT 403. Oleh itu screenshot semasa menunjukkan **grid, pin dan mesej peta asas tidak tersedia**. Tiada jalan/bangunan/sempadan simulasi atau jubin tiruan digunakan dalam screenshot/ujian. Enjin pemilihan pin diuji, tetapi penghantaran jubin sebenar belum berjaya diuji dalam Codex.

Untuk paparan peta asas pada persekitaran lain, browser mesti boleh mencapai domain jubin dan polisi CSP frontend perlu membenarkan sumber imej tersebut. Semak kesesuaian penyedia dan [polisi jubin OSM](https://operations.osmfoundation.org/policies/tiles/) sebelum penggunaan awam berskala. Jika ICT menyediakan peta dalaman, integrasi URL/atribusi penyedia baharu perlu dibuat; tiada penyambung GIS MBSP direka tanpa sumber rasmi. Tiada geocoding, carian alamat, GPS atau data sempadan rasmi diaktifkan.

`locationSource` hanya USER_PIN, `boundaryStatus` sentiasa UNVERIFIED dan dikunci database. Koordinat global sah tidak membuktikan berada dalam bidang kuasa MBSP. Had latitude ±85 ialah had teknikal paparan peta, bukan sempadan MBSP. Daerah dipilih secara manual dan pengesahan rasmi menunggu data GIS serta semakan pegawai yang sah.

## Data dan migrasi

Migrasi tambahan `202610290004_premises` menambah jadual `application_premises` (jumlah 25 jadual teras): FK unik kepada draf, FK daerah, koordinat berpasangan, bilangan positif, keluasan NUMERIC(12,2), sijil DATE dan status GIS UNVERIFIED. Tiada perubahan migrasi lama, backend auth, MFA atau struktur syarikat Fasa 2A.

```bash
npm run db:generate
npm run db:migrate
npm run db:test:migrate # database ujian berasingan sahaja
```

Medan kosong nullable untuk draf separa. Kiraan ialah integer positif (had penyimpanan 32 bit); keluasan positif sehingga 1,000,000,000 m² dan dua perpuluhan (had teknikal, bukan standard kelulusan). Sijil tidak boleh bertarikh masa hadapan melalui API. Tidak berkaitan/Belum dipastikan tidak menyimpan butiran sijil. Pelanggan tidak boleh menghantar owner, snapshot, room records atau status GIS melalui badan premis.

Kunci identiti/MFA dan SMTP Fasa 2A dikekalkan; tiada rahsia baharu. Production masih memerlukan migrasi, HTTPS/origin/SMTP sedia ada dan akses peta diluluskan. Tiada Cloudflare deployment atau perubahan Worker.

## Pengujian dan bukti

**83 unit/API (67 API + 16 unit)** serta **10 aliran Playwright** lulus, bersama lint, typecheck dan build. Migrasi diterapkan pada PostgreSQL pembangunan dan ujian. Liputan tambahan: simpan separa/lengkap, muat semula, auto pin klik/seret/papan kekunci, CCC, pengisytiharan daerah berasingan, semakan draf, navigasi Sebelumnya/Seterusnya, login-return, ownership/CSRF, kuasa tamat, FK/unik/CHECK PostgreSQL, input tidak sah, GIS palsu dan simpanan serentak antara bahagian.

Responsive diuji pada 320, 390, 768, 1024 dan 1440 piksel. Semua identiti/alamat/syarikat/sijil ujian ialah sintetik DATA UJIAN/example.test. Pin dalam ujian bukan bukti lokasi premis sebenar. Screenshot menggunakan laman sebenar dan keadaan rangkaian sebenar, tanpa mock jubin. Aliran Fasa 2A/Fasa 2B.1 masih diliputi suite penuh; suite menunggu kuota API sebelum aliran tambahan tanpa melonggarkan rate limit.

| Paparan | Screenshot PNG sebenar |
|---|---|
| Desktop | [Buka desktop](screenshots/phase2b2-premises-desktop.png) |
| Telefon | [Buka telefon](screenshots/phase2b2-premises-mobile.png) |

Halaman utama, aset asal logo MBSP/emas STAYLink, CSS korporat, latar dan animasi asal tidak diubah. Penghantaran rasmi, pengesahan sijil, GIS rasmi dan kelulusan automatik tidak disediakan.
