# STAYLink MBSP · Persediaan demo melalui Cloudflare

Cabang persediaan ini berasaskan `72b04f61b195d031a07f2079f0f8c14523ee1ef7`. Nama khusus tunnel, aplikasi Cloudflare Access dan hos demo ialah **staylink-mbsp-demo**. Nama DNS sebenar perlu diluluskan. Contoh di bawah menggunakan domain ujian.

## Seni bina

```text
Pelayar pegawai → HTTPS Cloudflare Access → Cloudflare Tunnel khusus
 → cloudflared mengesahkan JWT Access dan TLS origin → Nginx 127.0.0.1:5443
     ├── React dist setempat pada hostname yang sama
     └── /api → Fastify 127.0.0.1:3001 → PostgreSQL latihan 127.0.0.1:5432
                                                 └── Mailpit setempat 1025/8025
```

Kekalkan origin Node.js/Linux yang dibenarkan. Tunnel menggunakan sambungan keluar connector. React, Fastify dan PostgreSQL kekal pada hos yang sama seperti pakej demo asal. Pegawai memerlukan pelayar, akaun organisasi yang diluluskan oleh Access dan akaun latihan STAYLink yang berasingan. [Dokumentasi Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/)

## Sempadan akses dan data

| Sempadan | Kawalan | Bukti dan semakan |
| --- | --- | --- |
| IdP → Cloudflare Access | App self-hosted untuk **seluruh hostname**, polisi Allow kumpulan UAT bernama sahaja, MFA IdP yang diluluskan, sesi pendek, tiada Bypass, Everyone atau Service Auth pada portal | JTIK perlu menyemak definisi kumpulan, tetapan MFA dan pengecualian pada akaun sebenar. |
| Access → tunnel → origin | Ingress tepat ke HTTPS loopback dengan CA dan SAN localhost disemak. `originRequest.access.required=true` dengan `teamName` dan satu AUD. Catch-all 404. Origin dan port servis tidak dibuka di LAN atau internet. | CLI cloudflared mengesahkan sintaks dan padanan ingress secara setempat. Ujian Access beridentiti sah, tamat dan audience salah memerlukan deployment diluluskan. |
| Connector → Nginx → Fastify | Nginx memerlukan hostname tepat serta header IP dan assertion daripada connector setempat. Penentusahan JWT dibuat oleh cloudflared. Nginx membuang assertion, e-mel Access dan kuki edge sebelum API. API menerima kuki `staylink` dan Origin pelayar. IP yang diteruskan berasal daripada connector, tertakluk kepada hos origin terasing. | Uji TLS, host salah, header tiada, kuki dan IP melalui Nginx sebenar dengan fixture. Proses lain pada hos origin juga boleh mencapai loopback, jadi hos tersebut memerlukan akses pentadbir terkawal. |
| Fastify → peranan dan rekod | Kekalkan MFA aplikasi untuk pegawai, semakan sesi, RBAC, Origin/CSRF, polisi sintetik, daerah, kuasa wakil dan kunci urus niaga pangkalan data. Identiti Access tidak menetapkan peranan atau hak ke draf. | Suite baseline menguji akses silang pengguna/daerah, MFA, callback tiruan dan keenam-enam senario. |
| CDN → respons | Peraturan Cache Bypass untuk seluruh hostname, tanpa Cache Everything/Page Rule atau Worker yang menindihnya. Origin memberi `Cache-Control: private, no-store` bagi setiap laluan. | Ujian Nginx semak header tunggal no-store. Selepas kelulusan, semak respons Cloudflare untuk dua sesi, laluan API dan HTML. |
| PostgreSQL, Mailpit dan storan | DB khusus `staylink_issue62_cloudflare_test`, peranan DB terasing dan sambungan loopback. E-mel latihan ke Mailpit tanpa relay. Tiada ingress Mailpit, PostgreSQL, fail sebenar atau callback penyedia bayaran. | Pautan aktivasi sintetik perlu diserahkan oleh fasilitator melalui cara yang diluluskan. Pengguna boleh mencuba enam akaun prajana terus. |

Sumber Cloudflare sedia ada, polisi, DNS, had akaun dan tajuk laluan semasa belum dapat disemak dari sini. Sahkan tiada route atau wildcard yang menindih hostname, termasuk daripada Worker dashboard lain. [Konfigurasi ingress](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/local-management/configuration-file/) · [Parameter origin](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/origin-parameters/)

## Sumber, kapasiti dan kos

| Sumber | Pilihan untuk JTIK | Syarat dan kos |
| --- | --- | --- |
| Akaun dan zon Cloudflare | Guna akaun dan zon yang diluluskan jika sesuai | Sahkan pemilik, pelan, kuota dan tiada konflik route. Zon/DNS memerlukan kelulusan perubahan. |
| Zero Trust dan IdP | Guna organisasi, integrasi IdP dan pelan sedia ada | Sahkan had pengguna, syarat MFA, retensi log dan bilangan peserta yang layak sebelum menjemput. Konfigurasi ini tidak memerlukan add-on berbayar dengan sendirinya. |
| Tunnel dan Access App | Tempah nama `staylink-mbsp-demo` untuk tunnel dan app terasing. Guna resource tersebut jika ia sudah diluluskan dan sesuai | JTIK mengesahkan UUID, AUD dan polisi. Guna akaun penerbit yang dibenarkan. Periksa harga/pelan semasa terlebih dahulu. |
| Hos latihan Linux | Guna VM latihan sedia ada yang boleh mengasingkan proses, rahsia dan DB | Jika hos, storan atau backup baharu diperlukan, kos belum disahkan. Teruskan hanya selepas JTIK memilih penyelesaian dan meluluskan kos. |
| TLS dan operasi | Sijil edge dalam zon yang diluluskan. CA setempat, PostgreSQL, Mailpit dan Nginx pada VM | Sahkan sijil edge, keluar rangkaian connector, ruang backup, tempoh retensi dan pemilik tugas. |

Tiada Worker, Pages Functions, D1, R2, Hyperdrive atau Cloudflare Containers diperlukan oleh reka bentuk ini. Sasaran kos tambahan sifar bergantung pada pelan dan sumber organisasi yang sedia ada. [Pelan Zero Trust Cloudflare](https://www.cloudflare.com/plans/zero-trust-services/)

## Penyediaan setempat dan konfigurasi untuk semakan

1. Ikuti [pakej demo asal](../demo/README.md) untuk binaan, pemeriksaan prasyarat, migrasi, seed dan kit. Gunakan **DB kosong khusus** `staylink_issue62_cloudflare_test` dalam PostgreSQL latihan. Tetapkan `APP_ORIGIN=https://staylink-mbsp-demo.<zon-diluluskan>` dengan nilai yang sama dari pelayar hingga Fastify. Jalankan preflight `empty` dan `kit` sebelum penggunaan pertama.
2. Lengkapkan [contoh env](staylink-mbsp-demo.env.example) dalam fail privat yang hanya dibaca oleh pengendali. Jangan letak APP passwords dalam konfigurasi Nginx dan cloudflared. Simpan URL DB, kunci MFA, identiti, callback dan `portal.env` dengan ACL akaun aplikasi. Letakkan JSON kelayakan khusus tunnel, CA origin dan kunci TLS di laluan berasingan yang hanya boleh dibaca servis masing-masing. Kekalkan kunci aplikasi ketika memulihkan DB latihan.
3. Jana konfigurasi tanpa panggilan Cloudflare. Kedua-dua fail dijana ke direktori sementara privat. Pindahkan ke direktori servis hanya selepas kelulusan dan semakan pengendali.

```bash
generated="$(node --env-file="$DEMO_ENV" --env-file="$CF_DEMO_ENV" deploy/cloudflare/render.mjs)"
cloudflared tunnel --config "$generated/cloudflared.yaml" ingress validate
```

4. Nginx memasukkan `nginx.include.conf` di dalam blok `http`. Sijil origin perlu mempunyai SAN `localhost`, dengan CA yang dikonfigurasikan dalam fail tunnel. Semak `nginx -t`. Semak unit [origin](staylink-mbsp-demo-origin.service) dan [connector](staylink-mbsp-demo-cloudflared.service), direktori versi, ACL dan pemetaan perkhidmatan. Tiada port demo perlu didedahkan ke luar hos origin.
5. Simulasikan sempadan tanpa akaun Cloudflare dengan `bash scripts/rehearse-cloudflare-boundary.sh`. Pilihan `CLOUDFLARED_BIN` menambah pengesahan konfigurasi dan padanan rule secara setempat. Simulasi Nginx menggunakan fixture untuk header Access. Ia tidak mengesahkan JWT sebenar.

## Sandaran, pemulihan dan undur

- Tetapkan RPO/RTO dan jadual melalui JTIK. Simpan dump PostgreSQL khusus DB latihan dengan checksum, SHA aplikasi, cap jari polisi dan rujukan rahsia. Simpan salinan tersulit dan berasingan daripada direktori publik. Jangan masukkan dump, kunci atau OTP ke GitHub.
- Pulihkan ke DB latihan kosong berasingan dan gunakan [skrip pemulihan sintetik](../../scripts/rehearse-synthetic-restore.sh) untuk membandingkan serahan, pautan, audit invois, notifikasi dan trigger. Latihan perlu menggunakan nama `staylink_issue62_restore<id>_test`, anggota dalam kelompok schema sintetik yang sama dan akaun pengendali terhad. Uji fungsi selepas pemulihan sebelum menyentuh konfigurasi rintis.
- Pelan undur menggunakan release/secrets rujukan dan skema yang serasi. Apabila ralat akses, TLS, cache atau pengasingan dikesan, pemilik boleh menghentikan connector khusus atau menutup akses pada app khusus melalui perubahan diluluskan. Simpan DB asal dan gunakan salinan yang disahkan. Tiada pemadaman DB atau pengubahan Worker sebagai sebahagian undur.
- Akses Mailpit hanya melalui pengendali setempat. Audit aplikasi, keputusan UAT dan log Cloudflare Access adalah artefak berasingan. Elakkan URL bertoken, assertion dan kelayakan dalam log atau bukti.

## Gerbang selepas kelulusan

- Sahkan pelan/kuota, VM, zon, hostname, kumpulan dan MFA IdP, serta ruang dan retensi DB. Luluskan tetingkap perubahan, TLS, pengecualian firewall dan pelan undur.
- Sahkan tiada laluan atau Worker lain menindih hostname. Sediakan Cache Bypass dan kawalan Access dahulu. Pengendali yang diluluskan memasang konektor, polisi dan laluan khusus.
- Dengan akaun yang sah dan tanpa sesi Access, semak penolakan penuh pada HTML, aset dan API. Sahkan audience lain, JWT tamat dan identiti tanpa kumpulan ditolak. Semak bahawa origin/IP/port tidak terbuka dari rangkaian peserta. Uji dua pengguna berbeza untuk pengasingan cache dan data.
- Fasilitator menguji keenam-enam akaun dan senario di pelayar melalui Cloudflare, termasuk penyertaan PIC/PPSK berasingan dan fi tiruan. Rekod keputusan dalam [borang UAT](../../docs/ict-handover/UAT-SESSION-WORKSHEET.md). Polisi rasmi dan penerimaan mempunyai gerbang sedia ada.

Tiada perubahan Cloudflare, DNS atau deployment dilakukan oleh pakej persediaan ini.
