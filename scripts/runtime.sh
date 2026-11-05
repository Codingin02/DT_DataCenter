#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
action=${1:-status}
mode=${2:-server}
case "$action" in start|stop|status) ;; *) echo 'Usage: runtime.sh start|stop|status [local|server]' >&2; exit 2 ;; esac
case "$mode" in local|server) ;; *) echo 'Mode must be local or server.' >&2; exit 2 ;; esac
if [ "$mode" = local ]; then export DT_ENV_FILE="${DT_ENV_FILE:-$root/.env}"; fi
exec bash "$root/deployment/linux/$action.sh"
