#define _POSIX_C_SOURCE 200809L

#include "telemetry_record.h"

#include <inttypes.h>
#include <limits.h>
#include <math.h>
#include <stdio.h>
#include <string.h>
#include <time.h>

static bool canonical_id_valid(const char *value)
{
    if (value == NULL || !((value[0] >= 'a' && value[0] <= 'z') ||
                           (value[0] >= '0' && value[0] <= '9'))) {
        return false;
    }
    size_t length = 1;
    while (length < TELEMETRY_ID_CAPACITY && value[length] != '\0') {
        const char current = value[length];
        if (!((current >= 'a' && current <= 'z') ||
              (current >= '0' && current <= '9') || current == '.' ||
              current == '_' || current == '-')) {
            return false;
        }
        ++length;
    }
    return length < TELEMETRY_ID_CAPACITY;
}

static bool channel_valid(const telemetry_channel_config_t *channel)
{
    return canonical_id_valid(channel->sensor_id) &&
           canonical_id_valid(channel->asset_id);
}

bool telemetry_config_valid(const telemetry_config_t *config)
{
    return config != NULL && canonical_id_valid(config->site_id) &&
           canonical_id_valid(config->device_id) &&
           channel_valid(&config->sht31_a_temperature) &&
           channel_valid(&config->sht31_a_humidity) &&
           channel_valid(&config->sht31_b_temperature) &&
           channel_valid(&config->sht31_b_humidity) &&
           channel_valid(&config->acoustic_rms) &&
           channel_valid(&config->acoustic_peak);
}

bool telemetry_time_from_anchor(const telemetry_time_anchor_t *anchor,
                                int64_t sample_tick_us,
                                int64_t *wall_time_us)
{
    if (anchor == NULL || wall_time_us == NULL || !anchor->ready ||
        anchor->wall_time_us < 0 || anchor->monotonic_time_us < 0 ||
        sample_tick_us < 0) {
        return false;
    }
    const int64_t delta = sample_tick_us - anchor->monotonic_time_us;
    if ((delta > 0 && anchor->wall_time_us > INT64_MAX - delta) ||
        (delta < 0 && anchor->wall_time_us < -delta)) {
        return false;
    }
    *wall_time_us = anchor->wall_time_us + delta;
    return *wall_time_us >= 0;
}

bool telemetry_format_rfc3339(int64_t wall_time_us, char *output,
                              size_t capacity)
{
    if (wall_time_us < 0 || output == NULL || capacity < TELEMETRY_TIMESTAMP_CAPACITY) {
        return false;
    }
    const time_t seconds = (time_t)(wall_time_us / INT64_C(1000000));
    const int microseconds = (int)(wall_time_us % INT64_C(1000000));
    struct tm utc;
    if (gmtime_r(&seconds, &utc) == NULL) {
        return false;
    }
    const int written = snprintf(output, capacity,
                                 "%04d-%02d-%02dT%02d:%02d:%02d.%06dZ",
                                 utc.tm_year + 1900, utc.tm_mon + 1,
                                 utc.tm_mday, utc.tm_hour, utc.tm_min,
                                 utc.tm_sec, microseconds);
    return written == TELEMETRY_TIMESTAMP_CAPACITY - 1;
}

static void fill_record(telemetry_record_t *record,
                        const telemetry_config_t *config,
                        const measurement_event_t *event,
                        const telemetry_channel_config_t *channel,
                        telemetry_metric_t metric, float value,
                        const char *timestamp, bool raw_value_valid,
                        uint16_t raw_value)
{
    memset(record, 0, sizeof(*record));
    memcpy(record->site_id, config->site_id, strlen(config->site_id) + 1U);
    memcpy(record->device_id, config->device_id, strlen(config->device_id) + 1U);
    memcpy(record->sensor_id, channel->sensor_id, strlen(channel->sensor_id) + 1U);
    memcpy(record->asset_id, channel->asset_id, strlen(channel->asset_id) + 1U);
    memcpy(record->boot_id, event->boot_id, sizeof(record->boot_id));
    memcpy(record->timestamp, timestamp, TELEMETRY_TIMESTAMP_CAPACITY);
    record->seq = event->seq;
    record->value = value;
    record->metric = metric;
    record->raw_value = raw_value;
    record->raw_value_valid = raw_value_valid;
}

telemetry_map_result_t telemetry_map_event(
    const telemetry_config_t *config, const telemetry_time_anchor_t *anchor,
    const measurement_event_t *event,
    telemetry_record_t records[TELEMETRY_MAX_RECORDS_PER_EVENT],
    size_t *record_count)
{
    if (event == NULL || records == NULL || record_count == NULL) {
        return TELEMETRY_MAP_INVALID_ARGUMENT;
    }
    *record_count = 0;
    if (!telemetry_config_valid(config)) {
        return TELEMETRY_MAP_INVALID_IDENTITY;
    }
    int64_t wall_time_us;
    char timestamp[TELEMETRY_TIMESTAMP_CAPACITY];
    if (!telemetry_time_from_anchor(anchor, event->sample_tick_us,
                                    &wall_time_us) ||
        !telemetry_format_rfc3339(wall_time_us, timestamp,
                                  sizeof(timestamp))) {
        return TELEMETRY_MAP_TIME_NOT_READY;
    }

    if (event->type == MEASUREMENT_EVENT_ACOUSTIC) {
        if (event->data.acoustic.rms_dbfs_valid &&
            isfinite(event->data.acoustic.rms_dbfs)) {
            fill_record(&records[*record_count], config, event,
                        &config->acoustic_rms,
                        TELEMETRY_METRIC_SOUND_RMS_DBFS,
                        event->data.acoustic.rms_dbfs, timestamp, false, 0);
            ++*record_count;
        }
        if (event->data.acoustic.peak_dbfs_valid &&
            isfinite(event->data.acoustic.peak_dbfs)) {
            fill_record(&records[*record_count], config, event,
                        &config->acoustic_peak,
                        TELEMETRY_METRIC_SOUND_PEAK_DBFS,
                        event->data.acoustic.peak_dbfs, timestamp, false, 0);
            ++*record_count;
        }
        return *record_count > 0 ? TELEMETRY_MAP_OK
                                 : TELEMETRY_MAP_INVALID_ARGUMENT;
    }
    if (event->type != MEASUREMENT_EVENT_ENVIRONMENT) {
        return TELEMETRY_MAP_UNSUPPORTED_EVENT;
    }
    if (event->data.environment.quality != MEASUREMENT_QUALITY_GOOD ||
        !isfinite(event->data.environment.temperature_c) ||
        !isfinite(event->data.environment.humidity_rh)) {
        return TELEMETRY_MAP_INVALID_ARGUMENT;
    }

    const telemetry_channel_config_t *temperature;
    const telemetry_channel_config_t *humidity;
    if (event->data.environment.source == MEASUREMENT_SOURCE_SHT31_A) {
        temperature = &config->sht31_a_temperature;
        humidity = &config->sht31_a_humidity;
    } else if (event->data.environment.source == MEASUREMENT_SOURCE_SHT31_B) {
        temperature = &config->sht31_b_temperature;
        humidity = &config->sht31_b_humidity;
    } else {
        return TELEMETRY_MAP_INVALID_ARGUMENT;
    }

    fill_record(&records[0], config, event, temperature,
                TELEMETRY_METRIC_TEMPERATURE,
                event->data.environment.temperature_c, timestamp, true,
                event->data.environment.raw_temperature);
    fill_record(&records[1], config, event, humidity,
                TELEMETRY_METRIC_HUMIDITY,
                event->data.environment.humidity_rh, timestamp, true,
                event->data.environment.raw_humidity);
    *record_count = TELEMETRY_MAX_RECORDS_PER_EVENT;
    return TELEMETRY_MAP_OK;
}

static const char *metric_name(telemetry_metric_t metric)
{
    switch (metric) {
    case TELEMETRY_METRIC_TEMPERATURE:
        return "temperature";
    case TELEMETRY_METRIC_HUMIDITY:
        return "humidity";
    case TELEMETRY_METRIC_SOUND_RMS_DBFS:
        return "sound_rms_dbfs";
    case TELEMETRY_METRIC_SOUND_PEAK_DBFS:
        return "sound_peak_dbfs";
    default:
        return NULL;
    }
}

static const char *metric_unit(telemetry_metric_t metric)
{
    if (metric == TELEMETRY_METRIC_TEMPERATURE) {
        return "degC";
    }
    if (metric == TELEMETRY_METRIC_HUMIDITY) {
        return "percent_rh";
    }
    return metric_name(metric) == NULL ? NULL : "dBFS";
}

bool telemetry_format_topic(const telemetry_record_t *record, char *output,
                            size_t capacity)
{
    if (record == NULL || output == NULL) {
        return false;
    }
    const char *name = metric_name(record->metric);
    if (name == NULL) {
        return false;
    }
    const int written = snprintf(output, capacity, "dt/%s/telemetry/%s/%s/%s",
                                 record->site_id, record->device_id,
                                 record->sensor_id, name);
    return written > 0 && (size_t)written < capacity;
}

bool telemetry_serialize_json(const telemetry_record_t *record, char *output,
                              size_t capacity, size_t *length)
{
    if (record == NULL || output == NULL || length == NULL ||
        !canonical_id_valid(record->site_id) ||
        !canonical_id_valid(record->device_id) ||
        !canonical_id_valid(record->sensor_id) ||
        !canonical_id_valid(record->asset_id) || !isfinite(record->value)) {
        return false;
    }
    const char *name = metric_name(record->metric);
    const char *unit = metric_unit(record->metric);
    if (name == NULL || unit == NULL ||
        (record->raw_value_valid &&
         record->metric != TELEMETRY_METRIC_TEMPERATURE &&
         record->metric != TELEMETRY_METRIC_HUMIDITY)) {
        return false;
    }
    char raw_value[24] = "";
    if (record->raw_value_valid) {
        const int raw_written = snprintf(raw_value, sizeof(raw_value),
                                         ",\"raw_value\":%u",
                                         (unsigned)record->raw_value);
        if (raw_written < 0 || (size_t)raw_written >= sizeof(raw_value)) {
            return false;
        }
    }
    const int written = snprintf(
        output, capacity,
        "{\"schema_version\":\"1.0\",\"site_id\":\"%s\",\"device_id\":\"%s\","
        "\"boot_id\":\"%s\",\"seq\":%" PRIu64 ",\"sensor_id\":\"%s\","
        "\"asset_id\":\"%s\",\"metric\":\"%s\",\"value\":%.9g,"
        "\"unit\":\"%s\"%s,\"ts\":\"%s\",\"quality\":\"good\"}",
        record->site_id, record->device_id, record->boot_id, record->seq,
        record->sensor_id, record->asset_id, name, (double)record->value, unit,
        raw_value, record->timestamp);
    if (written < 0 || (size_t)written >= capacity) {
        *length = 0;
        return false;
    }
    *length = (size_t)written;
    return true;
}
