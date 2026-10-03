import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  assertSimulationOwnership,
  acceptanceReadinessExpectations,
  createAcceptanceSeries,
  incompleteConditionSources,
  insertSeries,
  missingHistorySources,
  summarizeAcceptanceReadiness,
} from './acceptance-data.js';

const START = '2026-01-01T00:00:00.000Z';
const fiveDay = createAcceptanceSeries({ start: START });

test('five-day coverage skips complete simulation identities and selects only missing sources', () => {
  const all = missingHistorySources(new Set());
  assert.ok(all.length > 26);
  assert.equal(missingHistorySources(new Set(all.map(({ sensorId }) => sensorId))).length, 0);
  const missing = missingHistorySources(new Set(all.slice(1).map(({ sensorId }) => sensorId)));
  assert.deepEqual(
    missing.map(({ sensorId }) => sensorId),
    [all[0].sensorId]
  );
  assert.ok(
    all.every(
      ({ deviceId, sensorId }) =>
        deviceId.startsWith('acceptance-') && sensorId.startsWith('acceptance-')
    )
  );
});

test('simulation refuses an online non-simulation device on the canonical asset', async () => {
  const pool = {
    query: async (_sql, [assetId, devices]) => {
      assert.equal(assetId, 'dt-datacenter-rack');
      assert.ok(devices.every((id) => id.startsWith('acceptance-')));
      return { rows: [{ physical_online: true }] };
    },
  };
  await assert.rejects(assertSimulationOwnership(pool), /non-simulation device is online/);
});

function extent(values) {
  let minimum = Infinity;
  let maximum = -Infinity;
  let maximumChange = 0;
  for (let index = 0; index < values.length; index += 1) {
    minimum = Math.min(minimum, values[index]);
    maximum = Math.max(maximum, values[index]);
    if (index > 0) {
      maximumChange = Math.max(maximumChange, Math.abs(values[index] - values[index - 1]));
    }
  }
  return { maximum, maximumChange, minimum };
}

function correlation(left, right) {
  const length = Math.min(left.length, right.length);
  let leftTotal = 0;
  let rightTotal = 0;
  for (let index = 0; index < length; index += 1) {
    leftTotal += left[index];
    rightTotal += right[index];
  }
  const leftMean = leftTotal / length;
  const rightMean = rightTotal / length;
  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (let index = 0; index < length; index += 1) {
    const leftDelta = left[index] - leftMean;
    const rightDelta = right[index] - rightMean;
    covariance += leftDelta * rightDelta;
    leftVariance += leftDelta ** 2;
    rightVariance += rightDelta ** 2;
  }
  return covariance / Math.sqrt(leftVariance * rightVariance);
}

function dailyPeakOffsets(values, pointsPerDay) {
  return Array.from({ length: 5 }, (_, day) => {
    let peak = -Infinity;
    let offset = 0;
    for (let index = 0; index < pointsPerDay; index += 1) {
      const value = values[day * pointsPerDay + index];
      if (value > peak) {
        peak = value;
        offset = index;
      }
    }
    return offset;
  });
}

test('seed, start timestamp, and configuration determine the complete sequence', () => {
  const options = { durationSeconds: 7200, seed: 12345, start: START };
  const first = createAcceptanceSeries(options);
  const repeated = createAcceptanceSeries(options);
  const differentSeed = createAcceptanceSeries({ ...options, seed: 54321 });
  const differentStart = createAcceptanceSeries({ ...options, start: '2026-01-02T00:00:00.000Z' });

  assert.deepEqual(first.environmental.temperatureA, repeated.environmental.temperatureA);
  assert.deepEqual(
    first.network.get('net_receive_throughput_bytes_per_second'),
    repeated.network.get('net_receive_throughput_bytes_per_second')
  );
  assert.notDeepEqual(first.environmental.temperatureA, differentSeed.environmental.temperatureA);
  assert.notDeepEqual(first.environmental.temperatureA, differentStart.environmental.temperatureA);
});

test('environmental trajectories are continuous, varied, and cover the visualization ranges', () => {
  const { temperatureA, temperatureB, humidityA, humidityB } = fiveDay.environmental;
  const temperatures = [extent(temperatureA), extent(temperatureB)];
  const humidities = [extent(humidityA), extent(humidityB)];

  assert.ok(Math.min(...temperatures.map(({ minimum }) => minimum)) < 18);
  assert.ok(Math.max(...temperatures.map(({ maximum }) => maximum)) > 27);
  assert.ok(temperatureA.some((value) => value >= 18 && value <= 27));
  assert.ok(temperatures.every(({ maximumChange }) => maximumChange < 0.05));
  assert.ok(humidities.every(({ maximumChange }) => maximumChange < 0.1));
  assert.ok(Math.min(...humidities.map(({ minimum }) => minimum)) < 35);
  assert.ok(Math.max(...humidities.map(({ maximum }) => maximum)) > 70);

  let fixedOffset = true;
  const firstOffset = temperatureB[0] - temperatureA[0];
  for (let index = 1; index < temperatureA.length; index += 600) {
    if (Math.abs(temperatureB[index] - temperatureA[index] - firstOffset) > 0.1) {
      fixedOffset = false;
      break;
    }
  }
  assert.equal(fixedOffset, false);
  assert.notDeepEqual(temperatureA.slice(0, 86_400), temperatureA.slice(86_400, 172_800));

  const networkPeaks = dailyPeakOffsets(
    fiveDay.network.get('net_receive_throughput_bytes_per_second'),
    8640
  );
  const temperaturePeaks = dailyPeakOffsets(temperatureA, 86_400);
  assert.ok(new Set(networkPeaks).size > 3);
  assert.ok(new Set(temperaturePeaks).size > 3);
});

test('network rates are smooth inputs to monotonic counters and derived utilization', () => {
  const network = fiveDay.network;
  const received = network.get('net_bytes_received_total');
  const transmitted = network.get('net_bytes_sent_total');
  const receivedPackets = network.get('net_packets_received_total');
  const transmittedPackets = network.get('net_packets_sent_total');
  const receivedRate = network.get('net_receive_throughput_bytes_per_second');
  const transmittedRate = network.get('net_transmit_throughput_bytes_per_second');
  const utilization = network.get('net_link_utilization_ratio');
  for (let index = 1; index < received.length; index += 1) {
    assert.ok(
      Math.abs(received[index] - received[index - 1] - Math.round(receivedRate[index] * 10)) <= 1
    );
    assert.ok(
      Math.abs(
        transmitted[index] - transmitted[index - 1] - Math.round(transmittedRate[index] * 10)
      ) <= 1
    );
    assert.ok(
      Math.abs(
        receivedPackets[index] -
          receivedPackets[index - 1] -
          Math.round((receivedRate[index] * 10) / 900)
      ) <= 1
    );
    assert.ok(
      Math.abs(
        transmittedPackets[index] -
          transmittedPackets[index - 1] -
          Math.round((transmittedRate[index] * 10) / 850)
      ) <= 1
    );
    assert.ok(
      Math.abs(utilization[index] - (receivedRate[index] + transmittedRate[index]) / 125_000_000) <
        0.000001
    );
  }
  assert.ok(extent(receivedRate).maximumChange < 12_000_000);
  assert.ok(extent(transmittedRate).maximumChange < 8_000_000);
  for (const metric of [
    'net_packets_received_errors_total',
    'net_packets_outbound_errors_total',
    'net_packets_received_discarded_total',
    'net_packets_outbound_discarded_total',
  ]) {
    const values = network.get(metric);
    assert.ok(values.at(-1) > 0);
    for (let index = 1; index < values.length; index += 1) {
      assert.ok(values[index] >= values[index - 1]);
    }
  }
});

test('electrical and acoustic quantities preserve their derived invariants', () => {
  const electrical = fiveDay.electrical;
  const voltage = electrical.get('voltage_v');
  const current = electrical.get('current_a');
  const apparent = electrical.get('apparent_power_va');
  const active = electrical.get('active_power_w');
  const powerFactor = electrical.get('power_factor_ratio');
  const frequency = electrical.get('frequency_hz');
  const energy = electrical.get('energy_wh_total');
  for (let index = 0; index < voltage.length; index += 1) {
    assert.ok(Math.abs(apparent[index] - voltage[index] * current[index]) < 0.2);
    assert.ok(Math.abs(active[index] - apparent[index] * powerFactor[index]) < 0.3);
    assert.ok(powerFactor[index] >= 0 && powerFactor[index] <= 1);
    assert.ok(active[index] <= apparent[index]);
    assert.ok(frequency[index] >= 49.7 && frequency[index] <= 50.3);
    if (index > 0) assert.ok(energy[index] > energy[index - 1]);
  }
  assert.ok(extent(voltage).maximumChange < 0.1);
  assert.ok(extent(frequency).maximumChange < 0.02);

  const { acousticPeak, acousticRms } = fiveDay.environmental;
  for (let index = 0; index < acousticRms.length; index += 1) {
    assert.ok(acousticPeak[index] >= acousticRms[index]);
    assert.ok(acousticPeak[index] <= 0);
    assert.ok(acousticRms[index] <= 0);
  }
  assert.ok(extent(acousticRms).minimum < -58);
  assert.ok(extent(acousticRms).maximum > -22);
  assert.ok(extent(acousticPeak).maximum > -5);
});

test('cross-domain behavior is correlated without identical timing or magnitude', () => {
  const receiveRate = fiveDay.network.get('net_receive_throughput_bytes_per_second');
  const current = fiveDay.electrical.get('current_a');
  const rmsAtTenSeconds = new Float64Array(current.length);
  const delayedTemperature = new Float64Array(current.length - 90);
  for (let index = 0; index < current.length; index += 1) {
    rmsAtTenSeconds[index] = fiveDay.environmental.acousticRms[index * 10];
    if (index < delayedTemperature.length) {
      delayedTemperature[index] = fiveDay.environmental.temperatureA[index * 10 + 900];
    }
  }
  const networkElectrical = correlation(receiveRate, current);
  const electricalAcoustic = correlation(current, rmsAtTenSeconds);
  const electricalThermalLag = correlation(current.slice(0, -90), delayedTemperature);
  assert.ok(networkElectrical > 0.2 && networkElectrical < 0.98);
  assert.ok(electricalAcoustic > 0.2 && electricalAcoustic < 0.98);
  assert.ok(electricalThermalLag > 0.1 && electricalThermalLag < 0.95);
});

test('hardware diagnostics are deterministic, bounded, and explainable', () => {
  const diagnostics = fiveDay.diagnostics;
  for (const metric of [
    'brownout_count',
    'reset_count',
    'mqtt_reconnect_count',
    'crc_error_count:a',
    'i2c_retry_count:a',
    'sensor_reset_count:a',
    'crc_error_count:b',
    'i2c_retry_count:b',
    'sensor_reset_count:b',
    'i2s_error_count',
    'dma_overrun_count',
  ]) {
    const values = diagnostics.get(metric);
    assert.ok(values);
    for (let index = 1; index < values.length; index += 1) {
      assert.ok(values[index] >= values[index - 1]);
    }
  }
  assert.ok(diagnostics.get('crc_error_count:b').at(-1) > 0);
  assert.equal(diagnostics.get('crc_error_count:a').at(-1), 0);
  for (const metric of ['clip_ratio', 'stuck_sample_ratio']) {
    const values = diagnostics.get(metric);
    assert.ok(values.every((value) => value >= 0 && value <= 1));
  }
  const repeated = createAcceptanceSeries({ durationSeconds: 3600, start: START });
  const repeatedAgain = createAcceptanceSeries({ durationSeconds: 3600, start: START });
  assert.deepEqual(repeated.diagnostics, repeatedAgain.diagnostics);
});

test('component power remains bounded and ESP32 current responds to activity', () => {
  const power = fiveDay.power;
  const espVoltage = power.get('acceptance-esp32-supply-voltage');
  const espCurrent = power.get('acceptance-esp32-supply-current');
  assert.ok(espVoltage.every((value) => value >= 3 && value <= 3.6));
  assert.ok(espCurrent.every((value) => value >= 40 && value <= 400));
  assert.ok(extent(espCurrent).maximum - extent(espCurrent).minimum > 30);
  assert.ok(
    correlation(espCurrent, fiveDay.network.get('net_receive_throughput_bytes_per_second')) > 0.2
  );
  for (const component of ['sht31-a', 'sht31-b']) {
    assert.ok(
      power
        .get(`acceptance-${component}-supply-voltage`)
        .every((value) => value >= 2.15 && value <= 5.5)
    );
    assert.ok(
      power
        .get(`acceptance-${component}-supply-current`)
        .every((value) => value >= 0 && value < 1.5)
    );
  }
  assert.ok(
    power.get('acceptance-inmp441-supply-voltage').every((value) => value >= 1.8 && value <= 3.3)
  );
  assert.ok(
    power.get('acceptance-inmp441-supply-current').every((value) => value >= 0 && value <= 2.5)
  );
  const repeated = createAcceptanceSeries({ durationSeconds: 120, start: START });
  assert.deepEqual(
    repeated.power,
    createAcceptanceSeries({ durationSeconds: 120, start: START }).power
  );
});

test('condition backfill selects missing or incomplete sources and skips complete coverage', () => {
  const empty = incompleteConditionSources(new Map(), 3);
  assert.ok(empty.length > 14);
  const covered = new Map(
    empty.map(({ sensorId }) => [sensorId, { count: 3, first_seq: 0, last_seq: 12 }])
  );
  assert.deepEqual(incompleteConditionSources(covered, 3), []);
  covered.set(empty[0].sensorId, { count: 2, first_seq: 0, last_seq: 12 });
  assert.deepEqual(
    incompleteConditionSources(covered, 3).map(({ sensorId }) => sensorId),
    [empty[0].sensorId]
  );
});

test('acceptance readiness includes the new live diagnostic and power identities', () => {
  const expected = acceptanceReadinessExpectations();
  assert.ok(
    expected.currentIdentities.includes('acceptance-esp32-supply-voltage\0supply_voltage_v')
  );
  assert.ok(expected.currentIdentities.includes('acceptance-sht31-a-crc\0crc_error_count'));
  const incomplete = summarizeAcceptanceReadiness({ historyReady: true, assetReady: true });
  assert.equal(incomplete.ready, false);
  assert.equal(incomplete.expectedMeasurements, expected.currentIdentities.length);
});

test('minute backfill uses canonical identity and does not duplicate on retry', async () => {
  const identities = new Set();
  const pool = {
    async query(sql, parameters) {
      assert.match(sql, /ON CONFLICT ON CONSTRAINT measurements_qos1_identity_key DO NOTHING/);
      let rowCount = 0;
      for (const seq of parameters[7]) {
        const identity = `${parameters[1]}:${parameters[2]}:${seq}:${parameters[3]}:${parameters[5]}`;
        if (!identities.has(identity)) {
          identities.add(identity);
          rowCount += 1;
        }
      }
      return { rowCount };
    },
  };
  const source = {
    sensorId: 'acceptance-sht31-a-supply-voltage',
    deviceId: 'acceptance-mechanical-a',
    metric: 'supply_voltage_v',
    unit: 'V',
    cadence: 10_000,
  };
  const values = Float64Array.from({ length: 18 }, (_, index) => 3.28 + index / 1000);
  const start = new Date(START);
  assert.equal(await insertSeries(pool, source, start, values, 60_000, 3), 3);
  assert.equal(await insertSeries(pool, source, start, values, 60_000, 3), 0);
  assert.equal(identities.size, 3);
});

test('canonical metric registry accepts acceptance diagnostics and component power', () => {
  const migration = readFileSync(
    new URL('../database/migrations/system-measurements.sql', import.meta.url),
    'utf8'
  );
  for (const definition of [
    "('crc_error_count', 'count', 'hardware')",
    "('supply_voltage_v', 'V', 'hardware')",
    "('supply_current_ma', 'mA', 'hardware')",
  ])
    assert.ok(migration.includes(definition));
  assert.match(migration, /md\.source_class IN \([\s\S]*?'hardware'/);
});
