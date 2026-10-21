# Digital Twin Data Center — Nginx Architecture

## Data path

```text
Physical ESP32-S3 / Shelly / host NIC collector
  → MQTT QoS 1
  → Mosquitto (:1883 host-bound)
  → Node.js backend (:3000 container, :3010 operational host endpoint)
  → PostgreSQL (:5432 container-internal)
  → SSE / API / static frontend
  → browser directly on :3010, or through NGINX on :80
```

MQTT flows directly between the physical devices/host collector and Mosquitto.
NGINX does not proxy MQTT traffic.
The Windows launcher keeps Mosquitto loopback-published and manages an active Wi-Fi
IPv4 portproxy to `127.0.0.1:1883`, with a subnet/profile-scoped firewall rule.
PostgreSQL remains internal to the existing Compose project.

## Service topology

| Service   | Image                          | Container port | Host port      | Purpose                          |
| --------- | ------------------------------ | -------------- | -------------- | -------------------------------- |
| postgres  | postgres:17.11-alpine3.24      | 5432           | none           | Relational store                 |
| mosquitto | eclipse-mosquitto:2.1.2-alpine | 1883           | 127.0.0.1:1883 | MQTT broker                      |
| backend   | dt-datacenter-backend:local    | 3000           | 127.0.0.1:3010 | API, SSE, ingestor, static files |
| nginx     | nginx:1.28-alpine              | 80             | 127.0.0.1:80   | HTTP reverse proxy               |

## NGINX routing

| Location                      | Target       | Notes                                      |
| ----------------------------- | ------------ | ------------------------------------------ |
| `= /api/current-state/events` | backend:3000 | SSE: proxy_buffering off, 24h timeout      |
| `/api/`                       | backend:3000 | All REST API routes                        |
| `= /health`                   | backend:3000 | Liveness probe                             |
| `= /ready`                    | backend:3000 | Readiness probe                            |
| `= /metrics`                  | backend:3000 | Prometheus metrics                         |
| `= /nginx-health`             | NGINX 200    | Docker healthcheck for NGINX itself        |
| `/`                           | backend:3000 | Frontend static assets (served by backend) |

## SSE configuration

Server-Sent Events require specific proxy settings to prevent NGINX
from buffering the event stream:

```nginx
proxy_buffering    off;
proxy_cache        off;
proxy_http_version 1.1;
proxy_set_header   Connection '';
proxy_read_timeout 86400s;
proxy_send_timeout 86400s;
chunked_transfer_encoding off;
```

The empty `Connection` header prevents NGINX from closing the upstream
connection with `Connection: close`, which would terminate the SSE stream.

## Configuration files

| File                     | Purpose                                  |
| ------------------------ | ---------------------------------------- |
| `infra/nginx/nginx.conf` | NGINX configuration                      |
| `docker/compose.yaml`    | Service definition (nginx service block) |

## Environment variables

| Variable                | Default   | Purpose                     |
| ----------------------- | --------- | --------------------------- |
| `DT_NGINX_BIND_ADDRESS` | 127.0.0.1 | Host bind address for NGINX |
| `DT_NGINX_PORT`         | 80        | Host port for NGINX         |

## Access paths

| Purpose                                  | URL                                       |
| ---------------------------------------- | ----------------------------------------- |
| Frontend (through NGINX)                 | http://127.0.0.1/                         |
| API (through NGINX)                      | http://127.0.0.1/api/...                  |
| SSE (through NGINX)                      | http://127.0.0.1/api/current-state/events |
| Operational application (backend direct) | http://127.0.0.1:3010/                    |
| Prometheus metrics                       | http://127.0.0.1/metrics                  |

## What NGINX does NOT proxy

- **MQTT**: Physical devices/host collector → Mosquitto is direct TCP on port 1883.
  NGINX is HTTP-only. Do not route MQTT through NGINX.

- **PostgreSQL**: Internal Docker network only. Not exposed to the host.

- **Monitoring**: Grafana and Windows Exporter are on-demand Windows services;
  Prometheus is a launcher-managed host process. They retain their own ports and
  are not part of the NGINX routing scope. The independent Windows PostgreSQL service
  is not the application's Compose PostgreSQL service and is not launcher-owned.

## Authorized Linux server deployment

`docker/compose.server.yaml` is an explicit override of the canonical Compose file,
not another stack. Do not apply it to the running Windows deployment. It requires
Linux Docker Engine, Compose 2.24.4 or newer, and administrator approval for the host,
network, VPN, firewall, migration, and device provisioning.

| Server interface    | Published service                        | Required access policy                                |
| ------------------- | ---------------------------------------- | ----------------------------------------------------- |
| Authorized IoT IPv4 | MQTT TLS 8883                            | Approved device networks only                         |
| Authorized VPN IPv4 | Nginx HTTP 3010                          | Approved administrators only, encrypted VPN transport |
| Docker network only | MQTT 1883, backend 3000, PostgreSQL 5432 | No host publication                                   |

The override replaces, rather than adds to, local port mappings. All four services
use `unless-stopped`. PostgreSQL must use an explicitly named **existing, restored**
external volume. Broker sessions and retained messages persist in `mqtt-data`.
The server does not use Windows portproxy, a laptop hotspot, or USB telemetry forwarding.
The local configuration and Windows launchers remain unchanged.

### Network and device prerequisites

- Provide stable authorized server DNS, an IoT interface address, routing from the
  device network, and an approved firewall policy. Never use temporary laptop DHCP
  addresses as production endpoints. A VPN interface is for administrators, not the
  ESP32 or Shelly data path. Client isolation must be resolved by the network owner.
- ESP32-S3 requires 2.4 GHz. Direct Enterprise authentication requires the approved
  EAP/phase-2 method, outer/inner identity, CA, and expected RADIUS server name.
  Certificate validation must remain enabled. The active Arduino sketch currently
  provisions WPA2-Personal and `mqtt://HOST:1883` through USB/NVS; it has no Enterprise,
  MQTT TLS, or OTA provisioning path. Direct Enterprise/TLS needs a networking-only
  firmware extension, build verification, and separate one-time flash approval.
  Keep all acquisition code and GPIO unchanged. Thereafter use standalone USB power.
- The documented Shelly Gen3 Wi-Fi configuration exposes personal-network credentials,
  not Enterprise EAP client settings. Use an authorized compatible 2.4 GHz IoT network
  unless exact device firmware evidence establishes Enterprise support. Its existing
  MQTT interface supports TLS with a trusted CA. Preserve identity, topic prefix,
  credentials, PM1 configuration, and power state. Configuration/reboot requires approval.
- Rotate exposed Wi-Fi credentials through the official account system. Provision
  new credentials directly on the device through an approved private mechanism;
  never place them in Docker, Git, logs, or chat.

### Private configuration and image transfer

1. Confirm server OS/CPU architecture, Docker capacity, synchronized time, backup
   storage, approved VPN, and administrator access. This repository does not establish
   server access or verify a physical deployment.
2. Transfer the four exact built application/base images using Docker `save`/`load`,
   recording SHA-256 checksums and image IDs. The backend image already contains the
   production frontend. Build only on an authorized matching architecture if required;
   do not copy Windows `node_modules` to a Linux server. Preserve a rollback tag/archive
   before loading a replacement. Server startup requires no npm, build, or registry pull.
3. Copy `.env.example` to the ignored `.env.server`, using private permissions (`0600`).
   Keep `POSTGRES_PASSWORD`, `MQTT_USERNAME`, and `MQTT_PASSWORD` compatible with the
   migrated database and provisioned devices; do not rotate active credentials silently.
   Set `DT_POSTGRES_VOLUME` to the restored existing volume, `DT_IOT_BIND_ADDRESS` to
   the approved server IoT IPv4, and `DT_ADMIN_BIND_ADDRESS` to the server VPN IPv4.
   `HOST_EXPORTER_PLATFORM` is forced to `linux` by the override. Leave `HOST_EXPORTER_URL`,
   `HOST_DEVICE_ID`, and `HOST_NETWORK_NIC` empty until the server's actual host collector
   and physical NIC have been verified. Do not reuse laptop identities.
4. Set `DT_MQTT_TLS_DIRECTORY` to a private absolute Linux directory containing `ca.crt`,
   `server.crt` (including required intermediates), and `server.key`. The certificate
   SAN must match the provisioned broker DNS. The Mosquitto process must be able to read
   the key without making it world-readable. Obtain certificates from an approved issuer;
   no example keys or insecure verification bypasses are provided.
5. The checked-in broker ACL permits only canonical site telemetry/device status,
   the broker health topic, and existing Shelly native RPC/status topics. It preserves
   the current shared MQTT principal; it does not provide per-device credential isolation.
   Distinct device principals/ACLs require a separately authorized provisioning change.
   The internal plaintext listener is not published; external devices use TLS 8883.

### Data migration and rollback

Use the existing verified backup/restore procedure before cutover. On the current
source host, an approved Linux-shell export can use the running database container:

```sh
umask 077
docker compose --env-file .env -p dt_datacenter -f docker/compose.yaml exec -T postgres \
  pg_dump -U bagus -d DT_DataCenter -Fc > /private/approved-backup-path/DT_DataCenter.dump
sha256sum /private/approved-backup-path/DT_DataCenter.dump
```

Choose a new backup filename; never overwrite an existing backup. Transfer it securely,
verify its checksum and `pg_restore --list`, then restore into an approved target volume
and verify schema/current/history counts and representative original records **before**
retargeting devices. Restore must not overwrite an existing populated target database
without separate authorization. Do not run migrations, empty-volume initialization,
volume cleanup, or database recreation as an acceptance shortcut. The server override
omits the local initialization-SQL mount: restoring the real schema must not collide
with an automatically seeded schema.

For a separately approved **new, empty target volume**, load the exact images, create
the designated volume through the administrator's normal storage procedure, then start
only the target PostgreSQL service and restore the validated dump before application startup:

```sh
docker compose --env-file .env.server -p dt_datacenter \
  -f docker/compose.yaml -f docker/compose.server.yaml \
  up -d --no-deps --no-build --pull never --wait postgres
docker compose --env-file .env.server -p dt_datacenter \
  -f docker/compose.yaml -f docker/compose.server.yaml exec -T postgres \
  pg_restore --exit-on-error --no-owner -U bagus -d DT_DataCenter \
  < /private/approved-backup-path/DT_DataCenter.dump
```

Do not use this bootstrap on the current development database or an already populated
target. Keep the backend stopped until restore and record-level verification succeed.

Keep the source database/backup and prior images unchanged through acceptance. Rollback
stops only target application services, loads the known prior image, and starts the same
configuration against the preserved compatible volume. Do not restore old data over new
observations. A device broker rollback requires approval; do not run both backends against
the same MQTT input as an improvised migration strategy. Document any monitoring gap;
QoS 1 alone does not prove zero data loss during offline periods.

### Approved server startup and acceptance

After certificates, migrated data, VPN and firewall authorization are complete:

```sh
docker compose --env-file .env.server -p dt_datacenter \
  -f docker/compose.yaml -f docker/compose.server.yaml config --quiet
sh scripts/runtime.sh start server
docker compose --env-file .env.server -p dt_datacenter \
  -f docker/compose.yaml -f docker/compose.server.yaml ps
```

`sh scripts/runtime.sh stop server` stops the same services without deleting containers
or volumes. Docker Engine and the approved VPN must start on host boot; the VPN address
must be available before Nginx binding is attempted. Verify boot recovery on the actual
host, not just the restart policy. Avoid unrestricted `docker compose config` output:
environment credentials are visible to privileged Docker administrators.

For Linux telecommunications, use an approved host `node_exporter` installation and the
existing backend `linux` adapter. Select the actual routed physical NIC. Restrict exporter
access to the backend/Prometheus; do not publish 9100 campus-wide. `host.docker.internal`
maps to the host gateway in the override, but the exporter must listen on a trusted
address reachable from Docker, not container loopback. Windows Exporter and laptop NIC
statistics are not Linux host measurements. Prometheus/Grafana remain separately owned
host services; installing them requires approval and preserving their configuration/data.

Check four healthy services, TLS certificate/hostname validation, MQTT PUBACK, six ESP32
measurements, nineteen Shelly identities, host metrics, API/current/history and live SSE
through Nginx. Confirm new source timestamps and sequence progression. Test standalone
device power/reconnect only with approval. Finally turn off the development laptop and
prove that the server still receives and stores new real observations. Until this test
passes, independence from the laptop is **not verified**.

Remote administration uses an approved host VPN without exit-node or subnet-routing
changes. Tailscale's free Personal plan is for eligible non-commercial personal use;
institutional eligibility needs confirmation. WireGuard is open source but requires an
authorized reachable endpoint/routing and managed keys. Neither bypasses campus policy.
