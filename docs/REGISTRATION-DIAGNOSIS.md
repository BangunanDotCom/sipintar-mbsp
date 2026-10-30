# Diagnosis pendaftaran STAYLink MBSP

30 Oktober 2026 (Asia/Kuala_Lumpur). Branch: `staylink-mbsp-phase1`.

## Bukti dan batas akses

Ralat dilaporkan pengguna dalam **GitHub Codespaces**, frontend 5173 dan Fastify 3001. Alat sesi ini mengakses workspace Codex; ia tidak mempunyai terminal/sambungan langsung kepada Codespace pengguna. Kejayaan ujian Codex tidak membuktikan konfigurasi Codespaces sudah betul. **Punca sebenar pemasangan Codespaces masih menunggu hasil diagnosis daripada persekitaran tersebut.**

Konfigurasi `.devcontainer/map-check/devcontainer.json` hanya menyediakan Node.js dan pelayan fail diagnostik peta. Ia tidak menyediakan PostgreSQL atau mengisi `.env`. Jika konfigurasi tersebut digunakan untuk menjalankan backend penuh, ketiadaan servis/config database ialah calon punca yang perlu disahkan, bukan kesimpulan daripada log generik sahaja.

Semakan baca sahaja dalam Codex mengesahkan DATABASE_URL sah, PostgreSQL dan Prisma boleh disambungkan, empat migrasi dalam `_staylink_migrations` telah digunakan dengan checksum sepadan, kolum pendaftaran tersedia, peranan PEMOHON wujud, dan format kunci identiti/MFA sah. Nilai konfigurasi tidak dicetak.

Permintaan sebenar ke Fastify 3001 dengan identiti rekaan: **201** pendaftaran, **409** pendua, **400** input tidak sah. Rekod pengguna tersulit, peranan, token pengesahan, audit dan e-mel **SENT di Mailpit tempatan** disahkan melalui database sebenar. Satu akaun diagnostik bertanda DATA UJIAN dikekalkan dalam database pembangunan. Tiada database atau data sedia ada dipadam. SMTP production tidak diuji.

## Pembetulan diagnosis ralat

Log lama `Ralat dalaman` hanya mencetak kod/nama luar. Ujian sambungan tertutup menggunakan Prisma pg adapter menghasilkan **P2010 dengan cause.kind DatabaseNotReachable**; kod luar boleh menyembunyikan sebab sambungan sebenar.

- `errors.ts` memetakan kod sambungan, schema dan konfigurasi kepada HTTP 503 serta kategori selamat. Ia mengenali sebab terbungkus pg adapter tanpa mencetak host, URL, mesej SQL, stack, input atau credential.
- Log mengandungi `code`, `diagnosticCode`, `requestId` yang dijana pelayan dan corak laluan endpoint. Respons 5xx mengandungi mesej umum, kategori dan rujukan yang boleh dipadankan dengan log.
- Pendaftaran menolak DATABASE_URL yang tiada/tidak sah sebelum menggunakan default sambungan pg secara tersirat. Kunci identiti yang tiada mempunyai kod konfigurasi khusus. Validasi input dan respons pendua dikekalkan.
- Tiada konfigurasi, schema, migrasi, seed atau kunci diubah secara automatik. Ini membaiki diagnosis/penanganan kegagalan; ia tidak menyediakan PostgreSQL dalam Codespaces secara senyap.

## Semakan selamat dalam Codespaces pengguna

Di terminal **Codespaces yang sedang menjalankan portal**, pastikan branch `staylink-mbsp-phase1`, kemudian:

```sh
git pull --ff-only origin staylink-mbsp-phase1
npm run check:registration
```

Jika Git melaporkan perubahan tempatan bertindih, berhenti; jangan reset atau force checkout. Skrip memakai konfigurasi proses seperti aplikasi, menyemak PostgreSQL dalam transaksi **READ ONLY**, checksum migrasi, peranan pemohon dan Prisma Client. Ia tidak mendaftarkan pengguna, menghantar e-mel atau mengubah database. JSON hanya mengandungi status, versi migrasi dan kod ralat selamat; jangan hantarkan `.env` atau log mentah yang mengandungi input.

| Hasil                                    | Tafsiran / tindakan seterusnya                                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `databaseUrl: MISSING_OR_INVALID`        | Konfigurasi sambungan belum lengkap; perlu pengesahan sebelum mengubahnya                                      |
| `ECONNREFUSED` / `PG_UNREACHABLE`        | Sambungan tidak dapat dibuka; semak servis/host/port dari Codespaces, jangan padam volume                      |
| `28P01` / `PG_AUTHENTICATION_FAILED`     | Kelayakan atau akses database perlu disemak secara peribadi                                                    |
| Migrasi belum lengkap / checksum berubah | Semak SQL dan backup dahulu; minta pengesahan sebelum migrasi berisiko                                         |
| `applicantRole: MISSING`                 | Data induk peranan belum tersedia; semak seed tanpa mengubah data secara automatik                             |
| Kunci `MISSING_OR_INVALID`               | Pulihkan konfigurasi kunci yang sah; jangan menjana pengganti sewenang-wenangnya untuk data tersulit sedia ada |
| `prisma: NOT_READY`                      | Semak Client yang dijana/kolum schema dengan kod ralat yang dilaporkan                                         |

Runner migrasi repositori menggunakan `_staylink_migrations`; jangan gunakan `prisma migrate reset` atau `db push --accept-data-loss` sebagai pembetulan.

## Kawalan kata laluan

Butang mata dipasang pada borang daftar, login dan reset/aktivasi kata laluan. Input tersembunyi secara lalai, nilai dikekalkan ketika toggle, butang `type="button"` tidak menghantar borang. Label BM, `aria-controls`, `aria-pressed`, fokus papan kekunci dan sasaran sentuhan 44×44 disediakan. CSS hanya menskop medan auth; logo, latar dan reka bentuk homepage dikekalkan.

## Ujian

Lint, typecheck dan build lulus. **102 unit/API** lulus termasuk pengendalian ralat selamat; **empat ujian pelayar baharu** lulus untuk toggle daftar/login/reset, papan kekunci dan telefon. Ujian sambungan PostgreSQL/Prisma baca sahaja serta pendaftaran HTTP sebenar dilaksanakan dalam Codex. Keputusan ini tidak menutup status Codespaces yang masih PENDING; laporan regresi lanjut dikemas kini selepas larian selesai.

Tiada perubahan main, merge, deployment Cloudflare atau sentuhan Worker `dashboard-bangunan-mbsp`.
