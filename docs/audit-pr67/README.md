# Audit bebas STAYLink MBSP · Personal Demo PR #67

**Susulan Team 3:** [Status semasa PR #69 dan Complete Release](SEMAKAN-PR69.md) · [Gerbang P0 surat kuasa dan ujian negatif](PENERIMAAN-SURAT-KUASA.md)

**Tarikh audit:** 25 November 2026, waktu Malaysia. **Keputusan Complete Release / Go Live: NO-GO.** Baseline ialah `8ecd1e5e6d823af900937b619674f28f665080df`. Rujukan reka bentuk ialah PR #16 pada `06b02f9`, yang masih berada pada cabang spesifikasi. Keputusan operasi dan Issue #68 digunakan untuk skop selepas bayaran pertama. Semakan Oracle dibuat berasingan pada `4b55f385455216bf3c73a06dacad1bd2e333224e` untuk PR #64. Penilaian ini untuk SHA tersebut. Perubahan selari selepas SHA berkenaan memerlukan pengujian semula. [PR #67](https://github.com/BangunanDotCom/sipintar-mbsp/pull/67) · [Spesifikasi K01–K11](https://github.com/BangunanDotCom/sipintar-mbsp/blob/06b02f9/docs/PHASE1-MBSP-SPECIFICATION.md) · [Keputusan operasi](../DECISIONS-OPERATIONS-2026-11.md) · [Issue #14](https://github.com/BangunanDotCom/sipintar-mbsp/issues/14) · [Issue #68](https://github.com/BangunanDotCom/sipintar-mbsp/issues/68) · [PR #64](https://github.com/BangunanDotCom/sipintar-mbsp/pull/64)

- [Matriks fungsi, subfungsi dan K01–K11](MATRIKS.md)
- [Penemuan, kawalan keselamatan, risiko dan kebergantungan](PENEMUAN.md)
- [Pelan ujian lengkap, penerimaan Complete Release dan checklist individu](PELAN-UJIAN.md)
- [Keputusan larian, liputan, prestasi dan pemulihan](BUKTI-UJIAN.md)
- [Inventori laluan API, skrin, model dan fail ujian baseline](INVENTORI.md)

Laluan latihan meliputi akaun, permohonan, ulang hantar, semakan PIC, pendaftaran PPSK dan rekonsiliasi mock. Gerbang Complete Release masih terbuka untuk dokumen rasmi, daftar rasmi, rujukan teknikal, KP, keputusan bercampur, surat, tandatangan, MBSPPay, penutupan, pelaporan SLA, Oracle 19c dan pemulihan menyeluruh. Audit operasi pada hos sebenar memerlukan bukti daripada pemilik sistem, JTIK dan Kewangan.

Kaedah audit merangkumi penelusuran dari skrin ke pengendali API, semakan transaksi serta kekangan PostgreSQL, perbandingan dokumentasi dengan kod, pengesahan metadata CI dan larian tempatan. Data ujian dijana khusus untuk PostgreSQL, Mailpit dan pelayar loopback. Tiada deployment, merge, akses data sebenar, panggilan MBSPPay, sambungan Oracle MBSP atau perubahan Cloudflare. Cabang audit tempatan mengandungi dokumentasi sahaja.

## Pemetaan 20 perkara audit

| Perkara | Ulasan / bukti |
|---|---|
| 1–4 · Keperluan, kod, fungsi, status | [Matriks K01–K11 dan fungsi](MATRIKS.md), [inventori API/UI/DB/dokumen](INVENTORI.md) |
| 5–6 · Liputan dan ujian belum tersedia | [Liputan terbukti](BUKTI-UJIAN.md#liputan-yang-dibuktikan-dan-jurang), [senario E01–O04](PELAN-UJIAN.md#perjalanan-ujian-dan-kes-regresi) |
| 7–9 · Keselamatan, dokumen dan transaksi | [Penemuan F-01 hingga F-13](PENEMUAN.md), [matriks kawalan](PENEMUAN.md#kawalan-dan-skop-jaminan) |
| 10–12 · UX/aksesibiliti, ukur prestasi dan DR | [Ujian U01/O03/O04](PELAN-UJIAN.md), [angka prestasi dan restore](BUKTI-UJIAN.md) |
| 13 · MBSPPay, Oracle dan tandatangan | [F-08/F-09/F-12](PENEMUAN.md), [Oracle](BUKTI-UJIAN.md#sempadan-kesediaan-oracle) |
| 14–17 · Perjalanan, setiap peranan, penerimaan dan checklist | [Pelan ujian, CR01–CR08 dan checklist](PELAN-UJIAN.md) |
| 18–19 · Prioriti, risiko dan kebergantungan jabatan | [Penemuan dan gerbang D1–D6](PENEMUAN.md) |
| 20 · Larian sedia ada dan hasil sebenar | [Jadual larian, percubaan semula dan bukti CI](BUKTI-UJIAN.md#hasil-larian-semula) |
