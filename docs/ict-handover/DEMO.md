# Skrip fasilitator UAT STAYLink MBSP

**Masa sesi 20–25 minit.** Gunakan penyemak imbas dengan tiga profil berasingan untuk pemohon, PIC dan PPSK. Gunakan bahan latihan ini dalam persekitaran tempatan sahaja.

## Sediakan sesi

1. Sediakan PostgreSQL loopback baharu bernama `staylink_issue40_demo_test` untuk Issue #40 atau `staylink_issue36_demo_test` untuk Issue #36 dan Mailpit tempatan. Tetapkan `DATABASE_URL` dan `TEST_DATABASE_URL` pada URL yang sama dengan hos `127.0.0.1:5432`.
2. Isikan `MFA_ENCRYPTION_KEY` dan `IDENTITY_DATA_KEY` dengan dua nilai rawak 32 bait berasingan untuk latihan. Tetapkan `SMTP_HOST=127.0.0.1`, `SMTP_PORT=1025`, `STAYLINK_DOCUMENT_STORE=disabled`, `STAYLINK_LOCAL_DOCUMENT_STORE_ENABLED=false` dan `STAYLINK_CLAMAV_ENABLED=false`.
3. Jalankan arahan berikut selepas pemasangan dan penjanaan Prisma.

   ```bash
   export NODE_ENV=development STAYLINK_SYNTHETIC_PORTAL=true
   npm run db:test:migrate
   npm run db:seed
   npm run db:uat-demo
   ```

4. Penyedia fixture menyemak nama DB sebenar sebelum menulis data. Ia memaparkan laluan direktori persendirian sementara. Fail `accounts.json` mengandungi tiga akaun `@example.test`, kata laluan sementara, kunci TOTP pegawai, laluan semakan draf dan jumlah jangkaan dalam sen. Fail `portal.env` mengandungi tetapan pegawai dan kunci callback tempatan. Kedua-dua fail dicipta dengan mod `0600`. Simpan bersama fasilitator dan kecualikan daripada rakaman, tangkap layar dan laporan.
5. Sumberkan fail `portal.env` yang dijana dalam terminal yang sama, kemudian jalankan `npm run dev`. Gunakan `http://localhost:5173` dan kod TOTP enam digit daripada pengesah berasaskan masa 30 saat untuk profil PIC dan PPSK. Pilih peranan masing-masing dalam portal. Pemohon menggunakan peranan Pemohon dan membuka laluan dari fail latihan.

## Dataset

| Atribut | Nilai latihan |
| --- | --- |
| Kapasiti | Individu, akaun `@example.test` yang unik bagi sesi |
| Premis | Premis Latihan Maya · lot UAT-36 · daerah latihan SPU |
| Unit fizikal | Kedai Latihan A, satu UUID merentasi Tingkat Bawah dan Tingkat 1 |
| Inventori | 2 tingkat, 2 bilik, 4 pekerja, 100 m² keseluruhan |
| Bukti | Dua versi semasa kategori susun atur tingkat, dijana sebagai metadata tiruan |
| Amaun | 1 unit × RM50 = 5,000 sen (MYR) |
| Peranan | PIC dan PPSK mempunyai ID berbeza dan peruntukan latihan SPU |

## Laluan demonstrasi

| Minit | Pelaku | Tindakan dan hasil |
| --- | --- | --- |
| 0–5 | Pemohon | Buka semakan draf. Semak unit tunggal dan kedua-dua pautan tingkat. Pilih Gagal (FAILED), jana bukti dan tunjukkan serahan disekat. Pilih Lulus (CLEAN) dan jana semula. Semak teks akuan, tandakan persetujuan dan serah. Catat ID resit latihan. |
| 5–10 | PIC | Buka Tugasan semakan sintetik dan tapis Perlu tindakan. Semak versi bukti, inventori dan nasihat AI tiruan. Minta pembetulan dengan alasan “Sahkan susun atur Kedai Latihan A.” |
| 10–15 | Pemohon | Muat semula draf dan baca alasan. Jana bukti versi baharu atau simpan suntingan yang relevan. Sahkan akuan sekali lagi dan serah pembetulan. Rujukan serahan versi baharu muncul. |
| 15–20 | PIC dan PPSK | PIC membuka resit baharu dan mengesahkan kelengkapan dengan alasan. PPSK yang berasingan mengesahkan status dan mendaftar keputusan latihan. Rujukan bermula dengan `SYNTHETIC-`. |
| 20–25 | PPSK dan pemohon | PPSK buka butiran, jana invois dan rekonsiliasi tiruan. Semak 1 unit fizikal dan RM50. Pemohon memuat semula untuk menyemak status rekonsiliasi. Butang serahan rasmi masih dinyahaktifkan. |

## Senarai semak penerimaan

- [ ] Sesi berasingan untuk tiga pelaku dan MFA pegawai disahkan.
- [ ] Pada lebar 320 px dan 390 px, status, label, bukti dan ID panjang boleh dibaca. Kawalan utama boleh dicapai melalui papan kekunci.
- [ ] Bukti PENDING, FAILED atau INFECTED menyekat serahan dan tiada pautan objek ditunjukkan. Bukti CLEAN mengembalikan kesiapsiagaan jika inventori lengkap.
- [ ] Akuan diminta semula selepas perubahan versi. Resit lama kekal dalam sejarah dan resit baharu berbeza.
- [ ] PIC boleh meminta pembetulan atau mengesahkan kelengkapan. PPSK mendaftar selepas pengesahan PIC yang berasingan.
- [ ] Nasihat tiruan dibezakan daripada keputusan manusia. Bukti yang tidak lagi layak menyekat tindakan seterusnya.
- [ ] Invois memerlukan keputusan berdaftar. Dua tingkat tetap dikira sebagai satu unit. Callback ulangan menghasilkan satu rekonsiliasi.
- [ ] Silang pemohon, kuasa wakil ditarik, MFA tiada, versi lapuk dan Origin/CSRF ditolak dalam suite automatik. Periksa pautan bukti ujian.
- [ ] Semua paparan, amaun dan rujukan demonstrasi dilabel latihan. Sahkan operasi rasmi masih tertutup.

Catat tarikh MYT, commit, pelaku, langkah, hasil dijangka, hasil sebenar dan rujukan bukti. Gunakan ID resit latihan untuk triage. Jika status tidak bergerak, muat semula dan semak versi serta kelayakan bukti. Jika had permintaan dicapai, tunggu tempoh `Retry-After` sebelum mencuba lagi.
