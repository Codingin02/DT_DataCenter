import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NETWORK_UNITS,
  networkCounters,
  networkRates,
  networkSourceId,
  createHostNetworkCollector,
} from './host-network.js';

const nic = 'Intel[R] Wi-Fi 6 AX203';
const sample = (metric, value, labels = '') => `windows_${metric}{nic="${nic}"${labels}} ${value}`;
const text = [
  sample('net_bytes_received_total', 1000),
  sample('net_bytes_sent_total', 2000),
  sample('net_current_bandwidth_bytes', 35875000),
  sample('net_nic_operation_status', 1, ',status="up"'),
  sample('net_nic_operation_status', 0, ',status="down"'),
].join('\n');

test('physical Windows NIC labels, bandwidth bytes/s and unavailable counters remain exact', () => {
  const values = networkCounters(text, 'windows', nic);
  assert.equal(values.net_current_bandwidth_bytes * 8, 287000000);
  assert.equal(values.net_operation_status, 1);
  assert.equal(values.net_packets_received_errors_total, undefined);
  assert.throws(() => networkCounters(text, 'windows', 'vEthernet'), /unavailable/);
  for (const metric of Object.keys(NETWORK_UNITS))
    assert.match(networkSourceId(`host-test:${nic}`, metric), /^[a-z0-9][a-z0-9._-]{0,63}$/);
});

test('real elapsed counter differences and full-duplex utilization use correct units', () => {
  const values = {
    net_bytes_received_total: 6000,
    net_bytes_sent_total: 12000,
    net_current_bandwidth_bytes: 10000,
    net_operation_status: 1,
  };
  const rates = networkRates(
    values,
    { net_bytes_received_total: 1000, net_bytes_sent_total: 2000 },
    5000
  );
  assert.equal(rates.net_receive_throughput_bytes_per_second, 1000);
  assert.equal(rates.net_transmit_throughput_bytes_per_second, 2000);
  assert.equal(rates.net_link_utilization_ratio, 0.2);
  for (const elapsed of [0, 20000])
    assert.equal(networkRates(values, values, elapsed).net_link_utilization_ratio, undefined);
  assert.equal(
    networkRates(values, { net_bytes_received_total: 9000, net_bytes_sent_total: 12000 }, 5000)
      .net_receive_throughput_bytes_per_second,
    undefined
  );
  assert.equal(
    networkRates({ ...values, net_current_bandwidth_bytes: undefined }, values, 5000)
      .net_link_utilization_ratio,
    undefined
  );
});

test('Linux host exporter uses distinct native names and never substitutes container metrics', () => {
  const result = networkCounters(
    'node_network_receive_bytes_total{device="eno1"} 100\nnode_network_transmit_bytes_total{device="eno1"} 200\nnode_network_speed_bytes{device="eno1"} 125000000\nnode_network_up{device="eno1"} 1',
    'linux',
    'eno1'
  );
  assert.equal(result.net_bytes_received_total, 100);
  assert.equal(result.net_current_bandwidth_bytes, 125000000);
  assert.equal(result.net_packets_sent_total, undefined);
  assert.throws(() => networkCounters(text, 'linux', 'eth0'), /unavailable/);
});

test('collector publishes existing canonical QoS 1 identity once and stops its owned timer', async () => {
  const packets = [];
  const collector = createHostNetworkCollector({
    configuration: {
      url: 'http://localhost/metrics',
      platform: 'windows',
      deviceId: 'host-test',
      nic,
    },
    connected: () => true,
    fetchImpl: async () => ({ ok: true, text: async () => text }),
    publish: async (...args) => packets.push(args),
    onError: (error) => {
      throw error;
    },
  });
  collector.start();
  collector.start();
  await new Promise((resolve) => setImmediate(resolve));
  await collector.stop();
  assert.equal(packets.length, 4);
  const [topic, raw, options] = packets[0];
  const record = JSON.parse(raw);
  assert.equal(options.qos, 1);
  assert.equal(topic, `dt/campus-lab/telemetry/host-test/${record.sensor_id}/${record.metric}`);
  assert.match(record.boot_id, /^collector-/);
  assert.ok(Number.isFinite(Date.parse(record.ts)));
});
