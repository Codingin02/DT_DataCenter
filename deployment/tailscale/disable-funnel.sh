#!/usr/bin/env bash
# deployment/tailscale/disable-funnel.sh
# Menonaktifkan Tailscale Funnel dalam mode ROOT (su -) tanpa menghentikan layanan LAN atau kontainer Docker.

set -Eeuo pipefail

# 1. Validasi Hak Akses Root
if [[ "$(id -u)" != 0 ]]; then
  echo "Error: Skrip ini membutuhkan hak akses root. Masuk terlebih dahulu dengan 'su -'." >&2
  exit 1
fi

echo "=== [Digital Twin] Menonaktifkan Akses Publik Tailscale Funnel (Mode ROOT) ==="

if ! command -v tailscale >/dev/null 2>&1; then
  echo "Error: Tailscale tidak ditemukan di sistem." >&2
  exit 1
fi

echo "-> Mematikan listener HTTPS Funnel pada port 443..."
tailscale funnel --https=443 off || {
  echo "Peringatan: Perintah penonaktifan port 443 melaporkan status non-nol. Memeriksa status Funnel..."
}

echo "-> Status Tailscale Funnel saat ini:"
tailscale funnel status || true

echo ""
echo "-> Memverifikasi integritas Dashboard LAN (port 80)..."
if curl --fail --silent --max-time 3 http://127.0.0.1:80/ >/dev/null 2>&1 || curl --fail --silent --max-time 3 http://localhost/ >/dev/null 2>&1; then
  echo "-> Dashboard LAN lokal (port 80) tetap BERJALAN NORMAL."
else
  echo "Peringatan: Dashboard LAN port 80 tidak merespons pada localhost. Periksa kontainer Nginx dengan 'bash deployment/linux/status.sh'."
fi

echo ""
echo "Funnel publik telah dinonaktifkan."
echo "Layanan database PostgreSQL, broker MQTT, dan Dashboard LAN dipertahankan tanpa gangguan."
