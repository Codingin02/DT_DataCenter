#!/usr/bin/env bash
# deployment/tailscale/setup.sh
# Melakukan autentikasi interaktif mesin server ke Tailnet dalam mode ROOT (su -) tanpa menyimpan credential/auth key.

set -Eeuo pipefail

echo "=== [Digital Twin] Setup & Autentikasi Tailscale (Mode ROOT) ==="

# 1. Validasi Hak Akses Root
if [[ "$(id -u)" != 0 ]]; then
  echo "Error: Skrip ini membutuhkan hak akses root. Masuk terlebih dahulu dengan 'su -'." >&2
  exit 1
fi

# 2. Periksa ketersediaan perintah tailscale
if ! command -v tailscale >/dev/null 2>&1; then
  echo "Error: Perintah 'tailscale' belum terpasang." >&2
  echo "Jalankan 'bash deployment/tailscale/install.sh' terlebih dahulu." >&2
  exit 1
fi

# 3. Periksa status daemon tailscaled
if ! systemctl is-active --quiet tailscaled; then
  echo "-> Menjalankan service tailscaled..."
  systemctl enable --now tailscaled
fi

# 4. Periksa status autentikasi saat ini
if tailscale status >/dev/null 2>&1; then
  echo "-> Mesin ini sudah terautentikasi di Tailnet!"
  tailscale status
  echo ""
  echo "Informasi perangkat:"
  echo "Node IP: $(tailscale ip -4 2>/dev/null || echo 'N/A')"
  echo "Status: Siap digunakan (Funnel BELUM diaktifkan)."
  exit 0
fi

# 5. Jalankan Autentikasi Interaktif
echo ""
echo "-> Memulai proses autentikasi Tailscale interaktif..."
echo "-> Ikuti tautan (URL) login yang muncul di layar untuk memberikan izin perangkat dari browser akun admin Anda."
echo "-> PERINGATAN KEAMANAN: Jangan memasukkan atau menyimpan auth key / credentials di berkas proyek ini."
echo ""

tailscale up --reset

echo ""
echo "=== HASIL AUTENTIKASI ==="
if tailscale status >/dev/null 2>&1; then
  echo "-> Autentikasi berhasil!"
  tailscale status
  echo "IP Tailscale: $(tailscale ip -4)"
  echo ""
  echo "PENTING: Tailscale Funnel TIDAK diaktifkan secara otomatis."
  echo "Untuk mengaktifkan Funnel publik, jalankan: 'bash deployment/tailscale/enable-funnel.sh'."
else
  echo "Peringatan: Autentikasi belum selesai atau dibatalkan." >&2
  exit 1
fi
