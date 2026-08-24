# ESP32S3_DataCenter

Firmware ESP32-S3 untuk proyek DT_DataCenter.

Target:

- ESP32-S3
- ESP-IDF v5.5.5
- Digital Twin Data Center

Konfigurasi deployment menggunakan menu `DT_DataCenter` pada ESP-IDF `menuconfig`:

- `CONFIG_DT_SITE_ID`
- `CONFIG_DT_DEVICE_ID`
- `CONFIG_DT_WIFI_SSID`
- `CONFIG_DT_WIFI_PASSWORD`
- `CONFIG_DT_MQTT_BROKER_URI`
- `CONFIG_DT_MQTT_USERNAME`
- `CONFIG_DT_MQTT_PASSWORD`
- `CONFIG_DT_MQTT_RECONNECT_TIMEOUT_MS`

`site_id` dan `device_id` sengaja tidak memiliki default inventory. Nilainya harus
berupa canonical ID sesuai `docs/contracts/telemetry.schema.json`.

Gunakan `mqtt://` hanya untuk development/LAN terisolasi. `mqtts://` memakai
certificate bundle ESP-IDF dan tetap memvalidasi sertifikat broker. Username dan
password opsional mendukung broker development terautentikasi; jangan commit
credential. `sdkconfig` bersifat generated dan di-ignore; konfigurasi repository
disimpan pada `sdkconfig.defaults` tanpa credential. Firmware tidak pernah mencatat
credential.

Wi-Fi berjalan sebagai station menggunakan konfigurasi ESP-IDF tersebut. MQTT baru
dimulai setelah station memperoleh alamat IP, dan koneksi Wi-Fi yang terputus dicoba
kembali tanpa menerbitkan measurement.

Setiap boot menaikkan boot counter di NVS dan membentuk `boot_id` baru. Sequence
telemetry dimulai dari `0` dan meningkat monoton dalam boot tersebut.

Transport membentuk topic canonical
`dt/<site_id>/telemetry/<device_id>/<sensor_id>/<metric>`, memvalidasi dan
men-serialize payload canonical, lalu mengantrekannya dengan QoS 1 tanpa retain.
Status retained QoS 1 menggunakan `dt/<site_id>/device/<device_id>/status`; LWT
berisi status `offline`, sedangkan setiap koneksi/reconnect menggantinya dengan
status `online`. Payload status memakai kontrak canonical versioned dengan
`schema_version`, `site_id`, `device_id`, `boot_id`, dan `status`, tanpa memakai
sequence telemetry. Reconnect memakai state machine native ESP-MQTT dan tidak
membuat measurement baru.

Provisioning portal, sensor adapter, timestamp synchronization, sampling, dan
sertifikat private/production tetap menunggu keputusan fisik dan kebijakan jaringan.
Sampai ada sumber sensor nyata, API publish tidak dipanggil dan firmware tidak
menghasilkan telemetry sintetis.
