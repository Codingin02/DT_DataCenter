import { spawn, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';

const SITE_ID = 'dt-datacenter';
const ASSET_ID = 'dt-datacenter-rack';
const HISTORY_HOURS = 120;
const SECOND = 1000;
const TEN_SECONDS = 10 * SECOND;
const MINUTE = 60 * SECOND;
const ACCEPTANCE_SEED = 0x5a17c9e3;

const sources = [
  ['acceptance-sht31-a-temperature', 'acceptance-mechanical-a', 'temperature', 'degC', SECOND],
  ['acceptance-sht31-a-humidity', 'acceptance-mechanical-a', 'humidity', 'percent_rh', SECOND],
  ['acceptance-sht31-b-temperature', 'acceptance-mechanical-b', 'temperature', 'degC', SECOND],
  ['acceptance-sht31-b-humidity', 'acceptance-mechanical-b', 'humidity', 'percent_rh', SECOND],
  ['acceptance-inmp441-rms', 'acceptance-acoustic', 'sound_rms_dbfs', 'dBFS', SECOND],
  ['acceptance-inmp441-peak', 'acceptance-acoustic', 'sound_peak_dbfs', 'dBFS', SECOND],
  [
    'acceptance-net-rx-bytes',
    'acceptance-host-nic',
    'net_bytes_received_total',
    'bytes',
    TEN_SECONDS,
  ],
  ['acceptance-net-tx-bytes', 'acceptance-host-nic', 'net_bytes_sent_total', 'bytes', TEN_SECONDS],
  [
    'acceptance-net-rx-packets',
    'acceptance-host-nic',
    'net_packets_received_total',
    'count',
    TEN_SECONDS,
  ],
  [
    'acceptance-net-tx-packets',
    'acceptance-host-nic',
    'net_packets_sent_total',
    'count',
    TEN_SECONDS,
  ],
  [
    'acceptance-net-rx-errors',
    'acceptance-host-nic',
    'net_packets_received_errors_total',
    'count',
    TEN_SECONDS,
  ],
  [
    'acceptance-net-tx-errors',
    'acceptance-host-nic',
    'net_packets_outbound_errors_total',
    'count',
    TEN_SECONDS,
  ],
  [
    'acceptance-net-rx-drops',
    'acceptance-host-nic',
    'net_packets_received_discarded_total',
    'count',
    TEN_SECONDS,
  ],
  [
    'acceptance-net-tx-drops',
    'acceptance-host-nic',
    'net_packets_outbound_discarded_total',
    'count',
    TEN_SECONDS,
  ],
  [
    'acceptance-net-capacity',
    'acceptance-host-nic',
    'net_current_bandwidth_bytes',
    'bytes_per_second',
    TEN_SECONDS,
  ],
  [
    'acceptance-net-rx-throughput',
    'acceptance-host-nic',
    'net_receive_throughput_bytes_per_second',
    'bytes_per_second',
    TEN_SECONDS,
  ],
  [
    'acceptance-net-tx-throughput',
    'acceptance-host-nic',
    'net_transmit_throughput_bytes_per_second',
    'bytes_per_second',
    TEN_SECONDS,
  ],
  [
    'acceptance-net-utilization',
    'acceptance-host-nic',
    'net_link_utilization_ratio',
    'ratio',
    TEN_SECONDS,
  ],
  ['acceptance-net-status', 'acceptance-host-nic', 'net_operation_status', 'ratio', TEN_SECONDS],
  ['acceptance-voltage', 'acceptance-electrical', 'voltage_v', 'V', TEN_SECONDS],
  ['acceptance-current', 'acceptance-electrical', 'current_a', 'A', TEN_SECONDS],
  ['acceptance-active-power', 'acceptance-electrical', 'active_power_w', 'W', TEN_SECONDS],
  ['acceptance-apparent-power', 'acceptance-electrical', 'apparent_power_va', 'VA', TEN_SECONDS],
  ['acceptance-power-factor', 'acceptance-electrical', 'power_factor_ratio', 'ratio', TEN_SECONDS],
  ['acceptance-frequency', 'acceptance-electrical', 'frequency_hz', 'Hz', TEN_SECONDS],
  ['acceptance-energy', 'acceptance-electrical', 'energy_wh_total', 'Wh', TEN_SECONDS],
  ['acceptance-esp32-brownout', 'acceptance-mechanical-a', 'brownout_count', 'count', TEN_SECONDS],
  ['acceptance-esp32-reset', 'acceptance-mechanical-a', 'reset_count', 'count', TEN_SECONDS],
  [
    'acceptance-esp32-mqtt-reconnect',
    'acceptance-mechanical-a',
    'mqtt_reconnect_count',
    'count',
    TEN_SECONDS,
  ],
  ['acceptance-esp32-uptime', 'acceptance-mechanical-a', 'uptime_s', 's', TEN_SECONDS],
  ['acceptance-sht31-a-crc', 'acceptance-mechanical-a', 'crc_error_count', 'count', TEN_SECONDS],
  ['acceptance-sht31-a-retry', 'acceptance-mechanical-a', 'i2c_retry_count', 'count', TEN_SECONDS],
  [
    'acceptance-sht31-a-reset',
    'acceptance-mechanical-a',
    'sensor_reset_count',
    'count',
    TEN_SECONDS,
  ],
  ['acceptance-sht31-b-crc', 'acceptance-mechanical-b', 'crc_error_count', 'count', TEN_SECONDS],
  ['acceptance-sht31-b-retry', 'acceptance-mechanical-b', 'i2c_retry_count', 'count', TEN_SECONDS],
  [
    'acceptance-sht31-b-reset',
    'acceptance-mechanical-b',
    'sensor_reset_count',
    'count',
    TEN_SECONDS,
  ],
  ['acceptance-inmp441-i2s-error', 'acceptance-acoustic', 'i2s_error_count', 'count', TEN_SECONDS],
  [
    'acceptance-inmp441-dma-overrun',
    'acceptance-acoustic',
    'dma_overrun_count',
    'count',
    TEN_SECONDS,
  ],
  ['acceptance-inmp441-clip-ratio', 'acceptance-acoustic', 'clip_ratio', 'ratio', TEN_SECONDS],
  [
    'acceptance-inmp441-stuck-ratio',
    'acceptance-acoustic',
    'stuck_sample_ratio',
    'ratio',
    TEN_SECONDS,
  ],
  ...[
    ['esp32', 'acceptance-mechanical-a'],
    ['sht31-a', 'acceptance-mechanical-a'],
    ['sht31-b', 'acceptance-mechanical-b'],
    ['inmp441', 'acceptance-acoustic'],
  ].flatMap(([component, deviceId]) => [
    [`acceptance-${component}-supply-voltage`, deviceId, 'supply_voltage_v', 'V', TEN_SECONDS],
    [`acceptance-${component}-supply-current`, deviceId, 'supply_current_ma', 'mA', TEN_SECONDS],
  ]),
].map(([sensorId, deviceId, metric, unit, cadence]) => ({
  sensorId,
  deviceId,
  metric,
  unit,
  cadence,
}));

const deviceIds = [...new Set(sources.map(({ deviceId }) => deviceId))];
const conditionSources = sources.filter(({ sensorId }) =>
  /-(brownout|reset|mqtt-reconnect|uptime|crc|retry|i2s-error|dma-overrun|clip-ratio|stuck-ratio|supply-)/.test(
    sensorId
  )
);
const spatialAnchors = [
  ['acceptance-sht31-a-temperature', [-0.28, 0.55, 0.199]],
  ['acceptance-sht31-a-humidity', [-0.28, 0.55, 0.199]],
  ['acceptance-sht31-b-temperature', [0.27, 0.25, 0.199]],
  ['acceptance-sht31-b-humidity', [0.27, 0.25, 0.199]],
  ['acceptance-voltage', [0, 0.125, -0.199]],
  ['acceptance-current', [0, 0.125, -0.199]],
  ['acceptance-active-power', [0, 0.125, -0.199]],
  ['acceptance-apparent-power', [0, 0.125, -0.199]],
  ['acceptance-power-factor', [0, 0.125, -0.199]],
  ['acceptance-frequency', [0, 0.125, -0.199]],
  ['acceptance-energy', [0, 0.125, -0.199]],
];
const linkCapacity = 125_000_000;

export function missingHistorySources(completedSensorIds) {
  return sources.filter(({ sensorId }) => !completedSensorIds.has(sensorId));
}

export function acceptanceReadinessExpectations() {
  return {
    devices: [...deviceIds],
    currentIdentities: sources.map(({ sensorId, metric }) => `${sensorId}\0${metric}`),
    anchors: spatialAnchors.map(([sensorId]) => sensorId),
  };
}

export function summarizeAcceptanceReadiness({
  historyReady,
  assetReady,
  devices = [],
  currentState = [],
  anchors = [],
}) {
  const expected = acceptanceReadinessExpectations();
  const onlineDevices = new Set(
    devices
      .filter(({ connectivity_status: status }) => status === 'online')
      .map(({ device_id: deviceId }) => deviceId)
  );
  const liveCurrent = new Set(
    currentState
      .filter(({ boot_id: bootId }) => bootId === 'acceptance-live')
      .map(({ sensor_id: sensorId, metric }) => `${sensorId}\0${metric}`)
  );
  const registeredAnchors = new Set(anchors.map(({ sensor_id: sensorId }) => sensorId));
  const deviceOnline = expected.devices.every((deviceId) => onlineDevices.has(deviceId));
  const currentStateReady = expected.currentIdentities.every((identity) =>
    liveCurrent.has(identity)
  );
  const spatialAnchorsReady = expected.anchors.every((sensorId) => registeredAnchors.has(sensorId));
  return {
    ready:
      Boolean(historyReady) &&
      Boolean(assetReady) &&
      deviceOnline &&
      currentStateReady &&
      spatialAnchorsReady,
    historyReady: Boolean(historyReady),
    assetReady: Boolean(assetReady),
    deviceOnline,
    currentStateReady,
    currentMeasurements: expected.currentIdentities.filter((identity) => liveCurrent.has(identity))
      .length,
    expectedMeasurements: expected.currentIdentities.length,
    anchors: expected.anchors.filter((sensorId) => registeredAnchors.has(sensorId)).length,
    expectedAnchors: expected.anchors.length,
  };
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, digits = 6) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function mixSeed(seed, salt) {
  let value = (seed ^ salt) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
}

function gaussian(random) {
  let spare = null;
  return () => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    const radius = Math.sqrt(-2 * Math.log(Math.max(Number.EPSILON, random())));
    const angle = 2 * Math.PI * random();
    spare = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  };
}

function smoothstep(value) {
  return value * value * (3 - 2 * value);
}

function eventEnvelope(event, hour) {
  const progress = (hour - event.start) / event.duration;
  if (progress <= 0 || progress >= 1) return 0;
  const normalized =
    progress <= event.peak
      ? smoothstep(progress / event.peak)
      : smoothstep((1 - progress) / (1 - event.peak));
  return normalized * event.amplitude;
}

function eventTotal(events, hour, target = 'both') {
  let total = 0;
  for (const event of events) {
    if (event.target === 'both' || event.target === target) total += eventEnvelope(event, hour);
  }
  return total;
}

function event(random, day, options) {
  return {
    amplitude:
      (options.polarity ?? (random() < 0.25 ? -1 : 1)) *
      (options.minimumAmplitude + random() * (options.maximumAmplitude - options.minimumAmplitude)),
    duration:
      options.minimumDuration + random() * (options.maximumDuration - options.minimumDuration),
    peak: 0.3 + random() * 0.4,
    start: day * 24 + 1 + random() * 20,
    target: options.target ?? 'both',
  };
}

function eventSchedule(random, hours) {
  const days = Math.ceil(hours / 24);
  const schedule = {
    acoustic: [],
    ambient: [],
    electrical: [],
    faults: [],
    humidity: [],
    load: [],
    network: [],
    thermal: [],
  };
  for (let day = 0; day < days; day += 1) {
    for (let count = 0; count < 2; count += 1) {
      schedule.load.push(
        event(random, day, {
          minimumAmplitude: 0.1,
          maximumAmplitude: 0.32,
          minimumDuration: 1.5,
          maximumDuration: 5,
        })
      );
      schedule.network.push(
        event(random, day, {
          minimumAmplitude: 0.12,
          maximumAmplitude: 0.42,
          minimumDuration: 0.35,
          maximumDuration: 2.4,
          target: ['rx', 'tx', 'both'][Math.floor(random() * 3)],
        })
      );
    }
    schedule.thermal.push(
      event(random, day, {
        minimumAmplitude: 0.5,
        maximumAmplitude: 2.2,
        minimumDuration: 2,
        maximumDuration: 6,
        target: random() < 0.5 ? 'a' : 'b',
      })
    );
    schedule.humidity.push(
      event(random, day, {
        minimumAmplitude: 5,
        maximumAmplitude: 14,
        minimumDuration: 2,
        maximumDuration: 7,
        target: random() < 0.5 ? 'a' : 'b',
      })
    );
    schedule.acoustic.push(
      event(random, day, {
        minimumAmplitude: 3,
        maximumAmplitude: 11,
        minimumDuration: 0.4,
        maximumDuration: 2.5,
      })
    );
    schedule.electrical.push(
      event(random, day, {
        minimumAmplitude: 0.4,
        maximumAmplitude: 2.4,
        minimumDuration: 1,
        maximumDuration: 4,
      })
    );
    if (day > 0) {
      const fault = event(random, day, {
        minimumAmplitude: 1,
        maximumAmplitude: 1,
        minimumDuration: 0.2,
        maximumDuration: 0.7,
        polarity: 1,
        target: ['rx-error', 'tx-error', 'rx-drop', 'tx-drop'][day % 4],
      });
      fault.interval = 12 + Math.floor(random() * 25);
      fault.offset = Math.floor(random() * fault.interval);
      schedule.faults.push(fault);
    }
  }

  const coldDay = Math.floor(random() * Math.max(1, days - 1));
  const warmDay = (coldDay + 2 + Math.floor(random() * Math.max(1, days - 2))) % days;
  schedule.ambient.push(
    event(random, coldDay, {
      minimumAmplitude: 5,
      maximumAmplitude: 6.5,
      minimumDuration: 6,
      maximumDuration: 10,
      polarity: -1,
    })
  );
  schedule.ambient.push(
    event(random, warmDay, {
      minimumAmplitude: 8,
      maximumAmplitude: 11,
      minimumDuration: 6,
      maximumDuration: 10,
      polarity: 1,
    })
  );
  const dryDay = (coldDay + 1) % days;
  const wetDay = (warmDay + 1) % days;
  schedule.humidity.push(
    event(random, dryDay, {
      minimumAmplitude: 21,
      maximumAmplitude: 27,
      minimumDuration: 6,
      maximumDuration: 10,
      polarity: -1,
    })
  );
  schedule.humidity.push(
    event(random, wetDay, {
      minimumAmplitude: 15,
      maximumAmplitude: 21,
      minimumDuration: 6,
      maximumDuration: 10,
      polarity: 1,
    })
  );
  schedule.acoustic.push(
    event(random, warmDay, {
      minimumAmplitude: 28,
      maximumAmplitude: 34,
      minimumDuration: 1.5,
      maximumDuration: 3,
      polarity: 1,
    })
  );
  schedule.acoustic.push(
    event(random, coldDay, {
      minimumAmplitude: 8,
      maximumAmplitude: 13,
      minimumDuration: 1,
      maximumDuration: 3,
      polarity: -1,
    })
  );
  return schedule;
}

function metricSeries(deviceId, pointCount) {
  return new Map(
    sources
      .filter((source) => source.deviceId === deviceId)
      .map(({ metric }) => [metric, new Float64Array(pointCount)])
  );
}

function faultIncrement(events, target, hour, index) {
  return events.some(
    (item) =>
      item.target === target &&
      eventEnvelope(item, hour) > 0.45 &&
      (index + item.offset) % item.interval === 0
  )
    ? 1
    : 0;
}

export function createAcceptanceSeries({
  durationSeconds = HISTORY_HOURS * 60 * 60,
  seed = ACCEPTANCE_SEED,
  start = '2026-01-01T00:00:00.000Z',
} = {}) {
  const startDate = new Date(start);
  if (!Number.isInteger(durationSeconds) || durationSeconds <= 0) {
    throw new Error('Duration must be a positive whole number of seconds.');
  }
  if (Number.isNaN(startDate.getTime())) throw new Error('Start timestamp must be RFC 3339.');
  const startSeconds = Math.floor(startDate.getTime() / 1000);
  const baseSeed = mixSeed(seed, startSeconds ^ Math.floor(startSeconds / 0x100000000));
  const schedule = eventSchedule(seededRandom(mixSeed(baseSeed, 1)), durationSeconds / 3600);
  const residual = {
    acoustic: gaussian(seededRandom(mixSeed(baseSeed, 2))),
    ambient: gaussian(seededRandom(mixSeed(baseSeed, 3))),
    humidityA: gaussian(seededRandom(mixSeed(baseSeed, 4))),
    humidityB: gaussian(seededRandom(mixSeed(baseSeed, 5))),
    load: gaussian(seededRandom(mixSeed(baseSeed, 6))),
    network: gaussian(seededRandom(mixSeed(baseSeed, 7))),
    peak: gaussian(seededRandom(mixSeed(baseSeed, 8))),
    temperatureA: gaussian(seededRandom(mixSeed(baseSeed, 9))),
    temperatureB: gaussian(seededRandom(mixSeed(baseSeed, 10))),
    transmit: gaussian(seededRandom(mixSeed(baseSeed, 11))),
    voltage: gaussian(seededRandom(mixSeed(baseSeed, 12))),
    frequency: gaussian(seededRandom(mixSeed(baseSeed, 13))),
  };
  const environmental = {
    temperatureA: new Float64Array(durationSeconds),
    temperatureB: new Float64Array(durationSeconds),
    humidityA: new Float64Array(durationSeconds),
    humidityB: new Float64Array(durationSeconds),
    acousticRms: new Float64Array(durationSeconds),
    acousticPeak: new Float64Array(durationSeconds),
  };
  const networkPointCount = Math.ceil(durationSeconds / 10);
  const network = metricSeries('acceptance-host-nic', networkPointCount);
  const electrical = metricSeries('acceptance-electrical', networkPointCount);
  const diagnostics = new Map(
    [
      'brownout_count',
      'reset_count',
      'mqtt_reconnect_count',
      'uptime_s',
      'crc_error_count:a',
      'i2c_retry_count:a',
      'sensor_reset_count:a',
      'crc_error_count:b',
      'i2c_retry_count:b',
      'sensor_reset_count:b',
      'i2s_error_count',
      'dma_overrun_count',
      'clip_ratio',
      'stuck_sample_ratio',
    ].map((metric) => [metric, new Float64Array(networkPointCount)])
  );
  const power = new Map(
    sources
      .filter(({ metric }) => metric.startsWith('supply_'))
      .map(({ sensorId }) => [sensorId, new Float64Array(networkPointCount)])
  );
  const faultRandom = seededRandom(mixSeed(baseSeed, 31));
  const conditionEvents = {
    reconnect: event(faultRandom, 1, {
      minimumAmplitude: 1,
      maximumAmplitude: 1,
      minimumDuration: 0.25,
      maximumDuration: 0.5,
      polarity: 1,
    }),
    retryA: event(faultRandom, 2, {
      minimumAmplitude: 1,
      maximumAmplitude: 1,
      minimumDuration: 0.2,
      maximumDuration: 0.4,
      polarity: 1,
    }),
    retryB: event(faultRandom, 3, {
      minimumAmplitude: 1,
      maximumAmplitude: 1,
      minimumDuration: 0.2,
      maximumDuration: 0.4,
      polarity: 1,
    }),
    dma: event(faultRandom, 4, {
      minimumAmplitude: 1,
      maximumAmplitude: 1,
      minimumDuration: 0.15,
      maximumDuration: 0.3,
      polarity: 1,
    }),
    sag: event(faultRandom, 1, {
      minimumAmplitude: 1,
      maximumAmplitude: 1,
      minimumDuration: 0.4,
      maximumDuration: 0.8,
      polarity: 1,
    }),
  };
  const state = {
    acousticResidual: 0,
    ambientResidual: 0,
    frequency: 50,
    frequencyResidual: 0,
    humidityA: 55,
    humidityAResidual: 0,
    humidityB: 50,
    humidityBResidual: 0,
    loadResidual: 0,
    networkResidual: 0,
    peakMargin: 12,
    peakResidual: 0,
    rms: -50,
    temperatureA: 22,
    temperatureAResidual: 0,
    temperatureB: 25,
    temperatureBResidual: 0,
    thermalDrive: 0.35,
    transmitResidual: 0,
    voltage: 230,
    voltageResidual: 0,
  };
  const counters = {
    receivedBytes: 1_000_000_000,
    receivedDrops: 0,
    receivedErrors: 0,
    receivedPackets: 1_200_000,
    transmittedBytes: 600_000_000,
    transmittedDrops: 0,
    transmittedErrors: 0,
    transmittedPackets: 800_000,
  };
  let energy = 240_000;
  const faults = { reconnect: 0, retryA: 0, retryB: 0, dma: 0 };

  for (let index = 0; index < durationSeconds; index += 1) {
    const hour = index / 3600;
    state.loadResidual = 0.998 * state.loadResidual + 0.0035 * residual.load();
    state.networkResidual = 0.996 * state.networkResidual + 0.007 * residual.network();
    state.transmitResidual = 0.996 * state.transmitResidual + 0.007 * residual.transmit();
    state.ambientResidual = 0.9995 * state.ambientResidual + 0.002 * residual.ambient();
    state.temperatureAResidual =
      0.995 * state.temperatureAResidual + 0.006 * residual.temperatureA();
    state.temperatureBResidual =
      0.996 * state.temperatureBResidual + 0.005 * residual.temperatureB();
    state.humidityAResidual = 0.997 * state.humidityAResidual + 0.015 * residual.humidityA();
    state.humidityBResidual = 0.998 * state.humidityBResidual + 0.012 * residual.humidityB();
    state.acousticResidual = 0.96 * state.acousticResidual + 0.2 * residual.acoustic();
    state.peakResidual = 0.98 * state.peakResidual + 0.08 * residual.peak();

    const systemLoad = clamp(
      0.32 +
        0.09 * Math.sin((2 * Math.PI * (hour - 6)) / 24) +
        state.loadResidual +
        eventTotal(schedule.load, hour),
      0.06,
      0.98
    );
    state.thermalDrive += (systemLoad - state.thermalDrive) / 1200;
    const ambientTemperature =
      19.4 +
      2.1 * Math.sin((2 * Math.PI * (hour - 5)) / 24) +
      state.ambientResidual +
      eventTotal(schedule.ambient, hour);
    const targetTemperatureA =
      ambientTemperature +
      6.2 * state.thermalDrive +
      eventTotal(schedule.thermal, hour, 'a') +
      state.temperatureAResidual;
    const targetTemperatureB =
      ambientTemperature +
      2.1 +
      7.1 * state.thermalDrive +
      0.8 * eventTotal(schedule.thermal, hour, 'b') +
      state.temperatureBResidual;
    state.temperatureA = clamp(
      state.temperatureA + (targetTemperatureA - state.temperatureA) / 900,
      16,
      34
    );
    state.temperatureB = clamp(
      state.temperatureB + (targetTemperatureB - state.temperatureB) / 1500,
      16,
      34
    );

    const humidityEventA = eventTotal(schedule.humidity, hour, 'a');
    const humidityEventB = eventTotal(schedule.humidity, hour, 'b');
    const targetHumidityA =
      56 +
      8 * Math.sin((2 * Math.PI * (hour + 3)) / 24) -
      0.7 * (state.temperatureA - 22) +
      humidityEventA +
      state.humidityAResidual;
    const targetHumidityB =
      50 +
      9 * Math.sin((2 * Math.PI * (hour + 4.5)) / 24) -
      0.55 * (state.temperatureB - 25) +
      0.82 * humidityEventB +
      state.humidityBResidual;
    state.humidityA = clamp(state.humidityA + (targetHumidityA - state.humidityA) / 1200, 20, 85);
    state.humidityB = clamp(state.humidityB + (targetHumidityB - state.humidityB) / 1800, 20, 85);

    const rmsTarget = clamp(
      -59 +
        29 * systemLoad +
        5 * state.thermalDrive +
        eventTotal(schedule.acoustic, hour) +
        state.acousticResidual,
      -60,
      -20
    );
    state.rms = clamp(state.rms + 0.04 * (rmsTarget - state.rms), -60, -20);
    const marginTarget = 10 + 12 * systemLoad + Math.abs(state.peakResidual);
    state.peakMargin += 0.03 * (marginTarget - state.peakMargin);

    environmental.temperatureA[index] = round(state.temperatureA, 3);
    environmental.temperatureB[index] = round(state.temperatureB, 3);
    environmental.humidityA[index] = round(state.humidityA, 3);
    environmental.humidityB[index] = round(state.humidityB, 3);
    environmental.acousticRms[index] = round(state.rms, 3);
    environmental.acousticPeak[index] = round(
      Math.min(-3, state.rms + clamp(state.peakMargin, 6, 25)),
      3
    );

    if (index % 10 !== 0) continue;
    const point = index / 10;
    const receiveDemand = clamp(
      0.08 +
        0.48 * systemLoad +
        0.42 * state.networkResidual +
        eventTotal(schedule.network, hour, 'rx'),
      0,
      1
    );
    const transmitDemand = clamp(
      0.05 +
        0.34 * systemLoad +
        0.32 * receiveDemand +
        0.35 * state.transmitResidual +
        eventTotal(schedule.network, hour, 'tx'),
      0,
      1
    );
    const receiveRate = clamp(250_000 + 70_000_000 * receiveDemand ** 1.5, 250_000, 75_000_000);
    const transmitRate = clamp(150_000 + 34_000_000 * transmitDemand ** 1.6, 150_000, 35_000_000);
    counters.receivedBytes += Math.round(receiveRate * 10);
    counters.transmittedBytes += Math.round(transmitRate * 10);
    counters.receivedPackets += Math.round((receiveRate * 10) / 900);
    counters.transmittedPackets += Math.round((transmitRate * 10) / 850);
    counters.receivedErrors += faultIncrement(schedule.faults, 'rx-error', hour, point);
    const transmittedErrorIncrement = faultIncrement(schedule.faults, 'tx-error', hour, point);
    counters.transmittedErrors += transmittedErrorIncrement;
    counters.receivedDrops += faultIncrement(schedule.faults, 'rx-drop', hour, point);
    counters.transmittedDrops += faultIncrement(schedule.faults, 'tx-drop', hour, point);
    const networkRow = {
      net_bytes_received_total: counters.receivedBytes,
      net_bytes_sent_total: counters.transmittedBytes,
      net_packets_received_total: counters.receivedPackets,
      net_packets_sent_total: counters.transmittedPackets,
      net_packets_received_errors_total: counters.receivedErrors,
      net_packets_outbound_errors_total: counters.transmittedErrors,
      net_packets_received_discarded_total: counters.receivedDrops,
      net_packets_outbound_discarded_total: counters.transmittedDrops,
      net_current_bandwidth_bytes: linkCapacity,
      net_receive_throughput_bytes_per_second: round(receiveRate, 3),
      net_transmit_throughput_bytes_per_second: round(transmitRate, 3),
      net_link_utilization_ratio: round((receiveRate + transmitRate) / linkCapacity, 6),
      net_operation_status: 1,
    };
    for (const [metric, series] of network) series[point] = networkRow[metric];

    state.voltageResidual = 0.94 * state.voltageResidual + 0.08 * residual.voltage();
    state.frequencyResidual = 0.94 * state.frequencyResidual + 0.05 * residual.frequency();
    const electricalEvent = eventTotal(schedule.electrical, hour);
    const voltageTarget =
      230 +
      1.8 * Math.sin((2 * Math.PI * (hour + 1)) / 24) -
      0.8 * systemLoad +
      0.3 * state.voltageResidual;
    state.voltage += 0.1 * (voltageTarget - state.voltage);
    const current = clamp(1.1 + 12.5 * systemLoad + electricalEvent, 0.5, 16);
    const powerFactor = clamp(
      0.81 + 0.16 * systemLoad + 0.012 * Math.sin((2 * Math.PI * hour) / 7.3),
      0.75,
      0.99
    );
    const apparentPower = state.voltage * current;
    const activePower = apparentPower * powerFactor;
    state.frequency +=
      0.08 *
      (50 +
        0.06 * Math.sin((2 * Math.PI * hour) / 3.7) +
        0.15 * state.frequencyResidual -
        state.frequency);
    energy += (activePower * 10) / 3600;
    const electricalRow = {
      voltage_v: round(clamp(state.voltage, 210, 245), 3),
      current_a: round(current, 3),
      active_power_w: round(activePower, 3),
      apparent_power_va: round(apparentPower, 3),
      power_factor_ratio: round(powerFactor, 6),
      frequency_hz: round(clamp(state.frequency, 49.7, 50.3), 4),
      energy_wh_total: round(energy, 3),
    };
    for (const [metric, series] of electrical) series[point] = electricalRow[metric];

    for (const [name, interval] of [
      ['reconnect', 19],
      ['retryA', 11],
      ['retryB', 13],
      ['dma', 23],
    ]) {
      if (eventEnvelope(conditionEvents[name], hour) > 0.5 && point % interval === 0)
        faults[name] += 1;
    }
    const clipRatio = round(clamp((environmental.acousticPeak[index] + 8) / 100, 0, 0.05), 6);
    const stuckRatio = 0;
    const diagnosticRow = {
      brownout_count: 0,
      reset_count: 0,
      mqtt_reconnect_count: faults.reconnect,
      uptime_s: point * 10,
      'crc_error_count:a': 0,
      'i2c_retry_count:a': faults.retryA,
      'sensor_reset_count:a': 0,
      'crc_error_count:b': Math.floor(faults.retryB / 4),
      'i2c_retry_count:b': faults.retryB,
      'sensor_reset_count:b': 0,
      i2s_error_count: 0,
      dma_overrun_count: faults.dma,
      clip_ratio: clipRatio,
      stuck_sample_ratio: stuckRatio,
    };
    for (const [metric, series] of diagnostics) series[point] = diagnosticRow[metric];
    const sag = eventEnvelope(conditionEvents.sag, hour);
    const supply = {
      esp32: [
        clamp(3.3 - 0.12 * sag - 0.025 * systemLoad, 3, 3.6),
        clamp(65 + 100 * systemLoad + 105 * receiveDemand + 55 * transmitDemand, 40, 400),
      ],
      'sht31-a': [3.28 - 0.035 * sag + 0.003 * Math.sin(hour * 2), 0.38 + 0.1 * systemLoad],
      'sht31-b': [3.27 - 0.03 * sag + 0.004 * Math.sin(hour * 1.7), 0.4 + 0.08 * systemLoad],
      inmp441: [3.29 - 0.03 * sag, 2.12 + 0.17 * systemLoad],
    };
    for (const [component, [voltage, current]] of Object.entries(supply)) {
      power.get(`acceptance-${component}-supply-voltage`)[point] = round(voltage, 4);
      power.get(`acceptance-${component}-supply-current`)[point] = round(current, 4);
    }
  }

  return {
    diagnostics,
    electrical,
    environmental,
    network,
    power,
    seed,
    start: startDate.toISOString(),
  };
}

function rawValue(metric, value) {
  if (metric === 'temperature') return Math.round(((value + 45) / 175) * 65535);
  if (metric === 'humidity') return Math.round((value / 100) * 65535);
  return null;
}

function diagnosticSeriesKey(source) {
  if (!source.sensorId.includes('sht31-')) return source.metric;
  return `${source.metric}:${source.sensorId.includes('sht31-a-') ? 'a' : 'b'}`;
}

async function registerSources(pool) {
  await pool.query('BEGIN');
  try {
    await pool.query(
      `INSERT INTO digital_twin.sites (site_id, display_name)
       VALUES ($1, 'DT_DataCenter') ON CONFLICT (site_id) DO NOTHING`,
      [SITE_ID]
    );
    await pool.query(
      `INSERT INTO digital_twin.assets (asset_id, site_id, asset_type, display_name)
       VALUES ($1, $2, 'rack', 'Rack reference context')
       ON CONFLICT (asset_id) DO NOTHING`,
      [ASSET_ID, SITE_ID]
    );
    for (const deviceId of deviceIds) {
      await pool.query(
        `INSERT INTO digital_twin.devices (device_id, site_id, asset_id)
         VALUES ($1, $2, $3) ON CONFLICT (device_id) DO NOTHING`,
        [deviceId, SITE_ID, ASSET_ID]
      );
    }
    for (const source of sources) {
      await pool.query(
        `INSERT INTO digital_twin.sensors (sensor_id, site_id, device_id, asset_id, metric, unit)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (sensor_id) DO NOTHING`,
        [source.sensorId, SITE_ID, source.deviceId, ASSET_ID, source.metric, source.unit]
      );
    }
    const registered = await pool.query(
      `SELECT sensor_id, device_id, asset_id, metric, unit
       FROM digital_twin.sensors WHERE sensor_id = ANY($1)`,
      [sources.map(({ sensorId }) => sensorId)]
    );
    const actual = new Map(registered.rows.map((row) => [row.sensor_id, row]));
    for (const source of sources) {
      const row = actual.get(source.sensorId);
      if (
        !row ||
        row.device_id !== source.deviceId ||
        row.asset_id !== ASSET_ID ||
        row.metric !== source.metric ||
        row.unit !== source.unit
      ) {
        throw new Error(`Canonical source identity conflicts with ${source.sensorId}.`);
      }
    }
    const canonical = await pool.query(
      `SELECT coordinate_system_id FROM digital_twin.coordinate_systems
       WHERE site_id = $1 AND is_canonical`,
      [SITE_ID]
    );
    let coordinateSystemId = canonical.rows[0]?.coordinate_system_id;
    if (!coordinateSystemId) {
      coordinateSystemId = 'acceptance-reference';
      await pool.query(
        `INSERT INTO digital_twin.coordinate_systems (
           coordinate_system_id, site_id, display_name, unit, handedness, up_axis,
           origin_description, orientation_description, coordinate_system_version,
           is_canonical, registration_verified
         ) VALUES (
           $1, $2, 'Reference geometry', 'm', 'right', 'y',
           'rack.glb model-local origin; not surveyed',
           'rack.glb right-handed Y-up coordinates; not physically registered', 1, true, false
         ) ON CONFLICT (coordinate_system_id) DO NOTHING`,
        [coordinateSystemId, SITE_ID]
      );
    }
    for (const [sensorId, position] of spatialAnchors) {
      await pool.query(
        `INSERT INTO digital_twin.sensor_positions (
           site_id, sensor_id, coordinate_system_id, position_x, position_y, position_z,
           position_verified, position_version
         ) VALUES ($1, $2, $3, $4, $5, $6, false, 1)
         ON CONFLICT (sensor_id, position_version) DO NOTHING`,
        [SITE_ID, sensorId, coordinateSystemId, ...position]
      );
    }
    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}

const insertHistorySql = `
  INSERT INTO digital_twin.measurements (
    schema_version, site_id, device_id, boot_id, seq, sensor_id, asset_id,
    metric, value, raw_value, unit, ts, received_at, quality
  )
  SELECT '1.0', $1, $2, $3, input.seq, $4, $5, $6, input.value,
    input.raw_value, $7, input.ts, input.received_at, 'good'
  FROM unnest(
    $8::bigint[], $9::double precision[], $10::integer[],
    $11::timestamptz[], $12::timestamptz[]
  ) AS input(seq, value, raw_value, ts, received_at)
  ON CONFLICT ON CONSTRAINT measurements_qos1_identity_key DO NOTHING`;

export async function insertSeries(
  pool,
  source,
  start,
  values,
  cadence = source.cadence,
  pointCount = (HISTORY_HOURS * 60 * 60 * SECOND) / cadence
) {
  const batchSize = 20_000;
  let inserted = 0;
  const bootId = `acceptance-history-${start.toISOString()}`;
  for (let offset = 0; offset < pointCount; offset += batchSize) {
    const length = Math.min(batchSize, pointCount - offset);
    const sequences = [];
    const engineeringValues = [];
    const rawValues = [];
    const timestamps = [];
    const receivedAt = [];
    for (let item = 0; item < length; item += 1) {
      const index = offset + item;
      const sampleIndex = (index * cadence) / source.cadence;
      const value = values[sampleIndex];
      const timestamp = new Date(start.getTime() + index * cadence);
      sequences.push(sampleIndex);
      engineeringValues.push(value);
      rawValues.push(rawValue(source.metric, value));
      timestamps.push(timestamp);
      receivedAt.push(new Date(timestamp.getTime() + 200 + (index % 47)));
    }
    const result = await pool.query(insertHistorySql, [
      SITE_ID,
      source.deviceId,
      bootId,
      source.sensorId,
      ASSET_ID,
      source.metric,
      source.unit,
      sequences,
      engineeringValues,
      rawValues,
      timestamps,
      receivedAt,
    ]);
    inserted += result.rowCount;
  }
  return inserted;
}

async function refreshCurrentState(pool) {
  await pool.query(
    `
    INSERT INTO digital_twin.current_state_projection AS current_state (
      asset_id, sensor_id, metric, measurement_id, source_ts,
      measurement_received_at, source_status
    )
    SELECT DISTINCT ON (asset_id, sensor_id, metric)
      asset_id, sensor_id, metric, measurement_id, ts, received_at, 'unknown'
    FROM digital_twin.measurements
    WHERE site_id = $1 AND device_id = ANY($2)
      AND boot_id LIKE 'acceptance-history-%'
    ORDER BY asset_id, sensor_id, metric, ts DESC, received_at DESC, measurement_id DESC
    ON CONFLICT (asset_id, sensor_id, metric) DO UPDATE SET
      measurement_id = EXCLUDED.measurement_id,
      source_ts = EXCLUDED.source_ts,
      measurement_received_at = EXCLUDED.measurement_received_at,
      source_status = EXCLUDED.source_status
    WHERE ROW(EXCLUDED.source_ts, EXCLUDED.measurement_received_at, EXCLUDED.measurement_id)
      > ROW(current_state.source_ts, current_state.measurement_received_at, current_state.measurement_id)`,
    [SITE_ID, deviceIds]
  );
}

export async function assertSimulationOwnership(pool) {
  const result = await pool.query(
    `SELECT EXISTS (
       SELECT 1 FROM digital_twin.devices
       WHERE asset_id = $1 AND connectivity_status = 'online'
         AND device_id <> ALL($2)
     ) AS physical_online`,
    [ASSET_ID, deviceIds]
  );
  if (result.rows[0].physical_online)
    throw new Error('A non-simulation device is online for this asset; stop simulation.');
}

async function populate(pool, startText) {
  const defaultStart = new Date(
    Math.floor(Date.now() / 3_600_000) * 3_600_000 - HISTORY_HOURS * 3_600_000
  );
  let existingStart;
  for (const source of sources) {
    const existing = await pool.query(
      `SELECT ts FROM digital_twin.measurements
       WHERE asset_id = $1 AND metric = $2 AND sensor_id = $3
         AND boot_id LIKE 'acceptance-history-%'
       ORDER BY ts LIMIT 1`,
      [ASSET_ID, source.metric, source.sensorId]
    );
    if (existing.rows[0]) {
      existingStart = existing.rows[0].ts;
      break;
    }
  }
  const start = new Date(existingStart ?? startText ?? defaultStart);
  if (Number.isNaN(start.getTime())) throw new Error('Start timestamp must be RFC 3339.');
  await assertSimulationOwnership(pool);
  await registerSources(pool);
  const bootId = `acceptance-history-${start.toISOString()}`;
  const complete = new Set();
  for (const source of sources) {
    const cadence = conditionSources.includes(source) ? MINUTE : source.cadence;
    const finish = new Date(start.getTime() + HISTORY_HOURS * 3_600_000 - cadence);
    const coverage = await pool.query(
      `SELECT EXISTS (
         SELECT 1 FROM digital_twin.measurements
         WHERE asset_id = $1 AND device_id = $2 AND sensor_id = $3 AND metric = $4
           AND boot_id = $5 AND ts = $6
       ) AS complete`,
      [ASSET_ID, source.deviceId, source.sensorId, source.metric, bootId, finish]
    );
    if (coverage.rows[0].complete) complete.add(source.sensorId);
  }
  const missing = missingHistorySources(complete);
  if (missing.length === 0) {
    console.log(JSON.stringify({ population: 'skipped', missing_sources: 0 }));
    return;
  }
  const before = await pool.query(`SELECT pg_database_size(current_database()) AS size`);
  const generated = createAcceptanceSeries({ start });
  const startedAt = performance.now();
  let inserted = 0;
  for (const source of missing) {
    let values;
    if (source.sensorId === 'acceptance-sht31-a-temperature') {
      values = generated.environmental.temperatureA;
    } else if (source.sensorId === 'acceptance-sht31-a-humidity') {
      values = generated.environmental.humidityA;
    } else if (source.sensorId === 'acceptance-sht31-b-temperature') {
      values = generated.environmental.temperatureB;
    } else if (source.sensorId === 'acceptance-sht31-b-humidity') {
      values = generated.environmental.humidityB;
    } else if (source.metric === 'sound_rms_dbfs') {
      values = generated.environmental.acousticRms;
    } else if (source.metric === 'sound_peak_dbfs') {
      values = generated.environmental.acousticPeak;
    } else if (generated.diagnostics.has(diagnosticSeriesKey(source))) {
      values = generated.diagnostics.get(diagnosticSeriesKey(source));
    } else if (generated.power.has(source.sensorId)) {
      values = generated.power.get(source.sensorId);
    } else if (generated.network.has(source.metric)) {
      values = generated.network.get(source.metric);
    } else {
      values = generated.electrical.get(source.metric);
    }
    inserted += await insertSeries(
      pool,
      source,
      start,
      values,
      conditionSources.includes(source) ? MINUTE : source.cadence
    );
    console.log(`${source.metric} ${source.sensorId} populated`);
  }
  await refreshCurrentState(pool);
  await pool.query('ANALYZE digital_twin.measurements');
  const elapsedSeconds = (performance.now() - startedAt) / 1000;
  const after = await pool.query(`SELECT pg_database_size(current_database()) AS size`);
  console.log(
    JSON.stringify({
      start: start.toISOString(),
      end: new Date(start.getTime() + HISTORY_HOURS * 3_600_000).toISOString(),
      inserted_rows: inserted,
      missing_sources: missing.length,
      elapsed_seconds: round(elapsedSeconds, 3),
      inserted_rows_per_second: round(inserted / elapsedSeconds, 1),
      database_bytes_before: Number(before.rows[0].size),
      database_bytes_after: Number(after.rows[0].size),
    })
  );
}

export function incompleteConditionSources(coverage, expectedPoints = HISTORY_HOURS * 60) {
  return conditionSources.filter(({ sensorId }) => {
    const row = coverage.get(sensorId);
    return (
      !row ||
      Number(row.count) !== expectedPoints ||
      Number(row.first_seq) !== 0 ||
      Number(row.last_seq) < (expectedPoints - 1) * 6
    );
  });
}

async function backfill(pool) {
  const range = await pool.query(
    `SELECT min(ts) AS start, max(ts) AS finish
     FROM digital_twin.measurements
     WHERE asset_id = $1 AND sensor_id = 'acceptance-sht31-a-temperature'
       AND boot_id LIKE 'acceptance-history-%'`,
    [ASSET_ID]
  );
  if (!range.rows[0].start) throw new Error('Acceptance history must exist before backfill.');
  const start = new Date(range.rows[0].start);
  const finish = new Date(range.rows[0].finish);
  if (finish.getTime() - start.getTime() !== HISTORY_HOURS * 3_600_000 - SECOND)
    throw new Error('Acceptance history does not cover the expected five-day period.');
  const bootId = `acceptance-history-${start.toISOString()}`;
  const result = await pool.query(
    `SELECT sensor_id,
       count(*) FILTER (WHERE seq % 6 = 0) AS count,
       min(seq) FILTER (WHERE seq % 6 = 0) AS first_seq,
       max(seq) FILTER (WHERE seq % 6 = 0) AS last_seq
     FROM digital_twin.measurements
     WHERE asset_id = $1 AND boot_id = $2 AND sensor_id = ANY($3)
     GROUP BY sensor_id`,
    [ASSET_ID, bootId, conditionSources.map(({ sensorId }) => sensorId)]
  );
  const missing = incompleteConditionSources(
    new Map(result.rows.map((row) => [row.sensor_id, row]))
  );
  if (missing.length === 0) {
    console.log(JSON.stringify({ backfill: 'skipped', missing_metrics: 0 }));
    return;
  }
  await registerSources(pool);
  const generated = createAcceptanceSeries({ start });
  let inserted = 0;
  for (const source of missing) {
    const values =
      generated.power.get(source.sensorId) ??
      generated.diagnostics.get(diagnosticSeriesKey(source));
    inserted += await insertSeries(pool, source, start, values, MINUTE);
  }
  console.log(
    JSON.stringify({
      backfill: 'complete',
      missing_metrics: missing.length,
      inserted_rows: inserted,
    })
  );
}

function mqttClient() {
  return import('mqtt').then(({ connectAsync }) =>
    connectAsync(process.env.MQTT_URL, {
      clean: true,
      clientId: `dt-acceptance-feed-${process.pid}`,
      password: process.env.MQTT_PASSWORD,
      protocolVersion: 5,
      username: process.env.MQTT_USERNAME,
    })
  );
}

async function publish(client, source, timestamp, value) {
  const seq = Math.floor(timestamp.getTime() / source.cadence);
  const payload = {
    schema_version: '1.0',
    site_id: SITE_ID,
    device_id: source.deviceId,
    boot_id: 'acceptance-live',
    seq,
    sensor_id: source.sensorId,
    asset_id: ASSET_ID,
    metric: source.metric,
    value,
    unit: source.unit,
    ts: timestamp.toISOString(),
    quality: 'good',
  };
  const raw = rawValue(source.metric, value);
  if (raw !== null) payload.raw_value = raw;
  const topic = `dt/${SITE_ID}/telemetry/${source.deviceId}/${source.sensorId}/${source.metric}`;
  await client.publishAsync(topic, JSON.stringify(payload), { qos: 1 });
}

async function publishDeviceStatus(client, status) {
  for (const deviceId of deviceIds) {
    await client.publishAsync(
      `dt/${SITE_ID}/device/${deviceId}/status`,
      JSON.stringify({
        schema_version: '1.0',
        site_id: SITE_ID,
        device_id: deviceId,
        boot_id: 'acceptance-live',
        status,
      }),
      { qos: 1, retain: true }
    );
  }
}

async function live(pool, hoursText = '120') {
  const hours = Number(hoursText);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 120)
    throw new Error('Live duration must be between 0 and 120 hours.');
  await assertSimulationOwnership(pool);
  await registerSources(pool);
  const client = await mqttClient();
  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  const stopAt = Date.now() + hours * 3_600_000;
  let published = 0;
  try {
    await publishDeviceStatus(client, 'online');
    const initial = await pool.query(
      `SELECT sensor_id, metric, value, source_ts FROM digital_twin.current_state WHERE asset_id = $1`,
      [ASSET_ID]
    );
    const latest = new Map(initial.rows.map((row) => [row.sensor_id, row]));
    const started = await pool.query(
      `SELECT min(ts) AS start FROM digital_twin.measurements
       WHERE asset_id = $1 AND sensor_id = 'acceptance-sht31-a-temperature'
         AND boot_id LIKE 'acceptance-history-%'`,
      [ASSET_ID]
    );
    const modelStart = started.rows[0].start
      ? new Date(started.rows[0].start)
      : new Date(Date.now() - HISTORY_HOURS * 3_600_000);
    const generated = createAcceptanceSeries({
      durationSeconds: Math.ceil((stopAt - modelStart.getTime()) / SECOND) + 1,
      start: modelStart,
    });
    const environmentalBySensor = new Map([
      ['acceptance-sht31-a-temperature', generated.environmental.temperatureA],
      ['acceptance-sht31-a-humidity', generated.environmental.humidityA],
      ['acceptance-sht31-b-temperature', generated.environmental.temperatureB],
      ['acceptance-sht31-b-humidity', generated.environmental.humidityB],
      ['acceptance-inmp441-rms', generated.environmental.acousticRms],
      ['acceptance-inmp441-peak', generated.environmental.acousticPeak],
    ]);
    let nextSecond = Math.floor(Date.now() / SECOND) * SECOND;
    let nextTenSeconds = Math.floor(Date.now() / TEN_SECONDS) * TEN_SECONDS;
    while (!stopping && Date.now() < stopAt) {
      const now = Date.now();
      if (now >= nextTenSeconds) await assertSimulationOwnership(pool);
      if (now >= nextSecond) {
        const timestamp = new Date(nextSecond);
        const index = Math.max(0, Math.floor((nextSecond - modelStart.getTime()) / SECOND));
        for (const source of sources.filter(({ cadence }) => cadence === SECOND)) {
          if (new Date(latest.get(source.sensorId)?.source_ts ?? 0) >= timestamp) continue;
          const values = environmentalBySensor.get(source.sensorId);
          const value = values[index];
          await publish(client, source, timestamp, value);
          latest.set(source.sensorId, { source_ts: timestamp, value });
          published += 1;
        }
        nextSecond += SECOND;
      }
      if (now >= nextTenSeconds) {
        const timestamp = new Date(nextTenSeconds);
        const index = Math.max(
          0,
          Math.floor((nextTenSeconds - modelStart.getTime()) / TEN_SECONDS)
        );
        for (const source of sources.filter(({ cadence }) => cadence === TEN_SECONDS)) {
          const previous = latest.get(source.sensorId);
          const diagnosticValues = generated.diagnostics.get(diagnosticSeriesKey(source));
          if (!previous && !diagnosticValues && !generated.power.has(source.sensorId))
            throw new Error('Historical population is required before live continuation.');
          if (previous && new Date(previous.source_ts) >= timestamp) continue;
          const values =
            diagnosticValues ??
            generated.power.get(source.sensorId) ??
            generated.network.get(source.metric) ??
            generated.electrical.get(source.metric);
          const value = values[index];
          await publish(client, source, timestamp, value);
          latest.set(source.sensorId, { source_ts: timestamp, value });
          published += 1;
        }
        nextTenSeconds += TEN_SECONDS;
      }
      await delay(100);
    }
  } finally {
    await publishDeviceStatus(client, 'offline');
    await client.endAsync();
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
  console.log(JSON.stringify({ live_hours: hours, published_messages: published }));
}

async function setOffline() {
  const client = await mqttClient();
  try {
    await publishDeviceStatus(client, 'offline');
  } finally {
    await client.endAsync();
  }
}

async function cleanup(pool) {
  const online = await pool.query(
    `SELECT EXISTS (
       SELECT 1 FROM digital_twin.devices
       WHERE device_id = ANY($1) AND connectivity_status = 'online'
     ) AS running`,
    [deviceIds]
  );
  if (online.rows[0].running) throw new Error('Stop the simulation producer before cleanup.');
  const client = await mqttClient();
  try {
    for (const deviceId of deviceIds) {
      await client.publishAsync(`dt/${SITE_ID}/device/${deviceId}/status`, '', {
        qos: 1,
        retain: true,
      });
    }
  } finally {
    await client.endAsync();
  }
  await pool.query('BEGIN');
  try {
    await pool.query(
      `DELETE FROM digital_twin.current_state_projection AS state
       USING digital_twin.measurements AS measurement
       WHERE state.measurement_id = measurement.measurement_id
         AND measurement.asset_id = $1 AND measurement.device_id = ANY($2)
         AND measurement.boot_id LIKE 'acceptance-%'`,
      [ASSET_ID, deviceIds]
    );
    await pool.query(
      `DELETE FROM digital_twin.measurements
       WHERE asset_id = $1 AND device_id = ANY($2) AND boot_id LIKE 'acceptance-%'`,
      [ASSET_ID, deviceIds]
    );
    await pool.query(
      `DELETE FROM digital_twin.ingestion_events
       WHERE topic LIKE ANY($1)`,
      [
        deviceIds.flatMap((id) => [
          `dt/${SITE_ID}/telemetry/${id}/%`,
          `dt/${SITE_ID}/device/${id}/status`,
        ]),
      ]
    );
    await pool.query(
      `UPDATE digital_twin.devices SET connectivity_status = 'unknown',
         connectivity_boot_id = NULL, connectivity_received_at = NULL
       WHERE site_id = $1 AND device_id = ANY($2)`,
      [SITE_ID, deviceIds]
    );
    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
  console.log(JSON.stringify({ simulation_rows: 0, reference_registration: 'preserved' }));
}

async function status(pool) {
  const history = await pool.query(
    `SELECT
       count(*) AS total,
       count(*) FILTER (WHERE metric IN ('temperature','humidity','sound_rms_dbfs','sound_peak_dbfs')) AS mechanical,
       count(*) FILTER (WHERE metric LIKE 'net_%') AS telecommunications,
       count(*) FILTER (WHERE metric IN ('voltage_v','current_a','active_power_w','apparent_power_va','power_factor_ratio','frequency_hz','energy_wh_total')) AS electrical,
       pg_database_size(current_database()) AS database_bytes
     FROM digital_twin.measurements
     WHERE asset_id = $1 AND device_id = ANY($2) AND boot_id LIKE 'acceptance-%'`,
    [ASSET_ID, deviceIds]
  );
  const current = await pool.query(
    `SELECT count(*) AS count FROM digital_twin.current_state WHERE asset_id = $1`,
    [ASSET_ID]
  );
  const anchors = await pool.query(
    `SELECT count(*) AS count FROM digital_twin.sensor_positions WHERE sensor_id = ANY($1)`,
    [spatialAnchors.map(([sensorId]) => sensorId)]
  );
  console.log(
    JSON.stringify({
      ...history.rows[0],
      current_identities: current.rows[0].count,
      spatial_anchors: anchors.rows[0].count,
    })
  );
}

async function readiness(pool) {
  const [history, asset, devices, currentState, anchors] = await Promise.all([
    pool.query(
      `SELECT EXISTS (
         SELECT 1 FROM digital_twin.measurements
         WHERE asset_id = $1 AND sensor_id = 'acceptance-sht31-a-temperature'
           AND boot_id LIKE 'acceptance-history-%' LIMIT 1
       ) AS ready`,
      [ASSET_ID]
    ),
    pool.query(
      `SELECT EXISTS (
         SELECT 1 FROM digital_twin.assets WHERE site_id = $1 AND asset_id = $2
       ) AS ready`,
      [SITE_ID, ASSET_ID]
    ),
    pool.query(
      `SELECT device_id, connectivity_status
       FROM digital_twin.devices WHERE device_id = ANY($1)`,
      [deviceIds]
    ),
    pool.query(
      `SELECT sensor_id, metric, boot_id
       FROM digital_twin.current_state WHERE asset_id = $1 AND device_id = ANY($2)`,
      [ASSET_ID, deviceIds]
    ),
    pool.query(`SELECT sensor_id FROM digital_twin.sensor_positions WHERE sensor_id = ANY($1)`, [
      spatialAnchors.map(([sensorId]) => sensorId),
    ]),
  ]);
  console.log(
    JSON.stringify(
      summarizeAcceptanceReadiness({
        historyReady: history.rows[0].ready,
        assetReady: asset.rows[0].ready,
        devices: devices.rows,
        currentState: currentState.rows,
        anchors: anchors.rows,
      })
    )
  );
}

async function openMetrics(pool) {
  const result = await pool.query(
    `SELECT
       metric,
       sensor_id,
       extract(epoch FROM date_bin(interval '5 minutes', ts, timestamptz '2000-01-01')) AS timestamp_seconds,
       CASE
         WHEN metric LIKE '%_total' THEN max(value)
         ELSE avg(value)
       END AS value
     FROM digital_twin.measurements
     WHERE site_id = $1
     GROUP BY metric, sensor_id, date_bin(interval '5 minutes', ts, timestamptz '2000-01-01')
     ORDER BY metric, sensor_id, timestamp_seconds`,
    [SITE_ID]
  );
  let lastMetric = '';
  for (const row of result.rows) {
    const metric = `dt_datacenter_${row.metric}`;
    if (metric !== lastMetric) {
      console.log(`# TYPE ${metric} gauge`);
      lastMetric = metric;
    }
    console.log(
      `${metric}{context="acceptance",sensor_id="${row.sensor_id}"} ${Number(row.value)} ${Math.trunc(Number(row.timestamp_seconds))}`
    );
  }
  console.log('# EOF');
}

export function assertProducerRetired(command) {
  if (['populate', 'backfill', 'live', 'openmetrics'].includes(command))
    throw new Error('Synthetic producers are retired; physical hardware owns telemetry.');
}

async function runInContainer() {
  assertProducerRetired(process.argv[2]);
  const { default: pg } = await import('pg');
  const pool = new pg.Pool();
  try {
    const command = process.argv[2];
    if (command === 'populate') await populate(pool, process.argv[3]);
    else if (command === 'live') await live(pool, process.argv[3]);
    else if (command === 'backfill') await backfill(pool);
    else if (command === 'cleanup') await cleanup(pool);
    else if (command === 'status') await status(pool);
    else if (command === 'readiness') await readiness(pool);
    else if (command === 'offline') await setOffline();
    else if (command === 'openmetrics') await openMetrics(pool);
    else
      throw new Error(
        'Command must be populate, backfill, live, cleanup, status, readiness, offline, or openmetrics.'
      );
  } finally {
    await pool.end();
  }
}

function docker(arguments_, options = {}) {
  const result = spawnSync('docker', arguments_, { encoding: 'utf8', ...options });
  if (result.status !== 0)
    throw new Error(result.stderr.trim() || `docker exited ${result.status}`);
  return result.stdout.trim();
}

function serviceContainer(project, service) {
  const output = docker([
    'ps',
    '--filter',
    `label=com.docker.compose.project=${project}`,
    '--filter',
    `label=com.docker.compose.service=${service}`,
    '--format',
    '{{.ID}}',
  ]);
  const containers = output.split(/\r?\n/).filter(Boolean);
  if (containers.length !== 1)
    throw new Error(`Expected one running ${service} container for ${project}.`);
  return containers[0];
}

async function runFromHost() {
  const command = process.argv[2];
  assertProducerRetired(command);
  if (
    ![
      'populate',
      'backfill',
      'live',
      'cleanup',
      'status',
      'readiness',
      'offline',
      'openmetrics',
    ].includes(command)
  ) {
    throw new Error(
      'Usage: node scripts/acceptance-data.js populate [start] | backfill | live [hours] | cleanup | status | readiness | offline | openmetrics'
    );
  }
  const project = process.env.DT_ACCEPTANCE_COMPOSE_PROJECT || 'dt_datacenter';
  const backend = serviceContainer(project, 'backend');
  if (command === 'populate' || command === 'backfill') {
    const postgres = serviceContainer(project, 'postgres');
    const migration = await readFile(
      new URL('../database/migrations/system-measurements.sql', import.meta.url)
    );
    docker(
      [
        'exec',
        '-i',
        postgres,
        'sh',
        '-ec',
        'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
      ],
      { input: migration }
    );
  }
  const source = await readFile(new URL(import.meta.url));
  const child = spawn(
    'docker',
    [
      'exec',
      '-i',
      '-e',
      'DT_ACCEPTANCE_CONTAINER=1',
      backend,
      'node',
      '--input-type=module',
      '-',
      ...process.argv.slice(2),
    ],
    { stdio: ['pipe', 'inherit', 'inherit'] }
  );
  child.stdin.end(source);
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  if (exitCode !== 0) throw new Error(`Acceptance data command failed with exit code ${exitCode}.`);
}

if (process.env.DT_ACCEPTANCE_CONTAINER === '1') await runInContainer();
else if (process.argv[1]?.endsWith('acceptance-data.js')) await runFromHost();
