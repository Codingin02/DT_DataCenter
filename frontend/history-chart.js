import { init, use } from 'echarts/core';
import {
  BarChart,
  BoxplotChart,
  GaugeChart,
  LineChart,
  ScatterChart,
  TreemapChart,
} from 'echarts/charts';
import {
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  ToolboxComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

import { measurementValue, readingLabel, sourceLabel, unitLabel } from './presentation.js';

use([
  LineChart,
  BarChart,
  ScatterChart,
  BoxplotChart,
  GaugeChart,
  TreemapChart,
  GridComponent,
  TooltipComponent,
  VisualMapComponent,
  LegendComponent,
  DataZoomComponent,
  ToolboxComponent,
  MarkAreaComponent,
  AriaComponent,
  CanvasRenderer,
]);

const charts = new WeakMap();
const valueLabels = {
  average: 'Bucket mean',
  latest: 'Latest',
  minimum: 'Minimum',
  maximum: 'Maximum',
};
const jakarta = { timeZone: 'Asia/Jakarta', hourCycle: 'h23' };
const clock = new Intl.DateTimeFormat('en-GB', {
  ...jakarta,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
const calendar = new Intl.DateTimeFormat('en-GB', {
  ...jakarta,
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const timestamp = new Intl.DateTimeFormat('en-GB', {
  ...jakarta,
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  fractionalSecondDigits: 3,
});

export const HISTORY_RANGE = Object.freeze({
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '5d': 5 * 24 * 60 * 60 * 1000,
});

export function historyAssetIds(records, metric, sensorId, fallbackAssetIds = []) {
  const assets = records
    .filter((record) => record.metric === metric && (!sensorId || record.sensor_id === sensorId))
    .map((record) => record.asset_id);
  return [...new Set(assets.length ? assets : fallbackAssetIds)];
}

export function historyUrl({
  assetId,
  metric,
  sensorId,
  range = '5d',
  maxPoints = 1200,
  now = Date.now(),
  analytics = false,
}) {
  if (!Object.hasOwn(HISTORY_RANGE, range)) throw new TypeError('Unsupported history range.');
  const query = new URL('http://history.local').searchParams;
  for (const [key, value] of Object.entries({
    metric,
    from: new Date(now - HISTORY_RANGE[range]).toISOString(),
    to: new Date(now).toISOString(),
    max_points: String(maxPoints),
  }))
    query.set(key, value);
  if (sensorId) query.set('sensor_id', sensorId);
  if (analytics) query.set('analytics', 'true');
  return `/api/assets/${encodeURIComponent(assetId)}/history?${query}`;
}

const chartPalette = {
  amber: '#d6b16d',
  sage: '#a4b99b',
  terracotta: '#cf9784',
  violet: '#b6a6ca',
  steel: '#9fb4c5',
};
const resolvedPalette = new Map();

export function chartColor(role) {
  if (!globalThis.document) return chartPalette[role];
  if (!resolvedPalette.has(role)) {
    resolvedPalette.set(
      role,
      window
        .getComputedStyle(document.documentElement)
        .getPropertyValue(`--dt-data-${role}`)
        .trim() || chartPalette[role]
    );
  }
  return resolvedPalette.get(role);
}

export function sourceColor(sensorId) {
  if (sensorId.startsWith('sht31-a-')) return chartColor('amber');
  if (sensorId.startsWith('sht31-b-')) return chartColor('sage');
  if (sensorId.startsWith('rack-sound-')) return chartColor('terracotta');
  if (sensorId.startsWith('shelly-')) return chartColor('violet');
  return chartColor('steel');
}

function observedTime(value) {
  const time = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(time) ? `${timestamp.format(time)} WIB` : 'Not available';
}

function axisNumber(value) {
  return Math.abs(value) >= 1e7 || (value !== 0 && Math.abs(value) < 0.001)
    ? value.toExponential(2)
    : value.toLocaleString('en-GB', { maximumFractionDigits: 3 });
}

function historyBounds(payload, now) {
  const times = (payload.series ?? [])
    .flatMap((entry) =>
      entry.points.flatMap((point) => [
        Date.parse(point.first_ts ?? point.ts),
        Date.parse(point.last_ts ?? point.ts),
      ])
    )
    .filter(Number.isFinite);
  const from = Number.isFinite(Date.parse(payload.from))
    ? Date.parse(payload.from)
    : times.length
      ? Math.min(...times)
      : now - HISTORY_RANGE['1h'];
  const to = Number.isFinite(Date.parse(payload.to))
    ? Date.parse(payload.to)
    : times.length
      ? Math.max(...times)
      : now;
  return to > from ? [from, to] : [from - 30_000, from + 30_000];
}

function historyData(entry, payload, valueMode) {
  const data = [];
  const bucketMs = Math.max(1, Number(payload.bucket_seconds) || 1) * 1000;
  const gapLimit = Math.max(bucketMs * 2, 30_000);
  let previous;
  for (const point of [...entry.points].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))) {
    const time = Date.parse(valueMode === 'latest' ? (point.last_ts ?? point.ts) : point.ts);
    if (!Number.isFinite(time)) continue;
    const first = Date.parse(point.first_ts ?? point.ts);
    const last = Date.parse(point.last_ts ?? point.ts);
    const gap =
      previous && (first - previous.last > gapLimit || point.max_gap_seconds * 1000 > gapLimit);
    if (gap) data.push({ value: [(previous.time + time) / 2, null] });
    const valid = point.count !== 0 && Number.isFinite(point[valueMode]);
    data.push({
      value: [time, valid ? point[valueMode] : null],
      bucket: point,
      sensorId: entry.sensor_id,
      unit: entry.unit,
      valueMode,
    });
    previous = { last, time };
  }
  return data;
}

function historyTooltip(parameters) {
  const seen = new Set();
  return (Array.isArray(parameters) ? parameters : [parameters])
    .filter(({ data, seriesName }) => {
      if (!data?.bucket || data.value[1] === null || seen.has(seriesName)) return false;
      seen.add(seriesName);
      return true;
    })
    .map(({ data }) => {
      const point = data.bucket;
      const unit = unitLabel(data.unit);
      const quality = point.quality_counts;
      return [
        `${sourceLabel(data.sensorId)} · ${unit}`,
        `${valueLabels[data.valueMode]}: ${measurementValue(data.value[1], data.unit, 3)} ${unit}`,
        `Min–max: ${measurementValue(point.minimum, data.unit, 3)}–${measurementValue(point.maximum, data.unit, 3)} ${unit}`,
        `Observations: ${point.count ?? 'Not provided'} · ${point.quality ?? 'Quality not provided'}`,
        `First: ${observedTime(point.first_ts)}`,
        `Last: ${observedTime(point.last_ts)}`,
        `Bucket anchor: ${observedTime(point.ts)}`,
        ...(quality
          ? [
              `Quality counts: ${quality.good} good · ${quality.degraded} degraded · ${quality.unknown} unknown`,
            ]
          : []),
        ...(point.max_gap_seconds > 0
          ? [`Largest sampling gap: ${point.max_gap_seconds.toLocaleString()} s`]
          : []),
      ].join('\n');
    })
    .join('\n\n');
}

export function historyChartOption(
  payload,
  { valueMode = 'average', absoluteScale = false, referenceBand = true, now = Date.now() } = {}
) {
  if (!Object.hasOwn(valueLabels, valueMode))
    throw new TypeError('Unsupported history value mode.');
  const [from, to] = historyBounds(payload, now);
  const units = [...new Set((payload.series ?? []).map((entry) => entry.unit))];
  const metric = (payload.label ?? payload.metric?.replaceAll('_', ' ') ?? 'Measurement').replace(
    /^./,
    (letter) => letter.toUpperCase()
  );
  const yAxis = units.map((unit, index) => {
    const points = payload.series
      .filter((entry) => entry.unit === unit)
      .flatMap((entry) => entry.points);
    const values = points
      .flatMap((point) => [point.minimum, point.maximum])
      .filter(Number.isFinite);
    let min = values.length ? Math.min(...values) : 0;
    let max = values.length ? Math.max(...values) : 1;
    if (absoluteScale) {
      min = Math.min(min, payload.metric === 'temperature' ? 18 : 0);
      max = Math.max(max, payload.metric === 'temperature' ? 27 : 0);
    }
    const padding = max === min ? Math.max(Math.abs(min) * 0.05, 0.1) : (max - min) * 0.08;
    return {
      id: unit,
      type: 'value',
      name: `${metric} (${unitLabel(unit)})`,
      nameLocation: 'middle',
      nameGap: 52,
      position: index % 2 ? 'right' : 'left',
      offset: Math.floor(index / 2) * 55,
      min: min - padding,
      max: max + padding,
      scale: true,
      axisLabel: { fontSize: 12, formatter: axisNumber },
      splitLine: { show: index === 0 },
    };
  });
  const series = (payload.series ?? []).flatMap((entry) => {
    const id = `${entry.sensor_id}:${entry.unit}`;
    const data = historyData(entry, payload, valueMode);
    const base = {
      name: entry.sensor_id,
      type: 'line',
      yAxisIndex: units.indexOf(entry.unit),
      connectNulls: false,
      itemStyle: { color: sourceColor(entry.sensor_id) },
      animation: false,
    };
    const envelopeData = (key) =>
      data.map((item) => ({
        value: [
          item.value[0],
          item.value[1] === null
            ? null
            : key === 'minimum'
              ? item.bucket.minimum
              : item.bucket.maximum - item.bucket.minimum,
        ],
      }));
    return [
      {
        ...base,
        id: `${id}:minimum-envelope`,
        data: envelopeData('minimum'),
        stack: id,
        stackStrategy: 'all',
        symbol: 'none',
        lineStyle: { opacity: 0 },
        silent: true,
        tooltip: { show: false },
      },
      {
        ...base,
        id: `${id}:maximum-envelope`,
        data: envelopeData('maximum'),
        stack: id,
        stackStrategy: 'all',
        symbol: 'none',
        lineStyle: { opacity: 0 },
        areaStyle: { opacity: 0.14 },
        silent: true,
        tooltip: { show: false },
      },
      {
        ...base,
        id: `${id}:value`,
        data,
        symbol: 'circle',
        symbolSize: 3,
        lineStyle: { width: 1.8 },
        emphasis: { focus: 'series' },
        ...(referenceBand && payload.metric === 'temperature'
          ? {
              markArea: {
                silent: true,
                itemStyle: { color: 'rgba(111,193,145,0.08)' },
                data: [[{ yAxis: 18 }, { yAxis: 27 }]],
              },
            }
          : {}),
      },
    ];
  });
  return {
    animation: false,
    aria: {
      enabled: true,
      description: `${payload.metric ?? 'Measurement'} history in Asia/Jakarta. Lines show ${valueLabels[valueMode].toLowerCase()}; shading preserves bucket minimum and maximum. Missing observations interrupt the line.`,
    },
    grid: { top: 48, bottom: 72, left: 84, right: units.length > 1 ? 84 : 24 },
    legend: {
      type: 'scroll',
      top: 4,
      right: 100,
      left: 12,
      data: (payload.series ?? []).map((entry) => entry.sensor_id),
      formatter: (id) => sourceLabel(id),
    },
    tooltip: { trigger: 'axis', renderMode: 'richText', confine: true, formatter: historyTooltip },
    toolbox: {
      top: 0,
      right: 12,
      feature: {
        dataZoom: {
          yAxisIndex: 'none',
          title: { zoom: 'Select interval', back: 'Previous interval' },
        },
      },
    },
    xAxis: {
      id: 'history-time',
      type: 'time',
      min: from,
      max: to,
      name: 'WIB',
      nameLocation: 'end',
      axisLabel: {
        hideOverlap: true,
        fontSize: 12,
        formatter: (time) => (to - from >= HISTORY_RANGE['24h'] ? calendar : clock).format(time),
      },
      axisPointer: { label: { formatter: ({ value }) => observedTime(value) } },
    },
    yAxis,
    dataZoom: [
      { id: 'history-inside', type: 'inside', xAxisIndex: 0, filterMode: 'none' },
      {
        id: 'history-slider',
        type: 'slider',
        xAxisIndex: 0,
        filterMode: 'none',
        bottom: 8,
        height: 24,
        labelFormatter: (time) => calendar.format(time),
      },
    ],
    series,
  };
}

export function liveChartOption(observations, { sensorId, metric, unit, label, now = Date.now() }) {
  const to = Math.max(now, ...observations.map((record) => Date.parse(record.source_ts)));
  const option = historyChartOption(
    {
      metric,
      label,
      from: new Date(to - 300_000).toISOString(),
      to: new Date(to).toISOString(),
      series: [
        {
          sensor_id: sensorId,
          unit,
          points: observations.map((record) => ({
            ts: record.source_ts,
            minimum: record.value,
            maximum: record.value,
            latest: record.value,
          })),
        },
      ],
    },
    { valueMode: 'latest', referenceBand: false }
  );
  option.series = option.series
    .filter((series) => series.id.endsWith(':value'))
    .map((series) => ({
      ...series,
      data: observations.flatMap((record) => {
        const time = Date.parse(record.source_ts);
        const point = { value: [time, record.value], record };
        return record.breakBefore ? [{ value: [time, null] }, point] : [point];
      }),
    }));
  option.tooltip.formatter = (parameters) =>
    (Array.isArray(parameters) ? parameters : [parameters])
      .filter(({ data }) => data?.record)
      .map(({ data: { record } }) =>
        [
          `${sourceLabel(record.sensor_id)} · ${label}`,
          readingLabel(record),
          `Observed: ${observedTime(record.source_ts)}`,
          `Received: ${observedTime(record.received_at)}`,
          `Quality: ${record.quality}`,
        ].join('\n')
      )
      .join('\n\n');
  option.aria.description =
    'Live observations received while this scope is open, retained for up to five minutes. Gaps interrupt the line.';
  return option;
}

export function chartObservationBounds(option) {
  if (
    !(Array.isArray(option.xAxis) ? option.xAxis : [option.xAxis]).some(
      (axis) => axis?.type === 'time'
    )
  )
    return null;
  const points = (option.series ?? []).flatMap((series) => series.data ?? []);
  const observations = points.filter((point) => point?.bucket && point.value[1] !== null);
  const times = (observations.length ? observations : points)
    .flatMap((item) => {
      if (Array.isArray(item?.value) && item.value[1] === null) return [];
      if (item?.bucket)
        return [
          Date.parse(item.bucket.first_ts ?? item.bucket.ts),
          Date.parse(item.bucket.last_ts ?? item.bucket.ts),
        ];
      const value = item?.value ?? item;
      return Array.isArray(value) && value[1] !== null
        ? [typeof value[0] === 'number' ? value[0] : Date.parse(value[0])]
        : [];
    })
    .filter(Number.isFinite);
  if (!times.length) return null;
  const first = Math.min(...times);
  const last = Math.max(...times);
  return first === last ? [first - 1000, last + 1000] : [first, last];
}

export function themeOption(container, option) {
  const style = window.getComputedStyle(container);
  const foreground = style.color;
  const border = style.getPropertyValue('--dt-border-dark').trim();
  const surface = style.getPropertyValue('--dt-surface').trim();
  const axes = (value) =>
    value &&
    (Array.isArray(value) ? value : [value]).map((axis) => ({
      ...axis,
      nameTextStyle: { color: foreground, fontSize: 12, ...axis.nameTextStyle },
      axisLabel: {
        color: foreground,
        fontSize: 12,
        ...(axis.type === 'time' ? { formatter: (time) => calendar.format(time) } : {}),
        ...(axis.type === 'value' ? { formatter: axisNumber } : {}),
        ...axis.axisLabel,
      },
      ...(axis.type === 'time'
        ? {
            axisPointer: {
              ...axis.axisPointer,
              label: { formatter: ({ value }) => observedTime(value), ...axis.axisPointer?.label },
            },
          }
        : {}),
      axisLine: { ...axis.axisLine, lineStyle: { color: border, ...axis.axisLine?.lineStyle } },
      splitLine: { ...axis.splitLine, lineStyle: { color: border, ...axis.splitLine?.lineStyle } },
    }));
  return {
    ...option,
    color: Object.keys(chartPalette).map(chartColor),
    backgroundColor: 'transparent',
    textStyle: {
      color: foreground,
      fontFamily: style.fontFamily,
      fontSize: 12,
      ...option.textStyle,
    },
    legend: { ...option.legend, textStyle: { color: foreground, ...option.legend?.textStyle } },
    tooltip: {
      backgroundColor: surface,
      borderColor: border,
      ...option.tooltip,
      textStyle: { color: foreground, ...option.tooltip?.textStyle },
    },
    xAxis: axes(option.xAxis),
    yAxis: axes(option.yAxis),
    dataZoom: option.dataZoom?.map((zoom) => ({
      textStyle: { color: foreground },
      borderColor: border,
      fillerColor: `${chartColor('steel')}33`,
      handleStyle: { color: chartColor('steel') },
      ...zoom,
    })),
  };
}

export function disposeHistoryChart(container) {
  const state = charts.get(container);
  if (!state) return;
  state.observer.disconnect();
  cancelAnimationFrame(state.frame);
  container.ownerDocument.removeEventListener('fullscreenchange', state.fullscreenChanged);
  state.chart.dispose();
  charts.delete(container);
}

export function renderAnalysisChart(container, option) {
  let state = charts.get(container);
  if (state && !container.contains(state.canvas)) {
    disposeHistoryChart(container);
    state = null;
  }
  if (!state) {
    container.replaceChildren();
    container.classList.add('analysis-chart');
    const doc = container.ownerDocument;
    const canvas = doc.createElement('div');
    canvas.className = 'analysis-chart-canvas';
    canvas.setAttribute('role', 'img');
    const toolbar = doc.createElement('div');
    toolbar.className = 'analysis-chart-toolbar';
    const button = (label, action) => {
      const element = doc.createElement('button');
      element.type = 'button';
      element.textContent = label;
      element.addEventListener('click', action);
      toolbar.append(element);
      return element;
    };
    container.append(canvas, toolbar);
    const chart = init(canvas, null, { renderer: 'canvas' });
    state = { canvas, chart, frame: 0, option };
    const resize = () => {
      cancelAnimationFrame(state.frame);
      state.frame = requestAnimationFrame(() => {
        if (canvas.clientWidth && canvas.clientHeight && !chart.isDisposed()) chart.resize();
      });
    };
    state.fit = button('Fit observations', () => {
      const bounds = chartObservationBounds(state.option);
      if (bounds)
        chart.dispatchAction({ type: 'dataZoom', startValue: bounds[0], endValue: bounds[1] });
    });
    state.reset = button('Reset view', () => {
      chart.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
      chart.dispatchAction({ type: 'legendAllSelect' });
      chart.dispatchAction({
        type: 'takeGlobalCursor',
        key: 'dataZoomSelect',
        dataZoomSelectActive: false,
      });
    });
    const fullscreen = button('Fullscreen', async () => {
      try {
        if (doc.fullscreenElement === container) await doc.exitFullscreen();
        else await container.requestFullscreen();
      } catch (error) {
        fullscreen.title = `Fullscreen unavailable: ${error.message}`;
      }
    });
    fullscreen.disabled = typeof container.requestFullscreen !== 'function';
    fullscreen.setAttribute('aria-pressed', 'false');
    state.fullscreenChanged = () => {
      fullscreen.textContent =
        doc.fullscreenElement === container ? 'Exit fullscreen' : 'Fullscreen';
      fullscreen.setAttribute('aria-pressed', String(doc.fullscreenElement === container));
      resize();
    };
    doc.addEventListener('fullscreenchange', state.fullscreenChanged);
    state.observer = new ResizeObserver(resize);
    state.observer.observe(canvas);
    state.zoomChanged = () => {
      const zoom = chart.getOption()?.dataZoom?.[0];
      canvas.dataset.zoomStart = String(zoom?.start ?? 0);
      canvas.dataset.zoomEnd = String(zoom?.end ?? 100);
    };
    chart.on('datazoom', state.zoomChanged);
    state.legendChanged = () => {
      const selected = chart.getOption()?.legend?.[0]?.selected ?? {};
      const names = [
        ...new Set(
          (state.option.series ?? []).map((series) => series.name ?? series.id).filter(Boolean)
        ),
      ];
      canvas.dataset.chartVisibleSeries = String(
        names.filter((name) => selected[name] !== false).length
      );
      canvas.dataset.legendSelected = JSON.stringify(
        Object.fromEntries(names.map((name) => [name, selected[name] !== false]))
      );
    };
    chart.on('legendselectchanged', state.legendChanged);
    chart.on('legendselectall', state.legendChanged);
    charts.set(container, state);
  }
  state.option = option;
  state.fit.hidden = !chartObservationBounds(option);
  state.reset.hidden = !option.dataZoom && !option.legend;
  const previous = state.chart.getOption();
  const next = themeOption(container, option);
  const timeAxis = (Array.isArray(option.xAxis) ? option.xAxis : [option.xAxis]).find(
    (axis) => axis?.type === 'time'
  );
  const names = [
    ...new Set((option.series ?? []).map((series) => series.name ?? series.id).filter(Boolean)),
  ];
  const points = (option.series ?? [])
    .filter((series) => !series.id?.endsWith('-envelope'))
    .flatMap((series) => series.data ?? [])
    .filter((item) => {
      const value = item?.value ?? item;
      return value !== null && (!Array.isArray(value) || value[1] !== null);
    }).length;
  state.canvas.dataset.chartSeries = String(names.length);
  state.canvas.dataset.chartPoints = String(points);
  state.canvas.dataset.chartFrom = Number.isFinite(timeAxis?.min)
    ? new Date(timeAxis.min).toISOString()
    : '';
  state.canvas.dataset.chartTo = Number.isFinite(timeAxis?.max)
    ? new Date(timeAxis.max).toISOString()
    : '';
  next.aria = {
    ...option.aria,
    enabled: true,
    description: `${option.aria?.description ?? names.join(', ')} ${points} plotted values.${timeAxis ? ` Selected time range: ${observedTime(timeAxis.min)} to ${observedTime(timeAxis.max)}.` : ''}`,
  };
  if (next.dataZoom)
    next.dataZoom = next.dataZoom.map((zoom) => {
      const existing = previous?.dataZoom?.find((entry) => entry.id === zoom.id);
      return existing ? { ...zoom, start: existing.start, end: existing.end } : zoom;
    });
  if (next.legend && previous?.legend?.[0]?.selected)
    next.legend.selected = previous.legend[0].selected;
  state.chart.setOption(next, {
    replaceMerge: ['series', 'xAxis', 'yAxis', 'grid', 'dataZoom', 'legend'],
    lazyUpdate: true,
  });
  state.zoomChanged();
  state.legendChanged();
  return state.chart;
}

export function renderHistoryChart(container, payload, options = {}) {
  const option = historyChartOption(payload, options);
  if (
    !option.series.some(
      (series) =>
        series.id.endsWith(':value') && series.data.some((point) => point.value[1] !== null)
    )
  ) {
    disposeHistoryChart(container);
    const empty = container.ownerDocument.createElement('p');
    empty.className = 'history-empty';
    empty.textContent = 'No historical series available';
    container.replaceChildren(empty);
    return false;
  }
  renderAnalysisChart(container, option);
  return true;
}
