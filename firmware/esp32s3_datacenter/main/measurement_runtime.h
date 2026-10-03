#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "esp_err.h"

#include "measurement_model.h"

enum {
    MEASUREMENT_CORE_ID = 1,
    MEASUREMENT_ACOUSTIC_TASK_PRIORITY = 6,
    MEASUREMENT_ENVIRONMENT_TASK_PRIORITY = 5,
    MEASUREMENT_RESULT_QUEUE_CAPACITY = 16,
};

typedef struct {
    uint64_t sht31_a_success_count;
    uint64_t sht31_a_error_count;
    uint64_t sht31_b_success_count;
    uint64_t sht31_b_error_count;
    uint64_t inmp441_block_success_count;
    uint64_t inmp441_block_error_count;
    uint64_t acoustic_window_count;
    uint64_t result_queue_drop_count;
    uint64_t acoustic_processing_total_us;
    uint64_t max_acoustic_processing_us;
    uint64_t environment_acquisition_us;
    uint64_t max_environment_acquisition_us;
    uint32_t result_queue_high_water;
    bool sequence_exhausted;
} measurement_runtime_stats_t;

esp_err_t measurement_runtime_start(void);
const char *measurement_runtime_boot_id(void);
bool measurement_runtime_receive(measurement_event_t *event,
                                 uint32_t timeout_ms);
void measurement_runtime_get_stats(measurement_runtime_stats_t *stats);
void measurement_runtime_record_inmp441_block(uint64_t processing_us);
void measurement_runtime_record_inmp441_error(void);
bool measurement_runtime_submit_acoustic(const acoustic_result_t *result,
                                         int64_t sample_tick_us);
