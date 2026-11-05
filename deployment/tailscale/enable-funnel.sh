#!/usr/bin/env bash
# deployment/tailscale/enable-funnel.sh
# Mengaktifkan Tailscale Funnel dalam mode ROOT (su -) untuk meneruskan HTTPS publik (port 443) ke gateway read-only lokal (127.0.0.1:8080).

set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "=== [Digital Twin] Validasi Keamanan & Aktivasi Tailscale Funnel (Mode ROOT) ==="

# 1. Validasi Hak Akses Root
if [[ "$(id -u)" != 0 ]]; then
  echo "Error: Skrip ini membutuhkan hak akses root. Masuk terlebih dahulu dengan 'su -'." >&2
  exit 1
fi

# 2. Validasi Persetujuan Eksplisit Publikasi Telemetri
if [[ "${DT_PUBLIC_READONLY_APPROVED:-0}" != 1 ]]; then
  echo "PERINGATAN KEAMANAN: Membuka Funnel akan mengekspos telemetri pembacaan sensor ke internet publik." >&2
  echo "Untuk menyetujui, jalankan perintah berikut secara eksplisit:" >&2
  echo "" >&2
  echo "  export DT_PUBLIC_READONLY_APPROVED=1" >&2
  echo "  bash deployment/tailscale/enable-funnel.sh" >&2
  echo "" >&2
  exit 1
fi

# 3. Periksa Instalasi & Status Tailscale
if ! command -v tailscale >/dev/null 2>&1; then
  echo "Error: Tailscale belum terpasang." >&2
  exit 1
fi

if ! systemctl is-active --quiet tailscaled; then
  echo "Error: Layanan tailscaled tidak berjalan." >&2
  exit 1
fi

if ! tailscale status >/dev/null 2>&1; then
  echo "Error: Tailscale belum terautentikasi. Jalankan 'bash deployment/tailscale/setup.sh' dahulu." >&2
  exit 1
fi

# 4. Pastikan Gateway Nginx Khusus Funnel (127.0.0.1:8080) Berjalan
echo "-> Memeriksa ketersediaan gateway Nginx khusus Funnel (127.0.0.1:8080)..."
if ! curl --fail --silent --max-time 3 http://127.0.0.1:8080/ >/dev/null 2>&1; then
  echo "Error: Gateway publik pada 127.0.0.1:8080 tidak merespons." >&2
  echo "Pastikan kontainer Nginx gateway diaktifkan dengan:" >&2
  echo "  mkdir -p config/linux" >&2
  echo "  touch config/linux/funnel.enabled" >&2
  echo "  bash deployment/linux/start.sh" >&2
  exit 1
fi

# 5. Uji Keamanan Route Allowlist & Blocklist
echo "-> Menjalankan audit keamanan rute terlarang pada gateway lokal..."

for path in /metrics /ready /health /nginx-health /api/not-allowed; do
  code="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 3 "http://127.0.0.1:8080$path")"
  if [[ "$code" != "403" && "$code" != "404" ]]; then
    echo "PELANGGARAN KEAMANAN: Rute '$path' mengembalikan status HTTP $code (harus 403/404)!" >&2
    exit 1
  fi
done

post_code="$(curl --silent -X POST --output /dev/null --write-out '%{http_code}' --max-time 3 http://127.0.0.1:8080/api/spatial-registration)"
if [[ "$post_code" != "403" ]]; then
  echo "PELANGGARAN KEAMANAN: POST ke /api/spatial-registration tidak ditolak (status: $post_code, harus 403)!" >&2
  exit 1
fi

echo "-> Verifikasi keamanan rute gateway lokal: LULUS (read-only terisolasi)."

# 6. Aktifkan Tailscale Funnel (Port 443 -> 127.0.0.1:8080)
echo "-> Mengaktifkan Tailscale Funnel pada port 443..."
if ! tailscale funnel --bg --https=443 http://127.0.0.1:8080; then
  echo "" >&2
  echo "Error: Gagal mengaktifkan Tailscale Funnel." >&2
  echo "Kemungkinan penyebab:" >&2
  echo "1. Kebijakan ACL (Access Control Lists) Tailnet Anda belum memberikan izin 'nodeAttrs' capability Funnel." >&2
  echo "   Periksa: https://login.tailscale.com/admin/acls" >&2
  echo "2. HTTPS / MagicDNS belum diaktifkan pada akun Tailscale." >&2
  echo "   Periksa: https://login.tailscale.com/admin/dns" >&2
  exit 1
fi

# 7. Verifikasi Status Akhir
echo ""
echo "=== STATUS AKTIVASI FUNNEL ==="
tailscale funnel status
echo ""
echo "Catatan: Dashboard LAN pada http://192.168.1.167:80 tetap berjalan normal."
echo "Untuk mematikan akses publik kapan saja: 'bash deployment/tailscale/disable-funnel.sh'."
