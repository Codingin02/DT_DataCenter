# Digital Twin Data Center

An operational physical rack monitoring system with ESP32-S3 environmental/acoustic
acquisition, Shelly electrical measurements, host network telemetry, and historical analytics.

The physical scope is one lower-environment rack. The upper server is outside this
project's access boundary. `DT_DataCenter` remains the internal identifier.

The active mechanical source is an ESP32-S3 board carrying
ESP32-S3-WROOM-1-N16R8. Its firmware directly acquires two SEN0331 SHT31 sensors on
separate 50 kHz I2C controllers and the INMP441 through digital I2S. The active firmware is
`E:\Projects\IOT ESP32 Project\Digital Twin Data Center\DT_DataCenter\DT_DataCenter.ino`;
its private `local_config.h` remains outside Git. [`docs/PRD.md`](docs/PRD.md) defines
requirements and remaining physical gates; [`docs/contracts/foundation.md`](docs/contracts/foundation.md)
defines the canonical server contract. The frontend uses one procedural 42U Three.js rack and ECharts.

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
`POSTGRES_PASSWORD` through the existing private local configuration or calling
environment; credentials must never be committed or printed.

Use the existing Start Digital Twin and Stop Digital Twin shortcuts for the local
application and project-owned monitoring services. The launcher reuses healthy services,
builds changed application source when necessary, and opens `http://127.0.0.1:3010/`.

For an application-only build/start through the same canonical Compose workflow:

```text
npm run frontend:build
docker compose -p dt_datacenter -f docker/compose.yaml build --pull=false
docker compose -p dt_datacenter -f docker/compose.yaml up -d --pull never
```

The operational endpoint and Compose default are `http://127.0.0.1:3010/`.
Nginx separately proxies the same application at `http://127.0.0.1/`; port 3010 is
served directly by the existing backend, not by Nginx. `DT_HTTP_BIND_ADDRESS` and
`DT_HTTP_PORT` control only the host-side application endpoint; the Node process listens
on the container interface required by Docker forwarding. PostgreSQL remains internal to
the Compose network.

Mosquitto requires authentication and publishes only on `127.0.0.1:1883` by default.
`MQTT_USERNAME` and `MQTT_PASSWORD` may provide a broker credential distinct from the
local runtime credential. On Windows, the launcher preserves that loopback binding and
owns a single portproxy mapping from the active Wi-Fi IPv4 port 1883 to `127.0.0.1:1883`.
Its firewall rule is scoped to the active address, subnet, and network profile. Network
changes require the existing authorization/provisioning flow; no address or credential
is hardcoded here. USB/NVS provisioning remains the ESP32 fallback, and Shelly updates
that require reboot request consent. `DT_MQTT_BIND_ADDRESS` and `DT_MQTT_PORT` remain
deployment configuration for other authorized hosts.

Authorized Linux deployment uses the same Compose project with
`docker/compose.server.yaml`. Its TLS broker, VPN-only web binding, restored-volume
requirement, image transfer, and rollback procedure are defined in
[`docs/architecture-nginx.md`](docs/architecture-nginx.md#authorized-linux-server-deployment).

Stop Digital Twin preserves PostgreSQL volumes and telemetry history while stopping
launcher-owned components. Application-only `docker compose -p dt_datacenter -f docker/compose.yaml stop`
also preserves the containers and volumes; never use `down -v`
or volume cleanup. The local deployment is operational. Dedicated-server deployment,
network policy, and TLS still require target-environment verification.
