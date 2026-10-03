#pragma once

#include <stdint.h>

#include "driver/i2c_master.h"

#include "sht31_decode.h"

typedef struct {
    i2c_master_bus_handle_t bus;
    i2c_master_dev_handle_t device;
    uint8_t address;
} sht31_sensor_t;

sht31_status_t sht31_sensor_init(sht31_sensor_t *sensor,
                                 i2c_master_bus_handle_t bus);
sht31_status_t sht31_sensor_measure(sht31_sensor_t *sensor,
                                    sht31_reading_t *reading);
const char *sht31_status_name(sht31_status_t status);
