# DT_DataCenter

Digital Twin Data Center Laboratory — R1 Representation.

The physical scope is one lower-environment rack. The upper server is reserved for
supervisor research and is outside this project's access boundary.

The active mechanical source is an ESP32-S3 board carrying
ESP32-S3-WROOM-1-N16R8. Its firmware directly acquires two SEN0331 SHT31 sensors on
separate I2C controllers and the INMP441 through digital I2S. The active
[ESP-IDF firmware](firmware/esp32s3_datacenter/) and remaining physical gates are
defined by [`docs/PRD.md`](docs/PRD.md); the hardware-neutral server contract remains
in [`docs/contracts/foundation.md`](docs/contracts/foundation.md).

## PostgreSQL backup verification

Set the PostgreSQL environment variables from `.env.example`. `PG_BACKUP_FILE` must not
already exist, and `PGRESTORE_DATABASE` must identify a disposable database that does
not already exist.

```text
npm run backup:database
npm run test:database:restore
```

The backup uses PostgreSQL custom format. Restore verification creates the disposable
database, restores the archive in one transaction, runs the foundation database checks,
and removes only the database it created.

## Local runtime

The canonical local container runtime is `docker/compose.yaml`. It uses the exact local
PostgreSQL, Mosquitto, and Node images plus the existing project `node_modules`. Set
`POSTGRES_PASSWORD` in the calling environment; it is a runtime-only value and must not
contain production credentials.

Build the frontend before the backend image, then start Compose with pulling disabled:

```text
npm run frontend:build
docker compose -p dt_datacenter -f docker/compose.yaml build --pull=false
docker compose -p dt_datacenter -f docker/compose.yaml up -d --pull never
```

The local launcher sets `DT_HTTP_PORT=3010`, serving the application at
`http://127.0.0.1:3010/`. Compose alone defaults to `127.0.0.1:3000`;
set `DT_HTTP_PORT=3010` in the calling environment to use the launcher endpoint.
`DT_HTTP_BIND_ADDRESS` and
`DT_HTTP_PORT` control only the host-side application endpoint; the Node process listens
on the container interface required by Docker forwarding. PostgreSQL remains internal to
the Compose network.

Mosquitto requires authentication and publishes only on `127.0.0.1:1883` by default.
`MQTT_USERNAME` and `MQTT_PASSWORD` may provide a broker credential distinct from the
local runtime credential. A physical device can reach the same authenticated listener
only after `DT_MQTT_BIND_ADDRESS` is explicitly set to the real deployment interface;
`DT_MQTT_PORT` selects its host port. No campus address or credential is stored here.

For a VM host, set an explicit interface address (or `0.0.0.0` only when deliberate)
before starting the same Compose file:

```text
DT_HTTP_BIND_ADDRESS="$VM_INTERFACE_ADDRESS" DT_HTTP_PORT=3010 DT_MQTT_BIND_ADDRESS="$VM_INTERFACE_ADDRESS" DT_MQTT_PORT=1883 docker compose -p dt_datacenter -f docker/compose.yaml up -d --pull never
```

Stop the local runtime with
`docker compose -p dt_datacenter -f docker/compose.yaml down`. This preserves the
PostgreSQL volume and history. This runtime is not a production deployment.
