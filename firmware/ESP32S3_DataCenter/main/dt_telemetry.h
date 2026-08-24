#pragma once

#include <stdint.h>

#include "esp_err.h"

#define DT_TELEMETRY_SCHEMA_VERSION "1.0"
#define DT_TELEMETRY_TOPIC_FORMAT "dt/%s/telemetry/%s/%s/%s"
#define DT_TELEMETRY_SEQUENCE_MAX UINT64_C(9007199254740991)
#define DT_BOOT_ID_BUFFER_SIZE 26

#define DT_TELEMETRY_QUALITY_GOOD "good"
#define DT_TELEMETRY_QUALITY_DEGRADED "degraded"
#define DT_TELEMETRY_QUALITY_INVALID "invalid"
#define DT_TELEMETRY_QUALITY_UNKNOWN "unknown"

typedef struct {
    const char *site_id;
    const char *device_id;
    char boot_id[DT_BOOT_ID_BUFFER_SIZE];
} dt_telemetry_source_t;

typedef struct {
    const char *schema_version;
    const char *site_id;
    const char *device_id;
    const char *boot_id;
    uint64_t seq;
    const char *sensor_id;
    const char *asset_id;
    const char *metric;
    double value;
    const char *unit;
    const char *ts;
    const char *quality;
} dt_telemetry_message_t;

esp_err_t dt_telemetry_source_init(void);
const dt_telemetry_source_t *dt_telemetry_source_get(void);
esp_err_t dt_telemetry_next_sequence(uint64_t *sequence);
esp_err_t dt_telemetry_message_validate(const dt_telemetry_message_t *message);
