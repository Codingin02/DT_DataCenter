# Checklist Pra-Aktivasi Tailscale Funnel

Gunakan checklist ini sebelum mengaktifkan Tailscale Funnel pada server Debian produksi.

---

## 1. Verifikasi Jaringan Fisik & Operasional LAN

- [ ] Kabel LAN fisik terhubung kencang ke interface resmi **`enp11s0`** (indikator carrier bernilai `1`).
- [ ] Server merespons pada alamat IP resmi **`192.168.1.167`**.
- [ ] Website LAN dapat diakses melalui browser: `http://192.168.1.167`.
- [ ] Model 3D Nirax rack dan telemetri suhu/kelembaban/daya tampil normal pada dashboard LAN.
- [ ] Broker MQTT menerima data dari ESP32-S3 dan Shelly Plug PM Gen3 pada port `1883`.
- [ ] Database PostgreSQL menyimpan data telemetri tanpa error.

---

## 2. Verifikasi Kesiapan Akun Tailscale

- [ ] Akun Tailscale aktif dan dapat login via browser (menggunakan SSO / email Anda).
- [ ] Fitur **MagicDNS** dan **HTTPS Certificates** diaktifkan pada konsol admin Tailscale:
  - Buka: https://login.tailscale.com/admin/dns
  - Pastikan opsi *Enable HTTPS Certificates* dalam posisi aktif.
- [ ] Kebijakan **Funnel Capability** diizinkan pada ACL Tailnet Anda:
  - Buka: https://login.tailscale.com/admin/acls
  - Pastikan terdapat konfigurasi node capability funnel (misal: `nodeAttrs: [ { target: ["*"], attr: ["funnel"] } ]`).

---

## 3. Verifikasi Gateway Nginx Loopback (127.0.0.1:8080)

- [ ] Marker file `config/linux/funnel.enabled` telah dibuat (`touch config/linux/funnel.enabled`).
- [ ] Kontainer Nginx telah di-restart dengan konfigurasi funnel (`bash deployment/linux/start.sh`).
- [ ] Port 8080 **hanya terikat pada `127.0.0.1`** (bukan `0.0.0.0`):
  ```bash
  ss -tulpn | grep 8080
  # Output HARUS: 127.0.0.1:8080
  ```
- [ ] Uji keamanan route lokal sebelum Funnel aktif:
  ```bash
  curl -I http://127.0.0.1:8080/                   # Harus 200 OK
  curl -I http://127.0.0.1:8080/metrics            # Harus 404 Not Found
  curl -I http://127.0.0.1:8080/health             # Harus 404 Not Found
  curl -X POST http://127.0.0.1:8080/api/spatial-registration  # Harus 403 Forbidden
  ```

---

## 4. Persetujuan dan Aktivasi

- [ ] Pemilik sistem telah menyetujui bahwa telemetri sensor dapat diakses publik melalui URL HTTPS unik.
- [ ] Jalankan aktivasi dengan flag persetujuan:
  ```bash
  export DT_PUBLIC_READONLY_APPROVED=1
  bash deployment/tailscale/enable-funnel.sh
  ```
- [ ] Catat URL HTTPS aktual yang dilaporkan oleh CLI Tailscale (misalnya `https://server-name.tailnet-id.ts.net`).

---

## 5. Uji Pasca Aktivasi dari Jaringan Eksternal

- [ ] Nonaktifkan Wi-Fi pada smartphone Anda (gunakan jaringan seluler 4G/5G).
- [ ] Buka URL HTTPS publik yang diberikan Tailscale di browser smartphone.
- [ ] Pastikan dashboard 3D rack terbuka dan data telemetri real-time mengalir via SSE.
- [ ] Pastikan endpoint terlarang tetap ditolak saat diakses dari luar:
  - Buka `https://<URL-Funnel>/metrics` $\rightarrow$ harus 404 Not Found.
- [ ] Pastikan dashboard LAN di laboratorium tetap berfungsi normal tanpa degradasi performa.
