# Digital Twin — implementation plan

**Goal:** Satu source aplikasi di USB dengan deployment Windows dan Debian, konfigurasi privat terjaga, dan jalur publik yang tidak membuka endpoint administrasi.

**Architecture:** Pertahankan backend, frontend, protokol MQTT, sensor dan skema database. Gunakan Compose utama yang kompatibel dengan deployment existing, override khusus OS, dan override Nginx khusus Funnel. Source utama berada langsung di folder `Digital Twin`; arsip image/paket hanya satu salinan, bukan aplikasi kedua.

**Tech stack:** Node.js, PostgreSQL, Mosquitto, Nginx, Docker Compose, Bash, PowerShell, Node Exporter/Windows Exporter, Tailscale host.

**Spec:** Instruksi eksekusi penuh pengguna dalam sesi ini.

## Constraints

- Jangan ubah firmware, identitas perangkat, payload, pin atau akuisisi sensor.
- Jangan timpa environment/server yang belum diverifikasi; jangan membuat password.
- Jangan hapus volume atau restore ke database operasional secara otomatis.
- Jangan aktifkan Funnel sebelum audit keamanan dan akses server berhasil.
- Jangan expose PostgreSQL, backend, exporter atau MQTT ke internet.
- Pengujian tanpa Docker/Windows/server tidak boleh diklaim sebagai uji runtime.

## Review focus

- Path ber-spasi: seluruh wrapper memakai path absolut dan argumen terpisah.
- Konfigurasi lama: env existing dipertahankan; override Linux digunakan eksplisit.
- Data: stop tidak menghapus volume; restore hanya ke database disposable baru.
- Secret: ignore dan allowlist build context; scan staged files dan riwayat sebelum publikasi.
- Publik: blokir write API, readiness dan metrics hanya pada listener Funnel, LAN tetap kompatibel.

## Tasks

- [x] Ratakan source USB, inventaris paket, pindahkan credential/referensi privat dan hapus hanya duplikat terverifikasi. Uji hash sebelum/sesudah.
- [x] Tulis test deployment untuk wrapper, persistence, override OS dan batas akses publik; jalankan untuk membuktikan gagal sebelum implementasi.
- [x] Buat override Windows/Linux, build online yang reproducible di samping image existing, wrapper install/start/stop/update/backup/restore/status, dan wrapper Funnel dengan preflight. Uji sintaks dan test otomatis.
- [x] Lengkapi template env OS dan konfigurasi privat yang ditemukan tanpa mengganti credential; buat panduan env berdasarkan kode aktual.
- [x] Perbarui README, PRD, arsitektur, firmware, MQTT, database, operasi Windows/Linux, Docker, jaringan, Funnel dan troubleshooting; hilangkan instruksi deployment lama yang bertentangan.
- [x] Jalankan checks aplikasi, build frontend, validasi Compose, secret scan dan review diff. Catat keterbatasan tool/akses dengan bukti.
- [ ] Terapkan ke server hanya bila akses tersedia dan backup tervalidasi. Commit/push hanya setelah scan aman dan izin target tersedia; jika tidak, siapkan perubahan lokal untuk publikasi.

Deployment/push remote terblokir akses, bukan dilewati sebagai berhasil. Lihat COMPLETION.md untuk bukti dan langkah pemilik yang diperlukan.
