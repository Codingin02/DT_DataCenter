import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANALYTICS_CATEGORIES,
  buildAnalyticsPanels,
  counterDeltas,
  pairObservations,
  rawObservations,
  resourceComposition,
} from './analytics.js';

const ts = (ms = 0) => new Date(Date.parse('2026-01-01T00:00:00Z') + ms).toISOString();
const sample = (value, ms = 0, extras = {}) => ({ value, ts: ts(ms), ...extras });
const point = (latest, ms = 0, extras = {}) => ({
  ts: ts(ms),
  last_ts: ts(ms),
  latest,
  average: latest,
  minimum: latest,
  maximum: latest,
  count: 1,
  ...extras,
});
const payload = (metric, sensorId, points, summary) => ({
  metric,
  asset_id: 'test-source',
  from: ts(),
  to: ts(10_000),
  bucket_seconds: 1,
  series: [
    {
      sensor_id: sensorId,
      unit: metric === 'temperature' ? 'degC' : 'percent_rh',
      points,
      summary,
    },
  ],
});

test('analytics categories contain canonical supported metric families', () => {
  assert.deepEqual(
    Object.values(ANALYTICS_CATEGORIES).map(({ metrics }) => metrics.length),
    [2, 2, 8, 13, 11]
  );
  assert.ok(!ANALYTICS_CATEGORIES.device.metrics.includes('device_temperature_c'));
  assert.ok(!ANALYTICS_CATEGORIES.electrical.metrics.includes('power_factor_ratio'));
  assert.throws(() => buildAnalyticsPanels('missing', []), /Unsupported/);
  assert.throws(
    () => buildAnalyticsPanels('mechanical', [], { aggregation: 'sum' }),
    /Unsupported/
  );
  assert.deepEqual(buildAnalyticsPanels('mechanical', []), []);
});

test('actual observations never substitute bucket average or timestamp for missing raw metadata', () => {
  assert.deepEqual(
    rawObservations({
      points: [{ ts: ts(), average: 50 }, point(null), point(NaN), point(2, 1000), point(1)],
    }).map(({ value }) => value),
    [1, 2]
  );
  assert.deepEqual(rawObservations({ points: [point(2, 0, { last_ts: null })] }), []);
});

test('sample pairing uses actual timestamps, finite values, nearest unique match and known boot identity', () => {
  const pairs = pairObservations(
    [sample(1), sample(2, 100), sample(3, 1000), sample(null, 2000)],
    [sample(9, 90), sample(8, 500), sample(7, 1200), sample(6, 2000)]
  );
  assert.deepEqual(
    pairs.map(({ left, right }) => [left.value, right.value]),
    [
      [1, 9],
      [3, 7],
    ]
  );
  assert.deepEqual(
    pairObservations([sample(1, 0, { boot_id: 'a' })], [sample(2, 0, { boot_id: 'b' })]),
    []
  );
  assert.equal(pairObservations([sample(1)], [sample(2, 250)]).length, 1);
  assert.deepEqual(pairObservations([sample(1)], [sample(2, 251)]), []);
  assert.deepEqual(pairObservations([sample(1)], [sample(2)], -1), []);
});

test('counter deltas skip resets, internal bucket resets, changed boots, duplicate timestamps and long gaps', () => {
  assert.deepEqual(
    counterDeltas([
      sample(10),
      sample(12, 1000),
      sample(1, 2000),
      sample(3, 3000),
      sample(9, 90_000),
    ]).map(({ value }) => value),
    [2, 2]
  );
  for (const current of [
    sample(15, 1000, { minimum: 2 }),
    sample(15, 1000, { max_gap_seconds: 70 }),
    sample(15, 0),
  ])
    assert.deepEqual(counterDeltas([sample(10), current]), []);
  assert.deepEqual(
    counterDeltas([sample(10, 0, { boot_id: 'a' }), sample(15, 1000, { boot_id: 'b' })]),
    []
  );
  assert.deepEqual(
    counterDeltas([sample(10), sample(10, 1000)]).map(({ value }) => value),
    [0]
  );
  assert.deepEqual(counterDeltas([sample(null), sample(NaN), sample(-1)]), []);
});

test('resource percentages require simultaneous positive capacity and valid free bytes', () => {
  assert.deepEqual(resourceComposition([sample(100)], [sample(30)]), [
    { ts: ts(), capacity: 100, free: 30, used: 70, usedPercent: 70 },
  ]);
  for (const free of [-1, 101, null, NaN])
    assert.deepEqual(resourceComposition([sample(100)], [sample(free)]), []);
  assert.deepEqual(resourceComposition([sample(0)], [sample(0)]), []);
  assert.deepEqual(resourceComposition([sample(100)], [sample(30, 1)]), []);
});

test('distributions use backend raw statistics and never bucket means', () => {
  const summary = {
    count: 4,
    minimum: 1,
    maximum: 9,
    quartiles: [2, 4, 8],
    histogram: [
      { minimum: 1, maximum: 5, count: 2 },
      { minimum: 5, maximum: 9, count: 2 },
    ],
  };
  const panels = buildAnalyticsPanels('mechanical', [
    payload('temperature', 'sht31-a-temperature', [point(5)], summary),
  ]);
  assert.deepEqual(
    panels.map(({ kind }) => kind),
    ['time', 'histogram', 'box']
  );
  assert.deepEqual(panels[2].option.series[0].data, [[1, 2, 4, 8, 9]]);
  assert.deepEqual(
    buildAnalyticsPanels('mechanical', [
      payload('temperature', 'sht31-a-temperature', [point(5)]),
    ]).map(({ kind }) => kind),
    ['time']
  );
  const bad = {
    ...summary,
    quartiles: [4, 2, 8],
    histogram: [{ minimum: 1, maximum: 9, count: 2 }],
  };
  assert.deepEqual(
    buildAnalyticsPanels('mechanical', [
      payload('temperature', 'sht31-a-temperature', [point(5)], bad),
    ]).map(({ kind }) => kind),
    ['time']
  );
});

test('scatter pairs actual last observations only on the same physical module', () => {
  const temperature = payload('temperature', 'sht31-a-temperature', [
    point(22, 1000, { average: 15 }),
  ]);
  const humidity = payload('humidity', 'sht31-a-humidity', [point(60, 1100, { average: 30 })]);
  const scatter = buildAnalyticsPanels('mechanical', [temperature, humidity]).find(
    ({ kind }) => kind === 'scatter'
  );
  assert.deepEqual(scatter.option.series[0].data[0].slice(0, 4), [22, 60, ts(1000), ts(1100)]);
  for (const mismatch of [
    { ...humidity, series: [{ ...humidity.series[0], sensor_id: 'sht31-b-humidity' }] },
    { ...humidity, asset_id: 'other-source' },
    payload('humidity', 'sht31-a-humidity', [point(60, 1300)]),
  ])
    assert.ok(
      !buildAnalyticsPanels('mechanical', [temperature, mismatch]).some(
        ({ kind }) => kind === 'scatter'
      )
    );
});

test('native energy deltas, exact resource composition, gauges and discrete states produce meaningful chart types', () => {
  const energy = payload('energy_wh_total', 'shelly-energy_wh_total', [point(10), point(13, 1000)]);
  energy.series[0].unit = 'Wh';
  const returnedEnergy = payload('returned_energy_wh_total', 'shelly-returned_energy_wh_total', [
    point(4),
    point(5, 1000),
  ]);
  returnedEnergy.series[0].unit = 'Wh';
  const panels = buildAnalyticsPanels('electrical', [energy, returnedEnergy]);
  assert.ok(panels.some(({ title }) => title === 'Active Energy'));
  assert.ok(panels.some(({ title }) => title === 'Returned Energy'));
  const delta = buildAnalyticsPanels('electrical', [energy]).find(({ kind }) => kind === 'delta');
  assert.deepEqual(delta.option.series[0].data[0].slice(0, 2), [ts(1000), 3]);
  assert.equal(delta.option.yAxis.name, 'Wh');
  assert.deepEqual(delta.option.xAxis, {
    type: 'time',
    min: Date.parse(energy.from),
    max: Date.parse(energy.to),
  });
  const resource = buildAnalyticsPanels('device', [
    payload('ram_size_bytes', 'shelly-ram_size_bytes', [point(100)]),
    payload('ram_free_bytes', 'shelly-ram_free_bytes', [point(30)]),
  ]).find(({ kind }) => kind === 'treemap');
  assert.deepEqual(resource.option.series[0].data, [
    { name: 'Used', value: 70 },
    { name: 'Free', value: 30 },
  ]);
  const network = buildAnalyticsPanels('telecommunications', [
    payload('net_link_utilization_ratio', 'nic-net_link_utilization_ratio', [point(0.3)]),
    payload('net_operation_status', 'nic-net_operation_status', [
      point(1),
      point(0, 1000),
      point(0.5, 2000),
    ]),
  ]);
  assert.equal(network.find(({ kind }) => kind === 'gauge').option.series[0].data[0].value, 30);
  assert.deepEqual(
    network.find(({ kind }) => kind === 'state').option.series[0].data.map((entry) => entry[2]),
    [1, 0]
  );
  assert.ok(!network.some(({ id }) => id === 'net_operation_status-time'));
  assert.deepEqual(network.find(({ kind }) => kind === 'state').option.xAxis, {
    type: 'time',
    min: Date.parse(ts()),
    max: Date.parse(ts(10_000)),
  });
  for (const invalid of [null, NaN, -0.1, 1.1])
    assert.ok(
      !buildAnalyticsPanels('telecommunications', [
        payload('net_link_utilization_ratio', 'nic-net_link_utilization_ratio', [point(invalid)]),
      ]).some(({ kind }) => kind === 'gauge')
    );
});

test('throughput area uses selected values and rejects invalid timestamps and negative rates', () => {
  const rates = payload(
    'net_receive_throughput_bytes_per_second',
    'nic-net_receive_throughput_bytes_per_second',
    [
      point(40, 1000, { average: 20, last_ts: ts(1100) }),
      point(-1, 2000),
      point(10, 3000, { last_ts: null }),
    ]
  );
  const area = buildAnalyticsPanels('telecommunications', [rates], { aggregation: 'latest' }).find(
    ({ kind }) => kind === 'area'
  );
  assert.deepEqual(
    area.option.series[0].data.map((data) => data.slice(0, 2)),
    [
      [Date.parse(ts(1100)), 40],
      [Date.parse(ts(2000)), null],
    ]
  );
  assert.deepEqual(area.option.xAxis, {
    type: 'time',
    min: Date.parse(rates.from),
    max: Date.parse(rates.to),
  });
  assert.equal(area.option.series[0].areaStyle.opacity, 0.12);
});

test('throughput area leaves missing observation intervals disconnected', () => {
  const rates = payload(
    'net_receive_throughput_bytes_per_second',
    'nic-net_receive_throughput_bytes_per_second',
    [point(10), point(20, 40_000), point(30, 41_000, { max_gap_seconds: 35 })]
  );
  const area = buildAnalyticsPanels('telecommunications', [rates]).find(
    ({ kind }) => kind === 'area'
  );
  assert.deepEqual(
    area.option.series[0].data.map((value) => value[1]),
    [10, null, 20, null, 30]
  );
  assert.equal(area.option.series[0].connectNulls, false);
});

test('derived tooltips preserve units, raw quality and actual Asia/Jakarta timestamps', () => {
  const panels = buildAnalyticsPanels('mechanical', [
    payload('temperature', 'sht31-a-temperature', [point(22, 1000, { quality: 'good' })]),
    payload('humidity', 'sht31-a-humidity', [point(60, 1100, { quality: 'degraded' })]),
  ]);
  const scatter = panels.find(({ kind }) => kind === 'scatter').option;
  const text = scatter.tooltip.formatter({
    data: scatter.series[0].data[0],
    seriesName: 'SHT31 A',
  });
  assert.match(text, /Temperature: 22\.0 °C/);
  assert.match(text, /Humidity: 60\.0 %RH/);
  assert.match(text, /07:00:01\.000 WIB · good/);
  assert.match(text, /07:00:01\.100 WIB · degraded/);
  assert.equal(scatter.tooltip.renderMode, 'richText');
  assert.equal(scatter.series[0].itemStyle.color, '#d6b16d');
  const summary = {
    count: 1,
    minimum: 22,
    maximum: 22,
    quartiles: [22, 22, 22],
    histogram: [{ minimum: 22, maximum: 22, count: 1 }],
  };
  const distribution = buildAnalyticsPanels('mechanical', [
    payload('temperature', 'sht31-a-temperature', [point(22)], summary),
  ]);
  assert.match(
    distribution
      .find(({ kind }) => kind === 'histogram')
      .option.tooltip.formatter([{ dataIndex: 0 }]),
    /Bin: 22\.0 °C – 22\.0 °C\nObservations: 1/
  );
  assert.match(
    distribution.find(({ kind }) => kind === 'box').option.tooltip.formatter(),
    /Median: 22\.0 °C/
  );
});
