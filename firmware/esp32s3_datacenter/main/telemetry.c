#include "telemetry.h"

#include <limits.h>
#include <sys/time.h>

#include "esp_netif_sntp.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "sdkconfig.h"

#include "connectivity.h"
#include "telemetry_record.h"

static portMUX_TYPE lock = portMUX_INITIALIZER_UNLOCKED;
static telemetry_time_anchor_t time_anchor;
static telemetry_diagnostics_t diagnostics;
static bool time_sync_started;

static const telemetry_config_t config = {
    .site_id = CONFIG_DT_SITE_ID,
    .device_id = CONFIG_DT_DEVICE_ID,
    .sht31_a_temperature = {
        CONFIG_DT_SHT31_A_TEMPERATURE_SENSOR_ID,
        CONFIG_DT_SHT31_A_TEMPERATURE_ASSET_ID,
    },
    .sht31_a_humidity = {
        CONFIG_DT_SHT31_A_HUMIDITY_SENSOR_ID,
        CONFIG_DT_SHT31_A_HUMIDITY_ASSET_ID,
    },
    .sht31_b_temperature = {
        CONFIG_DT_SHT31_B_TEMPERATURE_SENSOR_ID,
        CONFIG_DT_SHT31_B_TEMPERATURE_ASSET_ID,
    },
    .sht31_b_humidity = {
        CONFIG_DT_SHT31_B_HUMIDITY_SENSOR_ID,
        CONFIG_DT_SHT31_B_HUMIDITY_ASSET_ID,
    },
    .acoustic_rms = {
        CONFIG_DT_ACOUSTIC_RMS_SENSOR_ID,
        CONFIG_DT_ACOUSTIC_RMS_ASSET_ID,
    },
    .acoustic_peak = {
        CONFIG_DT_ACOUSTIC_PEAK_SENSOR_ID,
        CONFIG_DT_ACOUSTIC_PEAK_ASSET_ID,
    },
};

static void increment(uint64_t *counter)
{
    if (*counter != UINT64_MAX) {
        ++*counter;
    }
}

static void time_synchronized(struct timeval *time_value)
{
    taskENTER_CRITICAL(&lock);
    time_anchor = (telemetry_time_anchor_t){
        .ready = true,
        .wall_time_us = (int64_t)time_value->tv_sec * INT64_C(1000000) +
                        time_value->tv_usec,
        .monotonic_time_us = esp_timer_get_time(),
    };
    diagnostics.time_ready = true;
    taskEXIT_CRITICAL(&lock);
}

esp_err_t telemetry_start_time_sync(void)
{
    if (time_sync_started) {
        return ESP_ERR_INVALID_STATE;
    }
    if (CONFIG_DT_SNTP_SERVER[0] == '\0') {
        return ESP_ERR_INVALID_ARG;
    }
    const esp_sntp_config_t sntp_config = ESP_NETIF_SNTP_DEFAULT_CONFIG(CONFIG_DT_SNTP_SERVER);
    esp_sntp_config_t configured_sntp = sntp_config;
    configured_sntp.sync_cb = time_synchronized;
    const esp_err_t error = esp_netif_sntp_init(&configured_sntp);
    if (error == ESP_OK) {
        time_sync_started = true;
    }
    return error;
}

static void record_map_failure(telemetry_map_result_t result)
{
    taskENTER_CRITICAL(&lock);
    if (result == TELEMETRY_MAP_INVALID_IDENTITY) {
        increment(&diagnostics.identity_invalid_drop_count);
    } else if (result == TELEMETRY_MAP_TIME_NOT_READY) {
        increment(&diagnostics.time_not_ready_drop_count);
    } else if (result == TELEMETRY_MAP_UNSUPPORTED_EVENT) {
        increment(&diagnostics.unsupported_event_count);
    } else {
        increment(&diagnostics.serialization_failure_count);
    }
    taskEXIT_CRITICAL(&lock);
}

void telemetry_process_event(const measurement_event_t *event)
{
    telemetry_time_anchor_t anchor;
    taskENTER_CRITICAL(&lock);
    anchor = time_anchor;
    taskEXIT_CRITICAL(&lock);

    telemetry_record_t records[TELEMETRY_MAX_RECORDS_PER_EVENT];
    size_t count;
    const telemetry_map_result_t mapped = telemetry_map_event(
        &config, &anchor, event, records, &count);
    if (mapped != TELEMETRY_MAP_OK) {
        record_map_failure(mapped);
        return;
    }

    for (size_t index = 0; index < count; ++index) {
        char topic[TELEMETRY_TOPIC_CAPACITY];
        char json[TELEMETRY_JSON_CAPACITY];
        size_t json_length;
        if (!telemetry_format_topic(&records[index], topic, sizeof(topic)) ||
            !telemetry_serialize_json(&records[index], json, sizeof(json),
                                      &json_length)) {
            taskENTER_CRITICAL(&lock);
            increment(&diagnostics.serialization_failure_count);
            taskEXIT_CRITICAL(&lock);
            continue;
        }

        const connectivity_publish_result_t published =
            connectivity_publish_qos1(topic, json, json_length, false);
        taskENTER_CRITICAL(&lock);
        increment(&diagnostics.mapped_record_count);
        if (published == CONNECTIVITY_PUBLISH_ACCEPTED) {
            increment(&diagnostics.publish_accepted_count);
        } else if (published == CONNECTIVITY_PUBLISH_UNAVAILABLE) {
            increment(&diagnostics.publish_unavailable_count);
        } else if (published == CONNECTIVITY_PUBLISH_OUTBOX_FULL) {
            increment(&diagnostics.publish_outbox_full_count);
        } else {
            increment(&diagnostics.publish_error_count);
        }
        taskEXIT_CRITICAL(&lock);
    }
}

void telemetry_get_diagnostics(telemetry_diagnostics_t *output)
{
    if (output == NULL) {
        return;
    }
    taskENTER_CRITICAL(&lock);
    *output = diagnostics;
    taskEXIT_CRITICAL(&lock);
}
