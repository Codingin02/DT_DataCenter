# Panduan Pemecahan Masalah (Troubleshooting) Tailscale Funnel

Dokumen ini berisi solusi teknis untuk mengatasi kendala yang mungkin ditemui saat pemasangan dan pengoperasian Tailscale Funnel pada server Debian.

---

## 1. Kendala Instalasi & Daemon

### Masalah: `tailscaled: service not found` atau gagal start
**Penyebab:** Paket belum terpasang sempurna atau systemd belum me-reload unit baru.
**Solusi:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now tailscaled
sudo systemctl status tailscaled
```

### Masalah: Instalasi offline gagal karena dependensi `iptables`
**Penyebab:** Paket `iptables` belum ada di sistem base.
**Solusi:**
Instal `iptables` offline yang telah disediakan di USB:
```bash
sudo dpkg -i deployment/resources/packages/iptables_1.8.11-2_amd64.deb
sudo dpkg -i deployment/resources/tailscale/tailscale_1.104.4_amd64.deb
```

---

## 2. Kendala Autentikasi & Koneksi

### Masalah: URL login Tailscale tidak muncul di terminal
**Penyebab:** Perintah dijalankan tanpa terminal interaktif (TTY).
**Solusi:**
Jalankan perintah langsung dengan TTY aktif:
```bash
sudo tailscale up --reset
```
Buka tautan yang tercetak pada layar di peramban (browser) Anda.

### Masalah: Server offline di admin console setelah beberapa saat
**Penyebab:** Fitur key expiry aktif (default 180 hari pada Tailscale).
**Solusi:**
Di Tailscale Admin Console (https://login.tailscale.com/admin/machines), klik menu pada mesin server Debian, pilih **Disable Key Expiry** agar koneksi server tidak terputus otomatis setelah beberapa bulan.

---

## 3. Kendala Aktivasi Funnel

### Masalah: `Funnel is not available on this tailnet` atau `Funnel is not allowed by ACL`
**Penyebab:** Akun Tailscale belum memberikan capability funnel pada kebijakan ACL.
**Solusi:**
1. Masuk ke: https://login.tailscale.com/admin/acls
2. Tambahkan izin `funnel` pada bagian `nodeAttrs`:
   ```json
   "nodeAttrs": [
     {
       "target": ["*"],
       "attr": ["funnel"]
     }
   ]
   ```
3. Simpan perubahan ACL, lalu coba aktifkan kembali:
   ```bash
   bash deployment/tailscale/enable-funnel.sh
   ```

### Masalah: `HTTPS certificate not configured`
**Penyebab:** MagicDNS atau integrasi sertifikat HTTPS belum aktif pada tailnet.
**Solusi:**
Buka https://login.tailscale.com/admin/dns dan aktifkan toggle **Enable HTTPS Certificates**.

---

## 4. Kendala Akses Gateway & Nginx

### Masalah: `Gateway publik pada 127.0.0.1:8080 tidak merespons` saat `enable-funnel.sh`
**Penyebab:** Kontainer Nginx belum memuat konfigurasi `compose.funnel.yaml`.
**Solusi:**
1. Pastikan file marker ada:
   ```bash
   ls -la config/linux/funnel.enabled
   ```
   *(Jika belum ada: `mkdir -p config/linux && touch config/linux/funnel.enabled`)*
2. Muat ulang kontainer:
   ```bash
   bash deployment/linux/start.sh
   ```
3. Periksa apakah port 8080 sudah mendengarkan di host:
   ```bash
   curl -I http://127.0.0.1:8080/
   ```

### Masalah: Status HTTP 403 Forbidden saat membuka URL Funnel dari internet
**Penyebab:** Anda mencoba mengakses rute yang memang diblokir untuk publik (seperti `/api/spatial-registration` atau metode POST).
**Solusi:**
Buka URL root: `https://<nama-mesin>.<tailnet>.ts.net/`. Rute root (`/`) dan asset statik dijamin dapat diakses.

### Masalah: Status HTTP 404 Not Found untuk `/metrics` atau `/ready`
**Penyebab:** Ini **BUKAN** error, melainkan perilaku keamanan yang dirancang sengaja. Metrik infrastruktur internal sengaja ditolak pada gateway publik.

---

## 5. Prosedur Pemulihan (Emergency Reset)

Jika konfigurasi Funnel macet atau perlu di-reset secara bersih:

```bash
# 1. Hentikan Funnel seketika
tailscale funnel --https=443 off

# 2. Reset konfigurasi Serve/Funnel lokal
tailscale serve reset

# 3. Periksa status
tailscale funnel status
```
Setelah langkah di atas, layanan server akan kembali murni ke mode lokal LAN.
