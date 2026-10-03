# Research measurement readiness

This document identifies the fields and hooks available for future
research evaluation. No experimental system is implemented yet.

## Available timestamps and traceability

| Field | Source | Purpose |
|---|---|---|
| boot_id | Firmware (random per boot) | Session identity |
| seq | Firmware (monotonic per boot) | Record ordering |
| sample_tick_us | esp_timer_get_time() | Acquisition monotonic time |
| ts (source_ts) | SNTP-anchored wall clock | Physical measurement time |
| received_at | Server clock | Ingestion time |
| state_version | PostgreSQL sequence | Current-state change ordering |
| measurement_id | PostgreSQL sequence | History record identity |

## End-to-end latency

Measurable as `received_at - ts` for each measurement.
Requires synchronized clocks (SNTP on firmware, NTP on server).
Clock accuracy is bounded by SNTP sync interval and network jitter.

## Data freshness / Age of Information (AoI)

The current-state projection tracks the most recent accepted measurement
per `(asset_id, sensor_id, metric)`. Freshness is the elapsed time since
the last `source_ts` update.

Existing `source_status` supports `fresh`, `stale`, `offline`, `unknown`.
Freshness thresholds are intentionally TBD pending physical observation.

## Physical/virtual state consistency

The firmware publishes environmental readings at ~1 Hz and acoustic
windows at ~1 Hz (48000 samples / 48000 Hz window). The frontend
receives current-state updates via SSE.

Consistency metrics to evaluate:

- Update-to-display latency: SSE event timestamp vs. frontend render
- State staleness: time since last current-state advance
- Measurement gap detection: seq discontinuities within a boot_id
- Cross-sensor temporal alignment: ts difference between SHT31 A/B

## Traceability

Every measurement carries `(device_id, boot_id, seq, sensor_id, metric)`
as its logical identity. QoS-1 idempotency ensures exact redelivery is
deduplicated and conflicting reuse is rejected.

The complete path from physical sensor to database row is:

```text
sensor → firmware acquisition → measurement_event → telemetry_record
→ MQTT publish → backend ingest → accept_measurement → measurements
→ current_state → SSE → frontend
```

Each stage preserves the original `ts`, `boot_id`, and `seq`.

## Hooks for future evaluation

- Firmware diagnostic counters: measurement_runtime_stats_t,
  telemetry_diagnostics_t, connectivity_diagnostics_t
- Backend ingestion outcome logging (accepted/duplicate/rejected)
- PostgreSQL measurement history with microsecond timestamps
- SSE event delivery with state_version ordering
- Prometheus metrics endpoint at /metrics
