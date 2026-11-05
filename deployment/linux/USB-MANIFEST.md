# Manifest Kelengkapan Media USB Digital Twin

Dokumen ini mencatat seluruh aset, paket biner offline, dan komponen yang tersedia di dalam media USB `F:\Digital Twin\` untuk deployment offline ke server Debian 13.

---

## 1. Identitas Media USB

- **Volume Label:** `DEBIAN 13_7`
- **Filesystem:** `FAT32` (`vfat`)
- **Transport:** USB 3.0 / USB 3.2 Gen 1
- **Kapasitas:** 57.28 GiB (~61.5 GB desimal)
- **Status Bootable:** Tetap berfungsi sebagai Debian 13 NetInst Installer (file bootloader dan direktori pool Debian berada di root `F:\`).

---

## 2. Inventaris Kontainer Docker Offline (`deployment/resources/images/`)

| Berkas Image (.tar) | Ukuran | Image Tag Target |
| :--- | :--- | :--- |
| `backend.tar` | 106.7 MB | `dt-datacenter-backend:local` |
| `postgres.tar` | 117.8 MB | `postgres:17.11-alpine3.24` |
| `mosquitto.tar` | 10.6 MB | `eclipse-mosquitto:2.1.2-alpine` |
| `nginx.tar` | 26.8 MB | `nginx:1.28-alpine` |
| `node-exporter.tar` | 12.9 MB | `prom/node-exporter:v1.9.0` |

*Cara memuat seluruh image secara offline jika Docker cache kosong:*
```bash
for img in deployment/resources/images/*.tar; do
  docker load -i "$img"
done
```

---

## 3. Inventaris Paket Debian Offline (`deployment/resources/packages/`)

Tersedia 41 berkas `.deb` lengkap untuk kebutuhan instalasi sistem tanpa internet, termasuk:
- `docker-ce_29.9.2-1~debian.13~trixie_amd64.deb`
- `docker-ce-cli_29.9.2-1~debian.13~trixie_amd64.deb`
- `containerd.io_2.4.2-3~debian.13~trixie_amd64.deb`
- `docker-compose-plugin_5.6.1-1~debian.13~trixie_amd64.deb`
- `docker-buildx-plugin_0.38.1-1~debian.13~trixie_amd64.deb`
- `openssh-server_10.0p1-7+deb13u4_amd64.deb`
- `iptables_1.8.11-2_amd64.deb`

---

## 4. Inventaris Paket Tailscale Offline (`deployment/resources/tailscale/`)

| Berkas | Ukuran | Checksum SHA-256 |
| :--- | :--- | :--- |
| `tailscale_1.104.4_amd64.deb` | 40.7 MB | `8768973def76dd530b53a0fe74ca396252fff050f955aeebfabd33c77960625d` |
| `tailscale-archive-keyring.gpg`| 2.3 KB | `3e03dacf222698c60b8e2f990b809ca1b3e104de127767864284e6c228f1fb39` |
| `tailscale.list` | 158 B | `5a1b21b30892bf22fb5d7c4f52fefe9b65efda2100e82abba2e0849da2a2264b` |

---

## 5. Cara Memverifikasi Integritas Media USB di Server

Jalankan perintah ini di terminal Debian:

```bash
cd "/mnt/usb/Digital Twin"

# 1. Verifikasi Checksum Tailscale
(cd deployment/resources/tailscale && sha256sum -c SHA256SUMS)

# 2. Verifikasi Sintaks Seluruh Skrip Shell
for s in deployment/linux/*.sh deployment/tailscale/*.sh; do
  bash -n "$s" && echo "[OK] $s"
done
```
