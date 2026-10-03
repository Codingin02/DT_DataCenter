-- Migration: production-identity
-- Registers production identities for campus-lab ESP32-S3 physical controller

INSERT INTO digital_twin.sites (site_id, display_name)
VALUES ('campus-lab', 'Campus Data Center Laboratory')
ON CONFLICT (site_id) DO NOTHING;

INSERT INTO digital_twin.assets (asset_id, site_id, asset_type, display_name)
VALUES
    ('rack-controller', 'campus-lab', 'infrastructure', 'ESP32-S3 Measurement Controller'),
    ('sht31-a', 'campus-lab', 'environmental_sensor', 'SEN0331 Sensor A'),
    ('sht31-b', 'campus-lab', 'environmental_sensor', 'SEN0331 Sensor B'),
    ('rack-acoustic', 'campus-lab', 'environmental_sensor', 'INMP441 Acoustic Sensor')
ON CONFLICT (asset_id) DO NOTHING;

INSERT INTO digital_twin.devices (device_id, site_id, asset_id)
VALUES ('rack-controller', 'campus-lab', 'rack-controller')
ON CONFLICT (device_id) DO NOTHING;

INSERT INTO digital_twin.sensors (sensor_id, site_id, device_id, asset_id, metric, unit)
VALUES
    ('sht31-a-temperature', 'campus-lab', 'rack-controller', 'sht31-a', 'temperature', 'degC'),
    ('sht31-a-humidity', 'campus-lab', 'rack-controller', 'sht31-a', 'humidity', 'percent_rh'),
    ('sht31-b-temperature', 'campus-lab', 'rack-controller', 'sht31-b', 'temperature', 'degC'),
    ('sht31-b-humidity', 'campus-lab', 'rack-controller', 'sht31-b', 'humidity', 'percent_rh'),
    ('rack-sound-rms', 'campus-lab', 'rack-controller', 'rack-acoustic', 'sound_rms_dbfs', 'dBFS'),
    ('rack-sound-peak', 'campus-lab', 'rack-controller', 'rack-acoustic', 'sound_peak_dbfs', 'dBFS')
ON CONFLICT (sensor_id) DO NOTHING;

INSERT INTO digital_twin.schema_migrations (version)
VALUES ('production-identity')
ON CONFLICT (version) DO NOTHING;
