#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "measurement_model.h"

enum {
    TELEMETRY_ID_CAPACITY = 65,
    TELEMETRY_TIMESTAMP_CAPACITY = 28,
    TELEMETRY_TOPIC_CAPACITY = 256,
    TELEMETRY_JSON_CAPACITY = 768,
    TELEMETRY_MAX_RECORDS_PER_EVENT = 2,
};

typedef struct {
    const char *sensor_id;
    const char *asset_id;
} telemetry_channel_config_t;

typedef struct {
    const char *site_id;
    const char *device_id;
    telemetry_channel_config_t sht31_a_temperature;
    telemetry_channel_config_t sht31_a_humidity;
    telemetry_channel_config_t sht31_b_temperature;
    telemetry_channel_config_t sht31_b_humidity;
    telemetry_channel_config_t acoustic_rms;
    telemetry_channel_config_t acoustic_peak;
} telemetry_config_t;

typedef struct {
    bool ready;
    int64_t wall_time_us;
    int64_t monotonic_time_us;
} telemetry_time_anchor_t;

typedef enum {
    TELEMETRY_METRIC_TEMPERATURE = 1,
    TELEMETRY_METRIC_HUMIDITY,
    TELEMETRY_METRIC_SOUND_RMS_DBFS,
    TELEMETRY_METRIC_SOUND_PEAK_DBFS,
} telemetry_metric_t;

typedef struct {
    char site_id[TELEMETRY_ID_CAPACITY];
    char device_id[TELEMETRY_ID_CAPACITY];
    char sensor_id[TELEMETRY_ID_CAPACITY];
    char asset_id[TELEMETRY_ID_CAPACITY];
    char boot_id[MEASUREMENT_BOOT_ID_LENGTH + 1U];
    char timestamp[TELEMETRY_TIMESTAMP_CAPACITY];
    uint64_t seq;
    float value;
    telemetry_metric_t metric;
    uint16_t raw_value;
    bool raw_value_valid;
} telemetry_record_t;

typedef enum {
    TELEMETRY_MAP_OK = 0,
    TELEMETRY_MAP_INVALID_ARGUMENT,
    TELEMETRY_MAP_INVALID_IDENTITY,
    TELEMETRY_MAP_TIME_NOT_READY,
    TELEMETRY_MAP_UNSUPPORTED_EVENT,
} telemetry_map_result_t;

bool telemetry_config_valid(const telemetry_config_t *config);
bool telemetry_time_from_anchor(const telemetry_time_anchor_t *anchor,
                                int64_t sample_tick_us,
                                int64_t *wall_time_us);
bool telemetry_format_rfc3339(int64_t wall_time_us, char *output,
                              size_t capacity);
telemetry_map_result_t telemetry_map_event(
    const telemetry_config_t *config, const telemetry_time_anchor_t *anchor,
    const measurement_event_t *event,
    telemetry_record_t records[TELEMETRY_MAX_RECORDS_PER_EVENT],
    size_t *record_count);
bool telemetry_format_topic(const telemetry_record_t *record, char *output,
                            size_t capacity);
bool telemetry_serialize_json(const telemetry_record_t *record, char *output,
                              size_t capacity, size_t *length);
