#include "dt_mqtt.h"

#include <stdatomic.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>

#include "cJSON.h"
#include "esp_log.h"
#include "mqtt_client.h"
#include "sdkconfig.h"

#if CONFIG_MBEDTLS_CERTIFICATE_BUNDLE
#include "esp_crt_bundle.h"
#endif

#define DT_MQTT_STATUS_TOPIC_FORMAT "dt/%s/device/%s/status"
#define DT_MQTT_TOPIC_BUFFER_SIZE 288
#define DT_DEVICE_STATUS_SCHEMA_VERSION "1.0"

static const char *TAG = "DT_MQTT";
static const char STATUS_ONLINE[] = "online";
static const char STATUS_OFFLINE[] = "offline";
static esp_mqtt_client_handle_t mqtt_client;
static atomic_bool mqtt_connected;
static char status_topic[DT_MQTT_TOPIC_BUFFER_SIZE];
static char *online_status_payload;
static char *offline_status_payload;

static bool broker_uri_is_valid(const char *uri, bool *uses_tls)
{
    const char *authority;

    if (strncmp(uri, "mqtt://", 7) == 0) {
        *uses_tls = false;
        authority = uri + 7;
    } else if (strncmp(uri, "mqtts://", 8) == 0) {
        *uses_tls = true;
        authority = uri + 8;
    } else {
        return false;
    }

    return authority[0] != '\0' && strpbrk(authority, "/@?#") == NULL;
}

static char *serialize_telemetry(const dt_telemetry_message_t *message)
{
    cJSON *payload = cJSON_CreateObject();
    if (payload == NULL ||
        cJSON_AddStringToObject(payload, "schema_version", message->schema_version) == NULL ||
        cJSON_AddStringToObject(payload, "site_id", message->site_id) == NULL ||
        cJSON_AddStringToObject(payload, "device_id", message->device_id) == NULL ||
        cJSON_AddStringToObject(payload, "boot_id", message->boot_id) == NULL ||
        cJSON_AddNumberToObject(payload, "seq", (double)message->seq) == NULL ||
        cJSON_AddStringToObject(payload, "sensor_id", message->sensor_id) == NULL ||
        cJSON_AddStringToObject(payload, "asset_id", message->asset_id) == NULL ||
        cJSON_AddStringToObject(payload, "metric", message->metric) == NULL ||
        cJSON_AddNumberToObject(payload, "value", message->value) == NULL ||
        cJSON_AddStringToObject(payload, "unit", message->unit) == NULL ||
        cJSON_AddStringToObject(payload, "ts", message->ts) == NULL ||
        cJSON_AddStringToObject(payload, "quality", message->quality) == NULL) {
        cJSON_Delete(payload);
        return NULL;
    }

    char *serialized = cJSON_PrintUnformatted(payload);
    cJSON_Delete(payload);
    return serialized;
}

static char *serialize_device_status(const dt_telemetry_source_t *source, const char *status)
{
    cJSON *payload = cJSON_CreateObject();
    if (payload == NULL ||
        cJSON_AddStringToObject(payload, "schema_version", DT_DEVICE_STATUS_SCHEMA_VERSION) ==
            NULL ||
        cJSON_AddStringToObject(payload, "site_id", source->site_id) == NULL ||
        cJSON_AddStringToObject(payload, "device_id", source->device_id) == NULL ||
        cJSON_AddStringToObject(payload, "boot_id", source->boot_id) == NULL ||
        cJSON_AddStringToObject(payload, "status", status) == NULL) {
        cJSON_Delete(payload);
        return NULL;
    }

    char *serialized = cJSON_PrintUnformatted(payload);
    cJSON_Delete(payload);
    return serialized;
}

static void mqtt_event_handler(void *handler_args, esp_event_base_t base, int32_t event_id,
                               void *event_data)
{
    esp_mqtt_event_handle_t event = event_data;
    (void)handler_args;
    (void)base;

    switch ((esp_mqtt_event_id_t)event_id) {
    case MQTT_EVENT_CONNECTED: {
        int message_id = esp_mqtt_client_enqueue(event->client, status_topic,
                                                  online_status_payload, 0, 1, 1, false);
        if (message_id < 0) {
            ESP_LOGW(TAG, "MQTT online status enqueue failed: %d", message_id);
            break;
        }
        atomic_store(&mqtt_connected, true);
        ESP_LOGI(TAG, "MQTT connected");
        break;
    }
    case MQTT_EVENT_DISCONNECTED:
        atomic_store(&mqtt_connected, false);
        ESP_LOGW(TAG, "MQTT disconnected; native reconnect remains active");
        break;
    case MQTT_EVENT_ERROR:
        ESP_LOGE(TAG, "MQTT transport error: type=%d",
                 event->error_handle == NULL ? -1 : event->error_handle->error_type);
        break;
    default:
        break;
    }
}

esp_err_t dt_mqtt_start(void)
{
    if (mqtt_client != NULL) {
        return ESP_OK;
    }

    const dt_telemetry_source_t *source = dt_telemetry_source_get();
    bool uses_tls;
    if (source == NULL || !broker_uri_is_valid(CONFIG_DT_MQTT_BROKER_URI, &uses_tls) ||
        (CONFIG_DT_MQTT_PASSWORD[0] != '\0' && CONFIG_DT_MQTT_USERNAME[0] == '\0')) {
        return ESP_ERR_INVALID_ARG;
    }
#if !CONFIG_MBEDTLS_CERTIFICATE_BUNDLE
    if (uses_tls) {
        return ESP_ERR_NOT_SUPPORTED;
    }
#endif

    int topic_length = snprintf(status_topic, sizeof(status_topic), DT_MQTT_STATUS_TOPIC_FORMAT,
                                source->site_id, source->device_id);
    if (topic_length < 0 || (size_t)topic_length >= sizeof(status_topic)) {
        return ESP_ERR_INVALID_SIZE;
    }

    online_status_payload = serialize_device_status(source, STATUS_ONLINE);
    offline_status_payload = serialize_device_status(source, STATUS_OFFLINE);
    if (online_status_payload == NULL || offline_status_payload == NULL) {
        cJSON_free(online_status_payload);
        cJSON_free(offline_status_payload);
        online_status_payload = NULL;
        offline_status_payload = NULL;
        return ESP_ERR_NO_MEM;
    }

    esp_mqtt_client_config_t config = {
        .broker.address.uri = CONFIG_DT_MQTT_BROKER_URI,
        .credentials.username = CONFIG_DT_MQTT_USERNAME[0] == '\0' ? NULL : CONFIG_DT_MQTT_USERNAME,
        .credentials.client_id = source->device_id,
        .credentials.authentication.password =
            CONFIG_DT_MQTT_PASSWORD[0] == '\0' ? NULL : CONFIG_DT_MQTT_PASSWORD,
        .session.last_will.topic = status_topic,
        .session.last_will.msg = offline_status_payload,
        .session.last_will.qos = 1,
        .session.last_will.retain = 1,
        .session.protocol_ver = MQTT_PROTOCOL_V_3_1_1,
        .network.reconnect_timeout_ms = CONFIG_DT_MQTT_RECONNECT_TIMEOUT_MS,
        .network.disable_auto_reconnect = false,
    };
#if CONFIG_MBEDTLS_CERTIFICATE_BUNDLE
    if (uses_tls) {
        config.broker.verification.crt_bundle_attach = esp_crt_bundle_attach;
    }
#endif

    mqtt_client = esp_mqtt_client_init(&config);
    if (mqtt_client == NULL) {
        cJSON_free(online_status_payload);
        cJSON_free(offline_status_payload);
        online_status_payload = NULL;
        offline_status_payload = NULL;
        return ESP_ERR_NO_MEM;
    }

    esp_err_t err = esp_mqtt_client_register_event(mqtt_client, ESP_EVENT_ANY_ID,
                                                   mqtt_event_handler, NULL);
    if (err == ESP_OK) {
        err = esp_mqtt_client_start(mqtt_client);
    }
    if (err != ESP_OK) {
        esp_mqtt_client_destroy(mqtt_client);
        mqtt_client = NULL;
        cJSON_free(online_status_payload);
        cJSON_free(offline_status_payload);
        online_status_payload = NULL;
        offline_status_payload = NULL;
    }
    return err;
}

bool dt_mqtt_is_connected(void)
{
    return atomic_load(&mqtt_connected);
}

esp_err_t dt_mqtt_publish_telemetry(const dt_telemetry_message_t *message, int *message_id)
{
    if (message_id != NULL) {
        *message_id = -1;
    }

    esp_err_t err = dt_telemetry_message_validate(message);
    if (err != ESP_OK) {
        return err;
    }
    if (mqtt_client == NULL || !dt_mqtt_is_connected()) {
        return ESP_ERR_INVALID_STATE;
    }

    char topic[DT_MQTT_TOPIC_BUFFER_SIZE];
    int topic_length = snprintf(topic, sizeof(topic), DT_TELEMETRY_TOPIC_FORMAT, message->site_id,
                                message->device_id, message->sensor_id, message->metric);
    if (topic_length < 0 || (size_t)topic_length >= sizeof(topic)) {
        return ESP_ERR_INVALID_SIZE;
    }

    char *payload = serialize_telemetry(message);
    if (payload == NULL) {
        return ESP_ERR_NO_MEM;
    }

    int queued_id = esp_mqtt_client_enqueue(mqtt_client, topic, payload, 0, 1, 0, false);
    cJSON_free(payload);
    if (queued_id < 0) {
        return queued_id == -2 ? ESP_ERR_NO_MEM : ESP_FAIL;
    }
    if (message_id != NULL) {
        *message_id = queued_id;
    }
    return ESP_OK;
}
