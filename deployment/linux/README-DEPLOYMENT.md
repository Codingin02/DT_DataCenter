# Panduan Utama Deployment Server Debian (Mode ROOT su -)

Dokumen ini adalah runbook utama untuk melaksanakan deployment Digital Twin Data Center langsung dari USB flashdisk ke server fisik Debian.

---

## 1. Persiapan Awal di Depan Server Fisik

1. Masuk ke server sebagai **ROOT**:
   ```bash
   su -
   ```
2. Tancapkan USB flashdisk ke port USB belakang server.
3. Periksa nama partisi USB menggunakan `lsblk`:
   ```bash
   lsblk -o NAME,SIZE,TRAN,MODEL,FSTYPE,LABEL,MOUNTPOINTS
   ```
   *Pastikan perangkat berlabel `DEBIAN 13_7`, ukuran ~57.3 GB, transport `usb` (misalnya `/dev/sdb1`).*
4. Mount USB secara Read-Only:
   ```bash
   mkdir -p /mnt/usb
   mount -o ro /dev/sdb1 /mnt/usb
   cd "/mnt/usb/Digital Twin"
   ```

---

## 2. Menjalankan Deployment Satu Pintu (Master Orchestrator)

Untuk kemudahan maksimal, jalankan skrip master deploy:

```bash
bash deployment/linux/deploy.sh
```

Menu interaktif akan tampil di layar terminal:

```text
==========================================================
 DIGITAL TWIN DATA CENTER — MASTER DEPLOYMENT (ROOT MODE) 
==========================================================
 1) Preflight Check         (Pemeriksaan kesiapan sistem)
 2) Backup Deployment Lama  (Cadangkan database & konfigurasi)
 3) Deploy Penuh            (Backup -> Sync -> Start)
 4) Verifikasi Layanan      (Cek container & Dashboard LAN)
 5) Pasang Tailscale        (Instal paket host)
 6) Autentikasi Tailscale   (Login interaktif Tailnet)
 7) Aktifkan Funnel         (Buka akses HTTPS publik)
 8) Nonaktifkan Funnel      (Kembali ke mode LAN saja)
 9) Status Sistem           (Cek seluruh layanan)
 10) Rollback               (Pulihkan dari backup terakhir)
 0) Keluar
==========================================================
```

### Opsi A: Deployment Otomatis Cepat (Pilih Opsi 3)
Ketik `3` lalu tekan Enter. Skrip akan secara berurutan:
1. Memvalidasi sistem (Preflight).
2. Mencadangkan konfigurasi `.env.server` dan database aktif ke `/opt/backups/digital-twin/`.
3. Menyiapkan staging di `/opt/staging-digital-twin/`.
4. Melakukan sinkronisasi selektif ke `/opt/digital-twin-datacenter/` tanpa menimpa kredensial produksi.
5. Memvalidasi Docker Compose.
6. Memperbarui dan menyalakan kontainer aplikasi.
7. Memverifikasi Dashboard LAN (`http://192.168.1.167`).

---

## 3. Langkah Lanjutan: Menyiapkan Akses Publik Tailscale Funnel

Setelah aplikasi berjalan normal di LAN laboratorium:

1. **Pasang Tailscale (Opsi 5):**
   ```bash
   bash deployment/linux/deploy.sh tailscale-install
   ```
   *Menginstal dari paket offline lokal di USB jika tersedia.*
2. **Autentikasi Perangkat (Opsi 6):**
   ```bash
   bash deployment/linux/deploy.sh tailscale-setup
   ```
   *Buka URL login yang muncul di terminal pada smartphone/laptop Anda.*
3. **Aktifkan Funnel (Opsi 7):**
   ```bash
   bash deployment/linux/deploy.sh funnel-enable
   ```
   *Skrip akan memvalidasi bahwa hanya rute read-only yang diizinkan dan mencetak URL HTTPS publik.*

---

## 4. Perintah Cepat Non-Interaktif

Anda juga dapat menjalankan tahapan langsung melalui argumen CLI:

```bash
# Menjalankan deploy penuh
bash deployment/linux/deploy.sh deploy

# Memeriksa status sistem
bash deployment/linux/deploy.sh status

# Mematikan akses publik Funnel kapan saja
bash deployment/linux/deploy.sh funnel-disable
```
