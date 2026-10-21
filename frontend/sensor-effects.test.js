import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { createRackModel, rackSourcePlacements, setRackInspection } from './rack-model.js';
import { RackViewer, measurementColor, modelLocalIntersection } from './rack-viewer.js';
import {
  createSensorEffects,
  updateSensorEffects,
  stepSensorEffects,
  VISUAL_INFLUENCE_RADIUS_M,
} from './sensor-effects.js';

const now = Date.parse('2026-10-16T06:00:00Z');
const sources = [
  ['sht31-a', 'sht31-a-temperature', 'temperature', 'degC', 34.0764465],
  ['sht31-a', 'sht31-a-humidity', 'humidity', 'percent_rh', 40.1],
  ['sht31-b', 'sht31-b-temperature', 'temperature', 'degC', 26.5],
  ['sht31-b', 'sht31-b-humidity', 'humidity', 'percent_rh', 41.2],
  ['rack-acoustic', 'rack-sound-rms', 'sound_rms_dbfs', 'dBFS', -60.4],
  ['rack-acoustic', 'rack-sound-peak', 'sound_peak_dbfs', 'dBFS', -42.3],
].map(([asset_id, sensor_id, metric, unit, value]) => ({
  asset_id,
  sensor_id,
  metric,
  unit,
  value,
  device_id: 'rack-controller',
  quality: 'good',
  source_status: 'unknown',
  source_ts: new Date(now).toISOString(),
  received_at: new Date(now).toISOString(),
}));

function setup() {
  const model = createRackModel();
  const anchors = rackSourcePlacements(sources);
  const entries = new Map(
    anchors.map((anchor) => [
      JSON.stringify([anchor.asset_id, anchor.sensor_id]),
      {
        anchor,
        record: { ...sources.find((source) => source.sensor_id === anchor.sensor_id) },
      },
    ])
  );
  const effects = createSensorEffects(model, anchors);
  return { model, anchors, entries, effects };
}

function update(effects, entries, metric = 'temperature', overrides = {}) {
  return updateSensorEffects(
    effects,
    entries,
    metric,
    {
      active: true,
      sensors: true,
      zones: true,
      airflow: true,
      soundWaves: true,
      reducedMotion: false,
      now,
      ...overrides,
    },
    measurementColor
  );
}

test('Layers contains six controls and no standalone Inspection or Surface button', async () => {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const toolbar = html.slice(
    html.indexOf('class="viewport-tools"'),
    html.indexOf('id="sensor-effect-state"')
  );
  for (const name of ['Assets', 'Sensors', 'Hide Covers', 'Surface', 'Airflow', 'Sound Waves'])
    assert.match(toolbar, new RegExp(`<span\\s*>\\s*${name}\\s*</span\\s*>`));
  assert.doesNotMatch(toolbar, /<button|>Inspection</);
  assert.match(toolbar, /<details class="layer-control">/);
  const legend = html.slice(
    html.indexOf('id="measurement-legend"'),
    html.indexOf('data-measurement-legend="humidity"')
  );
  assert.match(legend, /id="legend-metric">TEMP</);
  for (const value of [10, 18, 27, 35, 40])
    assert.match(legend, new RegExp(`data-scale-value="${value}"`));
  assert.match(legend, /not a compliance assessment/);
  const main = await readFile(new URL('./main.js', import.meta.url), 'utf8');
  assert.equal((main.match(/layerControl\.addEventListener\('change'/g) ?? []).length, 1);
  assert.doesNotMatch(main, /new EventSource|changeRackInspection|activeSurfaceMode/);
  assert.match(main, /event.key !== 'Escape'/);
  assert.match(main, /!layerControl.contains\(event.target\)/);
});

test('two independent point fields preserve real values, anchors, shared color mapping and illustrative radius', () => {
  const { entries, effects, anchors } = setup();
  const original = JSON.stringify([...entries.values()]);
  assert.equal(update(effects, entries), true);
  assert.equal(VISUAL_INFLUENCE_RADIUS_M, 0.3);
  assert.equal(effects.fields.length, 2);
  for (const field of effects.fields) {
    assert.equal(field.group.visible, true);
    assert.equal(field.group.userData.visualInfluenceRadiusM, 0.3);
    assert.equal(field.group.userData.positionVerified, false);
    assert.deepEqual(
      field.group.position.toArray(),
      anchors.find((anchor) => JSON.stringify([anchor.asset_id, anchor.sensor_id]) === field.key)
        .position
    );
    assert.equal(
      field.material.color.getHex(),
      measurementColor('temperature', field.record.value).getHex()
    );
    assert.equal(field.material.depthWrite, false);
    assert.ok(field.material.opacity < 0.3);
    assert.equal(field.group.children.length, 3);
  }
  assert.notEqual(
    effects.fields[0].material.color.getHex(),
    effects.fields[1].material.color.getHex()
  );
  assert.equal(JSON.stringify([...entries.values()]), original);
  assert.equal(
    new THREE.Raycaster(
      new THREE.Vector3(0, 1.016, 2),
      new THREE.Vector3(0, 0, -1)
    ).intersectObject(effects.root, true).length,
    0
  );
  const alpha = effects.fields[0].material.map.image.data;
  assert.equal(alpha[3], 0);
  assert.ok(alpha[(32 * 64 + 32) * 4 + 3] > 240);
});

test('upward motion uses bounded reusable buffers and avoids server and monitor bounding boxes', () => {
  const { model, effects, entries } = setup();
  update(effects, entries);
  const attribute = effects.airflow.geometry.attributes.position;
  const buffer = attribute.array;
  const before = Array.from(buffer);
  assert.equal(stepSensorEffects(effects, 0.1, now + 100), true);
  assert.equal(attribute.array, buffer);
  assert.equal(attribute.count, 24);
  const solids = ['server-lower', 'server-upper', 'monitor'].map((name) =>
    new THREE.Box3().setFromObject(model.getObjectByName(name))
  );
  for (let index = 0; index < attribute.count; index++) {
    assert.ok(attribute.getY(index) > before[index * 3 + 1]);
    const point = new THREE.Vector3().fromBufferAttribute(attribute, index);
    for (const solid of solids) assert.equal(solid.containsPoint(point), false);
  }
  assert.equal(effects.airflow.userData.direction, 'upward_illustrative');
  assert.equal(effects.airflow.userData.velocity, undefined);
});

test('offline, stale, delayed, invalid and absent observations never sustain a live effect', () => {
  for (const modification of [
    { source_status: 'offline' },
    { source_status: 'stale' },
    { quality: 'invalid' },
    { quality: 'unknown' },
    { value: NaN },
    { source_ts: 'invalid' },
    { received_at: 'invalid' },
    { source_ts: new Date(now - 11_000).toISOString() },
  ]) {
    const { effects, entries } = setup();
    for (const entry of entries.values()) Object.assign(entry.record, modification);
    assert.equal(update(effects, entries), false);
    assert.ok(effects.fields.every((field) => !field.group.visible));
    assert.equal(effects.airflow.visible, false);
    assert.equal(update(effects, entries, 'acoustic'), false);
    assert.ok(effects.sounds.every((sound) => !sound.group.visible));
  }
  const { effects, entries } = setup();
  update(effects, entries);
  assert.equal(stepSensorEffects(effects, 0.1, now + 31_000), false);
  assert.equal(effects.activeCount, 0);
  assert.equal(update(effects, new Map()), false);
});

test('acoustic rings use current RMS or peak in dBFS, never temperature fields or inferred sound pressure', () => {
  const { effects, entries } = setup();
  assert.equal(update(effects, entries, 'acoustic'), true);
  const sound = effects.sounds[0];
  assert.equal(sound.record.unit, 'dBFS');
  assert.equal(sound.group.visible, true);
  assert.equal(sound.group.children.length, 3);
  assert.equal(effects.airflow.visible, false);
  assert.ok(effects.fields.every((field) => !field.group.visible));
  const quietOpacity = sound.group.children[0].material.opacity;
  sound.record.value = -10;
  update(effects, entries, 'acoustic');
  assert.ok(sound.group.children[0].material.opacity > quietOpacity);
  sound.record.source_status = 'offline';
  assert.equal(update(effects, entries, 'acoustic'), true);
  sound.peak.source_status = 'offline';
  assert.equal(update(effects, entries, 'acoustic'), false);
  for (const ring of sound.group.children) assert.ok(ring.scale.x <= 0.155);
});

test('effect switches, reduced motion and workspace visibility preserve objects without residual effects', () => {
  const { effects, entries } = setup();
  const children = effects.root.children.slice();
  for (let i = 0; i < 20; i++) {
    assert.equal(update(effects, entries, 'temperature', { airflow: false }), false);
    assert.equal(effects.airflow.visible, false);
    assert.ok(effects.fields.every((field) => field.group.visible));
    assert.equal(update(effects, entries, 'acoustic', { soundWaves: false }), false);
    for (const metric of ['humidity', 'electrical', 'telecommunications']) {
      assert.equal(update(effects, entries, metric), false);
      assert.ok(effects.fields.every((field) => !field.group.visible));
      assert.ok(effects.sounds.every((sound) => !sound.group.visible));
    }
  }
  assert.deepEqual(effects.root.children, children);
  assert.equal(update(effects, entries, 'temperature', { reducedMotion: true }), false);
  const phase = effects.phase;
  assert.equal(stepSensorEffects(effects, 0.5, now + 100), false);
  assert.equal(effects.phase, phase);
  assert.equal(update(effects, entries, 'temperature', { active: false }), false);
  assert.equal(effects.root.visible, false);
  assert.equal(update(effects, entries, 'temperature', { sensors: false }), false);
  assert.equal(effects.root.visible, false);
});

test('Hide Covers excludes covers from picking and survives asset toggles without recreating geometry', () => {
  const { model } = setup();
  const viewer = Object.create(RackViewer.prototype);
  Object.assign(viewer, {
    modelRoot: model,
    layerVisibility: { geometry: true, anchors: true, zones: true },
    telemetryAnchorRoot: new THREE.Group(),
    measurementZoneRoot: new THREE.Group(),
    requestRender() {},
  });
  const server = model.getObjectByName('server-upper');
  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 10);
  camera.position.set(0, 1.1264, 2);
  camera.lookAt(0, 1.1264, 0);
  camera.updateMatrixWorld(true);
  setRackInspection(model, false);
  const closed = modelLocalIntersection(new THREE.Raycaster(), new THREE.Vector2(), camera, model);
  setRackInspection(model, true);
  const opened = modelLocalIntersection(new THREE.Raycaster(), new THREE.Vector2(), camera, model);
  assert.ok(closed[2] > opened[2]);
  assert.ok(Math.abs(opened[2] - 0.35) < 0.005);
  viewer.setLayerVisibility('geometry', false);
  viewer.setLayerVisibility('geometry', true);
  for (const name of ['front-door', 'left-panel', 'right-panel', 'rear-door', 'roof', 'bottom'])
    assert.equal(model.getObjectByName(name).visible, false);
  assert.equal(model.getObjectByName('server-upper'), server);
});

test('viewer disposal releases shared effect geometry, materials and textures exactly once', () => {
  const { model, effects } = setup();
  const resources = new Set();
  for (const root of [model, effects.root])
    root.traverse((object) => {
      if (object.geometry) resources.add(object.geometry);
      if (object.material) {
        resources.add(object.material);
        if (object.material.map) resources.add(object.material.map);
      }
    });
  const counts = new Map();
  for (const resource of resources)
    resource.addEventListener('dispose', () =>
      counts.set(resource, (counts.get(resource) ?? 0) + 1)
    );
  const zone = new THREE.Group();
  zone.add(effects.root);
  const scene = new THREE.Scene();
  scene.add(model);
  const viewer = Object.create(RackViewer.prototype);
  Object.assign(viewer, {
    modelRoot: model,
    sensorEffects: effects,
    measurementZoneRoot: zone,
    scene,
    contrastMaterials: new Map(),
    requestRender() {},
  });
  viewer.removeModel();
  assert.equal(viewer.sensorEffects, null);
  assert.equal(zone.children.length, 0);
  assert.equal(counts.size, resources.size);
  assert.ok([...counts.values()].every((count) => count === 1));
});
