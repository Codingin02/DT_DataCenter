import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LIVE_STATE,
  LiveCurrentState,
  LiveObservationBuffer,
  currentStateKey,
  summarizeDeviceStatus,
} from './live-state.js';
import { liveChartOption } from './history-chart.js';
import { readingLabel } from './presentation.js';

const baseRecord = Object.freeze({
  contract_version: '1.0',
  asset_id: 'test-rack',
  metric: 'temperature',
  value: 20.5,
  unit: 'degC',
  site_id: 'test-site',
  device_id: 'test-device',
  sensor_id: 'test-sensor',
  boot_id: '00112233445566778899aabbccddeeff',
  seq: 1,
  source_ts: '2026-01-01T00:00:00.123456Z',
  received_at: '2026-01-01T00:00:01.000Z',
  quality: 'good',
  source_status: 'unknown',
  measurement_id: '1',
  state_version: '1',
  updated_at: '2026-01-01T00:00:01.000Z',
});

function createStore(options = {}) {
  return new LiveCurrentState({ assetId: 'test-rack', ...options });
}

test('current-state selection identity remains source-aware and collision-safe', () => {
  assert.equal(currentStateKey(baseRecord), '["test-rack","test-sensor","temperature"]');
  assert.notEqual(
    currentStateKey(baseRecord),
    currentStateKey({ ...baseRecord, sensor_id: 'test-sensor-2' })
  );
});

test('one physical current-state owner combines source assets and rejects simulator provenance', async () => {
  const calls = [];
  const rows = ['sht31-a', 'sht31-b', 'rack-acoustic'].map((asset_id, index) => ({
    ...baseRecord,
    asset_id,
    device_id: 'rack-controller',
    sensor_id: `physical-${index}`,
  }));
  const store = createStore({
    assetIds: rows.map((row) => row.asset_id),
    deviceId: 'rack-controller',
    fetchImpl: async (url) => {
      calls.push(url);
      return response(rows.filter((row) => url.includes(`/assets/${row.asset_id}/`)));
    },
  });
  await store.synchronize();
  assert.equal(store.records.length, 3);
  assert.equal(calls.length, 3);
  assert.equal(
    store.apply([{ ...rows[0], device_id: 'acceptance-mechanical-a', state_version: '2' }]),
    false
  );
  assert.equal(store.apply([{ ...rows[0], asset_id: 'other-rack', state_version: '3' }]), false);
  assert.equal(store.current.size, 3);
  store.destroy();
});

test('physical source scope validates asset and device identities', () => {
  assert.throws(() => createStore({ assetIds: ['../unsafe'] }), /asset scope/);
  assert.throws(() => createStore({ deviceId: 'INVALID' }), /device_id/);
});

test('discovered real host assets join the same state owner without another EventSource', () => {
  const store = createStore();
  assert.equal(store.addAssets(['host-test']), true);
  assert.equal(store.addAssets(['host-test']), false);
  assert.throws(() => store.addAssets(['../unsafe']), /asset scope/);
  assert.equal(
    store.apply([
      {
        ...baseRecord,
        asset_id: 'host-test',
        device_id: 'host-test',
        metric: 'net_bytes_received_total',
        unit: 'bytes',
      },
    ]),
    true
  );
  assert.equal(store.current.size, 1);
  assert.equal(store.eventSource, null);
  store.destroy();
});

test('physical NIC changes select the latest observed interface without removing stored identities', () => {
  const store = createStore({ assetIds: ['host-test'] });
  const record = {
    ...baseRecord,
    asset_id: 'host-test',
    device_id: 'host-test',
    metric: 'net_bytes_received_total',
    unit: 'bytes',
  };
  store.apply([
    { ...record, sensor_id: 'nic-first-net_bytes_received_total', state_version: '1' },
    { ...record, sensor_id: 'nic-second-net_bytes_received_total', state_version: '2' },
  ]);
  assert.equal(store.records.length, 1);
  assert.equal(store.records[0].sensor_id, 'nic-second-net_bytes_received_total');
  assert.equal(store.current.size, 2);
  store.destroy();
});

test('Shelly electrical and health records share the existing physical state owner', () => {
  const deviceId = 'shellyplugpmg3-48f6eebbf3f4';
  const store = createStore({ assetIds: ['sht31-a', deviceId] });
  const electrical = [
    ['active_power_w', 'W', -52.3],
    ['returned_energy_wh_total', 'Wh', 595.545],
    ['wifi_rssi_dbm', 'dBm', -40],
    ['ram_free_bytes', 'bytes', 82404],
    ['uptime_s', 's', 566],
    ['mqtt_connected', 'ratio', 1],
    ['pm1_error_count', 'count', 0],
  ].map(([metric, unit, value], index) => ({
    ...baseRecord,
    asset_id: deviceId,
    device_id: deviceId,
    sensor_id: `shelly-${metric}`,
    metric,
    unit,
    value,
    measurement_id: String(index + 2),
    state_version: String(index + 2),
  }));
  store.apply([
    { ...baseRecord, asset_id: 'sht31-a', device_id: 'rack-controller' },
    ...electrical,
  ]);
  assert.equal(store.records.length, 8);
  assert.equal(store.invalidRecordCount, 0);
  assert.equal(store.records.find((record) => record.metric === 'active_power_w').value, -52.3);
  store.destroy();
});

class FakeEventSource {
  constructor(url) {
    this.url = url;
    this.listeners = new Map();
    this.closed = false;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type) {
    this.listeners.delete(type);
  }

  emit(type, data) {
    this.listeners.get(type)?.(data === undefined ? {} : { data: JSON.stringify(data) });
  }

  close() {
    this.closed = true;
  }

  static instances = [];
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function response(rows) {
  return { ok: true, status: 200, json: async () => rows };
}

test('unconfigured asset starts no stream and keeps zero state', () => {
  const connection = [];
  const store = new LiveCurrentState({
    assetId: '',
    EventSourceImpl: () => assert.fail('EventSource constructed'),
    onConnectionChange: (state) => connection.push(state),
  });
  assert.equal(store.start(), false);
  assert.equal(store.records.length, 0);
  assert.deepEqual(connection, [LIVE_STATE.UNCONFIGURED]);
});

test('canonical metrics preserve source identity, raw bounds, and timestamps', () => {
  const store = createStore();
  const records = [
    { ...baseRecord, raw_value: 0 },
    {
      ...baseRecord,
      sensor_id: 'humidity-sensor',
      metric: 'humidity',
      unit: 'percent_rh',
      raw_value: 65535,
      state_version: '2',
    },
    {
      ...baseRecord,
      sensor_id: 'sound-rms',
      metric: 'sound_rms_dbfs',
      unit: 'dBFS',
      value: -34.5,
      state_version: '3',
    },
    {
      ...baseRecord,
      sensor_id: 'sound-peak',
      metric: 'sound_peak_dbfs',
      unit: 'dBFS',
      value: -12.25,
      state_version: '4',
    },
    {
      ...baseRecord,
      sensor_id: 'nic-rx',
      metric: 'net_receive_throughput_bytes_per_second',
      unit: 'bytes_per_second',
      value: 1250000,
      state_version: '5',
    },
    {
      ...baseRecord,
      sensor_id: 'rack-power',
      metric: 'active_power_w',
      unit: 'W',
      value: 1840,
      state_version: '6',
    },
  ];
  assert.equal(store.apply(records), true);
  assert.equal(store.records.length, 6);
  assert.equal(store.records.find(({ metric }) => metric === 'temperature').raw_value, 0);
  assert.equal(store.records.find(({ metric }) => metric === 'humidity').raw_value, 65535);
  assert.equal(
    Object.hasOwn(
      store.records.find(({ metric }) => metric === 'sound_rms_dbfs'),
      'raw_value'
    ),
    false
  );
  assert.equal(store.records[0].source_ts, baseRecord.source_ts);
  assert.equal(store.records[0].received_at, baseRecord.received_at);
});

test('source-aware replacement is bounded and rejects stale state versions', () => {
  const store = createStore();
  store.apply([
    baseRecord,
    { ...baseRecord, sensor_id: 'test-sensor-2', value: 21, state_version: '2' },
  ]);
  assert.equal(store.records.length, 2);
  store.apply([{ ...baseRecord, value: 22, state_version: '3' }]);
  store.apply([{ ...baseRecord, value: 19, state_version: '2' }]);
  assert.equal(store.records.length, 2);
  assert.equal(store.records.find(({ sensor_id }) => sensor_id === 'test-sensor').value, 22);
});

test('malformed identity, metric pairs, and acoustic raw words cannot enter state', () => {
  const store = createStore();
  assert.equal(
    store.apply([
      { ...baseRecord, sensor_id: '' },
      { ...baseRecord, unit: 'dBFS' },
      { ...baseRecord, metric: 'sound_rms_dbfs', unit: 'dBFS', raw_value: 0 },
      { ...baseRecord, value: Number.NaN },
      { ...baseRecord, undocumented: true },
    ]),
    false
  );
  assert.equal(store.records.length, 0);
  assert.equal(store.invalidRecordCount, 5);
  assert.equal(store.apply([{ ...baseRecord, asset_id: 'other-rack' }]), false);
  assert.equal(store.invalidRecordCount, 5);
});

test('stream-first snapshot synchronization preserves newer SSE state and resyncs on reconnect', async () => {
  FakeEventSource.instances.length = 0;
  const snapshots = [deferred(), deferred()];
  let fetchCount = 0;
  const connection = [];
  const store = createStore({
    EventSourceImpl: FakeEventSource,
    fetchImpl: () => snapshots[fetchCount++].promise,
    onConnectionChange: (state) => connection.push(state),
  });

  assert.equal(store.start(), true);
  assert.equal(store.start(), false);
  assert.equal(FakeEventSource.instances.length, 1);
  const source = FakeEventSource.instances[0];
  assert.equal(source.url, '/api/current-state/events');
  source.emit('open');
  assert.equal(fetchCount, 1);
  source.listeners.get('current-state')({ data: '{' });
  assert.equal(store.invalidRecordCount, 1);
  source.emit('current-state', { ...baseRecord, value: 25, state_version: '10' });
  snapshots[0].resolve(response([{ ...baseRecord, value: 19, state_version: '9' }]));
  await snapshots[0].promise;
  await new Promise(setImmediate);
  assert.equal(store.records[0].value, 25);
  assert.equal(connection.at(-1), LIVE_STATE.LIVE);

  source.emit('error');
  source.emit('open');
  assert.equal(fetchCount, 2);
  snapshots[1].resolve(response([{ ...baseRecord, value: 26, state_version: '11' }]));
  await snapshots[1].promise;
  await new Promise(setImmediate);
  assert.equal(store.records[0].value, 26);
  assert.equal(connection.includes(LIVE_STATE.DISCONNECTED), true);
  store.destroy();
  assert.equal(source.closed, true);
  assert.equal(source.listeners.size, 0);
});

test('destroy prevents a late snapshot from mutating state', async () => {
  FakeEventSource.instances.length = 0;
  const snapshot = deferred();
  const store = createStore({
    EventSourceImpl: FakeEventSource,
    fetchImpl: () => snapshot.promise,
  });
  store.start();
  FakeEventSource.instances[0].emit('open');
  store.destroy();
  snapshot.resolve(response([baseRecord]));
  await snapshot.promise;
  await new Promise(setImmediate);
  assert.equal(store.records.length, 0);
});

test('snapshot fetch keeps the global receiver required by browser fetch', async () => {
  FakeEventSource.instances.length = 0;
  let receiver;
  const store = createStore({
    EventSourceImpl: FakeEventSource,
    fetchImpl() {
      receiver = this;
      return Promise.resolve(response([]));
    },
  });
  store.start();
  FakeEventSource.instances[0].emit('open');
  await new Promise(setImmediate);
  assert.equal(receiver, globalThis);
  store.destroy();
});

test('device presence stays distinct from live-stream state', () => {
  assert.equal(summarizeDeviceStatus([]), 'unknown — not observed');
  assert.equal(summarizeDeviceStatus([{ source_status: 'offline' }]), 'offline');
  assert.equal(
    summarizeDeviceStatus([{ source_status: 'unknown' }]),
    'unknown — no direct online status observed'
  );
});

function observation(version, milliseconds = version * 1020, extra = {}) {
  const time = new Date(Date.parse(baseRecord.source_ts) + milliseconds).toISOString();
  return {
    ...baseRecord,
    device_id: 'rack-controller',
    source_ts: time,
    received_at: time,
    updated_at: time,
    seq: version,
    measurement_id: String(version),
    state_version: String(version),
    ...extra,
  };
}

test('the existing SSE owner feeds current display and live chart without duplicate observations', async () => {
  const buffer = new LiveObservationBuffer();
  const first = observation(1, 1020, { value: 34.0764465 });
  const now = Date.parse(first.source_ts);
  let currentLabel;
  let chart;
  const instances = FakeEventSource.instances.length;
  const store = createStore({
    EventSourceImpl: FakeEventSource,
    fetchImpl: async () => response([first]),
    onRecordsChange(records) {
      currentLabel = readingLabel(records[0]);
      if (buffer.append(records[0], true, now))
        chart = liveChartOption(buffer.points, {
          sensorId: first.sensor_id,
          metric: first.metric,
          unit: first.unit,
          label: 'Temperature',
          now,
        });
    },
    onConnectionChange(state) {
      if (state === LIVE_STATE.DISCONNECTED) buffer.append(store.records[0], false, now);
    },
  });
  store.start();
  const source = FakeEventSource.instances.at(-1);
  source.emit('current-state', first);
  assert.equal(currentLabel, '34.1 °C');
  assert.equal(chart.series[0].data[0].value[1], first.value);
  assert.equal(chart.series[0].data[0].value[0], now);
  source.emit('current-state', first);
  source.emit('current-state', observation(1, 0, { value: 99 }));
  source.emit('error');
  source.emit('open');
  await new Promise(setImmediate);
  assert.equal(buffer.points.length, 1);
  assert.equal(currentLabel, '34.1 °C');
  source.emit('current-state', observation(2, 2040, { value: first.value }));
  assert.equal(buffer.points.length, 2);
  assert.equal(buffer.points[1].breakBefore, true);
  assert.equal(chart.series[0].data.filter((point) => point.value[1] !== null).length, 2);
  assert.equal(store.start(), false);
  assert.equal(FakeEventSource.instances.length, instances + 1);
  store.destroy();
  assert.equal(source.closed, true);
});

test('live buffer keeps exact source identity and rejects old versions, times, duplicates and invalid values', () => {
  const buffer = new LiveObservationBuffer();
  const first = observation(2);
  const now = Date.parse(first.source_ts);
  assert.equal(buffer.append(Object.freeze(first), true, now), true);
  for (const record of [
    observation(1),
    observation(3, 1020),
    observation(4, 3060, { measurement_id: first.measurement_id }),
    observation(5, 4080, { value: NaN }),
    observation(6, 4080, { sensor_id: 'other-sensor' }),
    observation(7, 4080, { asset_id: 'other-asset' }),
  ])
    assert.equal(buffer.append(record, true, now), false);
  assert.equal(buffer.points.length, 1);
  assert.equal(buffer.points[0].value, first.value);
  assert.equal(buffer.append(observation(8, 4080), true, now), true);
});

test('live buffer marks missing samples, changed boots and connection loss instead of interpolating', () => {
  const buffer = new LiveObservationBuffer();
  const first = observation(1);
  const now = Date.parse(first.source_ts);
  for (const record of [first, observation(2), observation(3, 4080)])
    buffer.append(record, true, now);
  assert.deepEqual(
    buffer.points.map((point) => point.breakBefore),
    [false, false, true]
  );
  buffer.append(observation(4, 5100, { boot_id: 'new-boot' }), true, now);
  assert.equal(buffer.points.at(-1).breakBefore, true);
  buffer.append(observation(5, 6120, { source_status: 'offline' }), true, now);
  assert.equal(buffer.points.length, 4);
  buffer.append(observation(6, 7140, { boot_id: 'new-boot' }), true, now);
  assert.equal(buffer.points.at(-1).breakBefore, true);
});

test('live buffer retention is bounded by count and five minutes without inventing samples', () => {
  const buffer = new LiveObservationBuffer();
  const start = Date.parse(baseRecord.source_ts);
  for (let index = 1; index <= 400; index++)
    buffer.append(observation(index, index * 100), true, start + index * 100);
  assert.equal(buffer.points.length, 300);
  assert.equal(buffer.points[0].seq, 101);
  assert.equal(buffer.points.at(-1).seq, 400);
  assert.equal(buffer.append(observation(400, 40_000), true, start + 400_000), true);
  assert.equal(buffer.points.length, 0);
  assert.equal(buffer.append(observation(400, 40_000), true, start + 400_000), false);
});
