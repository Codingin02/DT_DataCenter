# Instalasi Digital Twin

## Sumber dan prasyarat

USB utama adalah folder `Digital Twin`. Untuk pengguna GitHub, clone `Codingin02/DT_DataCenter` ke folder bernama `Digital Twin`; source sama untuk dua OS. File private USB tidak tersedia di GitHub dan harus disiapkan pemilik deployment.

Windows: Windows 10/11 yang didukung Docker Desktop, WSL2/virtualisasi aktif, Linux containers, Docker Compose modern, PowerShell 5.1+; PowerShell 7 disarankan. Debian: Docker Engine dan Compose Plugin, Bash, curl, iproute2, git, filesystem persisten dan ruang disk sesuai pertumbuhan DB. Compose harus mendukung `!override`/`!reset` jika memakai opsi TLS; override OS standar tidak bergantung pada tag tersebut.

Versi image dipertahankan dari proyek: PostgreSQL `17.11-alpine3.24`, Mosquitto `2.1.2-alpine`, Nginx `1.28-alpine`, Node `24.20.0-alpine3.24`, Node Exporter `v1.9.0`. Build source membutuhkan akses registry/npm; image USB adalah arsip amd64 yang belum tentu cocok untuk host lain. Jangan mengganti image produksi berdasarkan dugaan.

## Windows

1. Install Docker Desktop dari https://docs.docker.com/desktop/setup/install/windows-install/.
2. Pastikan `docker info` dan `docker compose version` berhasil.
3. Siapkan `.env.windows` sesuai [Windows](WINDOWS.md); jangan overwrite yang tersedia di USB.
4. Jalankan `deployment/windows/install.ps1`, lalu `start.ps1` dan `status.ps1`.
5. Buka `http://localhost/`; aktifkan akses broker LAN hanya pada alamat Windows yang sah bila Windows memang dijadikan broker perangkat.

## Debian

Dokumentasi resmi: https://docs.docker.com/engine/install/debian/.

```bash
# Hanya jika Docker Engine belum terpasang dan paket konflik telah ditinjau.
sudo bash deployment/linux/install.sh --install-docker
docker version
docker compose version
```

Installer menggunakan repository apt resmi Docker dan menolak paket konflik; tidak menghapus paket konflik otomatis. Hak akses Docker setara root; jangan menambah anggota grup tanpa keputusan administrator.

Jangan menyalin USB menimpa `/opt/digital-twin-datacenter` yang sedang aktif. Audit volume, backup DB, dan simpan konfigurasi privat existing dahulu. Untuk instalasi **baru**, salin source yang sudah disanitasi ke lokasi tersebut, buat `.env.server`, validasi, build, lalu start sesuai [Linux](LINUX.md).

Skrip `install.sh` tanpa opsi hanya menarik image/build; tidak menyalakan stack dan tidak mengubah perangkat.

## Arsip resource USB

`deployment/resources/` menyimpan satu salinan image/paket dan `SHA256SUMS`. Ini bahan pemulihan, bukan source/deployment kedua, tidak dipublikasikan. Pada Debian, checksum dapat diperiksa dengan `sha256sum -c SHA256SUMS` dari folder itu. Memuat image/paket lama memerlukan peninjauan versi/arsitektur; skrip default tidak memasangnya otomatis.
