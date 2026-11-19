# Pengesahan sintetik Issue #24

Pemeriksaan bertarikh 19 November 2026 (MYT), dengan Node.js 22, Prisma 6.19.3, PostgreSQL loopback, Mailpit dan Chromium. Skop kod bermula pada `1867d8f` (PR #25), berakhir pada `b9490df` sebelum penambahan dokumen serahan ICT.

| Pemeriksaan | Bukti |
| --- | --- |
| Pemasangan dan Prisma | `npm ci` dan `npm run db:generate` berjaya. |
| Vitest | `npx vitest run --exclude tests/api.test.ts` lulus 283 ujian dalam 42 fail. Termasuk fail-closed polisi, kuarantin dan verdict TCP tiruan, sekatan keputusan manusia dan callback tiruan. |
| API dan PostgreSQL | `npx vitest run tests/api.test.ts` lulus 73 ujian. Suite merangkumi penyemakan kuasa, CSRF, MFA dan pemilikan sedia ada serta bukti silang draf, CLEAN, ulangan serentak, penolakan perubahan snapshot dan pembetulan sintetik. |
| Playwright | 26 ujian lulus. Salinan sementara menggunakan Vite 5273 dan API 3201 pada loopback dengan DB browser berasingan. Tukar port hanya pada salinan ujian kerana port lalai sedang digunakan. Suite mengesahkan regresi portal sedia ada, termasuk MFA, navigasi dan identiti unit serta tingkat. Gelombang B/C/D tiada aliran UI awam. |
| Sumber dan binaan | Pemeriksaan TypeScript, ESLint dan `npm run build` lulus. Vite memberi amaran bagi chunk melebihi 500 kB. Fastify melaporkan deprecated `disableRequestLogging` semasa ujian. |
| Audit kebergantungan | `npm audit --json` melaporkan 0 kelemahan dalam advisori registri pada masa ujian. |
| Migrasi dan pemulihan | `npm run db:test:migrate` lulus pada DB sintetik baharu dan boleh diulang. `pg_dump` dan `pg_restore --exit-on-error` berjaya dalam DB sintetik kosong berasingan. Bilangan 30 draf, 4 unit, 1 skop dokumen, 2 serahan dan 1 pencetus yang menyekat perubahan serahan sepadan dengan asal pada masa sandaran. |

Untuk menjalankan ujian integrasi baharu, sediakan DB sintetik kosong bernama `staylink_issue24_api_test`. Tetapkan `NODE_ENV=test` dan URL PostgreSQL yang sama untuk `DATABASE_URL` serta `TEST_DATABASE_URL` dengan host `127.0.0.1` dan port `5432`. Gunakan konfigurasi Mailpit tempatan. Selepas migrasi, jalankan `npx vitest run tests/api.test.ts`. Kes berlabel Issue 24 dilangkau oleh suite biasa jika nama DB menggunakan konvensyen lain. Gunakan DB berasingan untuk Playwright supaya fixture browser tidak berlanggar dengan data integrasi.

Ruang penerimaan tambahan meliputi pengimbas ClamAV sebenar dengan kemas kini tandatangan, pemulihan objek serentak dengan DB, UAT pemohon dan pegawai, penilaian privasi AI, lejar dan callback sandbox rasmi, serta semakan penembusan yang diluluskan. Dua migrasi tambahan diuji pada PostgreSQL sintetik sahaja. Kiraan pemulihan mengesahkan sampel dan kewujudan pencetus. Ujian integrasi mengesahkan pencetus menyekat kemas kini snapshot.
