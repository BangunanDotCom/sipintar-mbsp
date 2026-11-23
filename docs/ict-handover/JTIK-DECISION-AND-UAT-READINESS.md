# Borang Penyelarasan JTIK — STAYLink MBSP Demo Release 1.0

**Tujuan:** Rekod keputusan teknikal untuk hos **latihan dalaman sahaja** sebelum sebarang pemasangan. Borang ini bukan permohonan produksi atau kebenaran pemasangan automatik.

**Rujukan:** Surat Jabatan Bangunan kepada JTIK (nombor/tarikh diisi oleh jabatan); Issue #62; Draft PR #63; SHA calon daripada manifest keluaran yang disertakan.

| Keputusan JTIK | Butiran / pilihan yang perlu direkodkan | Pengesahan |
| --- | --- | --- |
| Hos dan pemilik operasi | Nama aset/VM, OS dan versi, pengendali, tarikh sedia | Belum diputuskan |
| Pilihan web server | Linux/Nginx **atau** Windows Server/IIS + URL Rewrite/ARR | Belum diputuskan |
| Sumber | vCPU, RAM, ruang, had pengguna serentak; sizing cadangan awal 2 vCPU/4 GB/20 GB **bukan** jaminan | Belum diuji |
| Nama akses | FQDN dalaman, DNS, binding HTTPS dan sijil; akses MBSP/VPN sahaja | Belum diputuskan |
| Port dan firewall | Hanya HTTPS kepada peserta; API 3001, PostgreSQL 5432, SMTP 1025 dan Mailpit 8025 kekal loopback | Belum disahkan |
| Akaun servis | Identiti servis minimum, hak akses folder, pengurus proses, restart, log dan secrets | Belum diputuskan |
| Data latihan | PostgreSQL kosong baharu `staylink_issue62_<sesi>_test`, akses minimum, tiada data sebenar | Belum disahkan |
| E-mel latihan | Mailpit setempat tanpa relay/forwarding keluar; akaun `@example.test` sahaja | Belum disahkan |
| Peta | Sahkan sama ada peta luar dibenarkan; jika tidak, gunakan fallback/input koordinat dan rekod batas | Belum diputuskan |
| Windows khusus | Uji URL Rewrite, ARR, ACL NTFS, servis Windows, cookie/CSRF dan fallback SPA pada hos sebenar | Belum diuji |
| Sandaran | Retensi, pemilik backup, lokasi storan, ujian restore DB latihan, RPO/RTO | Belum diputuskan |
| Keselamatan | Semakan TLS, CSP, Origin, log tanpa rahsia, MFA pegawai, akses admin, ujian pengasingan peranan | Belum disahkan |
| Jadual | Tarikh semakan bersama, tetingkap perubahan dan pelan rollback | Belum diputuskan |

## Keputusan peringkat

- [ ] **A.** JTIK menerima pakej untuk semakan teknikal sahaja.
- [ ] **B.** JTIK meluluskan hos latihan dan pemasangan terkawal (rekod kelulusan/tarikh/pegawai).
- [ ] **C.** Ujian hos dan keselamatan lulus (bukti berasingan).
- [ ] **D.** Jabatan Bangunan meluluskan pelaksanaan sesi UAT pegawai (bukan produksi).

**Catatan / syarat JTIK:** ____________________________

**Pegawai JTIK / tarikh:** ____________________________

**Wakil Jabatan Bangunan / tarikh:** ____________________________

## Pelan UAT selepas hos diluluskan

**Sesi 1 — Pemeriksaan teknikal bersama JTIK:** sahkan SHA, DNS/TLS, health endpoint, DB latihan kosong, Mailpit, akses terhad, log, backup/restore, cookie dan MFA. Rekod PASS/FAIL/BLOCKED.

**Sesi 2 — UAT pegawai Jabatan Bangunan:** enam akaun latihan berasingan, enam senario berpandu dalam `GUIDED-INTERNAL-UAT.md`, fi tiruan RM50/unit fizikal, pembetulan, semakan PIC, pendaftaran PPSK dan notifikasi. Gunakan pelayar desktop dan telefon sebenar. Rekod isu dan retest dalam `UAT-FEEDBACK-TRIAGE.md`.

**Sesi 3 — Penilaian penerimaan:** semak hasil sebenar, risiko terbuka, bukti ujian Windows jika dipilih, kelulusan dasar MBSP-01..08 dan tandatangan penerimaan Jabatan Bangunan. **Tiada pengaktifan produksi.**

## Batas penting

CI Linux/Nginx dan semakan XML IIS **tidak** membuktikan IIS/ARR/ACL atau Windows Service pada pelayan MBSP. Ujian empat akaun dalam satu larian tidak membuktikan kapasiti 20–30 pengguna serentak. Fail binari dan storan dokumen sebenar kekal tidak aktif dalam hos demo; hanya metadata bukti sintetik digunakan. Semua keputusan keselamatan dan pemasangan tertakluk kepada JTIK. Jangan merge `main`, deploy, membuat kos baharu, menggunakan data sebenar atau mengubah Worker `dashboard-bangunan-mbsp` tanpa kelulusan khusus.
