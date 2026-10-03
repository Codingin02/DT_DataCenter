#include "sht31_decode.h"

uint8_t sht31_crc8(const uint8_t word[2])
{
    uint8_t crc = 0xFFU;

    for (size_t byte = 0; byte < 2U; ++byte) {
        crc ^= word[byte];
        for (unsigned bit = 0; bit < 8U; ++bit) {
            crc = (uint8_t)((crc & 0x80U) != 0U
                                ? (uint8_t)((crc << 1U) ^ 0x31U)
                                : (uint8_t)(crc << 1U));
        }
    }

    return crc;
}

float sht31_temperature_c(uint16_t raw_temperature)
{
    return -45.0F + 175.0F * (float)raw_temperature / 65535.0F;
}

float sht31_humidity_rh(uint16_t raw_humidity)
{
    return 100.0F * (float)raw_humidity / 65535.0F;
}

sht31_status_t sht31_decode(const uint8_t *response, size_t length,
                            sht31_reading_t *reading)
{
    if (response == NULL || reading == NULL) {
        return SHT31_ERROR_ARGUMENT;
    }

    if (length != 6U) {
        reading->quality = SHT31_QUALITY_INVALID;
        return SHT31_ERROR_LENGTH;
    }

    if (sht31_crc8(response) != response[2]) {
        reading->quality = SHT31_QUALITY_INVALID;
        return SHT31_ERROR_TEMPERATURE_CRC;
    }

    if (sht31_crc8(&response[3]) != response[5]) {
        reading->quality = SHT31_QUALITY_INVALID;
        return SHT31_ERROR_HUMIDITY_CRC;
    }

    const uint16_t raw_temperature =
        (uint16_t)(((uint16_t)response[0] << 8U) | response[1]);
    const uint16_t raw_humidity =
        (uint16_t)(((uint16_t)response[3] << 8U) | response[4]);
    const float temperature_c = sht31_temperature_c(raw_temperature);
    const float humidity_rh = sht31_humidity_rh(raw_humidity);

    if (!(temperature_c >= -40.0F && temperature_c <= 125.0F &&
          humidity_rh >= 0.0F && humidity_rh <= 100.0F)) {
        reading->quality = SHT31_QUALITY_INVALID;
        return SHT31_ERROR_RANGE;
    }

    *reading = (sht31_reading_t){
        .raw_temperature = raw_temperature,
        .raw_humidity = raw_humidity,
        .temperature_c = temperature_c,
        .humidity_rh = humidity_rh,
        .quality = SHT31_QUALITY_GOOD,
    };

    return SHT31_OK;
}
