import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LIVE_STATE,
  LiveCurrentState,
  currentStateKey,
  summarizeDeviceStatus,
} from './live-state.js';

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
