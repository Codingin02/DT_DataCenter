import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('./main.js', import.meta.url), 'utf8');

test('Assets owns a selectable canonical history scope and component artwork', () => {
  for (const range of ['live', '1h', '24h', '5d'])
    assert.match(html, new RegExp(`data-scope-range="${range}"`));
  for (const detail of ['board-pcb', 'board-shield', 'sensor-package', 'mic-can', 'meter-ring'])
    assert.match(html, new RegExp(`class="${detail}"`));
  assert.match(main, /historyUrl\(\{ assetId, metric, sensorId, range, maxPoints \}\)/);
  assert.match(main, /renderHistoryChart\(container, await response\.json\(\)\)/);
});

test('Assets separates measurement availability from physical hardware condition', () => {
  assert.match(main, /No current canonical observation/);
  assert.match(main, /Current diagnostic or power evidence is incomplete/);
  assert.match(main, /Current data available/);
  assert.match(main, /availableDiagnostics\.length === 0/);
  assert.doesNotMatch(html, /Condition history · 5d|data-hardware-evidence|data-hardware-metrics/);
  assert.doesNotMatch(main, /simulated deployment|Reason \$\{/);
  assert.doesNotMatch(main, /Remaining life|Health \d+%|Predicted failure date/);
});

test('Twin selection and Streams filters reuse canonical records without development IDs in the table', () => {
  assert.match(main, /measurementBrowserGroup\.after\(inspector\)/);
  assert.match(main, /activeWorkspace !== 'twin'\s*&&\s*isMeasurementSpatialWorkspace\(\)/);
  assert.match(main, /locations\.size/);
  assert.match(html, /data-stream-filter="all"[\s\S]*data-stream-filter="device"/);
  assert.match(main, /activeStreamFilter = button\.dataset\.streamFilter/);
  assert.match(main, /productSource\(record\.sensor_id, presentation\.group\)/);
  const registryHead = html.match(/<div class="registry-table-head"[\s\S]*?<\/div>/)?.[0];
  assert.ok(registryHead);
  assert.doesNotMatch(registryHead, /role="columnheader">Source<\/span>/);
  assert.doesNotMatch(html, /data-hardware-evidence|Condition history · 5d/);
});

test('global status distinguishes live records from direct device health', () => {
  assert.match(main, /connectionState === LIVE_STATE\.UNSYNCHRONIZED && records\.length > 0/);
  assert.match(main, /records\.length > 0\s*\? 'Data received'/);
  assert.doesNotMatch(main, /setStatus\('device', 'Online', 'healthy'\)/);
});
