BEGIN;

ALTER TABLE digital_twin.metric_definitions
    DROP CONSTRAINT metric_definitions_source_class_check;

ALTER TABLE digital_twin.metric_definitions
    ADD CONSTRAINT metric_definitions_source_class_check CHECK (
        source_class IN (
            'environmental',
            'acoustic',
            'telecommunications',
            'electrical',
            'native_server',
            'hardware'
        )
    );

CREATE INDEX IF NOT EXISTS measurements_history_lookup
    ON digital_twin.measurements (asset_id, metric, sensor_id, ts)
    INCLUDE (value, unit);

INSERT INTO digital_twin.metric_definitions (metric, unit, source_class)
VALUES
    ('net_bytes_received_total', 'bytes', 'telecommunications'),
    ('net_bytes_sent_total', 'bytes', 'telecommunications'),
    ('net_packets_received_total', 'count', 'telecommunications'),
    ('net_packets_sent_total', 'count', 'telecommunications'),
    ('net_packets_received_errors_total', 'count', 'telecommunications'),
    ('net_packets_outbound_errors_total', 'count', 'telecommunications'),
    ('net_packets_received_discarded_total', 'count', 'telecommunications'),
    ('net_packets_outbound_discarded_total', 'count', 'telecommunications'),
    ('net_current_bandwidth_bytes', 'bytes_per_second', 'telecommunications'),
    (
        'net_receive_throughput_bytes_per_second',
        'bytes_per_second',
        'telecommunications'
    ),
    (
        'net_transmit_throughput_bytes_per_second',
        'bytes_per_second',
        'telecommunications'
    ),
    ('net_link_utilization_ratio', 'ratio', 'telecommunications'),
    ('net_operation_status', 'ratio', 'telecommunications'),
    ('voltage_v', 'V', 'electrical'),
    ('current_a', 'A', 'electrical'),
    ('active_power_w', 'W', 'electrical'),
    ('apparent_power_va', 'VA', 'electrical'),
    ('power_factor_ratio', 'ratio', 'electrical'),
    ('frequency_hz', 'Hz', 'electrical'),
    ('energy_wh_total', 'Wh', 'electrical'),
    ('brownout_count', 'count', 'hardware'),
    ('reset_count', 'count', 'hardware'),
    ('mqtt_reconnect_count', 'count', 'hardware'),
    ('uptime_s', 's', 'hardware'),
    ('crc_error_count', 'count', 'hardware'),
    ('i2c_retry_count', 'count', 'hardware'),
    ('sensor_reset_count', 'count', 'hardware'),
    ('i2s_error_count', 'count', 'hardware'),
    ('dma_overrun_count', 'count', 'hardware'),
    ('clip_ratio', 'ratio', 'hardware'),
    ('stuck_sample_ratio', 'ratio', 'hardware'),
    ('supply_voltage_v', 'V', 'hardware'),
    ('supply_current_ma', 'mA', 'hardware')
ON CONFLICT (metric) DO NOTHING;

CREATE OR REPLACE FUNCTION digital_twin.accept_measurement(
    p_topic text,
    p_schema_version text,
    p_site_id digital_twin.canonical_id,
    p_device_id digital_twin.canonical_id,
    p_boot_id text,
    p_seq bigint,
    p_sensor_id digital_twin.canonical_id,
    p_asset_id digital_twin.canonical_id,
    p_metric digital_twin.canonical_id,
    p_value digital_twin.finite_number,
    p_unit digital_twin.unit_code,
    p_ts timestamptz,
    p_quality digital_twin.telemetry_quality,
    p_raw_value integer DEFAULT NULL
)
RETURNS TABLE (
    outcome text,
    persisted_measurement_id bigint,
    resulting_state_version bigint
)
LANGUAGE plpgsql
SET search_path = pg_catalog, digital_twin
AS $$
DECLARE
    v_received_at timestamptz := clock_timestamp();
    v_measurement_id bigint;
    v_state_version bigint;
    v_existing digital_twin.measurements%ROWTYPE;
BEGIN
    IF p_topic <> format(
        'dt/%s/telemetry/%s/%s/%s',
        p_site_id,
        p_device_id,
        p_sensor_id,
        p_metric
    ) THEN
        PERFORM digital_twin.record_ingestion_rejection(
            p_topic,
            NULL,
            'topic-mismatch',
            'Topic identity does not match the canonical payload identity.'
        );
        RETURN QUERY SELECT 'rejected'::text, NULL::bigint, NULL::bigint;
        RETURN;
    END IF;

    IF p_schema_version <> '1.0' THEN
        PERFORM digital_twin.record_ingestion_rejection(
            p_topic,
            NULL,
            'unsupported-schema-version',
            p_schema_version
        );
        RETURN QUERY SELECT 'rejected'::text, NULL::bigint, NULL::bigint;
        RETURN;
    END IF;

    IF p_quality = 'invalid' THEN
        PERFORM digital_twin.record_ingestion_rejection(
            p_topic,
            NULL,
            'invalid-quality',
            NULL
        );
        RETURN QUERY SELECT 'rejected'::text, NULL::bigint, NULL::bigint;
        RETURN;
    END IF;

    IF p_raw_value IS NOT NULL
        AND p_metric NOT IN ('temperature', 'humidity') THEN
        PERFORM digital_twin.record_ingestion_rejection(
            p_topic,
            NULL,
            'unsupported-raw-value',
            NULL
        );
        RETURN QUERY SELECT 'rejected'::text, NULL::bigint, NULL::bigint;
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM digital_twin.metric_definitions AS md
        WHERE md.metric = p_metric
          AND md.unit = p_unit
          AND md.source_class IN (
              'environmental',
              'acoustic',
              'telecommunications',
              'electrical',
              'hardware'
          )
    ) THEN
        PERFORM digital_twin.record_ingestion_rejection(
            p_topic,
            NULL,
            'unsupported-metric-unit',
            NULL
        );
        RETURN QUERY SELECT 'rejected'::text, NULL::bigint, NULL::bigint;
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM digital_twin.sensors AS s
        WHERE s.site_id = p_site_id
          AND s.device_id = p_device_id
          AND s.sensor_id = p_sensor_id
          AND s.asset_id = p_asset_id
          AND s.metric = p_metric
          AND s.unit = p_unit
          AND s.enabled
    ) THEN
        PERFORM digital_twin.record_ingestion_rejection(
            p_topic,
            NULL,
            CASE
                WHEN EXISTS (
                    SELECT 1
                    FROM digital_twin.sensors AS s
                    WHERE s.sensor_id = p_sensor_id
                ) THEN 'identity-mismatch'
                ELSE 'unknown-identity'
            END,
            NULL
        );
        RETURN QUERY SELECT 'rejected'::text, NULL::bigint, NULL::bigint;
        RETURN;
    END IF;

    INSERT INTO digital_twin.measurements AS inserted_measurement (
        schema_version,
        site_id,
        device_id,
        boot_id,
        seq,
        sensor_id,
        asset_id,
        metric,
        value,
        raw_value,
        unit,
        ts,
        received_at,
        quality
    )
    VALUES (
        p_schema_version,
        p_site_id,
        p_device_id,
        p_boot_id,
        p_seq,
        p_sensor_id,
        p_asset_id,
        p_metric,
        p_value,
        p_raw_value,
        p_unit,
        p_ts,
        v_received_at,
        p_quality
    )
    ON CONFLICT ON CONSTRAINT measurements_qos1_identity_key DO NOTHING
    RETURNING inserted_measurement.measurement_id INTO v_measurement_id;

    IF v_measurement_id IS NULL THEN
        SELECT m.*
        INTO v_existing
        FROM digital_twin.measurements AS m
        WHERE m.device_id = p_device_id
          AND m.boot_id = p_boot_id
          AND m.seq = p_seq
          AND m.sensor_id = p_sensor_id
          AND m.metric = p_metric;

        IF ROW(
            v_existing.schema_version,
            v_existing.site_id,
            v_existing.asset_id,
            v_existing.value,
            v_existing.raw_value,
            v_existing.unit,
            v_existing.ts,
            v_existing.quality
        ) IS DISTINCT FROM ROW(
            p_schema_version,
            p_site_id,
            p_asset_id,
            p_value,
            p_raw_value,
            p_unit,
            p_ts,
            p_quality
        ) THEN
            INSERT INTO digital_twin.ingestion_events (
                received_at,
                topic,
                outcome,
                reason_code,
                reason_detail,
                measurement_id
            )
            VALUES (
                v_received_at,
                p_topic,
                'rejected',
                'idempotency-conflict',
                'The QoS-1 identity already exists with different canonical content.',
                v_existing.measurement_id
            );

            SELECT cs.state_version
            INTO v_state_version
            FROM digital_twin.current_state_projection AS cs
            WHERE cs.asset_id = v_existing.asset_id
              AND cs.sensor_id = v_existing.sensor_id
              AND cs.metric = v_existing.metric;

            RETURN QUERY
            SELECT 'rejected'::text, v_existing.measurement_id, v_state_version;
            RETURN;
        END IF;

        INSERT INTO digital_twin.ingestion_events (
            received_at,
            topic,
            outcome,
            reason_code,
            measurement_id
        )
        VALUES (
            v_received_at,
            p_topic,
            'duplicate',
            'qos1-duplicate',
            v_existing.measurement_id
        );

        SELECT cs.state_version
        INTO v_state_version
        FROM digital_twin.current_state_projection AS cs
        WHERE cs.asset_id = v_existing.asset_id
          AND cs.sensor_id = v_existing.sensor_id
          AND cs.metric = v_existing.metric;

        RETURN QUERY
        SELECT 'duplicate'::text, v_existing.measurement_id, v_state_version;
        RETURN;
    END IF;

    INSERT INTO digital_twin.current_state_projection AS existing_state (
        asset_id,
        sensor_id,
        metric,
        measurement_id,
        source_ts,
        measurement_received_at,
        source_status
    )
    VALUES (
        p_asset_id,
        p_sensor_id,
        p_metric,
        v_measurement_id,
        p_ts,
        v_received_at,
        'unknown'
    )
    ON CONFLICT (asset_id, sensor_id, metric) DO UPDATE
    SET
        measurement_id = EXCLUDED.measurement_id,
        source_ts = EXCLUDED.source_ts,
        measurement_received_at = EXCLUDED.measurement_received_at,
        source_status = 'unknown'
    WHERE ROW(
        EXCLUDED.source_ts,
        EXCLUDED.measurement_received_at,
        EXCLUDED.measurement_id
    ) > ROW(
        existing_state.source_ts,
        existing_state.measurement_received_at,
        existing_state.measurement_id
    );

    SELECT cs.state_version
    INTO v_state_version
    FROM digital_twin.current_state_projection AS cs
    WHERE cs.asset_id = p_asset_id
      AND cs.sensor_id = p_sensor_id
      AND cs.metric = p_metric;

    INSERT INTO digital_twin.ingestion_events (
        received_at,
        topic,
        outcome,
        measurement_id
    )
    VALUES (v_received_at, p_topic, 'accepted', v_measurement_id);

    RETURN QUERY
    SELECT 'accepted'::text, v_measurement_id, v_state_version;
END;
$$;

INSERT INTO digital_twin.schema_migrations (version)
VALUES ('system-measurements')
ON CONFLICT (version) DO NOTHING;

COMMIT;
