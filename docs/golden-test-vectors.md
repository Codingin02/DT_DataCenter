# Golden test vectors

Deterministic reference values derived from the proven Proteus states.
These vectors validate pure conversion/DSP logic without hardware.

## SHT31 environmental vectors

### Sensor A state 1: 22.0°C, 50.0%RH

| Parameter | Value |
|---|---|
| Target temperature | 22.0°C |
| Target humidity | 50.0%RH |
| Raw temperature | round((22.0 + 45) × 65535 / 175) = 25083 (0x620B) |
| Raw humidity | round(50.0 × 65535 / 100) = 32768 (0x8000) |
| Conversion tolerance | ±0.01°C, ±0.02%RH |

### Sensor A state 2: 24.0°C, 55.0%RH

| Parameter | Value |
|---|---|
| Target temperature | 24.0°C |
| Target humidity | 55.0%RH |
| Raw temperature | round((24.0 + 45) × 65535 / 175) = 25832 (0x64D8) |
| Raw humidity | round(55.0 × 65535 / 100) = 36044 (0x8CCC) |
| Conversion tolerance | ±0.01°C, ±0.02%RH |

### Sensor B state 1: 21.0°C, 48.0%RH

| Parameter | Value |
|---|---|
| Target temperature | 21.0°C |
| Target humidity | 48.0%RH |
| Raw temperature | round((21.0 + 45) × 65535 / 175) = 24709 (0x6085) |
| Raw humidity | round(48.0 × 65535 / 100) = 31457 (0x7AE1) |
| Conversion tolerance | ±0.01°C, ±0.02%RH |

### Sensor B state 2: 23.5°C, 54.0%RH

| Parameter | Value |
|---|---|
| Target temperature | 23.5°C |
| Target humidity | 54.0%RH |
| Raw temperature | round((23.5 + 45) × 65535 / 175) = 25645 (0x642D) |
| Raw humidity | round(54.0 × 65535 / 100) = 35389 (0x8A3D) |
| Conversion tolerance | ±0.01°C, ±0.02%RH |

## SHT31 CRC validation

The test suite validates:
- CRC-8 polynomial 0x31, initial 0xFF
- Known vector: bytes {0xBE, 0xEF} → CRC 0x92
- Temperature CRC pass and fail
- Humidity CRC pass and fail
- All single-bit error detection

## Acoustic reference vectors

### State 1

| Parameter | Value | Tolerance |
|---|---|---|
| RMS dBFS | ≈ -7.88 | ±0.5 |
| Peak dBFS | ≈ -3.04 | ±0.5 |

### State 2

| Parameter | Value | Tolerance |
|---|---|---|
| RMS dBFS | ≈ -13.90 | ±0.5 |
| Peak dBFS | ≈ -9.06 | ±0.5 |

These are code-level dBFS diagnostics relative to 24-bit full-scale.
They are NOT SPL, dBA, or Leq measurements.

## Existing test coverage

The firmware test suite validates all of the above:

| Test file | Coverage |
|---|---|
| sht31_test.c | CRC pass/fail, raw→°C, raw→%RH, range, argument validation |
| inmp441_test.c | 24-bit PCM extraction, sign extension, exhaustive 24-bit range |
| acoustic_processing_test.c | DC blocker, RMS/peak, dBFS, -6dB linearity, calibration |
| telemetry_record_test.c | JSON serialization, topic format, identity fields, timestamp |
| connectivity_policy_test.c | Reconnect backoff, config validation, client ID, device status |
| measurement_runtime_test.c | Boot ID, sequence, event construction, counter saturation |

## Test command

From the Digital Twin repository root, on Windows with the existing GCC host toolchain:

```powershell
& ./firmware/esp32s3_datacenter/tests/run_host_tests.ps1
```

This runner currently targets x86/SSE host diagnostics. It is not a flash command or a verification of the active Arduino board. An ESP-IDF build additionally requires its own configured ESP-IDF environment; do not substitute this separate implementation for the running Arduino sketch. No workstation-specific E: or D: path is required by this documentation.

See the test runner script at `firmware/esp32s3_datacenter/tests/run_host_tests.ps1`
for the complete host-side test execution.
