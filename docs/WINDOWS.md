# Windows

## Environment dan startup

Dari folder `Digital Twin`, gunakan Docker Desktop mode Linux containers dan PowerShell. Semua path dihitung relatif lokasi skrip; tidak ada ketergantungan `/opt`.

```powershell
docker info
docker compose version
# Hanya jika belum ada file operasional:
if (-not (Test-Path .env.windows)) { Copy-Item deployment/windows/.env.example .env.windows }
# Edit secara privat, lalu:
& ./deployment/windows/install.ps1
& ./deployment/windows/start.ps1
& ./deployment/windows/status.ps1
```

`.env.windows` USB mempertahankan credential dari konfigurasi USB yang ditemukan, menggunakan backend bind loopback, broker loopback, dan menonaktifkan collector host sampai NIC diketahui. `config/windows/.env.recovered` adalah salinan konfigurasi asal, **bukan** env Windows aktif. Lindungi env dengan ACL NTFS pada host Windows. FAT32 USB tidak menyediakan ACL ini.

## Monitoring host Windows

Node Exporter dinonaktifkan oleh override Windows. Installer ini ditujukan untuk **Windows Exporter v0.31.3** (fitur MSI DefaultFeature, tanpa FirewallException). Unduh pada host dari https://github.com/prometheus-community/windows_exporter/releases/tag/v0.31.3, cocokkan checksum rilis resmi dan arsitektur, lalu:

```powershell
# Elevated PowerShell; gunakan path MSI dan SHA256 rilis yang benar.
& ./deployment/windows/install-monitoring.ps1 -Msi C:\Installers\windows_exporter.msi -Sha256 $VerifiedReleaseSha256
Get-Service windows_exporter
Get-NetAdapter | Select-Object Name, InterfaceDescription, Status, LinkSpeed
Invoke-WebRequest http://127.0.0.1:9182/metrics -UseBasicParsing
```

Installer memakai collector `net`, port 9182, dan tidak menambahkan pengecualian firewall. Startup service diatur dan diperiksa **Manual**, sesuai kebijakan host; gunakan `Start-Service windows_exporter` ketika monitoring diperlukan. Setelah reboot Windows, jalankan kembali service ini secara eksplisit sebelum mengharapkan metrik. Izinkan hanya sumber Docker Desktop yang dibutuhkan melalui kebijakan firewall Windows; jangan membuka 9182 ke internet. Pastikan endpoint dapat dijangkau **dari backend container**, lalu isi env:

```dotenv
HOST_EXPORTER_URL=http://host.docker.internal:9182/metrics
HOST_EXPORTER_PLATFORM=windows
HOST_DEVICE_ID=host-dt-datacenter
HOST_NETWORK_NIC=<label nic persis pada metrik windows_net_*>
```

Nama adapter PowerShell belum tentu sama persis dengan label exporter. Periksa label aktual, bukan menebak `Ethernet` atau `Wi-Fi`. Setelah konfigurasi berubah, recreate backend memakai Compose di bawah.

## Operasi, logs, recreate

```powershell
$dc = @('compose','--env-file','.env.windows','-p','dt_datacenter','-f','docker/compose.yaml','-f','docker/compose.windows.yaml')
docker @dc config --quiet
docker @dc ps
docker @dc logs --tail 100 backend
docker @dc logs --tail 100 mosquitto
docker @dc logs --tail 100 nginx
docker @dc logs --tail 100 postgres
docker @dc exec -T nginx nginx -t
docker @dc up -d --no-build --force-recreate --wait backend
& ./deployment/windows/stop.ps1
& ./deployment/windows/start.ps1
```

`restart` tidak memuat ulang environment; gunakan recreate jika env berubah. Jangan gunakan `down -v`.

## Update dan backup/restore

```powershell
& ./deployment/windows/backup.ps1
& ./deployment/windows/restore.ps1 -Archive C:\Data\DigitalTwin.dump -Database dt_datacenter_restore_verify
& ./deployment/windows/update.ps1
```

Backup menggunakan `docker compose cp`, bukan redirection PowerShell yang dapat merusak arsip biner pada PowerShell lama. Restore menolak database operasional dan target existing; DB verifikasi ditinggalkan untuk inspeksi. Update mensyaratkan working tree bersih dan branch main, membuat backup dahulu, lalu `git pull --ff-only`, validasi Compose, build, pengujian konfigurasi Nginx/Mosquitto di container sementara, dan recreate eksplisit broker/backend/Nginx agar perubahan file bind mount benar-benar dimuat. Ada jeda koneksi layanan saat recreate; jadwalkan pemeliharaan. Tidak menjalankan migration destruktif atau menghapus volume. [Pemulihan](DATABASE.md).

## Jaringan perangkat

Jangan menjalankan Windows dan Debian sebagai broker/device collector yang bersaing untuk perangkat sama. Deployment aktif tetap Debian. Untuk pengujian Windows dengan perangkat, perlu izin terpisah sebelum memindahkan broker/SSID atau mengganti MQTT client ID. MQTT default loopback pada template Windows sengaja tidak dapat diakses ESP32 LAN sampai konfigurasi alamat disetujui.

Troubleshooting: pastikan Docker Linux containers aktif, port 80 tidak dipakai IIS, firewall LAN tepat, volume PostgreSQL existing benar, password env sama dengan database yang sudah diinisialisasi. [Daftar lengkap](TROUBLESHOOTING.md).
