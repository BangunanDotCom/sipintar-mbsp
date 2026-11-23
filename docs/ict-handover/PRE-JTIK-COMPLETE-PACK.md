# STAYLink MBSP — Pakej persediaan lengkap sebelum kelulusan pelayan JTIK

**Tujuan:** menghabiskan kerja pembangunan, dokumentasi dan penyelarasan UAT yang **tidak memerlukan pelayan MBSP**. Status dokumen: **untuk semakan**, bukan kelulusan hos, UAT atau produksi.

## 1. Manifest keluaran terkawal
- Repositori: `BangunanDotCom/sipintar-mbsp`
- Cabang: `issue-62-demo-release-readiness`; Draft PR #63 berasaskan `issue-58-facilitator-handover`, **bukan `main`**
- Baseline CI yang disahkan sebelum dokumen ini: `6c8b248c51596ef179134485d41706626f8371fe`, workflow run `45141136038` (lima job success).
- **Penting:** commit dokumentasi selepas baseline belum boleh dianggap telah diuji sehingga workflow baharu berjaya. Rekod SHA akhir, URL CI, versi runtime dan checksum ZIP sebenar ketika serahan.
- Sumber utama: `deploy/demo/README.md`, `docs/DEPLOYMENT.md`, `docs/ict-handover/DEMO-RELEASE-1-JTIK-HANDOVER.md`.

## 2. Kerja yang boleh dimuktamadkan sekarang

| Bil | Deliverable | Lokasi bukti / tindakan | Gerbang |
| --- | --- | --- | --- |
| 01 | Linux/Nginx HTTPS, service dan konfigurasi latihan | `deploy/demo/linux/`, `scripts/rehearse-demo-host.sh` | CI Linux; semak semula pada SHA akhir |
| 02 | Windows/IIS dan pelancar API | `deploy/demo/windows/` | XML disemak; ARR, ACL, servis Windows **belum** diuji pada hos Windows |
| 03 | Preflight fail-closed, DB latihan dan e-mel Mailpit | `scripts/demo-host-readiness.mjs`, `scripts/uat-preflight.mjs` | Perlu pengesahan host sebenar sebelum pasang |
| 04 | Ujian sintetik automatik dan restore | `.github/workflows/staylink-synthetic-uat.yml` | Semak run pada SHA akhir |
| 05 | Skrip penguji enam senario | `GUIDED-INTERNAL-UAT.md` dan `UAT-SESSION-WORKSHEET.md` | Sedia sebagai templat; belum diisi pegawai |
| 06 | Rekod isu dan retest | `UAT-FEEDBACK-TRIAGE.md` | Dapatan sebenar hanya selepas UAT |
| 07 | Gerbang penerimaan dan dasar | `GUIDED-UAT-ACCEPTANCE.md`, `OWNER-DECISION-PACK.md` | MBSP-01..08 kekal tertakluk keputusan |
| 08 | Soalan/keputusan JTIK | `JTIK-DECISION-AND-UAT-READINESS.md` | Belum diputuskan JTIK |
| 09 | Kit pembentangan dan agenda mesyuarat | `JTIK-TECHNICAL-SESSION-AGENDA.md` | Boleh diserah sebelum hos diluluskan |

## 3. Senarai kerja yang **tidak boleh ditandakan siap**

- Pemasangan ke VM/pelayan MBSP, DNS sebenar, sijil TLS sebenar, firewall, pengurus servis dan ACL sebenar.
- Pengesahan IIS/ARR dan Windows Service pada hos Windows jika JTIK memilih Windows.
- Pengujian akses pelayar pada rangkaian MBSP/VPN, kapasiti pengguna serentak sebenar dan prestasi peranti sebenar.
- Sesi UAT pegawai, penerimaan Jabatan Bangunan, kelulusan JTIK dan keputusan MBSP-01 hingga MBSP-08.
- Pengaktifan storan dokumen binari, MBSPPay, SSO, nombor rasmi, e-mel produksi dan data sebenar.

## 4. Pintu masuk pemasangan selepas kelulusan JTIK

1. JTIK merekodkan kelulusan hos latihan, pemilik operasi, OS, DNS/TLS, port, akaun servis, dasar log/backup dan tarikh kerja.
2. Penyemak teknikal mengesahkan SHA keluaran, status PR, semua job CI, semakan rahsia, templat dan keputusan ujian.
3. Operator menyediakan DB kosong **baharu** dan kit sintetik mengikut `deploy/demo/README.md`, lalu menjalankan preflight **sebelum** migrasi.
4. Operator memasang melalui tetingkap perubahan yang diluluskan; menguji health, TLS, MFA, cookies, pengasingan daerah, Mailpit, restore dan rollback.
5. Fasilitator menjalankan enam senario dan rekod PASS/FAIL/BLOCKED pada `UAT-SESSION-WORKSHEET.md`. Isu blocker/high mesti diperbaiki dan diuji semula secara bebas.
6. Penerimaan Jabatan Bangunan ditandatangani **selepas** ujian sebenar. Produksi memerlukan kelulusan berasingan.

## 5. Pengurusan dokumen dan pengesahan

Gunakan alias latihan dan rujukan bukti `EV-*`; jangan memasukkan kata laluan, OTP/TOTP, fail identiti, nama pemohon sebenar atau token dalam GitHub/ZIP. Kelayakan kit diserahkan secara berasingan dan disimpan di lokasi privat yang dikawal. Simpan salinan bertandatangan di repositori rekod dalaman yang diluluskan, **bukan** repositori kod awam.

**Batas kuasa:** tiada merge `main`/`staylink-mbsp-phase1`, deploy, perubahan infra, kos, data sebenar atau perubahan Cloudflare Worker `dashboard-bangunan-mbsp` tanpa kebenaran khusus.
