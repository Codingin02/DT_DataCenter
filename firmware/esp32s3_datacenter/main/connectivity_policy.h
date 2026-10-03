#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

enum {
    CONNECTIVITY_WIFI_RECONNECT_INITIAL_MS = 1000,
    CONNECTIVITY_WIFI_RECONNECT_MAX_MS = 30000,
    CONNECTIVITY_MQTT_CLIENT_ID_LENGTH = 35,
    CONNECTIVITY_MQTT_MAX_TOPIC_BYTES = 256,
    CONNECTIVITY_MQTT_MAX_PAYLOAD_BYTES = 4096,
    CONNECTIVITY_MQTT_OUTBOX_BYTES = 8192,
    CONNECTIVITY_DEVICE_STATUS_TOPIC_CAPACITY = 147,
    CONNECTIVITY_DEVICE_STATUS_PAYLOAD_CAPACITY = 245,
};

typedef struct {
    const char *wifi_ssid;
    const char *wifi_password;
    const char *mqtt_broker_uri;
    const char *mqtt_username;
    const char *mqtt_password;
} connectivity_config_t;

bool connectivity_config_valid(const connectivity_config_t *config);
bool connectivity_uri_is_tls(const char *uri);
uint32_t connectivity_next_reconnect_delay_ms(uint32_t current_delay_ms);
bool connectivity_format_client_id(const char *boot_id, char *client_id,
                                   size_t capacity);
bool connectivity_format_device_status(const char *site_id,
                                       const char *device_id,
                                       const char *boot_id, bool online,
                                       char *topic, size_t topic_capacity,
                                       char *payload,
                                       size_t payload_capacity);
bool connectivity_publish_arguments_valid(const char *topic,
                                          const void *payload,
                                          size_t payload_length);
void connectivity_counter_increment(uint64_t *counter);
