#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"

typedef enum {
    CONNECTIVITY_WIFI_NOT_CONFIGURED = 0,
    CONNECTIVITY_WIFI_INITIALIZED,
    CONNECTIVITY_WIFI_CONNECTING,
    CONNECTIVITY_WIFI_IP_READY,
    CONNECTIVITY_WIFI_DISCONNECTED,
    CONNECTIVITY_WIFI_ERROR,
} connectivity_wifi_state_t;

typedef enum {
    CONNECTIVITY_MQTT_DISABLED = 0,
    CONNECTIVITY_MQTT_INITIALIZED,
    CONNECTIVITY_MQTT_CONNECTING,
    CONNECTIVITY_MQTT_CONNECTED,
    CONNECTIVITY_MQTT_DISCONNECTED,
    CONNECTIVITY_MQTT_ERROR,
} connectivity_mqtt_state_t;

typedef enum {
    CONNECTIVITY_PUBLISH_ACCEPTED = 0,
    CONNECTIVITY_PUBLISH_UNAVAILABLE,
    CONNECTIVITY_PUBLISH_INVALID_ARGUMENT,
    CONNECTIVITY_PUBLISH_OUTBOX_FULL,
    CONNECTIVITY_PUBLISH_CLIENT_ERROR,
} connectivity_publish_result_t;

typedef struct {
    uint64_t wifi_connection_attempt_count;
    uint64_t wifi_disconnect_count;
    uint64_t wifi_ip_ready_count;
    uint64_t mqtt_connect_count;
    uint64_t mqtt_disconnect_count;
    uint64_t mqtt_publish_accepted_count;
    uint64_t mqtt_publish_rejected_count;
    uint64_t mqtt_publish_outbox_full_count;
    uint64_t mqtt_qos1_acknowledgement_count;
    uint32_t current_reconnect_delay_ms;
    uint32_t last_wifi_disconnect_reason;
    connectivity_wifi_state_t wifi_state;
    connectivity_mqtt_state_t mqtt_state;
} connectivity_diagnostics_t;

esp_err_t connectivity_start(const char *boot_id);
connectivity_publish_result_t connectivity_publish_qos1(
    const char *topic, const void *payload, size_t payload_length,
    bool retain);
void connectivity_get_diagnostics(connectivity_diagnostics_t *diagnostics);
