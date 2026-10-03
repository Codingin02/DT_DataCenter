#include "inmp441.h"

#include "driver/i2s_std.h"
#include "esp_attr.h"
#include "esp_log.h"
#include "esp_task_wdt.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "hardware_config.h"
#include "acoustic_processing.h"
#include "inmp441_samples.h"
#include "measurement_runtime.h"

enum { DMA_DESCRIPTORS = 4, READ_TIMEOUT_MS = 50, TASK_STACK_BYTES = 3072 };

_Static_assert(INMP441_BLOCK_FRAMES % 3 == 0, "24-bit DMA frame alignment");
_Static_assert(INMP441_BLOCK_FRAMES * INMP441_FRAME_BYTES <= 4092,
               "I2S DMA descriptor byte limit");

static const char *TAG = "inmp441";
static i2s_chan_handle_t rx_channel;
static DRAM_ATTR portMUX_TYPE capture_lock = portMUX_INITIALIZER_UNLOCKED;
static DRAM_ATTR uint32_t completed_blocks;
static DRAM_ATTR bool rx_fault;
static uint32_t consumed_blocks;
static DRAM_ATTR uint8_t rx_buffer[INMP441_BLOCK_FRAMES * INMP441_FRAME_BYTES];
static DRAM_ATTR int32_t samples[INMP441_BLOCK_FRAMES];
static acoustic_processor_t acoustic_processor;
static DRAM_ATTR StaticTask_t task_state;
static DRAM_ATTR StackType_t task_stack[TASK_STACK_BYTES / sizeof(StackType_t)];

static bool IRAM_ATTR received(i2s_chan_handle_t channel,
                               i2s_event_data_t *event, void *context)
{
    (void)channel;
    (void)context;
    portENTER_CRITICAL_ISR(&capture_lock);
    if (event->size != sizeof(rx_buffer)) {
        rx_fault = true;
    }
    ++completed_blocks;
    portEXIT_CRITICAL_ISR(&capture_lock);
    return false;
}

static bool IRAM_ATTR overflowed(i2s_chan_handle_t channel,
                                 i2s_event_data_t *event, void *context)
{
    (void)channel;
    (void)event;
    (void)context;
    portENTER_CRITICAL_ISR(&capture_lock);
    rx_fault = true;
    portEXIT_CRITICAL_ISR(&capture_lock);
    return false;
}

static bool capture_overrun(void)
{
    portENTER_CRITICAL(&capture_lock);
    const bool fault = rx_fault ||
        (uint32_t)(completed_blocks - consumed_blocks) >= DMA_DESCRIPTORS;
    portEXIT_CRITICAL(&capture_lock);
    return fault;
}

static esp_err_t read_samples(void)
{
    if (capture_overrun()) {
        ESP_LOGE(TAG, "DMA overrun or invalid receive event");
        return ESP_ERR_INVALID_STATE;
    }

    size_t bytes_read = 0;
    const esp_err_t error = i2s_channel_read(rx_channel, rx_buffer,
                                            sizeof(rx_buffer), &bytes_read,
                                            READ_TIMEOUT_MS);
    if (error != ESP_OK) {
        return error;
    }
    if (bytes_read != sizeof(rx_buffer)) {
        return ESP_ERR_INVALID_SIZE;
    }
    const int64_t sample_tick_us = esp_timer_get_time();

    /* DMA may wrap while the task is copying even before its queue overflows. */
    if (capture_overrun()) {
        ESP_LOGE(TAG, "DMA overrun or invalid receive event");
        return ESP_ERR_INVALID_STATE;
    }
    ++consumed_blocks;

    const int64_t processing_started_at_us = esp_timer_get_time();
    if (!inmp441_extract_left(rx_buffer, bytes_read, samples,
                              INMP441_BLOCK_FRAMES)) {
        return ESP_ERR_INVALID_SIZE;
    }

    acoustic_result_t result;
    const acoustic_status_t status = acoustic_processor_process(
        &acoustic_processor, samples, INMP441_BLOCK_FRAMES, &result);
    if (status != ACOUSTIC_COMPLETE && status != ACOUSTIC_INCOMPLETE) {
        return ESP_ERR_INVALID_STATE;
    }
    measurement_runtime_record_inmp441_block(measurement_elapsed_us(
        processing_started_at_us, esp_timer_get_time()));
    if (status == ACOUSTIC_COMPLETE) {
        measurement_runtime_submit_acoustic(&result, sample_tick_us);
    }
    return ESP_OK;
}

static void acquire(void *argument)
{
    (void)argument;
    esp_err_t error = esp_task_wdt_add(NULL);
    if (error == ESP_OK) {
        while ((error = read_samples()) == ESP_OK) {
            error = esp_task_wdt_reset();
            if (error != ESP_OK) {
                break;
            }
        }
        esp_task_wdt_delete(NULL);
    }

    measurement_runtime_record_inmp441_error();
    ESP_LOGE(TAG, "RX stopped: %s", esp_err_to_name(error));
    acoustic_processor_invalidate(&acoustic_processor);
    const esp_err_t disable_error = i2s_channel_disable(rx_channel);
    if (disable_error != ESP_OK) {
        ESP_LOGE(TAG, "RX disable failed: %s", esp_err_to_name(disable_error));
    }
    const esp_err_t delete_error = i2s_del_channel(rx_channel);
    if (delete_error != ESP_OK) {
        ESP_LOGE(TAG, "RX delete failed: %s", esp_err_to_name(delete_error));
    }
    rx_channel = NULL;
    vTaskDelete(NULL);
}

esp_err_t inmp441_start(void)
{
    if (rx_channel != NULL) {
        return ESP_ERR_INVALID_STATE;
    }
    if (acoustic_processor_init(&acoustic_processor) != ACOUSTIC_INCOMPLETE) {
        return ESP_ERR_INVALID_STATE;
    }
    portENTER_CRITICAL(&capture_lock);
    completed_blocks = 0;
    consumed_blocks = 0;
    rx_fault = false;
    portEXIT_CRITICAL(&capture_lock);

    i2s_chan_config_t channel_config = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER);
    channel_config.dma_desc_num = DMA_DESCRIPTORS;
    channel_config.dma_frame_num = INMP441_BLOCK_FRAMES;

    esp_err_t error = i2s_new_channel(&channel_config, NULL, &rx_channel);
    if (error != ESP_OK) {
        return error;
    }

    i2s_std_config_t config = {
        .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(INMP441_SAMPLE_RATE_HZ),
        .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_24BIT,
                                                       I2S_SLOT_MODE_STEREO),
        .gpio_cfg = {
            .mclk = I2S_GPIO_UNUSED,
            .bclk = INMP441_BCLK_GPIO,
            .ws = INMP441_WS_GPIO,
            .dout = I2S_GPIO_UNUSED,
            .din = INMP441_DIN_GPIO,
        },
    };
    config.clk_cfg.mclk_multiple = I2S_MCLK_MULTIPLE_384;
    config.slot_cfg.slot_bit_width = I2S_SLOT_BIT_WIDTH_32BIT;
    config.slot_cfg.ws_width = 32;

    error = i2s_channel_init_std_mode(rx_channel, &config);
    if (error != ESP_OK) {
        goto fail;
    }
    const i2s_event_callbacks_t callbacks = {
        .on_recv = received,
        .on_recv_q_ovf = overflowed,
    };
    error = i2s_channel_register_event_callback(rx_channel, &callbacks, NULL);
    if (error != ESP_OK) {
        goto fail;
    }
    error = i2s_channel_enable(rx_channel);
    if (error != ESP_OK) {
        goto fail;
    }
    if (xTaskCreateStaticPinnedToCore(
            acquire, "inmp441", sizeof(task_stack), NULL,
            MEASUREMENT_ACOUSTIC_TASK_PRIORITY, task_stack, &task_state,
            MEASUREMENT_CORE_ID) == NULL) {
        i2s_channel_disable(rx_channel);
        error = ESP_ERR_NO_MEM;
        goto fail;
    }
    return ESP_OK;

fail:
    i2s_del_channel(rx_channel);
    rx_channel = NULL;
    return error;
}
