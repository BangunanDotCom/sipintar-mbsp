# Diagnostik peta STAYLink melalui HTTP/HTTPS

**Jangan buka `map-check.html` terus melalui `file://`.** Cadangan ZIP lama yang dibuka terus dalam Chrome ditarik balik: MapLibre memerlukan konteks worker yang sesuai. Versi semasa memaparkan `HTTP_REQUIRED` tanpa memulakan peta apabila protokol bukan HTTP/HTTPS.

Sesi Codex ini tidak menyediakan preview awam atau port forwarding. Alamat `localhost` Codex tidak boleh dibuka dari komputer pengguna. Kaedah di bawah tidak memerlukan Node.js dipasang pada komputer pengguna.

## Pilihan A — Chrome pada Windows 10/11: GitHub Codespaces

1. [Buka konfigurasi diagnostik STAYLink dalam GitHub Codespaces](https://codespaces.new/BangunanDotCom/sipintar-mbsp?ref=staylink-mbsp-phase1&devcontainer_path=.devcontainer%2Fmap-check%2Fdevcontainer.json).
2. Log masuk GitHub dan pastikan branch **staylink-mbsp-phase1** serta konfigurasi **STAYLink MBSP — Map diagnostic only** dipilih, kemudian pilih **Create codespace**. Akaun perlu mempunyai akses/kuota Codespaces.
3. Tunggu persekitaran siap. Pelayan diagnostik bermula secara automatik. Jika tab ujian tidak terbuka, dalam tab **Ports**, cari port **5174 — STAYLink map-check** dan pilih **Open in Browser**.
4. GitHub memberikan URL HTTPS khusus Codespace tersebut. Gunakan URL yang dipaparkan, bukan `localhost` dan bukan URL yang diteka. Buka dalam tab Chrome biasa dengan sesi GitHub yang sama.
5. Uji **OSM + fallback**, kemudian **Uji OpenFreeMap / Worker**. Tunggu READY dan pastikan jalan serta nama jalan benar-benar kelihatan sebelum menganggap peta berjaya. Cuba zoom, klik peta, seret pin dan semak perubahan koordinat.

Konfigurasi ini hanya menjalankan pelayan fail diagnostik; ia tidak menjalankan backend, database atau deployment Cloudflare. Port kekal mengikut kawalan akses Codespaces; tidak perlu menjadikannya awam. Tamatkan Codespace apabila selesai melalui GitHub. **Penyediaan konfigurasi ini telah disemak, tetapi penciptaan Codespace dan akses HTTPS pengguna belum diuji dalam sesi Codex ini.**

## Pilihan B — pelayan HTTP/HTTPS statik yang telah diluluskan

[Muat turun ZIP diagnostik terkini](https://raw.githubusercontent.com/BangunanDotCom/sipintar-mbsp/staylink-mbsp-phase1/docs/previews/staylink-map-check.zip), kemudian minta ICT menyalin kandungan yang diekstrak, **termasuk folder `assets/`**, ke lokasi ujian statik HTTP/HTTPS sedia ada. Buka `/map-check.html` pada URL lokasi tersebut. Tiada pemasangan Node.js, login portal atau database diperlukan untuk menyajikan fail ini.

Fail `assets/maplibre-gl-worker-*.js` mesti memberi **HTTP 200**, MIME **JavaScript**, pada **origin yang sama** dengan HTML, tanpa pengalihan login/CDN atau rewrite kepada HTML. Pelayan contoh dalam repositori membenarkan `worker-src 'self'` dan sambungan kepada sumber peta yang digunakan. Jangan melonggarkan polisi keselamatan Chrome atau menggunakan `--disable-web-security`.

Untuk pembangun yang sudah mempunyai Node.js: `node scripts/serve-map-check.mjs` dari root repositori mencetak URL HTTP pada komputer pelayan itu sahaja. Bukan arahan untuk pengguna memasang Node.js. Dalam Codex pelayan diagnostik disahkan pada port 5174; Vite portal kekal pada port 5173.

## Perkara yang diuji oleh halaman ini

- OSM raster sebagai sumber utama seperti portal; ia tidak memerlukan MapLibre/WebGL. OpenFreeMap digunakan apabila OSM gagal atau dipilih untuk ujian worker khusus.
- Worker ialah fail JavaScript yang dijana Vite, pada origin HTTP/HTTPS yang sama. Tiada worker Blob atau CDN dalam pakej baharu. Halaman memaparkan URL tepat dan menyemak HTTP/MIME/redirect; semakan fail worker berjaya sahaja **bukan** bukti peta berjaya.
- Kod renderer/controller yang sama dengan portal, pin boleh diklik/diseret, zoom dan latitude/longitude. Tiada simpanan draf atau data peribadi dalam diagnostik.
- Internet diperlukan. Membuka laman OSM atau satu PNG secara terus hanya mengesahkan akses itu; ia tidak menguji JavaScript worker, CORS, WebGL, style, glyph atau jubin vektor.

## Keputusan sebenar dan had

Ujian HTTP terkawal meliputi OSM, fallback, worker origin sama/JavaScript/tanpa redirect, penolakan pengalihan worker, responsif, pin/koordinat dan protokol tidak disokong. Data sintetik hanya berada dalam ujian, bukan ZIP atau screenshot. Lihat [laporan diagnosis worker](../MAP-WORKER-DIAGNOSIS.md) untuk keputusan regresi.

Dalam rangkaian Codex, OSM dan OpenFreeMap masih gagal dengan `ERR_TUNNEL_CONNECTION_FAILED`. Fail worker sendiri memberi HTTP 200 tanpa redirect. Peta jalan/nama jalan sebenar dan Chrome komputer pengguna masih **PENDING** sehingga ujian di rangkaian luar dilakukan. Screenshot menunjukkan kegagalan sumber sebenar, bukan bukti kejayaan peta.

## Membina semula (pembangun sahaja)

`node scripts/export-map-check.mjs` membina HTML, worker berasingan dan ZIP termasuk lesen. Dependencies pembangun diperlukan untuk membina, tetapi bukan untuk membuka URL diagnostik yang disajikan. Tiada `.env`, database atau aset pengguna disalin. Jalankan lint, typecheck, unit/API, build dan ujian pelayar selepas perubahan.
