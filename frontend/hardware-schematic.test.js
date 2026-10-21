import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import {
  HARDWARE_COMPONENTS,
  HARDWARE_CONNECTIONS,
  SCHEMATIC_LAYOUT,
  connectionPoints,
  electricalJunctions,
  schematicMarkup,
  zoomSchematicView,
} from './hardware-schematic.js';

test('physical netlist is immutable and contains only the four installed acquisition modules', () => {
  assert.deepEqual(
    HARDWARE_COMPONENTS.map((c) => c.key),
    ['esp32-s3', 'sht31-a', 'sht31-b', 'inmp441']
  );
  assert.ok(Object.isFrozen(HARDWARE_CONNECTIONS));
  assert.ok(Object.isFrozen(HARDWARE_CONNECTIONS[0].from));
  assert.throws(() => {
    HARDWARE_CONNECTIONS[0].from[1] = '5V';
  }, TypeError);
  assert.equal(new Set(HARDWARE_CONNECTIONS.map((c) => c.id)).size, 14);
  assert.ok(
    HARDWARE_CONNECTIONS.every((c) => c.from[0] !== 'electrical' && c.to[0] !== 'electrical')
  );
});

test('independent I2C buses and microphone data direction match the physical pinout', () => {
  const expected = [
    ['I2C0_SDA', ['esp32-s3', 'GPIO8'], ['sht31-a', 'SDA']],
    ['I2C0_SCL', ['esp32-s3', 'GPIO9'], ['sht31-a', 'SCL']],
    ['I2C1_SDA', ['esp32-s3', 'GPIO10'], ['sht31-b', 'SDA']],
    ['I2C1_SCL', ['esp32-s3', 'GPIO11'], ['sht31-b', 'SCL']],
    ['I2S_WS', ['esp32-s3', 'GPIO4'], ['inmp441', 'WS']],
    ['I2S_BCLK', ['esp32-s3', 'GPIO5'], ['inmp441', 'BCLK/SCK']],
    ['I2S_SD', ['inmp441', 'SD'], ['esp32-s3', 'GPIO6']],
  ];
  for (const [net, from, to] of expected) {
    const c = HARDWARE_CONNECTIONS.find((entry) => entry.net === net);
    assert.deepEqual(c.from, from);
    assert.deepEqual(c.to, to);
  }
  assert.equal(HARDWARE_CONNECTIONS.find((c) => c.net === 'I2S_SD').direction, 'output');
  assert.equal(HARDWARE_CONNECTIONS.filter((c) => c.kind === 'i2c0').length, 2);
  assert.equal(HARDWARE_CONNECTIONS.filter((c) => c.kind === 'i2c1').length, 2);
});

test('nominal 3V3 and common ground branch to each sensor; L/R is electrically ground', () => {
  for (const [key, pin] of [
    ['sht31-a', 'VCC'],
    ['sht31-b', 'VCC'],
    ['inmp441', 'VDD'],
  ]) {
    assert.ok(
      HARDWARE_CONNECTIONS.some((c) => c.net === '3V3' && c.to[0] === key && c.to[1] === pin)
    );
    assert.ok(
      HARDWARE_CONNECTIONS.some((c) => c.net === 'GND' && c.to[0] === key && c.to[1] === 'GND')
    );
  }
  const select = HARDWARE_CONNECTIONS.find((c) => c.net === 'MIC_LEFT_SELECT');
  assert.deepEqual(select.from, ['inmp441', 'L/R']);
  assert.deepEqual(select.to, ['esp32-s3', 'GND']);
  assert.equal(select.aliasOf, 'GND');
});

test('routes terminate on modeled pins, remain orthogonal and avoid all component interiors', () => {
  for (const connection of HARDWARE_CONNECTIONS) {
    const points = connectionPoints(connection);
    assert.deepEqual(points[0], SCHEMATIC_LAYOUT[connection.from[0]].pins[connection.from[1]]);
    assert.deepEqual(points.at(-1), SCHEMATIC_LAYOUT[connection.to[0]].pins[connection.to[1]]);
    for (let i = 1; i < points.length; i++) {
      const [a, b] = [points[i - 1], points[i]];
      assert.ok(a[0] === b[0] || a[1] === b[1], connection.net);
      for (const { x, y, width, height } of Object.values(SCHEMATIC_LAYOUT)) {
        const intersects =
          a[0] === b[0]
            ? a[0] > x &&
              a[0] < x + width &&
              Math.max(a[1], b[1]) > y &&
              Math.min(a[1], b[1]) < y + height
            : a[1] > y &&
              a[1] < y + height &&
              Math.max(a[0], b[0]) > x &&
              Math.min(a[0], b[0]) < x + width;
        assert.equal(intersects, false, `${connection.net} crosses a component`);
      }
    }
  }
});

test('junction dots belong only to actual shared power/ground branches, not signal crossings', () => {
  assert.deepEqual(electricalJunctions(), [
    { net: '3V3', x: 580, y: 90 },
    { net: '3V3', x: 190, y: 90 },
    { net: 'GND', x: 640, y: 720 },
    { net: 'GND', x: 130, y: 660 },
    { net: 'GND', x: 970, y: 720 },
  ]);
});

test('SVG exposes terminal symbols and selection hooks without fake instruments or electrical Shelly links', () => {
  const svg = schematicMarkup();
  for (const key of ['esp32-s3', 'sht31-a', 'sht31-b', 'inmp441', 'electrical'])
    assert.match(svg, new RegExp(`data-hardware-node="${key}"`));
  for (const c of HARDWARE_CONNECTIONS) assert.match(svg, new RegExp(`data-net="${c.net}"`));
  assert.match(svg, /Nominal rail — not a voltage observation/);
  assert.match(svg, /Network relationship — not GPIO wiring/);
  assert.match(svg, /data-trace="electrical"/);
  assert.match(svg, /data-pin="L\/R"/);
  assert.doesNotMatch(svg, /acceptance-|SHT1|SHT2|logic analyzer|board-pcb/i);
  assert.equal((svg.match(/data-connection=/g) ?? []).length, 14);
});

test('zoom preserves anchor and aspect ratio, is reversible and bounded', () => {
  const home = { x: 0, y: 0, width: 1200, height: 980 };
  const zoom = zoomSchematicView(home, 2, [200, 100]);
  assert.deepEqual(zoom, { x: 100, y: 50, width: 600, height: 490 });
  assert.deepEqual(zoomSchematicView(zoom, 0.5, [200, 100]), home);
  assert.equal(zoomSchematicView(home, 100).width, 300);
  assert.equal(zoomSchematicView(home, 0.001).width, 2400);
});

test('Assets keeps history, telemetry ownership, inspector and accessible schematic controls', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const main = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
  for (const action of ['fit', 'in', 'out', 'reset', 'fullscreen'])
    assert.match(html, new RegExp(`data-schematic-action="${action}"`));
  for (const range of ['live', '1h', '24h', '5d'])
    assert.match(html, new RegExp(`data-scope-range="${range}"`));
  assert.match(main, /hardwareObservations\.replaceChildren/);
  assert.match(main, /value\.textContent = observationLabel\(record\)/);
  assert.match(main, /time\.dateTime = record\.source_ts/);
  assert.match(main, /disposeHardwareSchematic\(\)/);
  assert.equal((main.match(/new LiveCurrentState\(/g) ?? []).length, 1);
  for (const id of [
    'sht31-a-temperature',
    'sht31-a-humidity',
    'sht31-b-temperature',
    'sht31-b-humidity',
    'rack-sound-rms',
    'rack-sound-peak',
  ])
    assert.ok(main.includes(id));
  assert.match(css, /\.schematic-viewport:fullscreen/);
  assert.match(css, /touch-action: none/);
  assert.doesNotMatch(css, /animation: trace-flow/);
});

const firmware =
  'E:/Projects/IOT ESP32 Project/Digital Twin Data Center/DT_DataCenter/DT_DataCenter.ino';
test(
  'schematic agrees with the active Arduino firmware without modifying it',
  { skip: !existsSync(firmware) },
  () => {
    const text = readFileSync(firmware, 'utf8');
    for (const [name, pin] of [
      ['SHT_A_SDA', 8],
      ['SHT_A_SCL', 9],
      ['SHT_B_SDA', 10],
      ['SHT_B_SCL', 11],
      ['MIC_WS', 4],
      ['MIC_BCLK', 5],
      ['MIC_SD', 6],
    ])
      assert.match(text, new RegExp(`#define ${name} ${pin}\\b`));
    assert.match(text, /I2C_A\.begin\(SHT_A_SDA, SHT_A_SCL, 50000\)/);
    assert.match(text, /I2C_B\.begin\(SHT_B_SDA, SHT_B_SCL, 50000\)/);
  }
);
