#!/usr/bin/env bash
set -Eeuo pipefail
if [[ "${1:-}" == --install-docker ]]; then
  [[ "$(id -u)" == 0 ]] || { echo 'Use sudo for --install-docker.' >&2; exit 1; }
  . /etc/os-release
  [[ "$ID" == debian ]] || { echo 'This installer requires Debian.' >&2; exit 1; }
  for package in docker.io docker-compose podman-docker containerd runc; do
    if dpkg-query -W -f='${Status}' "$package" 2>/dev/null | grep -q 'install ok installed'; then
      echo "Conflicting package $package installed; review official migration instructions first." >&2; exit 1
    fi
  done
  apt-get update
  apt-get install -y ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  printf 'Types: deb\nURIs: https://download.docker.com/linux/debian\nSuites: %s\nComponents: stable\nArchitectures: %s\nSigned-By: /etc/apt/keyrings/docker.asc\n' "$VERSION_CODENAME" "$(dpkg --print-architecture)" > /etc/apt/sources.list.d/docker.sources
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  exit 0
fi
exec bash "$(dirname -- "$0")/manage.sh" install "$@"
