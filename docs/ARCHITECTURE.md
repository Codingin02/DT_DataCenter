# Arsitektur Digital Twin

```text
SHT31-A (I2C0) ─┐
SHT31-B (I2C1) ─┼→ ESP32-S3 → Wi-Fi Lab HINT → MQTT Mosquitto ─┐
INMP441 (I2S) ──┘                                             │
Shelly Plug PM Gen3 → status/events/RPC MQTT ───────────────────┤
Host enp11s0 → Node Exporter → collector backend → MQTT ────────┤
                                                             ↓
                                                  backend ingestion
                                                             ↓
                                              PostgreSQL digital_twin
                                                             ↓
                                                   HTTP API dan SSE
                                                             ↓
                                             Nginx → frontend/browser

Internet → HTTPS Funnel pada host Debian
         → 127.0.0.1:8080 Nginx (allowlist read-only)
         → backend yang sama → frontend yang sama
LAN → Nginx port 80 (fungsi lokal dipertahankan)
```

Nama NIC `enp11s0` berasal dari referensi server pengguna; belum diverifikasi langsung. USB sebelumnya memakai `enp0s3`. Collector Windows memakai Windows Exporter dan NIC Windows, bukan kedua nama NIC Linux tersebut.

## Komponen

- ESP32-S3: akuisisi/validasi, SNTP, identitas boot/sequence, Wi-Fi dan MQTT. GPIO8/9 untuk SHT31-A, GPIO10/11 untuk SHT31-B; I2C 50 kHz dan pembacaan 1 Hz sesuai kontrak. INMP441: WS4/BCLK5/DIN6, kanal kiri, 48 kHz; dBFS bukan dBA/dBSPL terkalibrasi.
- Shelly: pembacaan listrik melalui status MQTT/RPC; backend tidak mengubah konfigurasi perangkat pada startup.
- Mosquitto: autentikasi wajib, port LAN 1883, data session persisten pada override OS baru.
- `backend/config.js`: validasi env. `server.js`: MQTT/DB/collector dan lifecycle. `app.js`: ingestion serta HTTP. `shelly.js`: normalisasi Shelly. `host-network.js`: parsing dan rate RX/TX.
- PostgreSQL: registry, canonical measurements, current state, device state, spatial registration dan audit ingestion. Struktur tepat di migration serta kontrak foundation.
- Frontend: Three.js/WebGL untuk rack, ECharts untuk histori; tidak ada perubahan visual pada pekerjaan deployment ini.
- Nginx: reverse proxy, SSE tanpa buffering; listener Funnel memakai allowlist terpisah.

QoS 1 diakui setelah transaksi DB selesai. Validasi dan deduplikasi tetap mengikuti kontrak existing; tidak ada perubahan payload maupun skema.

## Batas kepercayaan

MQTT 1883 bukan TLS: hanya LAN tepercaya dengan autentikasi, tanpa port forwarding internet. `compose.server.yaml` adalah opsi TLS/VPN lanjutan, **bukan** jalur deployment default; jangan menerapkannya pada perangkat 1883 tanpa migrasi yang disetujui. Funnel menyediakan HTTPS browser, bukan enkripsi koneksi MQTT perangkat.

Hanya server dedicated yang diizinkan boleh diakses. Server rack atas tetap di luar cakupan.
