# Konfigurasi Gateway Publik Tailscale Funnel

Direktori ini berisi konfigurasi reverse proxy Nginx khusus untuk jalur akses publik Tailscale Funnel.

## Arsitektur Pemisahan Akses

- **Gateway Publik:** Mendengarkan **hanya** pada `127.0.0.1:8080` (loopback). Port ini tidak dapat diakses langsung oleh perangkat di jaringan LAN.
- **Tailscale Funnel:** Meneruskan lalu lintas HTTPS publik (port 443) langsung ke `http://127.0.0.1:8080`.
- **Nginx LAN Utama:** Tetap mendengarkan pada port `80` untuk operasional penuh di jaringan lokal laboratorium.

## Kontrol Akses & Allowlist

- Route allowlist:
  - `GET /` (Dashboard HTML)
  - `GET /assets/*.js`, `GET /assets/*.css` (Asset web)
  - `GET /models/rack.glb` (Model 3D)
  - `GET /api/current-state/events` (SSE real-time stream)
  - `GET /api/assets/:id/current-state` (Data sensor unit)
  - `GET /api/assets/:id/history` (Histori telemetri)
- Rute terlarang (Blocked):
  - `POST /api/spatial-registration` $\rightarrow$ `403 Forbidden` (mencegah perubahan posisi sensor dari luar).
  - `/metrics`, `/ready`, `/health`, `/nginx-health` $\rightarrow$ `404 Not Found` (mencegah pengintaian metrik internal).
  - Semua rute HTTP selain `GET` $\rightarrow$ ditolak otomatis (`limit_except GET { deny all; }`).
  - Seluruh rute API lain yang tidak terdaftar $\rightarrow$ `404 Not Found`.

Lihat rincian lengkap pada `allowlist.json`.
