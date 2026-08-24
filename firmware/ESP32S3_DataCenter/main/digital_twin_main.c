#include "dt_mqtt.h"
#include "dt_telemetry.h"
#include <string.h>

#include "esp_err.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "sdkconfig.h"

static const char *TAG = "DT_DataCenter";
static bool mqtt_started;

static void network_event_handler(void *argument, esp_event_base_t event_base, int32_t event_id,
                                  void *event_data)
{
    (void)argument;
    (void)event_data;

    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        esp_err_t err = esp_wifi_connect();
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "Wi-Fi connection start failed: %s", esp_err_to_name(err));
        }
        return;
    }

    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        esp_err_t err = esp_wifi_connect();
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "Wi-Fi reconnect failed: %s", esp_err_to_name(err));
        }
        return;
    }

    if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP && !mqtt_started) {
        esp_err_t err = dt_mqtt_start();
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "MQTT transport initialization failed: %s", esp_err_to_name(err));
            return;
        }
        mqtt_started = true;
        ESP_LOGI(TAG, "Network ready; MQTT transport started");
    }
}

static esp_err_t wifi_station_start(void)
{
    wifi_config_t wifi_config = {0};
    size_t ssid_length = strlen(CONFIG_DT_WIFI_SSID);
    size_t password_length = strlen(CONFIG_DT_WIFI_PASSWORD);
    if (ssid_length == 0 || ssid_length > sizeof(wifi_config.sta.ssid) ||
        password_length > sizeof(wifi_config.sta.password) ||
        (password_length > 0 && password_length < 8)) {
        return ESP_ERR_INVALID_ARG;
    }

    esp_err_t err = esp_netif_init();
    if (err != ESP_OK) {
        return err;
    }
    err = esp_event_loop_create_default();
    if (err != ESP_OK) {
        return err;
    }
    if (esp_netif_create_default_wifi_sta() == NULL) {
        return ESP_ERR_NO_MEM;
    }

    wifi_init_config_t init_config = WIFI_INIT_CONFIG_DEFAULT();
    err = esp_wifi_init(&init_config);
    if (err != ESP_OK) {
        return err;
    }
    err = esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, network_event_handler, NULL);
    if (err != ESP_OK) {
        return err;
    }
    err = esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, network_event_handler, NULL);
    if (err != ESP_OK) {
        return err;
    }

    memcpy(wifi_config.sta.ssid, CONFIG_DT_WIFI_SSID, ssid_length);
    memcpy(wifi_config.sta.password, CONFIG_DT_WIFI_PASSWORD, password_length);
    wifi_config.sta.threshold.authmode =
        password_length == 0 ? WIFI_AUTH_OPEN : WIFI_AUTH_WPA2_PSK;

    err = esp_wifi_set_mode(WIFI_MODE_STA);
    if (err == ESP_OK) {
        err = esp_wifi_set_config(WIFI_IF_STA, &wifi_config);
    }
    if (err == ESP_OK) {
        err = esp_wifi_start();
    }
    return err;
}

void app_main(void)
{
    esp_err_t err = dt_telemetry_source_init();
    if (err != ESP_OK) {
        if (err == ESP_ERR_INVALID_ARG) {
            ESP_LOGE(TAG, "Configure valid canonical site_id and device_id in menuconfig");
        } else {
            ESP_LOGE(TAG, "Telemetry source initialization failed: %s", esp_err_to_name(err));
        }
        return;
    }

    const dt_telemetry_source_t *source = dt_telemetry_source_get();
    ESP_LOGI(TAG, "Telemetry source ready: site_id=%s device_id=%s boot_id=%s",
             source->site_id, source->device_id, source->boot_id);

    err = wifi_station_start();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Wi-Fi station initialization failed: %s", esp_err_to_name(err));
    }
}
