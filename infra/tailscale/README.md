# Konfigurasi Gateway Publik Tailscale Funnel

Direktori ini berisi dokumentasi dan artefak referensi untuk jalur akses publik Tailscale Funnel.

## Konsolidasi Konfigurasi Nginx (Otoritatif)

Konfigurasi reverse proxy aktif yang digunakan oleh Docker Compose berada di:
- **`infra/nginx/funnel.conf`** (di-mount langsung oleh `docker/compose.funnel.yaml` ke `/etc/nginx/conf.d/funnel.conf:ro`).

File duplikat `infra/tailscale/funnel.conf` telah dihapus secara resmi untuk mencegah ambiguitas konfigurasi dan memastikan hanya ada satu konfigurasi aktif (*single source of truth*).

## Arsitektur Pemisahan Akses

- **Gateway Publik:** Mendengarkan **hanya** pada `127.0.0.1:8080` (loopback host yang dipetakan ke port 8080 kontainer Nginx). Port ini tidak dapat diakses langsung oleh perangkat di jaringan LAN.
- **Tailscale Funnel:** Meneruskan lalu lintas HTTPS publik (port 443) langsung ke `http://127.0.0.1:8080`.
- **Nginx LAN Utama:** Tetap mendengarkan pada port `80` untuk operasional penuh di jaringan lokal laboratorium.

## Kontrol Akses & Allowlist

- Route allowlist (Hanya Metode GET):
  - `GET /` (Dashboard HTML)
  - `GET /assets/*.js`, `GET /assets/*.css` (Asset web)
  - `GET /models/rack.glb` (Model 3D)
  - `GET /api/current-state/events` (SSE real-time stream, unbuffered)
  - `GET /api/assets/:id/current-state` (Data sensor unit)
  - `GET /api/assets/:id/history` (Histori telemetri)
- Rute terlarang (Blocked):
  - `POST /api/spatial-registration` $\rightarrow$ `403 Forbidden` (mencegah perubahan posisi sensor dari luar).
  - `/metrics`, `/ready`, `/health`, `/nginx-health` $\rightarrow$ `404 Not Found` (mencegah pengintaian metrik internal).
  - Semua rute HTTP selain `GET` $\rightarrow$ ditolak otomatis (`limit_except GET { deny all; }`).
  - Seluruh rute API lain yang tidak terdaftar $\rightarrow$ `404 Not Found`.

Lihat rincian lengkap pada `allowlist.json` dan `security-headers.conf`.
