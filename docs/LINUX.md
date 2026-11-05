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
