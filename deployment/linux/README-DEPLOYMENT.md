# Panduan Utama Deployment Server Debian (Mode ROOT su -)

Dokumen ini adalah runbook utama untuk melaksanakan deployment Digital Twin Data Center langsung dari USB flashdisk ke server fisik Debian.

---

## 1. Persiapan Awal di Depan Server Fisik

1. Masuk ke server sebagai **ROOT**:
   ```bash
   su -
   ```
2. Tancapkan USB flashdisk ke port USB belakang server.
3. Periksa partisi USB menggunakan `lsblk` (jangan pernah berasumsi nama partisi selalu `/dev/sdb1`):
   ```bash
   lsblk -o NAME,SIZE,TRAN,MODEL,FSTYPE,LABEL,MOUNTPOINTS
   ```
   *Kriteria identifikasi USB yang valid:*
   - `TRAN` = `usb`
   - `LABEL` = `DEBIAN 13_7`
   - `SIZE` = ~57.3 GB (untuk flashdisk 64 GB)
   - `FSTYPE` = `vfat`
   - *Peringatan:* Nama partisi (`/dev/sdb1`, `/dev/sdc1`, dsb.) bergantung pada urutan probing disk oleh kernel Debian. Gunakan nama partisi yang sesuai dengan hasil `lsblk`.
4. Mount USB secara Read-Only:
   ```bash
   mkdir -p /mnt/usb
   # Ganti /dev/sdX1 dengan nama partisi hasil identifikasi di atas
   mount -o ro /dev/sdX1 /mnt/usb
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
 10) Rollback               (Pulihkan konfigurasi dari backup)
 11) Identifikasi USB       (Pemindaian disk lsblk read-only)
 0) Keluar
==========================================================
```

### Opsi A: Deployment Otomatis Cepat (Pilih Opsi 3)
Ketik `3` lalu tekan Enter. Skrip akan secara berurutan:
1. Memvalidasi sistem (Preflight).
2. Mencadangkan konfigurasi `.env.server` dan database aktif ke `/opt/backups/digital-twin/` (wajib berhasil; jika backup database gagal, proses berhenti seketika).
3. Menyiapkan staging bersih di `/opt/staging-digital-twin/` dengan izin `700` dan tanpa file rahasia/kredensial.
4. Melakukan sinkronisasi selektif ke `/opt/digital-twin-datacenter/` tanpa mengubah atau menimpa kredensial produksi server.
5. Memvalidasi sintaks Docker Compose.
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
   *Skrip akan memvalidasi sintaks Nginx (nginx -t), me-reload HANYA kontainer Nginx tanpa mengganggu Postgres/MQTT/Backend, dan mencetak URL HTTPS publik.*
4. **Nonaktifkan Funnel Kapan Saja (Opsi 8):**
   ```bash
   bash deployment/linux/deploy.sh funnel-disable
   ```
   *Menghentikan Funnel dan me-reload Nginx ke mode LAN port 80 saja tanpa merestart stack lain.*

---

## 4. Perintah Cepat Non-Interaktif

Anda juga dapat menjalankan tahapan langsung melalui argumen CLI:

```bash
# Identifikasi disk USB
bash deployment/linux/deploy.sh usb-identify

# Menjalankan deploy penuh
bash deployment/linux/deploy.sh deploy

# Memeriksa status sistem
bash deployment/linux/deploy.sh status

# Mematikan akses publik Funnel kapan saja
bash deployment/linux/deploy.sh funnel-disable

# Rollback konfigurasi jika diperlukan
bash deployment/linux/deploy.sh rollback
```

---

## 5. Prosedur Rollback & Pemulihan Database

Prosedur `rollback` pada skrip memulihkan file konfigurasi (`.env.server`, `infra/nginx`, `docker`) ke kondisi sebelum deployment dan merestart container:
- Database produksi **TIDAK** di-restore secara otomatis demi mencegah kehilangan data mutasi terbaru.
- Untuk menguji atau memulihkan data database dari cadangan, lakukan pengujian ke database verifikasi terlebih dahulu:
  ```bash
  cd /opt/digital-twin-datacenter
  bash deployment/linux/manage.sh restore /opt/backups/digital-twin/backup-<timestamp>/postgres-database.dump dt_datacenter_restore_test
  ```
- Setelah data pada `dt_datacenter_restore_test` dipastikan valid, barulah putuskan langkah lanjutan secara manual dan terencana.
