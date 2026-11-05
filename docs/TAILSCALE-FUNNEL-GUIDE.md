# Panduan Lengkap Tailscale Funnel — Akses Publik Digital Twin

Dokumen ini memandu langkah demi langkah mengaktifkan dan mengelola akses publik HTTPS untuk dashboard Digital Twin Data Center menggunakan Tailscale Funnel.

---

## 1. Pengantar & Konsep Utama

**Apa itu Tailscale Funnel?**
Tailscale Funnel adalah fitur yang memungkinkan perangkat di Tailnet Anda meneruskan lalu lintas dari internet publik terbuka (siapa saja yang memiliki URL) ke layanan yang berjalan di server Anda melalui koneksi aman HTTPS terenkripsi TLS otomatis.

**Keunggulan untuk Digital Twin Data Center:**
1. Anda dapat melihat kondisi rak server laboratorium dari rumah atau jaringan seluler tanpa perlu VPN aktif pada smartphone/laptop tamu.
2. Tidak perlu melakukan Port Forwarding di router laboratorium atau meminta IP Publik Statis.
3. Seluruh sertifikat SSL/TLS ditangani dan diperbarui secara otomatis oleh Tailscale Let's Encrypt integration.
4. Database PostgreSQL (5432) dan broker MQTT (1883) tetap 100% terlindung di dalam jaringan lokal.

---

## 2. Prasyarat Akun Tailscale

Sebelum mengaktifkan di server Debian:

1. **Aktifkan Fitur Funnel di Admin Console:**
   Buka panel ACL di: https://login.tailscale.com/admin/acls
   Tambahkan atau pastikan atribut `funnel` diberikan pada tag atau pengguna server Anda:
   ```json
   {
     "nodeAttrs": [
       {
         "target": ["autogroup:member", "tag:server"],
         "attr": ["funnel"]
       }
     ]
   }
   ```
2. **Aktifkan Fitur MagicDNS & HTTPS:**
   Buka https://login.tailscale.com/admin/dns dan pastikan:
   - *MagicDNS* = Enabled
   - *HTTPS Certificates* = Enabled

---

## 3. Langkah Instalasi di Server Debian

### Langkah A: Pasang Paket Tailscale
Di server Debian, jalankan skrip instalasi yang telah disiapkan di USB:

```bash
cd /opt/digital-twin-datacenter
sudo bash deployment/tailscale/install.sh
```
*Skrip ini akan memeriksa ketersediaan paket offline di `deployment/resources/tailscale/` dan menginstalnya tanpa mengubah konfigurasi jaringan server.*

### Langkah B: Autentikasi Perangkat ke Tailnet
```bash
bash deployment/tailscale/setup.sh
```
Terminal akan menampilkan URL otentikasi login Tailscale. Buka URL tersebut di browser smartphone atau laptop Anda, lalu klik **Connect** untuk menyetujui penambahan server ke jaringan Tailscale Anda.

---

## 4. Menyiapkan Gateway Nginx Read-Only (Localhost:8080)

Sebelum Funnel dibuka, gateway Nginx lokal khusus publik harus diaktifkan:

```bash
cd /opt/digital-twin-datacenter

# Buat marker aktivasi gateway publik
mkdir -p config/linux
touch config/linux/funnel.enabled

# Restart container agar Nginx memuat gateway 127.0.0.1:8080
bash deployment/linux/start.sh

# Verifikasi gateway lokal aktif
curl -I http://127.0.0.1:8080/
```

---

## 5. Mengaktifkan Tailscale Funnel

Setelah gateway lokal terbukti aktif dan aman:

```bash
cd /opt/digital-twin-datacenter

# Berikan persetujuan publikasi telemetri
export DT_PUBLIC_READONLY_APPROVED=1

# Jalankan skrip aktivasi
bash deployment/tailscale/enable-funnel.sh
```

Skrip akan secara otomatis:
1. Memverifikasi koneksi daemon Tailscale.
2. Menguji bahwa rute terlarang (`/metrics`, `/ready`, `/health`, POST `/api/spatial-registration`) diblokir.
3. Menjalankan perintah resmi:
   ```bash
   tailscale funnel --bg --https=443 http://127.0.0.1:8080
   ```
4. Menampilkan URL publik yang valid (contoh: `https://debian-server.tailnet-name.ts.net`).

---

## 6. Pemeriksaan Status

Untuk memeriksa kondisi Tailscale dan Funnel setiap saat:
```bash
bash deployment/tailscale/status.sh
```

---

## 7. Menonaktifkan Funnel (Kembali ke Mode LAN Saja)

Untuk mematikan akses publik seketika:
```bash
bash deployment/tailscale/disable-funnel.sh
```

Setelah perintah ini dijalankan:
- Akses HTTPS publik dari luar internet langsung tertutup.
- Dashboard LAN pada `http://192.168.1.167:80` tetap berfungsi normal.
- Seluruh akuisisi data ESP32 dan Shelly tetap berjalan tanpa gangguan.

---

## 8. Rollback Penuh

Jika ingin mengembalikan server ke kondisi awal tanpa gateway port 8080:

```bash
# 1. Matikan Funnel
bash deployment/tailscale/disable-funnel.sh

# 2. Hapus marker funnel gateway
rm -f config/linux/funnel.enabled

# 3. Muat ulang Nginx ke konfigurasi standar LAN saja
bash deployment/linux/start.sh
```
