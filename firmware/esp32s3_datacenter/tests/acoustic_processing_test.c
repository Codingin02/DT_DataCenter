#include "acoustic_processing.h"

#include <math.h>
#include <string.h>

#define CHECK(condition) do { if (!(condition)) return __LINE__; } while (0)

static const float TWO_PI = 6.2831853071795864769f;

typedef struct {
    double previous_input;
    double previous_output;
    double square_sum;
    double peak;
    uint32_t sample_count;
} reference_processor_t;

typedef struct {
    double rms_code;
    double peak_code;
    double rms_dbfs;
    double peak_dbfs;
} reference_result_t;

static bool near(float actual, float expected, float tolerance)
{
    return fabsf(actual - expected) <= tolerance;
}

static int32_t sine_sample(uint32_t index, int32_t amplitude)
{
    const float value = amplitude * sinf(TWO_PI * (float)(index % 48U) / 48.0f);
    return (int32_t)(value >= 0.0f ? value + 0.5f : value - 0.5f);
}

static bool reference_process(reference_processor_t *processor,
                              const int32_t *samples, uint32_t sample_count,
                              reference_result_t *result)
{
    const double coefficient =
        exp(-2.0 * 3.14159265358979323846 * ACOUSTIC_DC_CUTOFF_HZ /
            ACOUSTIC_SAMPLE_RATE_HZ);
    for (uint32_t i = 0; i < sample_count; ++i) {
        const double input = samples[i] / (double)ACOUSTIC_FULL_SCALE_CODE;
        const double output = input - processor->previous_input +
            coefficient * processor->previous_output;
        processor->previous_input = input;
        processor->previous_output = output;
        processor->square_sum += output * output;
        if (fabs(output) > processor->peak) {
            processor->peak = fabs(output);
        }
        ++processor->sample_count;
    }
    if (processor->sample_count != ACOUSTIC_WINDOW_SAMPLES) {
        return false;
    }

    const double rms = sqrt(processor->square_sum / ACOUSTIC_WINDOW_SAMPLES);
    result->rms_code = rms * ACOUSTIC_FULL_SCALE_CODE;
    result->peak_code = processor->peak * ACOUSTIC_FULL_SCALE_CODE;
    result->rms_dbfs = 20.0 * log10(rms);
    result->peak_dbfs = 20.0 * log10(processor->peak);
    processor->square_sum = 0.0;
    processor->peak = 0.0;
    processor->sample_count = 0;
    return true;
}

static int feed_sine_with_reference(acoustic_processor_t *processor,
                                    reference_processor_t *reference,
                                    int32_t amplitude,
                                    acoustic_result_t *result,
                                    reference_result_t *reference_result)
{
    int32_t samples[ACOUSTIC_MAX_BLOCK_SAMPLES];
    int completed = 0;
    for (uint32_t index = 0; index < ACOUSTIC_WINDOW_SAMPLES;
         index += ACOUSTIC_MAX_BLOCK_SAMPLES) {
        for (uint32_t i = 0; i < ACOUSTIC_MAX_BLOCK_SAMPLES; ++i) {
            samples[i] = sine_sample(index + i, amplitude);
        }
        const acoustic_status_t status = acoustic_processor_process(
            processor, samples, ACOUSTIC_MAX_BLOCK_SAMPLES, result);
        if (status == ACOUSTIC_COMPLETE) {
            ++completed;
        } else if (status != ACOUSTIC_INCOMPLETE) {
            return -1;
        }
        if (reference_process(reference, samples, ACOUSTIC_MAX_BLOCK_SAMPLES,
                              reference_result) !=
            (index + ACOUSTIC_MAX_BLOCK_SAMPLES == ACOUSTIC_WINDOW_SAMPLES)) {
            return -1;
        }
    }
    return completed;
}

static double quantized_sine_rms(int32_t amplitude)
{
    double square_sum = 0.0;
    for (uint32_t i = 0; i < 48; ++i) {
        const double sample = sine_sample(i, amplitude);
        square_sum += sample * sample;
    }
    return sqrt(square_sum / 48.0);
}

static int feed_constant(acoustic_processor_t *processor, int32_t value,
                         uint32_t total, uint32_t block_size,
                         acoustic_result_t *last_result)
{
    int32_t samples[ACOUSTIC_MAX_BLOCK_SAMPLES];
    for (uint32_t i = 0; i < block_size; ++i) {
        samples[i] = value;
    }

    int completed = 0;
    while (total > 0) {
        const uint32_t count = total < block_size ? total : block_size;
        const acoustic_status_t status = acoustic_processor_process(
            processor, samples, count, last_result);
        if (status == ACOUSTIC_COMPLETE) {
            ++completed;
        } else if (status != ACOUSTIC_INCOMPLETE) {
            return -1;
        }
        total -= count;
    }
    return completed;
}

static int feed_sine(acoustic_processor_t *processor, int32_t amplitude,
                     uint32_t total, uint32_t block_size,
                     acoustic_result_t *last_result)
{
    int32_t samples[ACOUSTIC_MAX_BLOCK_SAMPLES];
    uint32_t index = 0;
    int completed = 0;
    while (index < total) {
        const uint32_t remaining = total - index;
        const uint32_t count = remaining < block_size ? remaining : block_size;
        for (uint32_t i = 0; i < count; ++i) {
            samples[i] = sine_sample(index + i, amplitude);
        }
        const acoustic_status_t status = acoustic_processor_process(
            processor, samples, count, last_result);
        if (status == ACOUSTIC_COMPLETE) {
            ++completed;
        } else if (status != ACOUSTIC_INCOMPLETE) {
            return -1;
        }
        index += count;
    }
    return completed;
}

int processor_size(void)
{
    return (int)sizeof(acoustic_processor_t);
}

int main(void)
{
    _Static_assert(sizeof(acoustic_result_t) <= 32,
                   "result must not retain an audio block");

    acoustic_processor_t processor = {0};
    acoustic_result_t result = {0};
    int32_t sample = 0;
    CHECK(acoustic_processor_process(&processor, &sample, 1, &result) ==
          ACOUSTIC_NOT_INITIALIZED);
    CHECK(acoustic_processor_init(NULL) == ACOUSTIC_BAD_ARGUMENT);
    CHECK(acoustic_processor_init(&processor) == ACOUSTIC_INCOMPLETE);
    CHECK(processor.initialized && !processor.calibration_valid);
    CHECK(processor.window_samples == 0 && processor.previous_input == 0.0f &&
          processor.previous_output == 0.0f && processor.square_sum == 0.0f &&
          processor.peak == 0.0f);
    CHECK(near(processor.dc_coefficient, 0.99934572f, 0.0000001f));

    CHECK(feed_constant(&processor, 0, ACOUSTIC_WINDOW_SAMPLES, 480, &result) == 1);
    CHECK(result.sample_count == ACOUSTIC_WINDOW_SAMPLES);
    CHECK(result.rms_code == 0.0f && result.peak_code == 0.0f);
    CHECK(!result.rms_dbfs_valid && !result.peak_dbfs_valid);
    CHECK(isfinite(result.rms_dbfs) && isfinite(result.peak_dbfs));

    CHECK(acoustic_processor_reset(&processor) == ACOUSTIC_INCOMPLETE);
    CHECK(feed_constant(&processor, 1000000, ACOUSTIC_WINDOW_SAMPLES, 480,
                        &result) == 1);
    CHECK(fabsf(processor.previous_output) < 0.000001f);

    CHECK(acoustic_processor_reset(&processor) == ACOUSTIC_INCOMPLETE);
    sample = 4000000;
    CHECK(acoustic_processor_process(&processor, &sample, 1, &result) ==
          ACOUSTIC_INCOMPLETE);
    CHECK(feed_constant(&processor, 0, ACOUSTIC_WINDOW_SAMPLES - 1, 480,
                        &result) == 1);
    CHECK(near(result.peak_code, 4000000.0f, 1.0f));

    CHECK(acoustic_processor_reset(&processor) == ACOUSTIC_INCOMPLETE);
    sample = -5000000;
    CHECK(acoustic_processor_process(&processor, &sample, 1, &result) ==
          ACOUSTIC_INCOMPLETE);
    CHECK(feed_constant(&processor, 0, ACOUSTIC_WINDOW_SAMPLES - 1, 480,
                        &result) == 1);
    CHECK(near(result.peak_code, 5000000.0f, 1.0f));

    CHECK(acoustic_processor_reset(&processor) == ACOUSTIC_INCOMPLETE);
    sample = -8388608;
    CHECK(acoustic_processor_process(&processor, &sample, 1, &result) ==
          ACOUSTIC_INCOMPLETE);
    CHECK(feed_constant(&processor, 0, ACOUSTIC_WINDOW_SAMPLES - 1, 480,
                        &result) == 1);
    CHECK(result.peak_code == ACOUSTIC_FULL_SCALE_CODE);

    acoustic_result_t full_sine;
    acoustic_result_t steady_sine;
    reference_result_t startup_reference;
    reference_result_t steady_reference;
    reference_processor_t reference = {0};
    CHECK(acoustic_processor_reset(&processor) == ACOUSTIC_INCOMPLETE);
    CHECK(feed_sine_with_reference(&processor, &reference, 8380000,
                                   &full_sine, &startup_reference) == 1);
    CHECK(near(full_sine.rms_code, (float)startup_reference.rms_code, 32.0f));
    CHECK(near(full_sine.peak_code, (float)startup_reference.peak_code, 32.0f));
    CHECK(near(full_sine.rms_dbfs, (float)startup_reference.rms_dbfs, 0.0001f));
    CHECK(near(full_sine.peak_dbfs, (float)startup_reference.peak_dbfs, 0.0001f));
    CHECK(full_sine.rms_dbfs_valid && full_sine.peak_dbfs_valid);

    CHECK(feed_sine_with_reference(&processor, &reference, 8380000,
                                   &steady_sine, &steady_reference) == 1);
    const double omega = 2.0 * 3.14159265358979323846 * 1000.0 /
        ACOUSTIC_SAMPLE_RATE_HZ;
    const double coefficient =
        exp(-2.0 * 3.14159265358979323846 * ACOUSTIC_DC_CUTOFF_HZ /
            ACOUSTIC_SAMPLE_RATE_HZ);
    const double filter_gain = sqrt((2.0 - 2.0 * cos(omega)) /
        (1.0 + coefficient * coefficient - 2.0 * coefficient * cos(omega)));
    const double analytical_rms = quantized_sine_rms(8380000) * filter_gain;
    const double analytical_peak = 8380000.0 * filter_gain;
    const double analytical_rms_dbfs =
        20.0 * log10(analytical_rms / ACOUSTIC_FULL_SCALE_CODE);
    const double analytical_peak_dbfs =
        20.0 * log10(analytical_peak / ACOUSTIC_FULL_SCALE_CODE);
    CHECK(near(steady_sine.rms_code, (float)steady_reference.rms_code, 32.0f));
    CHECK(near(steady_sine.peak_code, (float)steady_reference.peak_code, 32.0f));
    CHECK(near(steady_sine.rms_code, (float)analytical_rms, 32.0f));
    CHECK(near(steady_sine.peak_code, (float)analytical_peak, 128.0f));
    CHECK(near(steady_sine.rms_dbfs, (float)analytical_rms_dbfs, 0.0001f));
    CHECK(near(steady_sine.peak_dbfs, (float)analytical_peak_dbfs, 0.0002f));

    acoustic_result_t half_sine;
    CHECK(acoustic_processor_reset(&processor) == ACOUSTIC_INCOMPLETE);
    CHECK(feed_sine(&processor, 4190000, ACOUSTIC_WINDOW_SAMPLES, 137,
                    &half_sine) == 1);
    CHECK(near(half_sine.rms_dbfs - full_sine.rms_dbfs, -6.0206f, 0.002f));
    CHECK(half_sine.rms_dbfs < full_sine.rms_dbfs);

    CHECK(acoustic_processor_reset(&processor) == ACOUSTIC_INCOMPLETE);
    CHECK(feed_constant(&processor, 0, ACOUSTIC_WINDOW_SAMPLES - 1, 479,
                        &result) == 0);
    CHECK(processor.window_samples == ACOUSTIC_WINDOW_SAMPLES - 1);
    CHECK(acoustic_processor_process(&processor, &sample, 1, &result) ==
          ACOUSTIC_COMPLETE);

    CHECK(acoustic_processor_reset(&processor) == ACOUSTIC_INCOMPLETE);
    CHECK(feed_constant(&processor, 0, 2 * ACOUSTIC_WINDOW_SAMPLES, 480,
                        &result) == 2);

    CHECK(acoustic_processor_reset(&processor) == ACOUSTIC_INCOMPLETE);
    CHECK(feed_sine(&processor, 8380000, ACOUSTIC_WINDOW_SAMPLES, 480,
                    &result) == 1);
    const float first_peak = result.peak_code;
    CHECK(feed_sine(&processor, 2095000, ACOUSTIC_WINDOW_SAMPLES, 480,
                    &result) == 1);
    CHECK(result.peak_code < first_peak * 0.26f);
    CHECK(result.rms_code < full_sine.rms_code * 0.26f);

    acoustic_processor_t contiguous;
    acoustic_processor_t split;
    acoustic_result_t contiguous_result;
    acoustic_result_t split_result;
    CHECK(acoustic_processor_init(&contiguous) == ACOUSTIC_INCOMPLETE);
    CHECK(acoustic_processor_init(&split) == ACOUSTIC_INCOMPLETE);
    CHECK(feed_sine(&contiguous, 6000000, ACOUSTIC_WINDOW_SAMPLES, 480,
                    &contiguous_result) == 1);
    CHECK(feed_sine(&split, 6000000, ACOUSTIC_WINDOW_SAMPLES, 137,
                    &split_result) == 1);
    CHECK(near(contiguous_result.rms_dbfs, split_result.rms_dbfs, 0.00001f));
    CHECK(near(contiguous_result.peak_dbfs, split_result.peak_dbfs, 0.00001f));
    CHECK(near(contiguous.previous_output, split.previous_output, 0.0000001f));

    CHECK(feed_constant(&processor, 123456, 480, 480, &result) == 0);
    CHECK(processor.window_samples == 480 && processor.previous_input != 0.0f);
    CHECK(acoustic_processor_reset(&processor) == ACOUSTIC_INCOMPLETE);
    CHECK(processor.window_samples == 0 && processor.previous_input == 0.0f &&
          processor.previous_output == 0.0f && processor.square_sum == 0.0f &&
          processor.peak == 0.0f);

    CHECK(feed_constant(&processor, 123456, 480, 480, &result) == 0);
    CHECK(acoustic_processor_invalidate(&processor) == ACOUSTIC_INCOMPLETE);
    CHECK(processor.window_samples == 0 && processor.previous_output == 0.0f);
    const acoustic_processor_t before_bad_argument = processor;
    CHECK(acoustic_processor_process(&processor, NULL, 1, &result) ==
          ACOUSTIC_BAD_ARGUMENT);
    CHECK(memcmp(&processor, &before_bad_argument, sizeof(processor)) == 0);
    sample = 8388608;
    CHECK(acoustic_processor_process(&processor, &sample, 1, &result) ==
          ACOUSTIC_BAD_ARGUMENT);
    CHECK(processor.window_samples == 0 && processor.previous_output == 0.0f);

    float calibrated = 123.0f;
    CHECK(acoustic_processor_apply_calibration(&processor, -20.0f, &calibrated) ==
          ACOUSTIC_CALIBRATION_UNAVAILABLE);
    CHECK(calibrated == 123.0f);
    CHECK(acoustic_processor_set_calibration(&processor, true, 113.5f) ==
          ACOUSTIC_INCOMPLETE);
    CHECK(acoustic_processor_apply_calibration(&processor, -20.0f, &calibrated) ==
          ACOUSTIC_COMPLETE);
    CHECK(calibrated == 93.5f);
    CHECK(acoustic_processor_set_calibration(&processor, false, 999.0f) ==
          ACOUSTIC_INCOMPLETE);
    CHECK(!processor.calibration_valid && processor.calibration_offset_db == 0.0f);

    /* Golden acoustic test vectors:
     * State 1: amplitude 5913726 -> RMS ≈ -7.88 dBFS, Peak ≈ -3.04 dBFS
     * State 2: amplitude 2956863 -> RMS ≈ -13.90 dBFS, Peak ≈ -9.06 dBFS
     */
    CHECK(acoustic_processor_reset(&processor) == ACOUSTIC_INCOMPLETE);
    int32_t state1_pat[8] = {
        5913726, -5913726, 5913726 / 2, -(5913726 / 2),
        0, 5913726 / 4, -(5913726 / 4), 0
    };
    int32_t block_buf[ACOUSTIC_MAX_BLOCK_SAMPLES];
    for (size_t i = 0; i < ACOUSTIC_MAX_BLOCK_SAMPLES; ++i) {
        block_buf[i] = state1_pat[i % 8];
    }
    acoustic_result_t golden_res;
    for (size_t w = 0; w < ACOUSTIC_WINDOW_SAMPLES / ACOUSTIC_MAX_BLOCK_SAMPLES; ++w) {
        const acoustic_status_t status = acoustic_processor_process(
            &processor, block_buf, ACOUSTIC_MAX_BLOCK_SAMPLES, &golden_res);
        if (w + 1 == ACOUSTIC_WINDOW_SAMPLES / ACOUSTIC_MAX_BLOCK_SAMPLES) {
            CHECK(status == ACOUSTIC_COMPLETE);
        } else {
            CHECK(status == ACOUSTIC_INCOMPLETE);
        }
    }
    CHECK(golden_res.rms_dbfs_valid && golden_res.peak_dbfs_valid);
    CHECK(near(golden_res.rms_dbfs, -7.88f, 0.5f));
    CHECK(near(golden_res.peak_dbfs, -3.04f, 0.5f));

    /* State 2 */
    int32_t state2_pat[8] = {
        2956863, -2956863, 2956863 / 2, -(2956863 / 2),
        0, 2956863 / 4, -(2956863 / 4), 0
    };
    for (size_t i = 0; i < ACOUSTIC_MAX_BLOCK_SAMPLES; ++i) {
        block_buf[i] = state2_pat[i % 8];
    }
    for (size_t w = 0; w < ACOUSTIC_WINDOW_SAMPLES / ACOUSTIC_MAX_BLOCK_SAMPLES; ++w) {
        const acoustic_status_t status = acoustic_processor_process(
            &processor, block_buf, ACOUSTIC_MAX_BLOCK_SAMPLES, &golden_res);
        if (w + 1 == ACOUSTIC_WINDOW_SAMPLES / ACOUSTIC_MAX_BLOCK_SAMPLES) {
            CHECK(status == ACOUSTIC_COMPLETE);
        } else {
            CHECK(status == ACOUSTIC_INCOMPLETE);
        }
    }
    CHECK(golden_res.rms_dbfs_valid && golden_res.peak_dbfs_valid);
    CHECK(near(golden_res.rms_dbfs, -13.90f, 0.5f));
    CHECK(near(golden_res.peak_dbfs, -9.06f, 0.5f));

    return 0;
}
