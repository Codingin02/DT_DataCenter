import assert from 'node:assert/strict';
import test from 'node:test';
import {
  observationState,
  observationLabel,
  visibleStreamRecords,
  readingLabel,
  measurementValue,
  sourceLabel,
  sourceFilterKey,
  unitLabel,
} from './presentation.js';

test('presentation labels preserve source identities and signed measurements', () => {
  assert.equal(sourceLabel('shelly-active_power_w'), 'Rack Power');
  assert.equal(sourceLabel('sht31-a-temperature'), 'SHT31 A');
  assert.equal(sourceLabel('sht31-b-humidity'), 'SHT31 B');
  assert.equal(sourceLabel('rack-sound-peak'), 'INMP441');
  assert.equal(sourceLabel('unregistered-source'), 'Unnamed source');
  assert.equal(sourceLabel('unregistered-source', 'Canonical Sensor'), 'Canonical Sensor');
  assert.equal(sourceLabel('sht31-a-temperature', 'SHT31 A'), 'SHT31 A');
  assert.equal(sourceLabel('unregistered-source', '  '), 'Unnamed source');
  assert.equal(readingLabel({ metric: 'active_power_w', value: -52.3, unit: 'W' }), '-52.3 W');
  assert.equal(unitLabel('percent_rh'), '%RH');
  assert.equal(unitLabel('bytes_per_second'), 'B/s');
});

test('physical measurement precision is display-only and consistent across engineering units', () => {
  for (const [metric, unit, value, expected] of [
    ['temperature', 'degC', 34.0764465, '34.1 °C'],
    ['humidity', 'percent_rh', 42.3681984, '42.4 %RH'],
    ['sound_rms_dbfs', 'dBFS', -47.60849, '-47.6 dBFS'],
    ['sound_peak_dbfs', 'dBFS', -35.2647285, '-35.3 dBFS'],
    ['temperature', 'degC', 34, '34.0 °C'],
    ['temperature', 'degC', -0.01, '0.0 °C'],
  ]) {
    const record = Object.freeze({ metric, unit, value, raw_value: 29608 });
    assert.equal(readingLabel(record), expected);
    assert.equal(record.value, value);
    assert.equal(record.raw_value, 29608);
  }
  assert.equal(measurementValue(34.0764465, '°C'), '34.1');
  assert.equal(measurementValue(42.3681984, '%RH'), '42.4');
  assert.equal(readingLabel({ metric: 'temperature', unit: 'degC', value: NaN }), 'Not observed');
  assert.equal(measurementValue(Infinity, 'dBFS'), 'Not observed');
  assert.equal(measurementValue(11234.123456, 'Wh', 3), '11,234.123');
  assert.equal(measurementValue(11234.123456, 'Wh', 6), '11,234.123456');
  assert.equal(readingLabel({ metric: 'current_a', value: -0.259123, unit: 'A' }), '-0.259123 A');
});

test('neutral source labels preserve distinct selector identities and existing source groups', () => {
  const records = [
    { sensor_id: 'unregistered-a', metric: 'temperature' },
    { sensor_id: 'unregistered-b', metric: 'temperature' },
  ];
  assert.equal(sourceFilterKey('sht31-a-temperature'), 'SHT31 A');
  assert.equal(sourceFilterKey('unregistered-a'), 'unregistered-a');
  assert.equal(sourceFilterKey('unregistered-b'), 'unregistered-b');
  assert.deepEqual(
    visibleStreamRecords(
      records,
      { temperature: { group: 'environment' } },
      'all',
      'unregistered-b'
    ),
    [records[1]]
  );
});

test('connection and restart states are not displayed as percentages', () => {
  assert.equal(readingLabel({ metric: 'mqtt_connected', value: 1 }), 'Connected');
  assert.equal(readingLabel({ metric: 'wifi_connected', value: 0 }), 'Disconnected');
  assert.equal(readingLabel({ metric: 'restart_required', value: 0 }), 'Not required');
  assert.equal(
    readingLabel({ metric: 'power_factor_ratio', value: 0.91, unit: 'ratio' }),
    '0.91 ratio'
  );
});

test('freshness expires without another message while offline and error states remain explicit', () => {
  const record = { source_status: 'unknown', quality: 'good', source_ts: '2026-10-10T12:00:00Z' };
  assert.equal(observationState(record, Date.parse('2026-10-10T12:00:10Z')), 'fresh');
  assert.equal(observationState(record, Date.parse('2026-10-10T12:02:01Z')), 'stale');
  assert.equal(observationState({ ...record, source_status: 'offline' }), 'offline');
  assert.equal(observationState({ ...record, source_status: 'invalid' }), 'invalid');
  assert.equal(
    observationState({ ...record, quality: 'degraded' }, Date.parse(record.source_ts) + 1000),
    'degraded'
  );
});

test('normal measurement cells are quiet while stale and offline stay explicit', () => {
  const record = {
    metric: 'wifi_rssi_dbm',
    value: -39,
    unit: 'dBm',
    quality: 'good',
    source_ts: '2026-10-10T12:00:00Z',
  };
  assert.equal(observationLabel(record, Date.parse(record.source_ts) + 1000), '-39 dBm');
  assert.equal(observationLabel(record, Date.parse(record.source_ts) + 121000), '-39 dBm · stale');
  assert.equal(observationLabel({ ...record, source_status: 'offline' }), '-39 dBm · offline');
  assert.equal(readingLabel({ metric: 'net_operation_status', value: 1 }), 'Connected');
});

test('source-specific expiry uses real observation timestamps, not value changes or redraw time', () => {
  const record = {
    metric: 'net_bytes_received_total',
    value: 100,
    unit: 'bytes',
    source_ts: '2026-10-10T12:00:00Z',
    quality: 'good',
  };
  const now = Date.parse(record.source_ts);
  assert.equal(observationState(record, now + 5000), 'fresh');
  assert.equal(observationState(record, now + 16000), 'delayed');
  assert.equal(observationState({ ...record, quality: 'degraded' }, now + 31000), 'stale');
  assert.equal(
    observationState(
      { ...record, metric: 'temperature', device_id: 'rack-controller' },
      now + 11000
    ),
    'delayed'
  );
  assert.equal(
    observationState(
      { ...record, source_ts: '2026-10-10T13:00:00Z', received_at: record.source_ts },
      now + 31000
    ),
    'stale'
  );
});

test('Streams defaults to actual records grouped by domain and supports source filtering', () => {
  const records = [
    { sensor_id: 'shelly-uptime_s', metric: 'uptime_s' },
    { sensor_id: 'sht31-a-temperature', metric: 'temperature' },
  ];
  const definitions = {
    uptime_s: { group: 'diagnostic' },
    temperature: { group: 'environment' },
    supply_current_ma: { group: 'diagnostic' },
  };
  assert.equal(visibleStreamRecords(records, definitions).length, 2);
  assert.equal(visibleStreamRecords(records, definitions)[0].metric, 'temperature');
  assert.equal(
    visibleStreamRecords(records, definitions, 'device', 'Rack Power')[0].metric,
    'uptime_s'
  );
  assert.equal(visibleStreamRecords(records, definitions, 'device', 'SHT31 A').length, 0);
});
