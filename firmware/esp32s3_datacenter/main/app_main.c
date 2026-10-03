#include "esp_err.h"
#include "esp_log.h"
#include "nvs_flash.h"

#include "connectivity.h"
#include "measurement_runtime.h"
#include "telemetry.h"

static const char *TAG = "app";

void app_main(void)
{
    ESP_ERROR_CHECK(nvs_flash_init());
    ESP_ERROR_CHECK(measurement_runtime_start());

    const esp_err_t connectivity_error =
        connectivity_start(measurement_runtime_boot_id());
    if (connectivity_error != ESP_OK) {
        ESP_LOGW(TAG, "connectivity inactive: %s",
                 esp_err_to_name(connectivity_error));
    } else {
        const esp_err_t time_error = telemetry_start_time_sync();
        if (time_error != ESP_OK) {
            ESP_LOGW(TAG, "telemetry time inactive: %s",
                     esp_err_to_name(time_error));
        }
    }

    measurement_event_t event;
    for (;;) {
        if (measurement_runtime_receive(&event, 1000U)) {
            telemetry_process_event(&event);
        }
    }
}
