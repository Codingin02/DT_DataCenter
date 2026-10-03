#include "acoustic_processing.h"

#include <math.h>
#include <string.h>

static const float TWO_PI = 6.2831853071795864769f;

static void reset_signal_state(acoustic_processor_t *processor)
{
    processor->window_samples = 0;
    processor->previous_input = 0.0f;
    processor->previous_output = 0.0f;
    processor->square_sum = 0.0f;
    processor->square_compensation = 0.0f;
    processor->peak = 0.0f;
}

acoustic_status_t acoustic_processor_init(acoustic_processor_t *processor)
{
    if (processor == NULL) {
        return ACOUSTIC_BAD_ARGUMENT;
    }

    memset(processor, 0, sizeof(*processor));
    processor->dc_coefficient =
        expf(-TWO_PI * ACOUSTIC_DC_CUTOFF_HZ / ACOUSTIC_SAMPLE_RATE_HZ);
    processor->initialized = true;
    return ACOUSTIC_INCOMPLETE;
}

acoustic_status_t acoustic_processor_reset(acoustic_processor_t *processor)
{
    if (processor == NULL) {
        return ACOUSTIC_BAD_ARGUMENT;
    }
    if (!processor->initialized) {
        return ACOUSTIC_NOT_INITIALIZED;
    }

    reset_signal_state(processor);
    return ACOUSTIC_INCOMPLETE;
}

acoustic_status_t acoustic_processor_invalidate(acoustic_processor_t *processor)
{
    return acoustic_processor_reset(processor);
}

static void add_square(acoustic_processor_t *processor, float square)
{
    const float adjusted = square - processor->square_compensation;
    const float sum = processor->square_sum + adjusted;
    processor->square_compensation =
        (sum - processor->square_sum) - adjusted;
    processor->square_sum = sum;
}

static acoustic_status_t complete_window(acoustic_processor_t *processor,
                                         acoustic_result_t *result)
{
    const float mean_square = processor->square_sum / ACOUSTIC_WINDOW_SAMPLES;
    const float rms = sqrtf(mean_square);
    const float peak = processor->peak;
    if (!isfinite(rms) || !isfinite(peak)) {
        reset_signal_state(processor);
        return ACOUSTIC_NUMERIC_ERROR;
    }

    acoustic_result_t completed = {
        .sample_count = ACOUSTIC_WINDOW_SAMPLES,
        .rms_code = rms * ACOUSTIC_FULL_SCALE_CODE,
        .peak_code = peak * ACOUSTIC_FULL_SCALE_CODE,
        .rms_dbfs_valid = rms > 0.0f,
        .peak_dbfs_valid = peak > 0.0f,
    };
    if (completed.rms_dbfs_valid) {
        completed.rms_dbfs = 20.0f * log10f(rms);
    }
    if (completed.peak_dbfs_valid) {
        completed.peak_dbfs = 20.0f * log10f(peak);
    }

    *result = completed;
    processor->window_samples = 0;
    processor->square_sum = 0.0f;
    processor->square_compensation = 0.0f;
    processor->peak = 0.0f;
    return ACOUSTIC_COMPLETE;
}

acoustic_status_t acoustic_processor_process(acoustic_processor_t *processor,
                                             const int32_t *samples,
                                             size_t sample_count,
                                             acoustic_result_t *result)
{
    if (processor == NULL) {
        return ACOUSTIC_BAD_ARGUMENT;
    }
    if (!processor->initialized) {
        return ACOUSTIC_NOT_INITIALIZED;
    }
    if (samples == NULL || result == NULL || sample_count == 0 ||
        sample_count > ACOUSTIC_MAX_BLOCK_SAMPLES) {
        return ACOUSTIC_BAD_ARGUMENT;
    }
    for (size_t i = 0; i < sample_count; ++i) {
        if (samples[i] < -8388608 || samples[i] > 8388607) {
            acoustic_processor_invalidate(processor);
            return ACOUSTIC_BAD_ARGUMENT;
        }
    }

    acoustic_status_t status = ACOUSTIC_INCOMPLETE;
    for (size_t i = 0; i < sample_count; ++i) {
        const float input = (float)samples[i] / ACOUSTIC_FULL_SCALE_CODE;
        const float output = input - processor->previous_input +
            processor->dc_coefficient * processor->previous_output;
        processor->previous_input = input;
        processor->previous_output = output;

        const float magnitude = fabsf(output);
        if (magnitude > processor->peak) {
            processor->peak = magnitude;
        }
        add_square(processor, output * output);
        ++processor->window_samples;

        if (processor->window_samples == ACOUSTIC_WINDOW_SAMPLES) {
            status = complete_window(processor, result);
            if (status != ACOUSTIC_COMPLETE) {
                return status;
            }
        }
    }
    return status;
}

acoustic_status_t acoustic_processor_set_calibration(acoustic_processor_t *processor,
                                                     bool valid,
                                                     float offset_db)
{
    if (processor == NULL) {
        return ACOUSTIC_BAD_ARGUMENT;
    }
    if (!processor->initialized) {
        return ACOUSTIC_NOT_INITIALIZED;
    }
    if (valid && !isfinite(offset_db)) {
        return ACOUSTIC_BAD_ARGUMENT;
    }

    processor->calibration_valid = valid;
    processor->calibration_offset_db = valid ? offset_db : 0.0f;
    return ACOUSTIC_INCOMPLETE;
}

acoustic_status_t acoustic_processor_apply_calibration(
    const acoustic_processor_t *processor, float diagnostic_dbfs,
    float *calibrated_db)
{
    if (processor == NULL || calibrated_db == NULL || !isfinite(diagnostic_dbfs)) {
        return ACOUSTIC_BAD_ARGUMENT;
    }
    if (!processor->initialized) {
        return ACOUSTIC_NOT_INITIALIZED;
    }
    if (!processor->calibration_valid) {
        return ACOUSTIC_CALIBRATION_UNAVAILABLE;
    }

    *calibrated_db = diagnostic_dbfs + processor->calibration_offset_db;
    return ACOUSTIC_COMPLETE;
}
