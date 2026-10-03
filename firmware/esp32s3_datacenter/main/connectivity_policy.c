#include "connectivity_policy.h"

#include <limits.h>
#include <stdio.h>
#include <string.h>

#include "measurement_model.h"

enum {
    WIFI_SSID_MAX_BYTES = 32,
    WIFI_PASSWORD_MIN_BYTES = 8,
    WIFI_PASSWORD_MAX_BYTES = 64,
    MQTT_URI_MAX_BYTES = 255,
    MQTT_CREDENTIAL_MAX_BYTES = 128,
    CANONICAL_ID_MAX_BYTES = 64,
};

static bool bounded_length(const char *value, size_t minimum, size_t maximum,
                           size_t *length)
{
    if (value == NULL) {
        return false;
    }

    size_t size = 0;
    while (size <= maximum && value[size] != '\0') {
        ++size;
    }
    if (size < minimum || size > maximum) {
        return false;
    }
    if (length != NULL) {
        *length = size;
    }
    return true;
}

static bool wifi_password_valid(const char *password)
{
    size_t length;
    if (!bounded_length(password, WIFI_PASSWORD_MIN_BYTES,
                        WIFI_PASSWORD_MAX_BYTES, &length)) {
        return false;
    }
    if (length != WIFI_PASSWORD_MAX_BYTES) {
        return true;
    }
    for (size_t index = 0; index < length; ++index) {
        const char value = password[index];
        if (!((value >= '0' && value <= '9') ||
              (value >= 'a' && value <= 'f') ||
              (value >= 'A' && value <= 'F'))) {
            return false;
        }
    }
    return true;
}

static bool canonical_id_valid(const char *value)
{
    size_t length;
    if (!bounded_length(value, 1U, CANONICAL_ID_MAX_BYTES, &length) ||
        !((value[0] >= 'a' && value[0] <= 'z') ||
          (value[0] >= '0' && value[0] <= '9'))) {
        return false;
    }
    for (size_t index = 1; index < length; ++index) {
        const char character = value[index];
        if (!((character >= 'a' && character <= 'z') ||
              (character >= '0' && character <= '9') || character == '.' ||
              character == '_' || character == '-')) {
            return false;
        }
    }
    return true;
}

static bool boot_id_valid(const char *boot_id)
{
    if (boot_id == NULL) {
        return false;
    }
    for (size_t index = 0; index < MEASUREMENT_BOOT_ID_LENGTH; ++index) {
        const char value = boot_id[index];
        if (!((value >= '0' && value <= '9') ||
              (value >= 'a' && value <= 'f'))) {
            return false;
        }
    }
    return boot_id[MEASUREMENT_BOOT_ID_LENGTH] == '\0';
}

static const char *mqtt_authority(const char *uri)
{
    static const char mqtt[] = "mqtt://";
    static const char mqtts[] = "mqtts://";

    if (strncmp(uri, mqtt, sizeof(mqtt) - 1U) == 0) {
        return uri + sizeof(mqtt) - 1U;
    }
    if (strncmp(uri, mqtts, sizeof(mqtts) - 1U) == 0) {
        return uri + sizeof(mqtts) - 1U;
    }
    return NULL;
}

static bool mqtt_uri_valid(const char *uri)
{
    if (!bounded_length(uri, 1U, MQTT_URI_MAX_BYTES, NULL)) {
        return false;
    }

    const char *authority = mqtt_authority(uri);
    if (authority == NULL || *authority == '\0' || *authority == '/' ||
        *authority == '?' || *authority == '#') {
        return false;
    }
    for (const char *cursor = authority;
         *cursor != '\0' && *cursor != '/' && *cursor != '?' && *cursor != '#';
         ++cursor) {
        if (*cursor == '@') {
            return false;
        }
    }
    return true;
}

bool connectivity_config_valid(const connectivity_config_t *config)
{
    if (config == NULL ||
        !bounded_length(config->wifi_ssid, 1U, WIFI_SSID_MAX_BYTES, NULL) ||
        !wifi_password_valid(config->wifi_password) ||
        !mqtt_uri_valid(config->mqtt_broker_uri) ||
        !bounded_length(config->mqtt_username, 0U, MQTT_CREDENTIAL_MAX_BYTES,
                        NULL) ||
        !bounded_length(config->mqtt_password, 0U, MQTT_CREDENTIAL_MAX_BYTES,
                        NULL)) {
        return false;
    }
    return true;
}

bool connectivity_uri_is_tls(const char *uri)
{
    static const char prefix[] = "mqtts://";
    return uri != NULL && strncmp(uri, prefix, sizeof(prefix) - 1U) == 0;
}

uint32_t connectivity_next_reconnect_delay_ms(uint32_t current_delay_ms)
{
    if (current_delay_ms < CONNECTIVITY_WIFI_RECONNECT_INITIAL_MS) {
        return CONNECTIVITY_WIFI_RECONNECT_INITIAL_MS;
    }
    if (current_delay_ms >= CONNECTIVITY_WIFI_RECONNECT_MAX_MS / 2U) {
        return CONNECTIVITY_WIFI_RECONNECT_MAX_MS;
    }
    return current_delay_ms * 2U;
}

bool connectivity_format_client_id(const char *boot_id, char *client_id,
                                   size_t capacity)
{
    static const char prefix[] = "dt-";

    if (!boot_id_valid(boot_id) || client_id == NULL ||
        capacity < CONNECTIVITY_MQTT_CLIENT_ID_LENGTH + 1U) {
        return false;
    }

    memcpy(client_id, prefix, sizeof(prefix) - 1U);
    memcpy(client_id + sizeof(prefix) - 1U, boot_id,
           MEASUREMENT_BOOT_ID_LENGTH + 1U);
    return true;
}

bool connectivity_format_device_status(const char *site_id,
                                       const char *device_id,
                                       const char *boot_id, bool online,
                                       char *topic, size_t topic_capacity,
                                       char *payload,
                                       size_t payload_capacity)
{
    if (!canonical_id_valid(site_id) || !canonical_id_valid(device_id) ||
        !boot_id_valid(boot_id) || topic == NULL || payload == NULL) {
        return false;
    }

    const int topic_length = snprintf(topic, topic_capacity,
                                      "dt/%s/device/%s/status", site_id,
                                      device_id);
    const int payload_length = snprintf(
        payload, payload_capacity,
        "{\"schema_version\":\"1.0\",\"site_id\":\"%s\","
        "\"device_id\":\"%s\",\"boot_id\":\"%s\",\"status\":\"%s\"}",
        site_id, device_id, boot_id, online ? "online" : "offline");
    return topic_length > 0 && (size_t)topic_length < topic_capacity &&
           payload_length > 0 && (size_t)payload_length < payload_capacity &&
           (size_t)topic_length <= CONNECTIVITY_MQTT_MAX_TOPIC_BYTES &&
           (size_t)payload_length <= CONNECTIVITY_MQTT_MAX_PAYLOAD_BYTES;
}

bool connectivity_publish_arguments_valid(const char *topic,
                                          const void *payload,
                                          size_t payload_length)
{
    size_t topic_length;
    if (!bounded_length(topic, 1U, CONNECTIVITY_MQTT_MAX_TOPIC_BYTES,
                        &topic_length) ||
        payload_length > CONNECTIVITY_MQTT_MAX_PAYLOAD_BYTES ||
        (payload == NULL && payload_length != 0U)) {
        return false;
    }
    for (size_t index = 0; index < topic_length; ++index) {
        if (topic[index] == '+' || topic[index] == '#') {
            return false;
        }
    }
    return true;
}

void connectivity_counter_increment(uint64_t *counter)
{
    if (counter != NULL && *counter != UINT64_MAX) {
        ++*counter;
    }
}
