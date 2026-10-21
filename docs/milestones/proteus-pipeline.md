# Proteus-derived pipeline milestone

Status: PASS
Verified: 2026-09 (pre-hardware preparation)

## Scope

The Proteus-derived simulation pipeline was verified end-to-end:

    Proteus runtime (DT_DataCenter_Hardware.pdsprj)
    → MicroPython firmware (proteus-runtime-source.py)
    → proteus-telemetry-bridge.js
    → MQTT QoS 1
    → Mosquitto
    → Node.js backend
    → PostgreSQL
    → SSE/API
    → Three.js/WebGL frontend

## Acceptance

- Proteus STOPPED → no generated samples
- Proteus RUNNING → samples appeared
- Environmental stimulus changes propagated
- Acoustic stimulus changes propagated
- Proteus STOP → stream ceased

## Evidence

Approximately 1,062 Proteus-derived database records remain in PostgreSQL.
These records are historical evidence and must not be deleted or rewritten.

## Provenance separation

Proteus/acceptance historical records use development identities.
Physical hardware uses production identities defined in the firmware
configuration (Kconfig/sdkconfig.defaults) and registered in the
backend sensor registry.

The two provenance classes coexist in the database without conflict.

## Preserved artifacts

- `E:\Projects\Proteus\DT_DataCenter\DT_DataCenter_Hardware.pdsprj`
- `E:\Projects\Proteus\DT_DataCenter\proteus-runtime-source.py`
- `E:\Projects\Proteus\DT_DataCenter\inmp441-frame.ptn`
- `scripts/proteus-telemetry-bridge.js` (repository)

## Physical hardware validation

PHYSICAL HARDWARE VALIDATION: NOT YET PERFORMED

The Proteus pipeline validates the server-side ingestion path.
Real sensor acquisition, I2C/I2S electrical behavior, Wi-Fi connectivity,
and physical-to-virtual synchronization require the actual ESP32-S3 board
and sensors.
