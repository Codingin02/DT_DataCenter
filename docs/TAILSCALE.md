# Tailscale Funnel

Tujuan: pengunjung internet membuka HTTPS tanpa memasang Tailscale. Tailscale dipasang pada **host Debian**, bukan container. Funnel bukan Serve yang hanya untuk tailnet.

## Status dan prasyarat keamanan

Belum diinstal/diaktifkan pada server oleh sesi ini karena SSH server tidak terjangkau. Belum ada URL publik dan belum ada hasil uji jaringan eksternal/reboot. Jangan mengarang URL dari hostname perkiraan.

Nginx LAN meneruskan endpoint registrasi tulis tanpa autentikasi backend. Oleh sebab itu **jangan menargetkan port LAN 80 atau backend 3010/3000 langsung**. Konfigurasi publik terpisah `infra/nginx/funnel.conf` hanya mengizinkan halaman/aset dashboard, current-state/history API dan SSE. Registrasi spasial, `/metrics`, `/ready`, `/health` serta route lain ditolak. UI registrasi dapat menampilkan tidak tersedia di jalur publik; fungsi LAN tetap ada.

Read-only bukan autentikasi: telemetry, identitas dan histori tetap terlihat publik. Pemilik data harus menyetujui hal itu. Jika data harus privat, jangan enable Funnel sampai kontrol autentikasi pengunjung dirancang dan diuji. URL sulit ditebak bukan keamanan.

## 1. Instalasi host

```bash
cd /opt/digital-twin-datacenter
command -v tailscale
# Jika belum ada:
sudo bash deployment/linux/install-tailscale.sh
sudo systemctl status tailscaled --no-pager
tailscale version
sudo tailscale up
```

Selesaikan login interaktif dengan akun pemilik. Jangan kirim auth key, cookie, private node key atau login URL ke GitHub. Installer menggunakan repository resmi sesuai codename Debian dan tidak menyimpan credential akun di proyek.

Tinjau MagicDNS, HTTPS certificate dan kebijakan `nodeAttrs` capability Funnel di admin console akun. Jangan menimpa keseluruhan ACL tailnet dengan contoh. Perintah CLI dapat menampilkan tautan persetujuan jika fitur belum diizinkan; perubahan kebijakan memerlukan admin akun. Periksa apakah konfigurasi Serve/Funnel lain sudah aktif agar tidak tertimpa.

```bash
tailscale status
tailscale serve status
tailscale funnel status
```

## 2. Siapkan listener Nginx khusus

Backup env/config existing dan database terlebih dahulu sesuai [Linux](LINUX.md). Pastikan website LAN sehat, lalu validasi konfigurasi baru tanpa menerapkan perubahan:

```bash
dc=(docker compose --env-file .env.server -p dt_datacenter -f docker/compose.yaml -f docker/compose.linux.yaml -f docker/compose.funnel.yaml)
"${dc[@]}" config --quiet
"${dc[@]}" run --rm --no-deps nginx nginx -t
```

Perintah `run` adalah container validasi sementara; backend existing harus tersedia untuk resolusi upstream. Tidak ada daemon Tailscale container baru. Setelah validasi berhasil dan perubahan diizinkan:

```bash
mkdir -p config/linux
touch config/linux/funnel.enabled
bash deployment/linux/start.sh
"${dc[@]}" exec -T nginx nginx -t
curl --fail http://127.0.0.1/
curl --fail http://127.0.0.1:8080/
curl --silent --output /dev/null --write-out '%{http_code}\n' http://127.0.0.1:8080/metrics
curl --silent -X POST --output /dev/null --write-out '%{http_code}\n' http://127.0.0.1:8080/api/spatial-registration
```

Metrik harus 404, POST registrasi harus 403. Pastikan `ss`/`docker port dt-datacenter-nginx` menunjukkan 8080 **hanya 127.0.0.1**. Marker membuat operasi wrapper selanjutnya tetap menyertakan override gateway; jangan memakai perintah Compose basis saja untuk recreate Nginx saat Funnel aktif.

## 3. Aktifkan dengan persetujuan publikasi data

```bash
sudo env DT_PUBLIC_READONLY_APPROVED=1 bash deployment/linux/funnel.sh enable
tailscale funnel status
tailscale funnel status --json
```

Wrapper memeriksa status daemon/login, halaman gateway, route terlarang dan POST sebelum menjalankan perintah resmi:

```bash
tailscale funnel --bg --https=443 http://127.0.0.1:8080
```

Catat **URL aktual dari CLI** di arsip operasi privat. HTTPS otomatis diakhiri daemon Tailscale. Port publik yang didukung 443, 8443, 10000; workflow ini memilih 443. `--bg` menyimpan konfigurasi agar Funnel kembali setelah daemon/host restart. Pastikan tailscaled dan Docker enabled, restart policy container unless-stopped dan marker gateway dipertahankan.

## 4. Uji sebelum menyatakan berhasil

- Buka URL aktual dari seluler yang Wi-Fi-nya dimatikan dan tidak terhubung Tailscale.
- Periksa HTML, aset JS/CSS, dashboard, histori dan SSE; bukan hanya status 200 halaman awal.
- Pastikan POST registrasi/metrics/readiness ditolak dari URL publik.
- Pastikan website LAN tetap berfungsi, ESP32/Shelly masih online, timestamp data bertambah dan RX/TX NIC benar.
- Pastikan database/MQTT/exporter/backend tidak memiliki forwarding publik atau router port mapping.
- Dengan izin restart, reboot server lalu ulangi pemeriksaan daemon, Funnel, container, LAN, data IoT dan akses seluler. Persistensi dokumentasi bukan bukti pengujian reboot.

## Status, penghentian, rollback

```bash
bash deployment/linux/funnel.sh status
sudo bash deployment/linux/funnel.sh off
```

`off` menghentikan listener HTTPS Funnel 443, tidak menghentikan website LAN atau menghapus volume. Jangan `tailscale funnel reset` tanpa memeriksa konfigurasi lain. Jika tidak lagi membutuhkan gateway, sesudah Funnel off dan persetujuan perubahan, hapus hanya marker `config/linux/funnel.enabled` lalu recreate Nginx dengan konfigurasi OS tanpa override Funnel; periksa LAN kembali. Jangan menghapus seluruh state Tailscale.

Referensi resmi: https://tailscale.com/docs/features/tailscale-funnel ; https://tailscale.com/docs/reference/tailscale-cli/funnel ; https://pkgs.tailscale.com/stable/ .
