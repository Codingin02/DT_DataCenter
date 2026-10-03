#include "sht31.h"

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "hardware_config.h"

static sht31_status_t status_from_esp_err(esp_err_t error)
{
    switch (error) {
    case ESP_OK:
        return SHT31_OK;
    case ESP_ERR_INVALID_ARG:
        return SHT31_ERROR_ARGUMENT;
    case ESP_ERR_NOT_FOUND:
        return SHT31_ERROR_NOT_FOUND;
    case ESP_ERR_TIMEOUT:
        return SHT31_ERROR_TIMEOUT;
    default:
        return SHT31_ERROR_IO;
    }
}

static sht31_status_t find_address(i2c_master_bus_handle_t bus,
                                   uint8_t *address)
{
    static const uint8_t supported_addresses[] = {
        SHT31_I2C_ADDRESS_DEFAULT, SHT31_I2C_ADDRESS_ALTERNATIVE
    };

    for (size_t index = 0; index < sizeof(supported_addresses); ++index) {
        const esp_err_t error = i2c_master_probe(
            bus, supported_addresses[index], SHT31_TRANSFER_TIMEOUT_MS);
        if (error == ESP_OK) {
            *address = supported_addresses[index];
            return SHT31_OK;
        }
        if (error != ESP_ERR_NOT_FOUND) {
            return status_from_esp_err(error);
        }
    }

    return SHT31_ERROR_NOT_FOUND;
}

sht31_status_t sht31_sensor_init(sht31_sensor_t *sensor,
                                 i2c_master_bus_handle_t bus)
{
    if (sensor == NULL || bus == NULL) {
        return SHT31_ERROR_ARGUMENT;
    }

    uint8_t address = 0U;
    const sht31_status_t probe_status = find_address(bus, &address);
    if (probe_status != SHT31_OK) {
        return probe_status;
    }

    const i2c_device_config_t device_config = {
        .dev_addr_length = I2C_ADDR_BIT_LEN_7,
        .device_address = address,
        .scl_speed_hz = SHT31_I2C_FREQUENCY_HZ,
    };
    i2c_master_dev_handle_t device = NULL;
    const esp_err_t error =
        i2c_master_bus_add_device(bus, &device_config, &device);
    if (error != ESP_OK) {
        return status_from_esp_err(error);
    }

    *sensor = (sht31_sensor_t){
        .bus = bus,
        .device = device,
        .address = address,
    };
    return SHT31_OK;
}

sht31_status_t sht31_sensor_measure(sht31_sensor_t *sensor,
                                    sht31_reading_t *reading)
{
    if (sensor == NULL || sensor->device == NULL || reading == NULL) {
        return SHT31_ERROR_ARGUMENT;
    }

    static const uint8_t command[] = {0x24U, 0x00U};
    esp_err_t error = i2c_master_transmit(
        sensor->device, command, sizeof(command), SHT31_TRANSFER_TIMEOUT_MS);
    if (error != ESP_OK) {
        reading->quality = SHT31_QUALITY_INVALID;
        return status_from_esp_err(error);
    }

    vTaskDelay(pdMS_TO_TICKS(SHT31_CONVERSION_TIME_MS));

    uint8_t response[6];
    error = i2c_master_receive(sensor->device, response, sizeof(response),
                               SHT31_TRANSFER_TIMEOUT_MS);
    if (error != ESP_OK) {
        reading->quality = SHT31_QUALITY_INVALID;
        return status_from_esp_err(error);
    }

    return sht31_decode(response, sizeof(response), reading);
}

const char *sht31_status_name(sht31_status_t status)
{
    switch (status) {
    case SHT31_OK:
        return "ok";
    case SHT31_ERROR_ARGUMENT:
        return "invalid_argument";
    case SHT31_ERROR_NOT_FOUND:
        return "not_found";
    case SHT31_ERROR_TIMEOUT:
        return "timeout";
    case SHT31_ERROR_IO:
        return "io_error";
    case SHT31_ERROR_LENGTH:
        return "invalid_length";
    case SHT31_ERROR_TEMPERATURE_CRC:
        return "temperature_crc";
    case SHT31_ERROR_HUMIDITY_CRC:
        return "humidity_crc";
    case SHT31_ERROR_RANGE:
        return "out_of_range";
    default:
        return "unknown";
    }
}
