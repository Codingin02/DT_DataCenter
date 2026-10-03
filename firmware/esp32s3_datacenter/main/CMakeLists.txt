idf_component_register(
    SRCS "app_main.c" "sht31.c" "sht31_decode.c" "inmp441.c" "inmp441_samples.c"
         "acoustic_processing.c" "measurement_model.c" "measurement_runtime.c"
         "connectivity.c" "connectivity_policy.c" "telemetry.c"
         "telemetry_record.c"
    INCLUDE_DIRS "."
    PRIV_REQUIRES bootloader_support esp_driver_i2c esp_driver_i2s esp_event
                  esp_netif esp_timer esp_wifi mbedtls mqtt nvs_flash
)
