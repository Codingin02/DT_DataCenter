import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { setInterval, clearInterval } from 'node:timers';

export const NETWORK_UNITS = {
  net_bytes_received_total: 'bytes',
  net_bytes_sent_total: 'bytes',
  net_packets_received_total: 'count',
  net_packets_sent_total: 'count',
  net_packets_received_errors_total: 'count',
  net_packets_outbound_errors_total: 'count',
  net_packets_received_discarded_total: 'count',
  net_packets_outbound_discarded_total: 'count',
  net_current_bandwidth_bytes: 'bytes_per_second',
  net_operation_status: 'ratio',
  net_receive_throughput_bytes_per_second: 'bytes_per_second',
  net_transmit_throughput_bytes_per_second: 'bytes_per_second',
  net_link_utilization_ratio: 'ratio',
};

const LINUX_COUNTERS = [
  'receive_bytes',
  'transmit_bytes',
  'receive_packets',
  'transmit_packets',
  'receive_errs',
  'transmit_errs',
  'receive_drop',
  'transmit_drop',
];

export function networkCounters(text, platform, nic) {
  const values = {};
  const counters = Object.keys(NETWORK_UNITS).slice(0, 8);
  for (const line of text.split('\n')) {
    const match = /^(\w+)\{([^}]*)\}\s+([^\s]+)(?:\s+\d+)?\s*$/.exec(line);
    if (!match) continue;
    const labels = Object.fromEntries(
      [...match[2].matchAll(/(\w+)="((?:\\.|[^"\\])*)"/g)].map(([, key, value]) => [
        key,
        value.replace(/\\([\\"n])/g, (_, c) => (c === 'n' ? '\n' : c)),
      ])
    );
    if (labels[platform === 'windows' ? 'nic' : 'device'] !== nic) continue;
    const value = Number(match[3]);
    if (!Number.isFinite(value) || value < 0) continue;
    let metric;
    if (platform === 'windows') {
      metric = match[1].replace(/^windows_/, '');
      if (match[1] === 'windows_net_nic_operation_status' && labels.status === 'up')
        metric = 'net_operation_status';
    } else {
      const index = LINUX_COUNTERS.findIndex((name) => match[1] === `node_network_${name}_total`);
      metric = counters[index];
      if (match[1] === 'node_network_speed_bytes') metric = 'net_current_bandwidth_bytes';
      if (match[1] === 'node_network_up') metric = 'net_operation_status';
    }
    if (metric in NETWORK_UNITS && metric !== 'net_nic_operation_status') values[metric] = value;
  }
  if (!('net_bytes_received_total' in values) || !('net_bytes_sent_total' in values))
    throw new Error('Configured host NIC counters are unavailable.');
  if (!(values.net_current_bandwidth_bytes > 0)) delete values.net_current_bandwidth_bytes;
  return values;
}

export function networkRates(values, previous, elapsedMs) {
  const result = { ...values };
  if (!previous || elapsedMs < 1000 || elapsedMs > 15000) return result;
  const rx = values.net_bytes_received_total - previous.net_bytes_received_total;
  const tx = values.net_bytes_sent_total - previous.net_bytes_sent_total;
  if (rx < 0 || tx < 0) return result;
  result.net_receive_throughput_bytes_per_second = (rx * 1000) / elapsedMs;
  result.net_transmit_throughput_bytes_per_second = (tx * 1000) / elapsedMs;
  if (values.net_current_bandwidth_bytes > 0 && values.net_operation_status === 1) {
    // Full-duplex utilization is the busier direction, not RX + TX.
    result.net_link_utilization_ratio =
      Math.max(
        result.net_receive_throughput_bytes_per_second,
        result.net_transmit_throughput_bytes_per_second
      ) / values.net_current_bandwidth_bytes;
  }
  return result;
}

export function networkSourceId(nic, metric) {
  return `nic-${createHash('sha256').update(nic).digest('hex').slice(0, 10)}-${metric}`;
}

export async function registerHostNetwork(query, { deviceId, nic }) {
  await query(
    `INSERT INTO digital_twin.assets (asset_id,site_id,asset_type,display_name) VALUES ($1,'campus-lab','infrastructure',$2) ON CONFLICT DO NOTHING`,
    [deviceId, nic]
  );
  await query(
    `INSERT INTO digital_twin.devices (device_id,site_id,asset_id) VALUES ($1,'campus-lab',$1) ON CONFLICT DO NOTHING`,
    [deviceId]
  );
  for (const [metric, unit] of Object.entries(NETWORK_UNITS)) {
    await query(
      `INSERT INTO digital_twin.sensors (sensor_id,site_id,device_id,asset_id,metric,unit) VALUES ($1,'campus-lab',$2,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [networkSourceId(`${deviceId}:${nic}`, metric), deviceId, metric, unit]
    );
  }
}

export function createHostNetworkCollector({
  configuration,
  publish,
  connected,
  onError,
  fetchImpl = fetch,
}) {
  let timer;
  let pending = Promise.resolve();
  let stopped = false;
  let busy = false;
  let failed = false;
  let previous;
  let previousTime;
  let seq = 0;
  const bootId = `collector-${randomUUID()}`;
  const poll = async () => {
    if (busy || stopped) return;
    if (!connected()) {
      previous = undefined;
      return;
    }
    busy = true;
    try {
      const response = await fetchImpl(configuration.url, {
        signal: globalThis.AbortSignal.timeout(3000),
        redirect: 'error',
      });
      if (!response.ok) throw new Error('Host exporter request failed.');
      const text = await response.text();
      if (text.length > 8 * 1024 * 1024) throw new Error('Host exporter response exceeds limit.');
      const values = networkCounters(text, configuration.platform, configuration.nic);
      const time = performance.now();
      const measurements = networkRates(values, previous, time - previousTime);
      previous = values;
      previousTime = time;
      // Exporter samples have no device timestamp; ts is the completed host counter scrape.
      const ts = new Date().toISOString();
      for (const [metric, value] of Object.entries(measurements)) {
        if (stopped || !connected()) break;
        const record = {
          schema_version: '1.0',
          site_id: 'campus-lab',
          device_id: configuration.deviceId,
          boot_id: bootId,
          seq: seq++,
          sensor_id: networkSourceId(`${configuration.deviceId}:${configuration.nic}`, metric),
          asset_id: configuration.deviceId,
          metric,
          value,
          unit: NETWORK_UNITS[metric],
          ts,
          quality: 'good',
        };
        await publish(
          `dt/campus-lab/telemetry/${record.device_id}/${record.sensor_id}/${metric}`,
          JSON.stringify(record),
          { qos: 1 }
        );
      }
      failed = false;
    } catch (error) {
      previous = undefined;
      if (!failed) onError(error);
      failed = true;
    } finally {
      busy = false;
    }
  };
  return {
    start() {
      if (timer || stopped) return;
      pending = poll();
      timer = setInterval(() => {
        if (!busy) pending = poll();
      }, 5000);
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      await pending;
    },
  };
}
