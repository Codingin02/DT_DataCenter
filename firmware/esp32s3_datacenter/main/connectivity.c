#include "connectivity.h"

#include <string.h>

#include "esp_crt_bundle.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_timer.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "mqtt_client.h"
#include "sdkconfig.h"

#include "connectivity_policy.h"

enum { MQTT_RECONNECT_DELAY_MS = 10000 };

typedef struct {
    portMUX_TYPE lock;
    connectivity_diagnostics_t diagnostics;
    esp_netif_t *station_netif;
    esp_timer_handle_t wifi_reconnect_timer;
    esp_mqtt_client_handle_t mqtt_client;
    esp_event_handler_instance_t wifi_handler;
    esp_event_handler_instance_t ip_handler;
    char mqtt_client_id[CONNECTIVITY_MQTT_CLIENT_ID_LENGTH + 1U];
    char status_topic[CONNECTIVITY_DEVICE_STATUS_TOPIC_CAPACITY];
    char online_status[CONNECTIVITY_DEVICE_STATUS_PAYLOAD_CAPACITY];
    char offline_status[CONNECTIVITY_DEVICE_STATUS_PAYLOAD_CAPACITY];
    uint32_t next_reconnect_delay_ms;
    bool start_attempted;
    bool event_loop_owned;
    bool wifi_initialized;
    bool wifi_started;
    bool mqtt_started;
    bool ip_ready;
} connectivity_state_t;

static const char *TAG = "connectivity";
static connectivity_state_t state = {
    .lock = portMUX_INITIALIZER_UNLOCKED,
};

static const connectivity_config_t configured = {
    .wifi_ssid = CONFIG_DT_WIFI_SSID,
    .wifi_password = CONFIG_DT_WIFI_PASSWORD,
    .mqtt_broker_uri = CONFIG_DT_MQTT_BROKER_URI,
    .mqtt_username = CONFIG_DT_MQTT_USERNAME,
    .mqtt_password = CONFIG_DT_MQTT_PASSWORD,
};

static void set_wifi_state(connectivity_wifi_state_t wifi_state)
{
    taskENTER_CRITICAL(&state.lock);
    state.diagnostics.wifi_state = wifi_state;
    taskEXIT_CRITICAL(&state.lock);
}

static void set_mqtt_state(connectivity_mqtt_state_t mqtt_state)
{
    taskENTER_CRITICAL(&state.lock);
    state.diagnostics.mqtt_state = mqtt_state;
    taskEXIT_CRITICAL(&state.lock);
}

static void schedule_wifi_reconnect(void);

static void connect_wifi(void)
{
    taskENTER_CRITICAL(&state.lock);
    if (state.ip_ready) {
        taskEXIT_CRITICAL(&state.lock);
        return;
    }
    connectivity_counter_increment(
        &state.diagnostics.wifi_connection_attempt_count);
    state.diagnostics.wifi_state = CONNECTIVITY_WIFI_CONNECTING;
    taskEXIT_CRITICAL(&state.lock);

    const esp_err_t error = esp_wifi_connect();
    if (error != ESP_OK) {
        ESP_LOGW(TAG, "Wi-Fi connect request failed: %s",
                 esp_err_to_name(error));
        set_wifi_state(CONNECTIVITY_WIFI_ERROR);
        schedule_wifi_reconnect();
    }
}

static void reconnect_timer_callback(void *argument)
{
    (void)argument;
    connect_wifi();
}

static void schedule_wifi_reconnect(void)
{
    if (state.wifi_reconnect_timer == NULL ||
        esp_timer_is_active(state.wifi_reconnect_timer)) {
        return;
    }

    taskENTER_CRITICAL(&state.lock);
    if (state.ip_ready) {
        taskEXIT_CRITICAL(&state.lock);
        return;
    }
    const uint32_t delay_ms = state.next_reconnect_delay_ms;
    state.diagnostics.current_reconnect_delay_ms = delay_ms;
    state.next_reconnect_delay_ms =
        connectivity_next_reconnect_delay_ms(delay_ms);
    taskEXIT_CRITICAL(&state.lock);

    const esp_err_t error = esp_timer_start_once(
        state.wifi_reconnect_timer, (uint64_t)delay_ms * 1000U);
    if (error == ESP_OK) {
        ESP_LOGW(TAG, "Wi-Fi reconnect scheduled in %u ms", delay_ms);
    } else if (error != ESP_ERR_INVALID_STATE) {
        ESP_LOGE(TAG, "Wi-Fi reconnect scheduling failed: %s",
                 esp_err_to_name(error));
        set_wifi_state(CONNECTIVITY_WIFI_ERROR);
    }
}

static void start_mqtt(void)
{
    taskENTER_CRITICAL(&state.lock);
    if (state.mqtt_client == NULL || state.mqtt_started) {
        taskEXIT_CRITICAL(&state.lock);
        return;
    }
    state.mqtt_started = true;
    state.diagnostics.mqtt_state = CONNECTIVITY_MQTT_CONNECTING;
    taskEXIT_CRITICAL(&state.lock);

    const esp_err_t error = esp_mqtt_client_start(state.mqtt_client);
    if (error != ESP_OK) {
        taskENTER_CRITICAL(&state.lock);
        state.mqtt_started = false;
        state.diagnostics.mqtt_state = CONNECTIVITY_MQTT_ERROR;
        taskEXIT_CRITICAL(&state.lock);
        ESP_LOGE(TAG, "MQTT client start failed: %s", esp_err_to_name(error));
    }
}

static void wifi_event_handler(void *argument, esp_event_base_t event_base,
                               int32_t event_id, void *event_data)
{
    (void)argument;
    (void)event_base;

    if (event_id == WIFI_EVENT_STA_START) {
        connect_wifi();
        return;
    }
    if (event_id != WIFI_EVENT_STA_DISCONNECTED) {
        return;
    }

    const wifi_event_sta_disconnected_t *disconnected = event_data;
    taskENTER_CRITICAL(&state.lock);
    state.ip_ready = false;
    connectivity_counter_increment(&state.diagnostics.wifi_disconnect_count);
    state.diagnostics.last_wifi_disconnect_reason = disconnected->reason;
    state.diagnostics.wifi_state = CONNECTIVITY_WIFI_DISCONNECTED;
    if (state.mqtt_started) {
        state.diagnostics.mqtt_state = CONNECTIVITY_MQTT_DISCONNECTED;
    }
    taskEXIT_CRITICAL(&state.lock);
    schedule_wifi_reconnect();
}

static void ip_event_handler(void *argument, esp_event_base_t event_base,
                             int32_t event_id, void *event_data)
{
    (void)argument;
    (void)event_base;
    (void)event_data;

    if (event_id != IP_EVENT_STA_GOT_IP) {
        return;
    }
    if (state.wifi_reconnect_timer != NULL &&
        esp_timer_is_active(state.wifi_reconnect_timer)) {
        esp_timer_stop(state.wifi_reconnect_timer);
    }

    taskENTER_CRITICAL(&state.lock);
    state.ip_ready = true;
    state.next_reconnect_delay_ms = CONNECTIVITY_WIFI_RECONNECT_INITIAL_MS;
    state.diagnostics.current_reconnect_delay_ms = 0;
    state.diagnostics.wifi_state = CONNECTIVITY_WIFI_IP_READY;
    connectivity_counter_increment(&state.diagnostics.wifi_ip_ready_count);
    taskEXIT_CRITICAL(&state.lock);
    ESP_LOGI(TAG, "Wi-Fi IP ready");
    start_mqtt();
}

static void mqtt_event_handler(void *argument, esp_event_base_t event_base,
                               int32_t event_id, void *event_data)
{
    (void)argument;
    (void)event_base;
    const esp_mqtt_event_handle_t event = event_data;

    taskENTER_CRITICAL(&state.lock);
    if (event_id == MQTT_EVENT_CONNECTED) {
        state.diagnostics.mqtt_state = CONNECTIVITY_MQTT_CONNECTED;
        connectivity_counter_increment(&state.diagnostics.mqtt_connect_count);
    } else if (event_id == MQTT_EVENT_DISCONNECTED) {
        state.diagnostics.mqtt_state = CONNECTIVITY_MQTT_DISCONNECTED;
        connectivity_counter_increment(&state.diagnostics.mqtt_disconnect_count);
    } else if (event_id == MQTT_EVENT_PUBLISHED) {
        connectivity_counter_increment(
            &state.diagnostics.mqtt_qos1_acknowledgement_count);
    } else if (event_id == MQTT_EVENT_ERROR) {
        state.diagnostics.mqtt_state = CONNECTIVITY_MQTT_ERROR;
    }
    taskEXIT_CRITICAL(&state.lock);

    if (event_id == MQTT_EVENT_CONNECTED) {
        ESP_LOGI(TAG, "MQTT connected");
        const connectivity_publish_result_t result =
            connectivity_publish_qos1(state.status_topic,
                                      state.online_status,
                                      strlen(state.online_status), true);
        if (result != CONNECTIVITY_PUBLISH_ACCEPTED) {
            ESP_LOGW(TAG, "MQTT online status enqueue failed: %d", result);
        }
    } else if (event_id == MQTT_EVENT_DISCONNECTED) {
        ESP_LOGW(TAG, "MQTT disconnected");
    } else if (event_id == MQTT_EVENT_ERROR && event->error_handle != NULL) {
        ESP_LOGW(TAG, "MQTT error type=%d", event->error_handle->error_type);
    }
}

static void cleanup_start_failure(void)
{
    if (state.mqtt_client != NULL) {
        esp_mqtt_client_unregister_event(state.mqtt_client, MQTT_EVENT_ANY,
                                         mqtt_event_handler);
        esp_mqtt_client_destroy(state.mqtt_client);
        state.mqtt_client = NULL;
    }
    if (state.ip_handler != NULL) {
        esp_event_handler_instance_unregister(IP_EVENT, IP_EVENT_STA_GOT_IP,
                                              state.ip_handler);
        state.ip_handler = NULL;
    }
    if (state.wifi_handler != NULL) {
        esp_event_handler_instance_unregister(WIFI_EVENT, ESP_EVENT_ANY_ID,
                                              state.wifi_handler);
        state.wifi_handler = NULL;
    }
    if (state.wifi_reconnect_timer != NULL) {
        if (esp_timer_is_active(state.wifi_reconnect_timer)) {
            esp_timer_stop(state.wifi_reconnect_timer);
        }
        esp_timer_delete(state.wifi_reconnect_timer);
        state.wifi_reconnect_timer = NULL;
    }
    if (state.wifi_started) {
        esp_wifi_stop();
        state.wifi_started = false;
    }
    if (state.station_netif != NULL) {
        esp_netif_destroy_default_wifi(state.station_netif);
        state.station_netif = NULL;
    }
    if (state.wifi_initialized) {
        esp_wifi_deinit();
        state.wifi_initialized = false;
    }
    if (state.event_loop_owned) {
        esp_event_loop_delete_default();
        state.event_loop_owned = false;
    }
}

static esp_err_t initialize_mqtt(void)
{
    const bool tls_enabled = connectivity_uri_is_tls(configured.mqtt_broker_uri);
    const esp_mqtt_client_config_t mqtt_config = {
        .broker.address.uri = configured.mqtt_broker_uri,
        .broker.verification.crt_bundle_attach =
            tls_enabled ? esp_crt_bundle_attach : NULL,
        .credentials.username = configured.mqtt_username[0] == '\0'
            ? NULL
            : configured.mqtt_username,
        .credentials.client_id = state.mqtt_client_id,
        .credentials.authentication.password =
            configured.mqtt_password[0] == '\0'
            ? NULL
            : configured.mqtt_password,
        .session.last_will.topic = state.status_topic,
        .session.last_will.msg = state.offline_status,
        .session.last_will.qos = 1,
        .session.last_will.retain = 1,
        .network.reconnect_timeout_ms = MQTT_RECONNECT_DELAY_MS,
        .outbox.limit = CONNECTIVITY_MQTT_OUTBOX_BYTES,
    };

    state.mqtt_client = esp_mqtt_client_init(&mqtt_config);
    if (state.mqtt_client == NULL) {
        return ESP_ERR_NO_MEM;
    }
    const esp_err_t error = esp_mqtt_client_register_event(
        state.mqtt_client, MQTT_EVENT_ANY, mqtt_event_handler, NULL);
    if (error != ESP_OK) {
        esp_mqtt_client_destroy(state.mqtt_client);
        state.mqtt_client = NULL;
        return error;
    }
    set_mqtt_state(CONNECTIVITY_MQTT_INITIALIZED);
    return ESP_OK;
}

esp_err_t connectivity_start(const char *boot_id)
{
    taskENTER_CRITICAL(&state.lock);
    if (state.start_attempted) {
        taskEXIT_CRITICAL(&state.lock);
        return ESP_ERR_INVALID_STATE;
    }
    state.start_attempted = true;
    state.next_reconnect_delay_ms = CONNECTIVITY_WIFI_RECONNECT_INITIAL_MS;
    taskEXIT_CRITICAL(&state.lock);

    if (!connectivity_config_valid(&configured) ||
        !connectivity_format_client_id(boot_id, state.mqtt_client_id,
                                       sizeof(state.mqtt_client_id)) ||
        !connectivity_format_device_status(
            CONFIG_DT_SITE_ID, CONFIG_DT_DEVICE_ID, boot_id, false,
            state.status_topic, sizeof(state.status_topic),
            state.offline_status, sizeof(state.offline_status)) ||
        !connectivity_format_device_status(
            CONFIG_DT_SITE_ID, CONFIG_DT_DEVICE_ID, boot_id, true,
            state.status_topic, sizeof(state.status_topic),
            state.online_status, sizeof(state.online_status))) {
        ESP_LOGW(TAG, "connectivity configuration is incomplete or invalid");
        return ESP_ERR_INVALID_ARG;
    }

    esp_err_t error = esp_netif_init();
    if (error != ESP_OK) {
        return error;
    }
    error = esp_event_loop_create_default();
    if (error == ESP_OK) {
        state.event_loop_owned = true;
    } else if (error != ESP_ERR_INVALID_STATE) {
        return error;
    }

    state.station_netif = esp_netif_create_default_wifi_sta();
    wifi_init_config_t wifi_init = WIFI_INIT_CONFIG_DEFAULT();
    error = esp_wifi_init(&wifi_init);
    if (error != ESP_OK) {
        cleanup_start_failure();
        return error;
    }
    state.wifi_initialized = true;

    const esp_timer_create_args_t timer_config = {
        .callback = reconnect_timer_callback,
        .name = "wifi_reconnect",
    };
    error = esp_timer_create(&timer_config, &state.wifi_reconnect_timer);
    if (error != ESP_OK) {
        cleanup_start_failure();
        return error;
    }
    error = esp_event_handler_instance_register(
        WIFI_EVENT, ESP_EVENT_ANY_ID, wifi_event_handler, NULL,
        &state.wifi_handler);
    if (error != ESP_OK) {
        cleanup_start_failure();
        return error;
    }
    error = esp_event_handler_instance_register(
        IP_EVENT, IP_EVENT_STA_GOT_IP, ip_event_handler, NULL,
        &state.ip_handler);
    if (error != ESP_OK) {
        cleanup_start_failure();
        return error;
    }

    wifi_config_t wifi_config = {
        .sta = {
            .threshold.authmode = WIFI_AUTH_WPA2_PSK,
            .pmf_cfg = {
                .capable = true,
                .required = false,
            },
        },
    };
    memcpy(wifi_config.sta.ssid, configured.wifi_ssid,
           strlen(configured.wifi_ssid));
    memcpy(wifi_config.sta.password, configured.wifi_password,
           strlen(configured.wifi_password));

    error = esp_wifi_set_storage(WIFI_STORAGE_RAM);
    if (error == ESP_OK) {
        error = esp_wifi_set_mode(WIFI_MODE_STA);
    }
    if (error == ESP_OK) {
        error = esp_wifi_set_config(WIFI_IF_STA, &wifi_config);
    }
    if (error == ESP_OK) {
        error = initialize_mqtt();
    }
    if (error == ESP_OK) {
        set_wifi_state(CONNECTIVITY_WIFI_INITIALIZED);
        error = esp_wifi_start();
    }
    if (error != ESP_OK) {
        cleanup_start_failure();
        return error;
    }
    state.wifi_started = true;
    ESP_LOGI(TAG, "Wi-Fi station and MQTT transport initialized");
    return ESP_OK;
}

connectivity_publish_result_t connectivity_publish_qos1(
    const char *topic, const void *payload, size_t payload_length, bool retain)
{
    if (!connectivity_publish_arguments_valid(topic, payload, payload_length)) {
        taskENTER_CRITICAL(&state.lock);
        connectivity_counter_increment(
            &state.diagnostics.mqtt_publish_rejected_count);
        taskEXIT_CRITICAL(&state.lock);
        return CONNECTIVITY_PUBLISH_INVALID_ARGUMENT;
    }

    taskENTER_CRITICAL(&state.lock);
    const bool available =
        state.mqtt_client != NULL && state.mqtt_started && state.ip_ready &&
        state.diagnostics.mqtt_state == CONNECTIVITY_MQTT_CONNECTED;
    esp_mqtt_client_handle_t client = state.mqtt_client;
    taskEXIT_CRITICAL(&state.lock);
    if (!available) {
        taskENTER_CRITICAL(&state.lock);
        connectivity_counter_increment(
            &state.diagnostics.mqtt_publish_rejected_count);
        taskEXIT_CRITICAL(&state.lock);
        return CONNECTIVITY_PUBLISH_UNAVAILABLE;
    }

    const int message_id = esp_mqtt_client_enqueue(
        client, topic, payload, (int)payload_length, 1, retain ? 1 : 0, false);
    taskENTER_CRITICAL(&state.lock);
    if (message_id >= 0) {
        connectivity_counter_increment(
            &state.diagnostics.mqtt_publish_accepted_count);
        taskEXIT_CRITICAL(&state.lock);
        return CONNECTIVITY_PUBLISH_ACCEPTED;
    }
    connectivity_counter_increment(
        &state.diagnostics.mqtt_publish_rejected_count);
    if (message_id == -2) {
        connectivity_counter_increment(
            &state.diagnostics.mqtt_publish_outbox_full_count);
        taskEXIT_CRITICAL(&state.lock);
        return CONNECTIVITY_PUBLISH_OUTBOX_FULL;
    }
    taskEXIT_CRITICAL(&state.lock);
    return CONNECTIVITY_PUBLISH_CLIENT_ERROR;
}

void connectivity_get_diagnostics(connectivity_diagnostics_t *diagnostics)
{
    if (diagnostics == NULL) {
        return;
    }
    taskENTER_CRITICAL(&state.lock);
    *diagnostics = state.diagnostics;
    taskEXIT_CRITICAL(&state.lock);
}
