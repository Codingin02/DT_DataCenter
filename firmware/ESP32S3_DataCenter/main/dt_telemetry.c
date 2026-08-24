#include "dt_telemetry.h"

#include <inttypes.h>
#include <math.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>

#include "freertos/FreeRTOS.h"
#include "nvs.h"
#include "nvs_flash.h"
#include "sdkconfig.h"

#define DT_CANONICAL_ID_MAX_LENGTH 64

static dt_telemetry_source_t source;
static uint64_t next_sequence;
static bool source_initialized;
static portMUX_TYPE sequence_lock = portMUX_INITIALIZER_UNLOCKED;

static bool canonical_id_is_valid(const char *value)
{
    size_t length = strlen(value);
    if (length == 0 || length > DT_CANONICAL_ID_MAX_LENGTH) {
        return false;
    }

    for (size_t index = 0; index < length; index++) {
        char character = value[index];
        bool alphanumeric = (character >= 'a' && character <= 'z') ||
                            (character >= '0' && character <= '9');
        if (!alphanumeric &&
            (index == 0 || (character != '.' && character != '_' && character != '-'))) {
            return false;
        }
    }

    return true;
}

static int parse_decimal(const char *value, size_t length)
{
    int result = 0;
    for (size_t index = 0; index < length; index++) {
        if (value[index] < '0' || value[index] > '9') {
            return -1;
        }
        result = result * 10 + value[index] - '0';
    }
    return result;
}

static bool timestamp_is_valid(const char *value)
{
    size_t length = strlen(value);
    if (length < 20 || value[4] != '-' || value[7] != '-' ||
        (value[10] != 'T' && value[10] != 't') || value[13] != ':' || value[16] != ':') {
        return false;
    }

    int year = parse_decimal(value, 4);
    int month = parse_decimal(value + 5, 2);
    int day = parse_decimal(value + 8, 2);
    int hour = parse_decimal(value + 11, 2);
    int minute = parse_decimal(value + 14, 2);
    int second = parse_decimal(value + 17, 2);
    static const uint8_t days_per_month[] = {0, 31, 28, 31, 30, 31, 30,
                                              31, 31, 30, 31, 30, 31};
    bool leap_year = year >= 0 && year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    int maximum_day = month >= 1 && month <= 12
                          ? days_per_month[month] + (month == 2 && leap_year)
                          : 0;
    if (year < 0 || day < 1 || day > maximum_day || hour < 0 || hour > 23 || minute < 0 ||
        minute > 59 || second < 0 || second > 59) {
        return false;
    }

    size_t index = 19;
    if (value[index] == '.') {
        size_t fractional_start = ++index;
        while (value[index] >= '0' && value[index] <= '9') {
            index++;
        }
        if (index == fractional_start) {
            return false;
        }
    }
    if ((value[index] == 'Z' || value[index] == 'z') && index + 1 == length) {
        return true;
    }
    if ((value[index] != '+' && value[index] != '-') || index + 6 != length ||
        value[index + 3] != ':') {
        return false;
    }
    int offset_hour = parse_decimal(value + index + 1, 2);
    int offset_minute = parse_decimal(value + index + 4, 2);
    return offset_hour >= 0 && offset_hour <= 23 && offset_minute >= 0 && offset_minute <= 59;
}

static esp_err_t next_boot_counter(uint64_t *boot_counter)
{
    nvs_handle_t handle;
    esp_err_t err = nvs_open("dt_identity", NVS_READWRITE, &handle);
    if (err != ESP_OK) {
        return err;
    }

    uint64_t stored_counter = 0;
    err = nvs_get_u64(handle, "boot_counter", &stored_counter);
    if (err != ESP_OK && err != ESP_ERR_NVS_NOT_FOUND) {
        nvs_close(handle);
        return err;
    }
    if (stored_counter == UINT64_MAX) {
        nvs_close(handle);
        return ESP_ERR_INVALID_STATE;
    }

    *boot_counter = stored_counter + 1;
    err = nvs_set_u64(handle, "boot_counter", *boot_counter);
    if (err == ESP_OK) {
        err = nvs_commit(handle);
    }
    nvs_close(handle);
    return err;
}

esp_err_t dt_telemetry_source_init(void)
{
    if (source_initialized) {
        return ESP_OK;
    }
    if (!canonical_id_is_valid(CONFIG_DT_SITE_ID) ||
        !canonical_id_is_valid(CONFIG_DT_DEVICE_ID)) {
        return ESP_ERR_INVALID_ARG;
    }

    esp_err_t err = nvs_flash_init();
    if (err != ESP_OK) {
        return err;
    }

    uint64_t boot_counter;
    err = next_boot_counter(&boot_counter);
    if (err != ESP_OK) {
        return err;
    }

    int length = snprintf(source.boot_id, sizeof(source.boot_id), "boot-%020" PRIu64,
                          boot_counter);
    if (length < 0 || (size_t)length >= sizeof(source.boot_id)) {
        return ESP_ERR_INVALID_SIZE;
    }

    source.site_id = CONFIG_DT_SITE_ID;
    source.device_id = CONFIG_DT_DEVICE_ID;
    next_sequence = 0;
    source_initialized = true;
    return ESP_OK;
}

const dt_telemetry_source_t *dt_telemetry_source_get(void)
{
    return source_initialized ? &source : NULL;
}

esp_err_t dt_telemetry_next_sequence(uint64_t *sequence)
{
    if (sequence == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    portENTER_CRITICAL(&sequence_lock);
    if (!source_initialized || next_sequence > DT_TELEMETRY_SEQUENCE_MAX) {
        portEXIT_CRITICAL(&sequence_lock);
        return ESP_ERR_INVALID_STATE;
    }

    *sequence = next_sequence++;
    portEXIT_CRITICAL(&sequence_lock);
    return ESP_OK;
}

esp_err_t dt_telemetry_message_validate(const dt_telemetry_message_t *message)
{
    if (!source_initialized || message == NULL || message->schema_version == NULL ||
        message->site_id == NULL || message->device_id == NULL || message->boot_id == NULL ||
        message->sensor_id == NULL || message->asset_id == NULL || message->metric == NULL ||
        message->unit == NULL || message->ts == NULL || message->quality == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    bool source_matches = strcmp(message->schema_version, DT_TELEMETRY_SCHEMA_VERSION) == 0 &&
                          strcmp(message->site_id, source.site_id) == 0 &&
                          strcmp(message->device_id, source.device_id) == 0 &&
                          strcmp(message->boot_id, source.boot_id) == 0;
    bool metric_matches =
        (strcmp(message->metric, "temperature") == 0 && strcmp(message->unit, "degC") == 0) ||
        (strcmp(message->metric, "humidity") == 0 && strcmp(message->unit, "percent_rh") == 0);
    bool quality_is_valid = strcmp(message->quality, DT_TELEMETRY_QUALITY_GOOD) == 0 ||
                            strcmp(message->quality, DT_TELEMETRY_QUALITY_DEGRADED) == 0 ||
                            strcmp(message->quality, DT_TELEMETRY_QUALITY_INVALID) == 0 ||
                            strcmp(message->quality, DT_TELEMETRY_QUALITY_UNKNOWN) == 0;

    if (!source_matches || !canonical_id_is_valid(message->sensor_id) ||
        !canonical_id_is_valid(message->asset_id) || !canonical_id_is_valid(message->metric) ||
        !metric_matches || !quality_is_valid || message->seq > DT_TELEMETRY_SEQUENCE_MAX ||
        !timestamp_is_valid(message->ts) || !isfinite(message->value)) {
        return ESP_ERR_INVALID_ARG;
    }

    return ESP_OK;
}
