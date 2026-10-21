import assert from 'node:assert/strict';
import test from 'node:test';
import { createShellyAdapter, shellyEnvelope, shellyMeasurements } from './shelly.js';

const deviceId = 'shellyplugpmg3-48f6eebbf3f4';
const replySource = 'dt-r1-local-backend/shelly';
const status = {
  'pm1:0': {
    id: 0,
    voltage: 200.9,
    current: 0.298,
    apower: -52.3,
    freq: 50.1,
    aenergy: { total: 999.415 },
    ret_aenergy: { total: 595.545 },
  },
  sys: { unixtime: 1791642898, uptime: 566, ram_free: 82404, restart_required: false },
  wifi: { status: 'got ip', rssi: -40 },
  mqtt: { connected: true },
};
const snapshot = (value = status) =>
  Buffer.from(JSON.stringify({ id: 'dt-status', src: deviceId, dst: replySource, result: value }));

test('PM1 native values and units are preserved without invented PF, VA or temperature', () => {
  const values = new Map(shellyMeasurements(status, true).map((v) => [v.metric, v]));
  assert.equal(values.get('active_power_w').value, -52.3);
  assert.equal(values.get('returned_energy_wh_total').unit, 'Wh');
  assert.equal(values.get('returned_energy_wh_total').value, 595.545);
  for (const metric of ['power_factor_ratio', 'apparent_power_va', 'device_temperature_c'])
    assert.equal(values.has(metric), false);
  assert.equal(values.get('wifi_rssi_dbm').value, -40);
  assert.equal(values.get('mqtt_connected').value, 1);
  assert.equal(values.get('pm1_error_count').value, 0);
});

test('optional electrical fields and native error/flag conditions are supported only when supplied', () => {
  const values = shellyMeasurements({
    'pm1:0': {
      aprtpower: 42,
      pf: 0.8,
      temperature: { tC: 40 },
      errors: ['power_meter_failure'],
      flags: ['undervoltage'],
    },
  });
  assert.deepEqual(
    values.map(({ metric }) => metric),
    [
      'apparent_power_va',
      'power_factor_ratio',
      'device_temperature_c',
      'pm1_error_count',
      'pm1_flag_count',
    ]
  );
  assert.ok(values.every(({ quality }) => quality === 'degraded'));
  assert.deepEqual(shellyMeasurements({ 'pm1:0': { voltage: null } }), []);
  assert.deepEqual(shellyMeasurements({ 'pm1:0': { voltage: true, current: '0.1' } }), []);
});

test('native source, RPC reply ID, timestamp precision and receive-time provenance are validated', () => {
  const at = new Date('2026-10-10T14:34:58.000Z');
  const event = Buffer.from(
    JSON.stringify({
      src: deviceId,
      method: 'NotifyStatus',
      params: { ts: 1791642900.01, 'pm1:0': { current: 0.348 } },
    })
  );
  assert.equal(
    shellyEnvelope(`${deviceId}/events/rpc`, event, deviceId, replySource, at).ts,
    '2026-10-10T14:35:00.010Z'
  );
  const component = shellyEnvelope(
    `${deviceId}/status/pm1:0`,
    Buffer.from('{"voltage":200}'),
    deviceId,
    replySource,
    at
  );
  assert.equal(component.timestampBasis, 'received');
  assert.equal(component.ts, at.toISOString());
  assert.equal(
    shellyEnvelope(`${replySource}/rpc`, Buffer.from('{"src":"other"}'), deviceId, replySource, at),
    null
  );
  assert.throws(
    () =>
      shellyEnvelope(
        `${replySource}/rpc`,
        snapshot({ ...status, wifi: { password: 'must-not-store' } }),
        deviceId,
        replySource,
        at
      ),
    /Private fields/
  );
  assert.throws(
    () => shellyEnvelope(`${deviceId}/status/sys`, Buffer.alloc(65537), deviceId, replySource, at),
    /limit/
  );
});

function database() {
  const calls = [];
  const receipts = new Set();
  const messages = [];
  const measurements = [];
  let reject = false;
  const client = {
    release() {},
    async query(sql, values = []) {
      calls.push(sql);
      if (sql.includes('SELECT boot_id')) return { rows: [] };
      if (sql.includes('INSERT INTO digital_twin.shelly_messages')) {
        if (receipts.has(values[3])) return { rows: [] };
        receipts.add(values[3]);
        messages.push(values);
        return { rows: [{ message_id: String(receipts.size) }] };
      }
      if (sql.includes('SELECT metric,value')) return { rows: client.current ?? [] };
      if (sql.includes('accept_measurement')) {
        measurements.push(values);
        return {
          rows: [
            {
              outcome: reject ? 'rejected' : 'accepted',
              persisted_measurement_id: '1',
              resulting_state_version: '1',
            },
          ],
        };
      }
      if (sql.includes('record_device_status'))
        return { rows: [{ outcome: 'accepted', status: 'online', resulting_state_versions: [] }] };
      return { rows: [] };
    },
  };
  return {
    pool: {
      async connect() {
        return client;
      },
    },
    calls,
    measurements,
    messages,
    client,
    setReject() {
      reject = true;
    },
  };
}

test('adapter reuses canonical ingestion, archives native payload and suppresses QoS redelivery', async () => {
  const db = database();
  const adapter = createShellyAdapter({
    pool: db.pool,
    deviceId,
    replySource,
    onCurrentState() {},
  });
  await adapter.ingest(`${replySource}/rpc`, snapshot());
  const count = db.measurements.length;
  assert.ok(count > 6);
  await adapter.ingest(`${replySource}/rpc`, snapshot());
  assert.equal(db.measurements.length, count);
  assert.equal(db.measurements[0][3], deviceId);
  assert.equal(db.measurements[0][4], 'inferred-start-1791642332');
  assert.ok(db.calls.includes('COMMIT'));
  const rebooted = { ...status, sys: { ...status.sys, unixtime: 1791643000, uptime: 5 } };
  await adapter.ingest(`${replySource}/rpc`, snapshot(rebooted));
  assert.equal(db.measurements.at(-1)[4], 'inferred-start-1791642995');
});

test('failed canonical ingestion rolls back the native receipt and never emits SSE', async () => {
  const db = database();
  db.setReject();
  let updates = 0;
  const adapter = createShellyAdapter({
    pool: db.pool,
    deviceId,
    replySource,
    onCurrentState() {
      updates++;
    },
  });
  await assert.rejects(adapter.ingest(`${replySource}/rpc`, snapshot()), /rejected/);
  assert.ok(db.calls.includes('ROLLBACK'));
  assert.equal(db.calls.includes('COMMIT'), false);
  assert.equal(updates, 0);
});

test('overlapping component status does not rewrite identical recent canonical values', async () => {
  const db = database();
  const adapter = createShellyAdapter({
    pool: db.pool,
    deviceId,
    replySource,
    onCurrentState() {},
  });
  await adapter.ingest(`${replySource}/rpc`, snapshot());
  db.client.current = [
    {
      metric: 'voltage_v',
      value: 200.9,
      quality: 'good',
      source_ts: new Date(),
      received_at: new Date(),
    },
  ];
  const count = db.measurements.length;
  await adapter.ingest(`${deviceId}/status/pm1:0`, Buffer.from('{"voltage":200.9}'));
  assert.equal(db.measurements.length, count);
});

test('invalid native packets never reach the database or reconnect the canonical ESP32 subscriber', async () => {
  const db = database();
  let rejected = 0;
  const adapter = createShellyAdapter({
    pool: db.pool,
    deviceId,
    replySource,
    onCurrentState() {},
    onOutcome(outcome) {
      if (outcome === 'rejected') rejected++;
    },
  });
  await adapter.ingest(`${deviceId}/status/sys`, Buffer.from('not-json'));
  assert.equal(rejected, 1);
  assert.equal(db.calls.length, 0);
});

test('partial updates preserve native degraded state until a complete status clears it', async () => {
  const db = database();
  const adapter = createShellyAdapter({
    pool: db.pool,
    deviceId,
    replySource,
    onCurrentState() {},
  });
  await adapter.ingest(`${replySource}/rpc`, snapshot());
  db.client.current = [{ metric: 'pm1_flag_count', value: 1 }];
  await adapter.ingest(`${deviceId}/status/pm1:0`, Buffer.from('{"voltage":190}'));
  assert.equal(db.measurements.at(-1)[12], 'degraded');
  await adapter.ingest(
    `${replySource}/rpc`,
    snapshot({
      ...status,
      sys: { ...status.sys, unixtime: status.sys.unixtime + 10, uptime: status.sys.uptime + 10 },
    })
  );
  assert.equal(db.measurements.at(-1)[12], 'good');
});

test('PM1 component receive-time provenance does not degrade valid measurement quality', async () => {
  const db = database();
  const adapter = createShellyAdapter({
    pool: db.pool,
    deviceId,
    replySource,
    onCurrentState() {},
  });
  await adapter.ingest(`${replySource}/rpc`, snapshot());
  db.client.current = [
    { metric: 'pm1_error_count', value: 0 },
    { metric: 'pm1_flag_count', value: 0 },
    {
      metric: 'voltage_v',
      value: status['pm1:0'].voltage,
      quality: 'unknown',
      source_ts: new Date(),
      received_at: new Date(),
    },
  ];
  const offset = db.measurements.length;
  const payload = Buffer.from(JSON.stringify(status['pm1:0']));
  await adapter.ingest(`${deviceId}/status/pm1:0`, payload);
  const measurements = db.measurements.slice(offset);
  assert.equal(measurements.length, 6);
  assert.ok(measurements.every((values) => values[12] === 'good'));
  assert.equal(measurements.find((values) => values[8] === 'active_power_w')[9], -52.3);
  assert.equal(db.messages.at(-1)[2], payload.toString());
  assert.equal(db.messages.at(-1)[5], 'received');
  assert.ok(measurements.every((values) => values[11] === db.messages.at(-1)[4]));
});

test('unsynced-clock snapshots retain valid PM1 quality and receive-time provenance', async () => {
  const db = database();
  const adapter = createShellyAdapter({
    pool: db.pool,
    deviceId,
    replySource,
    onCurrentState() {},
  });
  await adapter.ingest(`${replySource}/rpc`, snapshot());
  const offset = db.measurements.length;
  await adapter.ingest(
    `${replySource}/rpc`,
    snapshot({ ...status, sys: { ...status.sys, unixtime: null } })
  );
  assert.ok(db.measurements.slice(offset).every((values) => values[12] === 'good'));
  assert.equal(db.messages.at(-1)[5], 'received');
});
