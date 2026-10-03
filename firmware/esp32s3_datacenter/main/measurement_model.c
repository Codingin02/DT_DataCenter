#include "measurement_model.h"

#include <limits.h>
#include <math.h>
#include <string.h>

_Static_assert(MEASUREMENT_BOOT_ID_LENGTH ==
                   MEASUREMENT_BOOT_RANDOM_BYTES * 2U,
               "boot identity hex capacity");
_Static_assert(sizeof(measurement_event_t) <= 96U,
               "runtime event must remain compact");

void measurement_identity_init(
    measurement_identity_t *identity,
    const uint8_t entropy[MEASUREMENT_BOOT_RANDOM_BYTES])
{
    static const char hex[] = "0123456789abcdef";

    memset(identity, 0, sizeof(*identity));
    for (size_t index = 0; index < MEASUREMENT_BOOT_RANDOM_BYTES; ++index) {
        identity->boot_id[index * 2U] = hex[entropy[index] >> 4U];
        identity->boot_id[index * 2U + 1U] = hex[entropy[index] & 0x0FU];
    }
}

bool measurement_identity_allocate(measurement_identity_t *identity,
                                   uint64_t *sequence)
{
    if (identity == NULL || sequence == NULL || identity->sequence_exhausted) {
        return false;
    }

    *sequence = identity->next_sequence;
    if (identity->next_sequence == MEASUREMENT_SEQUENCE_MAX) {
        identity->sequence_exhausted = true;
    } else {
        ++identity->next_sequence;
    }
    return true;
}

static bool initialize_event(measurement_identity_t *identity,
                             measurement_event_type_t type,
                             int64_t sample_tick_us,
                             measurement_event_t *event)
{
    if (identity == NULL || event == NULL || sample_tick_us < 0) {
        return false;
    }

    uint64_t sequence;
    if (!measurement_identity_allocate(identity, &sequence)) {
        return false;
    }

    memset(event, 0, sizeof(*event));
    event->seq = sequence;
    event->sample_tick_us = sample_tick_us;
    memcpy(event->boot_id, identity->boot_id, sizeof(event->boot_id));
    event->type = type;
    return true;
}

bool measurement_event_environment(measurement_identity_t *identity,
                                   measurement_source_t source,
                                   uint16_t raw_temperature,
                                   uint16_t raw_humidity,
                                   float temperature_c,
                                   float humidity_rh,
                                   int64_t sample_tick_us,
                                   measurement_event_t *event)
{
    if ((source != MEASUREMENT_SOURCE_SHT31_A &&
         source != MEASUREMENT_SOURCE_SHT31_B) ||
        !isfinite(temperature_c) || !isfinite(humidity_rh) ||
        !initialize_event(identity, MEASUREMENT_EVENT_ENVIRONMENT,
                          sample_tick_us, event)) {
        return false;
    }

    event->data.environment = (measurement_environment_t){
        .source = source,
        .raw_temperature = raw_temperature,
        .raw_humidity = raw_humidity,
        .temperature_c = temperature_c,
        .humidity_rh = humidity_rh,
        .quality = MEASUREMENT_QUALITY_GOOD,
    };
    return true;
}

bool measurement_event_acoustic(measurement_identity_t *identity,
                                const acoustic_result_t *result,
                                int64_t sample_tick_us,
                                measurement_event_t *event)
{
    if (result == NULL || result->sample_count != ACOUSTIC_WINDOW_SAMPLES ||
        !isfinite(result->rms_code) || !isfinite(result->peak_code) ||
        (result->rms_dbfs_valid && !isfinite(result->rms_dbfs)) ||
        (result->peak_dbfs_valid && !isfinite(result->peak_dbfs)) ||
        !initialize_event(identity, MEASUREMENT_EVENT_ACOUSTIC,
                          sample_tick_us, event)) {
        return false;
    }

    event->data.acoustic = (measurement_acoustic_t){
        .rms_code = result->rms_code,
        .peak_code = result->peak_code,
        .rms_dbfs = result->rms_dbfs,
        .peak_dbfs = result->peak_dbfs,
        .rms_dbfs_valid = result->rms_dbfs_valid,
        .peak_dbfs_valid = result->peak_dbfs_valid,
    };
    return true;
}

void measurement_counter_increment(uint64_t *counter)
{
    if (*counter != UINT64_MAX) {
        ++*counter;
    }
}

void measurement_counter_add(uint64_t *counter, uint64_t amount)
{
    if (UINT64_MAX - *counter < amount) {
        *counter = UINT64_MAX;
    } else {
        *counter += amount;
    }
}

uint64_t measurement_elapsed_us(int64_t started_at_us, int64_t ended_at_us)
{
    if (started_at_us < 0 || ended_at_us < started_at_us) {
        return 0;
    }
    return (uint64_t)(ended_at_us - started_at_us);
}
