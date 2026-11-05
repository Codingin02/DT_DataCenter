# Linux / Debian

Server tujuan: `/opt/digital-twin-datacenter`, IP referensi `192.168.1.167`, NIC referensi `enp11s0`, Compose project `dt_datacenter`. Nilai tersebut harus dibandingkan dengan host aktual. Akses server belum berhasil pada sesi pengerjaan lokal.

## Lindungi deployment existing

Jangan memindahkan direktori aktif, mengganti password atau membuat volume baru sebelum inventaris. Pada server yang telah diautentikasi:

```bash
cd /opt/digital-twin-datacenter
ip -br address
ip route
ip -s link show enp11s0
sudo ss -lntup
docker compose --env-file .env.server -p dt_datacenter -f docker/compose.yaml ps
docker volume inspect dt_datacenter_postgres-data
# Simpan konfigurasi existing secara privat, bukan duplikasi seluruh project.
umask 077
mkdir -p backups/config
cp -a .env.server "backups/config/server-env-$(date -u +%Y%m%dT%H%M%SZ)"
```

Lakukan backup DB **dengan Compose aktif existing** sebelum mengaktifkan override Linux baru. Jangan menebak nama DB dari salah eja catatan lama. Periksa POSTGRES_DB di dalam container melalui query tanpa mencetak password. Setelah source baru tersedia dan env diverifikasi, wrapper memakai env existing yang sama.

`config/linux/.env` dan `.env.debian` USB adalah konfigurasi yang ditemukan: NIC `enp0s3`, bind backend dan MQTT `0.0.0.0`. Nilai itu tidak diganti diam-diam menjadi konfigurasi server. Template `deployment/linux/.env.example` memakai referensi server dan bind backend loopback; bukan bukti env produksi.

## Instalasi, start, stop

Lihat [instalasi](INSTALLATION.md). Jika env server belum tersedia, installer membuat template privat dan berhenti agar credential diisi pemilik. Jangan mengganti env existing dengan template.

```bash
chmod 600 .env.server
bash deployment/linux/install.sh
bash deployment/linux/start.sh
bash deployment/linux/status.sh
bash deployment/linux/stop.sh
```

`DT_ENV_FILE=/path/private.env bash deployment/linux/status.sh` memilih env lain. Wrapper memakai `docker/compose.yaml` + `compose.linux.yaml` dan project sama, sehingga volume default tetap `dt_datacenter_postgres-data`; `DT_POSTGRES_VOLUME` dapat memilih volume existing yang telah diverifikasi. Jangan memakai env Windows pada Debian.

## Node Exporter dan firewall

Node Exporter `v1.9.0` berjalan host network dan membaca `/proc`/`/sys` host. Backend memakai `host.docker.internal` yang dipetakan ke host gateway. Listen loopback 127.0.0.1 saja biasanya **tidak** dapat dijangkau backend container.

Override Linux menyediakan `DT_EXPORTER_BIND_ADDRESS`. Default 0.0.0.0 harus dibatasi firewall host: izinkan hanya jaringan bridge Docker yang diperlukan, tolak akses LAN/tailnet/internet ke 9100. Tentukan subnet Docker aktual sebelum membuat aturan; jangan menerapkan aturan generik yang dapat memutus SSH atau collector. Jangan menganggap UFW otomatis membatasi port yang diterbitkan Docker.

PostgreSQL tanpa port host. Backend host 3010 loopback pada template. MQTT 1883 bind LAN server. Nginx 80 melayani LAN. Tidak ada router forwarding ke layanan internal.

## Update, perubahan konfigurasi dan rollback

```bash
bash deployment/linux/backup.sh
git status --short
bash deployment/linux/update.sh
```

Update berhenti jika ada perubahan lokal; jangan reset untuk memaksanya. Setelah backup dan pull fast-forward, skrip memvalidasi Compose serta konfigurasi Nginx/Mosquitto pada container sementara, kemudian recreate eksplisit broker/backend/Nginx agar file bind mount baru tidak tertinggal pada inode/config lama. Ada jeda koneksi selama recreate; jadwalkan pemeliharaan. Jika marker gateway aktif, respons halaman dan route terlarang diperiksa kembali setelah update.

Sebelum build produksi, simpan identifier/tag image backend existing ke tag rollback yang dipilih administrator dan catat hash commit. Jika build atau health wait gagal, jangan hapus volume: periksa log, gunakan kembali image yang dicatat dan konfigurasi privat sebelumnya, lalu recreate hanya service terdampak. Mengembalikan source/image tidak mengembalikan DB; perubahan skema harus memiliki migration dan rencana rollback tersendiri.

Setelah setiap perubahan: health, ready, API, SSE, data ESP32/Shelly, counter RX/TX, website LAN, dan jika diaktifkan listener publik harus diuji. Reboot server adalah pengujian berdampak operasional: hanya dengan izin dan jadwal yang sesuai. Lihat [operasi](OPERATIONS.md) dan [Funnel](TAILSCALE.md).

---

## Runbook Terintegrasi: Deployment USB ke Server Debian & Aktivasi Tailscale Funnel

Panduan 8 tahap berurutan ini dirancang khusus untuk memastikan pembaruan source code dari USB ke server Debian berjalan mulus tanpa merusak konfigurasi produksi, volume database PostgreSQL, data MQTT, maupun kestabilan jaringan LAN yang sudah aktif.

### TAHAP 1 — Identifikasi Perangkat USB (Read-Only)
1. Tancapkan flashdisk USB ke port belakang motherboard server Debian.
2. Identifikasi nama partisi perangkat menggunakan `lsblk`:
   ```bash
   lsblk -o NAME,SIZE,TRAN,MODEL,FSTYPE,LABEL,MOUNTPOINTS
   ```
   *Bukti yang harus dipastikan:*
   - `TRAN` bernilai `usb`
   - `SIZE` sekitar `57.3G` (atau ~61.5 GB desimal)
   - `LABEL` bernilai `DEBIAN 13_7`
   - `FSTYPE` bernilai `vfat` (FAT32)
   - Jangan menyentuh `sda` (SSD internal server).
3. Mount partisi tersebut secara **Read-Only**:
   ```bash
   mkdir -p /mnt/usb
   # Asumsikan partisi terdeteksi sebagai sdb1 (sesuaikan dengan bukti lsblk)
   mount -o ro,nosuid,nodev /dev/sdb1 /mnt/usb
   ls -la "/mnt/usb/Digital Twin"
   ```

### TAHAP 2 — Pencadangan Konfigurasi & Database Eksisting
Sebelum menyentuh file apa pun di `/opt/digital-twin-datacenter`:
1. Amankan file konfigurasi produksi:
   ```bash
   cp -a /opt/digital-twin-datacenter/.env.server /opt/digital-twin-datacenter/.env.server.production.bak.$(date +%F)
   ```
2. Buat cadangan penuh database PostgreSQL:
   ```bash
   cd /opt/digital-twin-datacenter
   bash deployment/linux/backup.sh
   # Pastikan berkas dump tercipta di backups/postgresql/ tanpa error
   ```

### TAHAP 3 — Penyalinan Source ke Direktori Staging
Hindari menyalin langsung dari USB ke folder produksi `/opt/digital-twin-datacenter`:
```bash
# Buat direktori staging sementara
mkdir -p /opt/staging-digital-twin

# Salin source dari USB ke staging
cp -r "/mnt/usb/Digital Twin/." /opt/staging-digital-twin/

# Lepas mount USB setelah penyalinan selesai
umount /mnt/usb
```

### TAHAP 4 — Sinkronisasi Source Terkontrol & Proteksi File Sensitif
Gunakan perintah `rsync` yang aman dan eksplisit berikut untuk memperbarui kode aplikasi tanpa menimpa konfigurasi produksi:

```bash
# Sinkronisasikan berkas aplikasi ke direktori produksi
rsync -av \
  --exclude='.env*' \
  --exclude='config/private/' \
  --exclude='backups/' \
  --exclude='config/linux/funnel.enabled' \
  /opt/staging-digital-twin/ /opt/digital-twin-datacenter/

# Pastikan template .env.example publik tersedia tanpa menimpa .env.server
cp -n /opt/staging-digital-twin/.env.example /opt/digital-twin-datacenter/.env.example

# Verifikasi mutlak bahwa .env.server produksi tetap ada dan tidak berubah
if [ ! -f /opt/digital-twin-datacenter/.env.server ]; then
  echo "MEMULIHKAN .env.server dari cadangan..."
  cp -a /opt/digital-twin-datacenter/.env.server.production.bak.* /opt/digital-twin-datacenter/.env.server
fi
chmod 600 /opt/digital-twin-datacenter/.env.server
```

### TAHAP 5 — Validasi dan Pembaruan Kontainer Aplikasi
1. Validasi konfigurasi Docker Compose sebelum dijalankan:
   ```bash
   cd /opt/digital-twin-datacenter
   docker compose --env-file .env.server -f docker/compose.yaml -f docker/compose.linux.yaml config --quiet
   ```
2. Jalankan pembaruan layanan:
   ```bash
   bash deployment/linux/start.sh
   bash deployment/linux/status.sh
   ```
3. Verifikasi dashboard LAN:
   - Buka browser dari komputer di jaringan laboratorium: `http://192.168.1.167`.
   - Pastikan visualisasi 3D rak server tampil dan data sensor ESP32/Shelly mengalir via SSE.

### TAHAP 6 — Setup & Autentikasi Tailscale Host
1. Pasang paket Tailscale pada host Debian:
   ```bash
   cd /opt/digital-twin-datacenter
   sudo bash deployment/tailscale/install.sh
   ```
2. Lakukan login interaktif ke Tailnet:
   ```bash
   bash deployment/tailscale/setup.sh
   ```
   *Buka URL otentikasi login yang ditampilkan di layar pada peramban smartphone/laptop Anda.*

### TAHAP 7 — Aktivasi Gateway & Tailscale Funnel
1. Aktifkan listener gateway Nginx publik (127.0.0.1:8080):
   ```bash
   mkdir -p config/linux
   touch config/linux/funnel.enabled
   bash deployment/linux/start.sh
   ```
2. Verifikasi keamanan rute gateway lokal:
   ```bash
   curl -I http://127.0.0.1:8080/
   curl -I http://127.0.0.1:8080/metrics   # Harus 404
   ```
3. Aktifkan Funnel dengan persetujuan eksplisit:
   ```bash
   export DT_PUBLIC_READONLY_APPROVED=1
   bash deployment/tailscale/enable-funnel.sh
   ```
4. Catat URL publik HTTPS aktual yang dilaporkan oleh CLI (misal: `https://debian-server.tailnet-id.ts.net`).

### TAHAP 8 — Pengujian Eksternal & Prosedur Rollback
1. **Pengujian Jaringan Luar:**
   - Matikan koneksi Wi-Fi pada ponsel (gunakan data seluler).
   - Buka URL HTTPS publik yang dicatat.
   - Pastikan dashboard dan grafik telemetri terbaca normal.
   - Pastikan akses LAN di laboratorium (`http://192.168.1.167`) tetap berfungsi.
2. **Prosedur Rollback / Nonaktifkan Funnel:**
   Jika ingin mematikan akses publik kapan saja:
   ```bash
   bash deployment/tailscale/disable-funnel.sh
   ```
   Untuk menghapus gateway publik 8080 sepenuhnya:
   ```bash
   rm -f config/linux/funnel.enabled
   bash deployment/linux/start.sh
   ```

