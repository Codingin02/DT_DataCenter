# Docker

Source aplikasi sama pada kedua OS. Basis kompatibilitas existing: `docker/compose.yaml`. Jalur baru memakai basis + **satu** override OS, bukan dua stack berbeda. Nama project `dt_datacenter`, container `dt-datacenter-{postgres,mosquitto,backend,nginx,node-exporter}`.

| Service       | Fungsi                               | Persistence / health                                                         |
| ------------- | ------------------------------------ | ---------------------------------------------------------------------------- |
| postgres      | PostgreSQL 17                        | volume postgres-data; pg_isready                                             |
| mosquitto     | broker terautentikasi                | mqtt-data pada override OS; authenticated health publish                     |
| backend       | HTTP 3000, MQTT subscriber/collector | state persisten di DB; GET /health                                           |
| nginx         | HTTP LAN 80, opsional publik 8080    | nginx-health                                                                 |
| node-exporter | host metrics Linux                   | host /proc /sys, bukan volume data; tidak memiliki Docker healthcheck bawaan |

Default network Compose menghubungkan backend ke `postgres:5432`, `mosquitto:1883`, dan Nginx ke `backend:3000`. Endpoint perangkat tetap IP LAN, bukan hostname container. Node Exporter memakai host network; Windows memakai exporter service di host Windows.

## Build

Dockerfile sekarang membangun dependency produksi dan frontend di stage terpisah melalui `npm ci` dari lockfile. Tidak lagi membutuhkan `node_modules` laptop atau frontend build lama. Final image berjalan sebagai user `node` dan hanya menyertakan dependency produksi, backend, kontrak, frontend hasil build. Tidak ada env operasional di build context: `.dockerignore` memakai allowlist.

`pull_policy: never` pada basis mempertahankan kebijakan tidak mengganti image saat start. `install` menarik image terpin dan membangun backend secara eksplisit; `start` hanya menggunakan image yang sudah tersedia. Build memerlukan internet. Jangan jalankan install/update pada produksi tanpa backup serta review versi.

## Validasi tanpa mencetak secret

```bash
docker compose --env-file .env.server -p dt_datacenter -f docker/compose.yaml -f docker/compose.linux.yaml config --quiet
```

Jangan menempel output `config` lengkap atau `docker inspect` environment ke chat/log publik. Healthcheck Mosquitto memakai env container; perintah healthcheck dapat menampilkan password dalam process list internal. Akses administrator Docker harus dibatasi.

Volume PostgreSQL default sama dengan existing. `POSTGRES_PASSWORD`/`POSTGRES_DB` hanya menginisialisasi volume baru; mengganti env tidak otomatis mengganti password, nama DB, atau user volume existing. Inisialisasi SQL hanya dijalankan pada volume baru. `DT_POSTGRES_VOLUME` memilih nama volume existing; pastikan benar sebelum start.

`compose.funnel.yaml` menambahkan mount konfigurasi listener read-only dan port **127.0.0.1:8080**, pada service Nginx yang sama. Tidak membuat daemon Tailscale dalam container. Marker privat `config/linux/funnel.enabled` membuat wrapper menyertakan override ini pada operasi berikutnya.

Opsi TLS/VPN `compose.server.yaml` dipertahankan sebagai kemampuan lanjutan non-default, bukan deployment kedua aktif. Ia memerlukan cert privat, external restored volume, VPN bind dan broker 8883; **jangan gabungkan** dengan workflow OS biasa tanpa rencana migrasi perangkat.
