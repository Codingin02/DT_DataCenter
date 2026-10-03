#include <assert.h>
#include <stdio.h>
#include <string.h>

#include "telemetry_record.h"

static telemetry_config_t valid_config(void)
{
    return (telemetry_config_t){
        .site_id = "campus-lab",
        .device_id = "rack-controller",
        .sht31_a_temperature = {"sht31-a-temperature", "sht31-a"},
        .sht31_a_humidity = {"sht31-a-humidity", "sht31-a"},
        .sht31_b_temperature = {"sht31-b-temperature", "sht31-b"},
        .sht31_b_humidity = {"sht31-b-humidity", "sht31-b"},
        .acoustic_rms = {"rack-sound-rms", "rack-acoustic"},
        .acoustic_peak = {"rack-sound-peak", "rack-acoustic"},
    };
}

static measurement_event_t acoustic_event(void)
{
    measurement_event_t event = {
        .seq = 43,
        .sample_tick_us = 1250000,
        .type = MEASUREMENT_EVENT_ACOUSTIC,
        .data.acoustic = {
            .rms_dbfs = -34.5F,
            .peak_dbfs = -12.25F,
            .rms_dbfs_valid = true,
            .peak_dbfs_valid = true,
        },
    };
    memcpy(event.boot_id, "00112233445566778899aabbccddeeff",
           sizeof(event.boot_id));
    return event;
}

static measurement_event_t environment_event(measurement_source_t source)
{
    measurement_event_t event = {
        .seq = 42,
        .sample_tick_us = 1250000,
        .type = MEASUREMENT_EVENT_ENVIRONMENT,
        .data.environment = {
            .source = source,
            .raw_temperature = 0x1234,
            .raw_humidity = 0xabcd,
            .temperature_c = 23.125F,
            .humidity_rh = 45.5F,
            .quality = MEASUREMENT_QUALITY_GOOD,
        },
    };
    memcpy(event.boot_id, "00112233445566778899aabbccddeeff",
           sizeof(event.boot_id));
    return event;
}

static telemetry_time_anchor_t synchronized_time(void)
{
    return (telemetry_time_anchor_t){
        .ready = true,
        .wall_time_us = INT64_C(1735689600123456),
        .monotonic_time_us = INT64_C(1000000),
    };
}

static size_t occurrences(const char *text, const char *term)
{
    size_t count = 0;
    while ((text = strstr(text, term)) != NULL) {
        ++count;
        text += strlen(term);
    }
    return count;
}

int main(void)
{
    _Static_assert(sizeof(telemetry_record_t) <= 384U,
                   "telemetry record must remain bounded");

    telemetry_config_t config = valid_config();
    telemetry_time_anchor_t anchor = synchronized_time();
    measurement_event_t event = environment_event(MEASUREMENT_SOURCE_SHT31_A);
    const measurement_event_t unchanged = event;
    telemetry_record_t records[TELEMETRY_MAX_RECORDS_PER_EVENT];
    size_t count = 0;

    assert(telemetry_config_valid(&config));
    telemetry_config_t invalid = config;
    invalid.site_id = "";
    assert(!telemetry_config_valid(&invalid));
    invalid = config;
    invalid.device_id = "Invalid";
    assert(!telemetry_config_valid(&invalid));

    assert(telemetry_map_event(&config, &anchor, &event, records, &count) ==
           TELEMETRY_MAP_OK);
    assert(count == 2U);
    assert(records[0].metric == TELEMETRY_METRIC_TEMPERATURE);
    assert(records[1].metric == TELEMETRY_METRIC_HUMIDITY);
    assert(strcmp(records[0].sensor_id, "sht31-a-temperature") == 0);
    assert(strcmp(records[1].sensor_id, "sht31-a-humidity") == 0);
    assert(records[0].seq == event.seq && records[1].seq == event.seq);
    assert(strcmp(records[0].boot_id, event.boot_id) == 0);
    assert(records[0].raw_value_valid && records[0].raw_value == 0x1234);
    assert(records[1].raw_value_valid && records[1].raw_value == 0xabcd);
    assert(memcmp(&event, &unchanged, sizeof(event)) == 0);
    assert(event.data.environment.raw_temperature == 0x1234);
    assert(event.data.environment.raw_humidity == 0xabcd);
    assert(strcmp(records[0].timestamp, "2025-01-01T00:00:00.373456Z") == 0);

    char topic[TELEMETRY_TOPIC_CAPACITY];
    assert(telemetry_format_topic(&records[0], topic, sizeof(topic)));
    assert(strcmp(topic,
                  "dt/campus-lab/telemetry/rack-controller/sht31-a-temperature/temperature") == 0);

    char json[TELEMETRY_JSON_CAPACITY];
    size_t length = 0;
    assert(telemetry_serialize_json(&records[0], json, sizeof(json), &length));
    size_t max_json_length = length;
    assert(length == strlen(json));
    assert(strcmp(
        json,
        "{\"schema_version\":\"1.0\",\"site_id\":\"campus-lab\","
        "\"device_id\":\"rack-controller\","
        "\"boot_id\":\"00112233445566778899aabbccddeeff\",\"seq\":42,"
        "\"sensor_id\":\"sht31-a-temperature\",\"asset_id\":\"sht31-a\","
        "\"metric\":\"temperature\",\"value\":23.125,\"unit\":\"degC\","
        "\"raw_value\":4660,\"ts\":\"2025-01-01T00:00:00.373456Z\","
        "\"quality\":\"good\"}") == 0);
    assert(strstr(json, "\"schema_version\":\"1.0\"") != NULL);
    assert(strstr(json, "\"metric\":\"temperature\"") != NULL);
    assert(strstr(json, "\"unit\":\"degC\"") != NULL);
    assert(strstr(json, "\"value\":23.125") != NULL);
    assert(strstr(json, "\"quality\":\"good\"") != NULL);
    assert(strstr(json, "\"raw_value\":4660") != NULL);
    assert(strstr(json, "raw_temperature") == NULL);
    assert(strstr(json, "raw_humidity") == NULL);
    assert(strstr(json, "sample_tick_us") == NULL);
    assert(strstr(json, "received_at") == NULL);
    assert(occurrences(json, "\"schema_version\"") == 1U);
    assert(occurrences(json, "\"seq\"") == 1U);

    event = environment_event(MEASUREMENT_SOURCE_SHT31_B);
    assert(telemetry_map_event(&config, &anchor, &event, records, &count) ==
           TELEMETRY_MAP_OK);
    assert(strcmp(records[0].sensor_id, "sht31-b-temperature") == 0);
    assert(strcmp(records[1].sensor_id, "sht31-b-humidity") == 0);
    assert(telemetry_serialize_json(&records[1], json, sizeof(json), &length));
    if (length > max_json_length) {
        max_json_length = length;
    }
    assert(strstr(json, "\"metric\":\"humidity\"") != NULL);
    assert(strstr(json, "\"unit\":\"percent_rh\"") != NULL);
    assert(strstr(json, "\"raw_value\":43981") != NULL);

    char maximum_id[TELEMETRY_ID_CAPACITY];
    memset(maximum_id, 'a', sizeof(maximum_id) - 1U);
    maximum_id[sizeof(maximum_id) - 1U] = '\0';
    telemetry_config_t maximum_config = {
        .site_id = maximum_id,
        .device_id = maximum_id,
        .sht31_a_temperature = {maximum_id, maximum_id},
        .sht31_a_humidity = {maximum_id, maximum_id},
        .sht31_b_temperature = {maximum_id, maximum_id},
        .sht31_b_humidity = {maximum_id, maximum_id},
        .acoustic_rms = {maximum_id, maximum_id},
        .acoustic_peak = {maximum_id, maximum_id},
    };
    assert(telemetry_map_event(&maximum_config, &anchor, &event, records,
                               &count) == TELEMETRY_MAP_OK);
    assert(telemetry_format_topic(&records[0], topic, sizeof(topic)));
    assert(strlen(topic) == 219U);
    assert(telemetry_serialize_json(&records[0], json, sizeof(json), &length));
    if (length > max_json_length) {
        max_json_length = length;
    }

    telemetry_time_anchor_t unavailable = {0};
    assert(telemetry_map_event(&config, &unavailable, &event, records, &count) ==
           TELEMETRY_MAP_TIME_NOT_READY);
    event = acoustic_event();
    assert(telemetry_map_event(&config, &anchor, &event, records, &count) ==
           TELEMETRY_MAP_OK);
    assert(count == 2U);
    assert(records[0].metric == TELEMETRY_METRIC_SOUND_RMS_DBFS);
    assert(records[1].metric == TELEMETRY_METRIC_SOUND_PEAK_DBFS);
    assert(!records[0].raw_value_valid && !records[1].raw_value_valid);
    assert(records[0].seq == event.seq && records[1].seq == event.seq);
    assert(telemetry_serialize_json(&records[0], json, sizeof(json), &length));
    assert(strstr(json, "\"metric\":\"sound_rms_dbfs\"") != NULL);
    assert(strstr(json, "\"unit\":\"dBFS\"") != NULL);
    assert(strstr(json, "raw_value") == NULL);
    assert(strstr(json, "SPL") == NULL && strstr(json, "dBA") == NULL &&
           strstr(json, "Leq") == NULL);
    assert(telemetry_serialize_json(&records[1], json, sizeof(json), &length));
    assert(strstr(json, "\"metric\":\"sound_peak_dbfs\"") != NULL);
    event.data.acoustic.rms_dbfs_valid = false;
    event.data.acoustic.peak_dbfs_valid = false;
    assert(telemetry_map_event(&config, &anchor, &event, records, &count) ==
           TELEMETRY_MAP_INVALID_ARGUMENT);
    assert(count == 0U);
    assert(telemetry_map_event(NULL, &anchor, &event, records, &count) ==
           TELEMETRY_MAP_INVALID_IDENTITY);
    assert(telemetry_map_event(&config, &anchor, NULL, records, &count) ==
           TELEMETRY_MAP_INVALID_ARGUMENT);

    int64_t wall_time_us;
    assert(telemetry_time_from_anchor(&anchor, 750000, &wall_time_us));
    assert(wall_time_us == INT64_C(1735689599873456));
    assert(telemetry_format_rfc3339(wall_time_us, json, sizeof(json)));
    assert(strcmp(json, "2024-12-31T23:59:59.873456Z") == 0);

    length = 99U;
    assert(!telemetry_serialize_json(&records[1], json, 32U, &length));
    assert(length == 0U);

    printf("telemetry record tests: PASS; record_bytes=%zu max_json_bytes=%zu\n",
           sizeof(telemetry_record_t), max_json_length);
    return 0;
}
