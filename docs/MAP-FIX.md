# Pembetulan peta lokasi STAYLink MBSP

Tarikh semakan: **30 Oktober 2026 (Malaysia)**. Branch: `staylink-mbsp-phase1`.

**Kemas kini worker/ZIP:** lihat [diagnosis HTTP/HTTPS terkini](MAP-WORKER-DIAGNOSIS.md). Jangan buka ZIP lama melalui `file://`; gunakan pelancar Codespaces atau pelayan statik HTTP/HTTPS dalam arahan terkini.

## Status sebenar

**Kod pemulihan/fallback telah diuji, tetapi paparan jalan/bangunan/nama lokasi sebenar dalam Codex masih PENDING.** Kedua-dua domain penyedia ditolak rangkaian Codex. Tiada screenshot jubin/vektor sintetik dipersembahkan sebagai peta sebenar. Google Chrome biasa pada komputer luar Codex belum disahkan oleh semakan ini; pelayar tersedia ialah Chromium 154.0.8037.57.

Tangkapan portal tanpa route interception menunjukkan status UNAVAILABLE, pin/grid dan amaran sebenar. Permintaan ke `tile.openstreetmap.org` serta `tiles.openfreemap.org` gagal `net::ERR_TUNNEL_CONNECTION_FAILED`. Semakan HTTPS melalui proksi menunjukkan `HTTP/1.1 403 Forbidden`, `server: envoy` dan `CONNECT tunnel failed`. Ini berlaku sebelum respons HTTP asal penyedia dapat diterima; ia tidak membuktikan OSM atau OpenFreeMap menolak aplikasi.

## Punca dan pembetulan

- URL utama asal sudah betul: `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. HTTPS dikekalkan. Sekatan egress Codex disahkan melalui policy berkuat kuasa dan percubaan browser/proksi; tiada cubaan memintas proksi, menukar identiti atau mematikan TLS.
- Flag `failed` asal melekat selepas satu jubin gagal. Ia tidak menilai kelompok jubin semasa atau mengendalikan pemulihan dengan baik. Kod baharu menjejak jubin viewport semasa, membuang rekod jubin yang telah dikeluarkan dan menandakan READY hanya selepas kelompok dimuatkan.
- Tiada fallback bebas sebelum ini. Kini satu kegagalan/timeout utama mencuba **OpenFreeMap Liberty** melalui MapLibre, dengan atribusi OpenFreeMap/OpenMapTiles/OpenStreetMap. Tiada API key, akaun berbayar, proxy jubin, prefetch bandar atau arkib offline dibina. Selepas kedua-dua sumber gagal, tiada loop automatik; Cuba Semula ialah tindakan pengguna.
- Provider/fallback mempunyai timeout 12 saat setiap percubaan. Callback lama tidak boleh menukar state selepas pertukaran atau unmount. Pembersihan lapisan/animation frame menghalang ralat zoom/resize selepas lapisan dibuang. Renderer tidak disokong (WebGL) menghasilkan status gagal yang jelas, bukan kejayaan palsu.
- Klik, drag, zoom dan pengisian koordinat kekal pada Leaflet. Pertukaran basemap tidak mengubah pin, payload premis atau versi draf. Teks daerah/GIS UNVERIFIED kekal. Peta menggunakan zoom segera bagi menyelaraskan kamera raster/vektor; animasi halaman utama tidak diubah.
- Tetapan frontend berada dalam `apps/web/.env.local`, mengikut root Vite asal. `.env` akar ialah konfigurasi backend; memasukkan VITE_MAP_* di situ tidak berkesan pada Vite asal. Konfigurasi Vite, auth dan logik Simpan Draf tidak diubah. Contoh frontend berasingan mengelakkan tetapan NODE_ENV/rahsia backend dibaca sebagai konfigurasi frontend.
- Peta alternatif hanya dimuatkan apabila diperlukan; chunk MapLibre sekitar 1.06 MB (290 kB gzip) dan renderer worker tempatan tidak dimuatkan pada halaman utama. Build mempunyai amaran saiz chunk fallback; ini bukan ralat build. Worker pelayar ini tiada kaitan dengan Cloudflare Worker `dashboard-bangunan-mbsp`.

## Konfigurasi sumber

Pilihan tanpa override menggunakan OSM dan OpenFreeMap. Untuk override diluluskan ICT:

```bash
cp apps/web/.env.example apps/web/.env.local
```

- `VITE_MAP_PRIMARY_URL`: URL **HTTPS XYZ** mengandungi `{z}`, `{x}`, `{y}`. Kosong bermakna OSM standard.
- `VITE_MAP_PRIMARY_ATTRIBUTION`: atribusi lesen penyedia sendiri, teks biasa (di-escape sebelum dipaparkan); diwajibkan bagi sumber custom.
- `VITE_MAP_FALLBACK`: `openfreemap` (lalai) atau `none`.

Ini nilai awam semasa build. Jangan letak token peribadi/database/MFA/identity keys di VITE_*. Restart Vite selepas kemas kini; bina semula untuk persekitaran produksi. Semak hak penggunaan penyedia custom sendiri. Kod tidak menerima URL HTTP, identiti user:password dalam URL, template tidak lengkap atau atribusi kosong bagi sumber custom.

Rujukan penyedia yang disemak: [polisi jubin OSM](https://operations.osmfoundation.org/policies/tiles/), [OpenFreeMap Quick Start](https://openfreemap.org/quick_start/), [penggunaan/atribusi OpenFreeMap](https://openfreemap.org/), [Terms of Service OpenFreeMap](https://openfreemap.org/tos/) (dikemas kini 14 Oktober 2026). Penggunaan laman biasa dengan atribusi dibenarkan; tiada andaian SLA atau pengesahan GIS MBSP dibuat. Notis BSD MapLibre disertakan dalam `apps/web/public/licenses/maplibre-gl.txt`.

## Semakan Google Chrome biasa di luar sekatan Codex

Halaman diagnostik pembangun tidak memerlukan login atau database:

```bash
npm ci
npm run dev:web
```

Buka **http://localhost:5173/map-check.html** dalam Chrome pada komputer yang menjalankan Vite. Jangan buka melalui `file://` kerana halaman web mesti menghantar Referer yang sah. Halaman ini bukan aliran pengguna portal dan tidak termasuk entry build produksi lalai.

1. Semak jalan/nama lokasi secara visual. READY memerlukan imej jubin terdekod atau ciri geografi vektor dirender; keadaan ini bukan pengesahan rasmi ketepatan alamat/sempadan.
2. Dalam DevTools → Network, semak PNG OSM atau style/tiles/fonts OpenFreeMap menerima respons berjaya. Jika OSM gagal, semak pertukaran ke OpenFreeMap; jika kedua-duanya gagal, status mesti UNAVAILABLE.
3. Bandingkan dengan DevTools pada portal sebenar selepas login. Klik/seret pin, zoom, simpan draf dan reload. Halaman diagnostik hanya menguji sumber/renderer; ia tidak menyimpan koordinat.
4. Jika hanya Codex gagal, benarkan `tile.openstreetmap.org` dan `tiles.openfreemap.org` melalui konfigurasi rangkaian Codex yang sah. Kod aplikasi tidak boleh memberi kebenaran egress itu. Jika Chrome luar juga gagal, semak firewall/penyekat kandungan, HTTP response penyedia dan konfigurasi sumber.
5. Pada hosting sebenar, CSP frontend perlu membenarkan imej utama, fetch sumber vektor/glyph/sprite serta worker JavaScript tempatan. API Helmet tidak dilonggarkan. Cadangan sumber: img-src domain penyedia yang diluluskan; connect-src OpenFreeMap; worker-src self. Sahkan CSP akhir pada pelayan sebenar, bukan andaikan Vite mewakili konfigurasi IIS/hosting.

## Ujian yang benar-benar dilaksanakan

Untuk pengguna tanpa Node.js atau terminal, gunakan [ZIP diagnostik kendiri dan arahan tanpa pemasangan](previews/README.md). Alamat `localhost` di atas hanya untuk pembangun pada komputer yang menjalankan pelayan. Sesi Codex ini tidak menyediakan URL preview awam. Fail muat turun bukan preview portal penuh; paparan jalan sebenar masih perlu disahkan di luar rangkaian Codex.

- Lint, typecheck dan build lulus; **91 unit/API (67 API + 24 unit)** lulus, termasuk lapan ujian konfigurasi/controller baharu.
- **15 ujian pelayar** lulus: lima senario peta terkawal, sepuluh regresi portal/akaun/MFA/syarikat/draf/premis.
- Senario peta: sumber utama berjaya; kegagalan utama → vektor alternatif; kedua-duanya gagal tanpa loop; retry pulih; WebGL tidak tersedia tidak merosakkan zoom/retry; portal mengekalkan klik/drag/zoom/koordinat serta Simpan Draf PostgreSQL semasa fallback.
- Ujian provider menggunakan PNG atau geografi **DATA UJIAN sintetik** untuk menilai kod/renderer sahaja. Regresi borang membatalkan permintaan penyedia komuniti supaya tiada pengunduhan/panning bot terhadap perkhidmatan awam. Ujian tersebut bukan bukti penghantaran peta jalan sebenar.
- Screenshot semakan dibuat dalam browser context berasingan, tanpa mocks/routes/provider overrides. Kedua-dua sumber benar-benar gagal dalam Codex. Tiada ralat JavaScript; lebar 320/390/768/1024/1440 tiada overflow. Screenshot mengandungi data sintetik sahaja.
- Pendaftaran/login/logout/reset/MFA dan Simpan Draf sedia ada masih lulus. Kod backend, schema/migrasi, halaman utama, logo MBSP/emas STAYLink, latar dan animasi identiti dikekalkan.

## Fail diubah

Komponen: `apps/web/src/PremisesMap.tsx`, `premises.css`. Sumber/controller: `map-config.ts`, `basemap-controller.ts`, `map-basemap.ts`, `map-openfreemap.ts`. Diagnostik: `apps/web/map-check.html`, `src/map-check.ts`. Konfigurasi contoh: `.env.example`, `apps/web/.env.example`; dependencies/lockfile dan lesen MapLibre. Ujian: `tests/maps.test.ts`, `tests/e2e/maps.spec.ts`, route stub peta dalam `tests/e2e/portal.spec.ts`. Dokumentasi/status dan metadata screenshot dikemas kini.

| Bukti sebenar (masih tanpa peta asas) | PNG                                            |
| ------------------------------------- | ---------------------------------------------- |
| Desktop                               | [Buka gambar](screenshots/map-fix-desktop.png) |
| Telefon                               | [Buka gambar](screenshots/map-fix-mobile.png)  |

Status akhir: pembetulan kod diuji; **peta jalan sebenar/Google Chrome di rangkaian bebas belum disahkan**. Tiada merge main, deployment Cloudflare atau perubahan Worker dilakukan.
