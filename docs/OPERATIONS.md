# Perintah operasional

Perintah memakai nama service dan file source yang ada. Ini runbook, bukan klaim bahwa server telah diuji. Jangan membagikan log mentah yang mengandung identitas/payload/secret. Jangan menyalakan shell tracing (`set -x`) saat mengolah env.

## Debian: konteks tunggal

```bash
cd /opt/digital-twin-datacenter
dc=(docker compose --env-file .env.server -p dt_datacenter -f docker/compose.yaml -f docker/compose.linux.yaml)
if [ -f config/linux/funnel.enabled ]; then dc+=(-f docker/compose.funnel.yaml); fi
```

Array ini berlaku pada terminal Bash yang sama. Untuk deployment existing yang belum diadaptasi, gunakan dahulu Compose aktif yang terbukti di label container; jangan mengasumsikan override baru sudah digunakan.

### Jaringan, Docker dan logs

```bash
ip -br address
ip -br link
ip route
sudo ss -lntup
sudo systemctl status docker --no-pager
docker version
docker compose version
docker ps --filter label=com.docker.compose.project=dt_datacenter
"${dc[@]}" config --quiet
"${dc[@]}" ps
"${dc[@]}" logs --tail 100 backend
"${dc[@]}" logs --tail 100 mosquitto
"${dc[@]}" logs --tail 100 nginx
"${dc[@]}" logs --tail 100 postgres
"${dc[@]}" logs --tail 100 node-exporter
docker volume inspect dt_datacenter_postgres-data
```

### Start/stop/restart/recreate

```bash
bash deployment/linux/start.sh
bash deployment/linux/stop.sh
bash deployment/linux/status.sh
"${dc[@]}" restart backend
# Jika env/config service berubah, setelah backup dan validasi:
"${dc[@]}" up -d --no-build --force-recreate --wait backend
# Sebelum konfigurasi Nginx diterapkan:
"${dc[@]}" run --rm --no-deps nginx nginx -t
"${dc[@]}" up -d --no-build --force-recreate --wait nginx
```

`restart` bukan pengganti recreate untuk env baru. Jangan `down -v`, prune atau menghapus volume. Node Exporter tidak memiliki healthcheck Docker; periksa HTTP metrics secara terpisah.

### Website, API, SSE, Nginx

```bash
"${dc[@]}" exec -T nginx nginx -t
curl --fail http://127.0.0.1/nginx-health
curl --fail http://127.0.0.1/health
curl --fail http://127.0.0.1/ready
curl --fail http://192.168.1.167/
curl --fail http://127.0.0.1/api/assets/sht31-a/current-state
# curl exit 28 karena --max-time pada SSE stream yang terus terbuka bukan otomatis kegagalan SSE.
curl --no-buffer --max-time 15 http://127.0.0.1/api/current-state/events
```

### Exporter dan NIC RX/TX

```bash
ip -s link show enp11s0
curl --fail --silent http://127.0.0.1:9100/metrics | grep 'node_network_.*device="enp11s0"'
"${dc[@]}" exec -T backend node --input-type=module -e 'const r=await fetch(process.env.HOST_EXPORTER_URL); if(!r.ok) process.exit(1); const text=await r.text(); const nic=process.env.HOST_NETWORK_NIC; const lines=text.split("\n").filter(l=>l.startsWith("node_network_") && l.includes(`device="${nic}"`)); if(!lines.length) process.exit(2); console.log(lines.join("\n"));'
curl --fail http://127.0.0.1/api/assets/host-dt-datacenter/current-state
```

Periksa counter dua kali dengan jeda melebihi poll 5 detik. Jangan menganggap byte total adalah throughput. Sesuaikan NIC hanya setelah bukti label exporter.

### MQTT tanpa password dalam argumen proses

Broker versi 2.1 mendukung client config `-o`. Perintah di bawah membuat file privat di tmpfs container, subscribe maksimal tiga pesan atau 15 detik, lalu menghapusnya:

```bash
"${dc[@]}" exec -T mosquitto sh -ec '
  umask 077
  f=$(mktemp /run/mosquitto/client.XXXXXX)
  trap '\''rm -f "$f"'\'' EXIT
  printf "%s\n" "-u $MQTT_USERNAME" "-P $MQTT_PASSWORD" > "$f"
  mosquitto_sub -o "$f" -h 127.0.0.1 -V 5 -q 1 -t "dt/campus-lab/telemetry/+/+/+" -C 3 -W 15 -F "%t"
'
```

Output hanya topic, bukan payload. Exit 27 dapat berarti tidak ada pesan sebelum timeout, bukan bukti password salah. Untuk Shelly, ubah **filter diagnostik** menjadi `shellyplugpmg3-48f6eebbf3f4/status/+`, bukan topic perangkatnya. Jangan membuat client ID sama dengan backend aktif.

### Database

```bash
"${dc[@]}" exec -T postgres sh -ec 'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT current_database(), current_user;"'
"${dc[@]}" exec -T postgres sh -ec 'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT version FROM digital_twin.schema_migrations ORDER BY version;"'
"${dc[@]}" exec -T postgres sh -ec 'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT count(*) FROM digital_twin.measurements;"'
bash deployment/linux/backup.sh
bash deployment/linux/restore.sh backups/postgresql/manual.dump dt_datacenter_restore_verify
```

Restore hanya contoh **verifikasi** terhadap archive yang benar-benar ada. Jangan menggunakan path contoh tanpa membuat backup dan memeriksa checksum. Wrapper tidak otomatis mengalihkan DB operasional.

### Tailscale dan source

```bash
sudo systemctl status tailscaled --no-pager
tailscale version
tailscale status
tailscale funnel status
tailscale funnel status --json
sudo bash deployment/linux/funnel.sh off
git status --short
git remote -v
git log -5 --oneline
bash deployment/linux/update.sh
```

Aktivasi Funnel wajib mengikuti [panduan keamanan](TAILSCALE.md), bukan menjalankan perintah enable tanpa preflight. Update tidak force push dan tidak membuang perubahan lokal.

## Pemeriksaan publikasi Git

Jika Gitleaks telah dipasang, gunakan CLI yang diverifikasi pada pekerjaan ini:

```bash
git status --short
git diff --cached --name-status
git diff --cached --check
gitleaks git --pre-commit --staged --redact .
gitleaks git --log-opts="--all" --redact .
```

Jangan stage file secara massal. Pastikan hanya template `.env.example`, bukan env operasional, yang masuk commit. Jangan membagikan diff/log mentah bila menemukan secret; laporkan lokasi dan lakukan mitigasi/rotasi melalui prosedur privat.

## Windows

Gunakan array `$dc` dan perintah di [Windows](WINDOWS.md). Pemeriksaan jaringan host:

```powershell
Get-NetIPConfiguration
Get-NetAdapter
Get-NetRoute -DestinationPrefix '0.0.0.0/0'
Get-NetTCPConnection -State Listen
Get-Service com.docker.service -ErrorAction SilentlyContinue
Get-Service windows_exporter -ErrorAction SilentlyContinue
Invoke-WebRequest http://localhost/health -UseBasicParsing
git status --short
& ./deployment/windows/update.ps1
```
