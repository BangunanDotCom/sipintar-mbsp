# Pakej penerimaan dan keputusan pemilik STAYLink MBSP

Gunakan dokumen ini bersama [panduan pelaksanaan UAT](GUIDED-INTERNAL-UAT.md), eksport maklum balas dan [pakej keputusan Issue #54](OWNER-DECISION-PACK.md). Cetak Markdown atau simpan salinan di tempat terkawal. Isi ruangan pengesahan hanya selepas bukti untuk peringkat berkenaan disemak.

## Senarai semak penerimaan

- [ ] Catat SHA checkout, ID sesi, tarikh MYT, versi dan cap jari polisi, ID DB latihan dan pemegang peranan.
- [ ] Lampirkan keputusan preflight `empty` dan `kit`, kiraan ujian, rujukan GitHub Actions, laporan audit dan bukti latihan restore.
- [ ] Penuhi enam senario atau catat sebab BLOCKED/belum diuji. Catat pemerhatian papan kekunci, 320/390 px, peta dan peranti sebenar.
- [ ] Tapis dapatan belum disahkan. Setiap blocker/high perlu penanggungjawab, tindakan dan bukti ujian semula bebas atau keputusan eskalasi.
- [ ] Padankan isu → ujian regresi → SHA pembetulan → bukti ujian semula. Pastikan semakan dibuat terhadap binaan yang diterima.
- [ ] Semak laporan dan rujukan bukti untuk data peribadi, kelayakan dan tangkap layar sensitif sebelum perkongsian. Rekod nama dan tandatangan rasmi pada salinan terkawal.
- [ ] Isi keputusan dan sekatan pada peringkat yang diluluskan. Rujuk minit dan pemegang kuasa bagi sebarang keputusan dasar atau kebenaran operasi.

| Peringkat dan pemilik bukti | Bukti yang perlu disemak | Keputusan dan tarikh MYT | Rujukan, nama dan tandatangan |
| --- | --- | --- | --- |
| CI · ICT | SHA, suite tempatan/hos, audit dan restore | | |
| Demo teknikal · ICT | Preflight, kit, hasil sintetik, liputan dan risiko | | |
| Pelaksanaan UAT sebenar · Fasilitator Jabatan Bangunan | Kehadiran, pelaksanaan peserta, hasil setiap senario dan laporan triage | | |
| Penerimaan jabatan · Pemilik Jabatan Bangunan | Dapatan dan pengecualian, hasil ujian semula, minit dan penerimaan bertandatangan | | |
| Kelulusan staging · ICT dan pemilik sistem | Sempadan, penilaian keselamatan, pemulihan, sokongan dan kebenaran bertulis | | |
| Kebenaran produksi · Pemilik sistem dan fungsi berkuasa | Penutupan risiko, kawalan operasi, bukti staging dan kebenaran keluaran berasingan | | |

## Keputusan untuk mesyuarat pemilik

Semua keputusan di bawah berstatus **cadangan**. Catat keputusan, nama/kuasa pelulus dan tarikh pada rekod mesyuarat. Fungsi rasmi kekal tertutup sementara keputusan belum dimuktamadkan.

| ID | Pelulus / fungsi semakan | Pilihan untuk diputuskan | Versi dasar | Tarikh kuat kuasa MYT | Minit / SOP |
| --- | --- | --- | --- | --- | --- |
| MBSP-01 · Dokumen | Jabatan Bangunan, ICT | Senarai berversi penuh, rintis terhad atau tangguh | | | |
| MBSP-02 · Akuan | Jabatan Bangunan, ICT, penasihat undang-undang | Akuan terikat snapshot, tambah pengesahan terpilih atau tangguh | | | |
| MBSP-03 · Peruntukan PIC/PPSK | Jabatan Bangunan, ICT | Daerah standard, pengecualian berjangka dengan audit atau tangguh | | | |
| MBSP-04 · Rujukan | Jabatan Bangunan, ICT | Siri pusat, siri daerah/tahun atau tangguh | | | |
| MBSP-05 · Rekod dan storan | ICT, Unit Rekod | Retensi mengikut kelas, jadual tunggal dengan pengecualian atau tangguh | | | |
| MBSP-06 · Keselamatan | ICT, Jabatan Bangunan, Unit Rekod | Penilaian berperingkat mengikut bukti atau tangguh pelepasan | | | |
| MBSP-07 · MBSPPay | Kewangan, ICT, Jabatan Bangunan | Semak model dan mohon sandbox berasingan, pulangkan model fi atau kekalkan tertutup | | | |
| MBSP-08 · Data pekerja dan majikan | Jabatan Bangunan, JTK, Unit Rekod | Ringkasan sedia ada, medan minimum dengan asas kuasa atau tangguh pengembangan | | | |

Bagi setiap baris, lampirkan pilihan dipersetujui, sebab, skop dan pengecualian, pemilik pelaksanaan, bukti yang diperlukan, ujian semula bebas dan pelan undur. Gunakan [huraian kesan dan gerbang konfigurasi](OWNER-DECISION-PACK.md) untuk menilai pilihan.

## Pengesahan teknikal yang boleh diulang

```bash
npm ci
npm run db:generate
npm run typecheck
npm run lint
npx vitest run --exclude tests/api.test.ts
npm run build
npm audit
```

- Pada DB API asing seperti `staylink_issue58_api_test`, bekalkan kunci ujian dan tetapan loopback, jalankan `npm run db:test:migrate`, `npm run db:seed`, kemudian `npx vitest run tests/api.test.ts`. Suite API menyemak penolakan kuasa ditarik balik, CSRF, MFA, versi lapuk, perubahan cap jari polisi, pembetulan, pengasingan daerah dan callback ulangan.
- Pada DB pelayar berasingan, sediakan perkhidmatan tempatan, jalankan migrasi/seed dan `npm run test:e2e`. Untuk larian kit, gunakan [langkah preflight](GUIDED-INTERNAL-UAT.md#sediakan-satu-db-untuk-satu-sesi) pada DB ketiga, mulakan portal, kemudian jalankan `STAYLINK_UAT_KIT_FILE="$kit/accounts.json" node --env-file="$kit/portal.env" node_modules/@playwright/test/cli.js test tests/e2e/synthetic-portal.spec.ts`.
- Jalankan `bash scripts/rehearse-synthetic-restore.sh <bekas-lokal> <peranan-db-latihan> <db-api> <db-pemulihan-kosong>`. Gunakan nama pemulihan seperti `staylink_issue58_restore_ci_test`. Skrip membandingkan serahan, pautan bukti, lengkap, invois, penyelesaian dan pencetus perlindungan. Simpan angka bersama SHA dan URL run CI.
- Pautkan penemuan kepada [Issue #58](https://github.com/BangunanDotCom/sipintar-mbsp/issues/58). Rekod isu terdahulu yang berkaitan jika keputusan melibatkan konfigurasi [Issue #45](https://github.com/BangunanDotCom/sipintar-mbsp/issues/45), fixture [Issue #49](https://github.com/BangunanDotCom/sipintar-mbsp/issues/49) atau triage [Issue #54](https://github.com/BangunanDotCom/sipintar-mbsp/issues/54).

| Risiko terbuka | Pemilik dan bukti penutupan |
| --- | --- |
| Pemerhatian pegawai sebenar dan peranti sasaran masih perlu dibuat | Jabatan Bangunan bersama ICT merekod hasil dan pembaca skrin/peranti sasaran semasa sesi. |
| Chunk peta memberi amaran Vite | ICT mengukur peranti/rangkaian sasaran dan merekod kebolehgunaan koordinat serta aliran pemulihan peta. |
| Laporan setempat memerlukan semakan redaksi dan proses simpanan | Fasilitator dan Unit Rekod meluluskan kaedah penjagaan, akses, tempoh dan pelupusan. |
| Gerbang rasmi melibatkan akses, dokumen, rekod atau bayaran | Pemilik mengesahkan MBSP-01 hingga MBSP-08 dan merekod kelulusan operasi berasingan. Kit menggunakan metadata dan lejar tiruan. |
