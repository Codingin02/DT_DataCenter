#!/usr/bin/env bash
# deployment/linux/deploy.sh
# Master Deployment Orchestrator untuk Digital Twin Data Center (Mode ROOT su -)
# Menangani preflight, backup, staging, deploy, validasi, Tailscale, Funnel, USB identify, dan rollback.

set -Eeuo pipefail

TARGET_DIR="/opt/digital-twin-datacenter"
BACKUP_BASE="/opt/backups/digital-twin"
STAGING_DIR="/opt/staging-digital-twin"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"

# -------------------------------------------------------------
# 1. Fungsi Utilitas & Validasi Dasar
# -------------------------------------------------------------
log_info()  { printf "\033[1;34m[INFO]\033[0m %s\n" "$*"; }
log_ok()    { printf "\033[1;32m[OK]\033[0m   %s\n" "$*"; }
log_warn()  { printf "\033[1;33m[WARN]\033[0m %s\n" "$*" >&2; }
log_err()   { printf "\033[1;31m[ERR]\033[0m  %s\n" "$*" >&2; }
fail()      { log_err "$*"; exit 1; }

check_root() {
  if [[ "$(id -u)" != 0 ]]; then
    fail "Skrip ini WAJIB dijalankan sebagai ROOT. Masuk terlebih dahulu dengan 'su -'."
  fi
}

check_root

# -------------------------------------------------------------
# 2. Identifikasi Perangkat USB (Aman, Tanpa Asumsi /dev/sdb1)
# -------------------------------------------------------------
do_identify_usb() {
  echo ""
  echo "=========================================================="
  echo " IDENTIFIKASI PERANGKAT USB SECARA AMAN (READ-ONLY)      "
  echo "=========================================================="
  log_info "Menjalankan pemindaian blok penyimpanan (lsblk)..."
  echo ""
  lsblk -o NAME,SIZE,TRAN,MODEL,FSTYPE,LABEL,MOUNTPOINTS
  echo ""
  log_info "Petunjuk Identifikasi Perangkat USB:"
  log_info "1. Periksa kolom TRAN = 'usb'."
  log_info "2. Periksa LABEL (misalnya 'DEBIAN 13_7' atau label flashdisk Anda)."
  log_info "3. Periksa SIZE (misalnya ~57.3G untuk flashdisk 64 GB)."
  log_warn "JANGAN PERNAH berasumsi nama perangkat selalu /dev/sdb1."
  log_warn "Nama drive bergantung pada urutan deteksi kernel (bisa sdb, sdc, sdd, dll)."
  log_info "Setelah partisi USB dipastikan benar (misal /dev/sdX1):"
  echo ""
  echo "   mkdir -p /mnt/usb"
  echo "   mount -o ro /dev/sdX1 /mnt/usb"
  echo "   cd \"/mnt/usb/Digital Twin\""
  echo ""
  echo "=========================================================="
}

# -------------------------------------------------------------
# 3. Tahap Preflight
# -------------------------------------------------------------
do_preflight() {
  log_info "Menjalankan Preflight Check..."
  
  # A. Periksa OS
  [[ -f /etc/os-release ]] || fail "/etc/os-release tidak ditemukan."
  . /etc/os-release
  [[ "${ID:-}" == "debian" ]] || log_warn "OS terdeteksi bukan Debian murni (${ID:-unknown})."
  log_ok "OS: ${NAME:-Debian} ${VERSION_CODENAME:-trixie}"

  # B. Periksa Arsitektur
  local arch
  arch="$(dpkg --print-architecture 2>/dev/null || uname -m)"
  [[ "$arch" == "amd64" || "$arch" == "x86_64" ]] || fail "Arsitektur CPU $arch tidak didukung (harus amd64/x86_64)."
  log_ok "Arsitektur: $arch"

  # C. Periksa Sisa Ruang Disk (minimal 2 GB di /opt)
  local free_mb
  free_mb="$(df -m /opt 2>/dev/null | awk 'NR==2 {print $4}' || echo 0)"
  if (( free_mb < 2000 )); then
    log_warn "Sisa ruang disk di /opt kurang dari 2000 MB (tersedia: ${free_mb} MB)."
  else
    log_ok "Sisa ruang disk /opt: ${free_mb} MB"
  fi

  # D. Periksa Docker Engine & Docker Compose
  if command -v docker >/dev/null 2>&1; then
    docker info >/dev/null 2>&1 && log_ok "Docker daemon aktif" || log_warn "Docker terpasang tetapi daemon belum aktif."
    docker compose version >/dev/null 2>&1 && log_ok "Docker Compose Plugin aktif" || log_warn "Docker Compose Plugin belum tersedia."
  else
    log_warn "Docker belum terpasang. Paket offline tersedia di deployment/resources/packages/."
  fi

  # E. Periksa ketersediaan rsync
  command -v rsync >/dev/null 2>&1 || fail "rsync diperlukan untuk proses staging selektif tetapi belum terpasang."
  log_ok "Alat sinkronisasi rsync tersedia."

  # F. Deteksi Deployment Eksisting
  if [[ -f "$TARGET_DIR/.env.server" ]]; then
    log_ok "Ditemukan deployment eksisting di $TARGET_DIR (.env.server terdeteksi)."
  else
    log_info "Belum ada .env.server di $TARGET_DIR (siap untuk instalasi awal)."
  fi

  log_ok "Preflight Check selesai."
}

# -------------------------------------------------------------
# 4. Tahap Backup (Wajib Berhasil & Tervalidasi)
# -------------------------------------------------------------
do_backup() {
  log_info "Membuat cadangan deployment lama..."

  if [[ ! -f "$TARGET_DIR/.env.server" ]]; then
    fail "FATAL: File .env.server tidak ditemukan di $TARGET_DIR. Tidak dapat membuat backup konfigurasi produksi!"
  fi

  local ts
  ts="$(date -u +%Y%m%dT%H%M%SZ)"
  local backup_dest="$BACKUP_BASE/backup-$ts"
  
  umask 077
  mkdir -p "$backup_dest"
  chmod 700 "$backup_dest"

  # Backup .env.server produksi
  cp -a "$TARGET_DIR/.env.server" "$backup_dest/.env.server"
  chmod 600 "$backup_dest/.env.server"
  log_ok "Cadangan .env.server disimpan: $backup_dest/.env.server"

  # Backup konfigurasi runtime
  if [[ -d "$TARGET_DIR/infra/nginx" ]]; then
    mkdir -p "$backup_dest/infra/nginx"
    cp -a "$TARGET_DIR/infra/nginx/." "$backup_dest/infra/nginx/"
    log_ok "Cadangan infra/nginx tersimpan."
  fi

  if [[ -d "$TARGET_DIR/docker" ]]; then
    mkdir -p "$backup_dest/docker"
    cp -a "$TARGET_DIR/docker/." "$backup_dest/docker/"
    log_ok "Cadangan docker compose tersimpan."
  fi

  # Simpan metadata container & volumes jika docker aktif
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    docker ps -a --filter "name=dt-datacenter" --format "{{.Names}}\t{{.Status}}\t{{.Image}}" > "$backup_dest/containers.txt" 2>/dev/null || true
    docker volume inspect dt_datacenter_postgres-data > "$backup_dest/volume-postgres.json" 2>/dev/null || true
  fi

  # Backup PostgreSQL Database via dump - WAJIB BERHASIL DAN TERVALIDASI
  local dump_file="$backup_dest/postgres-database.dump"
  log_info "Mencadangkan database PostgreSQL via deployment/linux/backup.sh..."
  if ! (cd "$TARGET_DIR" && bash deployment/linux/backup.sh "$dump_file"); then
    rm -rf "$backup_dest"
    fail "FATAL: Backup database PostgreSQL GAGAL. Deployment dibatalkan demi integritas data produksi!"
  fi

  # Validasi file backup fisik non-empty
  if [[ ! -s "$dump_file" ]]; then
    rm -rf "$backup_dest"
    fail "FATAL: Berkas arsip backup database kosong atau tidak valid ($dump_file). Deployment dibatalkan!"
  fi
  chmod 600 "$dump_file"
  log_ok "Cadangan database PostgreSQL tervalidasi dan berhasil disimpan: $dump_file"

  # Catat manifest versi source
  if [[ -d "$TARGET_DIR/.git" ]] && command -v git >/dev/null 2>&1; then
    git -C "$TARGET_DIR" rev-parse HEAD > "$backup_dest/git-commit.txt" 2>/dev/null || true
  fi

  echo "$backup_dest" > "$BACKUP_BASE/LATEST"
  log_ok "Pencadangan berhasil penuh dan tervalidasi di: $backup_dest"
}

# -------------------------------------------------------------
# 5. Tahap Staging (Aman, Selektif, Bebas Kredensial, Izin 700)
# -------------------------------------------------------------
do_stage() {
  log_info "Menyiapkan direktori staging aman dari sumber: $PROJECT_ROOT"
  
  command -v rsync >/dev/null 2>&1 || fail "rsync diperlukan untuk proses staging selektif tetapi belum terpasang."

  umask 077
  rm -rf "$STAGING_DIR"
  mkdir -p "$STAGING_DIR"
  chmod 700 "$STAGING_DIR"

  # Salin secara selektif dengan exclusion eksplisit
  # Jangan pernah menyalin file kredensial/rahasia/backup/binary
  rsync -a \
    --exclude='.env*' \
    --exclude='*.env' \
    --exclude='*.key' \
    --exclude='*.dump' \
    --exclude='*.tar' \
    --exclude='*.deb' \
    --exclude='config/private/' \
    --exclude='backups/' \
    --exclude='node_modules/' \
    --exclude='.git/' \
    --exclude='firmware/ESP32/recovered/' \
    "$PROJECT_ROOT/" "$STAGING_DIR/"

  # Validasi ketat bahwa tidak ada berkas kredensial/rahasia di dalam staging
  if find "$STAGING_DIR" -name '.env*' -o -name '*.env' -o -name '*.key' -o -name '*.dump' | grep -q .; then
    fail "Validasi staging GAGAL: Terdeteksi file kredensial/rahasia di dalam staging!"
  fi

  if [[ -d "$STAGING_DIR/config/private" ]]; then
    fail "Validasi staging GAGAL: Direktori config/private ikut tersalin ke staging!"
  fi

  # Validasi kelengkapan berkas esensial di staging
  for item in backend frontend docker database infra deployment docs; do
    [[ -d "$STAGING_DIR/$item" ]] || fail "Direktori esensial $item tidak ditemukan di staging."
  done
  [[ -f "$STAGING_DIR/docker/compose.yaml" ]] || fail "docker/compose.yaml tidak ditemukan di staging."
  [[ -f "$STAGING_DIR/docker/compose.linux.yaml" ]] || fail "docker/compose.linux.yaml tidak ditemukan di staging."

  log_ok "Staging siap dan tervalidasi di: $STAGING_DIR (izin 700, aman dari rahasia)"
}

# -------------------------------------------------------------
# 6. Tahap Deploy (Sinkronisasi Selektif & Aktivasi Aplikasi)
# -------------------------------------------------------------
do_deploy() {
  do_preflight
  do_backup
  do_stage

  log_info "Memulai sinkronisasi selektif ke $TARGET_DIR..."
  mkdir -p "$TARGET_DIR"

  # Lindungi .env.server produksi: JANGAN PERNAH menyalin otomatis dari USB
  if [[ ! -f "$TARGET_DIR/.env.server" ]]; then
    echo "" >&2
    log_err "FATAL: File $TARGET_DIR/.env.server tidak ditemukan di server produksi!"
    log_err "Deployment dihentikan demi keamanan sistem produksi."
    log_err "Instruksi pemulihan manual:"
    log_err "  1. Buat file .env.server pada server menggunakan template .env.example:"
    log_err "     umask 077 && cp $TARGET_DIR/.env.example $TARGET_DIR/.env.server"
    log_err "  2. Konfigurasikan kredensial produksi yang sah (POSTGRES_*, MQTT_*, dsb)."
    log_err "  3. Pastikan izin akses dibatasi: chmod 600 $TARGET_DIR/.env.server"
    log_err "  4. Jalankan kembali deployment."
    echo "" >&2
    exit 1
  fi
  chmod 600 "$TARGET_DIR/.env.server"

  # Sinkronisasi rsync yang aman dan protektif (tidak menyentuh .env* atau rahasia server)
  rsync -av \
    --exclude='.env*' \
    --exclude='*.env' \
    --exclude='config/private/' \
    --exclude='backups/' \
    --exclude='config/linux/funnel.enabled' \
    "$STAGING_DIR/" "$TARGET_DIR/"

  # Pastikan .env.example tersedia sebagai referensi
  cp -n "$STAGING_DIR/.env.example" "$TARGET_DIR/.env.example" 2>/dev/null || true

  # Validasi Compose dengan konfigurasi server
  log_info "Memvalidasi konfigurasi Docker Compose..."
  (cd "$TARGET_DIR" && docker compose --env-file .env.server -f docker/compose.yaml -f docker/compose.linux.yaml config --quiet)
  log_ok "Validasi Docker Compose: LULUS."

  # Jalankan ulang kontainer
  log_info "Menjalankan aplikasi Digital Twin..."
  (cd "$TARGET_DIR" && bash deployment/linux/start.sh)

  do_verify
  log_ok "Deployment berhasil diselesaikan!"
}

# -------------------------------------------------------------
# 7. Tahap Verifikasi Operasional
# -------------------------------------------------------------
do_verify() {
  log_info "Memverifikasi status operasional layanan..."
  
  # Status container
  (cd "$TARGET_DIR" && bash deployment/linux/status.sh) || log_warn "Gagal membaca status container."

  # Verifikasi Dashboard LAN (port 80)
  log_info "Menguji respons HTTP LAN port 80..."
  if curl --fail --silent --max-time 3 http://127.0.0.1:80/ >/dev/null 2>&1 || curl --fail --silent --max-time 3 http://localhost/ >/dev/null 2>&1; then
    log_ok "Dashboard LAN (http://192.168.1.167) merespons NORMAL."
  else
    log_warn "Dashboard LAN belum merespons di localhost:80."
  fi
}

# -------------------------------------------------------------
# 8. Integrasi Tailscale & Funnel (Isolasi Penuh, Hanya Nginx)
# -------------------------------------------------------------
do_tailscale_install() {
  log_info "Memasang paket Tailscale..."
  bash "$PROJECT_ROOT/deployment/tailscale/install.sh"
}

do_tailscale_setup() {
  log_info "Menjalankan autentikasi Tailscale interaktif..."
  bash "$PROJECT_ROOT/deployment/tailscale/setup.sh"
}

do_funnel_enable() {
  log_info "Mengaktifkan Gateway Publik & Tailscale Funnel..."
  
  [[ -f "$TARGET_DIR/.env.server" ]] || fail "File $TARGET_DIR/.env.server tidak ditemukan."
  
  mkdir -p "$TARGET_DIR/config/linux"
  touch "$TARGET_DIR/config/linux/funnel.enabled"

  local compose=(docker compose --env-file "$TARGET_DIR/.env.server" -p dt_datacenter \
    -f "$TARGET_DIR/docker/compose.yaml" \
    -f "$TARGET_DIR/docker/compose.linux.yaml" \
    -f "$TARGET_DIR/docker/compose.funnel.yaml")

  # Validasi konfigurasi Nginx gateway (nginx -t) SEBELUM menerapkan perubahan
  log_info "Memvalidasi sintaks konfigurasi Nginx gateway (nginx -t)..."
  if ! "${compose[@]}" run --rm --no-deps nginx nginx -t; then
    rm -f "$TARGET_DIR/config/linux/funnel.enabled"
    fail "Validasi Nginx GAGAL! Perubahan dibatalkan. Layanan LAN tetap berjalan normal."
  fi
  log_ok "Validasi Nginx LULUS."

  # Reload HANYA kontainer Nginx gateway (tidak merestart postgres, mosquitto, backend)
  log_info "Memperbarui kontainer Nginx gateway (hanya nginx, stack lain tidak terganggu)..."
  "${compose[@]}" up -d --no-build --force-recreate --wait --wait-timeout 30 nginx

  # Verifikasi gateway lokal 127.0.0.1:8080 sebelum mengaktifkan Funnel
  log_info "Memverifikasi gateway lokal 127.0.0.1:8080..."
  if ! curl --fail --silent --max-time 3 http://127.0.0.1:8080/ >/dev/null 2>&1; then
    log_err "Gateway 127.0.0.1:8080 tidak merespons. Membatalkan aktivasi Funnel..."
    rm -f "$TARGET_DIR/config/linux/funnel.enabled"
    docker compose --env-file "$TARGET_DIR/.env.server" -p dt_datacenter \
      -f "$TARGET_DIR/docker/compose.yaml" -f "$TARGET_DIR/docker/compose.linux.yaml" \
      up -d --no-build --force-recreate --wait --wait-timeout 30 nginx
    fail "Gateway 127.0.0.1:8080 gagal merespons. Funnel dibatalkan."
  fi

  export DT_PUBLIC_READONLY_APPROVED=1
  bash "$PROJECT_ROOT/deployment/tailscale/enable-funnel.sh"
}

do_funnel_disable() {
  log_info "Menonaktifkan Tailscale Funnel..."
  
  bash "$PROJECT_ROOT/deployment/tailscale/disable-funnel.sh"
  
  rm -f "$TARGET_DIR/config/linux/funnel.enabled"

  local compose=(docker compose --env-file "$TARGET_DIR/.env.server" -p dt_datacenter \
    -f "$TARGET_DIR/docker/compose.yaml" \
    -f "$TARGET_DIR/docker/compose.linux.yaml")

  # Validasi sebelum reload Nginx tanpa overlay funnel
  "${compose[@]}" run --rm --no-deps nginx nginx -t || {
    log_warn "Validasi konfigurasi Nginx LAN melaporkan catatan."
  }

  # Reload HANYA Nginx ke mode LAN saja (tidak merestart postgres, mosquitto, backend)
  log_info "Mengembalikan kontainer Nginx ke mode LAN saja (hanya nginx)..."
  "${compose[@]}" up -d --no-build --force-recreate --wait --wait-timeout 30 nginx

  log_ok "Funnel dinonaktifkan. Nginx kembali ke mode LAN saja (port 80). Layanan backend, postgres, dan broker MQTT tidak tersentuh."
}

# -------------------------------------------------------------
# 9. Tahap Rollback Konfigurasi (Jujur & Terbatas)
# -------------------------------------------------------------
do_rollback() {
  log_warn "Memulai prosedur Rollback Konfigurasi (Rollback Terbatas)..."
  
  local latest_file="$BACKUP_BASE/LATEST"
  [[ -f "$latest_file" ]] || fail "Berkas $latest_file tidak ditemukan; tidak ada backup yang tercatat."
  
  local backup_path
  backup_path="$(cat "$latest_file")"
  [[ -d "$backup_path" ]] || fail "Direktori backup $backup_path tidak ditemukan."

  log_info "Memulihkan konfigurasi dari arsip backup: $backup_path"

  # 1. Pulihkan .env.server
  if [[ -f "$backup_path/.env.server" ]]; then
    cp -a "$backup_path/.env.server" "$TARGET_DIR/.env.server"
    chmod 600 "$TARGET_DIR/.env.server"
    log_ok "Konfigurasi .env.server dipulihkan."
  else
    log_warn "Tidak ada file .env.server dalam arsip backup."
  fi

  # 2. Pulihkan konfigurasi Nginx
  if [[ -d "$backup_path/infra/nginx" ]]; then
    mkdir -p "$TARGET_DIR/infra/nginx"
    cp -a "$backup_path/infra/nginx/." "$TARGET_DIR/infra/nginx/"
    log_ok "Konfigurasi Nginx dipulihkan."
  fi

  # 3. Pulihkan konfigurasi Docker
  if [[ -d "$backup_path/docker" ]]; then
    mkdir -p "$TARGET_DIR/docker"
    cp -a "$backup_path/docker/." "$TARGET_DIR/docker/"
    log_ok "Konfigurasi Docker dipulihkan."
  fi

  # 4. Informasi Source Code (Git)
  if [[ -f "$backup_path/git-commit.txt" ]]; then
    local prev_commit
    prev_commit="$(cat "$backup_path/git-commit.txt")"
    log_info "Commit Git sebelum deployment: $prev_commit"
    if [[ -d "$TARGET_DIR/.git" ]]; then
      log_warn "Untuk mengembalikan source code ke commit tersebut, jalankan:"
      log_warn "  git -C $TARGET_DIR checkout $prev_commit"
    fi
  fi

  # 5. Restart layanan dengan konfigurasi yang dipulihkan
  log_info "Merestart layanan dengan konfigurasi yang telah dipulihkan..."
  (cd "$TARGET_DIR" && bash deployment/linux/start.sh)

  # 6. Prosedur Aman Database PostgreSQL (TIDAK restore otomatis ke produksi)
  local dump_file="$backup_path/postgres-database.dump"
  echo ""
  log_warn "======================================================================"
  log_warn "CATATAN KEAMANAN DATABASE POSTGRESQL (Rollback Terbatas):"
  log_warn "- Database produksi TIDAK diubah atau di-restore secara otomatis."
  if [[ -f "$dump_file" ]]; then
    log_warn "- Arsip backup database tersedia di: $dump_file"
    log_warn "- Untuk memverifikasi integritas arsip tanpa mengubah data aktif:"
    log_warn "    cd $TARGET_DIR"
    log_warn "    bash deployment/linux/manage.sh restore $dump_file dt_datacenter_restore_test"
    log_warn "- Hanya jika hasil verifikasi sesuai dan restore produksi disetujui,"
    log_warn "  lakukan prosedur pemulihan manual ke database operasional."
  else
    log_warn "- Tidak ada arsip dump database dalam folder backup ini."
  fi
  log_warn "======================================================================"
  echo ""

  log_ok "Rollback konfigurasi selesai. Verifikasi Dashboard LAN: http://192.168.1.167"
}

# -------------------------------------------------------------
# 10. Menu Interaktif
# -------------------------------------------------------------
show_menu() {
  echo ""
  echo "=========================================================="
  echo " DIGITAL TWIN DATA CENTER — MASTER DEPLOYMENT (ROOT MODE) "
  echo "=========================================================="
  echo " 1) Preflight Check         (Pemeriksaan kesiapan sistem)"
  echo " 2) Backup Deployment Lama  (Cadangkan database & konfigurasi)"
  echo " 3) Deploy Penuh            (Backup -> Sync -> Start)"
  echo " 4) Verifikasi Layanan      (Cek container & Dashboard LAN)"
  echo " 5) Pasang Tailscale        (Instal paket host)"
  echo " 6) Autentikasi Tailscale   (Login interaktif Tailnet)"
  echo " 7) Aktifkan Funnel         (Buka akses HTTPS publik)"
  echo " 8) Nonaktifkan Funnel      (Kembali ke mode LAN saja)"
  echo " 9) Status Sistem           (Cek seluruh layanan)"
  echo " 10) Rollback               (Pulihkan konfigurasi dari backup)"
  echo " 11) Identifikasi USB       (Pemindaian disk lsblk read-only)"
  echo " 0) Keluar"
  echo "=========================================================="
  read -r -p "Pilih aksi [0-11]: " choice
  case "$choice" in
    1) do_preflight ;;
    2) do_backup ;;
    3) do_deploy ;;
    4) do_verify ;;
    5) do_tailscale_install ;;
    6) do_tailscale_setup ;;
    7) do_funnel_enable ;;
    8) do_funnel_disable ;;
    9) (cd "$TARGET_DIR" && bash "$PROJECT_ROOT/deployment/tailscale/status.sh") ;;
    10) do_rollback ;;
    11) do_identify_usb ;;
    0) exit 0 ;;
    *) echo "Pilihan tidak valid." ;;
  esac
}

# -------------------------------------------------------------
# 11. Entry Point
# -------------------------------------------------------------
action="${1:-menu}"
case "$action" in
  preflight)         do_preflight ;;
  backup)            do_backup ;;
  stage)             do_stage ;;
  deploy)            do_deploy ;;
  verify)            do_verify ;;
  tailscale-install) do_tailscale_install ;;
  tailscale-setup)   do_tailscale_setup ;;
  funnel-enable)     do_funnel_enable ;;
  funnel-disable)    do_funnel_disable ;;
  status)            (cd "$TARGET_DIR" && bash "$PROJECT_ROOT/deployment/tailscale/status.sh") ;;
  rollback)          do_rollback ;;
  usb-identify)      do_identify_usb ;;
  menu|--menu)       show_menu ;;
  *)
    echo "Penggunaan: bash deployment/linux/deploy.sh [preflight|backup|stage|deploy|verify|tailscale-install|tailscale-setup|funnel-enable|funnel-disable|status|rollback|usb-identify|menu]" >&2
    exit 2
    ;;
esac
