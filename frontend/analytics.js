import { measurementValue, sourceLabel, unitLabel } from './presentation.js';
import { chartColor, sourceColor } from './history-chart.js';

export const ANALYTICS_CATEGORIES = Object.freeze({
  mechanical: { label: 'Mechanical', metrics: ['temperature', 'humidity'] },
  acoustic: { label: 'Acoustic', metrics: ['sound_rms_dbfs', 'sound_peak_dbfs'] },
  electrical: {
    label: 'Electrical',
    metrics: [
      'voltage_v',
      'current_a',
      'active_power_w',
      'frequency_hz',
      'energy_wh_total',
      'returned_energy_wh_total',
      'pm1_error_count',
      'pm1_flag_count',
    ],
  },
  telecommunications: {
    label: 'Telecommunications',
    metrics: [
      'net_bytes_received_total',
      'net_bytes_sent_total',
      'net_packets_received_total',
      'net_packets_sent_total',
      'net_packets_received_errors_total',
      'net_packets_outbound_errors_total',
      'net_packets_received_discarded_total',
      'net_packets_outbound_discarded_total',
      'net_current_bandwidth_bytes',
      'net_receive_throughput_bytes_per_second',
      'net_transmit_throughput_bytes_per_second',
      'net_link_utilization_ratio',
      'net_operation_status',
    ],
  },
  device: {
    label: 'Device',
    metrics: [
      'uptime_s',
      'wifi_rssi_dbm',
      'ram_free_bytes',
      'ram_min_free_bytes',
      'ram_size_bytes',
      'fs_free_bytes',
      'fs_size_bytes',
      'mqtt_connected',
      'wifi_connected',
      'restart_required',
      'reset_reason',
    ],
  },
});

const titles = {
  temperature: 'Temperature',
  humidity: 'Humidity',
  sound_rms_dbfs: 'RMS',
  sound_peak_dbfs: 'Peak',
  voltage_v: 'Voltage',
  current_a: 'Current',
  active_power_w: 'Active power',
  frequency_hz: 'Frequency',
  energy_wh_total: 'Active Energy',
  returned_energy_wh_total: 'Returned Energy',
  pm1_error_count: 'Meter errors',
  pm1_flag_count: 'Meter flags',
  uptime_s: 'Uptime',
  wifi_rssi_dbm: 'Wi-Fi signal',
  ram_free_bytes: 'Free RAM',
  ram_min_free_bytes: 'Minimum free RAM',
  ram_size_bytes: 'RAM capacity',
  fs_free_bytes: 'Free storage',
  fs_size_bytes: 'Storage capacity',
  mqtt_connected: 'MQTT connection',
  wifi_connected: 'Wi-Fi connection',
  restart_required: 'Restart required',
  reset_reason: 'Reset reason',
  net_current_bandwidth_bytes: 'Link capacity',
  net_receive_throughput_bytes_per_second: 'Receive throughput',
  net_transmit_throughput_bytes_per_second: 'Transmit throughput',
  net_link_utilization_ratio: 'Link utilization',
  net_operation_status: 'NIC operation state',
};
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const timestamp = (value) => (typeof value === 'string' ? Date.parse(value) : NaN);
const label = (metric) => titles[metric] ?? metric.replace(/^net_/, '').replaceAll('_', ' ');
const stateMetrics = [
  'mqtt_connected',
  'wifi_connected',
  'restart_required',
  'net_operation_status',
];

const jakarta = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  fractionalSecondDigits: 3,
  hourCycle: 'h23',
});
const displayedTime = (value) => {
  const time = finite(value) ? value : timestamp(value);
  return Number.isFinite(time) ? `${jakarta.format(time)} WIB` : 'Not provided';
};
const displayedValue = (value, unit) =>
  finite(value) ? `${measurementValue(value, unit, 6)} ${unit}` : 'Not provided';

export function rawObservations(series) {
  return (series?.points ?? [])
    .filter((point) => finite(point.latest) && Number.isFinite(timestamp(point.last_ts)))
    .map((point) => ({ ...point, ts: point.last_ts, value: point.latest }))
    .sort((a, b) => timestamp(a.ts) - timestamp(b.ts));
}

export function pairObservations(left, right, toleranceMs = 250) {
  if (!finite(toleranceMs) || toleranceMs < 0) return [];
  const valid = (samples) =>
    samples
      .filter((sample) => finite(sample.value) && Number.isFinite(timestamp(sample.ts)))
      .sort((a, b) => timestamp(a.ts) - timestamp(b.ts));
  const candidates = valid(right);
  const used = new Set();
  let start = 0;
  return valid(left).flatMap((a) => {
    const time = timestamp(a.ts);
    while (start < candidates.length && timestamp(candidates[start].ts) < time - toleranceMs)
      start += 1;
    let best = -1;
    let distance = Infinity;
    for (
      let index = start;
      index < candidates.length && timestamp(candidates[index].ts) <= time + toleranceMs;
      index += 1
    ) {
      const b = candidates[index];
      if (used.has(index) || (a.boot_id && b.boot_id && a.boot_id !== b.boot_id)) continue;
      const skew = Math.abs(time - timestamp(b.ts));
      if (skew < distance) {
        best = index;
        distance = skew;
      }
    }
    if (best < 0) return [];
    used.add(best);
    return [{ left: a, right: candidates[best], skewMs: distance }];
  });
}

export function counterDeltas(samples, maxGapMs = 60_000) {
  if (!finite(maxGapMs) || maxGapMs <= 0) return [];
  const ordered = samples
    .filter(
      (sample) => finite(sample.value) && sample.value >= 0 && Number.isFinite(timestamp(sample.ts))
    )
    .sort((a, b) => timestamp(a.ts) - timestamp(b.ts));
  return ordered.slice(1).flatMap((current, index) => {
    const previous = ordered[index];
    const gap = timestamp(current.ts) - timestamp(previous.ts);
    const delta = current.value - previous.value;
    if (
      gap <= 0 ||
      gap > maxGapMs ||
      delta < 0 ||
      (current.boot_id && previous.boot_id && current.boot_id !== previous.boot_id) ||
      (finite(current.minimum) && current.minimum < previous.value) ||
      (finite(current.max_gap_seconds) && current.max_gap_seconds * 1000 > maxGapMs)
    )
      return [];
    return [
      {
        ts: current.ts,
        from_ts: previous.ts,
        value: delta,
        ...(current.quality ? { quality: current.quality } : {}),
        ...(previous.quality ? { previous_quality: previous.quality } : {}),
      },
    ];
  });
}

export function resourceComposition(capacity, free) {
  return pairObservations(capacity, free, 0).flatMap(({ left, right }) => {
    if (left.value <= 0 || right.value < 0 || right.value > left.value) return [];
    return [
      {
        ts: left.ts,
        capacity: left.value,
        free: right.value,
        used: left.value - right.value,
        usedPercent: (1 - right.value / left.value) * 100,
      },
    ];
  });
}

function physicalIdentity(payload, series) {
  const suffix = payload.metric.startsWith('sound_')
    ? /-(rms|peak)$/
    : new RegExp(`-${payload.metric}$`);
  return `${series.asset_id ?? payload.asset_id ?? ''}/${series.device_id ?? ''}/${series.sensor_id.replace(suffix, '')}`;
}

function pairedSeries(left, right) {
  return (left?.series ?? []).flatMap((a) =>
    (right?.series ?? [])
      .filter((b) => physicalIdentity(left, a) === physicalIdentity(right, b))
      .map((b) => ({ left: a, right: b }))
  );
}

function cartesian(series, xAxis, yAxis, tooltip = { trigger: 'axis' }) {
  return {
    animation: false,
    tooltip,
    legend: { type: 'scroll', bottom: 0 },
    grid: { left: 64, right: 20, top: 20, bottom: 62 },
    xAxis,
    yAxis,
    series,
  };
}

function timeAxis(payload) {
  const min = timestamp(payload?.from);
  const max = timestamp(payload?.to);
  return { type: 'time', ...(Number.isFinite(min) && max > min ? { min, max } : {}) };
}

function areaData(payload, entry, aggregation) {
  const limit = Math.max((payload.bucket_seconds || 1) * 2000, 30_000);
  const data = [];
  let previous;
  for (const point of [...(entry.points ?? [])].sort((a, b) => timestamp(a.ts) - timestamp(b.ts))) {
    const time = timestamp(aggregation === 'latest' ? point.last_ts : point.ts);
    if (!Number.isFinite(time)) continue;
    const first = timestamp(point.first_ts ?? point.ts);
    const last = timestamp(point.last_ts ?? point.ts);
    if (previous && (first - previous.last > limit || point.max_gap_seconds * 1000 > limit))
      data.push([(previous.time + time) / 2, null]);
    const value = point[aggregation];
    data.push([
      time,
      point.count !== 0 && finite(value) && value >= 0 ? value : null,
      point.first_ts,
      point.last_ts,
      point.count,
      point.quality,
    ]);
    previous = { time, last };
  }
  return data;
}

function distributionPanels(payload) {
  const panels = [];
  for (const series of payload.series ?? []) {
    const stats = series.summary;
    if (!(stats?.count > 0)) continue;
    const id = `${payload.metric}-${series.sensor_id}`;
    const title = `${label(payload.metric)} · ${sourceLabel(series.sensor_id)}`;
    const unit = unitLabel(series.unit);
    const bins = stats.histogram;
    if (
      Array.isArray(bins) &&
      bins.length &&
      bins.every(
        (bin) =>
          finite(bin.minimum) &&
          finite(bin.maximum) &&
          bin.minimum <= bin.maximum &&
          Number.isSafeInteger(bin.count) &&
          bin.count >= 0
      ) &&
      bins.reduce((total, bin) => total + bin.count, 0) === stats.count
    ) {
      panels.push({
        id: `${id}-histogram`,
        title: `${title} distribution`,
        kind: 'histogram',
        note: `${stats.count.toLocaleString()} raw observations; histogram is independent of chart aggregation.`,
        option: cartesian(
          [
            {
              name: title,
              type: 'bar',
              itemStyle: { color: sourceColor(series.sensor_id) },
              data: bins.map((bin) => bin.count),
            },
          ],
          {
            type: 'category',
            name: unit,
            data: bins.map((bin) => `${bin.minimum.toFixed(2)}–${bin.maximum.toFixed(2)}`),
            axisLabel: { rotate: 30 },
          },
          { type: 'value', name: 'Observations', minInterval: 1 },
          {
            trigger: 'axis',
            renderMode: 'richText',
            confine: true,
            formatter: (parameters) => {
              const bin = bins[(Array.isArray(parameters) ? parameters[0] : parameters).dataIndex];
              return bin
                ? `${title}\nBin: ${displayedValue(bin.minimum, unit)} – ${displayedValue(bin.maximum, unit)}\nObservations: ${bin.count.toLocaleString()}`
                : '';
            },
          }
        ),
      });
    }
    const quartiles = stats.quartiles;
    if (
      finite(stats.minimum) &&
      finite(stats.maximum) &&
      Array.isArray(quartiles) &&
      quartiles.length === 3 &&
      quartiles.every(finite)
    ) {
      const values = [stats.minimum, ...quartiles, stats.maximum];
      if (values.every((value, index) => index === 0 || value >= values[index - 1])) {
        panels.push({
          id: `${id}-box`,
          title: `${title} spread`,
          kind: 'box',
          note: 'Raw quartiles with observed minimum and maximum whiskers; no outlier inference.',
          option: cartesian(
            [
              {
                type: 'boxplot',
                name: title,
                itemStyle: { color: sourceColor(series.sensor_id) },
                data: [values],
              },
            ],
            { type: 'category', data: [sourceLabel(series.sensor_id)] },
            { type: 'value', name: unit, scale: true },
            {
              trigger: 'item',
              renderMode: 'richText',
              confine: true,
              formatter: () =>
                [
                  title,
                  ...['Minimum', 'Q1', 'Median', 'Q3', 'Maximum'].map(
                    (name, index) => `${name}: ${displayedValue(values[index], unit)}`
                  ),
                  `Observations: ${stats.count.toLocaleString()}`,
                ].join('\n'),
            }
          ),
        });
      }
    }
  }
  return panels;
}

export function buildAnalyticsPanels(
  category,
  payloads,
  { aggregation = 'average', maxGapMs } = {}
) {
  const definition = ANALYTICS_CATEGORIES[category];
  if (!definition) throw new TypeError('Unsupported analytics category.');
  if (!['average', 'minimum', 'maximum', 'latest'].includes(aggregation))
    throw new TypeError('Unsupported aggregation.');
  const items = (Array.isArray(payloads) ? payloads : Object.values(payloads ?? {})).filter(
    (payload) => definition.metrics.includes(payload.metric)
  );
  const metrics = new Map();
  for (const payload of items) {
    const previous = metrics.get(payload.metric);
    const entries = (payload.series ?? []).map((series) => ({
      ...series,
      asset_id: series.asset_id ?? payload.asset_id,
    }));
    metrics.set(payload.metric, { ...payload, series: [...(previous?.series ?? []), ...entries] });
  }
  const panels = [];
  for (const [metric, payload] of metrics) {
    if (
      !payload.series.some((series) =>
        (series.points ?? []).some((point) => finite(point[aggregation]))
      )
    )
      continue;
    if (!stateMetrics.includes(metric))
      panels.push({ id: `${metric}-time`, title: label(metric), kind: 'time', payload });
    if (
      [
        'temperature',
        'humidity',
        'sound_rms_dbfs',
        'sound_peak_dbfs',
        'voltage_v',
        'current_a',
        'active_power_w',
        'frequency_hz',
        'wifi_rssi_dbm',
      ].includes(metric)
    )
      panels.push(...distributionPanels(payload));
    if (
      ['energy_wh_total', 'returned_energy_wh_total'].includes(metric) ||
      (metric.startsWith('net_') && metric.endsWith('_total'))
    ) {
      const series = payload.series
        .map((entry) => ({
          name: sourceLabel(entry.sensor_id),
          type: 'bar',
          itemStyle: { color: sourceColor(entry.sensor_id) },
          data: counterDeltas(
            rawObservations(entry),
            maxGapMs ?? Math.max(60_000, (payload.bucket_seconds ?? 0) * 3000)
          ).map((point) => [
            point.ts,
            point.value,
            point.from_ts,
            point.previous_quality,
            point.quality,
          ]),
        }))
        .filter((entry) => entry.data.length);
      if (series.length)
        panels.push({
          id: `${metric}-delta`,
          title: `${label(metric)} increments`,
          kind: 'delta',
          note: 'Difference between actual last observations; resets and long gaps are excluded.',
          option: cartesian(
            series,
            timeAxis(payload),
            {
              type: 'value',
              name: unitLabel(payload.series[0].unit),
              min: 0,
            },
            {
              trigger: 'item',
              renderMode: 'richText',
              confine: true,
              formatter: ({ data, seriesName }) =>
                [
                  seriesName,
                  `Increment: ${displayedValue(data[1], unitLabel(payload.series[0].unit))}`,
                  `From: ${displayedTime(data[2])} · ${data[3] ?? 'Quality not provided'}`,
                  `To: ${displayedTime(data[0])} · ${data[4] ?? 'Quality not provided'}`,
                ].join('\n'),
            }
          ),
        });
    }
  }
  const [xMetric, yMetric] =
    category === 'mechanical'
      ? ['temperature', 'humidity']
      : category === 'acoustic'
        ? ['sound_rms_dbfs', 'sound_peak_dbfs']
        : [];
  if (xMetric) {
    const series = pairedSeries(metrics.get(xMetric), metrics.get(yMetric))
      .map(({ left, right }) => ({
        name: sourceLabel(left.sensor_id),
        type: 'scatter',
        symbolSize: 5,
        itemStyle: { color: sourceColor(left.sensor_id) },
        data: pairObservations(rawObservations(left), rawObservations(right)).map(
          ({ left: x, right: y }) => [x.value, y.value, x.ts, y.ts, x.quality, y.quality]
        ),
      }))
      .filter((entry) => entry.data.length);
    if (series.length)
      panels.push({
        id: `${category}-scatter`,
        title: `${label(xMetric)} / ${label(yMetric)}`,
        kind: 'scatter',
        note: 'Actual last samples from each bucket, matched within 250 ms on the same physical source. Not all raw samples.',
        option: cartesian(
          series,
          {
            type: 'value',
            name: `${label(xMetric)} (${unitLabel(metrics.get(xMetric).series[0].unit)})`,
            scale: true,
          },
          {
            type: 'value',
            name: `${label(yMetric)} (${unitLabel(metrics.get(yMetric).series[0].unit)})`,
            scale: true,
          },
          {
            trigger: 'item',
            renderMode: 'richText',
            confine: true,
            formatter: ({ data, seriesName }) =>
              [
                seriesName,
                `${label(xMetric)}: ${displayedValue(data[0], unitLabel(metrics.get(xMetric).series[0].unit))}`,
                `${displayedTime(data[2])} · ${data[4] ?? 'Quality not provided'}`,
                `${label(yMetric)}: ${displayedValue(data[1], unitLabel(metrics.get(yMetric).series[0].unit))}`,
                `${displayedTime(data[3])} · ${data[5] ?? 'Quality not provided'}`,
              ].join('\n'),
          }
        ),
      });
  }
  if (category === 'telecommunications') {
    const throughput = [
      'net_receive_throughput_bytes_per_second',
      'net_transmit_throughput_bytes_per_second',
    ];
    const series = throughput
      .flatMap((metric) =>
        (metrics.get(metric)?.series ?? []).map((entry) => ({
          name: label(metric),
          type: 'line',
          itemStyle: { color: sourceColor(entry.sensor_id) },
          lineStyle: { type: metric === throughput[0] ? 'solid' : 'dashed' },
          showSymbol: false,
          connectNulls: false,
          areaStyle: { opacity: 0.12 },
          data: areaData(metrics.get(metric), entry, aggregation),
        }))
      )
      .filter((entry) => entry.data.length);
    if (series.length)
      panels.push({
        id: 'network-throughput',
        title: 'Receive / transmit throughput',
        kind: 'area',
        note: `Published throughput · ${aggregation}; capacity is nominal NIC link capacity.`,
        option: cartesian(
          series,
          timeAxis(items[0]),
          { type: 'value', name: 'B/s', min: 0 },
          {
            trigger: 'axis',
            renderMode: 'richText',
            confine: true,
            formatter: (parameters) =>
              (Array.isArray(parameters) ? parameters : [parameters])
                .filter(({ data }) => data?.[1] !== null)
                .map(({ data, seriesName }) =>
                  [
                    seriesName,
                    `Throughput: ${displayedValue(data[1], 'B/s')}`,
                    `Bucket: ${displayedTime(data[0])}`,
                    `First: ${displayedTime(data[2])}`,
                    `Last: ${displayedTime(data[3])}`,
                    `Observations: ${data[4] ?? 'Not provided'} · ${data[5] ?? 'Quality not provided'}`,
                  ].join('\n')
                )
                .join('\n\n'),
          }
        ),
      });
    const ratio = metrics.get('net_link_utilization_ratio');
    for (const entry of ratio?.series ?? []) {
      const point = rawObservations(entry).at(-1);
      if (!point || point.value < 0 || point.value > 1) continue;
      panels.push({
        id: `${entry.sensor_id}-gauge`,
        title: 'Latest link utilization',
        kind: 'gauge',
        note: `${displayedTime(point.ts)} · Observed throughput / nominal NIC capacity; not Wi-Fi airtime utilization.`,
        option: {
          animation: false,
          tooltip: {
            trigger: 'item',
            renderMode: 'richText',
            confine: true,
            formatter: () =>
              `Link utilization: ${displayedValue(point.value * 100, '%')}\n${displayedTime(point.ts)} · ${point.quality ?? 'Quality not provided'}\nNominal NIC capacity basis; not Wi-Fi airtime.`,
          },
          series: [
            {
              type: 'gauge',
              itemStyle: { color: sourceColor(entry.sensor_id) },
              min: 0,
              max: 100,
              progress: { show: true },
              detail: { formatter: '{value}%' },
              data: [{ value: Number((point.value * 100).toFixed(2)), name: 'Link utilization' }],
            },
          ],
        },
      });
    }
  }
  if (category === 'device') {
    for (const resource of ['ram', 'fs']) {
      for (const { left, right } of pairedSeries(
        metrics.get(`${resource}_size_bytes`),
        metrics.get(`${resource}_free_bytes`)
      )) {
        const point = resourceComposition(rawObservations(left), rawObservations(right)).at(-1);
        if (!point) continue;
        panels.push({
          id: `${left.sensor_id}-composition`,
          title: `${resource === 'ram' ? 'RAM' : 'Storage'} composition`,
          kind: 'treemap',
          note: `${displayedTime(point.ts)} · ${point.usedPercent.toFixed(1)}% used; matched capacity and free-byte observations.`,
          option: {
            animation: false,
            tooltip: {
              trigger: 'item',
              renderMode: 'richText',
              confine: true,
              formatter: ({ name, value }) =>
                `${name}: ${displayedValue(value, 'bytes')}\nCapacity: ${displayedValue(point.capacity, 'bytes')}\n${displayedTime(point.ts)}`,
            },
            series: [
              {
                type: 'treemap',
                itemStyle: { color: sourceColor(left.sensor_id) },
                roam: false,
                nodeClick: false,
                breadcrumb: { show: false },
                label: { formatter: '{b}: {c} bytes' },
                data: [
                  { name: 'Used', value: point.used },
                  { name: 'Free', value: point.free },
                ],
              },
            ],
          },
        });
      }
    }
  }
  const states = stateMetrics
    .flatMap((metric) =>
      (metrics.get(metric)?.series ?? []).map((entry) => ({
        name: label(metric),
        type: 'scatter',
        symbol: 'rect',
        itemStyle: { color: sourceColor(entry.sensor_id) },
        symbolSize: 8,
        data: rawObservations(entry)
          .filter((point) => point.value === 0 || point.value === 1)
          .map((point) => [point.ts, label(metric), point.value, point.quality]),
      }))
    )
    .filter((entry) => entry.data.length);
  if (states.length)
    panels.push({
      id: `${category}-state`,
      title: 'Observed state timeline',
      kind: 'state',
      note: 'Discrete published 0/1 observations; no state is inferred between samples.',
      option: {
        ...cartesian(
          states,
          timeAxis(items[0]),
          { type: 'category', data: states.map((entry) => entry.name) },
          {
            trigger: 'item',
            renderMode: 'richText',
            confine: true,
            formatter: ({ data, seriesName }) =>
              `${seriesName}\nObserved state: ${data[2]}\n${displayedTime(data[0])} · ${data[3] ?? 'Quality not provided'}`,
          }
        ),
        visualMap: {
          show: true,
          type: 'piecewise',
          dimension: 2,
          pieces: [
            { value: 0, label: '0', color: chartColor('steel') },
            { value: 1, label: '1', color: chartColor('sage') },
          ],
          right: 0,
          top: 0,
        },
      },
    });
  return panels;
}
