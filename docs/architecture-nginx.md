# Nginx architecture

Canonical overview: [ARCHITECTURE.md](ARCHITECTURE.md); OS workflows: [LINUX.md](LINUX.md), [WINDOWS.md](WINDOWS.md).

`infra/nginx/nginx.conf` remains the LAN reverse proxy to backend:3000. Its SSE route disables buffering. The optional include `funnel.conf*` loads the separate public listener only when `compose.funnel.yaml` mounts it; LAN behavior remains unchanged.

The public listener is 8080, published only to host 127.0.0.1:8080. It permits dashboard static resources, read-only asset state/history and SSE, and rejects spatial registration, metrics, health/readiness and unknown routes. [Funnel runbook](TAILSCALE.md) is authoritative for publication, approval and testing.

## Authorized Linux server deployment

Use the normal Linux override with the existing server environment and volume, after backup and verification. Do not activate an old VPN/TLS recipe as the default runtime.

`docker/compose.server.yaml`, `mosquitto.server.conf` and `mosquitto.server.acl` retain an optional advanced TLS/VPN capability. They require a separate MQTT password, authorized IoT bind address, valid private CA/cert/key directory, VPN website bind address, and explicit restored external database volume. They change broker to 8883 and remove direct backend host port. Devices currently using LAN MQTT 1883 will not automatically become TLS-compatible. Such a migration needs explicit device/client compatibility checks and approval; the standard install/start wrappers do not apply these files.
