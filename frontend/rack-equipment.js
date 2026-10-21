import * as THREE from 'three';

function group(parent, name, displayName, dimensionalAuthority) {
  const object = new THREE.Group();
  object.name = name;
  object.userData = { referenceOnly: true, displayName, dimensionalAuthority };
  parent.add(object);
  return object;
}

function box(parent, name, size, position, material) {
  const object = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  object.name = name;
  object.position.set(...position);
  parent.add(object);
  return object;
}

function instances(parent, name, geometry, material, placements) {
  const object = new THREE.InstancedMesh(geometry, material, placements.length);
  object.name = name;
  const transform = new THREE.Object3D();
  placements.forEach(({ position, scale = [1, 1, 1], rotation = [0, 0, 0] }, index) => {
    transform.position.set(...position);
    transform.scale.set(...scale);
    transform.rotation.set(...rotation);
    transform.updateMatrix();
    object.setMatrixAt(index, transform.matrix);
  });
  object.computeBoundingBox();
  object.computeBoundingSphere();
  parent.add(object);
  return object;
}

function server(parent, name, bottom, emptyLeftBay, layout, materials) {
  const { serverWidth: width, serverHeight: height, serverDepth: depth } = layout;
  const object = group(parent, name, 'IBM System x3250 M4', 'manufacturer_reference');
  object.position.set(0, bottom, layout.serverFrontZ);
  object.userData.dimensions = { width, height, depth, panelWidth: layout.serverPanelWidth };
  object.userData.photoEvidence = emptyLeftBay
    ? ['IMG_3525', 'IMG_3526', 'IMG_3527']
    : ['IMG_3528'];
  object.userData.positionMeasured = false;
  object.userData.dimensionSource = 'https://lenovopress.lenovo.com/tips0812-system-x3250-m4';
  const fasciaDepth = 0.004;
  box(
    object,
    'chassis-body',
    [width, height, depth - fasciaDepth],
    [0, height / 2, -(depth + fasciaDepth) / 2],
    materials.steel
  );
  box(
    object,
    'front-fascia',
    [width, height, fasciaDepth],
    [0, height / 2, -fasciaDepth / 2],
    materials.black
  );
  const earWidth = (layout.serverPanelWidth - width) / 2;
  for (const side of [-1, 1])
    box(
      object,
      'rack-ear',
      [earWidth, height, fasciaDepth],
      [(side * (width + earWidth)) / 2, height / 2, -fasciaDepth / 2],
      materials.steel
    );
  instances(
    object,
    'rack-screws',
    new THREE.CylinderGeometry(0.0032, 0.0032, 0.001, 10),
    materials.screw,
    [-1, 1].flatMap((side) =>
      [0.011, height - 0.011].map((y) => ({
        position: [(side * layout.mountingPitch) / 2, y, 0.0005],
        rotation: [Math.PI / 2, 0, 0],
      }))
    )
  );

  const bayWidth = width * 0.31;
  const bayHeight = height * 0.73;
  const bayCenters = [-width * 0.035, width * 0.3];
  const vents = [];
  bayCenters.forEach((x, index) => {
    const empty = emptyLeftBay && index === 0;
    box(
      object,
      empty ? 'empty-drive-bay' : 'drive-tray',
      [bayWidth, bayHeight, 0.001],
      [x, height / 2, 0.0005],
      empty ? materials.recess : materials.tray
    );
    if (empty) {
      box(
        object,
        'empty-bay-interior',
        [bayWidth * 0.86, bayHeight * 0.7, 0.0005],
        [x, height / 2, 0.0011],
        materials.recess
      );
      return;
    }
    for (let row = 0; row < 3; row++)
      for (let column = 0; column < 12; column++)
        vents.push({
          position: [
            x - bayWidth * 0.4 + column * bayWidth * 0.066,
            height / 2 - bayHeight * 0.25 + row * bayHeight * 0.25,
            0.0012,
          ],
        });
    box(
      object,
      'drive-tray-latch',
      [0.009, bayHeight * 0.76, 0.0015],
      [x + bayWidth * 0.43, height / 2, 0.001],
      materials.screw
    );
  });
  instances(
    object,
    'drive-vent-apertures',
    new THREE.BoxGeometry(bayWidth * 0.04, bayHeight * 0.11, 0.0005),
    materials.recess,
    vents
  );
  const controlsX = -width * 0.365;
  box(
    object,
    'optical-drive',
    [width * 0.235, height * 0.3, 0.001],
    [controlsX, height * 0.27, 0.001],
    materials.tray
  );
  box(
    object,
    'optical-drive-slot',
    [width * 0.2, 0.001, 0.0005],
    [controlsX, height * 0.27, 0.0018],
    materials.recess
  );
  for (const x of [controlsX - 0.022, controlsX - 0.006])
    box(object, 'usb-port', [0.012, 0.0045, 0.001], [x, height * 0.75, 0.001], materials.recess);
  const button = new THREE.Mesh(
    new THREE.CylinderGeometry(0.003, 0.003, 0.0015, 12),
    materials.screw
  );
  button.name = 'power-button';
  button.rotation.x = Math.PI / 2;
  button.position.set(controlsX + 0.025, height * 0.75, 0.001);
  object.add(button);
  return object;
}

function monitor(parent, top, layout, materials) {
  const object = group(parent, 'monitor', 'LG Monitor', 'photograph_estimate');
  const {
    monitorWidth: width,
    monitorHeight: height,
    monitorDepth: depth,
    monitorStandHeight: standHeight,
  } = layout;
  object.position.set(0, top, layout.monitorZ);
  object.userData.photoEvidence = ['IMG_3526', 'IMG_3527', 'IMG_3528'];
  object.userData.modelIdentified = false;
  const baseThickness = standHeight * 0.13;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 32), materials.tray);
  base.name = 'oval-stand-base';
  base.scale.set(layout.monitorBaseWidth, baseThickness, layout.monitorBaseDepth);
  base.position.y = baseThickness / 2;
  object.add(base);
  box(
    object,
    'stand-neck',
    [width * 0.11, standHeight, depth * 0.75],
    [0, baseThickness + standHeight / 2, 0],
    materials.tray
  );
  box(
    object,
    'display-housing',
    [width, height, depth * 0.68],
    [0, standHeight + height / 2, depth * 0.16],
    materials.black
  );
  box(
    object,
    'rear-housing',
    [width * 0.72, height * 0.7, depth * 0.32],
    [0, standHeight + height / 2, -depth * 0.34],
    materials.tray
  );
  const screenWidth = width * 0.9;
  box(
    object,
    'inactive-display',
    [screenWidth, Math.min(screenWidth / 1.25, height * 0.87), 0.001],
    [0, standHeight + height * 0.52, depth / 2 + 0.0005],
    materials.screen
  );
  box(
    object,
    'monitor-button',
    [0.005, 0.002, 0.0008],
    [width * 0.4, standHeight + 0.008, depth / 2 + 0.0005],
    materials.screw
  );
  return object;
}

function keyboard(parent, top, layout, materials) {
  const object = group(parent, 'keyboard', 'Keyboard', 'photograph_estimate');
  const { keyboardWidth: width, keyboardDepth: depth, keyboardHeight: height } = layout;
  object.position.set(0, top, layout.keyboardZ);
  object.userData.photoEvidence = ['IMG_3526', 'IMG_3527', 'IMG_3528'];
  box(object, 'keyboard-body', [width, height * 0.7, depth], [0, height * 0.35, 0], materials.tray);
  const keys = [];
  const pitchX = width * 0.047;
  const pitchZ = depth * 0.145;
  const addKey = (x, z, keyWidth = pitchX * 0.85) =>
    keys.push({ position: [x, height * 0.85, z], scale: [keyWidth, height * 0.3, pitchZ * 0.8] });
  for (let row = 0; row < 5; row++)
    for (let column = 0; column < 14; column++)
      addKey(-width * 0.455 + column * pitchX, -depth * 0.36 + row * pitchZ);
  const bottomZ = -depth * 0.36 + 5 * pitchZ;
  for (const column of [0, 1, 2, 10, 11, 12, 13]) addKey(-width * 0.455 + column * pitchX, bottomZ);
  addKey(-width * 0.455 + 6 * pitchX, bottomZ, pitchX * 6.3);
  for (let row = 0; row < 5; row++)
    for (let column = 0; column < 4; column++)
      addKey(width * 0.3 + column * width * 0.048, -depth * 0.36 + row * pitchZ, width * 0.04);
  for (const [column, row] of [
    [0, 1],
    [1, 1],
    [2, 1],
    [1, 0],
  ])
    addKey(width * 0.215 + column * width * 0.026, bottomZ - (1 - row) * pitchZ, width * 0.023);
  instances(object, 'keycaps', new THREE.BoxGeometry(1, 1, 1), materials.keys, keys);
  return object;
}

export function createRackEquipment(layout) {
  const dimensions = [
    'serverWidth',
    'serverHeight',
    'serverDepth',
    'serverPanelWidth',
    'mountingPitch',
    'monitorWidth',
    'monitorHeight',
    'monitorDepth',
    'monitorStandHeight',
    'monitorBaseWidth',
    'monitorBaseDepth',
    'keyboardWidth',
    'keyboardDepth',
    'keyboardHeight',
  ];
  if (
    !layout ||
    dimensions.some((key) => !Number.isFinite(layout[key]) || layout[key] <= 0) ||
    ['serverLowerY', 'serverClearance', 'serverFrontZ', 'monitorZ', 'keyboardZ'].some(
      (key) => !Number.isFinite(layout[key])
    )
  )
    throw new TypeError('Equipment requires finite dimensions and positions.');
  if (layout.serverClearance < 0 || layout.serverPanelWidth < layout.serverWidth)
    throw new RangeError('Equipment dimensions must preserve chassis clearance.');
  const root = new THREE.Group();
  root.name = 'installed-equipment';
  root.userData.referenceOnly = true;
  const materials = {
    steel: new THREE.MeshStandardMaterial({ color: 0x85888a, roughness: 0.66, metalness: 0.72 }),
    black: new THREE.MeshStandardMaterial({ color: 0x202324, roughness: 0.72, metalness: 0.3 }),
    tray: new THREE.MeshStandardMaterial({ color: 0x36393a, roughness: 0.76, metalness: 0.35 }),
    recess: new THREE.MeshStandardMaterial({ color: 0x080a0b, roughness: 0.97 }),
    screw: new THREE.MeshStandardMaterial({ color: 0x646a6c, roughness: 0.58, metalness: 0.7 }),
    screen: new THREE.MeshStandardMaterial({ color: 0x111718, roughness: 0.39, metalness: 0.08 }),
    keys: new THREE.MeshStandardMaterial({ color: 0x191c1d, roughness: 0.85 }),
  };
  server(root, 'server-lower', layout.serverLowerY, false, layout, materials);
  const upperBottom = layout.serverLowerY + layout.serverHeight + layout.serverClearance;
  server(root, 'server-upper', upperBottom, true, layout, materials);
  const supportingTop = upperBottom + layout.serverHeight;
  monitor(root, supportingTop, layout, materials);
  keyboard(root, supportingTop, layout, materials);
  root.traverse((object) => {
    if (object.isMesh) object.userData.preserveSurface = true;
  });
  root.updateMatrixWorld(true);
  return root;
}
