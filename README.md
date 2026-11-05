# Digital Twin

Monitoring satu rack melalui ESP32-S3 (dua SHT31 dan INMP441), Shelly Plug PM Gen3, dan metrik jaringan host. MQTT → backend Node.js → PostgreSQL → API/SSE → dashboard Three.js/ECharts. Identifier teknis repository tetap `DT_DataCenter`.

## Satu source, dua target OS

Source utama berada langsung di folder **Digital Twin**, bukan di subfolder duplikat. Deployment Debian tetap `/opt/digital-twin-datacenter`; direktori aktif server tidak dipindahkan.

```text
Digital Twin/
  backend/ frontend/ assets/ database/
  firmware/ESP32/                  panduan firmware aktif dan template konfigurasi
  firmware/esp32s3_datacenter/      implementasi ESP-IDF terpisah, bukan otoritas board aktif
  docker/                         Compose utama dan override OS
  infra/nginx/                    Nginx LAN dan listener publik read-only
  deployment/windows/             PowerShell
  deployment/linux/               Bash
  deployment/resources/           image/paket USB satu salinan, tidak dipublikasikan
  config/windows/ config/linux/   konfigurasi lokal privat
  config/private/                 arsip credential dan bukti pemulihan; tidak dipublikasikan
  scripts/ docs/ backups/
```

### Windows 10/11

Docker Desktop harus memakai **Linux containers**. Dari folder Digital Twin:

```powershell
if (-not (Test-Path .env.windows)) { Copy-Item deployment/windows/.env.example .env.windows }
# Isi credential sendiri secara privat; jangan menimpa .env.windows yang sudah tersedia.
& ./deployment/windows/install.ps1
& ./deployment/windows/start.ps1
& ./deployment/windows/status.ps1
& ./deployment/windows/stop.ps1
```

Pada USB, `.env.windows` sudah disiapkan memakai credential yang ditemukan. Jangan menggantinya dengan template kosong. Windows Exporter dipasang pada host Windows, bukan memakai Node Exporter Linux. Collector host dinonaktifkan sampai URL exporter dan nama NIC Windows diisi berdasarkan pengukuran aktual. Lihat [Windows](docs/WINDOWS.md).

### Debian

```bash
cd /opt/digital-twin-datacenter
# Hanya untuk instalasi baru; JANGAN timpa environment server existing.
(umask 077; cp -n deployment/linux/.env.example .env.server)
# Isi credential privat dan verifikasi NIC, broker LAN, database serta volume.
bash deployment/linux/install.sh
bash deployment/linux/start.sh
bash deployment/linux/status.sh
```

Installer tidak memindahkan deployment, menambah alias IP, mengubah Wi-Fi atau mengonfigurasi Shelly. `.env.server` server belum berhasil diambil; `.env`/`.env.debian` USB dipertahankan sebagai bukti konfigurasi yang ditemukan, bukan diklaim identik dengan server. Lihat [Linux](docs/LINUX.md).

## Website dan keamanan

Website LAN melalui Nginx port 80. PostgreSQL tidak dipublikasikan; port aplikasi host default 3010 terikat loopback. MQTT tetap LAN dan tidak boleh diteruskan ke internet. Exporter Linux perlu dijangkau container melalui host gateway dan dibatasi firewall host.

Tailscale Funnel hanya diarahkan ke listener Nginx khusus **127.0.0.1:8080**, bukan listener LAN yang masih memiliki fungsi registrasi. Listener publik menolak registrasi, metrik dan endpoint yang tidak diizinkan. Dashboard publik read-only tetap mengungkap telemetri/history; persetujuan pemilik data wajib sebelum aktivasi. [Panduan Funnel](docs/TAILSCALE.md).

## Data dan pemulihan

`stop` mempertahankan volume. Jangan gunakan `down -v`, `volume prune`, atau restore menimpa database operasional. Wrapper backup menghasilkan PostgreSQL custom archive dan menolak overwrite; wrapper restore hanya menerima database disposable **baru** dengan prefix `dt_datacenter_restore_`. [Database](docs/DATABASE.md).

## Dokumentasi

- [PRD](docs/PRD.md), [arsitektur](docs/ARCHITECTURE.md), [kontrak](docs/contracts/foundation.md).
- [Instalasi](docs/INSTALLATION.md), [konfigurasi dan seluruh variabel](docs/CONFIGURATION.md), [Docker](docs/DOCKER.md).
- [MQTT dan Shelly](docs/MQTT.md), [jaringan dan RX/TX](docs/NETWORK.md), [operasi](docs/OPERATIONS.md).
- [Firmware ESP32](firmware/ESP32/README.md), [troubleshooting](docs/TROUBLESHOOTING.md), [status pekerjaan dan pengujian](docs/COMPLETION.md).

## Validasi pengembangan

Gunakan Node.js 24.20.0 (sesuai image) atau versi kompatibel dengan Vite 8.

```bash
npm ci --ignore-scripts
npm run check
```

Jangan commit environment operasional, credential, firmware build, database runtime atau arsip image. USB FAT32 tidak menyediakan proteksi permission Unix yang memadai: jaga akses fisik USB dan gunakan `chmod 600` setelah menyalin secret ke filesystem Linux.
