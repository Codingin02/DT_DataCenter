#pragma once

#include <stddef.h>
#include <stdint.h>

enum {
    SHT31_I2C_ADDR_DEFAULT = 0x45,
    SHT31_I2C_ADDR_ALTERNATIVE = 0x44,
};

typedef enum {
    SHT31_OK = 0,
    SHT31_ERROR_ARGUMENT,
    SHT31_ERROR_NOT_FOUND,
    SHT31_ERROR_TIMEOUT,
    SHT31_ERROR_IO,
    SHT31_ERROR_LENGTH,
    SHT31_ERROR_TEMPERATURE_CRC,
    SHT31_ERROR_HUMIDITY_CRC,
    SHT31_ERROR_RANGE
} sht31_status_t;

typedef enum {
    SHT31_QUALITY_UNKNOWN = 0,
    SHT31_QUALITY_GOOD,
    SHT31_QUALITY_INVALID
} sht31_quality_t;

typedef struct {
    uint16_t raw_temperature;
    uint16_t raw_humidity;
    float temperature_c;
    float humidity_rh;
    sht31_quality_t quality;
} sht31_reading_t;

uint8_t sht31_crc8(const uint8_t word[2]);
float sht31_temperature_c(uint16_t raw_temperature);
float sht31_humidity_rh(uint16_t raw_humidity);
sht31_status_t sht31_decode(const uint8_t *response, size_t length,
                            sht31_reading_t *reading);
