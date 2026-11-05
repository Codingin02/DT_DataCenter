# Panduan Operasional Mode ROOT (`su -`) Server Debian

Dokumen ini menjelaskan kebijakan dan tata cara operasional server Debian menggunakan akun **ROOT murni**.

---

## 1. Kebijakan Akses Root

Pada server fisik Debian laboratorium:
- Operasional pemeliharaan, deployment, dan administrasi sistem dijalankan langsung menggunakan sesi **ROOT**.
- Metode login resmi ke mode root adalah:
  ```bash
  su -
  ```
- **Larangan `sudo`:**
  - Jangan menambahkan perintah `sudo` di depan perintah deployment.
  - Skrip tidak mengasumsikan paket `sudo` harus terpasang atau dikonfigurasi untuk user biasa.
  - Skrip deployment memeriksa `id -u` secara langsung; jika nilai tidak sama dengan `0`, eksekusi akan dihentikan seketika dengan pesan instruksi yang jelas.

---

## 2. Format Perintah Operasional Resmi

Seluruh perintah operasional di server menggunakan format langsung:

| Tindakan | Perintah Resmi (Mode Root) |
| :--- | :--- |
| **Menjalankan Master Deployment** | `bash deployment/linux/deploy.sh` |
| **Memulai Layanan Aplikasi** | `bash deployment/linux/start.sh` |
| **Menghentikan Layanan Aplikasi** | `bash deployment/linux/stop.sh` |
| **Melihat Status Layanan** | `bash deployment/linux/status.sh` |
| **Memasang Tailscale** | `bash deployment/tailscale/install.sh` |
| **Autentikasi Tailscale** | `bash deployment/tailscale/setup.sh` |
| **Aktivasi Tailscale Funnel** | `bash deployment/tailscale/enable-funnel.sh` |
| **Nonaktifkan Funnel** | `bash deployment/tailscale/disable-funnel.sh` |

---

## 3. Manajemen Hak Akses File & Direktori

1. **Proteksi File Kredensial:**
   File konfigurasi privat `.env.server` harus selalu memiliki permission `600` (hanya terbaca dan tertulis oleh root):
   ```bash
   chmod 600 /opt/digital-twin-datacenter/.env.server
   ```
2. **Ownership Kontainer:**
   - Direktori proyek diatur dimiliki oleh `root:root` pada host.
   - Kontainer Node.js backend berjalan secara aman di dalam container sebagai user internal `node` (UID 1000) tanpa memerlukan modifikasi user host.
   - Kontainer Mosquitto berjalan sebagai user internal `mosquitto` dengan hak akses password file yang dikelola entrypoint container.
3. **Umask Baku:**
   Operasi pencadangan dan berkas sensitif menggunakan `umask 077` untuk memastikan berkas dump database tidak dapat dibaca oleh entitas lain.
