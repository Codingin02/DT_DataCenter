BEGIN;

INSERT INTO digital_twin.metric_definitions (metric, unit, source_class)
VALUES
    ('returned_energy_wh_total', 'Wh', 'electrical'),
    ('wifi_rssi_dbm', 'dBm', 'hardware'),
    ('ram_size_bytes', 'bytes', 'hardware'),
    ('ram_free_bytes', 'bytes', 'hardware'),
    ('ram_min_free_bytes', 'bytes', 'hardware'),
    ('fs_size_bytes', 'bytes', 'hardware'),
    ('fs_free_bytes', 'bytes', 'hardware'),
    ('device_temperature_c', 'degC', 'hardware'),
    ('mqtt_connected', 'ratio', 'hardware'),
    ('wifi_connected', 'ratio', 'hardware'),
    ('restart_required', 'ratio', 'hardware'),
    ('reset_reason', 'count', 'hardware'),
    ('pm1_error_count', 'count', 'electrical'),
    ('pm1_flag_count', 'count', 'electrical')
ON CONFLICT (metric) DO NOTHING;

CREATE TABLE IF NOT EXISTS digital_twin.shelly_messages (
    message_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    device_id digital_twin.canonical_id NOT NULL REFERENCES digital_twin.devices,
    topic text NOT NULL,
    raw_payload text NOT NULL,
    fingerprint text NOT NULL,
    source_ts timestamptz NOT NULL,
    timestamp_basis text NOT NULL CHECK (timestamp_basis IN ('device', 'received')),
    boot_id text NOT NULL,
    received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (device_id, fingerprint)
);

INSERT INTO digital_twin.schema_migrations (version)
VALUES ('shelly') ON CONFLICT (version) DO NOTHING;

COMMIT;
