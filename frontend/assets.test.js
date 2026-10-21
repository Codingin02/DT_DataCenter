import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('./main.js', import.meta.url), 'utf8');

test('Shelly uses the shared state, native power sign and existing Electrical history context', () => {
  assert.match(html, /data-electrical-device-id="shellyplugpmg3-48f6eebbf3f4"/);
  assert.match(main, /'rack-acoustic', electricalDeviceId/);
  assert.match(main, /Electrical monitoring only/);
  assert.match(main, /shelly-returned_energy_wh_total/);
  assert.match(html, /data-history-metric="returned_energy_wh_total"/);
  assert.doesNotMatch(
    main,
    /meter model remains pending|Instrument model pending physical selection/
  );
  assert.equal((main.match(/new LiveCurrentState\(/g) ?? []).length, 1);
});

test('physical hardware facts identify the flashed toolchain and installed sensor roles', () => {
  assert.match(main, /'Arduino ESP32 core 3\.3\.12'/);
  assert.match(main, /'Upper exhaust airflow'/);
  assert.match(main, /'Server vicinity'/);
  assert.doesNotMatch(main, /acceptance-|Simulated source/);
});

test('Assets owns a selectable canonical history scope and wiring schematic', () => {
  for (const range of ['live', '1h', '24h', '5d'])
    assert.match(html, new RegExp(`data-scope-range="${range}"`));
  assert.match(html, /class="hardware-schematic"/);
  assert.match(main, /mountHardwareSchematic/);
  assert.match(main, /hardwareObservations\.replaceChildren/);
  assert.match(
    main,
    /historyUrl\(\{\s*assetId,\s*metric,\s*sensorId,\s*range,\s*maxPoints,\s*now,/
  );
  assert.match(
    main,
    /renderHistoryChart\(container, await fetchHistory\(metric, sensorId, range, signal, maxPoints\)\)/
  );
});

test('Hardware Scope Live consumes the shared SSE state instead of fetching aggregated history', () => {
  const scope = main.slice(
    main.indexOf('function renderHardwareScope('),
    main.indexOf('function scaleGradient(')
  );
  assert.match(scope, /new LiveObservationBuffer\(\)/);
  assert.match(
    scope,
    /live\.buffer\.append\(record, connectionState !== LIVE_STATE\.DISCONNECTED\)/
  );
  assert.match(scope, /liveChartOption\(live\.buffer\.points/);
  assert.match(scope, /else\s+void loadHardwareHistory/);
  assert.doesNotMatch(scope, /60_000|scopeRange === 'live' \? '1h'/);
  assert.match(scope, /observationLabel\(record\)/);
  assert.match(scope, /Stream disconnected/);
  assert.match(main, /if \(scopeRange === 'live'\) renderHardwareScope/);
  assert.equal((main.match(/new LiveCurrentState\(/g) ?? []).length, 1);
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
  assert.match(main, /productSource\(record\.sensor_id, record\.display_name\)/);
  const registryHead = html.match(/<div class="registry-table-head"[\s\S]*?<\/div>/)?.[0];
  assert.ok(registryHead);
  assert.doesNotMatch(registryHead, /role="columnheader">Source<\/span>/);
  assert.doesNotMatch(html, /data-hardware-evidence|Condition history · 5d/);
});

test('unnamed presentation retains technical identifiers without changing bindings', () => {
  assert.match(main, /assetId\s*\? 'Unnamed asset'\s*: 'Not configured'/);
  assert.match(main, /element\.title = assetId/);
  assert.match(main, /inspectorSensor\.title = context\.sensor_id/);
  assert.match(main, /source\.title = record\.sensor_id/);
  assert.match(main, /sourceFilterKey\(series\.sensor_id\) === historySource\.value/);
});

test('global status distinguishes live records from direct device health', () => {
  assert.match(main, /connectionState === LIVE_STATE\.UNSYNCHRONIZED && records\.length > 0/);
  assert.match(main, /records\.length > 0\s*\? 'Data received'/);
  assert.doesNotMatch(main, /setStatus\('device', 'Online', 'healthy'\)/);
});

test('production Twin exposes actual source selection without normal registration banners', () => {
  assert.match(html, /id="twin-sources"/);
  assert.match(html, /value="telecommunications"/);
  assert.match(main, /twinSources\.addEventListener\('click', handleRegistryAction\)/);
  assert.match(main, /registrationGroup\.hidden = physicalRackModel/);
  assert.match(
    main,
    /spatialReadinessGroup\.hidden = physicalRackModel && activeWorkspace === 'twin'/
  );
  assert.match(main, /if \(!presentation\.zones && groupObserved\)/);
  assert.match(main, /window\.clearInterval\(freshnessTimer\)/);
  assert.doesNotMatch(
    html,
    /percent_rh<|Synthetic derivation|no values are generated in the browser/
  );
  assert.match(main, /title: 'Rack Controller'/);
  assert.match(main, /title: 'Rack Power'/);
});
