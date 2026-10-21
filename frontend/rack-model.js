import * as THREE from 'three';
import { createRackEquipment } from './rack-equipment.js';

export const RACK_LAYOUT = Object.freeze({
  width: 0.6,
  height: 2.032,
  depth: 0.9,
  rackUnit: 0.04445,
  mountingPitch: 0.4651,
  frontRailZ: 0.34,
  rearRailZ: -0.3,
  serverWidth: 0.439,
  serverHeight: 0.043,
  serverDepth: 0.576,
  serverPanelWidth: 0.4826,
  serverLowerY: (2.032 - 42 * 0.04445) / 2 + 14 * 0.04445,
  serverClearance: 9 * 0.04445 - 0.043,
  serverFrontZ: 0.35,
  monitorWidth: 0.365,
  monitorHeight: 0.305,
  monitorDepth: 0.045,
  monitorStandHeight: 0.07,
  monitorBaseDepth: 0.16,
  monitorBaseWidth: 0.225,
  monitorZ: -0.05,
  keyboardWidth: 0.435,
  keyboardDepth: 0.145,
  keyboardHeight: 0.018,
  keyboardZ: 0.255,
  shelfThickness: 0.004,
  fanDiameter: 0.12,
  fanColumnSpacing: 0.26,
  fanRowSpacing: 0.3,
  sensorAY: 1.892,
  sensorBY: 1.016,
  microphoneY: 0.98,
  controllerY: 1.4,
  sensorBoardWidth: 0.034,
  sensorBoardHeight: 0.028,
  controllerBoardWidth: 0.03,
  controllerBoardHeight: 0.065,
});

const MODULE_SOURCES = Object.freeze({
  'sht31-a': [
    ['sht31-a-temperature', 'temperature', 'degC'],
    ['sht31-a-humidity', 'humidity', 'percent_rh'],
  ],
  'sht31-b': [
    ['sht31-b-temperature', 'temperature', 'degC'],
    ['sht31-b-humidity', 'humidity', 'percent_rh'],
  ],
  inmp441: [
    ['rack-sound-rms', 'sound_rms_dbfs', 'dBFS'],
    ['rack-sound-peak', 'sound_peak_dbfs', 'dBFS'],
  ],
});

export function rackLayout(configuration = {}) {
  const layout = { ...RACK_LAYOUT, ...configuration };
  for (const [key, value] of Object.entries(layout)) {
    if (!Number.isFinite(value) || (!key.endsWith('Z') && value <= 0))
      throw new TypeError(`Invalid rack ${key}.`);
  }
  if (
    layout.width < 0.55 ||
    layout.depth < 0.6 ||
    layout.height < 1.9 ||
    layout.fanDiameter >= layout.fanColumnSpacing ||
    layout.fanDiameter >= layout.fanRowSpacing ||
    layout.fanColumnSpacing + layout.fanDiameter >= layout.width - 0.08 ||
    layout.fanRowSpacing + layout.fanDiameter >= layout.depth - 0.08 ||
    layout.serverWidth >= layout.mountingPitch - 0.02 ||
    layout.serverPanelWidth >= layout.width - 0.08 ||
    layout.serverLowerY +
      layout.serverClearance +
      layout.serverHeight * 2 +
      layout.monitorStandHeight +
      layout.monitorHeight >=
      layout.height - 0.08 ||
    layout.serverFrontZ >= layout.depth / 2 - 0.04 ||
    layout.serverFrontZ - layout.serverDepth <= -layout.depth / 2 + 0.04 ||
    layout.frontRailZ <= layout.rearRailZ ||
    Math.max(Math.abs(layout.frontRailZ), Math.abs(layout.rearRailZ)) >= layout.depth / 2 - 0.04 ||
    layout.serverLowerY - layout.shelfThickness < 0.08 ||
    layout.monitorWidth > layout.serverWidth ||
    layout.keyboardWidth > layout.serverWidth ||
    layout.monitorZ + layout.monitorBaseDepth / 2 >= layout.keyboardZ - layout.keyboardDepth / 2 ||
    Math.min(
      layout.monitorZ - layout.monitorBaseDepth / 2,
      layout.keyboardZ - layout.keyboardDepth / 2
    ) <
      layout.serverFrontZ - layout.serverDepth ||
    Math.max(
      layout.monitorZ + layout.monitorBaseDepth / 2,
      layout.keyboardZ + layout.keyboardDepth / 2
    ) > layout.serverFrontZ ||
    [layout.sensorAY, layout.sensorBY, layout.microphoneY, layout.controllerY].some(
      (height) => height < 0.08 || height > layout.height - 0.08
    )
  )
    throw new RangeError('Rack components must fit inside the cabinet.');
  return layout;
}

export function rackModulePositions(configuration = {}) {
  const layout = rackLayout(configuration);
  return {
    'sht31-a': [0, layout.sensorAY, 0],
    'sht31-b': [0, layout.sensorBY, 0],
    inmp441: [0.12, layout.microphoneY, 0.02],
    'esp32-s3': [0.17, layout.controllerY, -0.2],
  };
}

export function rackSourcePlacements(sources, configuration = {}) {
  const positions = rackModulePositions(configuration);
  const placements = [];
  for (const [moduleId, bindings] of Object.entries(MODULE_SOURCES)) {
    for (const [sensorId, metric, unit] of bindings) {
      const assetId = moduleId === 'inmp441' ? 'rack-acoustic' : moduleId;
      const source = sources.find(
        (source) =>
          source.device_id === 'rack-controller' &&
          source.sensor_id === sensorId &&
          source.asset_id === assetId &&
          source.metric === metric &&
          source.unit === unit
      );
      if (!source) continue;
      placements.push({
        asset_id: assetId,
        sensor_id: sensorId,
        metric,
        unit,
        module_id: moduleId,
        coordinate_system_id: 'rack-model-local',
        position: [...positions[moduleId]],
        position_verified: false,
        position_version: null,
        registration_state: 'installation_reference',
      });
    }
  }
  return placements;
}

function component(parent, name) {
  const group = new THREE.Group();
  group.name = name;
  parent.add(group);
  return group;
}

function box(parent, name, dimensions, position, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...dimensions), material);
  mesh.name = name;
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function sheet(parent, name, width, height, thickness, holes, material) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -height / 2);
  shape.lineTo(width / 2, -height / 2);
  shape.lineTo(width / 2, height / 2);
  shape.lineTo(-width / 2, height / 2);
  shape.closePath();
  shape.holes.push(...holes);
  const mesh = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 16 }),
    material
  );
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

function roundHole(x, y, radius) {
  const path = new THREE.Path();
  path.absellipse(x, y, radius, radius, 0, Math.PI * 2, true);
  return path;
}

function squareHole(x, y, side) {
  const path = new THREE.Path();
  path.moveTo(x - side / 2, y - side / 2);
  path.lineTo(x - side / 2, y + side / 2);
  path.lineTo(x + side / 2, y + side / 2);
  path.lineTo(x + side / 2, y - side / 2);
  path.closePath();
  return path;
}

function cabinetInterior(root, layout, metal, railMaterial) {
  const { width, height, depth } = layout;
  const rails = component(root, 'mounting-rails');
  const railHeight = 42 * layout.rackUnit;
  for (const x of [-layout.mountingPitch / 2, layout.mountingPitch / 2]) {
    for (const z of [layout.rearRailZ, layout.frontRailZ]) {
      const holes = Array.from({ length: 42 }, (_, index) =>
        [0.00635, 0.022225, 0.0381].map((offset) =>
          squareHole(0, index * layout.rackUnit + offset - railHeight / 2, 0.009)
        )
      ).flat();
      const rail = sheet(rails, 'perforated-mounting-rail', 0.022, railHeight, 0.003, holes, metal);
      rail.position.set(x, height / 2, z);
      box(
        rail,
        'rail-return',
        [0.003, railHeight, 0.035],
        [Math.sign(x) * 0.012, 0, -0.016],
        metal
      );
    }
  }
  const supports = component(root, 'cabinet-crossmembers');
  const upperBottom = layout.serverLowerY + layout.serverHeight + layout.serverClearance;
  for (const y of [0.1, height - 0.1, upperBottom - 0.15]) {
    for (const x of [-width / 2 + 0.028, width / 2 - 0.028]) {
      const member = sheet(
        supports,
        'perforated-depth-brace',
        depth - 0.1,
        0.036,
        0.003,
        Array.from({ length: 28 }, (_, i) => roundHole((i - 13.5) * 0.025, 0, 0.003)),
        railMaterial
      );
      member.rotation.y = Math.PI / 2;
      member.position.set(x, y, 0);
      box(supports, 'brace-flange', [0.016, 0.003, depth - 0.1], [x, y - 0.018, 0], railMaterial);
      for (const z of [layout.rearRailZ, layout.frontRailZ])
        box(
          supports,
          'rail-fastening-bracket',
          [Math.abs(x) - layout.mountingPitch / 2 + 0.022, 0.004, 0.035],
          [(x + (Math.sign(x) * layout.mountingPitch) / 2) / 2, y, z],
          railMaterial
        );
    }
  }
  const shelves = component(root, 'equipment-shelves');
  for (const [index, y] of [layout.serverLowerY, upperBottom].entries()) {
    const tray = component(shelves, index === 0 ? 'lower-server-support' : 'upper-server-support');
    tray.userData.referenceOnly = true;
    box(
      tray,
      'tray-base',
      [layout.mountingPitch, layout.shelfThickness, layout.serverDepth],
      [0, y - layout.shelfThickness / 2, layout.serverFrontZ - layout.serverDepth / 2],
      metal
    );
    for (const x of [-layout.mountingPitch / 2, layout.mountingPitch / 2]) {
      box(
        tray,
        'slide-rail',
        [0.012, 0.018, layout.frontRailZ - layout.rearRailZ],
        [x, y + 0.009, (layout.frontRailZ + layout.rearRailZ) / 2],
        railMaterial
      );
    }
  }
}

function referenceCables(root, layout) {
  const cables = component(root, 'equipment-cables');
  cables.userData.referenceOnly = true;
  cables.userData.endpointsVerified = false;
  cables.userData.photoEvidence = ['IMG_3519', 'IMG_3520', 'IMG_3526'];
  const upperTop = layout.serverLowerY + layout.serverClearance + 2 * layout.serverHeight;
  const routes = [
    {
      name: 'blue-cable-visible-section',
      color: 0x477d98,
      points: [
        [-0.19, upperTop + 0.02, -0.15],
        [-0.24, upperTop - 0.08, 0.1],
        [-0.25, 0.5, 0.26],
        [-0.24, 0.11, 0.3],
      ],
    },
    {
      name: 'black-cable-slack',
      color: 0x252829,
      points: [
        [0.13, upperTop + 0.03, -0.14],
        [0.17, 0.72, -0.18],
        [0.08, 0.34, -0.22],
        [-0.08, 0.17, -0.24],
      ],
    },
  ];
  for (const { name, color, points } of routes) {
    const cable = new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point))),
        32,
        0.002,
        5,
        false
      ),
      new THREE.MeshStandardMaterial({ color, roughness: 0.85 })
    );
    cable.name = name;
    cable.userData.referenceOnly = true;
    cables.add(cable);
  }
}

function sensorModule(parent, id, position, pcb, neutral, layout) {
  const module = component(parent, id);
  module.position.fromArray(position);
  module.userData.sensorModule = true;
  module.userData.module_id = id;
  module.userData.positionMeasured = false;
  box(
    module,
    'module-board',
    [layout.sensorBoardWidth, layout.sensorBoardHeight, 0.002],
    [0, 0, 0],
    pcb
  );
  box(module, 'connector', [0.018, 0.004, 0.006], [0, -0.01, 0.003], neutral);
  if (id === 'inmp441') {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.004, 20), neutral);
    can.rotation.x = Math.PI / 2;
    can.position.z = 0.003;
    module.add(can);
  } else {
    box(module, 'sensing-package', [0.008, 0.008, 0.004], [0, 0.002, 0.003], neutral);
  }
  const accent = box(
    module,
    'measurement-accent',
    [0.024, 0.002, 0.002],
    [0, 0.011, 0.003],
    new THREE.MeshStandardMaterial({ color: 0x64727c, roughness: 0.8 })
  );
  module.userData.accent = accent;
  module.traverse((object) => {
    if (object.isMesh) object.userData.preserveSurface = true;
  });
  return module;
}

export function createRackModel(configuration = {}) {
  const layout = rackLayout(configuration);
  const { width, height, depth } = layout;
  const root = new THREE.Group();
  root.name = 'laboratory-rack';
  root.userData.rackLayout = layout;
  root.userData.referenceModel = 'Nirax NR 9042; physical label unconfirmed';
  root.userData.reportedSensorSeparationM = 1.2;
  root.userData.sensorSeparationMeasured = false;
  root.userData.dimensionEvidence = {
    cabinet: 'existing NR 9042 reference; exact physical model label unconfirmed',
    servers: 'IBM System x3250 M4; IMG_3526/3527/3528 and Lenovo Press tips0812',
    accessories: 'photo-proportional estimates; not measured',
    serverPlacement: 'reference layout; nine-U bottom pitch, not surveyed',
    serverClearanceMeasured: false,
  };
  root.userData.fanConfiguration = {
    installedCount: null,
    visiblePhotoCount: 2,
    operatingState: null,
  };
  const metal = new THREE.MeshStandardMaterial({
    color: 0x171b1d,
    roughness: 0.64,
    metalness: 0.55,
  });
  const railMaterial = new THREE.MeshStandardMaterial({
    color: 0x98978a,
    roughness: 0.5,
    metalness: 0.65,
  });
  const pcb = new THREE.MeshStandardMaterial({ color: 0x243c36, roughness: 0.85, metalness: 0.1 });
  const neutral = new THREE.MeshStandardMaterial({
    color: 0x9caaa8,
    roughness: 0.5,
    metalness: 0.45,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x8c9699,
    metalness: 0,
    roughness: 0.12,
    transmission: 0.35,
    transparent: true,
    opacity: 0.28,
    thickness: 0.006,
    ior: 1.5,
    depthWrite: false,
  });
  const frame = component(root, 'frame');
  for (const x of [-width / 2 + 0.018, width / 2 - 0.018]) {
    for (const z of [-depth / 2 + 0.018, depth / 2 - 0.018]) {
      box(frame, 'corner-post', [0.036, height - 0.03, 0.036], [x, (height + 0.03) / 2, z], metal);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.03, 16), metal);
      foot.position.set(x, 0.015, z);
      frame.add(foot);
    }
  }
  for (const y of [0.055, height - 0.025]) {
    for (const z of [-depth / 2 + 0.025, depth / 2 - 0.025])
      box(frame, 'cross-member', [width - 0.072, 0.05, 0.036], [0, y, z], metal);
    for (const x of [-width / 2 + 0.025, width / 2 - 0.025])
      box(frame, 'depth-member', [0.036, 0.05, depth - 0.072], [x, y, 0], metal);
  }
  const panels = component(root, 'panels');
  for (const [name, x] of [
    ['left-panel', -width / 2 + 0.002],
    ['right-panel', width / 2 - 0.002],
  ])
    box(
      component(panels, name),
      'removable-panel',
      [0.004, height - 0.12, depth - 0.07],
      [x, height / 2, 0],
      metal
    );
  const rear = component(panels, 'rear-door');
  box(
    rear,
    'opaque-door',
    [width - 0.07, height - 0.12, 0.004],
    [0, height / 2, -depth / 2 + 0.002],
    metal
  );
  const door = component(panels, 'front-door');
  const doorZ = depth / 2 - 0.014;
  for (const x of [-width / 2 + 0.045, width / 2 - 0.045]) {
    const slots = Array.from({ length: 21 }, (_, i) =>
      [-0.01, 0.01].map((dx) => {
        const path = new THREE.Path();
        const y = (i - 10) * 0.08;
        path.moveTo(dx - 0.002, y - 0.026);
        path.lineTo(dx - 0.002, y + 0.026);
        path.lineTo(dx + 0.002, y + 0.026);
        path.lineTo(dx + 0.002, y - 0.026);
        path.closePath();
        return path;
      })
    ).flat();
    const stile = sheet(door, 'door-stile', 0.055, height - 0.08, 0.012, slots, metal);
    stile.position.set(x, height / 2, doorZ);
  }
  for (const y of [0.07, height - 0.07])
    box(door, 'door-rail', [width - 0.09, 0.06, 0.028], [0, y, doorZ], metal);
  box(door, 'tempered-glass', [width - 0.145, height - 0.2, 0.006], [0, height / 2, doorZ], glass);
  box(door, 'swing-handle', [0.012, 0.16, 0.01], [width / 2 - 0.047, 0.98, doorZ + 0.008], neutral);
  for (const y of [0.2, height / 2, height - 0.2])
    box(door, 'hinge', [0.009, 0.045, 0.016], [-width / 2 + 0.027, y, doorZ], metal);
  box(
    component(panels, 'bottom'),
    'floor',
    [width - 0.072, 0.012, depth - 0.072],
    [0, 0.04, 0],
    metal
  );

  cabinetInterior(root, layout, metal, railMaterial);
  root.add(createRackEquipment(layout));
  referenceCables(root, layout);

  const top = component(panels, 'roof');
  const fanPositions = [];
  for (const x of [-layout.fanColumnSpacing / 2, layout.fanColumnSpacing / 2])
    fanPositions.push([x, -layout.fanRowSpacing / 2]);
  const roof = sheet(
    top,
    'vented-top-panel',
    width - 0.072,
    depth - 0.072,
    0.003,
    fanPositions.map(([x, z]) => roundHole(x, -z, layout.fanDiameter / 2)),
    metal
  );
  roof.rotation.x = -Math.PI / 2;
  roof.position.y = height - 0.003;
  const fans = component(root, 'roof-fans');
  for (const [x, z] of fanPositions) {
    const fan = component(fans, 'roof-fan');
    fan.userData.registration_state = 'installation_reference';
    fan.userData.positionMeasured = false;
    fan.position.set(x, height - 0.028, z);
    const housing = sheet(
      fan,
      'fan-housing',
      layout.fanDiameter + 0.012,
      layout.fanDiameter + 0.012,
      0.006,
      [roundHole(0, 0, layout.fanDiameter * 0.46)],
      metal
    );
    housing.rotation.x = -Math.PI / 2;
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(layout.fanDiameter * 0.12, layout.fanDiameter * 0.12, 0.008, 16),
      metal
    );
    fan.add(hub);
    for (let blade = 0; blade < 5; blade++) {
      const paddle = box(
        fan,
        'stationary-blade',
        [layout.fanDiameter * 0.31, 0.003, layout.fanDiameter * 0.16],
        [0, 0, 0],
        metal
      );
      const angle = (blade * Math.PI * 2) / 5;
      paddle.position.set(
        Math.cos(angle) * layout.fanDiameter * 0.24,
        0,
        Math.sin(angle) * layout.fanDiameter * 0.24
      );
      paddle.rotation.y = -angle + 0.35;
    }
    for (const factor of [0.24, 0.4]) {
      const grille = new THREE.Mesh(
        new THREE.TorusGeometry(layout.fanDiameter * factor, 0.0012, 6, 32),
        railMaterial
      );
      grille.rotation.x = Math.PI / 2;
      grille.position.y = 0.011;
      fan.add(grille);
    }
  }

  const positions = rackModulePositions(layout);
  const sensors = component(root, 'sensors');
  for (const id of Object.keys(MODULE_SOURCES))
    sensorModule(sensors, id, positions[id], pcb, neutral, layout);
  const controller = component(root, 'esp32-s3');
  controller.position.fromArray(positions['esp32-s3']);
  box(
    controller,
    'controller-board',
    [layout.controllerBoardWidth, layout.controllerBoardHeight, 0.002],
    [0, 0, 0],
    pcb
  );
  box(controller, 'wroom-module-shield', [0.018, 0.025, 0.005], [0, 0.013, 0.004], neutral);
  for (const x of [-0.013, 0.013])
    box(controller, 'header-strip', [0.004, 0.055, 0.007], [x, 0, 0.004], metal);
  box(controller, 'usb-connector', [0.01, 0.007, 0.006], [0, -0.029, 0.004], neutral);
  controller.userData.module = 'ESP32-S3-WROOM-1-N16R8';
  controller.userData.dimensionsMeasured = false;
  controller.traverse((object) => {
    if (object.isMesh) object.userData.preserveSurface = true;
  });
  const cables = component(root, 'sensor-cables');
  for (const [id, pins] of [
    ['sht31-a', [8, 9]],
    ['sht31-b', [10, 11]],
    ['inmp441', [4, 5, 6]],
  ]) {
    const start = new THREE.Vector3().fromArray(positions['esp32-s3']);
    const end = new THREE.Vector3().fromArray(positions[id]);
    const route = new THREE.CatmullRomCurve3([
      start,
      new THREE.Vector3(0.18, (start.y + end.y) / 2, -0.15),
      end,
    ]);
    const cable = new THREE.Mesh(new THREE.TubeGeometry(route, 24, 0.0025, 6, false), metal);
    cable.name = `${id}-cable`;
    cable.userData.gpio = pins;
    cable.userData.routingMeasured = false;
    cables.add(cable);
  }
  root.updateMatrixWorld(true);
  return root;
}

export function setRackInspection(root, enabled) {
  if (!root?.userData.rackLayout) return;
  for (const name of ['front-door', 'left-panel', 'right-panel', 'rear-door', 'roof', 'bottom'])
    root.getObjectByName(name).visible = !enabled;
  root.userData.inspection = Boolean(enabled);
}
