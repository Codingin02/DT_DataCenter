#include "measurement_model.h"

#include <limits.h>
#include <math.h>
#include <string.h>

#define CHECK(condition) do { if (!(condition)) return __LINE__; } while (0)

static bool boot_id_is_lower_hex(const char *boot_id)
{
    for (size_t index = 0; index < MEASUREMENT_BOOT_ID_LENGTH; ++index) {
        const char value = boot_id[index];
        if (!((value >= '0' && value <= '9') ||
              (value >= 'a' && value <= 'f'))) {
            return false;
        }
    }
    return boot_id[MEASUREMENT_BOOT_ID_LENGTH] == '\0';
}

int main(void)
{
    _Static_assert(sizeof(measurement_event_t) <= 96U,
                   "runtime event must remain compact");
    _Static_assert(sizeof(measurement_acoustic_t) <= 24U,
                   "acoustic event must not retain PCM");

    uint8_t entropy[MEASUREMENT_BOOT_RANDOM_BYTES];
    for (size_t index = 0; index < sizeof(entropy); ++index) {
        entropy[index] = (uint8_t)index;
    }

    measurement_identity_t identity;
    measurement_identity_init(&identity, entropy);
    CHECK(strcmp(identity.boot_id, "000102030405060708090a0b0c0d0e0f") == 0);
    CHECK(boot_id_is_lower_hex(identity.boot_id));
    CHECK(strlen(identity.boot_id) == MEASUREMENT_BOOT_ID_LENGTH);
    CHECK(identity.next_sequence == 0U && !identity.sequence_exhausted);

    uint64_t sequence;
    CHECK(measurement_identity_allocate(&identity, &sequence) && sequence == 0U);
    CHECK(measurement_identity_allocate(&identity, &sequence) && sequence == 1U);

    identity.next_sequence = MEASUREMENT_SEQUENCE_MAX;
    CHECK(measurement_identity_allocate(&identity, &sequence));
    CHECK(sequence == MEASUREMENT_SEQUENCE_MAX && identity.sequence_exhausted);
    CHECK(!measurement_identity_allocate(&identity, &sequence));

    measurement_identity_init(&identity, entropy);
    measurement_event_t environment;
    CHECK(measurement_event_environment(
        &identity, MEASUREMENT_SOURCE_SHT31_A, 0x1234U, 0xFEDCU,
        23.123456F, 56.654324F, 1234567, &environment));
    CHECK(environment.type == MEASUREMENT_EVENT_ENVIRONMENT);
    CHECK(environment.seq == 0U && environment.sample_tick_us == 1234567);
    CHECK(strcmp(environment.boot_id, identity.boot_id) == 0);
    CHECK(environment.data.environment.source == MEASUREMENT_SOURCE_SHT31_A);
    CHECK(environment.data.environment.raw_temperature == 0x1234U);
    CHECK(environment.data.environment.raw_humidity == 0xFEDCU);
    CHECK(environment.data.environment.temperature_c == 23.123456F);
    CHECK(environment.data.environment.humidity_rh == 56.654324F);
    CHECK(environment.data.environment.quality == MEASUREMENT_QUALITY_GOOD);

    const uint64_t next_before_invalid = identity.next_sequence;
    CHECK(!measurement_event_environment(
        &identity, 0, 0, 0, NAN, 0.0F, 0, &environment));
    CHECK(identity.next_sequence == next_before_invalid);

    const acoustic_result_t acoustic_result = {
        .sample_count = ACOUSTIC_WINDOW_SAMPLES,
        .rms_code = 123.5F,
        .peak_code = 456.25F,
        .rms_dbfs_valid = false,
        .peak_dbfs_valid = false,
    };
    measurement_event_t acoustic;
    CHECK(measurement_event_acoustic(&identity, &acoustic_result, 2000000,
                                     &acoustic));
    CHECK(acoustic.type == MEASUREMENT_EVENT_ACOUSTIC);
    CHECK(acoustic.seq == 1U && acoustic.sample_tick_us == 2000000);
    CHECK(!acoustic.data.acoustic.rms_dbfs_valid);
    CHECK(!acoustic.data.acoustic.peak_dbfs_valid);
    CHECK(acoustic.data.acoustic.rms_code == acoustic_result.rms_code);
    CHECK(acoustic.data.acoustic.peak_code == acoustic_result.peak_code);

    measurement_identity_t reset_identity;
    measurement_identity_init(&reset_identity, entropy);
    CHECK(strcmp(reset_identity.boot_id,
                 "000102030405060708090a0b0c0d0e0f") == 0);
    CHECK(reset_identity.next_sequence == 0U);
    CHECK(!reset_identity.sequence_exhausted);

    uint64_t counter = UINT64_MAX - 1U;
    measurement_counter_increment(&counter);
    measurement_counter_increment(&counter);
    CHECK(counter == UINT64_MAX);
    counter = UINT64_MAX - 5U;
    measurement_counter_add(&counter, 6U);
    CHECK(counter == UINT64_MAX);
    CHECK(measurement_elapsed_us(100, 125) == 25U);
    CHECK(measurement_elapsed_us(0, INT64_MAX) == (uint64_t)INT64_MAX);
    CHECK(measurement_elapsed_us(125, 100) == 0U);
    CHECK(measurement_elapsed_us(-1, 100) == 0U);

    return 0;
}
