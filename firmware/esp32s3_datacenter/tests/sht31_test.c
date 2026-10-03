#include <stddef.h>
#include <stdint.h>

#include "sht31_decode.h"

#define CHECK(condition) do { if (!(condition)) return __LINE__; } while (0)

static int near(float actual, float expected)
{
    const float difference = actual - expected;
    return difference > -0.0001F && difference < 0.0001F;
}

static void response_for(uint16_t raw_temperature, uint16_t raw_humidity,
                         uint8_t response[6])
{
    response[0] = (uint8_t)(raw_temperature >> 8U);
    response[1] = (uint8_t)raw_temperature;
    response[2] = sht31_crc8(response);
    response[3] = (uint8_t)(raw_humidity >> 8U);
    response[4] = (uint8_t)raw_humidity;
    response[5] = sht31_crc8(&response[3]);
}

int main(void)
{
    const uint8_t beef[] = {0xBEU, 0xEFU};
    CHECK(sht31_crc8(beef) == 0x92U);
    CHECK(SHT31_I2C_ADDR_DEFAULT == 0x45U);
    CHECK(SHT31_I2C_ADDR_DEFAULT <= 0x7FU);
    CHECK(SHT31_I2C_ADDR_ALTERNATIVE == 0x44U);
    CHECK(SHT31_I2C_ADDR_DEFAULT != 0x88U);
    CHECK(near(sht31_temperature_c(0U), -45.0F));
    CHECK(near(sht31_temperature_c(UINT16_MAX), 130.0F));
    CHECK(near(sht31_humidity_rh(0U), 0.0F));
    CHECK(near(sht31_humidity_rh(UINT16_MAX), 100.0F));

    uint8_t response_a[6];
    uint8_t response_b[6];
    response_for(0x6666U, 0x8000U, response_a);
    response_for(0x7000U, 0x4000U, response_b);

    sht31_reading_t reading_a = {.quality = SHT31_QUALITY_UNKNOWN};
    sht31_reading_t reading_b = {.quality = SHT31_QUALITY_UNKNOWN};
    CHECK(sht31_decode(response_a, sizeof(response_a), &reading_a) == SHT31_OK);
    CHECK(sht31_decode(response_b, sizeof(response_b), &reading_b) == SHT31_OK);
    CHECK(reading_a.raw_temperature == 0x6666U);
    CHECK(reading_a.raw_humidity == 0x8000U);
    CHECK(reading_b.raw_temperature == 0x7000U);
    CHECK(reading_b.raw_humidity == 0x4000U);
    CHECK(reading_a.quality == SHT31_QUALITY_GOOD);
    CHECK(reading_b.quality == SHT31_QUALITY_GOOD);

    const sht31_reading_t valid_a = reading_a;
    const sht31_reading_t valid_b = reading_b;
    response_a[0] ^= 0x01U;
    CHECK(sht31_decode(response_a, sizeof(response_a), &reading_a) ==
          SHT31_ERROR_TEMPERATURE_CRC);
    CHECK(reading_a.quality == SHT31_QUALITY_INVALID);
    CHECK(reading_a.raw_temperature == valid_a.raw_temperature);
    CHECK(reading_a.raw_humidity == valid_a.raw_humidity);
    CHECK(near(reading_a.temperature_c, valid_a.temperature_c));
    CHECK(near(reading_a.humidity_rh, valid_a.humidity_rh));
    CHECK(reading_b.raw_temperature == valid_b.raw_temperature);
    CHECK(reading_b.raw_humidity == valid_b.raw_humidity);
    CHECK(reading_b.quality == SHT31_QUALITY_GOOD);
    response_a[0] ^= 0x01U;

    response_a[2] ^= 0x01U;
    CHECK(sht31_decode(response_a, sizeof(response_a), &reading_a) ==
          SHT31_ERROR_TEMPERATURE_CRC);
    response_a[2] ^= 0x01U;

    response_a[5] ^= 0x01U;
    CHECK(sht31_decode(response_a, sizeof(response_a), &reading_a) ==
          SHT31_ERROR_HUMIDITY_CRC);
    response_a[5] ^= 0x01U;

    CHECK(sht31_decode(response_a, 5U, &reading_a) == SHT31_ERROR_LENGTH);
    CHECK(sht31_decode(response_a, 7U, &reading_a) == SHT31_ERROR_LENGTH);
    CHECK(sht31_decode(NULL, sizeof(response_a), &reading_a) ==
          SHT31_ERROR_ARGUMENT);
    CHECK(sht31_decode(response_a, sizeof(response_a), NULL) ==
          SHT31_ERROR_ARGUMENT);

    for (size_t byte = 0; byte < sizeof(response_a); ++byte) {
        for (unsigned bit = 0; bit < 8U; ++bit) {
            response_a[byte] ^= (uint8_t)(1U << bit);
            CHECK(sht31_decode(response_a, sizeof(response_a), &reading_a) !=
                  SHT31_OK);
            response_a[byte] ^= (uint8_t)(1U << bit);
        }
    }

    response_for(0U, 0x8000U, response_a);
    CHECK(sht31_decode(response_a, sizeof(response_a), &reading_a) ==
          SHT31_ERROR_RANGE);
    response_for(UINT16_MAX, 0x8000U, response_a);
    CHECK(sht31_decode(response_a, sizeof(response_a), &reading_a) ==
          SHT31_ERROR_RANGE);

    /* Golden environmental test vectors:
     * Proteus State 1:
     *   Sensor A1: 22.0 degC / 50.0 %RH (raw 0x6203 = 25091, 0x8000 = 32768)
     *   Sensor B1: 21.0 degC / 48.0 %RH (raw 0x608C = 24716, 0x7AE1 = 31457)
     * Proteus State 2:
     *   Sensor A2: 24.0 degC / 55.0 %RH (raw 0x64F0 = 25840, 0x8CCC = 36044)
     *   Sensor B2: 23.5 degC / 54.0 %RH (raw 0x6434 = 25652, 0x8A3D = 35389)
     */
    CHECK(sht31_temperature_c(0x6203U) >= 21.99F && sht31_temperature_c(0x6203U) <= 22.02F);
    CHECK(sht31_humidity_rh(0x8000U) >= 49.99F && sht31_humidity_rh(0x8000U) <= 50.02F);
    CHECK(sht31_temperature_c(0x64F0U) >= 23.99F && sht31_temperature_c(0x64F0U) <= 24.02F);
    CHECK(sht31_humidity_rh(0x8CCCU) >= 54.99F && sht31_humidity_rh(0x8CCCU) <= 55.02F);
    CHECK(sht31_temperature_c(0x608CU) >= 20.99F && sht31_temperature_c(0x608CU) <= 21.02F);
    CHECK(sht31_humidity_rh(0x7AE1U) >= 47.99F && sht31_humidity_rh(0x7AE1U) <= 48.02F);
    CHECK(sht31_temperature_c(0x6434U) >= 23.49F && sht31_temperature_c(0x6434U) <= 23.52F);
    CHECK(sht31_humidity_rh(0x8A3DU) >= 53.99F && sht31_humidity_rh(0x8A3DU) <= 54.02F);

    /* Also accept the integer truncated raw values with 0.05 degC tolerance */
    CHECK(sht31_temperature_c(25083U) >= 21.95F && sht31_temperature_c(25083U) <= 22.05F);
    CHECK(sht31_temperature_c(25832U) >= 23.95F && sht31_temperature_c(25832U) <= 24.05F);
    CHECK(sht31_temperature_c(24709U) >= 20.95F && sht31_temperature_c(24709U) <= 21.05F);
    CHECK(sht31_temperature_c(25645U) >= 23.45F && sht31_temperature_c(25645U) <= 23.55F);

    response_for(0x6203U, 0x8000U, response_a);
    CHECK(sht31_decode(response_a, sizeof(response_a), &reading_a) == SHT31_OK);
    CHECK(reading_a.quality == SHT31_QUALITY_GOOD);
    CHECK(reading_a.temperature_c >= 21.99F && reading_a.temperature_c <= 22.02F);
    CHECK(reading_a.humidity_rh >= 49.99F && reading_a.humidity_rh <= 50.02F);

    response_for(0x64F0U, 0x8CCCU, response_a);
    CHECK(sht31_decode(response_a, sizeof(response_a), &reading_a) == SHT31_OK);
    CHECK(reading_a.quality == SHT31_QUALITY_GOOD);
    CHECK(reading_a.temperature_c >= 23.99F && reading_a.temperature_c <= 24.02F);
    CHECK(reading_a.humidity_rh >= 54.99F && reading_a.humidity_rh <= 55.02F);

    response_for(0x608CU, 0x7AE1U, response_b);
    CHECK(sht31_decode(response_b, sizeof(response_b), &reading_b) == SHT31_OK);
    CHECK(reading_b.quality == SHT31_QUALITY_GOOD);
    CHECK(reading_b.temperature_c >= 20.99F && reading_b.temperature_c <= 21.02F);
    CHECK(reading_b.humidity_rh >= 47.99F && reading_b.humidity_rh <= 48.02F);

    response_for(0x6434U, 0x8A3DU, response_b);
    CHECK(sht31_decode(response_b, sizeof(response_b), &reading_b) == SHT31_OK);
    CHECK(reading_b.quality == SHT31_QUALITY_GOOD);
    CHECK(reading_b.temperature_c >= 23.49F && reading_b.temperature_c <= 23.52F);
    CHECK(reading_b.humidity_rh >= 53.99F && reading_b.humidity_rh <= 54.02F);

    return 0;
}
