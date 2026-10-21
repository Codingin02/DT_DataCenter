#!/bin/sh
set -eu

cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
action="${1:-}"
mode="${2:-local}"
case "$action" in
  start|stop|status) ;;
  *) printf '%s\n' 'Usage: sh scripts/runtime.sh start|stop|status [local|server]' >&2; exit 2 ;;
esac
case "$mode" in
  local) environment=.env ;;
  server) environment=.env.server ;;
  *) printf '%s\n' 'Mode must be local or server.' >&2; exit 2 ;;
esac

case "$action" in
  status)
    docker compose -p dt_datacenter -f docker/compose.yaml ps
    exit 0
    ;;
esac

test -f "$environment" || { printf '%s\n' 'Configure the private environment file before starting.' >&2; exit 1; }
set -- --env-file "$environment" -p dt_datacenter -f docker/compose.yaml

case "$action" in
  start)
    docker info >/dev/null
    docker compose "$@" config --quiet
    docker compose "$@" up -d --build --pull never --wait --wait-timeout 120
    printf '\nDigital Twin Data Center is ready.\n'
    printf 'Web UI: http://localhost/\n'
    ;;
  stop)
    docker compose "$@" stop --timeout 30
    printf '\nDigital Twin Data Center stopped.\n'
    ;;
esac
