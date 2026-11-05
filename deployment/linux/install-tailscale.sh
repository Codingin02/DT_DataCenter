#!/usr/bin/env bash
set -Eeuo pipefail
[[ "$(id -u)" == 0 ]] || { echo 'Use sudo to install Tailscale on the Debian host.' >&2; exit 1; }
. /etc/os-release
[[ "$ID" == debian ]] || exit 1
apt-get update
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /usr/share/keyrings
curl -fsSL "https://pkgs.tailscale.com/stable/debian/$VERSION_CODENAME.noarmor.gpg" -o /usr/share/keyrings/tailscale-archive-keyring.gpg
curl -fsSL "https://pkgs.tailscale.com/stable/debian/$VERSION_CODENAME.tailscale-keyring.list" -o /etc/apt/sources.list.d/tailscale.list
apt-get update
apt-get install -y tailscale
systemctl enable --now tailscaled
tailscale version
printf '%s\n' 'Installed on host. Run sudo tailscale up and complete account login yourself; no auth key is stored here.'
