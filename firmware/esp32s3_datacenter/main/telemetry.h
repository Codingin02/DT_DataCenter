#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "esp_err.h"
#include "measurement_model.h"

typedef struct {
    uint64_t mapped_record_count;
    uint64_t publish_accepted_count;
    uint64_t publish_unavailable_count;
    uint64_t publish_outbox_full_count;
    uint64_t publish_error_count;
    uint64_t identity_invalid_drop_count;
    uint64_t time_not_ready_drop_count;
    uint64_t serialization_failure_count;
    uint64_t unsupported_event_count;
    bool time_ready;
} telemetry_diagnostics_t;

esp_err_t telemetry_start_time_sync(void);
void telemetry_process_event(const measurement_event_t *event);
void telemetry_get_diagnostics(telemetry_diagnostics_t *diagnostics);
