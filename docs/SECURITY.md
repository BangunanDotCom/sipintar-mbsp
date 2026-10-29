# Keselamatan dan sempadan penggunaan

## Kawalan yang dilaksanakan

- Argon2id; panjang kata laluan 12–128 aksara dengan kategori huruf/nombor/simbol.
- Token rawak 256 bit; database menyimpan hash sesi dan token aktivasi, bukan token asal.
- Cookie `HttpOnly`, `SameSite=Strict`, `Secure` apabila `NODE_ENV=production`; tempoh sesi lapan jam.
- Mutasi sesi memerlukan header `Origin` tepat dan `X-CSRF-Token` sepadan hash sesi. Login/daftar/aktivasi/pemulihan mempunyai rate limit tersendiri.
- 10 permintaan per 15 minit bagi endpoint pengesahan sensitif; had umum 120/minit mengikut alamat sambungan.
- TOTP SHA-1 6 digit, 30 saat, tetingkap ±1 step, penolakan penggunaan semula step, recovery codes hash sekali guna.
- Rahsia faktor TOTP dan payload outbox menggunakan AES-256-GCM, IV rawak dan tag integriti.
- MFA wajib untuk akaun jenis OFFICER sebelum dashboard dan tindakan perniagaan.
- Kebenaran daripada database, satu peranan aktif, tarikh pelantikan dan skop daerah; IDOR syarikat/dokumen ditolak.
- Zod, ORM/parameter query; tiada pembinaan SQL daripada input bebas.
- Helmet pada API; React mengenkod output teks, tiada `dangerouslySetInnerHTML` untuk templat.
- PDF peribadi maksimum 2 MiB; nama tanpa pemisah laluan, tandatangan `%PDF-`, muat turun sebagai attachment.
- Reset MFA, penggantungan dan penukaran kata laluan membatalkan sesi. Audit untuk tindakan penting, login dan penolakan permission.
- Pautan aktivasi luput satu jam; conditional transaction menghalang penggunaan token serentak.

## Had semasa yang perlu dinilai ICT

Ini asas keselamatan aplikasi, bukan keputusan penetration test atau pensijilan. Sebelum produksi:

1. Gunakan HTTPS dan HSTS pada proksi, polisi CSP untuk fail frontend, domain/origin rasmi, SMTP TLS serta secret manager. Kod API menggunakan loopback; Vite ialah pelayan pembangunan sahaja.
2. Tentukan konfigurasi trusted proxy berdasarkan IP/hop proksi sebenar. Kod sengaja tidak mempercayai semua `X-Forwarded-For`; rate limiter in-memory perlu store berpusat jika menggunakan beberapa proses.
3. Jadikan audit append-only melalui role database, collection luar host dan retention diluluskan. Aplikasi kini tidak mempunyai UI/API meminda audit, tetapi pemilik database boleh memindanya.
4. Tambah antivirus/quarantine, pemeriksaan PDF mendalam, object storage dan polisi dokumen sebelum menerima fail awam sebenar. Tandatangan fail sahaja tidak membuktikan PDF bebas malware.
5. Lakukan review ancaman, pentest, semakan akses, load test, aksesibiliti formal dan ujian pemulihan bencana. Ujian automatik projek tidak menggantikan UAT.
6. Tetapkan polisi privasi/retention, domain e-mel pegawai dibenarkan, proses bukti pelantikan rasmi dan SOP pemulihan identiti. Input “sebab” bukan bukti identiti dengan sendirinya.
7. Tamatkan/musnahkan sesi luput, token luput dan log mengikut polisi; cleanup berkala belum dijadualkan.
8. Putaran kunci AES perlu proses re-encryption/versi kunci; mekanisme putaran automatik belum tersedia.
9. Semakan silang jabatan dan pemisahan tugas dokumen rasmi wajib dilaksanakan apabila data kes Fasa 2 wujud. Dalam Fasa 1, tiada approval permohonan yang boleh dilaksanakan.

## Pelaporan

Jangan masukkan token, kata laluan, kod MFA, recovery codes atau dokumen peribadi dalam audit/isu. Log request automatik dimatikan supaya query pautan aktivasi tidak direkod. Proksi dan pelayan frontend juga perlu menapis query token daripada access logs. Kegagalan dalaman API memberikan mesej umum, bukan stack trace.
