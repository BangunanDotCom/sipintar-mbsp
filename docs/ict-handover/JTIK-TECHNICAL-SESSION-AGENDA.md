# Agenda penyelarasan teknikal JTIK — STAYLink MBSP

**Status:** draf agenda, untuk sesi semakan sebelum pemasangan; bukan minit mesyuarat atau kelulusan.

**Tujuan mesyuarat:** memilih persekitaran latihan, mengesahkan sempadan keselamatan dan menentukan langkah memasang demo selepas kebenaran bertulis.

| Minit | Perkara | Hasil keputusan yang perlu dicatat |
| --- | --- | --- |
| 0–10 | Latar belakang Demo Release 1.0, aliran pengguna dan sempadan simulasi | JTIK maklum bahawa data, bukti dan bayaran adalah sintetik |
| 10–25 | Pilihan hos Linux/Nginx atau Windows/IIS | OS, VM, akaun servis, pengendali dan pemilik operasi |
| 25–40 | DNS, HTTPS/TLS, VPN, firewall dan peta | Nama akses dalaman, sijil, akses peserta, dasar peta |
| 40–50 | PostgreSQL latihan, Mailpit, secrets, ACL, log dan backup | Lokasi, retensi, pemulihan dan kawalan akses |
| 50–60 | Ujian pemasangan, risiko, jadual dan pemegang kuasa | Tarikh cadangan, senarai prasyarat dan pemilik tindakan |

## Bahan rujukan
- `PRE-JTIK-COMPLETE-PACK.md`: status siap dan baki gerbang
- `JTIK-DECISION-AND-UAT-READINESS.md`: rekod keputusan teknikal
- `deploy/demo/README.md`: langkah pemasangan terkawal Linux/IIS
- `UAT-SESSION-WORKSHEET.md`: borang UAT pegawai
- Draft PR #63 dan larian CI bagi SHA calon yang dibentangkan

## Rekod tindakan

| Bil | Keputusan / tindakan | Pemilik | Tarikh sasaran | Status |
| --- | --- | --- | --- | --- |
| 1 | Pilihan hos dan OS | JTIK | | Belum diputuskan |
| 2 | DNS/TLS/rangkaian dan peta | JTIK | | Belum diputuskan |
| 3 | Akaun servis, DB latihan, Mailpit, ACL dan backup | JTIK | | Belum diputuskan |
| 4 | Pemeriksaan keselamatan serta ujian hos Windows jika berkenaan | JTIK dan pasukan teknikal | | Belum dilaksanakan |
| 5 | Penetapan fasilitator, peserta dan jadual UAT | Jabatan Bangunan | | Belum ditetapkan |

**Nota:** Penerimaan UAT, keputusan dasar MBSP-01..08 dan kebenaran produksi tidak boleh dianggap diluluskan melalui mesyuarat teknikal ini.
