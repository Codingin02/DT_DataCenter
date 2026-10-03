import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';

import {
  MEASUREMENT_SCALE,
  MODEL_STATE,
  PERFORMANCE_PROFILE,
  PERFORMANCE_STORAGE_KEY,
  SPATIAL_METRIC,
  SURFACE_MODE,
  RackViewer,
  closestModelSurface,
  createFunctionalProxy,
  createTelemetryOverlay,
  measurementColor,
  measurementScalePosition,
  measurementZoneSize,
  middleCabinetSurfaces,
  modelLocalIntersection,
  normalizeSpatialAnchors,
  normalizePerformanceProfile,
  parseRackModelConfig,
  performancePixelRatio,
  persistPerformanceProfile,
  readPerformanceProfile,
  resolveRackModelResourceUrl,
  spatialAnchorKey,
} from './rack-viewer.js';

const baseUrl = 'https://dt.local/viewer/';

test('frontend configures distinct workspaces around one canonical rack viewer', async () => {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const main = await readFile(new URL('./main.js', import.meta.url), 'utf8');
  const styles = await readFile(new URL('./styles.css', import.meta.url), 'utf8');
  assert.match(html, /data-model-url="\/models\/rack\.glb"/);
  for (const id of [
    'stream-browser',
    'surface-mode',
    'measurement-inspector',
    'clear-selection',
    'analytics-context',
    'asset-browser',
    'analytics-workspace',
    'event-browser',
    'system-browser',
    'measurement-legend',
    'stream-registry-body',
    'inspector-registration',
    'inspector-empty',
    'inspector-detail',
    'workspace-path',
    'registration-source',
    'start-registration',
    'inspect-registration',
    'registration-preview',
    'confirm-registration',
    'cancel-registration',
    'inspector-position',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(html, /id="performance-profile"/);
  for (const [workspace, hash] of [
    ['twin', 'twin-workspace'],
    ['assets', 'asset-browser'],
    ['streams', 'stream-browser'],
    ['analytics', 'analytics-workspace'],
    ['events', 'event-browser'],
    ['systems', 'system-browser'],
  ]) {
    assert.match(html, new RegExp(`data-workspace="${workspace}"[\\s\\S]*?href="#${hash}"`));
  }
  for (const layer of ['geometry', 'anchors', 'zones']) {
    assert.match(html, new RegExp(`data-layer="${layer}"`));
  }
  assert.match(html, /href="#twin-workspace"[\s\S]*aria-current="page"/);
  assert.match(html, /Physical Registration[\s\S]*Unavailable/);
  assert.match(html, /data-workspace-surface="assets"/);
  assert.match(html, /data-workspace-surface="streams"/);
  assert.match(html, /data-workspace-surface="analytics"/);
  assert.match(html, /data-workspace-surface="events"/);
  assert.match(html, /data-system-surface="telecommunications"/);
  assert.match(html, /data-system-surface="electrical"/);
  assert.match(html, /id="context-analytics"[\s\S]*hidden/);
  assert.match(html, /Network Infrastructure[\s\S]*Not modeled/);
  assert.match(html, /Power instrumentation[\s\S]*Unavailable/);
  assert.doesNotMatch(html, /data-spatial-overlay="twin"/);
  assert.match(html, /data-spatial-overlay="architecture"/);
  assert.match(html, /data-spatial-overlay="mechanical"/);
  assert.doesNotMatch(html, /class="spatial-context"/);
  assert.equal(html.match(/<canvas/g)?.length, 1);
  assert.equal(main.match(/new RackViewer\(/g)?.length, 1);
  assert.match(main, /const supportedWorkspace =\s*activeWorkspace === 'twin'/);
  assert.doesNotMatch(main, /\['twin', 'streams'\]\.includes\(activeWorkspace\)/);
  assert.match(html, /class="browser-group reference-scale-group"[\s\S]*id="measurement-legend"/);
  assert.doesNotMatch(html, /class="spatial-layer-state"[\s\S]*id="measurement-legend"/);
  assert.match(main, /registrationGroup\.hidden = simulationPresent/);
  assert.match(main, /spatialReadinessGroup\.hidden = simulationPresent/);
  assert.match(
    main,
    /acceptance-sht31-a-temperature', positions\.top[\s\S]*acceptance-sht31-a-humidity', positions\.top/
  );
  assert.match(
    main,
    /acceptance-sht31-b-temperature', positions\.front[\s\S]*acceptance-sht31-b-humidity', positions\.front/
  );
  assert.match(
    main,
    /acceptance-voltage', positions\.electrical[\s\S]*acceptance-energy', positions\.electrical/
  );
  assert.match(main, /spatialLayerCallout\.hidden = !isMeasurementSpatialWorkspace\(\) \|\| quiet/);
  assert.equal(main.match(/new LiveCurrentState\(/g)?.length, 1);
  assert.equal(main.match(/new EventSource\(/g)?.length ?? 0, 0);
  assert.doesNotMatch(main, /const spatialAnchors = Object\.freeze/);
  assert.match(main, /selectedKey = spatialAnchorKey\(context\)/);
  assert.match(main, /registrationPreview = null;[\s\S]*setRegistrationMode\(false\)/);
  assert.match(html, /id="registration-source" disabled/);
  assert.match(html, /id="start-registration" type="button" disabled/);
  assert.doesNotMatch(html, /SHT31-A|SHT31-B/);
  assert.match(html, /data-measurement-legend="temperature"[\s\S]*18[\s\S]*22\.5[\s\S]*27/);
  assert.match(
    html,
    /data-measurement-legend="humidity"[\s\S]*0[\s\S]*25[\s\S]*50[\s\S]*75[\s\S]*100% RH/
  );
  const humidityLegend = html.match(
    /<section\s+data-measurement-legend="humidity"[\s\S]*?<\/section>/
  )?.[0];
  assert.ok(humidityLegend);
  assert.doesNotMatch(humidityLegend, /Recommended envelope|18–27/);
  assert.doesNotMatch(html, /data-legend-pointer|data-legend-observed/);
  assert.match(main, /viewerPanel\.prepend\(referenceScaleGroup\)/);
  assert.match(html, /id="analytics-history-chart" class="chart-frame history-chart"/);
  assert.match(main, /historyUrl\(/);
  assert.match(main, /scale !== undefined/);
  assert.doesNotMatch(html, />\s*(Safe|Alarm|Critical)\s*</);
  assert.equal(html.match(/name="twin-spatial-metric"/g)?.length, 4);
  assert.match(html, /name="twin-spatial-metric"[\s\S]*value="acoustic"/);
  assert.match(html, /name="twin-spatial-metric"[\s\S]*value="electrical"/);
  assert.doesNotMatch(html, /name="twin-spatial-metric"[^>]*value="sound_(?:rms|peak)_dbfs"/);
  assert.equal(html.match(/name="mechanical-spatial-metric"/g)?.length, 4);
  assert.match(main, /querySelectorAll\('\.spatial-metric-input'\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test('empty workspaces retain engineering structure and domain diagrams', async () => {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /class="hardware-schematic"[\s\S]*ESP32-S3/);
  assert.match(html, /data-hardware-node="sht31-a"[\s\S]*SHT31 A/);
  assert.match(html, /data-hardware-node="sht31-b"[\s\S]*SHT31 B/);
  assert.match(html, /data-hardware-node="inmp441"[\s\S]*INMP441/);
  assert.doesNotMatch(html, /class="asset-state-board"|class="relationship-diagram"|board-face/);
  assert.match(html, /data-stream-filter="environment"[\s\S]*data-stream-filter="device"/);
  assert.match(html, /id="stream-registry-body"/);
  assert.match(html, /id="history-query"[\s\S]*data-history-range="5d"/);
  assert.match(html, /id="analytics-history-chart"[\s\S]*no values are generated in the browser/i);
  assert.match(html, /data-history-metric="net_receive_throughput_bytes_per_second"/);
  assert.match(html, /data-history-metric="active_power_w"/);
  assert.match(html, /data-history-metric="temperature"/);
  assert.match(html, /Operational event browser[\s\S]*Synthetic derivation/);
  assert.match(html, /class="topology-flow"[\s\S]*Network Infrastructure[\s\S]*Not modeled/);
  assert.match(html, /class="electrical-schematic"[\s\S]*Measurement source unavailable/);
  assert.match(html, /class="mechanical-domain-panel"[\s\S]*Requires anchor \+ observation/);
});

test('assets hardware topology covers configured wiring and interaction state', async () => {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const main = await readFile(new URL('./main.js', import.meta.url), 'utf8');
  for (const mapping of [
    /'VCC', 'ESP32 3V3', 'Power'/,
    /'GND', 'ESP32 GND', 'Ground'/,
    /'SDA', 'GPIO8', 'I2C0 data'/,
    /'SCL', 'GPIO9', 'I2C0 clock'/,
    /'SDA', 'GPIO10', 'I2C1 data'/,
    /'SCL', 'GPIO11', 'I2C1 clock'/,
    /'INT', 'NC', 'Not used'/,
    /'RST', 'NC', 'Not used'/,
    /'SCK', 'GPIO5', 'I2S0 BCLK'/,
    /'WS', 'GPIO4', 'I2S0 WS \/ LRCLK'/,
    /'SD', 'GPIO6', 'I2S0 DATA IN'/,
    /'L\/R', 'GND', 'Left-channel selection'/,
  ]) {
    assert.match(main, mapping);
  }
  assert.match(main, /acceptance-sht31-a-temperature[\s\S]*acceptance-sht31-a-humidity/);
  assert.match(main, /acceptance-sht31-b-temperature[\s\S]*acceptance-sht31-b-humidity/);
  assert.match(main, /hardwareActivity\(records\)[\s\S]*records\.some/);
  assert.match(main, /selectedHardwareKey[\s\S]*setBreadcrumb\(\['Assets', 'Hardware condition'/);
  assert.match(html, /data-hardware-node="electrical"/);
  assert.match(html, /data-trace="i2c0"/);
  assert.match(html, /data-trace="i2c1"/);
  assert.match(html, /data-trace="i2s0"/);
  assert.match(html, /Wi-Fi \/ MQTT/);
  assert.match(html, /Current diagnostics[\s\S]*Manufacturer reference[\s\S]*Wiring/);
  assert.doesNotMatch(html, /Condition history · 5d|data-hardware-evidence/);
  assert.doesNotMatch(html + main, /Remaining life|RUL|Health \d+%|predicted failure/i);
  assert.match(main, /crc_error_count[\s\S]*i2c_retry_count[\s\S]*sensor_reset_count/);
  assert.match(
    main,
    /i2s_error_count[\s\S]*dma_overrun_count[\s\S]*clip_ratio[\s\S]*stuck_sample_ratio/
  );
});

test('telecommunications topology preserves directional source-to-frontend order', async () => {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const styles = await readFile(new URL('./styles.css', import.meta.url), 'utf8');
  assert.match(
    html,
    /SHT31 \/ INMP441[\s\S]*ESP32-S3[\s\S]*Wi-Fi[\s\S]*Network Infrastructure[\s\S]*MQTT \/ Mosquitto[\s\S]*Node backend[\s\S]*PostgreSQL[\s\S]*SSE \/ Frontend/
  );
  assert.match(styles, /article:nth-child\(4\)::after[\s\S]*border-left/);
  assert.match(styles, /article:nth-child\(5\)[\s\S]*grid-column: 4/);
  assert.match(styles, /article:nth-child\(8\)[\s\S]*grid-column: 1/);
});

test('performance profiles validate preferences and bound renderer pixel ratio', () => {
  assert.equal(normalizePerformanceProfile('hemat'), PERFORMANCE_PROFILE.EFFICIENT);
  assert.equal(normalizePerformanceProfile('invalid'), PERFORMANCE_PROFILE.BALANCED);
  assert.equal(performancePixelRatio('hemat', 3), 1);
  assert.equal(performancePixelRatio('seimbang', 3), 1.5);
  assert.equal(performancePixelRatio('kualitas', 3), 2);
  assert.equal(performancePixelRatio('kualitas', 1.25), 1.25);
  assert.equal(performancePixelRatio('kualitas', 0), 1);
});

test('performance preference persists valid values and safely falls back to balanced', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  assert.equal(readPerformanceProfile(storage), PERFORMANCE_PROFILE.BALANCED);
  assert.equal(persistPerformanceProfile(storage, 'kualitas'), PERFORMANCE_PROFILE.QUALITY);
  assert.equal(values.get(PERFORMANCE_STORAGE_KEY), PERFORMANCE_PROFILE.QUALITY);
  assert.equal(readPerformanceProfile(storage), PERFORMANCE_PROFILE.QUALITY);
  values.set(PERFORMANCE_STORAGE_KEY, 'unsupported');
  assert.equal(readPerformanceProfile(storage), PERFORMANCE_PROFILE.BALANCED);
  assert.equal(
    readPerformanceProfile({ getItem: () => assert.fail('storage unavailable') }),
    PERFORMANCE_PROFILE.BALANCED
  );
});

test('changing performance profile resizes the existing renderer without reloading the model', () => {
  const savedWindow = globalThis.window;
  globalThis.window = { devicePixelRatio: 3 };
  try {
    const root = new THREE.Group();
    const loader = { loadAsync: () => assert.fail('model must not reload') };
    const { viewer } = viewerHarness(loader, root);
    const ratios = [];
    let resizeCount = 0;
    viewer.renderer = { setPixelRatio: (ratio) => ratios.push(ratio) };
    viewer.resize = () => {
      resizeCount += 1;
    };

    assert.equal(viewer.setPerformanceProfile('hemat'), PERFORMANCE_PROFILE.EFFICIENT);
    assert.deepEqual(ratios, [1]);
    assert.equal(resizeCount, 1);
    assert.equal(viewer.modelRoot, root);
    assert.equal(viewer.loader, loader);
  } finally {
    globalThis.window = savedWindow;
  }
});

test('active model can be framed without creating another representation', () => {
  const root = new THREE.Group();
  const { viewer } = viewerHarness({}, root);
  let renderRequested = false;
  viewer.requestRender = () => {
    renderRequested = true;
  };
  assert.equal(viewer.frameActiveModel(), true);
  assert.equal(viewer.framedRoot, root);
  assert.equal(renderRequested, true);
  assert.equal(viewer.scene.children.filter((child) => child === root).length, 1);
  viewer.destroyed = true;
  assert.equal(viewer.frameActiveModel(), false);
});

test('surface mode defaults to textured and restores original materials', () => {
  const original = new THREE.MeshStandardMaterial({
    color: 0x806040,
    metalness: 0.5,
    roughness: 0.4,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), original);
  const root = new THREE.Group();
  root.add(mesh);
  const { viewer } = viewerHarness({}, root);
  let renderCount = 0;
  viewer.requestRender = () => {
    renderCount += 1;
  };

  assert.equal(viewer.setSurfaceMode(SURFACE_MODE.TEXTURED), SURFACE_MODE.TEXTURED);
  assert.equal(mesh.material, original);
  assert.equal(viewer.scene.children.filter((child) => child === root).length, 1);

  assert.equal(viewer.setSurfaceMode(SURFACE_MODE.CONTRAST), SURFACE_MODE.CONTRAST);
  const contrast = mesh.material;
  assert.notEqual(contrast, original);
  assert.equal(contrast.type, 'MeshStandardMaterial');

  assert.equal(viewer.setSurfaceMode(SURFACE_MODE.TEXTURED), SURFACE_MODE.TEXTURED);
  assert.equal(mesh.material, original);
  assert.equal(renderCount, 3);
  mesh.geometry.dispose();
  original.dispose();
  contrast.dispose();
});

function viewerHarness(loader, modelRoot = null) {
  const states = [];
  const viewer = Object.create(RackViewer.prototype);
  Object.assign(viewer, {
    destroyed: false,
    frameModel: (root) => {
      viewer.framedRoot = root;
    },
    loadRevision: 0,
    loader,
    modelRoot,
    requestRender: () => {},
    scene: new THREE.Scene(),
    setState: (state, message = '') => states.push({ state, message }),
  });
  if (modelRoot !== null) viewer.scene.add(modelRoot);
  return { states, viewer };
}

test('rack model configuration defaults to unconfigured', () => {
  assert.equal(parseRackModelConfig({ url: '' }, baseUrl), null);
  assert.equal(MODEL_STATE.UNCONFIGURED, 'MODEL_UNCONFIGURED');
  assert.equal(MODEL_STATE.LOADING, 'MODEL_LOADING');
  assert.equal(MODEL_STATE.READY, 'MODEL_READY');
  assert.equal(MODEL_STATE.ERROR, 'MODEL_LOAD_ERROR');
});

test('functional proxy is one textureless software-proportioned cuboid', () => {
  const proxy = createFunctionalProxy();
  assert.equal(proxy.type, 'Mesh');
  assert.equal(proxy.geometry.type, 'BoxGeometry');
  assert.deepEqual(proxy.geometry.parameters, {
    width: 1,
    height: 2.4,
    depth: 0.8,
    widthSegments: 1,
    heightSegments: 1,
    depthSegments: 1,
  });
  assert.equal(proxy.material.type, 'MeshStandardMaterial');
  assert.equal(proxy.material.map, null);
  proxy.geometry.dispose();
  proxy.material.dispose();
});

test('telemetry overlay starts with no anchors or spatial markers', () => {
  const overlay = createTelemetryOverlay();
  assert.equal(overlay.anchors.size, 0);
  assert.equal(overlay.markers.size, 0);
  assert.equal(overlay.anchorRoot.children.length, 0);
  assert.equal(overlay.zoneRoot.children.length, 0);
});

function spatialViewerHarness() {
  const overlay = createTelemetryOverlay();
  const viewer = Object.create(RackViewer.prototype);
  let renderCount = 0;
  Object.assign(viewer, {
    activeSpatialMetric: 'temperature',
    canvas: {
      dataset: {},
      ownerDocument: {
        createElement: () => ({
          getContext: () => ({
            createRadialGradient: () => ({ addColorStop() {} }),
            fillRect() {},
            strokeRect() {},
            set fillStyle(_value) {},
            set lineWidth(_value) {},
            set strokeStyle(_value) {},
          }),
          height: 0,
          width: 0,
        }),
      },
    },
    layerVisibility: { anchors: true, geometry: true, zones: true },
    measurementZoneRoot: overlay.zoneRoot,
    modelRoot: new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial()),
    modelRadius: 10,
    modelSize: new THREE.Vector3(30, 10, 10),
    requestRender() {
      renderCount += 1;
    },
    selectedSpatialKey: null,
    telemetryAnchorRoot: overlay.anchorRoot,
    telemetryAnchors: overlay.anchors,
    telemetryMarkers: overlay.markers,
  });
  return { overlay, renderCount: () => renderCount, viewer };
}

const registeredAnchor = Object.freeze({
  asset_id: 'rack-a',
  coordinate_system_id: 'rack-model',
  metric: 'temperature',
  position_verified: false,
  position_version: '1',
  registration_state: 'reference_geometry',
  sensor_id: 'sensor-a',
  position: [0, 1, 5],
  unit: 'degC',
});

test('spatial anchors require explicit registration evidence and collision-safe identity', () => {
  assert.equal(spatialAnchorKey(registeredAnchor), '["rack-a","sensor-a"]');
  assert.deepEqual(normalizeSpatialAnchors([registeredAnchor]), [registeredAnchor]);
  assert.throws(() => normalizeSpatialAnchors([{ ...registeredAnchor, asset_id: '' }]), /asset_id/);
  assert.throws(
    () => normalizeSpatialAnchors([{ ...registeredAnchor, registration_state: 'planned' }]),
    /registration_state/
  );
  assert.throws(
    () => normalizeSpatialAnchors([{ ...registeredAnchor, coordinate_system_id: '' }]),
    /coordinate_system_id/
  );
  assert.throws(() => normalizeSpatialAnchors([registeredAnchor, registeredAnchor]), /unique/);
});

test('spatial layers render nothing without a registered anchor and matching record', () => {
  const { overlay, viewer } = spatialViewerHarness();

  viewer.setLayerVisibility('geometry', false);
  viewer.setLayerVisibility('anchors', false);
  viewer.setLayerVisibility('zones', true);
  assert.equal(viewer.modelRoot.visible, false);
  assert.equal(overlay.anchorRoot.visible, false);
  assert.equal(overlay.zoneRoot.visible, true);
  assert.equal(viewer.setSpatialAnchors([]), 0);
  const withoutAnchor = viewer.updateSpatialMeasurements(
    [{ ...registeredAnchor, metric: 'temperature', unit: 'degC', value: 24 }],
    'temperature'
  );
  assert.equal(withoutAnchor.count, 0);
  assert.equal(withoutAnchor.zoneCount, 0);
  assert.equal(overlay.anchorRoot.children.length, 0);
  assert.equal(overlay.zoneRoot.children.length, 0);

  viewer.setSpatialAnchors([registeredAnchor]);
  const withoutRecord = viewer.updateSpatialMeasurements([], 'temperature');
  assert.equal(withoutRecord.count, 0);
  assert.equal(overlay.anchorRoot.children[0].visible, true);
  assert.equal(overlay.anchorRoot.children[0].userData.spatialContext.sensor_id, 'sensor-a');
  assert.equal(overlay.zoneRoot.children.length, 0);
});

test('registered measured points reuse markers and bounded zones across metric updates', () => {
  const { overlay, renderCount, viewer } = spatialViewerHarness();
  const sensorB = { ...registeredAnchor, sensor_id: 'sensor-b', position: [2, 1, 5] };
  const humidityAnchor = {
    ...registeredAnchor,
    metric: 'humidity',
    sensor_id: 'sensor-humidity',
    unit: 'percent_rh',
  };
  const acousticAnchor = {
    ...registeredAnchor,
    metric: 'sound_rms_dbfs',
    position: [-2, 1, 5],
    sensor_id: 'sensor-rms',
    unit: 'dBFS',
  };
  viewer.setSpatialAnchors([registeredAnchor, sensorB, humidityAnchor, acousticAnchor]);
  const temperatureRecords = [
    { ...registeredAnchor, metric: 'temperature', unit: 'degC', value: 20 },
    { ...sensorB, metric: 'temperature', unit: 'degC', value: 30 },
  ];
  const temperature = viewer.updateSpatialMeasurements(temperatureRecords, 'temperature');
  assert.equal(temperature.count, 2);
  assert.equal(temperature.zoneCount, 2);
  assert.equal(overlay.anchorRoot.children.length, 3);
  assert.equal(overlay.markers.size, 3);
  assert.equal(overlay.zoneRoot.children.length, 2);
  assert.equal(
    overlay.zoneRoot.children.every(({ type }) => type === 'Mesh'),
    true
  );
  assert.ok(overlay.zoneRoot.children[0].geometry.getAttribute('position').count > 0);
  assert.equal(overlay.zoneRoot.children[0].material.depthWrite, false);
  const firstMarker = overlay.anchorRoot.children[0];
  const firstZone = overlay.zoneRoot.children[0];
  const temperatureColor = firstMarker.userData.accent.material.color.getHex();
  assert.equal(firstZone.material.color.getHex(), temperatureColor);
  assert.equal(firstMarker.type, 'Group');
  assert.equal(firstMarker.children[0].geometry.type, 'PlaneGeometry');

  const humidity = viewer.updateSpatialMeasurements([{ ...humidityAnchor, value: 80 }], 'humidity');
  assert.equal(humidity.count, 1);
  assert.equal(humidity.zoneCount, 1);
  assert.equal(overlay.anchorRoot.children[0], firstMarker);
  assert.equal(overlay.zoneRoot.children[0], firstZone);
  assert.notEqual(firstMarker.userData.accent.material.color.getHex(), temperatureColor);
  assert.equal(firstMarker.visible, true);
  assert.equal(viewer.activeSpatialMetric, 'humidity');

  const acoustic = viewer.updateSpatialMeasurements(
    [{ ...acousticAnchor, value: -32 }],
    'sound_rms_dbfs'
  );
  assert.equal(acoustic.count, 1);
  assert.equal(acoustic.zoneCount, 0);
  assert.equal(overlay.zoneRoot.children.filter(({ visible }) => visible).length, 0);
  assert.equal(SPATIAL_METRIC.sound_rms_dbfs.zones, false);
  assert.ok(renderCount() > 0);
});

test('measurement zones resolve registered points onto model geometry', () => {
  const model = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 1), new THREE.MeshBasicMaterial());
  model.updateMatrixWorld(true);
  const surface = closestModelSurface(model, new THREE.Vector3(0, 0, 0.5), 3);
  assert.ok(surface);
  assert.equal(Math.round(surface.position.z * 1000), 500);
  assert.equal(Math.round(surface.normal.z), 1);
  model.geometry.dispose();
  model.material.dispose();
});

test('acoustic and electrical layers group canonical metrics without zones', () => {
  const { viewer } = spatialViewerHarness();
  const acousticAnchor = {
    ...registeredAnchor,
    metric: 'sound_rms_dbfs',
    sensor_id: 'acoustic-rms',
    unit: 'dBFS',
  };
  const electricalAnchor = {
    ...registeredAnchor,
    metric: 'active_power_w',
    position: [0, -0.4, -0.5],
    sensor_id: 'electrical-power',
    unit: 'W',
  };
  viewer.setSpatialAnchors([acousticAnchor, electricalAnchor]);
  assert.equal(
    viewer.updateSpatialMeasurements([{ ...acousticAnchor, value: -31 }], 'acoustic').count,
    1
  );
  const electrical = viewer.updateSpatialMeasurements(
    [{ ...electricalAnchor, value: 840 }],
    'electrical'
  );
  assert.equal(electrical.count, 1);
  assert.equal(electrical.zoneCount, 0);
  assert.equal(SPATIAL_METRIC.acoustic.zones, false);
  assert.equal(SPATIAL_METRIC.electrical.zones, false);
});

test('acceptance sensor positions resolve to the top and front of the middle cabinet', () => {
  const model = new THREE.Group();
  for (const x of [-3, 0, 3]) {
    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2), new THREE.MeshBasicMaterial());
    cabinet.position.x = x;
    model.add(cabinet);
  }
  const surfaces = middleCabinetSurfaces(model);
  assert.deepEqual(
    surfaces.top.map((value) => Math.round(value)),
    [0, 2, 0]
  );
  assert.deepEqual(
    surfaces.front.map((value) => Math.round(value)),
    [0, 0, 1]
  );
  assert.deepEqual(
    surfaces.electrical.map((value) => Math.round(value * 10) / 10),
    [0, -0.5, -1]
  );
  assert.ok(surfaces.electrical[1] < surfaces.front[1]);

  const modelSize = new THREE.Vector3(8, 4, 2);
  const topSize = measurementZoneSize(new THREE.Vector3(0, 1, 0), modelSize);
  const frontSize = measurementZoneSize(new THREE.Vector3(0, 0, 1), modelSize);
  assert.equal(topSize.x, (modelSize.x / 3) * 0.85);
  assert.equal(topSize.y, modelSize.z * 0.76);
  assert.equal(frontSize.x, (modelSize.x / 3) * 0.78);
  assert.equal(frontSize.y, modelSize.y * 0.55);
});

test('registration picking requires a reference mesh intersection and returns model-local position', () => {
  const root = new THREE.Group();
  root.position.set(2, 0, 0);
  root.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial()));
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(2, 0, 5);
  camera.lookAt(2, 0, 0);
  camera.updateMatrixWorld(true);
  root.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();

  const position = modelLocalIntersection(raycaster, new THREE.Vector2(0, 0), camera, root);
  assert.deepEqual(
    position.map((value) => Math.round(value * 1000) / 1000),
    [0, 0, 1]
  );
  assert.equal(modelLocalIntersection(raycaster, new THREE.Vector2(0, 0), camera, null), null);
  assert.equal(modelLocalIntersection(raycaster, new THREE.Vector2(0.9, 0.9), camera, root), null);
});

test('cancelling registration removes only the unconfirmed preview', () => {
  const { viewer } = spatialViewerHarness();
  viewer.registrationEnabled = true;
  viewer.registrationPointerStart = new THREE.Vector2(1, 1);
  viewer.registrationPreview = new THREE.Mesh(
    new THREE.SphereGeometry(1),
    new THREE.MeshBasicMaterial()
  );
  viewer.registrationPreview.visible = true;

  viewer.setRegistrationMode(false);
  assert.equal(viewer.registrationEnabled, false);
  assert.equal(viewer.registrationPreview.visible, false);
  assert.equal(viewer.telemetryAnchors.size, 0);
});

test('spatial selection changes marker emphasis without copying canonical records', () => {
  const { overlay, viewer } = spatialViewerHarness();
  viewer.setSpatialAnchors([registeredAnchor]);
  const record = { ...registeredAnchor, metric: 'temperature', unit: 'degC', value: 24 };
  viewer.updateSpatialMeasurements([record], 'temperature');
  viewer.setSpatialSelection(record);
  assert.equal(overlay.anchorRoot.children[0].scale.x, 1.35);
  assert.equal(viewer.telemetryAnchors.get(spatialAnchorKey(record)).record, record);
  viewer.setSpatialSelection(null);
  assert.equal(overlay.anchorRoot.children[0].scale.x, 1);
});

test('temperature and humidity use deterministic visualization scales without alarm semantics', () => {
  assert.deepEqual(
    [9, 18, 22.5, 27, 36].map((value) => measurementColor('temperature', value).getHex()),
    [0x2b659c, 0x2e9bb2, 0x4d9b65, 0xd0aa3f, 0xc87332]
  );
  assert.deepEqual(
    [0, 25, 50, 75, 100].map((value) => measurementColor('humidity', value).getHex()),
    [0x28769a, 0x2e92a4, 0x459878, 0x83a04e, 0xbf923e]
  );
  assert.equal(measurementColor('temperature', -20).getHex(), 0x2b659c);
  assert.equal(measurementColor('temperature', 80).getHex(), 0xc87332);
  assert.equal(measurementColor('sound_rms_dbfs', -32), null);
  assert.equal(measurementScalePosition('temperature', 22.5), 50);
  assert.equal(measurementScalePosition('humidity', 50), 50);
  assert.equal(MEASUREMENT_SCALE.temperature.stops.length, 5);
});

test('model lifecycle uses the proxy only while GLB configuration is absent', async () => {
  const savedWindow = globalThis.window;
  const savedConsoleError = console.error;
  globalThis.window = { location: { href: baseUrl } };
  console.error = () => {};
  try {
    const unconfigured = viewerHarness({ loadAsync: () => assert.fail('loader called') });
    assert.equal(await unconfigured.viewer.loadModel({ url: '' }), false);
    assert.equal(unconfigured.viewer.modelRoot.geometry.type, 'BoxGeometry');
    assert.equal(unconfigured.states.at(-1).state, MODEL_STATE.UNCONFIGURED);
    assert.match(
      unconfigured.states.at(-1).message,
      /Reference geometry unavailable.*Non-physical/
    );
    unconfigured.viewer.removeModel();

    const proxyBeforeLoad = createFunctionalProxy();
    let proxyDisposed = false;
    proxyBeforeLoad.geometry.addEventListener('dispose', () => {
      proxyDisposed = true;
    });
    const loadedRoot = new THREE.Group();
    const sourceMaterial = new THREE.MeshStandardMaterial({ color: 0x121820 });
    const sourceMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), sourceMaterial);
    loadedRoot.add(sourceMesh);
    const configured = viewerHarness(
      { loadAsync: async () => ({ scene: loadedRoot }) },
      proxyBeforeLoad
    );
    assert.equal(await configured.viewer.loadModel({ url: '/assets/rack.glb' }), true);
    assert.equal(configured.viewer.modelRoot, loadedRoot);
    assert.equal(configured.states.at(-1).state, MODEL_STATE.READY);
    assert.equal(proxyDisposed, true);
    assert.equal(sourceMesh.material, sourceMaterial);

    const proxyBeforeFailure = createFunctionalProxy();
    const failed = viewerHarness(
      { loadAsync: async () => Promise.reject(new Error('missing local GLB')) },
      proxyBeforeFailure
    );
    assert.equal(await failed.viewer.loadModel({ url: '/assets/missing.glb' }), false);
    assert.equal(failed.viewer.modelRoot, null);
    assert.equal(failed.states.at(-1).state, MODEL_STATE.ERROR);
  } finally {
    globalThis.window = savedWindow;
    console.error = savedConsoleError;
  }
});

test('same-origin GLB configuration uses an identity transform by default', () => {
  assert.deepEqual(parseRackModelConfig({ url: '/assets/rack.glb' }, baseUrl), {
    url: 'https://dt.local/assets/rack.glb',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  });
});

test('model configuration rejects remote, active, credentialed, and unsupported URLs', () => {
  for (const url of [
    'https://external.invalid/rack.glb',
    'data:model/gltf-binary;base64,AA==',
    'javascript:alert(1)',
    'blob:https://dt.local/id',
    'https://user:secret@dt.local/rack.glb',
    '/assets/rack.gltf',
  ]) {
    assert.throws(() => parseRackModelConfig({ url }, baseUrl), /same-origin GLB/);
  }
});

test('model resource loading rejects cross-origin references', () => {
  assert.equal(
    resolveRackModelResourceUrl('/assets/rack-texture.png', baseUrl),
    'https://dt.local/assets/rack-texture.png'
  );
  assert.throws(
    () => resolveRackModelResourceUrl('https://external.invalid/texture.png', baseUrl),
    /same-origin/
  );
});

test('model transform accepts finite values and rejects degenerate scale', () => {
  assert.deepEqual(
    parseRackModelConfig(
      {
        url: 'rack.glb',
        position: [1, 2, 3],
        rotation: [0.1, 0.2, 0.3],
        scale: [2, 2, 2],
      },
      baseUrl
    ),
    {
      url: 'https://dt.local/viewer/rack.glb',
      position: [1, 2, 3],
      rotation: [0.1, 0.2, 0.3],
      scale: [2, 2, 2],
    }
  );
  assert.throws(
    () => parseRackModelConfig({ url: 'rack.glb', position: [0, NaN, 0] }, baseUrl),
    /position/
  );
  assert.throws(
    () => parseRackModelConfig({ url: 'rack.glb', scale: [1, 0, 1] }, baseUrl),
    /scale/
  );
});
