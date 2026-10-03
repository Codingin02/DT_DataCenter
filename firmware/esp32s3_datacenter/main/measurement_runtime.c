#include "measurement_runtime.h"

#include <inttypes.h>
#include <string.h>

#include "bootloader_random.h"
#include "driver/i2c_master.h"
#include "esp_attr.h"
#include "esp_log.h"
#include "esp_random.h"
#include "esp_task_wdt.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"

#include "hardware_config.h"
#include "inmp441.h"
#include "sht31.h"

enum { ENVIRONMENT_TASK_STACK_BYTES = 3072 };

typedef struct {
    const char *name;
    measurement_source_t source;
    i2c_port_num_t port;
    gpio_num_t sda_gpio;
    gpio_num_t scl_gpio;
    i2c_master_bus_handle_t bus;
    sht31_sensor_t sensor;
    bool available;
} environmental_source_t;

static const char *TAG = "measurement";
static DRAM_ATTR portMUX_TYPE runtime_lock = portMUX_INITIALIZER_UNLOCKED;
static measurement_identity_t identity;
static measurement_runtime_stats_t runtime_stats;
static QueueHandle_t result_queue;
static DRAM_ATTR StaticQueue_t result_queue_state;
static DRAM_ATTR uint8_t result_queue_storage[
    MEASUREMENT_RESULT_QUEUE_CAPACITY * sizeof(measurement_event_t)];
static DRAM_ATTR StaticTask_t environment_task_state;
static DRAM_ATTR StackType_t environment_task_stack[ENVIRONMENT_TASK_STACK_BYTES];
static environmental_source_t sources[] = {
    {
        .name = "sensor_a",
        .source = MEASUREMENT_SOURCE_SHT31_A,
        .port = SHT31_SENSOR_A_I2C_PORT,
        .sda_gpio = SHT31_SENSOR_A_SDA_GPIO,
        .scl_gpio = SHT31_SENSOR_A_SCL_GPIO,
    },
    {
        .name = "sensor_b",
        .source = MEASUREMENT_SOURCE_SHT31_B,
        .port = SHT31_SENSOR_B_I2C_PORT,
        .sda_gpio = SHT31_SENSOR_B_SDA_GPIO,
        .scl_gpio = SHT31_SENSOR_B_SCL_GPIO,
    },
};

_Static_assert(sizeof(result_queue_storage) ==
                   MEASUREMENT_RESULT_QUEUE_CAPACITY * sizeof(measurement_event_t),
               "result queue payload storage");

static uint64_t *success_counter(measurement_source_t source)
{
    return source == MEASUREMENT_SOURCE_SHT31_A
        ? &runtime_stats.sht31_a_success_count
        : &runtime_stats.sht31_b_success_count;
}

static uint64_t *error_counter(measurement_source_t source)
{
    return source == MEASUREMENT_SOURCE_SHT31_A
        ? &runtime_stats.sht31_a_error_count
        : &runtime_stats.sht31_b_error_count;
}

static void increment(uint64_t *counter)
{
    taskENTER_CRITICAL(&runtime_lock);
    measurement_counter_increment(counter);
    taskEXIT_CRITICAL(&runtime_lock);
}

static void update_duration(uint64_t duration_us, uint64_t *latest,
                            uint64_t *maximum)
{
    taskENTER_CRITICAL(&runtime_lock);
    *latest = duration_us;
    if (duration_us > *maximum) {
        *maximum = duration_us;
    }
    taskEXIT_CRITICAL(&runtime_lock);
}

static bool queue_event(const measurement_event_t *event)
{
    if (xQueueSend(result_queue, event, 0) != pdPASS) {
        taskENTER_CRITICAL(&runtime_lock);
        measurement_counter_increment(&runtime_stats.result_queue_drop_count);
        const uint64_t drops = runtime_stats.result_queue_drop_count;
        taskEXIT_CRITICAL(&runtime_lock);
        if ((drops & (drops - 1U)) == 0U) {
            ESP_LOGW(TAG, "result queue full; dropped=%" PRIu64, drops);
        }
        return false;
    }

    const UBaseType_t depth = uxQueueMessagesWaiting(result_queue);
    taskENTER_CRITICAL(&runtime_lock);
    if (depth > runtime_stats.result_queue_high_water) {
        runtime_stats.result_queue_high_water = depth;
    }
    taskEXIT_CRITICAL(&runtime_lock);
    return true;
}

static bool create_environment_event(measurement_source_t source,
                                     const sht31_reading_t *reading,
                                     int64_t sample_tick_us,
                                     measurement_event_t *event)
{
    taskENTER_CRITICAL(&runtime_lock);
    const bool created = measurement_event_environment(
        &identity, source, reading->raw_temperature, reading->raw_humidity,
        reading->temperature_c, reading->humidity_rh, sample_tick_us, event);
    if (identity.sequence_exhausted) {
        runtime_stats.sequence_exhausted = true;
    }
    taskEXIT_CRITICAL(&runtime_lock);
    return created;
}

static void initialize_source(environmental_source_t *source)
{
    const i2c_master_bus_config_t bus_config = {
        .i2c_port = source->port,
        .sda_io_num = source->sda_gpio,
        .scl_io_num = source->scl_gpio,
        .clk_source = I2C_CLK_SRC_DEFAULT,
        .glitch_ignore_cnt = 7,
    };

    esp_err_t error = i2c_new_master_bus(&bus_config, &source->bus);
    if (error != ESP_OK) {
        ESP_LOGE(TAG, "%s I2C initialization failed: %s", source->name,
                 esp_err_to_name(error));
        increment(error_counter(source->source));
        return;
    }

    const sht31_status_t status = sht31_sensor_init(&source->sensor, source->bus);
    if (status != SHT31_OK) {
        ESP_LOGE(TAG, "%s SHT31 initialization failed: %s", source->name,
                 sht31_status_name(status));
        increment(error_counter(source->source));
        i2c_del_master_bus(source->bus);
        source->bus = NULL;
        return;
    }

    source->available = true;
    ESP_LOGI(TAG, "%s SHT31 ready at 0x%02x", source->name,
             source->sensor.address);
}

static void acquire_source(environmental_source_t *source)
{
    if (!source->available) {
        return;
    }

    sht31_reading_t reading = {.quality = SHT31_QUALITY_UNKNOWN};
    const sht31_status_t status = sht31_sensor_measure(&source->sensor, &reading);
    if (status != SHT31_OK) {
        increment(error_counter(source->source));
        ESP_LOGW(TAG, "%s SHT31 acquisition failed: %s", source->name,
                 sht31_status_name(status));
        return;
    }

    increment(success_counter(source->source));
    measurement_event_t event;
    if (!create_environment_event(source->source, &reading,
                                  esp_timer_get_time(), &event)) {
        ESP_LOGE(TAG, "environment event identity exhausted");
        return;
    }
    queue_event(&event);
}

static void environment_task(void *argument)
{
    (void)argument;
    const esp_err_t watchdog_error = esp_task_wdt_add(NULL);
    if (watchdog_error != ESP_OK) {
        ESP_LOGE(TAG, "environment watchdog subscription failed: %s",
                 esp_err_to_name(watchdog_error));
        vTaskDelete(NULL);
        return;
    }

    for (size_t index = 0; index < sizeof(sources) / sizeof(sources[0]); ++index) {
        initialize_source(&sources[index]);
    }

    TickType_t next_acquisition = xTaskGetTickCount();
    for (;;) {
        const int64_t started_at_us = esp_timer_get_time();
        for (size_t index = 0; index < sizeof(sources) / sizeof(sources[0]);
             ++index) {
            acquire_source(&sources[index]);
        }
        const uint64_t duration_us = measurement_elapsed_us(
            started_at_us, esp_timer_get_time());
        update_duration(duration_us, &runtime_stats.environment_acquisition_us,
                        &runtime_stats.max_environment_acquisition_us);
        if (esp_task_wdt_reset() != ESP_OK) {
            ESP_LOGE(TAG, "environment watchdog reset failed");
            esp_task_wdt_delete(NULL);
            vTaskDelete(NULL);
            return;
        }
        xTaskDelayUntil(&next_acquisition,
                        pdMS_TO_TICKS(SHT31_MEASUREMENT_PERIOD_MS));
    }
}

esp_err_t measurement_runtime_start(void)
{
    if (result_queue != NULL) {
        return ESP_ERR_INVALID_STATE;
    }

    uint8_t entropy[MEASUREMENT_BOOT_RANDOM_BYTES];
    bootloader_random_enable();
    esp_fill_random(entropy, sizeof(entropy));
    bootloader_random_disable();

    memset(&runtime_stats, 0, sizeof(runtime_stats));
    measurement_identity_init(&identity, entropy);
    memset(entropy, 0, sizeof(entropy));

    result_queue = xQueueCreateStatic(
        MEASUREMENT_RESULT_QUEUE_CAPACITY, sizeof(measurement_event_t),
        result_queue_storage, &result_queue_state);
    if (result_queue == NULL) {
        return ESP_ERR_NO_MEM;
    }

    TaskHandle_t environment = xTaskCreateStaticPinnedToCore(
        environment_task, "environment", sizeof(environment_task_stack), NULL,
        MEASUREMENT_ENVIRONMENT_TASK_PRIORITY, environment_task_stack,
        &environment_task_state, MEASUREMENT_CORE_ID);
    const esp_err_t microphone_error = inmp441_start();
    if (microphone_error != ESP_OK) {
        measurement_runtime_record_inmp441_error();
        ESP_LOGE(TAG, "INMP441 initialization failed: %s",
                 esp_err_to_name(microphone_error));
    }
    if (environment == NULL && microphone_error != ESP_OK) {
        return ESP_ERR_NO_MEM;
    }

    ESP_LOGI(TAG, "boot_id=%s queue_capacity=%u event_bytes=%u", identity.boot_id,
             MEASUREMENT_RESULT_QUEUE_CAPACITY,
             (unsigned)sizeof(measurement_event_t));
    return ESP_OK;
}

const char *measurement_runtime_boot_id(void)
{
    return result_queue == NULL ? NULL : identity.boot_id;
}

bool measurement_runtime_receive(measurement_event_t *event,
                                 uint32_t timeout_ms)
{
    return event != NULL && result_queue != NULL &&
        xQueueReceive(result_queue, event, pdMS_TO_TICKS(timeout_ms)) == pdPASS;
}

void measurement_runtime_get_stats(measurement_runtime_stats_t *stats)
{
    if (stats == NULL) {
        return;
    }
    taskENTER_CRITICAL(&runtime_lock);
    *stats = runtime_stats;
    taskEXIT_CRITICAL(&runtime_lock);
}

void measurement_runtime_record_inmp441_block(uint64_t processing_us)
{
    taskENTER_CRITICAL(&runtime_lock);
    measurement_counter_increment(&runtime_stats.inmp441_block_success_count);
    measurement_counter_add(&runtime_stats.acoustic_processing_total_us,
                            processing_us);
    if (processing_us > runtime_stats.max_acoustic_processing_us) {
        runtime_stats.max_acoustic_processing_us = processing_us;
    }
    taskEXIT_CRITICAL(&runtime_lock);
}

void measurement_runtime_record_inmp441_error(void)
{
    increment(&runtime_stats.inmp441_block_error_count);
}

bool measurement_runtime_submit_acoustic(const acoustic_result_t *result,
                                         int64_t sample_tick_us)
{
    measurement_event_t event;
    taskENTER_CRITICAL(&runtime_lock);
    const bool created = measurement_event_acoustic(
        &identity, result, sample_tick_us, &event);
    if (identity.sequence_exhausted) {
        runtime_stats.sequence_exhausted = true;
    }
    if (created) {
        measurement_counter_increment(&runtime_stats.acoustic_window_count);
    }
    taskEXIT_CRITICAL(&runtime_lock);

    if (!created) {
        ESP_LOGE(TAG, "acoustic event identity exhausted or invalid");
        return false;
    }
    return queue_event(&event);
}
