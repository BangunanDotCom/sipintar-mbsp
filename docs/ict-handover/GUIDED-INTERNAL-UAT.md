# Panduan pelaksanaan UAT dalaman STAYLink MBSP

Gunakan panduan ini untuk menyediakan sesi berpandu Jabatan Bangunan dengan data sintetik. Alias dan akaun latihan boleh digantikan bagi setiap sesi. Rekod UAT pegawai dan keputusan penerimaan diurus oleh pemilik proses dalam [pakej penerimaan](GUIDED-UAT-ACCEPTANCE.md).

## Peranan sesi

| Peranan sesi | Tanggungjawab dan akses |
| --- | --- |
| Pengendali ICT | Menyediakan PostgreSQL, Mailpit, kunci latihan, kit, pemeriksaan awal dan aplikasi loopback. Menjaga fail yang mengandungi kelayakan. |
| Fasilitator Jabatan Bangunan | Menyemak SHA, tarikh MYT, polisi dan susunan senario. Memberi setiap peserta akses latihan yang diperlukan serta merekod keputusan, isu, ujian semula dan semakan. |
| Peserta pemohon | Menggunakan profil pelayar tersendiri untuk draf, bukti, akuan, pembetulan dan status invois. |
| Peserta PIC dan PPSK | Menggunakan profil pelayar dan faktor MFA berasingan untuk semakan dan pendaftaran. Akaun PIC SPT disediakan untuk semakan batas kawasan tambahan. |
| Penyemak dalaman | Menyemak hasil dan rujukan ujian semula secara bebas. Keputusan penerimaan Jabatan Bangunan memerlukan pemegang kuasa dan rekod berasingan. |

## Sediakan satu DB untuk satu sesi

1. Gunakan checkout yang diluluskan untuk UAT dan Node.js 22. Jalankan `npm ci` dan `npm run db:generate`. Sediakan PostgreSQL tempatan pada `127.0.0.1:5432` serta Mailpit pada `127.0.0.1:1025` (SMTP) dan `127.0.0.1:8025` (web). Semak perkhidmatan daripada shell pengendali.
2. Cipta DB kosong baharu seperti `staylink_issue58_sesi01_test` dengan peranan DB latihan setempat. Tetapkan nilai `DATABASE_URL` dan `TEST_DATABASE_URL` kepada URL yang sama. Bekalkan `MFA_ENCRYPTION_KEY` dan `IDENTITY_DATA_KEY` berasingan daripada penyimpanan rahsia latihan setempat. Elakkan mencetak URL, kunci atau kandungan kit.
3. Tetapkan pemboleh ubah di bawah. Gunakan polisi sintetik asal untuk skrip ini. Jika pengendali menggunakan polisi latihan tersuai, kekalkan nilai JSON yang sama dari penjanaan hingga pelaksanaan dan rekod versi serta cap jari yang dilaporkan. Pemeriksaan kit menyekat perubahan walaupun nama versi kekal sama.
4. Jalankan arahan dalam shell yang sama dari checkout. `empty` memerlukan DB baharu sebelum migrasi. `kit` memerlukan kit asal dengan empat akaun, enam draf, MFA, tugasan dan fixture yang sepadan. Kedua-dua pemeriksaan membaca data secara setempat. Jika gagal, berhenti dan betulkan sebab yang tertera sebelum meneruskan.

```bash
set -e
export NODE_ENV=development APP_ORIGIN=http://localhost:5173
export STAYLINK_SYNTHETIC_PORTAL=true
export STAYLINK_DOCUMENT_STORE=disabled STAYLINK_LOCAL_DOCUMENT_STORE_ENABLED=false
export STAYLINK_CLAMAV_ENABLED=false STAYLINK_DOCUMENT_SCAN_BATCH_ENABLED=false
export SMTP_HOST=127.0.0.1 SMTP_PORT=1025 SMTP_PRODUCTION_ENABLED=false
unset SMTP_USER SMTP_PASSWORD SMTP_SECURE MAIL_FROM
unset STAYLINK_SYNTHETIC_PIC_ID STAYLINK_SYNTHETIC_SUPERVISOR_ID
unset STAYLINK_SYNTHETIC_CALLBACK_KEY STAYLINK_SYNTHETIC_DISTRICT
umask 077

npm run uat:preflight -- empty
npm run db:test:migrate
npm run db:seed
kit="$(npm run --silent db:uat-demo | sed -n 's/^Kit latihan ditulis ke //p')"
test -n "$kit" && test -f "$kit/portal.env"
node --env-file="$kit/portal.env" scripts/uat-preflight.mjs kit --kit "$kit"
```

Jalankan hanya selepas kedua-dua pemeriksaan lulus. `--env-file` membaca pemboleh ubah kit tanpa menjalankan fail sebagai skrip.

```bash
node --env-file="$kit/portal.env" node_modules/concurrently/dist/bin/concurrently.js -k \
  'npm:dev:api' 'vite --config apps/web/vite.config.ts --host 127.0.0.1 --strictPort'
```

Buka `http://localhost:5173` pada hos latihan sahaja. Pengendali menyimpan `accounts.json`, `portal.env` dan `preflight.json` dalam direktori kit berizin 0700 dengan fail 0600. Beri peserta hanya kelayakan alias mereka melalui kaedah setempat yang dikawal. Jika berhenti atau menukar polisi, kekalkan DB serta rekod lama dan mulakan sesi baharu pada nama DB lain. Gunakan `kit` sebelum log masuk pertama. Kit yang sudah digunakan perlu kekal sebagai rekod sesi asal.

## Skrip teras 25 minit

| Minit | Pelaku | Tindakan dan jangkaan |
| --- | --- | --- |
| 0–5 | Pemohon | Log masuk dengan profil pemohon. Pilih draf `single-unit`. Semak satu unit pada dua tingkat, inventori dan keperluan dokumen. |
| 5–9 | Pemohon | Cuba FAILED dan sahkan serahan disekat. Jana CLEAN, semak akuan latihan, serah dan catat rujukan bukti. |
| 9–14 | PIC SPU | Log masuk dengan MFA. Cari awalan ID menggunakan papan kekunci. Semak nasihat AI tiruan dan minta pembetulan dengan sebab. |
| 14–19 | Pemohon dan PIC SPU | Baca sebab, perbaharui bukti dan akuan, serah semula. PIC membandingkan snapshot dan menentukan kelengkapan. |
| 19–23 | PPSK SPU | Sahkan MFA, daftar serahan latihan, jana invois RM50 bagi satu UUID unit walaupun pada dua tingkat dan jalankan rekonsiliasi tiruan. |
| 23–25 | Pemohon dan fasilitator | Semak rujukan dan status invois. Fasilitator rekod hasil, isu dan semakan susulan. Gunakan regresi API untuk replay callback dan satu catatan rekonsiliasi. |

## Pusingan pengesahan enam senario

| ID kit | Tugas peserta | Jangkaan |
| --- | --- | --- |
| `single-unit` | Lengkapkan aliran teras | Satu UUID, dua tingkat, RM50 dan status direkonsiliasi dalam simulasi. |
| `multiple-units` | Serah selepas CLEAN, sah lengkap, daftar dan jana invois | Dua UUID menghasilkan RM100. Unit kedua pada tingkat tambahan dikira sekali sahaja. |
| `failed-evidence` | Buka draf FAILED dan cuba serah | Mesej menerangkan halangan dan pelayan menolak tindakan. |
| `company-active` | Pilih Wakil syarikat dengan kuasa aktif. Buka draf dan jana bukti | Draf dan tindakan yang dibenarkan tersedia dalam kapasiti tersebut. |
| `company-expired` | Cuba buka draf kuasa luput dalam kapasiti Wakil syarikat | Akses ditolak. Ujian regresi menambah kes kuasa ditarik balik. |
| `district-spt` | Pemohon serah draf SPT. PIC SPU mencari serahan dalam skopnya | Senarai SPU tidak memaparkan kes SPT. Percubaan akses perbandingan terus ditolak. |

Ikut [panduan rekod Issue #54](UAT-FEEDBACK-TRIAGE.md) untuk memulakan sesi maklum balas dengan `NODE_ENV=development STAYLINK_UAT_FEEDBACK=true`. Rekod PASS, FAIL atau BLOCKED bagi setiap senario, dan gunakan ID seperti `ADD-papan-kekunci` untuk pemerhatian tambahan. Catat keterukan, langkah mengulang, ID bukti dan rujukan isu. Tugaskan pembetulan, simpan SHA serta ujian regresi, kemudian jalankan ujian semula dengan penguji dan penyemak berasingan. Eksport Markdown untuk semakan/cetakan dan CSV untuk menapis dapatan. Kedua-duanya menyertakan sejarah versi. Markdown menyertakan ringkasan liputan, keterukan belum disahkan dan borang pengesahan kosong. Semak redaksi sebelum mengedarkan. Gunakan bukti setempat yang diluluskan dan rujukan `EV-*` sahaja dalam eksport dan penjejak isu.

## Pemerhatian aksesibiliti dan prestasi

- Dengan Tab, Shift+Tab, Enter dan Space, jalankan log masuk, pemilih langkah, carian PIC, alasan, butiran invois dan mesej konflik. Catat fokus yang hilang, unsur yang tidak boleh dicapai dan status yang sukar difahami.
- Semak pada 320 px dan 390 px. Cari limpahan mendatar, label terpotong, tindakan yang terlindung dan sasaran sentuhan sempit. Ulang pada peranti sasaran sebenar dan dengan pembaca skrin jika tersedia.
- Catat peranti, pelayar, lebar, masa, keadaan rangkaian dan sampel masa muat peta. Cuba pemulihan apabila peta lambat atau tidak boleh digunakan. Semak koordinat, papan kekunci dan penyimpanan draf. Vite masih memberi amaran saiz chunk peta lazy. Hasil fixture kecil dan masa pemerhatian bukan SLA yang diluluskan.
- Semak teks, kontras dan susunan pada tema navy dan emas. Catat senario, bukti dan keterukan dalam sesi yang sama.
