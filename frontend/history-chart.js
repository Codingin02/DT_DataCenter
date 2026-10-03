const SVG = 'http://www.w3.org/2000/svg';
const colors = ['#006b8f', '#b4672d', '#4f7d54', '#7a5f91'];

export const HISTORY_RANGE = Object.freeze({
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '5d': 5 * 24 * 60 * 60 * 1000,
});

export function historyUrl({ assetId, metric, sensorId, range = '5d', maxPoints = 1200, now = Date.now() }) {
  if (!Object.hasOwn(HISTORY_RANGE, range)) throw new TypeError('Unsupported history range.');
  const query = new URL('http://history.local').searchParams;
  for (const [key, value] of Object.entries({
    metric,
    from: new Date(now - HISTORY_RANGE[range]).toISOString(),
    to: new Date(now).toISOString(),
    max_points: String(maxPoints),
  })) query.set(key, value);
  if (sensorId) query.set('sensor_id', sensorId);
  return `/api/assets/${encodeURIComponent(assetId)}/history?${query}`;
}

export function historyGeometry(payload, width = 800, height = 240) {
  const points = payload.series.flatMap((series) => series.points);
  if (points.length === 0) return null;
  const from = Date.parse(payload.from);
  const to = Date.parse(payload.to);
  let minimum = Math.min(...points.map((point) => point.minimum));
  let maximum = Math.max(...points.map((point) => point.maximum));
  if (payload.metric === 'temperature') {
    minimum = Math.min(minimum, 18);
    maximum = Math.max(maximum, 27);
  }
  if (minimum === maximum) {
    const padding = Math.max(Math.abs(minimum) * 0.05, 1);
    minimum -= padding;
    maximum += padding;
  }
  const x = (value) => ((Date.parse(value) - from) / (to - from)) * width;
  const y = (value) => height - ((value - minimum) / (maximum - minimum)) * height;
  return {
    minimum,
    maximum,
    series: payload.series.map((entry, index) => {
      const average = entry.points
        .map((point, pointIndex) => `${pointIndex === 0 ? 'M' : 'L'}${x(point.ts).toFixed(2)},${y(point.average).toFixed(2)}`)
        .join(' ');
      const upper = entry.points.map((point) => `${x(point.ts).toFixed(2)},${y(point.maximum).toFixed(2)}`);
      const lower = [...entry.points]
        .reverse()
        .map((point) => `${x(point.ts).toFixed(2)},${y(point.minimum).toFixed(2)}`);
      return {
        sensorId: entry.sensor_id,
        unit: entry.unit,
        color: colors[index % colors.length],
        average,
        envelope: `M${[...upper, ...lower].join(' L')} Z`,
      };
    }),
  };
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

export function renderHistoryChart(container, payload) {
  container.replaceChildren();
  const geometry = historyGeometry(payload);
  if (geometry === null) {
    const empty = document.createElement('p');
    empty.className = 'history-empty';
    empty.textContent = 'No historical series available';
    container.append(empty);
    return false;
  }
  const svg = svgElement('svg', {
    viewBox: '0 0 800 240',
    preserveAspectRatio: 'none',
    role: 'img',
    'aria-label': `${payload.metric} historical series`,
  });
  if (payload.metric === 'temperature') {
    const top = 240 - ((27 - geometry.minimum) / (geometry.maximum - geometry.minimum)) * 240;
    const bottom = 240 - ((18 - geometry.minimum) / (geometry.maximum - geometry.minimum)) * 240;
    svg.append(
      svgElement('rect', {
        class: 'history-reference-band',
        x: 0,
        y: Math.max(0, top),
        width: 800,
        height: Math.max(0, Math.min(240, bottom) - Math.max(0, top)),
      })
    );
  }
  for (let line = 0; line <= 4; line += 1) {
    svg.append(svgElement('path', { class: 'history-grid', d: `M0 ${line * 60}H800` }));
  }
  for (const entry of geometry.series) {
    svg.append(
      svgElement('path', {
        class: 'history-envelope',
        d: entry.envelope,
        fill: entry.color,
      }),
      svgElement('path', {
        class: 'history-line',
        d: entry.average,
        stroke: entry.color,
      })
    );
  }
  const range = document.createElement('div');
  range.className = 'history-axis';
  range.innerHTML = `<span>${geometry.maximum.toLocaleString()}</span><span>${geometry.minimum.toLocaleString()}</span>`;
  const legend = document.createElement('div');
  legend.className = 'history-series-legend';
  for (const entry of geometry.series) {
    const label = document.createElement('span');
    label.style.setProperty('--series-color', entry.color);
    label.textContent = `${entry.sensorId} · ${entry.unit}`;
    legend.append(label);
  }
  container.append(svg, range, legend);
  return true;
}
