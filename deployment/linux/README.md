# Deployment Debian

Source sama pada root `Digital Twin`; server aktif tetap `/opt/digital-twin-datacenter`. Env server `.env.server`, override `docker/compose.linux.yaml`. Panduan lengkap: [LINUX.md](../../docs/LINUX.md).

Skrip: install/start/stop/status/update/backup/restore. `install.sh --install-docker` memasang Docker Engine dari repository resmi setelah cek konflik. `install-tailscale.sh` memasang daemon host tanpa login otomatis. `funnel.sh` menyediakan status/off/enable dengan gate keamanan; lihat [TAILSCALE.md](../../docs/TAILSCALE.md).
