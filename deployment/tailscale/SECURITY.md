# Kebijakan & Arsitektur Keamanan Akses Publik (Tailscale Funnel)

Dokumen ini menjelaskan model ancaman, pembatasan akses, dan kontrol teknis yang diterapkan untuk melindungi server Debian dan sistem Digital Twin Data Center saat Tailscale Funnel diaktifkan.

---

## 1. Prinsip Keamanan Utama

1. **Prinsip *Least Privilege* & Akses Terbatas:**
   Hanya halaman dashboard visualisasi 3D, stylesheet/javascript, dan pembacaan telemetri read-only yang dibuka ke publik. Seluruh port administratif dan mutasi data ditutup.
2. **Isolasi Jaringan Berlapis (Defense in Depth):**
   - Internet publik tidak pernah terhubung langsung ke kontainer backend atau database.
   - Tailscale Funnel hanya berbicara dengan reverse proxy Nginx pada alamat loopback lokal `127.0.0.1:8080`.
   - Port 8080 terikat khusus pada loopback host (`127.0.0.1`), sehingga tidak bisa diakses langsung dari jaringan LAN.
3. **Pemberian Izin Eksplisit (*Explicit Consent*):**
   Aktivasi Funnel membutuhkan variabel lingkungan `DT_PUBLIC_READONLY_APPROVED=1` untuk memastikan administrator menyetujui bahwa data telemetri suhu/kelembaban/daya dapat dibaca publik.
4. **Zero Secrets in Storage:**
   Tidak ada auth key, password, cookie sesi, atau token yang disimpan dalam skrip, file konfigurasi, USB, maupun git commit.

---

## 2. Pemisahan Layanan: Publik vs Privat

```
                       [ INTERNET PUBLIK ]
                                | (HTTPS: 443)
                      [ TAILSCALE FUNNEL ]
                                |
                   (HTTP: 127.0.0.1:8080 Loopback)
                                |
               [ GATEWAY PUBLIK NGINX READ-ONLY ]
                 ├── GET / (Dashboard HTML)           --> [ Diizinkan ]
                 ├── GET /assets/*.js, *.css          --> [ Diizinkan ]
                 ├── GET /models/rack.glb             --> [ Diizinkan ]
                 ├── GET /api/current-state/events    --> [ Diizinkan (SSE) ]
                 ├── GET /api/assets/:id/*            --> [ Diizinkan (Read-Only) ]
                 │
                 ├── POST /api/spatial-registration  --> [ DITOLAK: 403 Forbidden ]
                 ├── GET /metrics                     --> [ DITOLAK: 404 Not Found ]
                 ├── GET /health, /ready              --> [ DITOLAK: 404 Not Found ]
                 └── Rute lain / Method selain GET    --> [ DITOLAK ]
```

### Tabel Rincian Port & Visibilitas

| Komponen | Port | Visibilitas Publik (Funnel) | Visibilitas LAN | Keterangan Keamanan |
| :--- | :--- | :--- | :--- | :--- |
| **Tailscale Funnel** | `443` (HTTPS) | **TERBUKA (Read-Only)** | N/A | Dikelola & dienkripsi oleh Tailscale MagicDNS |
| **Gateway Publik** | `8080` | Terusan dari Funnel | **DITUTUP** (`127.0.0.1:8080`) | Loopback host saja, tidak listen di 0.0.0.0 |
| **Nginx LAN Dashboard** | `80` (HTTP) | **DITUTUP** | **TERBUKA** (`0.0.0.0:80`) | Dashboard penuh untuk workstation/laptop lab |
| **Mosquitto MQTT** | `1883` | **DITUTUP MUTLAK** | **TERBUKA** (`0.0.0.0:1883`) | Hanya untuk sensor ESP32-S3 & Shelly di LAN |
| **PostgreSQL** | `5432` | **DITUTUP MUTLAK** | **DITUTUP** (Internal Docker) | Hanya dapat diakses oleh kontainer backend |
| **Backend Raw** | `3000` | **DITUTUP MUTLAK** | **DITUTUP** (Internal Docker) | Hanya dapat diakses oleh upstream Nginx |
| **Node Exporter** | `9100` | **DITUTUP MUTLAK** | Terisolasi | Metrik host tidak diekspos ke Funnel |

---

## 3. Perlindungan terhadap Serangan Web Umum

1. **Perlindungan Terhadap Mutasi Data:**
   Endpoint `/api/spatial-registration` yang digunakan untuk menetapkan posisi sensor rack diblokir secara eksplisit dengan status `403 Forbidden` pada gateway publik.
2. **Perlindungan Terhadap Directory Traversal & Information Disclosure:**
   - Nginx menonaktifkan directory listing (`autoindex off`).
   - Akses ke file dotfile (seperti `.env`, `.git`) ditolak otomatis.
   - Header keamanan ditambahkan pada setiap respon:
     - `X-Content-Type-Options: nosniff` (mencegah MIME confusion)
     - `X-Frame-Options: DENY` (mencegah Clickjacking)
     - `Referrer-Policy: no-referrer` (mencegah kebocoran URL path)
     - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
3. **Penyaringan Ukuran Request:**
   Ukuran body request pada gateway publik dibatasi hingga `16 KB` (`client_max_body_size 16k`), mencegah serangan Denial of Service berbasis payload besar.

---

## 4. Prosedur Penutupan Darurat (Emergency Kill Switch)

Jika terdeteksi anomali atau akses tidak sah, administrator dapat mematikan seluruh akses publik seketika tanpa mematikan server:

```bash
# Matikan listener publik Funnel seketika
tailscale funnel --https=443 off
```
Layanan LAN (dashboard `192.168.1.167:80` dan akuisisi data ESP32/Shelly) akan tetap berjalan tanpa terputus.
