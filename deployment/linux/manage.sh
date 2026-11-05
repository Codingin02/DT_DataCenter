#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
action="${1:-status}"
shift || true
ENV_FILE="${DT_ENV_FILE:-$ROOT/.env.server}"
fail() { printf '%s\n' "$*" >&2; exit 1; }
case "$action" in start|stop|status|install|update|backup|restore) ;; *) fail 'Unknown deployment action.' ;; esac
if [[ "$action" == restore ]]; then
  [[ $# == 2 && "$2" =~ ^dt_datacenter_restore_[a-z0-9_]+$ && ${#2} -le 63 ]] || fail 'Restore requires archive and a NEW dt_datacenter_restore_* database.'
  [[ -f "$1" ]] || fail 'Archive not found.'
fi
if [[ ! -f "$ENV_FILE" ]]; then
  if [[ "$action" == install ]]; then
    umask 077
    cp -n "$ROOT/deployment/linux/.env.example" "$ENV_FILE"
  fi
  fail "Configure private environment first: $ENV_FILE"
fi
chmod 600 "$ENV_FILE"
compose=(docker compose --env-file "$ENV_FILE" -p dt_datacenter -f "$ROOT/docker/compose.yaml" -f "$ROOT/docker/compose.linux.yaml")
if [[ "${DT_ENABLE_FUNNEL_GATEWAY:-0}" == 1 || -f "$ROOT/config/linux/funnel.enabled" ]]; then compose+=(-f "$ROOT/docker/compose.funnel.yaml"); fi
docker info >/dev/null
"${compose[@]}" config --quiet
case "$action" in
  start) "${compose[@]}" up -d --no-build --wait --wait-timeout 120 ;;
  stop) "${compose[@]}" stop --timeout 30 ;;
  status) "${compose[@]}" ps ;;
  install)
    "${compose[@]}" pull postgres mosquitto nginx node-exporter
    "${compose[@]}" build --pull backend
    printf '%s\n' 'Images ready. Run deployment/linux/start.sh to start; no devices were reconfigured.'
    ;;
  update)
    [[ -z "$(git status --porcelain)" ]] || fail 'Working tree has changes; update aborted.'
    [[ "$(git branch --show-current)" == main ]] || fail 'Update requires branch main.'
    bash "$ROOT/deployment/linux/backup.sh"
    git pull --ff-only origin main
    "${compose[@]}" config --quiet
    "${compose[@]}" build --pull backend
    "${compose[@]}" run --rm --no-deps nginx nginx -t
    "${compose[@]}" run --rm --no-deps --entrypoint /bin/sh mosquitto -ec 'mosquitto_passwd -b -c /run/mosquitto/passwords "$MQTT_USERNAME" "$MQTT_PASSWORD"; chown mosquitto:mosquitto /run/mosquitto/passwords; exec mosquitto -c /mosquitto/config/mosquitto.conf --test-config'
    "${compose[@]}" up -d --no-build --force-recreate --wait --wait-timeout 120 mosquitto backend nginx
    "${compose[@]}" up -d --no-build --wait --wait-timeout 120
    if [[ "${DT_ENABLE_FUNNEL_GATEWAY:-0}" == 1 || -f "$ROOT/config/linux/funnel.enabled" ]]; then
      curl --fail --silent http://127.0.0.1:8080/ >/dev/null
      for path in /metrics /ready /health /api/spatial-registration /api/not-allowed; do
        code="$(curl --silent --output /dev/null --write-out '%{http_code}' "http://127.0.0.1:8080$path")"
        [[ "$code" == 403 || "$code" == 404 ]] || fail "Unsafe public gateway response: $path ($code)"
      done
      [[ "$(curl --silent -X POST --output /dev/null --write-out '%{http_code}' http://127.0.0.1:8080/api/spatial-registration)" == 403 ]] || fail 'Public write route is not blocked.'
    fi
    ;;
  backup)
    umask 077
    archive="${1:-$ROOT/backups/postgresql/DT_DataCenter-$(date -u +%Y%m%dT%H%M%SZ).dump}"
    [[ "$archive" == /* ]] || archive="$ROOT/$archive"
    mkdir -p -- "$(dirname -- "$archive")"
    [[ ! -e "$archive" ]] || fail 'Backup already exists; refusing overwrite.'
    mkdir -- "$archive.lock" || fail 'Backup destination is locked.'
    temporary="/tmp/dt-backup-$(date +%s)-$$.dump"
    cleanup() {
      "${compose[@]}" exec -T postgres rm -f -- "$temporary" >/dev/null 2>&1 || true
      rm -f -- "$archive.partial"
      rmdir -- "$archive.lock" 2>/dev/null || true
    }
    trap cleanup EXIT
    "${compose[@]}" exec -T postgres sh -ec 'umask 077; export PGPASSWORD="$POSTGRES_PASSWORD"; pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$1"; pg_restore --list "$1" >/dev/null' sh "$temporary"
    "${compose[@]}" cp "postgres:$temporary" "$archive.partial"
    chmod 600 "$archive.partial"
    mv -n -- "$archive.partial" "$archive"
    printf 'Backup: %s\n' "$archive"
    ;;
  restore)
    archive="$1"; target="$2"
    temporary="/tmp/dt-restore-$(date +%s)-$$.dump"
    trap '"${compose[@]}" exec -T postgres rm -f -- "$temporary" >/dev/null 2>&1 || true' EXIT
    "${compose[@]}" cp "$archive" "postgres:$temporary"
    "${compose[@]}" exec -T postgres sh -ec 'export PGPASSWORD="$POSTGRES_PASSWORD"; pg_restore --list "$1" >/dev/null; createdb -U "$POSTGRES_USER" --maintenance-db="$POSTGRES_DB" --template=template0 "$2"; pg_restore --exit-on-error --single-transaction --no-owner --no-privileges -U "$POSTGRES_USER" -d "$2" "$1"' sh "$temporary" "$target"
    "${compose[@]}" exec -T postgres sh -ec 'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -X -v ON_ERROR_STOP=1 -v FOUNDATION_ALREADY_APPLIED=1 -U "$POSTGRES_USER" -d "$1"' sh "$target" < "$ROOT/database/tests/foundation.sql"
    printf 'Restore verified in %s; operational database unchanged. Verification database retained.\n' "$target"
    ;;
esac
