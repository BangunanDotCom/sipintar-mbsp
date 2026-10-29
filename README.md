# STAYLink MBSP

**Smart Temporary Accommodation Link**  
*Digital Services, Practical Solutions.*

Projek pembangunan sistem digital Permohonan Penginapan Pekerja Tempoh Terhad (PPTT) untuk Majlis Bandaraya Seberang Perai (MBSP).

## Status
Fasa asas / prototaip. Belum disambung kepada pangkalan data, pengesahan pengguna, sistem pembayaran atau perkhidmatan AI. Jangan gunakan data pemohon sebenar pada peringkat ini.

## Skop yang dirancang
- Portal pemohon dan perunding.
- Penghantaran permohonan PPTT serta dokumen sokongan.
- Semakan permohonan oleh pegawai dan aliran kerja jabatan.
- Pemantauan status permohonan dan notifikasi.
- Dashboard prestasi, laporan dan jejak audit.
- Semakan berbantukan AI, tertakluk pengesahan pegawai.

## Penjenamaan
Nama paparan rasmi: **STAYLink MBSP**. Akronim PPTT digunakan untuk jenis permohonan, bukan ditambah pada nama sistem.

## Pembangunan
- Repositori asal: `BangunanDotCom/sipintar-mbsp`.
- Branch kerja: `staylink-foundation`; `main` dikekalkan sehingga perubahan disemak.
- `index.html`: prototaip muka hadapan statik, tiada proses sebenar.
- Cloudflare Worker `dashboard-bangunan-mbsp` ialah projek berasingan dan **tidak boleh diubah** semasa pembangunan STAYLink.
- Sebarang penerbitan perlu menggunakan projek Cloudflare berasingan.

## Keselamatan
Repositori ini adalah public. Jangan commit API key, kata laluan, token, dokumen permohonan atau data peribadi.
