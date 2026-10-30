# Ujian peta tanpa pemasangan

Pelayan pembangunan Codex memberi HTTP 200 untuk portal dan `/map-check.html` pada port 5173. Alamat `localhost` merujuk komputer yang membuka pelayar; ia bukan pautan dari komputer pengguna ke Codex. Sesi Codex ini tidak menyediakan URL preview awam atau port forwarding. Tiada hosting atau deployment baharu dibuat.

## Cara paling mudah

1. [Muat turun ZIP ujian peta](https://raw.githubusercontent.com/BangunanDotCom/sipintar-mbsp/staylink-mbsp-phase1/docs/previews/staylink-map-check.zip).
2. Gunakan **Extract All / Ekstrak Semua** pada komputer anda.
3. Buka `map-check.html` daripada folder yang diekstrak menggunakan **Open with → Google Chrome**.
4. Tunggu status **READY**, kemudian pastikan jalan dan nama lokasi benar-benar kelihatan. Cuba zoom, klik peta dan seret pin; koordinat sepatutnya berubah.

Tiada Node.js, terminal, akaun, database atau pemasangan perisian diperlukan. Internet masih diperlukan untuk mengambil peta langsung. Jika **UNAVAILABLE**, peta belum berjaya. Semak akses ke `tiles.openfreemap.org`, sokongan WebGL atau sekatan pelayar/rangkaian komputer tersebut.

Ini diagnostik kendiri dengan kod renderer/controller portal yang sama, **bukan preview portal penuh**, dan tidak menguji login atau Simpan Draf. Tiada data peribadi, rahsia atau jubin peta dibundel. Fail tempatan terus menggunakan sumber alternatif OpenFreeMap kerana sumber jubin OSM memerlukan Referer HTTP yang sah. Membuka laman OSM melalui butang berasingan hanya menguji penyedia itu, bukan portal.

## Had pengesahan Codex

- Akses penyedia peta langsung disekat oleh rangkaian Codex. Paparan jalan sebenar pada komputer luar masih **PENDING** sehingga dilihat dalam Chrome.
- Pelayar terurus Codex menyekat navigasi `file://` dengan `ERR_BLOCKED_BY_ADMINISTRATOR`. Pembukaan fail sebenar dalam Chrome pengguna belum disahkan di sini; ujian automatik menjalankan kandungan HTML yang sama melalui HTTP tempatan dengan fixture terkawal, dan menguji kegagalan dalam dokumen berorigin legap (`about:blank`). Tiada polisi pelayar atau rangkaian dilonggarkan.
- Ujian dengan geografi sintetik mengesahkan renderer, worker Blob, klik/seret pin dan zoom; ujian kegagalan mengesahkan status UNAVAILABLE dan pemilihan koordinat. Geografi ujian tidak disertakan dalam ZIP dan bukan bukti peta jalan sebenar.
- Laman portal, backend, schema, logo dan reka bentuk tidak diubah. Tiada merge, deployment Cloudflare atau perubahan Worker dibuat.

## Membina semula (pembangun sahaja)

Jalankan `node scripts/export-map-check.mjs` dari root repositori selepas dependencies tersedia. Skrip menggunakan Vite sedia ada untuk membundel JavaScript, CSS dan worker pemapar ke satu HTML; ZIP turut mengandungi arahan serta lesen Leaflet dan MapLibre. Ia tidak menyalin fail `.env`, aset pengguna atau database. Selepas membina, jalankan lint, typecheck dan `playwright test tests/e2e/download.spec.ts`.
