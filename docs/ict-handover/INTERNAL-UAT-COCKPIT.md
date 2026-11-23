# STAYLink MBSP · Cockpit UAT dalaman Issue #49

Asas ialah Issue #45 pada `505480e`. Gunakan data latihan, tiga profil pelayar berasingan dan PostgreSQL localhost. Paparan bertanda LATIHAN / SINTETIK. Polisi pemilik MBSP-01 hingga MBSP-08 masih cadangan. [Matriks pemilik](OWNER-PROPOSALS.md)

## Persediaan fasilitator

1. Sediakan PostgreSQL kosong `staylink_issue49_demo_test` dan Mailpit loopback. Tetapkan URL sambungan sama pada `DATABASE_URL` dan `TEST_DATABASE_URL` dengan `127.0.0.1:5432`. Kekalkan storan dan pengimbas sebenar tertutup.
2. Selepas pemasangan, jalankan `npm run db:generate`, kemudian `NODE_ENV=development npm run db:test:migrate` dan `npm run db:seed` pada DB ujian tersebut.
3. Jalankan `NODE_ENV=development STAYLINK_SYNTHETIC_PORTAL=true npm run db:uat-demo`. Penjana mencipta kit baharu dengan akaun pemohon, PIC SPU, PPSK SPU dan PIC SPT di luar skop. Akaun pemohon latihan boleh memilih peranan Wakil syarikat yang sedia dibenarkan. Fail rahsia mod 0600 disimpan di direktori sementara dan hanya laluan kit dipaparkan.
4. Sumberkan `portal.env` kit untuk peruntukan latihan, kemudian mulakan portal. Untuk menunjukkan label bersyarat, gunakan contoh JSON Issue #45 dan tambahkan peraturan `condition=hasBuildingCertificate`, alternatif `building_certificate`, skop `DRAFT`. Gunakan premis CCC/CFO/OC untuk syarat dipenuhi atau NOT_APPLICABLE untuk peraturan yang tidak terpakai. Aktifkan semakan `DISTRICT_FIXTURE` dan `billing.mode=MOCK` hanya untuk demonstrasi.
5. Gunakan laluan senario dalam `accounts.json`. Simpan fail itu bersama fasilitator. Jalankan sesi baharu menggunakan DB latihan kosong jika reset diperlukan. Portal tiada butang reset atau arahan yang memadam sejarah.

| ID kit | Kandungan | Hasil untuk pementasan latihan |
| --- | --- | --- |
| `single-unit` | Satu UUID unit pada dua tingkat SPU | RM50 selepas pendaftaran tiruan |
| `multiple-units` | Dua UUID unit, sekali unit tambahan pada tingkat kedua | RM100 apabila kedua-duanya diluluskan dalam latihan |
| `failed-evidence` | Metadata fixture dengan verdict FAILED | Paparan bukti gagal dan serahan disekat |
| `company-active` | Akaun latihan dengan kuasa wakil sah | Boleh melihat dan menyediakan bukti selepas memilih Wakil syarikat |
| `company-expired` | Kuasa latihan telah luput | GET dan tindakan data draf ditolak |
| `district-spt` | Draf latihan untuk SPT | PIC SPU tiada akses kepada tugasan atau perbandingan selepas serahan |

## Demonstrasi 25 minit

| Minit | Pelaku | Tindakan dan jangkaan |
| --- | --- | --- |
| 0–5 | Pemohon | Pilih draf satu unit. Semak langkah premis, unit, tingkat dan inventori kemudahan. Semak label Wajib, Bersyarat atau Tidak berkaitan berdasarkan polisi yang dimuat. |
| 5–9 | Pemohon | Jana FAILED, kemudian CLEAN. Semak liputan sasaran, sahkan akuan dan serah latihan. Catat resit. Pada dua tab, simpan hanya versi terkini untuk menunjukkan konflik yang boleh diperbaiki. |
| 9–14 | PIC | Log masuk dan sahkan MFA. Cari awalan resit. Semak inventori dan nasihat AI tiruan. Minta pembetulan dengan alasan. |
| 14–19 | Pemohon dan PIC | Pemohon melihat sebab, menjana bukti baharu dan mengesahkan akuan semula. PIC membuka perbandingan snapshot, menyemak kiraan, pautan unit dan versi bukti, kemudian mengesahkan lengkap. |
| 19–23 | PPSK | Sahkan MFA pada akaun berasingan, lihat penapis Menunggu PPSK dan daftar latihan. Buka invois, sahkan satu UUID dikenakan RM50 dan jalankan rekonsiliasi tiruan. |
| 23–25 | Pemohon | Pilih Semak status terkini. Semak rujukan dan keputusan rekonsiliasi. Pengendali menjalankan semakan API replay melalui suite latihan. |

## Matriks UAT · jangkaan dan dapatan

| Semakan | Jangkaan | Bukti pemeriksaan |
| --- | --- | --- |
| Akses mudah alih dan papan kekunci | Langkah dan panel dapat digunakan pada lebar 320/390 px | Playwright memeriksa lebar panel, fokus, langkah aktif dan perbandingan yang boleh dibuka. |
| Polisi dan pengesahan akuan | Paparan polisi menggunakan fakta simpanan. Bukti gagal dan cap jari lama menyekat serahan. | Vitest dan API memeriksa status skop, kategori tidak berkaitan, cap jari, serta penolakan semula selepas perubahan polisi. Kit berpolisi tersuai lulus dalam Chromium. |
| Penugasan dan perbandingan | Carian/paginasi terhad kepada identiti dan daerah. Perbandingan ialah snapshot terkunci. | API memeriksa hasil kosong/404 silang daerah, penolakan pemohon dan serahan diganti, serta penapisan awalan. Ujian Chromium membandingkan dua versi dan inventori tingkat. |
| Wakil dan snapshot | Kuasa sah boleh menggunakan peranan sedia ada. Kuasa luput atau ditarik ditolak. | Ujian kit mengesahkan kedua-dua senario. Audit serahan merekod peranan Wakil syarikat yang sebenar. |
| Pembetulan, invois dan callback | Serahan semula mendapat resit baharu. Satu UUID merentasi dua tingkat dicaj sekali. Replay menghasilkan satu rekonsiliasi. | Kit Chromium melengkapkan aliran hingga paparan pemohon. API dan Vitest memeriksa replay serentak, amaun salah dan deduplikasi unit. |
| Pemulihan dan CI | Job API, Chromium penuh dan kit mempunyai DB sendiri. Pulih ke DB kosong. | Workflow sintetik mengasingkan ketiga-tiga job. Skrip restore membandingkan snapshot, bukti, keputusan, invois, rekonsiliasi dan pencetus. |

Ujian awal kit mengesan paparan perbandingan yang berhenti pada mesej fallback walaupun API mengembalikan perbandingan sah. Paparan diperbetulkan dan larian kit berpolisi tersuai lulus semula. Potongan bukti dihadkan kepada panel latihan, di luar halaman log masuk dan fail kit.

## Ukuran dan gerbang

Satu larian Chromium pada Cloud Environment merekod API draf 21–75 ms (8 sampel), senarai pegawai 27–55 ms (10), perbandingan 28 ms (1) dan masa navigasi UI pemohon/PIC/PPSK 779/891/663 ms. Bundle binaan Vite ialah 472.12 kB ketika mula, 42.78 kB untuk Dashboard, 197.89 kB untuk Premis dan 1,059.32 kB untuk peta lazy. Perbandingan dan invois diambil atas permintaan. Applicant reuse inventori/bukti dalam semakan kesiapsiagaan. Angka ini menggunakan fixture kecil tanpa SLA atau ujian beban.

Staging memerlukan keputusan MBSP tentang dokumen, akuan, peruntukan/kawasan dan pemisahan tugas, rujukan rasmi, storan/pengimbas, retensi/legal hold dan MBSPPay. Penilaian peta pada peranti sebenar masih tertunggak. Komponen ini menggunakan konfigurasi, skema dan kebenaran latihan yang sedia ada. Jejak keputusan, audit dan kelulusan perlu disemak berasingan sebelum perubahan gerbang rasmi. [Laporan pra-staging](PRESTAGING-ASSURANCE.md)
