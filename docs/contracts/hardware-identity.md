# Production hardware identity contract

This document defines the canonical production identity mapping for the
physical ESP32-S3 hardware. These identities are centralized in the
firmware Kconfig system (sdkconfig.defaults) and must not be scattered
as string literals throughout the codebase.

## Production identities

| Config key | Value | Description |
|---|---|---|
| DT_SITE_ID | campus-lab | Campus data-center laboratory |
| DT_DEVICE_ID | rack-controller | ESP32-S3 measurement controller |
| DT_SHT31_A_TEMPERATURE_SENSOR_ID | sht31-a-temperature | SEN0331 A temperature channel |
| DT_SHT31_A_TEMPERATURE_ASSET_ID | sht31-a | SEN0331 A physical asset |
| DT_SHT31_A_HUMIDITY_SENSOR_ID | sht31-a-humidity | SEN0331 A humidity channel |
| DT_SHT31_A_HUMIDITY_ASSET_ID | sht31-a | SEN0331 A physical asset |
| DT_SHT31_B_TEMPERATURE_SENSOR_ID | sht31-b-temperature | SEN0331 B temperature channel |
| DT_SHT31_B_TEMPERATURE_ASSET_ID | sht31-b | SEN0331 B physical asset |
| DT_SHT31_B_HUMIDITY_SENSOR_ID | sht31-b-humidity | SEN0331 B humidity channel |
| DT_SHT31_B_HUMIDITY_ASSET_ID | sht31-b | SEN0331 B physical asset |
| DT_ACOUSTIC_RMS_SENSOR_ID | rack-sound-rms | INMP441 RMS dBFS channel |
| DT_ACOUSTIC_RMS_ASSET_ID | rack-acoustic | INMP441 physical asset |
| DT_ACOUSTIC_PEAK_SENSOR_ID | rack-sound-peak | INMP441 peak dBFS channel |
| DT_ACOUSTIC_PEAK_ASSET_ID | rack-acoustic | INMP441 physical asset |

## Telemetry topics (production)

```text
dt/campus-lab/telemetry/rack-controller/sht31-a-temperature/temperature
dt/campus-lab/telemetry/rack-controller/sht31-a-humidity/humidity
dt/campus-lab/telemetry/rack-controller/sht31-b-temperature/temperature
dt/campus-lab/telemetry/rack-controller/sht31-b-humidity/humidity
dt/campus-lab/telemetry/rack-controller/rack-sound-rms/sound_rms_dbfs
dt/campus-lab/telemetry/rack-controller/rack-sound-peak/sound_peak_dbfs
```

## Device status topic (production)

```text
dt/campus-lab/device/rack-controller/status
```

## Backend schema compatibility

These identities conform to the existing telemetry schema v1.0
(canonical_id pattern: `^[a-z0-9][a-z0-9._-]{0,63}$`).
No schema changes are required.

The backend sensor registry must be populated with matching
`(site_id, device_id, sensor_id, asset_id, metric, unit)` rows
before production telemetry can be accepted.

## Provenance separation

| Provenance | Identity pattern | Example device_id |
|---|---|---|
| Proteus/acceptance | acceptance-*, simulated-* | acceptance-sim-esp32 |
| Physical hardware | Production table above | rack-controller |

Historical Proteus records in PostgreSQL retain their original identities.
Production records use the identities defined above.
Both coexist in the same database without conflict.

## Configuration flow

```text
Kconfig.projbuild → menuconfig / sdkconfig.defaults → sdkconfig → C macros
```

Firmware reads identities as `CONFIG_DT_*` compile-time constants.
No runtime string construction or identity inference occurs.

## Network credentials

Wi-Fi SSID, password, MQTT broker URI, and MQTT credentials are
externalized via the same Kconfig mechanism. They have empty defaults
and must be configured before flashing to the target network.
