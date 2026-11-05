# MQTT dan Shelly

ESP32 dan Shelly adalah publisher LAN; Mosquitto broker; backend subscriber/ingestor. Backend juga menerbitkan hasil collector host dan permintaan status Shelly. Tidak ada perubahan topic/payload firmware.

## Broker

Perangkat LAN menggunakan alamat server yang sedang beroperasi, referensi `192.168.1.167:1883`. Backend container memakai `mqtt://mosquitto:1883`. `127.0.0.1` pada container berarti container itu sendiri, bukan Debian host. Broker membutuhkan MQTT_USERNAME/MQTT_PASSWORD. Jangan memakai credential pada URI; validator backend menolaknya.

`docker/mosquitto/persistent.conf` di override OS menyimpan session/retained state ke mqtt-data. Basis Compose existing tetap kompatibel. Restart/recreate tidak boleh menghapus volume. Jangan meneruskan 1883 atau 8883 melalui Funnel/router.

## Topic yang dibuktikan kode

| Topic                                                      | Producer / consumer                          |
| ---------------------------------------------------------- | -------------------------------------------- |
| `dt/+/telemetry/+/+/+`                                     | subscription backend server.js               |
| `dt/+/device/+/status`                                     | subscription status backend                  |
| `dt/campus-lab/telemetry/<device_id>/<sensor_id>/<metric>` | envelope canonical perangkat/collector       |
| `<SHELLY_MQTT_ID>/status/+`                                | status komponen Shelly                       |
| `<SHELLY_MQTT_ID>/events/rpc`                              | NotifyStatus/NotifyFullStatus/NotifyEvent    |
| `<SHELLY_MQTT_ID>/online`                                  | status online Shelly                         |
| `<MQTT_CLIENT_ID>/shelly/rpc`                              | reply backend untuk permintaan status Shelly |
| `<SHELLY_MQTT_ID>/rpc`                                     | tujuan permintaan RPC status Shelly          |

Identitas Shelly referensi dan default kode: `shellyplugpmg3-48f6eebbf3f4`, IP referensi `192.168.1.166`. Backend menerima `pm1:0` (bukan mengasumsikan switch:0): voltage→voltage_v, current→current_a, apower→active_power_w, aprtpower→apparent_power_va, pf→power_factor_ratio, freq→frequency_hz, aenergy.total→energy_wh_total. Diagnostik sys/wifi/mqtt dan error juga dipetakan oleh `backend/shelly.js`.

## Payload canonical

Field: schema_version, site_id, device_id, boot_id, seq, sensor_id, asset_id, metric, value, unit, ts, quality. Kontrak tepat dan enum ada di `docs/contracts/`; jangan mengganti ts sumber dengan waktu retry. QoS 1 diakui setelah transaksi database; retry tetap menjaga identitas deduplikasi. dBFS akustik tidak boleh diberi label dBA.

## Pemeriksaan tanpa password command-line

Gunakan perintah Mosquitto dari [operasi](OPERATIONS.md), yang membuat file konfigurasi client privat di tmpfs container melalui env internal. Jangan memakai `-P <password>` di terminal host. Jangan memakai `mosquitto_sub -v -t '#'` untuk laporan publik karena payload/identitas dapat sensitif. Batasi topic, jumlah pesan dan durasi saat diagnostik.

Tool `scripts/shelly-sync.sh` bukan startup default dan diblokir kecuali `DT_ALLOW_DEVICE_RECONFIGURATION=1`. Tool memerlukan dua argumen IPv4 eksplisit: broker yang disetujui dan Shelly yang disetujui; tidak melakukan scan subnet atau discovery. Ia memverifikasi identitas perangkat sebelum mengubah broker/meminta reboot. Hanya gunakan dengan izin spesifik, jangan untuk sekadar memeriksa koneksi. Pekerjaan ini tidak menjalankan perubahan Wi-Fi atau Shelly.
