# Matriks RBAC

Semua peranan mendapat profil peribadi, pusat notifikasi dan dashboard awal. Satu sesi memilih satu peranan aktif. Memiliki beberapa peranan tidak menggabungkan permission sesi secara automatik. Pelantikan tamat, belum bermula atau dibatalkan ditolak oleh backend.

| Peranan | Kebenaran Fasa 1 |
|---|---|
| PEMOHON | Profil, syarikat sendiri, dokumen syarikat yang diwakili, notifikasi |
| WAKIL_SYARIKAT | Sama seperti pemohon; akses ditentukan hubungan syarikat, bukan nama peranan semata-mata |
| PIC_KAWASAN | Kawasan dalam skop, dashboard seliaan; pengesahan perwakilan terhad seperti di bawah |
| PPSK | Kawasan dalam skop, senarai PIC aktif, penugasan semula dengan sebab, audit tindakan sendiri |
| PERANCANG_BANDAR | Identiti jabatan dan ruang rujukan teknikal Fasa 2 |
| KEJURUTERAAN | Identiti jabatan dan ruang rujukan teknikal Fasa 2 |
| URUS_SETIA_JK | Dashboard awal dan identiti; keputusan JK belum tersedia |
| PEGAWAI_PENANDATANGAN | Dashboard awal dan identiti; tandatangan rasmi belum tersedia |
| PENTADBIR_OPERASI | Cipta kawasan dalam skop, agih PIC, konfigurasi operasi berversi, audit operasi sendiri |
| PENTADBIR_TEMPLAT | Daftar templat, cipta versi, aktifkan format induk |
| PENTADBIR_ICT | Jemput pegawai, tambah/tamatkan pelantikan, status akaun, reset MFA, konfigurasi teknikal, audit keselamatan, status perkhidmatan |

Sumber permission: `packages/shared/src/index.ts`, diseed ke `permissions`. Tiada permission meluluskan permohonan, meminda keputusan Jawatankuasa atau mengesahkan bayaran dalam Fasa 1. Pentadbir ICT tidak mempunyai `templates.write`, `areas.write` atau kuasa keputusan perniagaan.

## Skop kawasan dan dokumen

- Skop daerah kosong bermaksud seluruh daerah dan perlu pelantikan rasmi.
- PPSK/Operasi tidak boleh mencipta atau menetapkan PIC di luar daerah pelantikannya.
- PIC sasaran mesti aktif, mempunyai pelantikan PIC yang sedang berkuat kuasa dan meliputi daerah kawasan.
- Resolver tanpa kawasan atau dengan data tidak mencukupi memulangkan `PERLU PENENTUAN PPSK`, bukan agihan rawak.
- Dokumen syarikat Fasa 1 belum dipautkan kepada lokasi permohonan. Oleh itu, PIC berskop satu daerah tidak boleh menyenaraikan/mengesahkan dokumen syarikat global. Hanya PIC dengan pelantikan seluruh daerah boleh menggunakan fungsi awal ini. ICT, PPSK dan Operasi tidak diberi akses pengesahan dokumen.
- Wakil syarikat belum disahkan tidak boleh menambah wakil lain. Sistem tidak menghubungkan pemohon kepada SSM sedia ada secara automatik.

## Pemisahan tugas

Pengesah perwakilan tidak boleh sama dengan pemohon. Fungsi `independent(preparer, approver)` disediakan untuk menolak identiti sama walaupun konteks peranannya berbeza. Pengesahan dokumen rasmi yang memerlukan penyedia/pengesah bebas belum mempunyai aliran dokumen dalam Fasa 1 dan wajib menggunakan semakan ini dalam Fasa 2.

Pentadbir tidak boleh melantik peranan sendiri, menggantung akaun sendiri atau menetapkan semula MFA sendiri. Reset MFA memerlukan pentadbir lain dengan sebab/rujukan pengesahan identiti, membatalkan semua sesi dan menghasilkan notifikasi keselamatan.
