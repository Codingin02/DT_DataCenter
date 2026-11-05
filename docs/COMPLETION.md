# Status pengerjaan Digital Twin

## Hasil lokal

- Folder utama USB: `/Volumes/DEBIAN 13_7/Digital Twin`.
- Source berada langsung di root, bukan lagi di wrapper Digital_Twin.
- Dua paket duplikat telah dikonsolidasikan; image/paket/evidence unik tetap tersedia satu salinan di deployment/resources, tidak masuk publikasi.
- Workflow Windows dan Debian dibuat dari source aplikasi yang sama, dengan template env dan skrip install/start/stop/status/update/backup/restore.
- Credential asli dipertahankan, env Windows privat disiapkan dari credential ditemukan, NIC Windows tidak ditiru dari Linux. Env server aktif belum diperoleh.
- Dokumentasi README, PRD, OS, Docker, konfigurasi, firmware, database, MQTT, network, operasi dan Funnel tersedia.
- Listener publik Nginx read-only dan skrip instalasi/gate Tailscale tersedia; belum diterapkan pada server.

## Pengujian yang benar-benar dijalankan

| Pemeriksaan                                  | Hasil / batas                                                                                                         |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| npm ci pada workspace verifikasi tersanitasi | berhasil, menggunakan lockfile yang sama                                                                              |
| npm run check                                | lint, format check, test dan build frontend berhasil                                                                  |
| Test aplikasi/deployment                     | 190 pass, 0 skip; seluruh test unit dan integrasi terverifikasi termasuk sketch asli workstation |
| Frontend build                               | berhasil; warning bundle >500 kB, tidak di-refactor di luar lingkup                                                   |
| Compose Linux + Funnel, Windows              | config validation berhasil dengan standalone Docker Compose dan password fixture, tidak menggunakan password produksi |
| Bash                                         | 13 skrip nyata lolos bash -n; metadata AppleDouble bukan skrip                                                        |
| PowerShell                                   | seluruh wrapper baru lolos parser; test Windows wrapper dengan Docker mock lolos pada PowerShell portable macOS       |
| Backup biner Windows                         | penyalinan byte diverifikasi pada test mock; belum pg_dump nyata                                                      |
| Secret scan riwayat                          | Gitleaks: 14 commit diperiksa, tidak ada finding                                                                      |
| Secret scan kandidat publik                  | Gitleaks dan pencocokan nilai secret USB: tidak ada finding pada kandidat yang diperiksa                              |
| Credential/migration asli                    | hash env asli, mqtt/passwd, local_config.h dan seluruh migration tetap sama                                           |

Enam unit test firmware ESP-IDF terpisah juga berhasil dikompilasi/dijalankan dengan compiler host POSIX (bukan verifikasi board Arduino). Audit dependency produksi setelah pembaruan patch fast-uri/ip-address menghasilkan **0 vulnerability** pada saat pemeriksaan. Empat temuan review independen telah diperbaiki dengan regression test: fitur MSI, startup Manual, reload/recreate konfigurasi saat update, dan tool Shelly tanpa scan subnet. Scan otomatis memperkecil risiko, bukan jaminan absolut seluruh jenis secret tidak pernah bocor.

## Yang tidak dapat dijalankan

- Docker Engine/Desktop, CLI Docker dan socket daemon tidak tersedia pada Mac; Colima/Podman/Lima juga tidak ditemukan. Karena itu Dockerfile/container build nyata, health container, persistence volume dan koneksi DB/MQTT nyata belum diuji.
- Windows host tidak tersedia; PowerShell portable/macOS dan mock bukan bukti Docker Desktop/Windows Exporter bekerja pada Windows fisik.
- SSH ke server dedicated 192.168.1.167:22 timeout. Database, IoT, Nginx LAN, Node Exporter, RX/TX dan konfigurasi aktif server belum diperiksa atau diubah.
- Tailscale belum dapat diinstal/login pada Debian; Funnel belum aktif, URL publik belum ada, uji seluler/reboot belum dilakukan.
- Source Arduino `.ino` asli belum ditemukan; artefak privat dipertahankan, bukan diklaim source firmware final lengkap.

## GitHub

Remote tujuan tetap `https://github.com/Codingin02/DT_DataCenter`, branch main. Akun gh aktif `gorystilllearning` memiliki `pull=true`, `push=false`; tidak dicoba memaksa push atau mengganti remote/repository. Publikasi remote belum selesai. Perubahan lokal disiapkan untuk commit setelah review dan scan staged; status aktual/hash dapat diperiksa dengan `git status --short` dan `git log -1 --oneline`. Daftar perubahan rinci dan bukti verifikasi disimpan privat di `config/private/audit/`.

Untuk menyelesaikan publikasi, pemilik perlu memberikan akses write kepada akun yang digunakan atau login gh sebagai akun yang memang berhak pada repository tujuan. Jangan membagikan token di chat. Setelah akses benar, dari folder Digital Twin:

```bash
git status --short
git log -3 --oneline
git remote -v
git fetch origin
git log --oneline HEAD..origin/main
```

Jika remote berubah, review divergence dahulu; jangan force push atau overwrite. Setelah commit yang tepat dan remote telah diverifikasi:

```bash
git push origin main
```

Tidak ada history rewrite, force push atau perubahan remote. Laporan ini tidak mengklaim branch GitHub sudah diperbarui.

## Tindakan pemilik yang benar-benar diperlukan

1. Sediakan jalur jaringan sah dan username/alias SSH ke server dedicated (tanpa password/private key di chat).
2. Sediakan source `.ino` asli dan informasi toolchain firmware yang digunakan board.
3. Berikan akses GitHub write/login akun berwenang untuk push.
4. Login akun Tailscale pada Debian dan setujui kebijakan Funnel serta apakah telemetri/history boleh publik. Jangan mengaktifkannya jika data wajib privat tanpa autentikasi.

Detail perubahan/pembersihan: [AUDIT.md](AUDIT.md). Semua perintah pemeliharaan: [OPERATIONS.md](OPERATIONS.md).
