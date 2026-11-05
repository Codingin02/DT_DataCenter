#!/usr/bin/env bash
set -Eeuo pipefail
action="${1:-status}"
case "$action" in
  status) tailscale status; tailscale funnel status ;;
  off) tailscale funnel --https=443 off ;;
  enable)
    [[ "${DT_PUBLIC_READONLY_APPROVED:-0}" == 1 ]] || { echo 'Review public telemetry visibility; set DT_PUBLIC_READONLY_APPROVED=1 only after approval.' >&2; exit 1; }
    [[ "$(uname -s)" == Linux ]] || exit 1
    systemctl is-active --quiet tailscaled
    tailscale version
    tailscale status >/dev/null
    curl --fail --silent http://127.0.0.1:8080/ >/dev/null
    for path in /metrics /ready /health /api/spatial-registration /api/not-allowed; do
      code="$(curl --silent --output /dev/null --write-out '%{http_code}' "http://127.0.0.1:8080$path")"
      [[ "$code" == 403 || "$code" == 404 ]] || { echo "Unsafe public gateway response: $path ($code)" >&2; exit 1; }
    done
    [[ "$(curl --silent -X POST --output /dev/null --write-out '%{http_code}' http://127.0.0.1:8080/api/spatial-registration)" == 403 ]] || exit 1
    tailscale funnel --bg --https=443 http://127.0.0.1:8080
    tailscale funnel status
    ;;
  *) echo 'Usage: funnel.sh status|off|enable' >&2; exit 2 ;;
esac
