#!/usr/bin/env bash
# deployment/linux/deploy.sh
# Master Deployment Orchestrator untuk Digital Twin Data Center (Mode ROOT su -)
# Menangani preflight, backup, staging, deploy, validasi, Tailscale, Funnel, dan rollback.

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
# 2. Tahap Preflight
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

  # E. Deteksi Deployment Eksisting
  if [[ -f "$TARGET_DIR/.env.server" ]]; then
    log_ok "Ditemukan deployment eksisting di $TARGET_DIR (.env.server terdeteksi)."
  else
    log_info "Belum ada .env.server di $TARGET_DIR (siap untuk instalasi awal)."
  fi

  log_ok "Preflight Check selesai."
}

# -------------------------------------------------------------
# 3. Tahap Backup
# -------------------------------------------------------------
do_backup() {
  log_info "Membuat cadangan deployment lama..."
  local ts
  ts="$(date -u +%Y%m%dT%H%M%SZ)"
  local backup_dest="$BACKUP_BASE/backup-$ts"
  
  umask 077
  mkdir -p "$backup_dest"

  # Backup .env.server jika ada
  if [[ -f "$TARGET_DIR/.env.server" ]]; then
    cp -a "$TARGET_DIR/.env.server" "$backup_dest/.env.server"
    log_ok "Cadangan .env.server: $backup_dest/.env.server"
  fi

  # Backup konfigurasi runtime
  if [[ -d "$TARGET_DIR/infra/nginx" ]]; then
    mkdir -p "$backup_dest/infra/nginx"
    cp -a "$TARGET_DIR/infra/nginx/." "$backup_dest/infra/nginx/"
  fi

  if [[ -d "$TARGET_DIR/docker" ]]; then
    mkdir -p "$backup_dest/docker"
    cp -a "$TARGET_DIR/docker/." "$backup_dest/docker/"
  fi

  # Simpan metadata container & volumes jika docker aktif
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    docker ps -a --filter "name=dt-datacenter" --format "{{.Names}}\t{{.Status}}\t{{.Image}}" > "$backup_dest/containers.txt" 2>/dev/null || true
    docker volume inspect dt_datacenter_postgres-data > "$backup_dest/volume-postgres.json" 2>/dev/null || true
  fi

  # Backup PostgreSQL Database via dump jika container postgres running
  if [[ -f "$TARGET_DIR/deployment/linux/backup.sh" ]]; then
    log_info "Mencadangkan database PostgreSQL via deployment/linux/backup.sh..."
    (cd "$TARGET_DIR" && bash deployment/linux/backup.sh "$backup_dest/postgres-database.dump" 2>/dev/null) && \
      log_ok "Cadangan database berhasil: $backup_dest/postgres-database.dump" || \
      log_warn "Gagal dump database langsung (container postgres mungkin sedang nonaktif)."
  fi

  # Catat manifest versi source
  if [[ -d "$TARGET_DIR/.git" ]] && command -v git >/dev/null 2>&1; then
    git -C "$TARGET_DIR" rev-parse HEAD > "$backup_dest/git-commit.txt" 2>/dev/null || true
  fi

  echo "$backup_dest" > "$BACKUP_BASE/LATEST"
  log_ok "Pencadangan selesai penuh di: $backup_dest"
}

# -------------------------------------------------------------
# 4. Tahap Staging
# -------------------------------------------------------------
do_stage() {
  log_info "Menyiapkan direktori staging dari sumber: $PROJECT_ROOT"
  
  mkdir -p "$STAGING_DIR"
  # Salin berkas proyek ke staging
  cp -r "$PROJECT_ROOT/." "$STAGING_DIR/"
  
  # Validasi kelengkapan berkas esensial di staging
  for item in backend frontend docker database infra deployment docs; do
    [[ -d "$STAGING_DIR/$item" ]] || fail "Direktori $item hilang di staging."
  done
  [[ -f "$STAGING_DIR/docker/compose.yaml" ]] || fail "docker/compose.yaml tidak ditemukan di staging."
  
  log_ok "Staging siap dan tervalidasi di: $STAGING_DIR"
}

# -------------------------------------------------------------
# 5. Tahap Deploy (Sinkronisasi Selektif & Aktivasi Aplikasi)
# -------------------------------------------------------------
do_deploy() {
  do_preflight
  do_backup
  do_stage

  log_info "Memulai sinkronisasi selektif ke $TARGET_DIR..."
  mkdir -p "$TARGET_DIR"

  # Sinkronisasi rsync yang aman dan protektif
  rsync -av \
    --exclude='.env*' \
    --exclude='config/private/' \
    --exclude='backups/' \
    --exclude='config/linux/funnel.enabled' \
    "$STAGING_DIR/" "$TARGET_DIR/"

  # Pastikan .env.example tersedia
  cp -n "$STAGING_DIR/.env.example" "$TARGET_DIR/.env.example" 2>/dev/null || true

  # Lindungi .env.server produksi
  if [[ ! -f "$TARGET_DIR/.env.server" ]]; then
    if [[ -f "$STAGING_DIR/.env.server" ]]; then
      log_warn "Menyalin .env.server awal dari staging (pastikan memeriksa isinya)..."
      cp "$STAGING_DIR/.env.server" "$TARGET_DIR/.env.server"
    else
      fail "Tidak ada file .env.server di $TARGET_DIR maupun staging!"
    fi
  fi
  chmod 600 "$TARGET_DIR/.env.server"

  # Validasi Compose
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
# 6. Tahap Verifikasi Operasional
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
# 7. Integrasi Tailscale & Funnel
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
  mkdir -p "$TARGET_DIR/config/linux"
  touch "$TARGET_DIR/config/linux/funnel.enabled"
  
  # Start ulang container Nginx agar memuat gateway loopback 8080
  (cd "$TARGET_DIR" && bash deployment/linux/start.sh)
  
  export DT_PUBLIC_READONLY_APPROVED=1
  bash "$PROJECT_ROOT/deployment/tailscale/enable-funnel.sh"
}

do_funnel_disable() {
  log_info "Menonaktifkan Tailscale Funnel..."
  bash "$PROJECT_ROOT/deployment/tailscale/disable-funnel.sh"
  rm -f "$TARGET_DIR/config/linux/funnel.enabled"
  (cd "$TARGET_DIR" && bash deployment/linux/start.sh)
  log_ok "Funnel dinonaktifkan. Layanan LAN tetap berjalan normal."
}

# -------------------------------------------------------------
# 8. Tahap Rollback
# -------------------------------------------------------------
do_rollback() {
  log_warn "Memulai prosedur Rollback..."
  
  local latest_file="$BACKUP_BASE/LATEST"
  [[ -f "$latest_file" ]] || fail "Berkas $latest_file tidak ditemukan; tidak ada backup yang tercatat."
  
  local backup_path
  backup_path="$(cat "$latest_file")"
  [[ -d "$backup_path" ]] || fail "Direktori backup $backup_path tidak ditemukan."

  log_info "Mengembalikan konfigurasi dari: $backup_path"

  if [[ -f "$backup_path/.env.server" ]]; then
    cp -a "$backup_path/.env.server" "$TARGET_DIR/.env.server"
    log_ok "Konfigurasi .env.server dipulihkan."
  fi

  if [[ -d "$backup_path/infra/nginx" ]]; then
    cp -a "$backup_path/infra/nginx/." "$TARGET_DIR/infra/nginx/"
    log_ok "Konfigurasi Nginx dipulihkan."
  fi

  if [[ -d "$backup_path/docker" ]]; then
    cp -a "$backup_path/docker/." "$TARGET_DIR/docker/"
    log_ok "Konfigurasi Docker dipulihkan."
  fi

  # Restart service
  (cd "$TARGET_DIR" && bash deployment/linux/start.sh)
  log_ok "Rollback konfigurasi selesai. Layanan dijalankan ulang."
}

# -------------------------------------------------------------
# 9. Menu Interaktif
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
  echo " 10) Rollback               (Pulihkan dari backup terakhir)"
  echo " 0) Keluar"
  echo "=========================================================="
  read -r -p "Pilih aksi [0-10]: " choice
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
    0) exit 0 ;;
    *) echo "Pilihan tidak valid." ;;
  esac
}

# -------------------------------------------------------------
# 10. Entry Point
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
  menu|--menu)       show_menu ;;
  *)
    echo "Penggunaan: bash deployment/linux/deploy.sh [preflight|backup|stage|deploy|verify|tailscale-install|tailscale-setup|funnel-enable|funnel-disable|status|rollback|menu]" >&2
    exit 2
    ;;
esac
