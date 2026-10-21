import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { URLSearchParams } from 'node:url';

import {
  createCurrentStateEvents,
  createDeviceStatusIngestor,
  createHttpHandler,
  createIngestor,
  normalizeSpatialRegistration,
} from './app.js';
import { loadConfiguration } from './config.js';
import { createMetrics, PROMETHEUS_CONTENT_TYPE } from './metrics.js';

const telemetry = {
  schema_version: '1.0',
  site_id: 'test-site',
  device_id: 'test-device',
  boot_id: 'test-boot',
  seq: 1,
  sensor_id: 'test-sensor',
  asset_id: 'test-rack',
  metric: 'temperature',
  value: 20,
  unit: 'degC',
  ts: '2026-01-01T00:00:00.000Z',
  quality: 'good',
};
const topic = 'dt/test-site/telemetry/test-device/test-sensor/temperature';
const deviceStatus = {
  schema_version: '1.0',
  site_id: 'test-site',
  device_id: 'test-device',
  boot_id: 'test-boot',
  status: 'online',
};
const deviceStatusTopic = 'dt/test-site/device/test-device/status';
const runtimeEnvironment = {
  PGHOST: '127.0.0.1',
  PGPORT: '5432',
  PGDATABASE: 'DT_DataCenter',
  PGUSER: 'bagus',
  PGPASSWORD: 'test-database-secret',
  MQTT_URL: 'mqtt://127.0.0.1:1883',
  MQTT_CLIENT_ID: 'test-backend',
  MQTT_USERNAME: 'test-user',
  MQTT_PASSWORD: 'test-mqtt-secret',
  MQTT_SESSION_EXPIRY_SECONDS: '86400',
  MQTT_MAX_PAYLOAD_BYTES: '65536',
  HTTP_HOST: '127.0.0.1',
  HTTP_PORT: '3000',
};

test('host monitoring is explicit, platform-specific and excludes URL credentials', () => {
  assert.equal(loadConfiguration(runtimeEnvironment).hostNetwork, null);
  const env = {
    ...runtimeEnvironment,
    HOST_EXPORTER_URL: 'http://host.docker.internal:9182/metrics',
    HOST_EXPORTER_PLATFORM: 'windows',
    HOST_DEVICE_ID: 'host-test',
    HOST_NETWORK_NIC: 'Intel[R] Wi-Fi 6 AX203',
  };
  assert.equal(loadConfiguration(env).hostNetwork.nic, env.HOST_NETWORK_NIC);
  assert.throws(
    () => loadConfiguration({ ...env, HOST_EXPORTER_URL: 'http://user:secret@localhost/metrics' }),
    /credentials/
  );
  assert.throws(() => loadConfiguration({ ...env, HOST_NETWORK_NIC: '' }), /required/);
  assert.throws(
    () => loadConfiguration({ ...env, HOST_EXPORTER_PLATFORM: 'container' }),
    /platform/
  );
});

test('startup configuration requires explicit valid runtime settings', () => {
  const configuration = loadConfiguration(runtimeEnvironment);
  assert.equal(configuration.http.port, 3000);
  assert.equal(configuration.mqtt.maxPayloadBytes, 65536);
  assert.equal(configuration.postgres.password, 'test-database-secret');

  assert.throws(
    () => loadConfiguration({ ...runtimeEnvironment, HTTP_HOST: ' ' }),
    /HTTP_HOST is required/
  );
  assert.throws(
    () => loadConfiguration({ ...runtimeEnvironment, PGPORT: '5432.5' }),
    /PGPORT must be an integer/
  );
  assert.throws(
    () => loadConfiguration({ ...runtimeEnvironment, MQTT_URL: 'mqtt://user:secret@localhost' }),
    /MQTT_URL must not include credentials/
  );
});

test('ingestion validates the canonical payload and preserves duplicate outcome', async () => {
  const calls = [];
  let acceptedCalls = 0;
  const query = async (text, values) => {
    calls.push({ text, values });
    if (!text.includes('accept_measurement')) {
      throw new Error('Unexpected query.');
    }

    acceptedCalls += 1;
    return {
      rows: [
        acceptedCalls === 1
          ? {
              outcome: 'accepted',
              persisted_measurement_id: '1',
              resulting_state_version: '1',
            }
          : {
              outcome: 'duplicate',
              persisted_measurement_id: '1',
              resulting_state_version: '1',
            },
      ],
    };
  };
  const ingest = createIngestor({ query });
  const payload = Buffer.from(JSON.stringify(telemetry));

  assert.equal((await ingest(topic, payload)).outcome, 'accepted');
  assert.deepEqual(await ingest(topic, payload), {
    outcome: 'duplicate',
    persisted_measurement_id: '1',
    resulting_state_version: '1',
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].values, [
    topic,
    '1.0',
    'test-site',
    'test-device',
    'test-boot',
    1,
    'test-sensor',
    'test-rack',
    'temperature',
    20,
    'degC',
    '2026-01-01T00:00:00.000Z',
    'good',
    null,
  ]);
});

test('typed raw words and diagnostic dBFS metric pairs follow the canonical schema', async () => {
  const accepted = [];
  const rejected = [];
  const query = async (text, values) => {
    if (text.includes('accept_measurement')) {
      accepted.push(values);
      return {
        rows: [
          {
            outcome: 'accepted',
            persisted_measurement_id: String(accepted.length),
            resulting_state_version: String(accepted.length),
          },
        ],
      };
    }
    rejected.push(values);
    return { rows: [{ record_ingestion_rejection: String(rejected.length) }] };
  };
  const ingest = createIngestor({ query });
  const send = (payload) => {
    const payloadTopic = `dt/${payload.site_id}/telemetry/${payload.device_id}/${payload.sensor_id}/${payload.metric}`;
    return ingest(payloadTopic, Buffer.from(JSON.stringify(payload)));
  };

  for (const payload of [
    telemetry,
    { ...telemetry, raw_value: 0 },
    { ...telemetry, raw_value: 65535 },
    { ...telemetry, metric: 'humidity', unit: 'percent_rh', raw_value: 0 },
    { ...telemetry, metric: 'humidity', unit: 'percent_rh', raw_value: 65535 },
    { ...telemetry, metric: 'sound_rms_dbfs', unit: 'dBFS', value: -34.5 },
    { ...telemetry, metric: 'sound_peak_dbfs', unit: 'dBFS', value: -12.25 },
    {
      ...telemetry,
      metric: 'net_receive_throughput_bytes_per_second',
      unit: 'bytes_per_second',
      value: 1250000,
    },
    { ...telemetry, metric: 'active_power_w', unit: 'W', value: 850 },
    { ...telemetry, metric: 'crc_error_count', unit: 'count', value: 0 },
    { ...telemetry, metric: 'uptime_s', unit: 's', value: 3600 },
    { ...telemetry, metric: 'clip_ratio', unit: 'ratio', value: 0.002 },
    { ...telemetry, metric: 'supply_voltage_v', unit: 'V', value: 3.29 },
    { ...telemetry, metric: 'supply_current_ma', unit: 'mA', value: 186.4 },
  ]) {
    assert.equal((await send(payload)).outcome, 'accepted');
  }

  for (const payload of [
    { ...telemetry, raw_value: -1 },
    { ...telemetry, raw_value: 65536 },
    { ...telemetry, raw_value: 1.5 },
    { ...telemetry, raw_value: '1' },
    { ...telemetry, metric: 'sound_rms_dbfs', unit: 'dBFS', raw_value: 1 },
    { ...telemetry, metric: 'sound_rms_dbfs', unit: 'degC' },
    { ...telemetry, metric: 'temperature', unit: 'dBFS' },
    { ...telemetry, metric: 'supply_current_ma', unit: 'A' },
    { ...telemetry, metric: 'sound_spl', unit: 'dBA' },
    { ...telemetry, undocumented: true },
  ]) {
    assert.equal((await send(payload)).outcome, 'rejected');
  }
  const nonFinite = JSON.stringify({
    ...telemetry,
    metric: 'sound_rms_dbfs',
    unit: 'dBFS',
  }).replace('"value":20', '"value":1e400');
  assert.equal(
    (
      await ingest(
        'dt/test-site/telemetry/test-device/test-sensor/sound_rms_dbfs',
        Buffer.from(nonFinite)
      )
    ).outcome,
    'rejected'
  );

  assert.deepEqual(
    accepted.slice(1, 5).map((values) => values[13]),
    [0, 65535, 0, 65535]
  );
  assert.equal(accepted[0][13], null);
  assert.equal(rejected.length, 11);
});

test('invalid metric and unit are rejected before accepted persistence', async () => {
  const calls = [];
  const query = async (text, values) => {
    calls.push({ text, values });
    return { rows: [{ record_ingestion_rejection: '1' }] };
  };
  const ingest = createIngestor({ query });
  const invalid = { ...telemetry, unit: 'percent_rh' };

  assert.deepEqual(await ingest(topic, Buffer.from(JSON.stringify(invalid))), {
    outcome: 'rejected',
    reason_code: 'unsupported-metric-unit',
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].text, /record_ingestion_rejection/);
  assert.equal(calls[0].values[2], 'unsupported-metric-unit');
});

test('invalid boot identity and NUL diagnostics are safely rejected', async () => {
  const calls = [];
  const query = async (text, values) => {
    calls.push({ text, values });
    return { rows: [{ record_ingestion_rejection: '1' }] };
  };
  const ingest = createIngestor({ query });

  assert.deepEqual(
    await ingest(topic, Buffer.from(JSON.stringify({ ...telemetry, boot_id: ' test-boot' }))),
    { outcome: 'rejected', reason_code: 'schema-validation' }
  );
  assert.deepEqual(await ingest(topic, Buffer.from('{\0')), {
    outcome: 'rejected',
    reason_code: 'malformed-json',
  });
  assert.equal(calls.length, 2);
  assert.ok(calls.every(({ text }) => text.includes('record_ingestion_rejection')));
  assert.ok(calls.flatMap(({ values }) => values).every((value) => !String(value).includes('\0')));
});

test('oversized MQTT payload is rejected without retaining its body', async () => {
  const calls = [];
  const query = async (text, values) => {
    calls.push({ text, values });
    return { rows: [{ record_ingestion_rejection: '1' }] };
  };
  const ingest = createIngestor({ query, maxPayloadBytes: 8 });

  assert.deepEqual(await ingest(topic, Buffer.alloc(9, 'x')), {
    outcome: 'rejected',
    reason_code: 'payload-too-large',
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].values[1], null);
  assert.equal(calls[0].values[2], 'payload-too-large');
});

test('device status persists separately and emits each changed canonical state once', async () => {
  const calls = [];
  let statusWrites = 0;
  const query = async (text, values) => {
    calls.push({ text, values });
    if (text.includes('record_device_status')) {
      statusWrites += 1;
      assert.doesNotMatch(text, /accept_measurement/);
      return {
        rows: [
          {
            outcome: 'accepted',
            status: 'online',
            boot_id: 'test-boot',
            received_at: new Date('2026-01-01T00:00:00.000Z'),
            resulting_state_versions: statusWrites === 1 ? ['2'] : [],
          },
        ],
      };
    }
    assert.match(text, /WHERE state_version = ANY/);
    assert.deepEqual(values, [['2']]);
    return {
      rows: [
        {
          contract_version: '1.0',
          asset_id: 'test-rack',
          metric: 'temperature',
          value: '20',
          unit: 'degC',
          site_id: 'test-site',
          device_id: 'test-device',
          sensor_id: 'test-sensor',
          boot_id: 'test-boot',
          seq: '1',
          source_ts: new Date('2026-01-01T00:00:00.000Z'),
          received_at: new Date('2026-01-01T00:00:01.000Z'),
          quality: 'good',
          source_status: 'unknown',
          measurement_id: '1',
          state_version: '2',
          updated_at: new Date('2026-01-01T00:00:02.000Z'),
        },
      ],
    };
  };
  const updates = [];
  const ingest = createDeviceStatusIngestor({
    query,
    onCurrentState: (state) => updates.push(state),
  });
  const payload = Buffer.from(JSON.stringify(deviceStatus));

  assert.equal((await ingest(deviceStatusTopic, payload)).outcome, 'accepted');
  assert.equal((await ingest(deviceStatusTopic, payload)).outcome, 'accepted');
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0].values, ['test-site', 'test-device', 'test-boot', 'online']);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].state_version, '2');
  assert.equal(updates[0].source_status, 'unknown');
});

test('canonical offline device status validates and preserves identity', async () => {
  const query = async (text, values) => {
    assert.match(text, /record_device_status/);
    assert.deepEqual(values, ['test-site', 'test-device', 'test-boot', 'offline']);
    return {
      rows: [
        {
          outcome: 'accepted',
          status: 'offline',
          boot_id: 'test-boot',
          received_at: new Date('2026-01-01T00:00:00.000Z'),
          resulting_state_versions: [],
        },
      ],
    };
  };
  const ingest = createDeviceStatusIngestor({ query });

  assert.equal(
    (
      await ingest(
        deviceStatusTopic,
        Buffer.from(JSON.stringify({ ...deviceStatus, status: 'offline' }))
      )
    ).outcome,
    'accepted'
  );
});

test('unknown device status identity remains a status rejection', async () => {
  const query = async (text, values) => {
    assert.match(text, /record_device_status/);
    assert.doesNotMatch(text, /accept_measurement/);
    assert.deepEqual(values, ['test-site', 'test-device', 'test-boot', 'online']);
    return { rows: [{ outcome: 'rejected', reason_code: 'unknown-identity' }] };
  };
  const ingest = createDeviceStatusIngestor({ query });

  assert.deepEqual(await ingest(deviceStatusTopic, Buffer.from(JSON.stringify(deviceStatus))), {
    outcome: 'rejected',
    reason_code: 'unknown-identity',
  });
});

test('invalid device status is rejected without telemetry persistence', async () => {
  const calls = [];
  const query = async (text, values) => {
    calls.push({ text, values });
    assert.match(text, /record_ingestion_rejection/);
    assert.doesNotMatch(text, /accept_measurement|record_device_status/);
    return { rows: [{ record_ingestion_rejection: '1' }] };
  };
  const ingest = createDeviceStatusIngestor({ query });
  const payload = Buffer.from(JSON.stringify(deviceStatus));

  assert.deepEqual(await ingest('dt/other-site/device/test-device/status', payload), {
    outcome: 'rejected',
    reason_code: 'topic-mismatch',
  });
  assert.deepEqual(await ingest(deviceStatusTopic, Buffer.from('{')), {
    outcome: 'rejected',
    reason_code: 'malformed-json',
  });
  assert.deepEqual(
    await ingest(deviceStatusTopic, Buffer.from(JSON.stringify({ ...deviceStatus, seq: 1 }))),
    { outcome: 'rejected', reason_code: 'schema-validation' }
  );
  assert.deepEqual(
    await ingest(
      deviceStatusTopic,
      Buffer.from(JSON.stringify({ ...deviceStatus, boot_id: 'test\0boot' }))
    ),
    { outcome: 'rejected', reason_code: 'schema-validation' }
  );
  assert.equal(calls.length, 4);
});

test('SSE emits one accepted current-state update and removes disconnected clients', async (t) => {
  const currentStateEvents = createCurrentStateEvents();
  const outcomes = [
    {
      outcome: 'accepted',
      persisted_measurement_id: '1',
      resulting_state_version: '1',
    },
    {
      outcome: 'duplicate',
      persisted_measurement_id: '1',
      resulting_state_version: '1',
    },
    {
      outcome: 'rejected',
      persisted_measurement_id: '2',
      resulting_state_version: '1',
    },
    {
      outcome: 'accepted',
      persisted_measurement_id: '3',
      resulting_state_version: '1',
    },
  ];
  const currentStateRow = {
    contract_version: '1.0',
    asset_id: 'test-rack',
    metric: 'temperature',
    value: '20',
    unit: 'degC',
    site_id: 'test-site',
    device_id: 'test-device',
    sensor_id: 'test-sensor',
    boot_id: 'test-boot',
    seq: '1',
    source_ts: new Date('2026-01-01T00:00:00.000Z'),
    received_at: new Date('2026-01-01T00:00:01.000Z'),
    quality: 'good',
    source_status: 'unknown',
    measurement_id: '1',
    state_version: '1',
    updated_at: new Date('2026-01-01T00:00:01.000Z'),
  };
  let currentStateReads = 0;
  const query = async (text, values) => {
    if (text.includes('accept_measurement')) {
      const result = outcomes.shift();
      assert.ok(result);
      return { rows: [result] };
    }
    if (text.includes('WHERE measurement_id')) {
      currentStateReads += 1;
      if (values[0] === '1') {
        assert.deepEqual(values, ['1', '1']);
        return { rows: [currentStateRow] };
      }
      assert.deepEqual(values, ['3', '1']);
      return { rows: [] };
    }
    throw new Error('Unexpected query.');
  };
  const updates = [];
  const ingest = createIngestor({
    query,
    onCurrentState(currentState) {
      updates.push(currentState);
      currentStateEvents.publish(currentState);
    },
  });
  const server = createServer(createHttpHandler({ query, currentStateEvents }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    currentStateEvents.close();
    await new Promise((resolve) => server.close(resolve));
  });

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/current-state/events`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/event-stream; charset=utf-8');
  assert.equal(response.headers.get('cache-control'), 'no-cache, no-transform');
  assert.equal(response.headers.get('content-length'), null);
  assert.equal(response.headers.get('content-security-policy'), "default-src 'none'");
  assert.equal(currentStateEvents.clientCount, 1);

  const payload = Buffer.from(JSON.stringify(telemetry));
  assert.equal((await ingest(topic, payload)).outcome, 'accepted');
  assert.equal(updates.length, 1);
  assert.equal(currentStateReads, 1);

  const reader = response.body.getReader();
  let frame = '';
  while (frame.split('\n\n').length < 3) {
    const chunk = await reader.read();
    assert.equal(chunk.done, false);
    frame += Buffer.from(chunk.value).toString('utf8');
  }
  const [connected, event] = frame.split('\n\n');
  assert.equal(connected, 'event: connected\ndata: {}');
  const lines = event.split('\n');
  assert.equal(lines[0], 'id: 1');
  assert.equal(lines[1], 'event: current-state');
  assert.deepEqual(JSON.parse(lines[2].slice('data: '.length)), updates[0]);

  assert.equal((await ingest(topic, payload)).outcome, 'duplicate');
  assert.equal(
    (
      await ingest(
        topic,
        Buffer.from(
          JSON.stringify({
            ...telemetry,
            seq: 2,
          })
        )
      )
    ).outcome,
    'rejected'
  );
  assert.equal(
    (
      await ingest(
        topic,
        Buffer.from(
          JSON.stringify({
            ...telemetry,
            seq: 3,
            ts: '2025-12-31T23:59:00.000Z',
          })
        )
      )
    ).outcome,
    'accepted'
  );
  assert.equal(updates.length, 1);
  assert.equal(currentStateReads, 2);

  await reader.cancel();
  for (let attempt = 0; attempt < 20 && currentStateEvents.clientCount > 0; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(currentStateEvents.clientCount, 0);
});

test('current-state HTTP read uses the stable route and exact bigint identities', async (t) => {
  const query = async (text, values) => {
    assert.match(text, /FROM digital_twin\.current_state/);
    assert.match(text, /ORDER BY metric, sensor_id/);
    assert.deepEqual(values, ['test-rack']);
    return {
      rows: [
        {
          contract_version: '1.0',
          asset_id: 'test-rack',
          metric: 'temperature',
          value: '20',
          raw_value: 65535,
          unit: 'degC',
          site_id: 'test-site',
          device_id: 'test-device',
          sensor_id: 'test-sensor',
          boot_id: 'test-boot',
          seq: '1',
          source_ts: new Date('2026-01-01T00:00:00.000Z'),
          received_at: new Date('2026-01-01T00:00:01.000Z'),
          quality: 'good',
          source_status: 'unknown',
          measurement_id: '9007199254740993',
          state_version: '9007199254740994',
          updated_at: new Date('2026-01-01T00:00:01.000Z'),
        },
        {
          contract_version: '1.0',
          asset_id: 'test-rack',
          metric: 'temperature',
          value: '21',
          raw_value: 0,
          unit: 'degC',
          site_id: 'test-site',
          device_id: 'test-device',
          sensor_id: 'test-sensor-2',
          boot_id: 'test-boot',
          seq: '1',
          source_ts: new Date('2026-01-01T00:00:00.000Z'),
          received_at: new Date('2026-01-01T00:00:01.000Z'),
          quality: 'good',
          source_status: 'unknown',
          measurement_id: '9007199254740995',
          state_version: '9007199254740996',
          updated_at: new Date('2026-01-01T00:00:01.000Z'),
        },
      ],
    };
  };
  const server = createServer(
    createHttpHandler({
      query,
      logger: {
        error(message) {
          assert.fail(message);
        },
      },
    })
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  const response = await fetch(
    `http://127.0.0.1:${address.port}/api/assets/test-rack/current-state`
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.length, 2);
  assert.equal(body[0].measurement_id, '9007199254740993');
  assert.equal(body[0].state_version, '9007199254740994');
  assert.equal(body[0].seq, 1);
  assert.equal(body[0].raw_value, 65535);
  assert.equal(body[0].source_ts, '2026-01-01T00:00:00.000Z');
  assert.equal(body[1].sensor_id, 'test-sensor-2');
  assert.equal(body[1].raw_value, 0);
  assert.equal(response.headers.get('content-security-policy'), "default-src 'none'");
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('history HTTP read bounds five-day series with PostgreSQL time buckets', async (t) => {
  const calls = [];
  const query = async (text, values) => {
    calls.push({ text, values });
    assert.match(text, /date_bin/);
    assert.match(text, /avg\(value\)/);
    assert.match(text, /min\(value\)/);
    assert.match(text, /max\(value\)/);
    return {
      rows: [
        {
          sensor_id: 'test-sensor',
          unit: 'degC',
          bucket: new Date('2026-01-01T00:00:00.000Z'),
          average: '20.5',
          minimum: '18',
          maximum: '28',
          sample_count: '361',
          first_ts: new Date('2026-01-01T00:00:03.000Z'),
          last_ts: new Date('2026-01-01T00:06:03.000Z'),
          latest: '24',
          quality: 'degraded',
          good_count: '360',
          degraded_count: '1',
          unknown_count: '0',
          max_gap_seconds: '1',
        },
      ],
    };
  };
  const server = createServer(createHttpHandler({ query }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const { port } = server.address();
  const queryString = new URL('http://history.local').searchParams;
  queryString.set('metric', 'temperature');
  queryString.set('sensor_id', 'test-sensor');
  queryString.set('from', '2026-01-01T00:00:00.000Z');
  queryString.set('to', '2026-01-06T00:00:00.000Z');
  queryString.set('max_points', '1200');
  let response = await fetch(
    `http://127.0.0.1:${port}/api/assets/test-rack/history?${queryString}`
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.asset_id, 'test-rack');
  assert.equal(body.metric, 'temperature');
  assert.equal(body.max_points, 1200);
  assert.equal(body.bucket_seconds, 361);
  assert.deepEqual(body.series[0], {
    sensor_id: 'test-sensor',
    unit: 'degC',
    points: [
      {
        ts: '2026-01-01T00:00:00.000Z',
        first_ts: '2026-01-01T00:00:03.000Z',
        last_ts: '2026-01-01T00:06:03.000Z',
        average: 20.5,
        minimum: 18,
        maximum: 28,
        count: 361,
        latest: 24,
        quality: 'degraded',
        quality_counts: { good: 360, degraded: 1, unknown: 0 },
        max_gap_seconds: 1,
      },
    ],
    summary: {
      count: 361,
      minimum: 18,
      maximum: 28,
      average: 20.5,
      first_ts: '2026-01-01T00:00:03.000Z',
      quality_counts: { good: 360, degraded: 1, unknown: 0 },
      max_gap_seconds: 1,
      latest: 24,
      latest_ts: '2026-01-01T00:06:03.000Z',
      last_ts: '2026-01-01T00:06:03.000Z',
      quality: 'degraded',
      bucket_count: 1,
    },
  });
  assert.deepEqual(calls[0].values, [
    'test-rack',
    'temperature',
    'test-sensor',
    '2026-01-01T00:00:00.000Z',
    '2026-01-06T00:00:00.000Z',
    361,
  ]);

  response = await fetch(
    `http://127.0.0.1:${port}/api/assets/test-rack/history?metric=temperature&max_points=2001`
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'invalid_history_query' });
  assert.equal(calls.length, 1);
  assert.doesNotMatch(calls[0].text, /percentile_cont|width_bucket/);
});

test('history analytics preserves raw distributions and weights unequal bucket counts', async (t) => {
  const first = {
    sensor_id: 'test-sensor',
    unit: 'degC',
    bucket: '2026-01-01T00:00:00Z',
    first_ts: '2026-01-01T00:00:03Z',
    last_ts: '2026-01-01T00:00:12Z',
    average: '10',
    minimum: '0',
    maximum: '20',
    sample_count: '10',
    latest: '12',
    quality: 'good',
    good_count: '9',
    degraded_count: '1',
    unknown_count: '0',
    max_gap_seconds: '1',
    quartiles: [5, 10, 15],
    histogram: [{ minimum: 0, maximum: 20, count: 11 }],
  };
  const second = {
    ...first,
    bucket: '2026-01-01T00:01:00Z',
    first_ts: '2026-01-01T00:01:20Z',
    last_ts: '2026-01-01T00:01:20Z',
    average: '20',
    minimum: '20',
    maximum: '20',
    sample_count: '1',
    latest: '20',
    quality: 'unknown',
    good_count: '0',
    degraded_count: '0',
    unknown_count: '1',
    max_gap_seconds: '68',
    quartiles: null,
    histogram: null,
  };
  const calls = [];
  const query = async (text, values) => {
    calls.push({ text, values });
    assert.match(text, /percentile_cont\(ARRAY\[0\.25, 0\.5, 0\.75\]\)/);
    assert.match(text, /width_bucket\(value/);
    assert.match(text, /FROM observations/);
    assert.match(text, /ts DESC, received_at DESC, measurement_id DESC/);
    return {
      rows: [
        first,
        second,
        {
          ...first,
          sensor_id: 'test-sensor-2',
          histogram: [{ minimum: 0, maximum: 20, count: 10 }],
        },
      ],
    };
  };
  const server = createServer(createHttpHandler({ query }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/assets/test-rack/history`;
  const search = '?metric=temperature&from=2026-01-01T00:00:00Z&to=2026-01-02T00:00:00Z';
  let response = await fetch(`${base}${search}&analytics=true`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.series.length, 2);
  const summary = body.series[0].summary;
  assert.equal(summary.count, 11);
  assert.equal(summary.bucket_count, 2);
  assert.equal(summary.average, 120 / 11);
  assert.equal(summary.minimum, 0);
  assert.equal(summary.maximum, 20);
  assert.equal(summary.latest, 20);
  assert.equal(summary.latest_ts, '2026-01-01T00:01:20.000Z');
  assert.equal(summary.first_ts, '2026-01-01T00:00:03.000Z');
  assert.equal(summary.max_gap_seconds, 68);
  assert.deepEqual(summary.quality_counts, { good: 9, degraded: 1, unknown: 1 });
  assert.deepEqual(summary.quartiles, [5, 10, 15]);
  assert.deepEqual(summary.histogram, [{ minimum: 0, maximum: 20, count: 11 }]);
  assert.equal(body.series[1].summary.count, 10);
  for (const invalid of ['analytics=1', 'max_points=2001', 'to=2026-03-01T00:00:00Z']) {
    const invalidSearch = new URLSearchParams(search.slice(1));
    const [key, value] = invalid.split('=');
    invalidSearch.set(key, value);
    response = await fetch(`${base}?${invalidSearch}`);
    assert.equal(response.status, 400);
  }
  assert.equal(calls.length, 1);
});

test('spatial registration reads canonical sources and persists only confirmed positions', async (t) => {
  const sourceRow = {
    asset_id: 'test-rack',
    coordinate_system_id: 'test-world',
    device_id: 'test-device',
    metric: 'temperature',
    position_verified: false,
    sensor_id: 'test-sensor',
    unit: 'degC',
  };
  const queries = [];
  const query = async (text, values) => {
    queries.push({ text, values });
    if (text.includes('pg_advisory_xact_lock')) {
      return {
        rows: [
          {
            ...sourceRow,
            position_version: '2',
            position_x: 1.25,
            position_y: 0,
            position_z: -0.5,
          },
        ],
      };
    }
    return {
      rows: [
        {
          ...sourceRow,
          position_version: null,
          position_x: null,
          position_y: null,
          position_z: null,
        },
      ],
    };
  };
  const server = createServer(createHttpHandler({ query }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;

  let response = await fetch(`${origin}/api/spatial-registration`);
  assert.equal(response.status, 200);
  assert.deepEqual(
    await response.json(),
    normalizeSpatialRegistration([
      {
        ...sourceRow,
        position_version: null,
        position_x: null,
        position_y: null,
        position_z: null,
      },
    ])
  );

  response = await fetch(`${origin}/api/spatial-registration`, {
    body: JSON.stringify({
      coordinate_system_id: 'test-world',
      position: [1.25, 0, -0.5],
      sensor_id: 'test-sensor',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  assert.equal(response.status, 201);
  const anchor = await response.json();
  assert.equal(anchor.registration_state, 'reference_geometry');
  assert.deepEqual(anchor.position, [1.25, 0, -0.5]);
  assert.deepEqual(queries.at(-1).values, ['test-sensor', 'test-world', 1.25, 0, -0.5]);

  const queryCount = queries.length;
  response = await fetch(`${origin}/api/spatial-registration`, {
    body: JSON.stringify({
      coordinate_system_id: 'test-world',
      position: [1, null, 2],
      sensor_id: 'test-sensor',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  assert.equal(response.status, 400);
  assert.equal(queries.length, queryCount);
});

test('health is live and readiness requires MQTT plus PostgreSQL', async (t) => {
  let mqttReady = false;
  let databaseReady = false;
  let readinessQueries = 0;
  const errors = [];
  const query = async (text) => {
    assert.equal(text, 'SELECT 1');
    readinessQueries += 1;
    if (!databaseReady) {
      const error = new Error('Synthetic database unavailable.');
      error.code = 'SYNTHETIC_UNAVAILABLE';
      throw error;
    }
    return { rows: [{ '?column?': 1 }] };
  };
  const server = createServer(
    createHttpHandler({
      query,
      isMqttReady: () => mqttReady,
      logger: { error: (...arguments_) => errors.push(arguments_) },
    })
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;

  const health = await fetch(`${origin}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });

  let readiness = await fetch(`${origin}/ready`);
  assert.equal(readiness.status, 503);
  assert.equal(readinessQueries, 0);

  mqttReady = true;
  readiness = await fetch(`${origin}/ready`);
  assert.equal(readiness.status, 503);
  assert.equal(readinessQueries, 1);
  assert.equal(errors.length, 1);

  databaseReady = true;
  readiness = await fetch(`${origin}/ready`);
  assert.equal(readiness.status, 200);
  assert.deepEqual(await readiness.json(), { status: 'ready' });
});

test('HTTP serves only configured frontend assets while API routes retain priority', async (t) => {
  const staticRoot = await mkdtemp(join(tmpdir(), 'dt-frontend-assets-'));
  await mkdir(join(staticRoot, 'assets'));
  await mkdir(join(staticRoot, 'models'));
  await writeFile(join(staticRoot, 'index.html'), '<!doctype html><title>DT</title>');
  await writeFile(join(staticRoot, 'app.js'), 'export const ready = true;');
  await writeFile(join(staticRoot, 'assets', 'index-D4taTwin.js'), 'export const built = true;');
  await writeFile(join(staticRoot, 'models', 'rack.glb'), Buffer.from([0x67, 0x6c, 0x54, 0x46]));
  t.after(() => rm(staticRoot, { recursive: true }));

  const server = createServer(
    createHttpHandler({
      query: async () => ({ rows: [] }),
      staticRoot,
    })
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  let response = await fetch(`${origin}/`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/html/);
  assert.match(response.headers.get('content-security-policy'), /connect-src 'self' blob:/);
  assert.equal(response.headers.get('cache-control'), 'no-cache');

  response = await fetch(`${origin}/app.js`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/javascript/);
  assert.equal(response.headers.get('cache-control'), 'no-cache');

  response = await fetch(`${origin}/assets/index-D4taTwin.js`);
  assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');

  response = await fetch(`${origin}/models/rack.glb`);
  assert.equal(response.headers.get('cache-control'), 'public, max-age=3600');
  assert.equal(response.headers.get('cdn-cache-control'), 'public, max-age=86400');

  response = await fetch(`${origin}/api/not-a-route`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'not_found' });

  response = await fetch(`${origin}/%2e%2e%2fpackage.json`);
  assert.equal(response.status, 404);
});

test('Prometheus metrics reflect bounded runtime outcomes and dependency state', async (t) => {
  let now = 1700000000000;
  const metrics = createMetrics({ now: () => now });
  metrics.recordIngestion('duplicate');
  assert.match(
    metrics.render(),
    /dt_datacenter_backend_last_successful_ingestion_timestamp_seconds 0/
  );
  now += 1000;
  metrics.recordIngestion('accepted');
  now += 1000;
  metrics.recordIngestion('rejected');
  metrics.setMqttConnected(true);
  assert.throws(() => metrics.recordIngestion('unexpected'), /Unsupported ingestion outcome/);

  let mqttReady = false;
  let databaseReady = false;
  const query = async (text) => {
    assert.equal(text, 'SELECT 1');
    if (!databaseReady) throw new Error('Synthetic database unavailable.');
    return { rows: [{ '?column?': 1 }] };
  };
  const server = createServer(
    createHttpHandler({
      query,
      metrics,
      isMqttReady: () => mqttReady,
      logger: {
        error(message) {
          assert.fail(message);
        },
      },
    })
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;

  const unavailableReadiness = await fetch(`${origin}/ready`);
  assert.equal(unavailableReadiness.status, 503);
  await unavailableReadiness.json();

  let response = await fetch(`${origin}/metrics`);
  let body = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), PROMETHEUS_CONTENT_TYPE);
  assert.ok(body.includes('dt_datacenter_backend_mqtt_messages_total{outcome="accepted"} 1'));
  assert.ok(body.includes('dt_datacenter_backend_mqtt_messages_total{outcome="duplicate"} 1'));
  assert.ok(body.includes('dt_datacenter_backend_mqtt_messages_total{outcome="rejected"} 1'));
  assert.match(body, /dt_datacenter_backend_mqtt_connected 1/);
  assert.match(body, /dt_datacenter_backend_postgresql_ready 0/);
  assert.match(body, /dt_datacenter_backend_http_requests_total 2/);
  assert.match(body, /dt_datacenter_backend_http_errors_total 1/);
  assert.match(
    body,
    /dt_datacenter_backend_last_successful_ingestion_timestamp_seconds 1700000001/
  );

  mqttReady = true;
  databaseReady = true;
  const ready = await fetch(`${origin}/ready`);
  assert.equal(ready.status, 200);
  await ready.json();

  response = await fetch(`${origin}/metrics`);
  body = await response.text();
  assert.match(body, /dt_datacenter_backend_postgresql_ready 1/);
  assert.match(body, /dt_datacenter_backend_http_requests_total 4/);
  assert.match(body, /dt_datacenter_backend_http_errors_total 1/);
});
