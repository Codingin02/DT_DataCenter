#!/usr/bin/env bash
# deployment/tailscale/status.sh
# Memeriksa status Tailscale, gateway publik 8080, Funnel, dan layanan LAN.

set -Eeuo pipefail

echo "=== [Digital Twin] Status Tailscale & Akses Publik ==="

# 1. Status Daemon Tailscaled
echo "[1] Status Daemon Tailscale:"
if command -v tailscale >/dev/null 2>&1; then
  tailscale version | head -n 1
  if systemctl is-active --quiet tailscaled 2>/dev/null; then
    echo "    Layanan: AKTIF (running)"
  else
    echo "    Layanan: TIDAK AKTIF"
  fi
else
  echo "    Tailscale: BELUM TERPASANG"
fi

echo ""

# 2. Status Autentikasi Tailnet
echo "[2] Status Koneksi Tailnet:"
if command -v tailscale >/dev/null 2>&1 && tailscale status >/dev/null 2>&1; then
  echo "    Status: Terhubung"
  echo "    IP Tailscale: $(tailscale ip -4 2>/dev/null || echo 'N/A')"
  echo "    Device Name:  $(tailscale whoami 2>/dev/null | head -n 1 || tailscale status | grep -m1 'self' || echo 'N/A')"
else
  echo "    Status: Belum terhubung / belum login"
fi

echo ""

# 3. Status Gateway Nginx Lokal (127.0.0.1:8080)
echo "[3] Status Gateway Read-Only Lokal (127.0.0.1:8080):"
if curl --fail --silent --max-time 2 http://127.0.0.1:8080/ >/dev/null 2>&1; then
  echo "    Status: AKTIF (Merespons pada 127.0.0.1:8080)"
else
  echo "    Status: NONAKTIF / Belum dimuat (Override funnel.enabled belum diaktifkan)"
fi

echo ""

# 4. Status Akses Publik Tailscale Funnel
echo "[4] Status Tailscale Funnel (HTTPS):"
if command -v tailscale >/dev/null 2>&1 && tailscale status >/dev/null 2>&1; then
  tailscale funnel status || true
else
  echo "    Funnel: Tidak tersedia (Tailscale offline)"
fi

echo ""

# 5. Status Dashboard LAN Produksi (Port 80)
echo "[5] Status Dashboard LAN (Port 80):"
if curl --fail --silent --max-time 2 http://127.0.0.1:80/ >/dev/null 2>&1 || curl --fail --silent --max-time 2 http://localhost/ >/dev/null 2>&1; then
  echo "    Status: AKTIF & NORMAL (Dapat diakses di LAN: http://192.168.1.167:80)"
else
  echo "    Status: Menunggu container (Periksa dengan 'bash deployment/linux/status.sh')"
fi
echo "====================================================="
