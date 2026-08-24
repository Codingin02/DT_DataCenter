#pragma once

#include <stdbool.h>

#include "dt_telemetry.h"
#include "esp_err.h"

esp_err_t dt_mqtt_start(void);
bool dt_mqtt_is_connected(void);
esp_err_t dt_mqtt_publish_telemetry(const dt_telemetry_message_t *message, int *message_id);
