# Bukti bebas audit susulan

Larian pada 25 November 2026 dengan Node 24.22.3, Chromium 156.0.8078.79, PostgreSQL 16, Oracle Free 23.26.4 dan Mailpit/Nginx loopback. Ujian menggunakan data sintetik. Kod aplikasi dan ujian asal dijalankan pada cabang terasing.

| Larian / SHA | Keputusan bebas |
|---|---|
| PR #69 `7970f1f`, keselamatan API dengan PostgreSQL | **79 lulus, 1 dilangkau** pada DB biasa. Ujian khas keserasian Issue #24 telah lulus berasingan pada kod yang sama dalam semakan terdahulu. Termasuk MFA/CSRF, isolation, revokasi, concurrency dan syarikat |
| PR #69 `7970f1f`, regresi komponen keselamatan | **23 lulus** dalam 5 fail untuk redaksi, konfigurasi demo, ClamAV fixture, stor kuarantin dan scan lease |
| PR #69 `7970f1f`, Completion HTTPS | **1 integrasi API + 1 Playwright lulus** pada kit latihan 11 akaun untuk tiap latihan UX. Pembuktian berjalan dengan kod dan suite asal |
| PR #70 `bfc4683`, Oracle Free | **22 lulus** dalam 2 fail. Meliputi kontrak, lock Completion berskop, bacaan CLOB berversi, rollback dan grant |
| PR #71 `be329ed0`, Oracle Free + PostgreSQL | **31 lulus, 2 dilangkau** dalam 3 fail. Dua ujian khusus Oracle dilangkau dalam varian PostgreSQL. Liputan parity termasuk serahan, bil pertama, pengasingan syarikat/wakil dan draf, templat, peranan, lock dan rollback |
| PR #71 `be329ed0`, Oracle restore dan import PostgreSQL | **Lulus**. Export/restore logik Oracle ke skema lain kosong sepadan bagi manifest 31 jadual. Import PostgreSQL→Oracle diikuti export ke manifest yang sepadan juga lulus. Pemasangan dan kadar hak menggunakan pengguna owner/runtime berasingan |
| PR #71 `be329ed0`, browser backend Oracle | **5 Playwright lulus**: daftar/aktivasi, syarikat/wakil, pulih akaun, UUID tingkat dan unit merentas tingkat |
| PR #71 `035fb7e`, Completion PostgreSQL + Oracle Free | **6 lulus** dalam 2 fail. Dua perjalanan API pada enjin berasingan dan empat ujian domain. Meliputi peranan/daerah, lock, versi, callback, penutupan, serta rollback peristiwa dan notifikasi |
| PR #71 `035fb7e`, migrasi 002 dan pemulihan Completion | **Lulus**. Naik taraf skema 001 berisi data mengekalkan cap jari. Skema 002 dengan perjalanan Completion dipulihkan ke skema kosong dengan SHA-256 sepadan dan kiraan **17 peristiwa** pada setiap skema |

Percubaan awal dengan penapis Vitest memilih ujian PDF tanpa ujian penyediaan data yang lebih awal dan menghasilkan satu kegagalan HTTP 400. Suite fail lengkap pada DB sintetik baharu lulus. Percubaan pemeriksaan UX awal menunggu elemen `main` yang tidak digunakan pada semua paparan. Selepas keadaan menunggu dibetulkan, polisi CSP lab menyekat kaedah suntikan pemeriksa inline. Larian penggunaan alat pemeriksaan pada permulaan konteks pelayar berjaya dengan CSP hos dikekalkan.

[Audit semula P0](AUDIT-CALON-P0.md) merekod larian bebas calon terkini #73 `0fe8c7a` dan #74 `3d1477c`. Kedua-dua P0 kekal terbuka. Jadual di atas menyenaraikan larian baseline dan kesetaraan API sebelum calon P0.

## Pengalaman pengguna dan prestasi setempat

Pelayar menilai halaman utama, daftar, log masuk, pulih akaun dan dashboard bagi sembilan identiti dengan peranan berbeza. Ukuran desktop 1366×768 dan mudah alih emulasi 390×844. Gunakan konteks pelayar terasing, binaan rilis, Nginx HTTPS loopback, sambungan luar disekat dan Chromium headless. Ujian menyemak navigasi/asas borang, fokus awal selepas Tab dan lebihan lebar halaman. Pemindahan peranan/MFA dilakukan melalui API sesi sebenar sebelum pemeriksaan dashboard.

Axe-core 4.14.1 menilai peraturan automatik WCAG 2.0/2.1 A/AA. Audit pertama memperoleh **24 paparan lengkap daripada 26 percubaan**. Semua 24 mempunyai sekurang-kurangnya isu `color-contrast` dan `label-content-name-mismatch`. `link-in-text-block` muncul pada halaman log masuk desktop dan mudah alih. Tiada limpahan lebar dalam paparan lengkap. Isu ini menjejaskan keterbacaan dan padanan label pembaca skrin atau kawalan suara. Sahkan pembaikan secara manual dengan pembaca skrin dan uji zoom 200/400%, susunan fokus, input, keadaan loading, validasi dan ralat pada semua peranan.

| Sampel setempat | Bilangan paparan lengkap | Median Navigation Timing load event end |
|---|---:|---:|
| Desktop | 13 | 223 ms |
| Mudah alih emulasi | 11 | 172 ms |

Dua percubaan dashboard mudah alih (PPSK dan Perancang) tamat masa pada pemeriksaan pertama. Ujian semula dalam kit baharu memperoleh kesemua 12 paparan sasaran termasuk kedua-duanya, tanpa gagal navigasi. Ketidakpadanan nama ditemui pada pautan jenama dan isu kontras pada label dashboard. Tiada bukti mencukupi untuk menentukan punca dua tamat masa awal. Larian sampel ini menggabungkan halaman awam dan dashboard dengan DB kecil. Median sehingga load event mengukur navigasi setempat. Masa kemas kini selepas interaksi, p95/p99, prestasi telefon sebenar, INP, CLS, pemilikan sektor dan SLO hos belum dinilai melalui ukuran ini. Pengukuran halaman utama baseline dalam laporan terdahulu mempunyai profil throttle/LCP berasingan. [Ukuran baseline](BUKTI-UJIAN.md#prestasi-yang-diukur)
