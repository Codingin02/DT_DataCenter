# Konfigurasi dan environment

## Lokasi dan prioritas

| Lokasi                                            | Fungsi                                                                                | Publik? |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- | ------- |
| `.env.windows`                                    | env wrapper Windows, credential dipertahankan dari USB; collector belum dikonfigurasi | Tidak   |
| `.env.server` pada `/opt/digital-twin-datacenter` | env server aktif, **belum berhasil diakses/disalin**                                  | Tidak   |
| `.env`, `.env.debian` pada USB                    | konfigurasi asal dipertahankan utuh; bukan bukti env server                           | Tidak   |
| `config/windows/.env`                             | konfigurasi Windows yang disiapkan, sama dengan `.env.windows` saat penataan          | Tidak   |
| `config/linux/.env`, `config/*/.env.recovered`    | credential/config asal untuk pemulihan; NIC Linux asal masih enp0s3                   | Tidak   |
| `config/private/`                                 | credential asal, catatan privat dan bukti pembersihan                                 | Tidak   |
| `deployment/{windows,linux}/.env.example`         | template OS tanpa password asli                                                       | Ya      |
| `.env.example`                                    | nama variabel aplikasi langsung dan opsi tambahan                                     | Ya      |
| `firmware/ESP32/recovered/local_config.h`         | credential firmware ditemukan, disimpan tanpa perubahan                               | Tidak   |

`.env.server` tidak dibuat dengan password karangan. Gunakan env server existing ketika akses tersedia. Jangan menganggap file env bernama sama memiliki isi sama. Docker Compose mendapat env lewat `--env-file`; env shell pemanggil dapat mengalahkan nilai file. Jangan memakai shell berisi override lama pada produksi.

## Variabel aplikasi dan Compose

| Variabel                    | Fungsi/format                                                         | Pemakaian dan penyimpanan                                                                                                                    |
| --------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| POSTGRES_PASSWORD           | **Secret**, password bootstrap PostgreSQL dan koneksi backend Compose | env OS privat; wajib tidak kosong                                                                                                            |
| PGHOST                      | host PostgreSQL, mis. postgres di network Compose                     | app langsung/tool backup host; Compose backend memaksa postgres                                                                              |
| PGPORT                      | port DB, 1–65535                                                      | app langsung/tool host; Compose backend 5432                                                                                                 |
| PGDATABASE                  | nama DB persis, jangan otomatis membetulkan ejaan                     | override OS mengisi backend/POSTGRES_DB; template DT_DataCenter                                                                              |
| PGUSER                      | user DB                                                               | override OS; harus cocok volume existing                                                                                                     |
| PGPASSWORD                  | **Secret**, koneksi app/tool langsung                                 | Compose backend memakai POSTGRES_PASSWORD, bukan nilai ini                                                                                   |
| DATABASE_URL                | **Secret** jika memuat user/password; postgres:// atau postgresql://  | alternatif konfigurasi app langsung, menang atas PG* di backend/config.js; tidak di-forward wrapper Compose                                  |
| PG_BACKUP_FILE              | path archive PostgreSQL                                               | tool Node `scripts/postgres-backup.js`; wrapper OS memakai argumen archive atau default unik                                                 |
| PGRESTORE_DATABASE          | database disposable dt_datacenter_restore_*                           | tool Node verify; wrapper OS memakai argumen target                                                                                          |
| MQTT_URL                    | mqtt:// atau mqtts:// tanpa credential                                | Compose backend selalu mqtt://mosquitto:1883; app langsung configurable                                                                      |
| MQTT_CLIENT_ID              | client ID backend, max 128 karakter                                   | Compose menggunakan env atau default existing dt-r1-local-backend; tidak boleh duplikat pada broker sama                                     |
| MQTT_USERNAME               | username broker                                                       | env privat; dipakai broker dan backend Compose                                                                                               |
| MQTT_PASSWORD               | **Secret**, password broker                                           | env privat; basis fallback ke POSTGRES_PASSWORD jika tidak diisi, pisahkan pada instalasi baru tanpa mengganti credential produksi diam-diam |
| MQTT_SESSION_EXPIRY_SECONDS | integer 1–4294967295, default 86400                                   | env OS, MQTT5 session                                                                                                                        |
| MQTT_MAX_PAYLOAD_BYTES      | integer 1024–1048576, default 65536                                   | env OS, batas ingestion                                                                                                                      |
| SHELLY_MQTT_ID              | shellyplugpmg3- diikuti 12 hex                                        | env OS, identitas perangkat actual                                                                                                           |
| HTTP_HOST                   | bind proses Node                                                      | app langsung; Compose memaksa 0.0.0.0 **di dalam container**                                                                                 |
| HTTP_PORT                   | port proses Node                                                      | app langsung; Compose memaksa 3000 di dalam container                                                                                        |
| FRONTEND_DIST               | path direktori frontend build                                         | app langsung opsional; Compose /app/frontend/dist                                                                                            |
| HOST_EXPORTER_URL           | HTTP(S), tanpa credential/query                                       | env OS; kosong menonaktifkan collector                                                                                                       |
| HOST_EXPORTER_PLATFORM      | linux atau windows                                                    | override OS memaksa platform sesuai OS                                                                                                       |
| HOST_DEVICE_ID              | identitas host-..., sesuai validator                                  | env OS, jangan ubah identitas sumber existing                                                                                                |
| HOST_NETWORK_NIC            | label device Linux atau nic Windows tepat                             | env OS; harus diperiksa pada exporter aktual                                                                                                 |
| DT_HTTP_BIND_ADDRESS        | alamat publikasi host aplikasi, template 127.0.0.1                    | env OS; bukan HTTP_HOST                                                                                                                      |
| DT_HTTP_PORT                | port host aplikasi, default 3010                                      | env OS → container 3000                                                                                                                      |
| DT_MQTT_BIND_ADDRESS        | alamat host broker; Linux template IP LAN, Windows loopback           | env OS; bukan broker internal container                                                                                                      |
| DT_MQTT_PORT                | host port broker, default 1883                                        | env OS → container 1883                                                                                                                      |
| DT_NGINX_BIND_ADDRESS       | alamat host website LAN, default 0.0.0.0                              | env OS                                                                                                                                       |
| DT_NGINX_PORT               | host port website, default 80                                         | env OS → container 80                                                                                                                        |
| DT_RESTART_POLICY           | unless-stopped pada template                                          | env OS, restart semua service utama                                                                                                          |
| DT_POSTGRES_VOLUME          | nama volume PostgreSQL existing                                       | override OS, default dt_datacenter_postgres-data; periksa sebelum start                                                                      |
| DT_EXPORTER_BIND_ADDRESS    | bind host Node Exporter port 9100                                     | override Linux; harus terjangkau container dan dibatasi firewall                                                                             |

Nilai HTTP_HOST=0.0.0.0 **container** tidak sama dengan membuka backend pada semua interface host. Yang menentukan publikasi backend host adalah DT_HTTP_BIND_ADDRESS.

Tidak ditemukan penggunaan `MQTT_PASSHORD` pada jalur aplikasi/Compose yang diperiksa. Nama benar `MQTT_PASSWORD`. Typo dalam catatan lama tidak dimigrasikan menjadi variabel baru.

## Variabel operasi, bukan credential

| Variabel                        | Fungsi                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| DT_ENV_FILE                     | pilih path env privat untuk wrapper Bash/PowerShell; env shell, bukan otomatis dibaca dari file Compose |
| DT_ENABLE_FUNNEL_GATEWAY        | env shell bernilai 1 memasukkan compose.funnel.yaml; alternatif marker config/linux/funnel.enabled      |
| DT_PUBLIC_READONLY_APPROVED     | env shell bernilai 1: persetujuan eksplisit publikasi telemetry sebelum funnel.sh enable                |
| DT_ALLOW_DEVICE_RECONFIGURATION | env shell bernilai 1 membuka tool Shelly manual; **jangan set saat operasi rutin**                      |
| DT_ACCEPTANCE_COMPOSE_PROJECT   | tooling acceptance, bukan konfigurasi produksi                                                          |
| DT_ACCEPTANCE_CONTAINER         | tooling acceptance untuk memilih container; bukan startup produksi                                      |

Opsi TLS/VPN lanjutan non-default: `DT_IOT_BIND_ADDRESS` (alamat host broker TLS), `DT_ADMIN_BIND_ADDRESS` (alamat VPN website), `DT_MQTT_TLS_DIRECTORY` (**privat**, direktori CA/cert/key), `DT_POSTGRES_VOLUME` (external restored volume). Bukan prasyarat workflow LAN 1883 biasa.

Libpq dapat membaca PGSSLMODE/PGPASSFILE dan variabel PostgreSQL standar lain pada tool host; hanya gunakan sesuai kebijakan deployment, jangan mencetak file password. Nginx tidak membaca `.env` langsung: perubahan port/bind dilakukan Compose. Tailscale memakai state/akun host, tidak memerlukan password Tailscale di repository.

## Firmware

`local_config.h` yang ditemukan mendefinisikan `WIFI_SSID`, `WIFI_PASSWORD` (**secret**), `DT_MQTT_URI`, `DT_MQTT_USERNAME`, `DT_MQTT_PASSWORD` (**secret**), `DT_NTP_SERVER`. Template publik ada di firmware/ESP32. Nilai asli tetap privat. Broker pada artefak build ditemukan `10.124.102.126:1883`, berbeda dari referensi server `192.168.1.167:1883`; **tidak diubah**, dan bukan bukti firmware yang sedang berjalan memakai alamat itu. Username/password MQTT firmware cocok dengan env USB saat dibandingkan tanpa mencetak nilainya.

## Secret dan permission

`.gitignore` melindungi env, recovered firmware, private notes, archive resource, data runtime, dump dan private key. `.dockerignore` memakai allowlist source/build requirements. Jangan `git add .`; review staged names dan diff. Secret scan harus mencakup isi, bukan hanya nama file. Scan otomatis bukan jaminan bebas semua secret.

Pada Linux: `umask 077`, direktori privat 700, file env/key 600. Pada FAT32 permission Unix tidak efektif; gunakan kontrol fisik, media terenkripsi atau salinan host aman. Jangan menulis password pada argumen CLI, shell history, screenshot atau laporan publik.
