# NGINX gateway architecture

## Data path

```text
ESP32-S3 / Proteus
  → MQTT QoS 1
  → Mosquitto (:1883 host-bound)
  → Node.js backend (:3000 container, :3010 host debug)
  → PostgreSQL (:5432 container-internal)
  → SSE / API / static frontend
  → NGINX (:80 host-bound)
  → browser
```

MQTT flows directly between the firmware/bridge and Mosquitto.
NGINX does not proxy MQTT traffic.

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

| Purpose                  | URL                                       |
| ------------------------ | ----------------------------------------- |
| Frontend (through NGINX) | http://127.0.0.1/                         |
| API (through NGINX)      | http://127.0.0.1/api/...                  |
| SSE (through NGINX)      | http://127.0.0.1/api/current-state/events |
| Backend direct (debug)   | http://127.0.0.1:3010/                    |
| Prometheus metrics       | http://127.0.0.1/metrics                  |

## What NGINX does NOT proxy

- **MQTT**: Firmware/bridge → Mosquitto is direct TCP on port 1883.
  NGINX is HTTP-only. Do not route MQTT through NGINX.

- **PostgreSQL**: Internal Docker network only. Not exposed to the host.

- **Grafana/Prometheus**: These run as separate Windows services outside
  Docker and have their own ports. They are not part of the NGINX
  routing scope.
