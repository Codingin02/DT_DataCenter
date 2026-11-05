#!/bin/sh
set -eu
fail() { printf '%s\n' "$*" >&2; exit 1; }
[ "${DT_ALLOW_DEVICE_RECONFIGURATION:-0}" = 1 ] || fail 'Blocked: MQTT changes/reboot require DT_ALLOW_DEVICE_RECONFIGURATION=1.'
[ "$#" -eq 2 ] || fail 'Usage: shelly-sync.sh APPROVED_BROKER_IPV4 APPROVED_SHELLY_IPV4 (no discovery)'
valid_ipv4() {
  printf '%s\n' "$1" | awk -F. 'NF != 4 { exit 1 } { for (i=1;i<=4;i++) if ($i !~ /^[0-9]+$/ || length($i)>3 || $i>255) exit 1 }'
}
valid_ipv4 "$1" && valid_ipv4 "$2" || fail 'Explicit IPv4 addresses are required.'
HOST_IP=$1
SHELLY_IP=$2
BROKER_SERVER="$HOST_IP:1883"
DEVICE_ID="${SHELLY_MQTT_ID:-shellyplugpmg3-48f6eebbf3f4}"
curl --fail --silent --show-error --connect-timeout 2 "http://$SHELLY_IP/rpc/Shelly.GetDeviceInfo" | grep -Fq "$DEVICE_ID" || fail 'Approved address does not identify the expected Shelly.'
CURRENT_SERVER="$(curl --fail --silent --show-error --connect-timeout 2 "http://$SHELLY_IP/rpc/MQTT.GetConfig" | grep -o '"server":"[^"]*"' | cut -d'"' -f4 || true)"
if [ "$CURRENT_SERVER" != "$BROKER_SERVER" ]; then
  printf '%s\n' 'Updating the explicitly approved Shelly MQTT target.'
  curl --fail --silent --show-error -X POST -H 'Content-Type: application/json' -d "{\"id\":1,\"method\":\"MQTT.SetConfig\",\"params\":{\"config\":{\"server\":\"$BROKER_SERVER\"}}}" "http://$SHELLY_IP/rpc" >/dev/null
  curl --fail --silent --show-error -X POST -H 'Content-Type: application/json' -d '{"id":2,"method":"Shelly.Reboot"}' "http://$SHELLY_IP/rpc" >/dev/null
  printf '%s\n' 'Shelly reboot requested; verify connectivity before claiming success.'
else
  printf '%s\n' 'Shelly already targets the approved broker.'
fi
