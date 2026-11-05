#!/usr/bin/env bash
# deployment/tailscale/uninstall.sh
# Menghapus paket Tailscale secara aman dalam mode ROOT (su -) tanpa menyentuh data atau kontainer Digital Twin.

set -Eeuo pipefail

if [[ "$(id -u)" != 0 ]]; then
  echo "Error: Skrip ini membutuhkan hak akses root. Masuk terlebih dahulu dengan 'su -'." >&2
  exit 1
fi

echo "=== [Digital Twin] Pencopotan Paket Tailscale (Mode ROOT) ==="
echo "Peringatan: Tindakan ini akan menghentikan akses Tailscale pada server."
echo "Data Digital Twin, named volumes Docker, database PostgreSQL, dan broker MQTT TIDAK akan terpengaruh."
echo ""

read -r -p "Apakah Anda yakin ingin mencopot Tailscale? (y/N): " confirm
if [[ "${confirm:-}" != "y" && "${confirm:-}" != "Y" ]]; then
  echo "Operasi dibatalkan."
  exit 0
fi

# 1. Matikan Funnel terlebih dahulu
if command -v tailscale >/dev/null 2>&1; then
  echo "-> Menonaktifkan Tailscale Funnel..."
  tailscale funnel --https=443 off >/dev/null 2>&1 || true
  tailscale down >/dev/null 2>&1 || true
fi

# 2. Hentikan service tailscaled
echo "-> Menghentikan service tailscaled..."
systemctl disable --now tailscaled >/dev/null 2>&1 || true

# 3. Hapus paket tailscale
echo "-> Menghapus paket tailscale..."
apt-get remove -y tailscale || dpkg -r tailscale || true

echo ""
echo "Tailscale telah dicopot dari server."
echo "Konfigurasi server LAN, Docker, database, dan file proyek tetap utuh."
