function freeze(value) {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child);
  return Object.freeze(value);
}

export const HARDWARE_COMPONENTS = freeze([
  { key: 'esp32-s3', reference: 'U1', label: 'ESP32-S3', detail: 'DevKitC-1 · N16R8' },
  { key: 'sht31-a', reference: 'SEN_A / SEN0331-A', label: 'SHT31 A', detail: 'I2C0 · 50 kHz' },
  { key: 'sht31-b', reference: 'SEN_B / SEN0331-B', label: 'SHT31 B', detail: 'I2C1 · 50 kHz' },
  { key: 'inmp441', reference: 'MIC1', label: 'INMP441', detail: 'I2S · left channel' },
]);

export const HARDWARE_CONNECTIONS = freeze([
  { id: 'vcc-a', from: ['esp32-s3', '3V3'], to: ['sht31-a', 'VCC'], net: '3V3', kind: 'power' },
  { id: 'vcc-b', from: ['esp32-s3', '3V3'], to: ['sht31-b', 'VCC'], net: '3V3', kind: 'power' },
  { id: 'vdd-mic', from: ['esp32-s3', '3V3'], to: ['inmp441', 'VDD'], net: '3V3', kind: 'power' },
  { id: 'gnd-a', from: ['esp32-s3', 'GND'], to: ['sht31-a', 'GND'], net: 'GND', kind: 'ground' },
  { id: 'gnd-b', from: ['esp32-s3', 'GND'], to: ['sht31-b', 'GND'], net: 'GND', kind: 'ground' },
  { id: 'gnd-mic', from: ['esp32-s3', 'GND'], to: ['inmp441', 'GND'], net: 'GND', kind: 'ground' },
  {
    id: 'left-select',
    from: ['inmp441', 'L/R'],
    to: ['esp32-s3', 'GND'],
    net: 'MIC_LEFT_SELECT',
    aliasOf: 'GND',
    kind: 'ground',
  },
  {
    id: 'sda-a',
    from: ['esp32-s3', 'GPIO8'],
    to: ['sht31-a', 'SDA'],
    net: 'I2C0_SDA',
    kind: 'i2c0',
    direction: 'bidirectional',
  },
  {
    id: 'scl-a',
    from: ['esp32-s3', 'GPIO9'],
    to: ['sht31-a', 'SCL'],
    net: 'I2C0_SCL',
    kind: 'i2c0',
    direction: 'output',
  },
  {
    id: 'sda-b',
    from: ['esp32-s3', 'GPIO10'],
    to: ['sht31-b', 'SDA'],
    net: 'I2C1_SDA',
    kind: 'i2c1',
    direction: 'bidirectional',
  },
  {
    id: 'scl-b',
    from: ['esp32-s3', 'GPIO11'],
    to: ['sht31-b', 'SCL'],
    net: 'I2C1_SCL',
    kind: 'i2c1',
    direction: 'output',
  },
  {
    id: 'ws',
    from: ['esp32-s3', 'GPIO4'],
    to: ['inmp441', 'WS'],
    net: 'I2S_WS',
    kind: 'i2s0',
    direction: 'output',
  },
  {
    id: 'bclk',
    from: ['esp32-s3', 'GPIO5'],
    to: ['inmp441', 'BCLK/SCK'],
    net: 'I2S_BCLK',
    kind: 'i2s0',
    direction: 'output',
  },
  {
    id: 'sd',
    from: ['inmp441', 'SD'],
    to: ['esp32-s3', 'GPIO6'],
    net: 'I2S_SD',
    kind: 'i2s0',
    direction: 'output',
  },
]);

export const SCHEMATIC_LAYOUT = freeze({
  'esp32-s3': {
    x: 500,
    y: 230,
    width: 220,
    height: 360,
    pins: {
      '3V3': [580, 210],
      GND: [640, 610],
      GPIO8: [480, 270],
      GPIO9: [480, 310],
      GPIO10: [480, 470],
      GPIO11: [480, 510],
      GPIO4: [740, 270],
      GPIO5: [740, 310],
      GPIO6: [740, 350],
    },
  },
  'sht31-a': {
    x: 150,
    y: 190,
    width: 180,
    height: 160,
    pins: { VCC: [190, 170], GND: [190, 370], SDA: [350, 250], SCL: [350, 290] },
  },
  'sht31-b': {
    x: 150,
    y: 480,
    width: 180,
    height: 160,
    pins: { VCC: [190, 460], GND: [190, 660], SDA: [350, 540], SCL: [350, 580] },
  },
  inmp441: {
    x: 850,
    y: 210,
    width: 190,
    height: 260,
    pins: {
      VDD: [890, 190],
      GND: [970, 490],
      WS: [830, 290],
      'BCLK/SCK': [830, 330],
      SD: [830, 370],
      'L/R': [1060, 430],
    },
  },
});

const ROUTES = freeze({
  'vcc-a': [
    [580, 90],
    [190, 90],
  ],
  'vcc-b': [
    [580, 90],
    [110, 90],
    [110, 460],
  ],
  'vdd-mic': [
    [580, 90],
    [890, 90],
  ],
  'gnd-a': [
    [640, 720],
    [130, 720],
    [130, 370],
  ],
  'gnd-b': [
    [640, 720],
    [130, 720],
    [130, 660],
  ],
  'gnd-mic': [
    [640, 720],
    [970, 720],
  ],
  'left-select': [
    [1100, 430],
    [1100, 720],
    [640, 720],
  ],
  'sda-a': [
    [400, 270],
    [400, 250],
  ],
  'scl-a': [
    [430, 310],
    [430, 290],
  ],
  'sda-b': [
    [400, 470],
    [400, 540],
  ],
  'scl-b': [
    [430, 510],
    [430, 580],
  ],
  ws: [
    [800, 270],
    [800, 290],
  ],
  bclk: [
    [780, 310],
    [780, 330],
  ],
  sd: [
    [760, 370],
    [760, 350],
  ],
});

const NET_LABELS = freeze({
  'sda-a': [410, 240],
  'scl-a': [415, 332],
  'sda-b': [398, 454],
  'scl-b': [415, 606],
  ws: [785, 250],
  bclk: [785, 310],
  sd: [785, 398],
  'left-select': [1100, 410],
});

export function connectionPoints(connection) {
  return [
    SCHEMATIC_LAYOUT[connection.from[0]].pins[connection.from[1]],
    ...ROUTES[connection.id],
    SCHEMATIC_LAYOUT[connection.to[0]].pins[connection.to[1]],
  ];
}

export function electricalJunctions() {
  const groups = new Map();
  for (const connection of HARDWARE_CONNECTIONS) {
    const net = connection.aliasOf ?? connection.net;
    if (!groups.has(net)) groups.set(net, []);
    groups.get(net).push(connectionPoints(connection));
  }
  const junctions = [];
  for (const [net, routes] of groups) {
    const points = new Map(routes.flat().map((p) => [p.join(','), p]));
    for (const [x, y] of points.values()) {
      const directions = new Set();
      for (const route of routes) {
        for (let i = 1; i < route.length; i++) {
          const [a, b] = [route[i - 1], route[i]];
          if (a[0] === x && b[0] === x && y >= Math.min(a[1], b[1]) && y <= Math.max(a[1], b[1])) {
            if (Math.min(a[1], b[1]) < y) directions.add('up');
            if (Math.max(a[1], b[1]) > y) directions.add('down');
          }
          if (a[1] === y && b[1] === y && x >= Math.min(a[0], b[0]) && x <= Math.max(a[0], b[0])) {
            if (Math.min(a[0], b[0]) < x) directions.add('left');
            if (Math.max(a[0], b[0]) > x) directions.add('right');
          }
        }
      }
      if (directions.size > 2) junctions.push({ net, x, y });
    }
  }
  return junctions;
}

function componentSymbol(component) {
  const { x, y, width, height, pins } = SCHEMATIC_LAYOUT[component.key];
  const pinSymbols = Object.entries(pins)
    .map(([label, [px, py]]) => {
      const ex = Math.max(x, Math.min(x + width, px));
      const ey = Math.max(y, Math.min(y + height, py));
      const tx = px < x ? x + 12 : px > x + width ? x + width - 12 : px;
      const ty = py < y ? y + 18 : py > y + height ? y + height - 12 : py + 5;
      const anchor = px < x ? 'start' : px > x + width ? 'end' : 'middle';
      return `<g data-pin="${label}"><path class="pin-stub" d="M${px} ${py}L${ex} ${ey}"/><circle class="pin-terminal" cx="${px}" cy="${py}" r="3"/><text class="pin-label" x="${tx}" y="${ty}" text-anchor="${anchor}">${label}</text></g>`;
    })
    .join('');
  const center = x + width / 2;
  const titleY =
    component.key === 'esp32-s3' ? y + 160 : component.key.startsWith('sht31') ? y + 78 : y + 54;
  const referenceY = component.key.startsWith('sht31') ? y + 42 : titleY - 22;
  const captionY =
    component.key === 'esp32-s3'
      ? titleY + 28
      : y + height - (component.key === 'inmp441' ? 64 : 38);
  return `<g class="schematic-node" role="button" tabindex="0" aria-label="Select ${component.label}" aria-pressed="false" data-hardware-node="${component.key}">
    <title>${component.reference} — ${component.label}</title>
    <rect class="component-body" x="${x}" y="${y}" width="${width}" height="${height}"/>
    ${pinSymbols}
    <text class="component-reference" x="${center}" y="${referenceY}" text-anchor="middle">${component.reference}</text>
    <text class="component-name" x="${center}" y="${titleY}" text-anchor="middle">${component.label}</text>
    <text class="symbol-caption" x="${center}" y="${captionY}" text-anchor="middle">${component.detail}</text>
  </g>`;
}

export function schematicMarkup() {
  const wires = HARDWARE_CONNECTIONS.map((connection) => {
    const trace =
      connection.kind === 'power'
        ? 'power-3v3'
        : connection.kind === 'ground'
          ? 'power-gnd'
          : connection.kind;
    const label = NET_LABELS[connection.id];
    return `<g class="wire-net" data-net="${connection.net}" data-net-root="${connection.aliasOf ?? connection.net}">
      <path class="trace trace-${connection.kind}" data-trace="${trace}" data-connection="${connection.id}" d="${connectionPoints(
        connection
      )
        .map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`)
        .join(
          ' '
        )}" ${connection.direction === 'output' ? 'marker-end="url(#schematic-direction)"' : ''}><title>${connection.from.join('.')} → ${connection.to.join('.')} · ${connection.net}</title></path>
      ${label ? `<text class="net-label" x="${label[0]}" y="${label[1]}" text-anchor="middle">${connection.net}</text>` : ''}
    </g>`;
  }).join('');
  return `<defs>
    <pattern id="schematic-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20"/></pattern>
    <marker id="schematic-direction" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L8 4L0 8"/></marker>
  </defs>
  <rect class="schematic-paper" x="-4800" y="-4000" width="10800" height="9000" fill="url(#schematic-grid)"/>
  <text class="schematic-heading" x="60" y="34">Physical wiring</text>
  <text class="schematic-note" x="640" y="58">Nominal rail — not a voltage observation</text>
  ${wires}
  <g class="power-terminal"><path d="M580 90V60m-9 10 9-10 9 10"/><text x="550" y="55">3V3</text></g>
  <g class="ground-terminal"><path d="M640 720V742m-20 0h40m-34 7h28m-21 7h14"/><text x="674" y="746">GND</text></g>
  ${electricalJunctions()
    .map(
      ({ net, x, y }) =>
        `<circle class="junction junction-${net === '3V3' ? 'power' : 'ground'}" data-junction-net="${net}" cx="${x}" cy="${y}" r="4"/>`
    )
    .join('')}
  ${HARDWARE_COMPONENTS.map(componentSymbol).join('')}
  <path class="schematic-divider" d="M60 790H1140"/>
  <text class="schematic-note" x="60" y="820">Network relationship — not GPIO wiring</text>
  <g class="schematic-node" role="button" tabindex="0" aria-label="Select Rack Power" aria-pressed="false" data-hardware-node="electrical">
    <rect class="component-body" x="150" y="850" width="250" height="84"/>
    <text class="component-name" x="275" y="883" text-anchor="middle">Rack Power</text>
    <text class="symbol-caption" x="275" y="909" text-anchor="middle">Shelly Plug PM Gen3</text>
  </g>
  <path class="trace trace-logical" data-trace="electrical" d="M400 890H820"/>
  <text class="net-label" x="610" y="875" text-anchor="middle">Wi-Fi / MQTT</text>
  <rect class="logical-endpoint" x="820" y="850" width="260" height="84"/>
  <text class="component-name" x="950" y="883" text-anchor="middle">Existing broker / backend</text>
  <text class="symbol-caption" x="950" y="909" text-anchor="middle">Separate network device</text>`;
}

export function zoomSchematicView(
  view,
  factor,
  anchor = [view.x + view.width / 2, view.y + view.height / 2]
) {
  const width = Math.max(300, Math.min(2400, view.width / factor));
  const scale = width / view.width;
  return {
    x: anchor[0] + (view.x - anchor[0]) * scale,
    y: anchor[1] + (view.y - anchor[1]) * scale,
    width,
    height: view.height * scale,
  };
}

export function mountHardwareSchematic(container) {
  const svg = container.querySelector('svg');
  svg.innerHTML = schematicMarkup();
  const abort = new window.AbortController();
  const options = { signal: abort.signal };
  const home = { x: 0, y: 0, width: 1200, height: 980 };
  let view = { ...home };
  let drag;
  const apply = () =>
    svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.width} ${view.height}`);
  const point = (event) =>
    new window.DOMPoint(event.clientX, event.clientY).matrixTransform(svg.getScreenCTM().inverse());
  const fit = () => {
    view = { ...home };
    apply();
  };
  container.addEventListener(
    'click',
    async (event) => {
      const action = event.target.closest('[data-schematic-action]')?.dataset.schematicAction;
      if (action === 'fit' || action === 'reset') fit();
      if (action === 'in' || action === 'out') {
        view = zoomSchematicView(view, action === 'in' ? 1.25 : 0.8);
        apply();
      }
      if (action === 'fullscreen') {
        try {
          if (document.fullscreenElement === container) await document.exitFullscreen();
          else await container.requestFullscreen();
        } catch {
          container.querySelector('[data-schematic-status]').textContent = 'Fullscreen unavailable';
        }
      }
    },
    options
  );
  svg.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const p = point(event);
      view = zoomSchematicView(view, event.deltaY < 0 ? 1.12 : 1 / 1.12, [p.x, p.y]);
      apply();
    },
    { ...options, passive: false }
  );
  svg.addEventListener(
    'pointerdown',
    (event) => {
      if (event.button !== 0 || event.target.closest('[data-hardware-node], [data-trace]')) return;
      const p = point(event);
      drag = { x: p.x, y: p.y, pointerId: event.pointerId };
      svg.setPointerCapture(event.pointerId);
    },
    options
  );
  svg.addEventListener(
    'pointermove',
    (event) => {
      if (!drag) return;
      const p = point(event);
      view.x += drag.x - p.x;
      view.y += drag.y - p.y;
      apply();
    },
    options
  );
  const endDrag = () => {
    drag = null;
  };
  svg.addEventListener('pointerup', endDrag, options);
  svg.addEventListener('pointercancel', endDrag, options);
  svg.addEventListener('lostpointercapture', endDrag, options);
  svg.addEventListener(
    'keydown',
    (event) => {
      if (event.target !== svg) return;
      const step = view.width / 12;
      if (
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '0', 'Home'].includes(
          event.key
        )
      )
        event.preventDefault();
      if (event.key === 'ArrowLeft') view.x -= step;
      if (event.key === 'ArrowRight') view.x += step;
      if (event.key === 'ArrowUp') view.y -= step;
      if (event.key === 'ArrowDown') view.y += step;
      if (event.key === '+' || event.key === '=') view = zoomSchematicView(view, 1.25);
      if (event.key === '-') view = zoomSchematicView(view, 0.8);
      if (event.key === '0' || event.key === 'Home') fit();
      apply();
    },
    options
  );
  document.addEventListener(
    'fullscreenchange',
    () => {
      const active = document.fullscreenElement === container;
      const button = container.querySelector('[data-schematic-action="fullscreen"]');
      button.textContent = active ? 'Exit fullscreen' : 'Fullscreen';
      button.setAttribute('aria-pressed', String(active));
    },
    options
  );
  let previousWidth = 0;
  const resize = new window.ResizeObserver(() => {
    const width = svg.clientWidth;
    if (width === 0 || width === previousWidth) return;
    previousWidth = width;
    if (width < 700 && view.width > width) {
      view = zoomSchematicView(view, view.width / width);
      apply();
    }
  });
  resize.observe(svg);
  apply();
  return () => {
    abort.abort();
    resize.disconnect();
  };
}
