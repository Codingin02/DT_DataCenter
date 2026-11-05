#!/usr/bin/env bash
# deployment/tailscale/install.sh
# Memasang Tailscale pada host Debian dalam mode ROOT (su -) menggunakan paket offline lokal atau repositori resmi.

set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
RESOURCES_DIR="$ROOT/deployment/resources/tailscale"

echo "=== [Digital Twin] Pemeriksaan & Instalasi Tailscale (Mode ROOT) ==="

# 1. Validasi Hak Akses Root
if [[ "$(id -u)" != 0 ]]; then
  echo "Error: Skrip ini membutuhkan hak akses root. Masuk terlebih dahulu dengan 'su -'." >&2
  exit 1
fi

# 2. Validasi Sistem Operasi Debian
if [[ ! -f /etc/os-release ]]; then
  echo "Error: /etc/os-release tidak ditemukan; sistem operasi tidak didukung." >&2
  exit 1
fi

. /etc/os-release

if [[ "${ID:-}" != "debian" ]]; then
  echo "Error: Skrip ini dikhususkan untuk Debian (terdeteksi: ${ID:-unknown})." >&2
  exit 1
fi

echo "-> Sistem Operasi terdeteksi: Debian ($VERSION_CODENAME)"

# 3. Validasi Arsitektur CPU
ARCH="$(dpkg --print-architecture 2>/dev/null || uname -m)"
if [[ "$ARCH" != "amd64" && "$ARCH" != "x86_64" ]]; then
  echo "Error: Arsitektur CPU '$ARCH' tidak didukung. Membutuhkan amd64/x86_64." >&2
  exit 1
fi

echo "-> Arsitektur CPU: $ARCH"

# 4. Periksa apakah Tailscale sudah terpasang
if command -v tailscale >/dev/null 2>&1; then
  echo "-> Tailscale sudah terpasang di sistem:"
  tailscale version
  echo "-> Status layanan tailscaled:"
  systemctl is-active tailscaled || systemctl enable --now tailscaled
  exit 0
fi

# 5. Cek Ketersediaan Paket Offline Lokal
LOCAL_DEB=""
if [[ -d "$RESOURCES_DIR" ]]; then
  FOUND_DEB="$(find "$RESOURCES_DIR" -maxdepth 1 -name "tailscale_*_amd64.deb" | sort -V | tail -n 1 || true)"
  if [[ -n "$FOUND_DEB" && -f "$FOUND_DEB" ]]; then
    LOCAL_DEB="$FOUND_DEB"
  fi
fi

if [[ -n "$LOCAL_DEB" ]]; then
  echo "-> Menemukan paket instalasi offline: $(basename "$LOCAL_DEB")"
  
  if [[ -f "$RESOURCES_DIR/SHA256SUMS" ]]; then
    echo "-> Memverifikasi checksum SHA-256 paket lokal..."
    (cd "$RESOURCES_DIR" && sha256sum --check --ignore-missing SHA256SUMS) || {
      echo "Peringatan: Checksum tidak cocok; membatalkan instalasi dari paket lokal." >&2
      LOCAL_DEB=""
    }
  fi
fi

if [[ -n "$LOCAL_DEB" ]]; then
  echo "-> Menginstal Tailscale dari paket offline..."
  if ! dpkg -s iptables >/dev/null 2>&1; then
    IPTABLES_DEB="$ROOT/deployment/resources/packages/iptables_1.8.11-2_amd64.deb"
    if [[ -f "$IPTABLES_DEB" ]]; then
      echo "-> Menginstal dependensi offline iptables..."
      dpkg -i "$IPTABLES_DEB" || true
    fi
  fi

  dpkg -i "$LOCAL_DEB" || {
    echo "Peringatan: dpkg melaporkan dependensi perlu diselesaikan..."
  }

  systemctl daemon-reload
  systemctl enable --now tailscaled
  echo "-> Berhasil menginstal Tailscale dari paket offline!"
  tailscale version
  exit 0
fi

# 6. Fallback: Panduan Instalasi Online Resmi
echo ""
echo "=== METODE INSTALASI ONLINE (Jika server terhubung ke internet) ==="
echo "Paket offline tidak tersedia atau dependensi belum lengkap."
echo "Jalankan perintah berikut sebagai root:"
echo ""
echo "  apt-get update"
echo "  apt-get install -y ca-certificates curl gnupg"
echo "  install -m 0755 -d /usr/share/keyrings"
echo "  curl -fsSL 'https://pkgs.tailscale.com/stable/debian/$VERSION_CODENAME.noarmor.gpg' | tee /usr/share/keyrings/tailscale-archive-keyring.gpg >/dev/null"
echo "  curl -fsSL 'https://pkgs.tailscale.com/stable/debian/$VERSION_CODENAME.tailscale-keyring.list' | tee /etc/apt/sources.list.d/tailscale.list"
echo "  apt-get update"
echo "  apt-get install -y tailscale"
echo "  systemctl enable --now tailscaled"
echo ""
echo "Catatan: Tidak ada perubahan konfigurasi jaringan produksi server yang dilakukan."
