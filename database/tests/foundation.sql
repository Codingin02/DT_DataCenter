\set ON_ERROR_STOP on
\if :{?FOUNDATION_ALREADY_APPLIED}
\else
\ir ../migrations/foundation.sql
\endif

BEGIN;

-- Synthetic fixtures only; this script is intended for a disposable test database.
INSERT INTO digital_twin.sites (site_id, display_name)
VALUES ('test-site', 'Synthetic test site');

INSERT INTO digital_twin.assets (asset_id, site_id, asset_type, display_name)
VALUES
    ('test-room', 'test-site', 'room', 'Synthetic room'),
    ('test-rack', 'test-site', 'rack', 'Synthetic rack'),
    ('test-sensor-asset', 'test-site', 'environmental_sensor', 'Synthetic sensor asset');

INSERT INTO digital_twin.asset_relationships (
    site_id,
    parent_asset_id,
    child_asset_id
)
VALUES
    ('test-site', 'test-room', 'test-rack'),
    ('test-site', 'test-rack', 'test-sensor-asset');

INSERT INTO digital_twin.coordinate_systems (
    coordinate_system_id,
    site_id,
    display_name,
    unit,
    handedness,
    up_axis,
    origin_description,
    orientation_description,
    coordinate_system_version,
    is_canonical
)
VALUES (
    'test-world',
    'test-site',
    'Synthetic canonical world',
    'm',
    'right',
    'y',
    'Synthetic origin',
    'Synthetic right-handed Y-up orientation',
    1,
    true
);

INSERT INTO digital_twin.asset_transforms (
    site_id,
    asset_id,
    coordinate_system_id,
    position_x,
    position_y,
    position_z,
    rotation_x,
    rotation_y,
    rotation_z,
    rotation_w,
    scale_x,
    scale_y,
    scale_z,
    transform_version
)
VALUES (
    'test-site',
    'test-rack',
    'test-world',
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    1,
    1,
    1,
    1
);

INSERT INTO digital_twin.devices (device_id, site_id, asset_id)
VALUES ('test-device', 'test-site', 'test-sensor-asset');

INSERT INTO digital_twin.sensors (
    sensor_id,
    site_id,
    device_id,
    asset_id,
    metric,
    unit
)
VALUES
    ('test-sensor', 'test-site', 'test-device', 'test-rack', 'temperature', 'degC'),
    ('test-sensor-2', 'test-site', 'test-device', 'test-rack', 'temperature', 'degC'),
    ('test-sound-rms', 'test-site', 'test-device', 'test-rack', 'sound_rms_dbfs', 'dBFS'),
    ('test-sound-peak', 'test-site', 'test-device', 'test-rack', 'sound_peak_dbfs', 'dBFS');

INSERT INTO digital_twin.sensor_positions (
    site_id,
    sensor_id,
    coordinate_system_id,
    position_x,
    position_y,
    position_z,
    position_version
)
VALUES ('test-site', 'test-sensor', 'test-world', 0, 0, 0, 1);

DO $test$
DECLARE
    first_result record;
    duplicate_result record;
    conflict_result record;
    newer_result record;
    older_result record;
    current_row record;
    status_result record;
    status_row record;
    state_version_before_status bigint;
    state_version_offline bigint;
    measurement_count_before_status bigint;
    ingestion_event_count_before_status bigint;
    second_source_result record;
    acoustic_result record;
BEGIN
    SELECT *
    INTO first_result
    FROM digital_twin.accept_measurement(
        p_topic => 'dt/test-site/telemetry/test-device/test-sensor/temperature',
        p_schema_version => '1.0',
        p_site_id => 'test-site',
        p_device_id => 'test-device',
        p_boot_id => 'test-boot',
        p_seq => 1,
        p_sensor_id => 'test-sensor',
        p_asset_id => 'test-rack',
        p_metric => 'temperature',
        p_value => 20,
        p_unit => 'degC',
        p_ts => '2026-01-01T00:00:00Z',
        p_quality => 'good'
    );

    IF first_result.outcome IS DISTINCT FROM 'accepted' THEN
        RAISE EXCEPTION 'first measurement was not accepted';
    END IF;

    SELECT *
    INTO duplicate_result
    FROM digital_twin.accept_measurement(
        p_topic => 'dt/test-site/telemetry/test-device/test-sensor/temperature',
        p_schema_version => '1.0',
        p_site_id => 'test-site',
        p_device_id => 'test-device',
        p_boot_id => 'test-boot',
        p_seq => 1,
        p_sensor_id => 'test-sensor',
        p_asset_id => 'test-rack',
        p_metric => 'temperature',
        p_value => 20,
        p_unit => 'degC',
        p_ts => '2026-01-01T00:00:00Z',
        p_quality => 'good'
    );

    IF duplicate_result.outcome IS DISTINCT FROM 'duplicate'
        OR duplicate_result.persisted_measurement_id IS DISTINCT FROM
            first_result.persisted_measurement_id
        OR duplicate_result.resulting_state_version IS DISTINCT FROM
            first_result.resulting_state_version THEN
        RAISE EXCEPTION 'duplicate changed persisted history or current state';
    END IF;

    SELECT *
    INTO conflict_result
    FROM digital_twin.accept_measurement(
        p_topic => 'dt/test-site/telemetry/test-device/test-sensor/temperature',
        p_schema_version => '1.0',
        p_site_id => 'test-site',
        p_device_id => 'test-device',
        p_boot_id => 'test-boot',
        p_seq => 1,
        p_sensor_id => 'test-sensor',
        p_asset_id => 'test-rack',
        p_metric => 'temperature',
        p_value => 21,
        p_unit => 'degC',
        p_ts => '2026-01-01T00:00:00Z',
        p_quality => 'good'
    );

    IF conflict_result.outcome IS DISTINCT FROM 'rejected'
        OR conflict_result.resulting_state_version IS DISTINCT FROM
            first_result.resulting_state_version THEN
        RAISE EXCEPTION 'idempotency conflict changed current state';
    END IF;

    SELECT *
    INTO newer_result
    FROM digital_twin.accept_measurement(
        p_topic => 'dt/test-site/telemetry/test-device/test-sensor/temperature',
        p_schema_version => '1.0',
        p_site_id => 'test-site',
        p_device_id => 'test-device',
        p_boot_id => 'test-boot',
        p_seq => 2,
        p_sensor_id => 'test-sensor',
        p_asset_id => 'test-rack',
        p_metric => 'temperature',
        p_value => 21,
        p_unit => 'degC',
        p_ts => '2026-01-01T00:01:00Z',
        p_quality => 'good'
    );

    IF newer_result.outcome IS DISTINCT FROM 'accepted'
        OR newer_result.resulting_state_version <= first_result.resulting_state_version THEN
        RAISE EXCEPTION 'newer measurement did not advance current state';
    END IF;

    SELECT *
    INTO older_result
    FROM digital_twin.accept_measurement(
        p_topic => 'dt/test-site/telemetry/test-device/test-sensor/temperature',
        p_schema_version => '1.0',
        p_site_id => 'test-site',
        p_device_id => 'test-device',
        p_boot_id => 'test-boot',
        p_seq => 3,
        p_sensor_id => 'test-sensor',
        p_asset_id => 'test-rack',
        p_metric => 'temperature',
        p_value => 19,
        p_unit => 'degC',
        p_ts => '2025-12-31T23:59:00Z',
        p_quality => 'good'
    );

    IF older_result.outcome IS DISTINCT FROM 'accepted'
        OR older_result.resulting_state_version IS DISTINCT FROM
            newer_result.resulting_state_version THEN
        RAISE EXCEPTION 'older physical measurement regressed current state';
    END IF;

    SELECT *
    INTO current_row
    FROM digital_twin.current_state
    WHERE asset_id = 'test-rack'
      AND metric = 'temperature';

    IF current_row.value IS DISTINCT FROM 21::double precision
        OR current_row.source_ts IS DISTINCT FROM '2026-01-01T00:01:00Z'::timestamptz
        OR current_row.source_status IS DISTINCT FROM 'unknown'
        OR current_row.state_version IS DISTINCT FROM newer_result.resulting_state_version THEN
        RAISE EXCEPTION 'canonical current-state read is inconsistent';
    END IF;

    IF (SELECT count(*) FROM digital_twin.measurements) <> 3
        OR (SELECT count(*) FROM digital_twin.ingestion_events WHERE outcome = 'accepted') <> 3
        OR (SELECT count(*) FROM digital_twin.ingestion_events WHERE outcome = 'duplicate') <> 1
        OR (SELECT count(*) FROM digital_twin.ingestion_events WHERE outcome = 'rejected') <> 1 THEN
        RAISE EXCEPTION 'history or ingestion diagnostics count is inconsistent';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM digital_twin.sensor_spatial
        WHERE sensor_id = 'test-sensor'
          AND device_id = 'test-device'
          AND asset_id = 'test-rack'
          AND NOT position_verified
    ) THEN
        RAISE EXCEPTION 'unverified sensor position is not distinguishable';
    END IF;

    SELECT count(*) INTO measurement_count_before_status
    FROM digital_twin.measurements;

    SELECT count(*) INTO ingestion_event_count_before_status
    FROM digital_twin.ingestion_events;

    state_version_before_status := current_row.state_version;

    SELECT *
    INTO status_result
    FROM digital_twin.record_device_status(
        p_site_id => 'other-site',
        p_device_id => 'test-device',
        p_boot_id => 'test-status-boot',
        p_status => 'offline'
    );

    IF status_result.outcome IS DISTINCT FROM 'rejected'
        OR status_result.reason_code IS DISTINCT FROM 'identity-mismatch' THEN
        RAISE EXCEPTION 'device status site identity mismatch was not rejected';
    END IF;

    UPDATE digital_twin.devices
    SET enabled = false
    WHERE device_id = 'test-device';

    SELECT *
    INTO status_result
    FROM digital_twin.record_device_status(
        p_site_id => 'test-site',
        p_device_id => 'test-device',
        p_boot_id => 'test-status-boot',
        p_status => 'offline'
    );

    IF status_result.outcome IS DISTINCT FROM 'rejected'
        OR status_result.reason_code IS DISTINCT FROM 'disabled-device' THEN
        RAISE EXCEPTION 'disabled device status was not rejected';
    END IF;

    UPDATE digital_twin.devices
    SET enabled = true
    WHERE device_id = 'test-device';

    SELECT *
    INTO status_result
    FROM digital_twin.record_device_status(
        p_site_id => 'test-site',
        p_device_id => 'test-device',
        p_boot_id => 'test-status-boot',
        p_status => 'offline'
    );

    SELECT cs.source_status, cs.state_version
    INTO status_row
    FROM digital_twin.current_state_projection AS cs
    WHERE cs.asset_id = 'test-rack'
      AND cs.metric = 'temperature';

    IF status_result.outcome IS DISTINCT FROM 'accepted'
        OR status_result.resulting_status IS DISTINCT FROM 'offline'
        OR status_row.source_status IS DISTINCT FROM 'offline'
        OR status_row.state_version <= state_version_before_status
        OR status_result.resulting_state_versions
            IS DISTINCT FROM ARRAY[status_row.state_version] THEN
        RAISE EXCEPTION 'offline device status did not advance canonical source state';
    END IF;

    state_version_offline := status_row.state_version;

    SELECT *
    INTO status_result
    FROM digital_twin.record_device_status(
        p_site_id => 'test-site',
        p_device_id => 'test-device',
        p_boot_id => 'test-status-boot',
        p_status => 'offline'
    );

    IF (
        SELECT state_version
        FROM digital_twin.current_state_projection
        WHERE asset_id = 'test-rack'
          AND metric = 'temperature'
    ) IS DISTINCT FROM state_version_offline
        OR cardinality(status_result.resulting_state_versions) <> 0 THEN
        RAISE EXCEPTION 'repeated offline status advanced canonical state version';
    END IF;

    SELECT *
    INTO status_result
    FROM digital_twin.record_device_status(
        p_site_id => 'test-site',
        p_device_id => 'test-device',
        p_boot_id => 'test-status-boot',
        p_status => 'online'
    );

    SELECT cs.source_status, cs.state_version
    INTO status_row
    FROM digital_twin.current_state_projection AS cs
    WHERE cs.asset_id = 'test-rack'
      AND cs.metric = 'temperature';

    IF status_result.outcome IS DISTINCT FROM 'accepted'
        OR status_row.source_status IS DISTINCT FROM 'unknown'
        OR status_row.state_version <= state_version_offline
        OR status_result.resulting_state_versions
            IS DISTINCT FROM ARRAY[status_row.state_version] THEN
        RAISE EXCEPTION 'online device status did not clear offline source state';
    END IF;

    SELECT connectivity_status, connectivity_boot_id, connectivity_received_at
    INTO status_row
    FROM digital_twin.devices
    WHERE device_id = 'test-device';

    IF status_row.connectivity_status IS DISTINCT FROM 'online'
        OR status_row.connectivity_boot_id IS DISTINCT FROM 'test-status-boot'
        OR status_row.connectivity_received_at IS NULL THEN
        RAISE EXCEPTION 'latest device connectivity status was not persisted';
    END IF;

    IF (SELECT count(*) FROM digital_twin.measurements)
            IS DISTINCT FROM measurement_count_before_status
        OR (SELECT count(*) FROM digital_twin.ingestion_events)
            IS DISTINCT FROM ingestion_event_count_before_status THEN
        RAISE EXCEPTION 'device status created telemetry history or ingestion events';
    END IF;

    SELECT *
    INTO second_source_result
    FROM digital_twin.accept_measurement(
        p_topic => 'dt/test-site/telemetry/test-device/test-sensor-2/temperature',
        p_schema_version => '1.0',
        p_site_id => 'test-site',
        p_device_id => 'test-device',
        p_boot_id => 'test-boot',
        p_seq => 1,
        p_sensor_id => 'test-sensor-2',
        p_asset_id => 'test-rack',
        p_metric => 'temperature',
        p_value => 22,
        p_unit => 'degC',
        p_ts => '2026-01-01T00:02:00Z',
        p_quality => 'good',
        p_raw_value => 65535
    );

    IF second_source_result.outcome IS DISTINCT FROM 'accepted'
        OR (SELECT count(*) FROM digital_twin.current_state
            WHERE asset_id = 'test-rack' AND metric = 'temperature') <> 2 THEN
        RAISE EXCEPTION 'distinct sensor source did not retain independent current state';
    END IF;

    SELECT *
    INTO second_source_result
    FROM digital_twin.accept_measurement(
        p_topic => 'dt/test-site/telemetry/test-device/test-sensor-2/temperature',
        p_schema_version => '1.0',
        p_site_id => 'test-site',
        p_device_id => 'test-device',
        p_boot_id => 'test-boot',
        p_seq => 1,
        p_sensor_id => 'test-sensor-2',
        p_asset_id => 'test-rack',
        p_metric => 'temperature',
        p_value => 22,
        p_unit => 'degC',
        p_ts => '2026-01-01T00:02:00Z',
        p_quality => 'good',
        p_raw_value => 65535
    );

    IF second_source_result.outcome IS DISTINCT FROM 'duplicate' THEN
        RAISE EXCEPTION 'raw-word QoS1 duplicate was not idempotent';
    END IF;

    SELECT *
    INTO second_source_result
    FROM digital_twin.accept_measurement(
        p_topic => 'dt/test-site/telemetry/test-device/test-sensor-2/temperature',
        p_schema_version => '1.0',
        p_site_id => 'test-site',
        p_device_id => 'test-device',
        p_boot_id => 'test-boot',
        p_seq => 1,
        p_sensor_id => 'test-sensor-2',
        p_asset_id => 'test-rack',
        p_metric => 'temperature',
        p_value => 22,
        p_unit => 'degC',
        p_ts => '2026-01-01T00:02:00Z',
        p_quality => 'good',
        p_raw_value => 0
    );

    IF second_source_result.outcome IS DISTINCT FROM 'rejected' THEN
        RAISE EXCEPTION 'conflicting raw word reused an existing QoS1 identity';
    END IF;

    SELECT *
    INTO second_source_result
    FROM digital_twin.accept_measurement(
        p_topic => 'dt/test-site/telemetry/test-device/test-sensor-2/temperature',
        p_schema_version => '1.0',
        p_site_id => 'test-site',
        p_device_id => 'test-device',
        p_boot_id => 'test-boot',
        p_seq => 2,
        p_sensor_id => 'test-sensor-2',
        p_asset_id => 'test-rack',
        p_metric => 'temperature',
        p_value => 23,
        p_unit => 'degC',
        p_ts => '2026-01-01T00:03:00Z',
        p_quality => 'good',
        p_raw_value => 0
    );

    IF second_source_result.outcome IS DISTINCT FROM 'accepted'
        OR (SELECT raw_value FROM digital_twin.current_state
            WHERE asset_id = 'test-rack'
              AND sensor_id = 'test-sensor-2'
              AND metric = 'temperature') IS DISTINCT FROM 0
        OR (SELECT count(*) FROM digital_twin.measurements
            WHERE sensor_id = 'test-sensor-2'
              AND raw_value IN (0, 65535)) <> 2 THEN
        RAISE EXCEPTION 'same sensor source update or raw-word history is inconsistent';
    END IF;

    SELECT *
    INTO acoustic_result
    FROM digital_twin.accept_measurement(
        p_topic => 'dt/test-site/telemetry/test-device/test-sound-rms/sound_rms_dbfs',
        p_schema_version => '1.0',
        p_site_id => 'test-site',
        p_device_id => 'test-device',
        p_boot_id => 'test-boot',
        p_seq => 4,
        p_sensor_id => 'test-sound-rms',
        p_asset_id => 'test-rack',
        p_metric => 'sound_rms_dbfs',
        p_value => -34.5,
        p_unit => 'dBFS',
        p_ts => '2026-01-01T00:04:00Z',
        p_quality => 'good'
    );

    IF acoustic_result.outcome IS DISTINCT FROM 'accepted' THEN
        RAISE EXCEPTION 'diagnostic RMS dBFS was not accepted';
    END IF;

    SELECT *
    INTO acoustic_result
    FROM digital_twin.accept_measurement(
        p_topic => 'dt/test-site/telemetry/test-device/test-sound-peak/sound_peak_dbfs',
        p_schema_version => '1.0',
        p_site_id => 'test-site',
        p_device_id => 'test-device',
        p_boot_id => 'test-boot',
        p_seq => 4,
        p_sensor_id => 'test-sound-peak',
        p_asset_id => 'test-rack',
        p_metric => 'sound_peak_dbfs',
        p_value => -12.25,
        p_unit => 'dBFS',
        p_ts => '2026-01-01T00:04:00Z',
        p_quality => 'good'
    );

    IF acoustic_result.outcome IS DISTINCT FROM 'accepted'
        OR (SELECT count(*) FROM digital_twin.current_state
            WHERE asset_id = 'test-rack') <> 4 THEN
        RAISE EXCEPTION 'diagnostic dBFS current state is inconsistent';
    END IF;

    SELECT *
    INTO acoustic_result
    FROM digital_twin.accept_measurement(
        p_topic => 'dt/test-site/telemetry/test-device/test-sound-rms/sound_rms_dbfs',
        p_schema_version => '1.0',
        p_site_id => 'test-site',
        p_device_id => 'test-device',
        p_boot_id => 'test-boot',
        p_seq => 5,
        p_sensor_id => 'test-sound-rms',
        p_asset_id => 'test-rack',
        p_metric => 'sound_rms_dbfs',
        p_value => -30,
        p_unit => 'dBFS',
        p_ts => '2026-01-01T00:05:00Z',
        p_quality => 'good',
        p_raw_value => 1
    );

    IF acoustic_result.outcome IS DISTINCT FROM 'rejected' THEN
        RAISE EXCEPTION 'raw value was accepted for an acoustic metric';
    END IF;
END;
$test$;

SELECT 'foundation checks passed' AS result;

ROLLBACK;
