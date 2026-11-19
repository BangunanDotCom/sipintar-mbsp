# STAYLink MBSP - automasi pembangunan terkawal

## Tahap semasa
- **Automasi pengesahan kod:** workflow GitHub Actions dijadualkan pada hari bekerja (02:15 UTC / 10:15 MYT) dan dijalankan pada push/PR/dispatch. Ia memasang dependency, menjana Prisma client, menjalankan typecheck, unit test, lint dan build.
- **Agen menulis kod tanpa kehadiran pengguna:** **belum aktif**. Workflow pengesahan tidak menghasilkan kod baharu.
- **CI belum disahkan berjalan** sehingga GitHub Actions berjaya pada PR/branch yang berkenaan. Jadual automatik GitHub Actions lazimnya hanya aktif apabila fail workflow berada pada default branch; jangan gabungkan ke default branch tanpa kelulusan.
- API/database integration tests memerlukan pangkalan data ujian dan mesti ditambah sebelum menyatakan integrasi lulus.

## Keperluan sebelum pembangunan autonomi
1. Pilih agen/runner pembangunan yang disokong organisasi, dengan akses repository minimum dan persekitaran terasing.
2. Tetapkan sumber tugasan GitHub Issue berlabel `staylink-agent-approved`, dengan skop dan acceptance criteria. K01-K11 ialah keputusan reka bentuk, bukan lesen untuk menukar polisi atau data produksi.
3. Agen mencipta branch `staylink-agent/*` daripada `staylink-mbsp-phase1`; hanya buka **draft PR**. Tiada auto-merge, auto-deploy atau akses Cloudflare Worker produksi.
4. Konfigurasi token/secret melalui tetapan GitHub oleh pentadbir; jangan simpan dalam repo atau hantar kepada AI melalui prompt.
5. Tetapkan branch protection, status checks, review wajib, bajet penggunaan, had masa, dan mekanisme hentikan automasi.
6. Uji satu tugasan kecil secara end-to-end: issue -> agent -> branch -> draft PR -> CI -> human review. Catat log dan kos.

## Batas keselamatan
Patuhi `AGENTS.md`. Perubahan pangkalan data/migrasi, keselamatan, akses, pembayaran, data peribadi dan polisi MBSP memerlukan kelulusan khusus. Jangan gunakan rekod pemohon sebenar untuk ujian.

## Nota
Dokumen ini ialah pelan konfigurasi. Jangan laporkan agen pembangunan autonomi telah aktif sehingga bukti pelaksanaan lengkap tersedia.

## Keputusan platform agen (19 November 2026)
Pengguna memilih **OpenAI Codex** sebagai agen pembangunan STAYLink MBSP buat masa ini.
- Codex perlu menggunakan arahan `AGENTS.md` dan tugasan GitHub Issue yang telah diluluskan.
- Mulakan dengan PR #17: jalankan ujian, semak integrasi API dan identiti tingkat, kemudian bangunkan model unit fizikal serta hubungan unit-tingkat pada branch tugas baharu. Jangan gabung PR tanpa semakan.
- Penggunaan Codex dalam perbualan atau melalui akses GitHub sedia ada **tidak bermaksud** Codex telah dipasang sebagai runner tanpa pengawasan. Sambungan Codex-ke-GitHub, akses agen, pencetus tugasan dan had penggunaan perlu disahkan oleh pentadbir.
- Semua PR kekal draf sehingga ujian disahkan dan semakan manusia dibuat. Tiada akses produksi, rahsia, bayaran sebenar atau Worker `dashboard-bangunan-mbsp`.
