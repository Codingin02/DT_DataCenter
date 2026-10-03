BEGIN;

CREATE SCHEMA IF NOT EXISTS digital_twin AUTHORIZATION bagus;

CREATE TABLE digital_twin.schema_migrations (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE DOMAIN digital_twin.canonical_id AS text
    CHECK (VALUE ~ '^[a-z0-9][a-z0-9._-]{0,63}$');

CREATE DOMAIN digital_twin.unit_code AS text
    CHECK (char_length(VALUE) BETWEEN 1 AND 64 AND VALUE = btrim(VALUE));

CREATE DOMAIN digital_twin.finite_number AS double precision
    CHECK (
        VALUE NOT IN (
            'NaN'::double precision,
            'Infinity'::double precision,
            '-Infinity'::double precision
        )
    );

CREATE DOMAIN digital_twin.telemetry_quality AS text
    CHECK (VALUE IN ('good', 'degraded', 'invalid', 'unknown'));

CREATE DOMAIN digital_twin.source_status AS text
    CHECK (VALUE IN ('fresh', 'stale', 'offline', 'unknown', 'invalid'));

CREATE TABLE digital_twin.sites (
    site_id digital_twin.canonical_id PRIMARY KEY,
    display_name text NOT NULL CHECK (btrim(display_name) <> ''),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE digital_twin.assets (
    asset_id digital_twin.canonical_id PRIMARY KEY,
    site_id digital_twin.canonical_id NOT NULL REFERENCES digital_twin.sites (site_id),
    asset_type text NOT NULL CHECK (
        asset_type IN (
            'room',
            'zone',
            'rack',
            'server',
            'environmental_sensor',
            'infrastructure'
        )
    ),
    display_name text CHECK (display_name IS NULL OR btrim(display_name) <> ''),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (site_id, asset_id)
);

CREATE VIEW digital_twin.rooms AS
SELECT
    asset_id AS room_id,
    site_id,
    display_name,
    created_at
FROM digital_twin.assets
WHERE asset_type = 'room';

CREATE VIEW digital_twin.zones AS
SELECT
    asset_id AS zone_id,
    site_id,
    display_name,
    created_at
FROM digital_twin.assets
WHERE asset_type = 'zone';

CREATE TABLE digital_twin.asset_relationships (
    site_id digital_twin.canonical_id NOT NULL,
    parent_asset_id digital_twin.canonical_id NOT NULL,
    child_asset_id digital_twin.canonical_id NOT NULL,
    relationship_type text NOT NULL DEFAULT 'contains' CHECK (relationship_type = 'contains'),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (parent_asset_id, child_asset_id, relationship_type),
    FOREIGN KEY (site_id, parent_asset_id)
        REFERENCES digital_twin.assets (site_id, asset_id),
    FOREIGN KEY (site_id, child_asset_id)
        REFERENCES digital_twin.assets (site_id, asset_id),
    CHECK (parent_asset_id <> child_asset_id)
);

CREATE UNIQUE INDEX asset_relationships_one_parent
    ON digital_twin.asset_relationships (child_asset_id)
    WHERE relationship_type = 'contains';

CREATE TABLE digital_twin.coordinate_systems (
    coordinate_system_id digital_twin.canonical_id PRIMARY KEY,
    site_id digital_twin.canonical_id NOT NULL REFERENCES digital_twin.sites (site_id),
    display_name text NOT NULL CHECK (btrim(display_name) <> ''),
    unit text NOT NULL CHECK (btrim(unit) <> ''),
    handedness text NOT NULL CHECK (handedness IN ('left', 'right')),
    up_axis text NOT NULL CHECK (up_axis IN ('x', 'y', 'z')),
    origin_description text NOT NULL CHECK (btrim(origin_description) <> ''),
    orientation_description text NOT NULL CHECK (btrim(orientation_description) <> ''),
    coordinate_system_version bigint NOT NULL CHECK (coordinate_system_version > 0),
    is_canonical boolean NOT NULL DEFAULT false,
    registration_verified boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (site_id, coordinate_system_id),
    CHECK (NOT is_canonical OR (unit = 'm' AND handedness = 'right' AND up_axis = 'y'))
);

CREATE UNIQUE INDEX coordinate_systems_one_canonical
    ON digital_twin.coordinate_systems (site_id)
    WHERE is_canonical;

CREATE TABLE digital_twin.asset_transforms (
    site_id digital_twin.canonical_id NOT NULL,
    asset_id digital_twin.canonical_id NOT NULL,
    coordinate_system_id digital_twin.canonical_id NOT NULL,
    position_x digital_twin.finite_number NOT NULL,
    position_y digital_twin.finite_number NOT NULL,
    position_z digital_twin.finite_number NOT NULL,
    rotation_x digital_twin.finite_number NOT NULL,
    rotation_y digital_twin.finite_number NOT NULL,
    rotation_z digital_twin.finite_number NOT NULL,
    rotation_w digital_twin.finite_number NOT NULL,
    scale_x digital_twin.finite_number NOT NULL CHECK (scale_x > 0),
    scale_y digital_twin.finite_number NOT NULL CHECK (scale_y > 0),
    scale_z digital_twin.finite_number NOT NULL CHECK (scale_z > 0),
    model_node_id text CHECK (model_node_id IS NULL OR btrim(model_node_id) <> ''),
    transform_verified boolean NOT NULL DEFAULT false,
    transform_version bigint NOT NULL CHECK (transform_version > 0),
    is_current boolean NOT NULL DEFAULT true,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (asset_id, transform_version),
    FOREIGN KEY (site_id, asset_id)
        REFERENCES digital_twin.assets (site_id, asset_id),
    FOREIGN KEY (site_id, coordinate_system_id)
        REFERENCES digital_twin.coordinate_systems (site_id, coordinate_system_id),
    CHECK (
        rotation_x <> 0 OR rotation_y <> 0 OR rotation_z <> 0 OR rotation_w <> 0
    )
);

CREATE UNIQUE INDEX asset_transforms_one_current
    ON digital_twin.asset_transforms (asset_id)
    WHERE is_current;

CREATE TABLE digital_twin.devices (
    device_id digital_twin.canonical_id PRIMARY KEY,
    site_id digital_twin.canonical_id NOT NULL REFERENCES digital_twin.sites (site_id),
    asset_id digital_twin.canonical_id,
    enabled boolean NOT NULL DEFAULT true,
    connectivity_status text NOT NULL DEFAULT 'unknown' CHECK (
        connectivity_status IN ('online', 'offline', 'unknown')
    ),
    connectivity_boot_id text CHECK (
        connectivity_boot_id IS NULL
        OR (
            char_length(connectivity_boot_id) BETWEEN 1 AND 128
            AND connectivity_boot_id = btrim(connectivity_boot_id)
        )
    ),
    connectivity_received_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (site_id, device_id),
    FOREIGN KEY (site_id, asset_id)
        REFERENCES digital_twin.assets (site_id, asset_id)
);

CREATE TABLE digital_twin.metric_definitions (
    metric digital_twin.canonical_id PRIMARY KEY,
    unit digital_twin.unit_code NOT NULL,
    source_class text NOT NULL CHECK (
        source_class IN (
            'environmental',
            'acoustic',
            'telecommunications',
            'electrical',
            'native_server',
            'hardware'
        )
    ),
    UNIQUE (metric, unit)
);

INSERT INTO digital_twin.metric_definitions (metric, unit, source_class)
VALUES
    ('temperature', 'degC', 'environmental'),
    ('humidity', 'percent_rh', 'environmental'),
    ('sound_rms_dbfs', 'dBFS', 'acoustic'),
    ('sound_peak_dbfs', 'dBFS', 'acoustic'),
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
    ('energy_wh_total', 'Wh', 'electrical');

CREATE TABLE digital_twin.sensors (
    sensor_id digital_twin.canonical_id PRIMARY KEY,
    site_id digital_twin.canonical_id NOT NULL,
    device_id digital_twin.canonical_id NOT NULL,
    asset_id digital_twin.canonical_id NOT NULL,
    metric digital_twin.canonical_id NOT NULL,
    unit digital_twin.unit_code NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (site_id, sensor_id),
    UNIQUE (site_id, device_id, sensor_id, asset_id, metric, unit),
    FOREIGN KEY (site_id, device_id)
        REFERENCES digital_twin.devices (site_id, device_id),
    FOREIGN KEY (site_id, asset_id)
        REFERENCES digital_twin.assets (site_id, asset_id),
    FOREIGN KEY (metric, unit)
        REFERENCES digital_twin.metric_definitions (metric, unit)
);

CREATE TABLE digital_twin.sensor_positions (
    site_id digital_twin.canonical_id NOT NULL,
    sensor_id digital_twin.canonical_id NOT NULL,
    coordinate_system_id digital_twin.canonical_id NOT NULL,
    position_x digital_twin.finite_number NOT NULL,
    position_y digital_twin.finite_number NOT NULL,
    position_z digital_twin.finite_number NOT NULL,
    position_verified boolean NOT NULL DEFAULT false,
    position_version bigint NOT NULL CHECK (position_version > 0),
    is_current boolean NOT NULL DEFAULT true,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (sensor_id, position_version),
    FOREIGN KEY (site_id, sensor_id)
        REFERENCES digital_twin.sensors (site_id, sensor_id),
    FOREIGN KEY (site_id, coordinate_system_id)
        REFERENCES digital_twin.coordinate_systems (site_id, coordinate_system_id)
);

CREATE UNIQUE INDEX sensor_positions_one_current
    ON digital_twin.sensor_positions (sensor_id)
    WHERE is_current;

CREATE VIEW digital_twin.sensor_spatial AS
SELECT
    sp.sensor_id,
    s.device_id,
    s.asset_id,
    sp.coordinate_system_id,
    sp.position_x,
    sp.position_y,
    sp.position_z,
    sp.position_verified,
    sp.position_version,
    sp.is_current,
    sp.recorded_at
FROM digital_twin.sensor_positions AS sp
JOIN digital_twin.sensors AS s
    ON s.site_id = sp.site_id
   AND s.sensor_id = sp.sensor_id;

CREATE TABLE digital_twin.measurements (
    measurement_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    schema_version text NOT NULL CHECK (schema_version = '1.0'),
    site_id digital_twin.canonical_id NOT NULL,
    device_id digital_twin.canonical_id NOT NULL,
    boot_id text NOT NULL CHECK (
        char_length(boot_id) BETWEEN 1 AND 128 AND boot_id = btrim(boot_id)
    ),
    seq bigint NOT NULL CHECK (seq >= 0),
    sensor_id digital_twin.canonical_id NOT NULL,
    asset_id digital_twin.canonical_id NOT NULL,
    metric digital_twin.canonical_id NOT NULL,
    value digital_twin.finite_number NOT NULL,
    raw_value integer CHECK (raw_value BETWEEN 0 AND 65535),
    unit digital_twin.unit_code NOT NULL,
    ts timestamptz NOT NULL,
    received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    quality digital_twin.telemetry_quality NOT NULL CHECK (quality <> 'invalid'),
    CONSTRAINT measurements_qos1_identity_key
        UNIQUE (device_id, boot_id, seq, sensor_id, metric),
    CONSTRAINT measurements_current_state_reference_key
        UNIQUE (measurement_id, asset_id, sensor_id, metric, ts, received_at),
    FOREIGN KEY (site_id, device_id, sensor_id, asset_id, metric, unit)
        REFERENCES digital_twin.sensors (
            site_id,
            device_id,
            sensor_id,
            asset_id,
            metric,
            unit
        )
);

CREATE INDEX measurements_source_time
    ON digital_twin.measurements (
        asset_id,
        sensor_id,
        metric,
        ts DESC,
        received_at DESC,
        measurement_id DESC
    );

CREATE INDEX measurements_history_lookup
    ON digital_twin.measurements (asset_id, metric, sensor_id, ts)
    INCLUDE (value, unit);

CREATE TABLE digital_twin.ingestion_events (
    ingestion_event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    topic text NOT NULL CHECK (btrim(topic) <> ''),
    outcome text NOT NULL CHECK (outcome IN ('accepted', 'rejected', 'duplicate')),
    reason_code digital_twin.canonical_id,
    reason_detail text,
    raw_payload text,
    measurement_id bigint REFERENCES digital_twin.measurements (measurement_id),
    CHECK (
        (outcome = 'accepted' AND reason_code IS NULL AND measurement_id IS NOT NULL)
        OR (outcome = 'duplicate' AND reason_code IS NOT NULL AND measurement_id IS NOT NULL)
        OR (outcome = 'rejected' AND reason_code IS NOT NULL)
    )
);

CREATE INDEX ingestion_events_received_at
    ON digital_twin.ingestion_events (received_at DESC, outcome);

CREATE SEQUENCE digital_twin.current_state_version_seq AS bigint;

CREATE TABLE digital_twin.current_state_projection (
    asset_id digital_twin.canonical_id NOT NULL,
    sensor_id digital_twin.canonical_id NOT NULL,
    metric digital_twin.canonical_id NOT NULL,
    measurement_id bigint NOT NULL UNIQUE,
    source_ts timestamptz NOT NULL,
    measurement_received_at timestamptz NOT NULL,
    source_status digital_twin.source_status NOT NULL DEFAULT 'unknown',
    state_version bigint NOT NULL DEFAULT nextval('digital_twin.current_state_version_seq'),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (asset_id, sensor_id, metric),
    UNIQUE (state_version),
    FOREIGN KEY (
        measurement_id,
        asset_id,
        sensor_id,
        metric,
        source_ts,
        measurement_received_at
    )
        REFERENCES digital_twin.measurements (
            measurement_id,
            asset_id,
            sensor_id,
            metric,
            ts,
            received_at
        )
);

ALTER SEQUENCE digital_twin.current_state_version_seq
    OWNED BY digital_twin.current_state_projection.state_version;

CREATE FUNCTION digital_twin.refresh_current_state_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, digital_twin
AS $$
BEGIN
    IF ROW(NEW.measurement_id, NEW.source_status)
        IS NOT DISTINCT FROM ROW(OLD.measurement_id, OLD.source_status) THEN
        RETURN NULL;
    END IF;

    NEW.state_version := nextval('digital_twin.current_state_version_seq');
    NEW.updated_at := clock_timestamp();
    RETURN NEW;
END;
$$;

CREATE TRIGGER current_state_version_before_update
BEFORE UPDATE ON digital_twin.current_state_projection
FOR EACH ROW
EXECUTE FUNCTION digital_twin.refresh_current_state_version();

CREATE FUNCTION digital_twin.record_device_status(
    p_site_id digital_twin.canonical_id,
    p_device_id digital_twin.canonical_id,
    p_boot_id text,
    p_status text
)
RETURNS TABLE (
    outcome text,
    reason_code digital_twin.canonical_id,
    resulting_status text,
    resulting_boot_id text,
    resulting_received_at timestamptz,
    resulting_state_versions bigint[]
)
LANGUAGE plpgsql
SET search_path = pg_catalog, digital_twin
AS $$
DECLARE
    v_device digital_twin.devices%ROWTYPE;
    v_received_at timestamptz := clock_timestamp();
    v_state_versions bigint[] := ARRAY[]::bigint[];
BEGIN
    IF p_boot_id IS NULL
        OR char_length(p_boot_id) NOT BETWEEN 1 AND 128
        OR p_boot_id <> btrim(p_boot_id) THEN
        RETURN QUERY
        SELECT 'rejected'::text, 'invalid-boot-id'::digital_twin.canonical_id,
            NULL::text, NULL::text, NULL::timestamptz, ARRAY[]::bigint[];
        RETURN;
    END IF;

    IF p_status IS NULL OR p_status NOT IN ('online', 'offline') THEN
        RETURN QUERY
        SELECT 'rejected'::text, 'invalid-device-status'::digital_twin.canonical_id,
            NULL::text, NULL::text, NULL::timestamptz, ARRAY[]::bigint[];
        RETURN;
    END IF;

    SELECT d.*
    INTO v_device
    FROM digital_twin.devices AS d
    WHERE d.device_id = p_device_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY
        SELECT 'rejected'::text, 'unknown-identity'::digital_twin.canonical_id,
            NULL::text, NULL::text, NULL::timestamptz, ARRAY[]::bigint[];
        RETURN;
    END IF;

    IF v_device.site_id <> p_site_id THEN
        RETURN QUERY
        SELECT 'rejected'::text, 'identity-mismatch'::digital_twin.canonical_id,
            NULL::text, NULL::text, NULL::timestamptz, ARRAY[]::bigint[];
        RETURN;
    END IF;

    IF NOT v_device.enabled THEN
        RETURN QUERY
        SELECT 'rejected'::text, 'disabled-device'::digital_twin.canonical_id,
            NULL::text, NULL::text, NULL::timestamptz, ARRAY[]::bigint[];
        RETURN;
    END IF;

    UPDATE digital_twin.devices
    SET
        connectivity_status = p_status,
        connectivity_boot_id = p_boot_id,
        connectivity_received_at = v_received_at
    WHERE device_id = p_device_id;

    IF p_status = 'offline' THEN
        WITH changed_state AS (
            UPDATE digital_twin.current_state_projection AS cs
            SET source_status = 'offline'
            WHERE cs.source_status IS DISTINCT FROM 'offline'
              AND EXISTS (
                  SELECT 1
                  FROM digital_twin.measurements AS m
                  WHERE m.measurement_id = cs.measurement_id
                    AND m.device_id = p_device_id
              )
            RETURNING cs.state_version
        )
        SELECT COALESCE(
            array_agg(changed_state.state_version ORDER BY changed_state.state_version),
            ARRAY[]::bigint[]
        )
        INTO v_state_versions
        FROM changed_state;
    ELSE
        WITH changed_state AS (
            UPDATE digital_twin.current_state_projection AS cs
            SET source_status = 'unknown'
            WHERE cs.source_status = 'offline'
              AND EXISTS (
                  SELECT 1
                  FROM digital_twin.measurements AS m
                  WHERE m.measurement_id = cs.measurement_id
                    AND m.device_id = p_device_id
              )
            RETURNING cs.state_version
        )
        SELECT COALESCE(
            array_agg(changed_state.state_version ORDER BY changed_state.state_version),
            ARRAY[]::bigint[]
        )
        INTO v_state_versions
        FROM changed_state;
    END IF;

    RETURN QUERY
    SELECT 'accepted'::text, NULL::digital_twin.canonical_id,
        p_status, p_boot_id, v_received_at, v_state_versions;
END;
$$;

CREATE FUNCTION digital_twin.record_ingestion_rejection(
    p_topic text,
    p_raw_payload text,
    p_reason_code digital_twin.canonical_id,
    p_reason_detail text DEFAULT NULL
)
RETURNS bigint
LANGUAGE sql
SET search_path = pg_catalog, digital_twin
AS $$
    INSERT INTO digital_twin.ingestion_events (
        topic,
        outcome,
        reason_code,
        reason_detail,
        raw_payload
    )
    VALUES (p_topic, 'rejected', p_reason_code, p_reason_detail, p_raw_payload)
    RETURNING ingestion_event_id;
$$;

CREATE FUNCTION digital_twin.accept_measurement(
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

CREATE VIEW digital_twin.current_state AS
SELECT
    '1.0'::text AS contract_version,
    cs.asset_id,
    m.metric,
    m.value,
    m.raw_value,
    m.unit,
    m.site_id,
    m.device_id,
    m.sensor_id,
    m.boot_id,
    m.seq,
    m.ts AS source_ts,
    m.received_at,
    m.quality,
    cs.source_status,
    m.measurement_id,
    cs.state_version,
    cs.updated_at
FROM digital_twin.current_state_projection AS cs
JOIN digital_twin.measurements AS m
    ON m.measurement_id = cs.measurement_id;

INSERT INTO digital_twin.schema_migrations (version)
VALUES ('foundation');

COMMIT;
