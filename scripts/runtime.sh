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
  local)
    environment=.env
    compose_files='-f docker/compose.yaml'
    build_flag='--build'
    ;;
  server)
    environment=.env.server
    compose_files='-f docker/compose.yaml -f docker/compose.server.yaml'
    build_flag='--no-build'
    ;;
  *) printf '%s\n' 'Mode must be local or server.' >&2; exit 2 ;;
esac

case "$action" in
  status)
    docker compose -p dt_datacenter -f docker/compose.yaml ps
    exit 0
    ;;
esac

test -f "$environment" || { printf '%s\n' 'Configure the private environment file before starting.' >&2; exit 1; }
# shellcheck disable=SC2086
set -- --env-file "$environment" -p dt_datacenter $compose_files

case "$action" in
  start)
    if [ "$mode" = 'local' ]; then
      npm run frontend:build
    fi
    docker info >/dev/null
    docker compose "$@" config --quiet
    docker compose "$@" up -d "$build_flag" --pull never --wait --wait-timeout 120
    printf '\nDigital Twin Data Center is ready.\n'
    printf 'Web UI: http://localhost/\n'
    ;;
  stop)
    docker compose "$@" stop --timeout 30
    printf '\nDigital Twin Data Center stopped.\n'
    ;;
esac
