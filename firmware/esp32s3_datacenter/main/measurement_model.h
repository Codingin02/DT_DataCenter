#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "acoustic_processing.h"

#define MEASUREMENT_BOOT_RANDOM_BYTES 16U
#define MEASUREMENT_BOOT_ID_LENGTH 32U
#define MEASUREMENT_SEQUENCE_MAX UINT64_C(9007199254740991)

typedef enum {
    MEASUREMENT_EVENT_ENVIRONMENT = 1,
    MEASUREMENT_EVENT_ACOUSTIC,
} measurement_event_type_t;

typedef enum {
    MEASUREMENT_SOURCE_SHT31_A = 1,
    MEASUREMENT_SOURCE_SHT31_B,
} measurement_source_t;

typedef enum {
    MEASUREMENT_QUALITY_GOOD = 1,
    MEASUREMENT_QUALITY_INVALID,
} measurement_quality_t;

typedef struct {
    measurement_source_t source;
    uint16_t raw_temperature;
    uint16_t raw_humidity;
    float temperature_c;
    float humidity_rh;
    measurement_quality_t quality;
} measurement_environment_t;

typedef struct {
    float rms_code;
    float peak_code;
    float rms_dbfs;
    float peak_dbfs;
    bool rms_dbfs_valid;
    bool peak_dbfs_valid;
} measurement_acoustic_t;

typedef struct {
    uint64_t seq;
    int64_t sample_tick_us;
    char boot_id[MEASUREMENT_BOOT_ID_LENGTH + 1U];
    measurement_event_type_t type;
    union {
        measurement_environment_t environment;
        measurement_acoustic_t acoustic;
    } data;
} measurement_event_t;

typedef struct {
    char boot_id[MEASUREMENT_BOOT_ID_LENGTH + 1U];
    uint64_t next_sequence;
    bool sequence_exhausted;
} measurement_identity_t;

void measurement_identity_init(
    measurement_identity_t *identity,
    const uint8_t entropy[MEASUREMENT_BOOT_RANDOM_BYTES]);
bool measurement_identity_allocate(measurement_identity_t *identity,
                                   uint64_t *sequence);
bool measurement_event_environment(measurement_identity_t *identity,
                                   measurement_source_t source,
                                   uint16_t raw_temperature,
                                   uint16_t raw_humidity,
                                   float temperature_c,
                                   float humidity_rh,
                                   int64_t sample_tick_us,
                                   measurement_event_t *event);
bool measurement_event_acoustic(measurement_identity_t *identity,
                                const acoustic_result_t *result,
                                int64_t sample_tick_us,
                                measurement_event_t *event);
void measurement_counter_increment(uint64_t *counter);
void measurement_counter_add(uint64_t *counter, uint64_t amount);
uint64_t measurement_elapsed_us(int64_t started_at_us, int64_t ended_at_us);
