idf_component_register(SRCS "digital_twin_main.c" "dt_telemetry.c" "dt_mqtt.c"
                       PRIV_REQUIRES esp_wifi json mbedtls mqtt nvs_flash
                       INCLUDE_DIRS ".")


