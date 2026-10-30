# Diagnosis worker peta — STAYLink MBSP

Branch: `staylink-mbsp-phase1`. Semakan: 30 Oktober 2026 (Asia/Kuala_Lumpur).

## Punca dan bukti

ZIP pada commit `64c0ab4` memaksa OpenFreeMap, walaupun OSM boleh dicapai. Exporter menggantikan import worker Vite dengan `URL.createObjectURL(new Blob(...))`. Dokumen tanpa origin HTTP menghasilkan URL worker **`blob:null/<UUID>`**; ia bukan URL HTTP yang boleh disajikan oleh pelayan. Cadangan membuka ZIP itu terus melalui `file://` tidak sesuai dan telah ditarik balik.

Perbandingan terkawal menggunakan HTML lama dan fixture geografi yang sama:

| Konteks                     | URL worker yang diperhatikan                                      | Keputusan                                  |
| --------------------------- | ----------------------------------------------------------------- | ------------------------------------------ |
| HTTP                        | `blob:http://localhost:5174/9625fecf-99a3-4b27-a89e-2cb147aa4aa8` | Renderer/worker berjalan dengan data ujian |
| Dokumen legap `about:blank` | `blob:null/c0984a0b-5332-4768-b267-d782e78e10c0`                  | Worker error; UNAVAILABLE                  |

UUID dijana setiap sesi. Pelayar Codex menyekat navigasi `file://` melalui polisi administrator; tiada polisi dilonggarkan. Oleh itu, mesej Chrome pengguna `Refused to cross-origin redirects of the top-level worker script` **belum diterbitkan semula secara tepat daripada fail tempatan**. Log pengguna tidak menyertakan URL/redirect chain sebenar. Tidak ada bukti bahawa CDN atau penyedia jubin mengalih worker lama: worker itu ialah Blob, bukan permintaan HTTP. Perbandingan di atas mengesahkan masalah konteks worker, bukan membuktikan redirect HTTP tertentu pada komputer pengguna.

Ujian HTTP berasingan memberikan worker pada satu origin yang mengalih ke origin lain: worker gagal. Ujian regresi diagnostik juga menyuntik redirect silang origin dan mengesahkan worker/map tidak dilaporkan READY. Ini membuktikan perlindungan yang diperlukan, bukan dakwaan bahawa redirect simulasi tersebut ialah redirect sebenar pengguna.

Membuka laman OSM atau PNG jubin secara terus tidak menguji MapLibre, WebGL, style, glyph, jubin vektor atau worker. OSM raster Leaflet sendiri tidak memerlukan Web Worker atau WebGL.

## Pembetulan

- Hapus worker Blob daripada exporter. Pakej HTML kini mengandungi worker berasingan yang dijana Vite dalam `assets/`.
- Worker diselesaikan relatif kepada URL HTTP/HTTPS halaman dan diwajibkan pada origin yang sama; protokol lain, Blob, CDN dan credentials ditolak. Portal menggunakan semakan yang sama sebelum memulakan renderer alternatif.
- Diagnostik menggunakan OSM dahulu seperti portal, dengan fallback OpenFreeMap. Pilihan khusus OpenFreeMap membolehkan worker/WebGL diuji walaupun OSM berjaya.
- Halaman memaparkan URL worker tepat dan menyemak HTTP/MIME dengan `redirect: "error"`. Status semakan fail worker berasingan daripada status peta; fail worker HTTP 200 sahaja tidak bermaksud jalan kelihatan.
- Dokumen bukan HTTP/HTTPS berhenti dengan HTTP_REQUIRED sebelum bundle memulakan worker atau peta. Jangan gunakan ZIP lama.
- Pelayan diagnostik hanya menyajikan HTML, worker dan lesen yang dibenarkan, tanpa backend atau directory listing; MIME JavaScript, `nosniff`, dan `worker-src 'self'`. Jangan rewrite worker kepada HTML atau mengalihnya ke origin login/CDN.

## Keputusan pengesahan

| Komponen                                  | Status              | Bukti / had                                                                                                                                      |
| ----------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lint, typecheck, build                    | PASS                | Build portal selesai; amaran saiz chunk MapLibre sedia ada kekal                                                                                 |
| Unit/API                                  | PASS                | 98 ujian dalam larian akhir: 67 API, 16 core, lapan controller/config, empat pelayan HTTP dan tiga sempadan origin worker                        |
| Pelayar diagnostik HTTP                   | PASS                | Lima ujian: OSM dahulu, worker origin sama, fallback + WebGL + pin/drag/zoom/koordinat, redirect ditolak, kegagalan/responsif dan protocol guard |
| Regresi portal                            | PASS                | 15 ujian sedia ada: auth/e-mel ujian/MFA/syarikat, draf/premis PostgreSQL, desktop/telefon, fallback dan WebGL tidak tersedia                    |
| Fail worker melalui HTTP sebenar          | PASS                | `http://localhost:5174/assets/maplibre-gl-worker-Dro7GA4u.js` → HTTP 200, `text/javascript; charset=utf-8`, tiada Location/redirect              |
| Worker dijalankan + ciri vektor dirender  | PASS dengan fixture | Browser benar-benar menjalankan worker HTTP origin sama dan renderer WebGL; geografi sintetik, bukan jalan sebenar                               |
| Peta jalan/nama jalan sebenar             | PENDING             | Kedua-dua `tile.openstreetmap.org` dan `tiles.openfreemap.org` gagal dalam Codex dengan ERR_TUNNEL_CONNECTION_FAILED; status map UNAVAILABLE     |
| Mesej/redirect chain asal Chrome pengguna | PENDING             | file:// disekat oleh pelayar terurus; URL lengkap/chain pengguna belum diberikan                                                                 |
| Codespaces HTTPS dari komputer pengguna   | PENDING             | Konfigurasi pelancar disediakan; Codespace belum dicipta atau diuji dalam sesi ini                                                               |

Jumlah kes pelayar: **20** lulus, dengan data sintetik untuk provider. Pusingan akhir pertama merekodkan 14 lulus dan enam terhalang oleh had kadar login selepas ujian berulang. Enam kes itu semuanya lulus apabila diulang selepas restart proses API pembangunan; tiada kod atau had kadar keselamatan diubah. Pusingan regresi 15 kes terdahulu juga lulus sepenuhnya. Status akhir merangkumi larian awal dan ulangan enam kes, bukan dakwaan satu larian akhir 20/20 tanpa kegagalan. Screenshot dibuat berasingan melalui rangkaian sebenar tanpa fixture dan menunjukkan UNAVAILABLE, bukan bukti peta berjaya. Ujian auth menghantar e-mel sintetik ke Mailpit tempatan, bukan mengesahkan SMTP production.

## Kaedah semakan pengguna

Ikuti [arahan HTTP/HTTPS dan GitHub Codespaces tanpa pemasangan Node.js pada komputer pengguna](previews/README.md). Tiada URL preview awam tersedia daripada sesi Codex ini; alamat localhost Codex bukan pautan ujian luar. Selepas membuka URL HTTPS sebenar yang diberi Codespaces atau pelayan ICT, pastikan jalan dan nama jalan benar-benar kelihatan, kemudian uji klik/seret pin, zoom dan koordinat. Status READY tanpa semakan visual masih tidak mengesahkan identiti lokasi atau sempadan daerah.

## Fail dan perlindungan skop

Runtime peta sahaja: `apps/web/src/map-worker-url.ts`, `map-openfreemap.ts`. Diagnostik: `map-check-download.ts`, `scripts/export-map-check.mjs`, `scripts/serve-map-check.mjs`, `docs/previews/` dan `.devcontainer/map-check/devcontainer.json`. Ujian: `tests/map-worker.test.ts`, `tests/map-http.test.ts`, `tests/e2e/download.spec.ts`.

Kod pendaftaran/login/MFA, schema/database, Simpan Draf, homepage, logo MBSP, logo emas STAYLink dan aset premium tidak diubah. Regresi menggunakan data ujian sintetik dan database ujian/pembangunan yang sedia ada. Tiada main, merge, Cloudflare deployment atau perubahan Worker `dashboard-bangunan-mbsp`.

Screenshot rangkaian sebenar (peta masih UNAVAILABLE): [desktop](screenshots/map-check-http-desktop.png), [telefon](screenshots/map-check-http-mobile.png).
