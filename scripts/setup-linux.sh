#!/bin/sh
# Digital Twin Data Center — Linux setup script
# Run once after cloning or extracting the project archive.
# Usage: sh scripts/setup-linux.sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROJECT_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
USER_HOME="${HOME:-/root}"

# ── 1. Check Docker ────────────────────────────────────────────────────────────
if ! docker info >/dev/null 2>&1; then
  printf 'ERROR: Docker is not running or not installed.\n' >&2
  printf 'Install Docker: https://docs.docker.com/engine/install/\n' >&2
  exit 1
fi

# ── 2. Create .env from example if not present ────────────────────────────────
ENV_FILE="$PROJECT_ROOT/.env"
if [ ! -f "$ENV_FILE" ]; then
  cp "$PROJECT_ROOT/.env.example" "$ENV_FILE"
  printf '\n.env created from .env.example.\n'
  printf 'IMPORTANT: Edit %s and set POSTGRES_PASSWORD before starting.\n\n' "$ENV_FILE"
else
  printf '.env already exists — skipping copy.\n'
fi

# ── 3. Pull required Docker images ────────────────────────────────────────────
printf '\nPulling Docker images...\n'
docker pull postgres:17.11-alpine3.24
docker pull eclipse-mosquitto:2.1.2-alpine
docker pull nginx:1.28-alpine
docker pull node:24.20.0-alpine3.24

# ── 4. Build backend image ────────────────────────────────────────────────────
printf '\nBuilding backend image...\n'
cd "$PROJECT_ROOT"
docker build -t dt-datacenter-backend:local -f docker/backend.Dockerfile .

# ── 5. Install desktop shortcuts (KDE / GNOME / XFCE) ────────────────────────
DESKTOP_DIR="$USER_HOME/Desktop"
APPS_DIR="$USER_HOME/.local/share/applications"
mkdir -p "$DESKTOP_DIR" "$APPS_DIR"

install_shortcut() {
  name="$1"
  file="$2"
  shift 2
  # write to both Desktop and application menu
  printf '%s' "$*" > "$DESKTOP_DIR/$file"
  printf '%s' "$*" > "$APPS_DIR/$file"
  chmod +x "$DESKTOP_DIR/$file"
  # mark trusted for KDE/GNOME (ignore error if gio not present)
  gio set "$DESKTOP_DIR/$file" metadata::trusted true 2>/dev/null || true
}

install_shortcut "Start Digital Twin" "Start Digital Twin.desktop" \
"[Desktop Entry]
Version=1.0
Type=Application
Name=Start Digital Twin
Comment=Start Digital Twin Data Center and open Web UI
Exec=bash -c 'cd \"$PROJECT_ROOT\" && sh scripts/runtime.sh start && xdg-open http://localhost/'
Icon=system-run
Path=$PROJECT_ROOT
Terminal=true
Categories=Development;System;
"

install_shortcut "Stop Digital Twin" "Stop Digital Twin.desktop" \
"[Desktop Entry]
Version=1.0
Type=Application
Name=Stop Digital Twin
Comment=Stop Digital Twin Data Center
Exec=bash -c 'cd \"$PROJECT_ROOT\" && sh scripts/runtime.sh stop'
Icon=process-stop
Path=$PROJECT_ROOT
Terminal=true
Categories=Development;System;
"

install_shortcut "Digital Twin Web UI" "Digital Twin Web UI.desktop" \
"[Desktop Entry]
Version=1.0
Type=Application
Name=Digital Twin Web UI
Comment=Open Digital Twin Data Center in browser
Exec=xdg-open http://localhost/
Icon=internet-web-browser
Terminal=false
Categories=Network;WebBrowser;
"

update-desktop-database "$APPS_DIR" 2>/dev/null || true

printf '\nSetup complete.\n'
printf 'Shortcuts installed on Desktop and in the application menu.\n'
printf 'Next: Edit .env and set POSTGRES_PASSWORD, then double-click "Start Digital Twin".\n'
