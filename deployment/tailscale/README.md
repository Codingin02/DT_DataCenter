# Tailscale Funnel Scripts & Deployment

Direktori ini berisi skrip operasional untuk mengelola akses publik aman ke dashboard Digital Twin Data Center via Tailscale Funnel.

## Skrip yang Tersedia

| Skrip | Fungsi | Perizinan |
| :--- | :--- | :--- |
| **`install.sh`** | Memasang Tailscale pada host Debian (menggunakan paket lokal offline atau online) | Butuh `sudo` |
| **`setup.sh`** | Melakukan proses login / autentikasi interaktif ke Tailnet tanpa menyimpan key | Interaktif |
| **`enable-funnel.sh`** | Menguji keamanan gateway lokal & mengaktifkan HTTPS Funnel publik | Butuh persetujuan `DT_PUBLIC_READONLY_APPROVED=1` |
| **`disable-funnel.sh`** | Mematikan listener HTTPS Funnel publik tanpa mematikan dashboard LAN | Standar |
| **`status.sh`** | Memeriksa status daemon, koneksi tailnet, gateway 8080, Funnel, dan LAN | Standar |
| **`uninstall.sh`** | Mencopot Tailscale dengan konfirmasi interaktif | Butuh `sudo` |

## Alur Singkat Penggunaan

1. **Pasang paket Tailscale di server:**
   ```bash
   sudo bash deployment/tailscale/install.sh
   ```
2. **Login akun:**
   ```bash
   bash deployment/tailscale/setup.sh
   ```
   *(Buka tautan otentikasi di browser smartphone/laptop Anda).*
3. **Aktifkan gateway publik Nginx (localhost:8080):**
   ```bash
   mkdir -p config/linux
   touch config/linux/funnel.enabled
   bash deployment/linux/start.sh
   ```
4. **Aktifkan Funnel setelah verifikasi keamanan:**
   ```bash
   export DT_PUBLIC_READONLY_APPROVED=1
   bash deployment/tailscale/enable-funnel.sh
   ```
5. **Periksa status:**
   ```bash
   bash deployment/tailscale/status.sh
   ```
6. **Matikan akses publik kapan saja:**
   ```bash
   bash deployment/tailscale/disable-funnel.sh
   ```

Baca panduan keamanan lengkap pada `SECURITY.md` dan checklist pra-deployment pada `PRE-DEPLOYMENT-CHECKLIST.md`.
