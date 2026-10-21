import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  RACK_LAYOUT,
  createRackModel,
  rackModulePositions,
  rackSourcePlacements,
  setRackInspection,
} from './rack-model.js';

const sources = [
  ['sht31-a', 'sht31-a-temperature', 'temperature', 'degC'],
  ['sht31-a', 'sht31-a-humidity', 'humidity', 'percent_rh'],
  ['sht31-b', 'sht31-b-temperature', 'temperature', 'degC'],
  ['sht31-b', 'sht31-b-humidity', 'humidity', 'percent_rh'],
  ['rack-acoustic', 'rack-sound-rms', 'sound_rms_dbfs', 'dBFS'],
  ['rack-acoustic', 'rack-sound-peak', 'sound_peak_dbfs', 'dBFS'],
].map(([asset_id, sensor_id, metric, unit]) => ({
  asset_id,
  sensor_id,
  metric,
  unit,
  device_id: 'rack-controller',
}));

test('one 42U cabinet has meter-based bounds and separate evidenced components', () => {
  const rack = createRackModel();
  const bounds = new THREE.Box3().setFromObject(rack);
  for (const [actual, expected] of [
    [bounds.min.x, -0.3],
    [bounds.max.x, 0.3],
    [bounds.min.y, 0],
    [bounds.max.y, 2.032],
    [bounds.min.z, -0.45],
    [bounds.max.z, 0.45],
  ])
    assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);
  assert.equal(rack.name, 'laboratory-rack');
  assert.equal(
    rack.getObjectByName('frame').children.filter(({ name }) => name === 'corner-post').length,
    4
  );
  assert.equal(rack.getObjectByName('mounting-rails').children.length, 4);
  assert.equal(rack.getObjectByName('equipment-shelves').children.length, 2);
  const shelfY = rack
    .getObjectByName('equipment-shelves')
    .children.map((shelf) => shelf.getObjectByName('tray-base').position.y);
  assert.ok(Math.abs(shelfY[1] - shelfY[0] - 9 * RACK_LAYOUT.rackUnit) < 1e-10);
  for (const panel of ['left-panel', 'right-panel', 'rear-door', 'roof', 'bottom']) {
    const group = rack.getObjectByName(panel);
    assert.ok(group);
    group.traverse((object) => {
      if (object.isMesh) assert.equal(object.material.transparent, false);
    });
  }
  const glass = rack.getObjectByName('tempered-glass');
  assert.equal(glass.material.type, 'MeshPhysicalMaterial');
  assert.equal(glass.material.transparent, true);
  assert.ok(glass.position.z > 0);
  assert.ok(rack.getObjectByName('swing-handle'));
  assert.equal(rack.getObjectByName('sensors').children.length, 3);
  assert.equal(rack.getObjectByName('esp32-s3').userData.dimensionsMeasured, false);
  assert.equal(rack.getObjectByName('sensor-cables').children.length, 3);
  assert.deepEqual(rack.getObjectByName('sht31-a-cable').userData.gpio, [8, 9]);
  assert.deepEqual(rack.getObjectByName('sht31-b-cable').userData.gpio, [10, 11]);
  assert.deepEqual(rack.getObjectByName('inmp441-cable').userData.gpio, [4, 5, 6]);
});

test('only the two visible roof fans are referenced without claiming an installed total or operation', () => {
  const rack = createRackModel();
  const fans = rack.getObjectByName('roof-fans').children;
  assert.equal(fans.length, 2);
  assert.ok(
    fans.every(
      (fan) =>
        fan.userData.registration_state === 'installation_reference' &&
        fan.userData.positionMeasured === false
    )
  );
  assert.deepEqual([...new Set(fans.map(({ position }) => position.z))], [-0.15]);
  assert.deepEqual([...new Set(fans.map(({ position }) => position.x))], [-0.13, 0.13]);
  assert.deepEqual(rack.userData.fanConfiguration, {
    installedCount: null,
    visiblePhotoCount: 2,
    operatingState: null,
  });
});

test('six production sources bind to three unmeasured internal module positions', () => {
  const placements = rackSourcePlacements(sources);
  assert.equal(placements.length, 6);
  assert.equal(new Set(placements.map(({ module_id }) => module_id)).size, 3);
  for (const moduleId of ['sht31-a', 'sht31-b', 'inmp441']) {
    const pair = placements.filter(({ module_id }) => module_id === moduleId);
    assert.equal(pair.length, 2);
    assert.deepEqual(pair[0].position, pair[1].position);
  }
  const positions = rackModulePositions();
  assert.deepEqual(positions['sht31-b'], [0, 1.016, 0]);
  assert.ok(positions['sht31-a'][1] > 1.8 && positions['sht31-a'][1] < 2.032);
  assert.ok(positions.inmp441[1] < positions['sht31-a'][1]);
  for (const placement of placements) {
    const [x, y, z] = placement.position;
    assert.ok(Math.abs(x) < 0.3 && y > 0 && y < 2.032 && Math.abs(z) < 0.45);
    assert.equal(placement.registration_state, 'installation_reference');
    assert.equal(placement.position_verified, false);
    assert.equal(placement.position_version, null);
  }
  assert.equal(createRackModel().userData.reportedSensorSeparationM, 1.2);
  assert.ok(positions['sht31-a'][1] - positions['sht31-b'][1] < 1.016);
  assert.deepEqual(
    rackSourcePlacements(
      sources.map((source) => ({ ...source, device_id: 'acceptance-controller' }))
    ),
    []
  );
  assert.deepEqual(
    rackSourcePlacements(
      sources.map((source) => ({ ...source, sensor_id: `acceptance-${source.sensor_id}` }))
    ),
    []
  );
  assert.deepEqual(
    rackSourcePlacements(sources.map((source) => ({ ...source, asset_id: 'acceptance-context' }))),
    []
  );
  assert.deepEqual(
    rackSourcePlacements(sources.map((source) => ({ ...source, unit: 'invalid' }))),
    []
  );
});

test('unmeasured placement, tray clearance and fan dimensions remain configurable within the cabinet', () => {
  const rack = createRackModel({
    sensorAY: 1.85,
    sensorBY: 1.05,
    microphoneY: 0.95,
    serverLowerY: 0.7,
    serverClearance: 0.32,
    fanDiameter: 0.1,
  });
  assert.equal(rack.getObjectByName('sht31-a').position.y, 1.85);
  assert.equal(rack.getObjectByName('sht31-b').position.y, 1.05);
  assert.equal(rack.getObjectByName('inmp441').position.y, 0.95);
  assert.equal(rack.userData.rackLayout.fanDiameter, 0.1);
  assert.throws(() => createRackModel({ sensorAY: 2.1 }), /inside/);
  assert.throws(() => createRackModel({ serverClearance: NaN }), /Invalid/);
  assert.throws(() => createRackModel({ fanDiameter: 0.4 }), /inside/);
});

test('reference spacing is measured between world chassis surfaces, not object centers', () => {
  const rack = createRackModel();
  const lower = new THREE.Box3().setFromObject(rack.getObjectByName('server-lower'));
  const upper = new THREE.Box3().setFromObject(rack.getObjectByName('server-upper'));
  assert.ok(Math.abs(upper.min.y - lower.max.y - 0.35705) < 1e-7);
  assert.equal(rack.userData.dimensionEvidence.serverClearanceMeasured, false);
  assert.equal(rack.getObjectByName('installed-equipment').children.length, 4);
  const cabinet = new THREE.Box3(
    new THREE.Vector3(-0.3, 0, -0.45),
    new THREE.Vector3(0.3, 2.032, 0.45)
  );
  for (const name of ['server-lower', 'server-upper', 'monitor', 'keyboard'])
    assert.ok(cabinet.containsBox(new THREE.Box3().setFromObject(rack.getObjectByName(name))));
  for (const [name, chassis] of [
    ['lower-server-support', lower],
    ['upper-server-support', upper],
  ]) {
    const support = new THREE.Box3().setFromObject(
      rack.getObjectByName(name).getObjectByName('tray-base')
    );
    assert.ok(Math.abs(support.max.y - chassis.min.y) < 1e-7);
  }
  const rails = rack.getObjectByName('mounting-rails').children;
  assert.ok(
    Math.abs(rails[2].position.x - rails[0].position.x - RACK_LAYOUT.mountingPitch) < 1e-10
  );
  assert.equal(
    rack.getObjectByName('front-door').children.filter(({ name }) => name === 'hinge').length,
    3
  );
  assert.equal(rack.getObjectByName('equipment-cables').userData.endpointsVerified, false);
  for (const name of ['lower-server-support', 'upper-server-support']) {
    const tray = rack.getObjectByName(name);
    const bounds = new THREE.Box3()
      .setFromObject(tray.getObjectByName('tray-base'))
      .expandByScalar(1e-7);
    for (const slide of tray.children.filter(({ name }) => name === 'slide-rail'))
      assert.ok(bounds.intersectsBox(new THREE.Box3().setFromObject(slide)));
  }
  const brackets = rack
    .getObjectByName('cabinet-crossmembers')
    .children.filter(({ name }) => name === 'rail-fastening-bracket');
  assert.equal(brackets.length, 12);
  for (const bracket of brackets) {
    const bounds = new THREE.Box3().setFromObject(bracket);
    assert.ok(rails.some((rail) => bounds.intersectsBox(new THREE.Box3().setFromObject(rail))));
  }
});

test('inspection opens panels without duplicating geometry or changing reference coordinates', () => {
  const rack = createRackModel();
  const front = rack.getObjectByName('front-door');
  const positions = rack
    .getObjectByName('sensors')
    .children.map(({ position }) => position.toArray());
  setRackInspection(rack, true);
  assert.equal(front.visible, false);
  assert.equal(rack.getObjectByName('right-panel').visible, false);
  assert.equal(rack.getObjectByName('roof').visible, false);
  assert.equal(rack.getObjectByName('rear-door').visible, false);
  assert.equal(rack.getObjectByName('left-panel').visible, false);
  assert.equal(rack.getObjectByName('bottom').visible, false);
  for (const name of [
    'frame',
    'mounting-rails',
    'installed-equipment',
    'equipment-shelves',
    'roof-fans',
    'sensors',
    'sensor-cables',
  ])
    assert.equal(rack.getObjectByName(name).visible, true);
  setRackInspection(rack, false);
  assert.equal(front.visible, true);
  assert.equal(rack.getObjectByName('right-panel').visible, true);
  assert.equal(rack.getObjectByName('roof').visible, true);
  assert.equal(rack.getObjectByName('rear-door').visible, true);
  assert.equal(rack.getObjectByName('left-panel').visible, true);
  assert.equal(rack.getObjectByName('bottom').visible, true);
  assert.deepEqual(
    rack.getObjectByName('sensors').children.map(({ position }) => position.toArray()),
    positions
  );
});
