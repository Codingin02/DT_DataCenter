#!/bin/sh
# Synchronize Shelly Plug PM Gen3 MQTT broker target with the active host.
set -eu

DEVICE_ID="${SHELLY_MQTT_ID:-shellyplugpmg3-48f6eebbf3f4}"
HOST_IP="${1:-$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7}' || hostname -I | awk '{print $1}')}"
BROKER_SERVER="${HOST_IP}:1883"

printf 'Searching for Shelly (%s) to direct MQTT to %s...\n' "$DEVICE_ID" "$BROKER_SERVER"

SHELLY_IP=""
if command -v getent >/dev/null 2>&1; then
  SHELLY_IP="$(getent hosts "${DEVICE_ID}.local" 2>/dev/null | awk '{print $1}' || true)"
fi

SUBNET_PREFIX="$(echo "$HOST_IP" | cut -d. -f1-3)"
if [ -z "$SHELLY_IP" ]; then
  for i in $(seq 1 254); do
    candidate="$SUBNET_PREFIX.$i"
    [ "$candidate" = "$HOST_IP" ] && continue
    if curl -s --connect-timeout 0.15 "http://$candidate/rpc/Shelly.GetDeviceInfo" 2>/dev/null | grep -q "$DEVICE_ID"; then
      SHELLY_IP="$candidate"
      break
    fi
  done
fi

if [ -n "$SHELLY_IP" ]; then
  printf 'Found Shelly at %s.\n' "$SHELLY_IP"
  CURRENT_SERVER="$(curl -s --connect-timeout 2 "http://$SHELLY_IP/rpc/MQTT.GetConfig" 2>/dev/null | grep -o '"server":"[^"]*"' | cut -d'"' -f4 || true)"
  if [ "$CURRENT_SERVER" != "$BROKER_SERVER" ]; then
    printf 'Updating Shelly MQTT broker from %s to %s...\n' "$CURRENT_SERVER" "$BROKER_SERVER"
    curl -s -X POST -H 'Content-Type: application/json' -d "{\"id\":1,\"method\":\"MQTT.SetConfig\",\"params\":{\"config\":{\"server\":\"$BROKER_SERVER\"}}}" "http://$SHELLY_IP/rpc" >/dev/null
    curl -s -X POST -H 'Content-Type: application/json' -d '{"id":2,"method":"Shelly.Reboot"}' "http://$SHELLY_IP/rpc" >/dev/null
    printf 'Shelly rebooted with target %s.\n' "$BROKER_SERVER"
  else
    printf 'Shelly already targets %s.\n' "$BROKER_SERVER"
  fi
else
  printf 'Shelly (%s) not found on %s.0/24.\n' "$DEVICE_ID" "$SUBNET_PREFIX"
  printf 'Ensure Shelly is powered on and connected to this 2.4 GHz Wi-Fi network.\n'
fi
