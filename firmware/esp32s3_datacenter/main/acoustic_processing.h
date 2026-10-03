#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define ACOUSTIC_SAMPLE_RATE_HZ 48000U
#define ACOUSTIC_WINDOW_SAMPLES 48000U
#define ACOUSTIC_MAX_BLOCK_SAMPLES 480U
#define ACOUSTIC_FULL_SCALE_CODE 8388608.0f
#define ACOUSTIC_DC_CUTOFF_HZ 5.0f

typedef enum {
    ACOUSTIC_COMPLETE = 0,
    ACOUSTIC_INCOMPLETE,
    ACOUSTIC_NOT_INITIALIZED,
    ACOUSTIC_BAD_ARGUMENT,
    ACOUSTIC_NUMERIC_ERROR,
    ACOUSTIC_CALIBRATION_UNAVAILABLE,
} acoustic_status_t;

typedef struct {
    uint32_t sample_count;
    float rms_code;
    float peak_code;
    bool rms_dbfs_valid;
    bool peak_dbfs_valid;
    float rms_dbfs;
    float peak_dbfs;
} acoustic_result_t;

typedef struct {
    bool initialized;
    bool calibration_valid;
    uint32_t window_samples;
    float calibration_offset_db;
    float dc_coefficient;
    float previous_input;
    float previous_output;
    float square_sum;
    float square_compensation;
    float peak;
} acoustic_processor_t;

acoustic_status_t acoustic_processor_init(acoustic_processor_t *processor);
acoustic_status_t acoustic_processor_reset(acoustic_processor_t *processor);
acoustic_status_t acoustic_processor_invalidate(acoustic_processor_t *processor);
acoustic_status_t acoustic_processor_process(acoustic_processor_t *processor,
                                             const int32_t *samples,
                                             size_t sample_count,
                                             acoustic_result_t *result);
acoustic_status_t acoustic_processor_set_calibration(acoustic_processor_t *processor,
                                                     bool valid,
                                                     float offset_db);
acoustic_status_t acoustic_processor_apply_calibration(
    const acoustic_processor_t *processor, float diagnostic_dbfs,
    float *calibrated_db);
