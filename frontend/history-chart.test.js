import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chartObservationBounds,
  historyAssetIds,
  historyChartOption,
  liveChartOption,
  historyUrl,
  sourceColor,
  chartColor,
  themeOption,
} from './history-chart.js';

const start = Date.parse('2026-01-01T00:00:00.000Z');

test('Chart presentation consumes the shared industrial tokens without altering data', () => {
  const previous = globalThis.window;
  globalThis.window = {
    getComputedStyle: () => ({
      color: '#e5e7e5',
      fontFamily: 'Segoe UI',
      getPropertyValue: (key) =>
        ({ '--dt-border-dark': '#464b4b', '--dt-surface': '#333737' })[key] || '',
    }),
  };
  try {
    const original = { series: [{ data: [-25, -30] }], xAxis: { type: 'time' }, dataZoom: [{}] };
    const themed = themeOption({}, original);
    assert.equal(themed.series, original.series);
    assert.equal(themed.tooltip.backgroundColor, '#333737');
    assert.equal(themed.xAxis[0].axisLine.lineStyle.color, '#464b4b');
    assert.equal(themed.color.length, 5);
    assert.equal(themed.dataZoom[0].handleStyle.color, chartColor('steel'));
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});
const point = {
  ts: new Date(start).toISOString(),
  first_ts: new Date(start + 1000).toISOString(),
  last_ts: new Date(start + 9000).toISOString(),
  minimum: 22,
  maximum: 22.2,
  average: 22.1,
  latest: 22.15,
  count: 9,
  quality: 'degraded',
  quality_counts: { good: 8, degraded: 1, unknown: 0 },
  max_gap_seconds: 1,
};
function payload(points = [point], metric = 'temperature', unit = 'degC') {
  return {
    metric,
    from: new Date(start).toISOString(),
    to: new Date(start + 3_600_000).toISOString(),
    bucket_seconds: 10,
    series: [{ sensor_id: 'sht31-a-temperature', unit, points }],
  };
}
const valueSeries = (option) => option.series.filter((series) => series.id.endsWith(':value'));

test('history follows canonical source assets rather than the rack context', () => {
  const records = [
    { asset_id: 'sht31-a', sensor_id: 'sht31-a-temperature', metric: 'temperature' },
    { asset_id: 'sht31-b', sensor_id: 'sht31-b-temperature', metric: 'temperature' },
    { asset_id: 'sht31-a', sensor_id: 'sht31-a-humidity', metric: 'humidity' },
  ];
  assert.deepEqual(historyAssetIds(records, 'temperature', '', []), ['sht31-a', 'sht31-b']);
  assert.deepEqual(historyAssetIds(records, 'humidity', 'sht31-a-humidity', []), ['sht31-a']);
  assert.deepEqual(historyAssetIds([], 'temperature', '', ['sht31-a']), ['sht31-a']);
});

test('history requests preserve bounded range and opt into exact analytics', () => {
  const url = historyUrl({
    assetId: 'test-rack',
    metric: 'temperature',
    sensorId: 'test-sensor',
    range: '5d',
    maxPoints: 1200,
    now: Date.parse('2026-01-06T00:00:00.000Z'),
  });
  assert.match(url, /^\/api\/assets\/test-rack\/history\?/);
  assert.match(url, /metric=temperature/);
  assert.match(url, /max_points=1200/);
  assert.match(url, /sensor_id=test-sensor/);
  assert.doesNotMatch(url, /analytics=/);
  assert.match(
    historyUrl({ assetId: 'x', metric: 'temperature', analytics: true }),
    /analytics=true/
  );
  assert.throws(() => historyUrl({ assetId: 'x', metric: 'x', range: '30d' }), /Unsupported/);
});

test('history axes pad measured variation without forcing the temperature reference range', () => {
  const option = historyChartOption(payload());
  assert.equal(option.xAxis.type, 'time');
  assert.equal(option.xAxis.min, start);
  assert.equal(option.xAxis.max, start + 3_600_000);
  assert.equal(option.yAxis[0].name, 'Temperature (°C)');
  assert.ok(option.yAxis[0].min < 22 && option.yAxis[0].min > 21.9);
  assert.ok(option.yAxis[0].max > 22.2 && option.yAxis[0].max < 22.3);
  assert.deepEqual(valueSeries(option)[0].markArea.data, [[{ yAxis: 18 }, { yAxis: 27 }]]);
  const absolute = historyChartOption(payload(), { absoluteScale: true, referenceBand: false });
  assert.ok(absolute.yAxis[0].min < 18 && absolute.yAxis[0].max > 27);
  assert.equal(valueSeries(absolute)[0].markArea, undefined);
  const constant = historyChartOption(
    payload([{ ...point, minimum: 0, maximum: 0, average: 0 }], 'current', 'A')
  );
  assert.ok(constant.yAxis[0].min < 0 && constant.yAxis[0].max > 0);
});

test('history keeps bucket extrema including signed ranges and outliers', () => {
  const data = payload(
    [{ ...point, minimum: -60, maximum: -2, average: -10 }],
    'sound_level',
    'dBFS'
  );
  const option = historyChartOption(data);
  assert.ok(option.yAxis[0].min < -60 && option.yAxis[0].max > -2);
  const [minimum, range, value] = option.series;
  assert.deepEqual(minimum.data[0].value, [start, -60]);
  assert.deepEqual(range.data[0].value, [start, 58]);
  assert.equal(minimum.stackStrategy, 'all');
  assert.equal(range.stackStrategy, 'all');
  assert.deepEqual(value.data[0].value, [start, -10]);
  assert.equal(value.connectNulls, false);
  assert.equal(value.sampling, undefined);
});

test('history interrupts missing observation intervals and zero-count buckets', () => {
  const option = historyChartOption(
    payload([
      point,
      {
        ...point,
        ts: new Date(start + 60_000).toISOString(),
        first_ts: new Date(start + 61_000).toISOString(),
        last_ts: new Date(start + 69_000).toISOString(),
        max_gap_seconds: 52,
      },
      {
        ...point,
        ts: new Date(start + 70_000).toISOString(),
        first_ts: new Date(start + 71_000).toISOString(),
        last_ts: new Date(start + 79_000).toISOString(),
        count: 0,
      },
    ])
  );
  const values = valueSeries(option)[0].data.map((item) => item.value);
  assert.deepEqual(values, [
    [start, 22.1],
    [start + 30_000, null],
    [start + 60_000, 22.1],
    [start + 70_000, null],
  ]);
  assert.deepEqual(
    option.series[0].data.map((item) => item.value[1]),
    [22, null, 22, null]
  );
  const internalGap = historyChartOption(
    payload([
      point,
      {
        ...point,
        ts: new Date(start + 10_000).toISOString(),
        first_ts: new Date(start + 11_000).toISOString(),
        last_ts: new Date(start + 19_000).toISOString(),
        max_gap_seconds: 40,
      },
    ])
  );
  assert.equal(valueSeries(internalGap)[0].data[1].value[1], null);
});

test('selected statistics are explicit and latest uses its actual observation timestamp', () => {
  const expected = { average: 22.1, latest: 22.15, minimum: 22, maximum: 22.2 };
  for (const [valueMode, value] of Object.entries(expected)) {
    const series = valueSeries(historyChartOption(payload(), { valueMode }))[0];
    assert.equal(series.data[0].value[1], value);
    assert.equal(series.data[0].value[0], valueMode === 'latest' ? start + 9000 : start);
  }
  const withoutLatest = historyChartOption(payload([{ ...point, latest: undefined }]), {
    valueMode: 'latest',
  });
  assert.equal(valueSeries(withoutLatest)[0].data[0].value[1], null);
  assert.throws(() => historyChartOption(payload(), { valueMode: 'median' }), /Unsupported/);
});

test('time labels and tooltips show Jakarta time with actual timestamps and sampling quality', () => {
  const option = historyChartOption(payload());
  assert.equal(option.xAxis.axisLabel.formatter(start), '07:00:00');
  const text = option.tooltip.formatter([
    { seriesName: 'sht31-a-temperature', data: valueSeries(option)[0].data[0] },
  ]);
  assert.match(text, /Bucket mean: 22.1 °C/);
  assert.match(text, /First: 01 Jan 2026, 07:00:01.000 WIB/);
  assert.match(text, /Last: 01 Jan 2026, 07:00:09.000 WIB/);
  assert.match(text, /Observations: 9 · degraded/);
  assert.match(text, /8 good · 1 degraded · 0 unknown/);
  assert.match(text, /Largest sampling gap: 1 s/);
  const fiveDays = historyChartOption({
    ...payload(),
    to: new Date(start + 5 * 86_400_000).toISOString(),
  });
  assert.match(fiveDays.xAxis.axisLabel.formatter(start + 23 * 3_600_000), /02 Jan.*06:00/);
});

test('source IDs, colors, original units and fit bounds remain stable across selection changes', () => {
  const data = payload();
  data.series.push({ sensor_id: 'sht31-b-temperature', unit: 'degC', points: [point] });
  const all = historyChartOption(data);
  const filtered = historyChartOption({ ...data, series: [data.series[1]] });
  assert.deepEqual(all.legend.data, ['sht31-a-temperature', 'sht31-b-temperature']);
  assert.equal(valueSeries(all)[1].id, valueSeries(filtered)[0].id);
  assert.equal(valueSeries(all)[1].itemStyle.color, valueSeries(filtered)[0].itemStyle.color);
  assert.notEqual(sourceColor('sht31-a-temperature'), sourceColor('sht31-b-temperature'));
  assert.equal(sourceColor('sht31-a-temperature'), sourceColor('sht31-a-humidity'));
  assert.deepEqual(chartObservationBounds(all), [start + 1000, start + 9000]);
  const humidity = historyChartOption(payload([point], 'humidity', 'percent_rh'));
  assert.equal(humidity.yAxis[0].id, 'percent_rh');
  assert.equal(humidity.yAxis[0].name, 'Humidity (%RH)');
  const network = historyChartOption(payload([point], 'net_rx_rate', 'bytes_per_second'));
  assert.equal(network.yAxis[0].id, 'bytes_per_second');
  assert.equal(network.yAxis[0].name, 'Net rx rate (B/s)');
  assert.equal(chartObservationBounds({ xAxis: { type: 'value' }, series: [] }), null);
});

test('empty or partial histories still have finite ordered time bounds', () => {
  const empty = historyChartOption({ series: [] }, { now: start });
  assert.equal(empty.xAxis.min, start - 3_600_000);
  assert.equal(empty.xAxis.max, start);
  assert.deepEqual(empty.series, []);
  assert.equal(chartObservationBounds(empty), null);
  const partial = historyChartOption({ series: payload().series });
  assert.equal(partial.xAxis.min, start + 1000);
  assert.equal(partial.xAxis.max, start + 9000);
  const single = historyChartOption({
    series: payload([{ ...point, first_ts: point.ts, last_ts: point.ts }]).series,
  });
  assert.ok(single.xAxis.min < start && single.xAxis.max > start);
});

test('axis labels use readable engineering precision without changing measured values', () => {
  const option = historyChartOption(payload());
  const format = option.yAxis[0].axisLabel.formatter;
  assert.equal(format(41.25461087199999), '41.255');
  assert.equal(format(123456789), '1.23e+8');
  assert.equal(format(0.0002), '2.00e-4');
  assert.equal(format(0), '0');
  assert.equal(valueSeries(option)[0].data[0].value[1], point.average);
});

test('live charts use exact observations, explicit discontinuities and the existing chart controls', () => {
  const observations = [
    {
      sensor_id: 'sht31-a-temperature',
      metric: 'temperature',
      unit: 'degC',
      value: 34.0764465,
      source_ts: new Date(start).toISOString(),
      received_at: new Date(start + 10).toISOString(),
      quality: 'good',
    },
    {
      sensor_id: 'sht31-a-temperature',
      metric: 'temperature',
      unit: 'degC',
      value: 34.0764465,
      source_ts: new Date(start + 2040).toISOString(),
      received_at: new Date(start + 2050).toISOString(),
      quality: 'degraded',
      breakBefore: true,
    },
  ];
  const option = liveChartOption(observations, {
    sensorId: 'sht31-a-temperature',
    metric: 'temperature',
    unit: 'degC',
    label: 'Temperature',
    now: start + 3000,
  });
  assert.equal(option.series.length, 1);
  assert.deepEqual(
    option.series[0].data.map((point) => point.value),
    [
      [start, 34.0764465],
      [start + 2040, null],
      [start + 2040, 34.0764465],
    ]
  );
  assert.equal(option.series[0].connectNulls, false);
  assert.equal(option.xAxis.min, start + 3000 - 300_000);
  assert.equal(option.xAxis.max, start + 3000);
  assert.equal(option.dataZoom.length, 2);
  assert.equal(option.series[0].markArea, undefined);
  assert.match(option.aria.description, /Live observations/);
  const text = option.tooltip.formatter([{ data: option.series[0].data.at(-1) }]);
  assert.match(text, /34.1 °C/);
  assert.match(text, /Quality: degraded/);
  assert.match(text, /Observed: .*07:00:02.040 WIB/);
  assert.doesNotMatch(text, /Bucket|mean/);
});

test('live acoustic tooltips retain dBFS without rounding the plotted signal', () => {
  const record = {
    sensor_id: 'rack-sound-rms',
    metric: 'sound_rms_dbfs',
    unit: 'dBFS',
    value: -47.60849,
    source_ts: new Date(start).toISOString(),
    received_at: new Date(start + 12).toISOString(),
    quality: 'good',
  };
  const option = liveChartOption([record], {
    sensorId: record.sensor_id,
    metric: record.metric,
    unit: record.unit,
    label: 'RMS',
    now: start,
  });
  assert.equal(option.series[0].data[0].value[1], record.value);
  assert.equal(option.yAxis[0].name, 'RMS (dBFS)');
  assert.match(option.tooltip.formatter([{ data: option.series[0].data[0] }]), /-47.6 dBFS/);
  const empty = liveChartOption([], {
    sensorId: record.sensor_id,
    metric: record.metric,
    unit: record.unit,
    label: 'RMS',
    now: start,
  });
  assert.equal(empty.series[0].data.length, 0);
  assert.ok(empty.yAxis[0].max > empty.yAxis[0].min);
});
