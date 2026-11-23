# STAYLink MBSP · Cadangan dasar dan keputusan pemilik proses

Dokumen untuk semakan Jabatan Bangunan, ICT, Unit Rekod dan Kewangan. Semua baris berstatus **cadangan**, dengan pelulus bernama, versi dasar dan tarikh kuat kuasa **TBD** sehingga keputusan direkod. Nilai latihan ialah data sintetik. Sebarang pengaktifan rasmi memerlukan kelulusan berasingan.

| ID | Cadangan dan rasional | Risiko / perkara terbuka | Pemilik dan pelulus | Konfigurasi latihan atau gerbang | Kriteria penerimaan |
| --- | --- | --- | --- | --- | --- |
| MBSP-01 · Bukti | Kategori berversi mengikut kapasiti, jenis premis dan fakta yang boleh disahkan. Paparkan wajib, bersyarat atau tidak terpakai. Padankan versi CLEAN dengan draf, unit atau tingkat. Semakan PIC mendahului pendaftaran. | Senarai rasmi, jenis premis, format dan had fail, bukti gantian, kesegaran serta pihak yang boleh meluluskan pengecualian. Simpan sebab, skop, pelulus dan tempoh setiap pengecualian. | Jabatan Bangunan. ICT bagi had teknikal. | `documents`; dokumen operasi tertutup. | Uji jenis/cakupan berbeza, kondisi belum diketahui, verdict gagal dan cubaan pindah bukti ke draf lain. |
| MBSP-02 · Akuan | Persetujuan eksplisit dengan teks berversi, pelaku, kapasiti, masa UTC dan snapshot. Akuan baharu apabila snapshot berubah secara material. Cadangan tanpa OTP tambahan bagi pemohon, dengan kawalan sesi, Origin dan CSRF. | Teks undang-undang, bahasa, perubahan material, tempoh, pembetulan kapasiti dan penandatangan bersama. MFA pegawai kekal. | Jabatan Bangunan bersama ICT dan penasihat undang-undang. | `declaration`; serahan rasmi tertutup. | Tolak versi lapuk dan cubaan menggunakan persetujuan terdahulu selepas perubahan material. Jejak audit menyatakan konteks yang diterima. |
| MBSP-03 · Tugasan | PIC mengesahkan kelengkapan. PPSK berasingan mendaftar. Cadangkan tugasan per kes mengikut daerah, kompetensi, beban dan pengganti sah. | Delegasi, pengecualian kawasan, konflik kepentingan, pertukaran pegawai, rayuan dan kuasa tarik balik. | Jabatan Bangunan bersama ICT. | `review.enabled`; latihan menggunakan peruntukan daerah dan dua identiti sedia ada. | Tiada akses silang daerah, kelulusan sendiri atau bypass MFA. Rekod tindakan, alasan dan pelaku. |
| MBSP-04 · Nombor rujukan | Asingkan UUID dalaman, resit dan nombor rasmi. Pertimbangkan skop siri, format, tempoh dan keunikan transaksi. Nombor latihan berawalan `SYNTHETIC-`. | Daerah/tahun, nombor lompat, pembatalan, perlumbaan, daftar sejarah dan integrasi sistem lain. | Jabatan Bangunan dan ICT. | `reference.strategy=SYNTHETIC_UUID`; pengeluaran rasmi tertutup. | Nombor latihan stabil dan unik selepas tindakan PPSK, dengan rekod audit. Bukti konkurensi diperlukan sebelum generator rasmi dibangunkan. |
| MBSP-05 · Rekod dan storan | Storan persendirian, kuarantin dengan pengimbas gagal tertutup, versi tidak boleh diubah dan sandaran disulitkan. Cadangkan polisi retensi berversi dan legal hold mengatasi pelupusan. | Penyedia, lokasi, kunci, pengimbas/SLA, klasifikasi, tempoh retensi, pemadaman dan pemulihan objek. Cadangan RPO 24 jam/RTO 8 jam untuk diuji oleh ICT, belum SLA. | ICT dan Unit Rekod. | `records.mode=DISABLED`; metadata latihan sahaja. | Uji kebenaran akses, integriti, pengimbas gagal, restore DB dan objek, hold dan pelupusan di staging yang diluluskan. |
| MBSP-06 · Keselamatan | Semak sesi, Origin/CSRF, MFA, skop, audit, redaksi, akses semasa, sandaran dan pengesahan manusia selepas AI. Bezakan status bukti dengan keputusan pegawai. | Matriks kuasa muktamad, audit tahan ubah, pengawasan, pemulihan, ujian penembusan dan gerbang staging. | ICT bersama Jabatan Bangunan dan Unit Rekod. | `security.mode=ENFORCED`; kawalan keselamatan tiada pilihan untuk dilonggar. | Bukti latihan untuk penolakan silang pengguna, kuasa luput, MFA, konflik versi, callback ulangan dan redaksi. |
| MBSP-07 · MBSPPay | Cadangkan RM50 bagi UUID unit fizikal unik, walaupun merentasi tingkat. Lejar transaksi persisten dan callback disahkan serta idempotent dalam latihan. | Unit bercaj, pengecualian, tamat tempoh, pembatalan, refund, rekonsiliasi manual, sandbox penyedia dan kontrak sebenar. | Kewangan bersama ICT dan Jabatan Bangunan. | `billing.mode=DISABLED / MOCK`, `billing.ttlMinutes`; fi fixture 5,000 sen MYR, bayaran sebenar tertutup. | Invois hanya selepas daftar latihan. Amaun ditentu server, callback tidak sepadan ditolak, replay menghasilkan satu rekonsiliasi. |
| MBSP-08 · K11 | Maklumat majikan pilihan. Kekalkan ringkasan jumlah pekerja sedia ada tanpa butiran individu baharu. | Kategori maklumat, tujuan, peranan JTK, retensi, hak pemohon dan penggunaan rentas agensi. | Jabatan Bangunan bersama JTK dan Unit Rekod. | Cadangan sahaja. Tiada medan atau kutipan baharu. | Semak borang dan kontrak data untuk memastikan tiada butiran pekerja individu diwajibkan. |

## Rekod kelulusan untuk mesyuarat pemilik

Bagi setiap ID, catat pilihan diterima, ditolak atau dikembalikan, sebab, versi dasar, pelulus dan kuasanya, tarikh kuat kuasa MYT, rujukan minit/SOP, pemilik pelaksanaan, bukti UAT, pelan undur dan semakan bebas. Laluan rasmi memerlukan rekod dasar serta kuasa yang sah, pengesahan manusia dan kelulusan pengaktifan. Konfigurasi latihan tiada medan untuk mengisytiharkan kelulusan tersebut.

**Jabatan Bangunan** semak MBSP-01 hingga MBSP-04 dan MBSP-08. **ICT** mengesahkan sempadan test/dev, pengasingan, pengoperasian keselamatan dan pemulihan. **Unit Rekod** meluluskan jadual rekod, tahanan dan pelupusan. **Kewangan** meluluskan unit bercaj, model lejar, sandbox dan tindakan pembatalan/refund. [Laporan pra-staging dan UAT](PRESTAGING-ASSURANCE.md)

## Konfigurasi sintetik dan bukti kawalan

`STAYLINK_SYNTHETIC_POLICY_JSON` dibaca ketika API bermula selepas gerbang `STAYLINK_SYNTHETIC_PORTAL=true` dan syarat URL PostgreSQL loopback lulus. Pangkalan data Issue #45 dinamakan `staylink_issue45_<label>_test`. Kedua-dua URL mestilah sama dan nama sambungan sebenar diperiksa sebelum laluan didaftarkan. Tanpa opt-in, laluan latihan tiada. Jika JSON diberikan dan gagal semakan, portal latihan ditutup dan aplikasi sedia ada terus beroperasi. Gunakan konfigurasi persekitaran sendiri. Kecualikan kunci dan kelayakan daripada JSON dan repositori.

Jika JSON tidak ditetapkan, portal yang telah diopt-in menggunakan fixture terdahulu untuk keserasian regresi. Berikut contoh konfigurasi untuk latihan bacaan bukti serta serahan sahaja.

```json
{
  "mode": "SYNTHETIC",
  "version": "SYNTHETIC-MBSP-MEETING-v1",
  "documents": {
    "version": "SYNTHETIC-DOCUMENTS-v1",
    "rules": [
      {
        "requirement": "layout",
        "scope": "FLOOR",
        "alternatives": ["floor_layout"],
        "requireVerified": false
      },
      {
        "requirement": "property-permission",
        "capacity": "INDIVIDUAL",
        "premiseType": "SHOP",
        "condition": "multipleUnits",
        "scope": "UNIT",
        "alternatives": ["ownership_or_tenancy"],
        "requireVerified": false
      }
    ]
  },
  "declaration": {
    "version": "SYNTHETIC-DECLARATION-v1",
    "text": "Saya mengesahkan data latihan ini untuk simulasi STAYLink MBSP."
  },
  "review": { "enabled": false, "assignment": "DISTRICT_FIXTURE" },
  "reference": { "strategy": "SYNTHETIC_UUID" },
  "records": { "mode": "DISABLED" },
  "security": { "mode": "ENFORCED" },
  "billing": { "mode": "DISABLED" }
}
```

- Naikkan versi setiap kali kandungan ditukar. API turut membandingkan SHA-256 konfigurasi efektif. Dengan konfigurasi tersuai, pemohon mesti menghantar `policyFingerprint` daripada DTO draf yang mengandungi akuan semasa. Dua teks dengan versi yang sama tetap mempunyai cap jari berbeza. Snapshot dan audit serahan merekodkan versi dan cap jari. Resit terdahulu kekal immutable.
- Syarat yang disokong datang daripada inventori server. `multipleUnits` mengira unit fizikal. `hasBuildingCertificate` menggunakan jenis CCC/CFO/OC atau keputusan `NOT_APPLICABLE`. Fakta tidak diketahui, syarat bertindih, ketiadaan peraturan yang sesuai dan skop tiada menyekat tindakan. `premiseType` sepadan tepat dengan jenis bangunan tersimpan.
- Bukti fixture dijana sebagai metadata bagi kategori pertama setiap peraturan yang sesuai dan dipaut kepada sasaran sebenar dalam draf. Alternatif yang layak masih dinilai. Semakan CLEAN wajib dan keperluan VERIFIED tambahan dikuatkuasakan. Generasi fixture hanya mengesahkan bukti kuasa syarikat apabila kuasa wakil sedia ada telah disahkan. Jenis bukti lain kekal belum disahkan.
- Untuk latihan pegawai, tetapkan `review.enabled=true` bersama dua pelantikan daerah sintetik. Untuk latihan invois, gunakan `billing={"mode":"MOCK","currency":"MYR","unitFeeSen":5000,"ttlMinutes":60}` bersama semakan pegawai aktif dan kunci callback latihan. Tempoh dibenarkan 5–120 minit dan dikunci pada invois apabila dijana. SDK pembekal dan pembayaran sebenar tiada dalam konfigurasi ini.
- Tiada generator nombor rasmi, adapter storan rasmi, enjin retensi, peluasan matriks kuasa atau pelepasan MFA daripada konfigurasi latihan. Laluan serahan rasmi masih mengembalikan konflik. Sebarang reka bentuk operasi selepas keputusan perlu mengikat versi dasar, bukti kuasa, pengesahan manusia, jejak audit dan gerbang pengaktifan secara berasingan.

Regresi merangkumi JSON dan mod tidak sah, bukti khusus premis/unit, syarat tidak terpakai, versi akuan berubah, penyerahan ulang, gerbang pegawai dan callback tertutup, serta ujian aliran penuh fixture terdahulu. Workflow sintetik turut menjalankan latihan pemulihan Issue #45. [Skrip UAT dan gerbang keselamatan](PRESTAGING-ASSURANCE.md)
