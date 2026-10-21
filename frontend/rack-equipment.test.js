import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createRackEquipment } from './rack-equipment.js';

const layout = Object.freeze({
  serverWidth: 0.439,
  serverHeight: 0.043,
  serverDepth: 0.576,
  serverPanelWidth: 0.4826,
  mountingPitch: 0.4651,
  serverLowerY: 0.70485,
  serverClearance: 9 * 0.04445 - 0.043,
  serverFrontZ: 0.35,
  monitorWidth: 0.365,
  monitorHeight: 0.305,
  monitorDepth: 0.045,
  monitorStandHeight: 0.07,
  monitorBaseDepth: 0.16,
  monitorBaseWidth: 0.225,
  keyboardWidth: 0.435,
  keyboardDepth: 0.145,
  keyboardHeight: 0.018,
  monitorZ: -0.05,
  keyboardZ: 0.255,
});

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
}

test('two distinct photographed chassis preserve manufacturer dimensions and surface clearance', () => {
  const root = createRackEquipment(layout);
  assert.equal(root.name, 'installed-equipment');
  assert.deepEqual(
    root.children.map(({ name }) => name),
    ['server-lower', 'server-upper', 'monitor', 'keyboard']
  );
  const lower = root.getObjectByName('server-lower');
  const upper = root.getObjectByName('server-upper');
  assert.notEqual(lower, upper);
  assert.equal(lower.getObjectByName('empty-drive-bay'), undefined);
  assert.ok(upper.getObjectByName('empty-drive-bay'));
  assert.deepEqual(lower.userData.photoEvidence, ['IMG_3528']);
  assert.ok(upper.userData.photoEvidence.includes('IMG_3527'));
  for (const object of [lower, upper]) {
    const body = new THREE.Box3().setFromObject(object.getObjectByName('chassis-body'));
    close(body.max.x - body.min.x, layout.serverWidth);
    close(body.max.y - body.min.y, layout.serverHeight);
    close(body.min.z, layout.serverFrontZ - layout.serverDepth);
    const front = new THREE.Box3().setFromObject(object.getObjectByName('front-fascia'));
    close(front.max.z, layout.serverFrontZ);
    const bounds = new THREE.Box3().setFromObject(object);
    close(bounds.max.x - bounds.min.x, layout.serverPanelWidth);
    assert.equal(object.userData.dimensionalAuthority, 'manufacturer_reference');
    assert.ok(object.getObjectByName('optical-drive').position.x < 0);
    assert.ok(object.getObjectByName('optical-drive').position.y < layout.serverHeight / 2);
    assert.ok(object.getObjectByName('usb-port').position.y > layout.serverHeight / 2);
    const screw = new THREE.Matrix4();
    object.getObjectByName('rack-screws').getMatrixAt(0, screw);
    close(new THREE.Vector3().setFromMatrixPosition(screw).x, -layout.mountingPitch / 2);
  }
  const lowerBounds = new THREE.Box3().setFromObject(lower);
  const upperBounds = new THREE.Box3().setFromObject(upper);
  close(upperBounds.min.y - lowerBounds.max.y, layout.serverClearance);
});

test('monitor and keyboard have physical support contact and do not intersect each other', () => {
  const root = createRackEquipment(layout);
  const upper = root.getObjectByName('server-upper');
  const support = new THREE.Box3().setFromObject(upper).max.y;
  const monitor = new THREE.Box3().setFromObject(root.getObjectByName('monitor'));
  const keyboard = new THREE.Box3().setFromObject(root.getObjectByName('keyboard'));
  close(monitor.min.y, support);
  close(keyboard.min.y, support);
  close(keyboard.max.y - keyboard.min.y, layout.keyboardHeight);
  assert.equal(monitor.intersectsBox(keyboard), false);
  const chassis = new THREE.Box3().setFromObject(upper);
  assert.ok(keyboard.max.z < chassis.max.z && keyboard.min.z > chassis.min.z);
  assert.ok(monitor.max.z < chassis.max.z && monitor.min.z > chassis.min.z);
  assert.equal(root.getObjectByName('monitor').userData.modelIdentified, false);
});

test('reference objects have no fabricated canonical asset or measurement state', () => {
  const root = createRackEquipment(layout);
  for (const object of [root, ...root.children]) assert.equal(object.userData.referenceOnly, true);
  root.traverse((object) => {
    for (const field of ['asset_id', 'sensor_id', 'device_id', 'status', 'online', 'value'])
      assert.equal(object.userData[field], undefined);
    if (object.isMesh) {
      assert.equal(object.userData.preserveSurface, true);
      assert.equal(object.material.emissive.getHex(), 0);
      assert.equal(object.material.map, null);
    }
  });
});

test('repeated apertures, mounting screws and keycaps are bounded instanced geometry', () => {
  const root = createRackEquipment(layout);
  const geometries = new Set();
  const materials = new Set();
  let meshes = 0;
  let instances = 0;
  root.traverse((object) => {
    if (!object.isMesh) return;
    meshes++;
    geometries.add(object.geometry);
    materials.add(object.material);
    assert.ok(Array.from(object.geometry.attributes.position.array).every(Number.isFinite));
    if (object.isInstancedMesh) {
      instances++;
      assert.ok(object.count > 0 && object.count < 150);
      assert.ok(Array.from(object.instanceMatrix.array).every(Number.isFinite));
    }
  });
  assert.equal(root.getObjectByName('keyboard').getObjectByName('keycaps').isInstancedMesh, true);
  assert.equal(instances, 5);
  assert.ok(meshes < 50);
  assert.ok(geometries.size < 50);
  assert.equal(materials.size, 7);
});

test('caller-owned dimensions and locations can change without changing source geometry constants', () => {
  const customized = { ...layout, serverLowerY: 0.6, serverClearance: 0.32, monitorWidth: 0.38 };
  const root = createRackEquipment(customized);
  close(root.getObjectByName('server-lower').position.y, 0.6);
  close(root.getObjectByName('server-upper').position.y, 0.963);
  close(
    new THREE.Box3().setFromObject(root.getObjectByName('monitor')).getSize(new THREE.Vector3()).x,
    0.38
  );
  assert.throws(() => createRackEquipment({ ...layout, serverClearance: -0.1 }), /clearance/);
  assert.throws(() => createRackEquipment({ ...layout, monitorZ: NaN }), /finite/);
  assert.throws(() => createRackEquipment({ ...layout, serverWidth: 0 }), /finite/);
});
