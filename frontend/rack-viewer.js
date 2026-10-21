import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createRackModel, rackSourcePlacements, setRackInspection } from './rack-model.js';
import { createSensorEffects, updateSensorEffects, stepSensorEffects } from './sensor-effects.js';

export const MODEL_STATE = Object.freeze({
  UNCONFIGURED: 'MODEL_UNCONFIGURED',
  LOADING: 'MODEL_LOADING',
  READY: 'MODEL_READY',
  ERROR: 'MODEL_LOAD_ERROR',
});

export const PERFORMANCE_PROFILE = Object.freeze({
  EFFICIENT: 'hemat',
  BALANCED: 'seimbang',
  QUALITY: 'kualitas',
});

export const SURFACE_MODE = Object.freeze({
  CONTRAST: 'contrast',
  TEXTURED: 'textured',
});

export const PERFORMANCE_STORAGE_KEY = 'dt_datacenter.performance_profile';

export const SPATIAL_METRIC = Object.freeze({
  temperature: Object.freeze({ label: 'Temperature', unit: 'degC', zones: true }),
  humidity: Object.freeze({ label: 'Humidity', unit: 'percent_rh', zones: true }),
  acoustic: Object.freeze({
    label: 'Acoustic',
    metrics: Object.freeze(['sound_rms_dbfs', 'sound_peak_dbfs']),
    unit: 'dBFS',
    zones: false,
  }),
  electrical: Object.freeze({
    label: 'Electrical',
    metrics: Object.freeze([
      'voltage_v',
      'current_a',
      'active_power_w',
      'apparent_power_va',
      'power_factor_ratio',
      'frequency_hz',
      'energy_wh_total',
      'returned_energy_wh_total',
      'pm1_error_count',
      'pm1_flag_count',
    ]),
    unit: null,
    zones: false,
  }),
  telecommunications: Object.freeze({
    label: 'Telecommunications',
    metrics: Object.freeze([
      'net_bytes_received_total',
      'net_bytes_sent_total',
      'net_packets_received_total',
      'net_packets_sent_total',
      'net_receive_throughput_bytes_per_second',
      'net_transmit_throughput_bytes_per_second',
      'net_packets_received_errors_total',
      'net_packets_outbound_errors_total',
      'net_packets_received_discarded_total',
      'net_packets_outbound_discarded_total',
      'net_current_bandwidth_bytes',
      'net_link_utilization_ratio',
      'net_operation_status',
    ]),
    unit: null,
    zones: false,
  }),
  sound_rms_dbfs: Object.freeze({ label: 'RMS', unit: 'dBFS', zones: false }),
  sound_peak_dbfs: Object.freeze({ label: 'Peak', unit: 'dBFS', zones: false }),
  voltage_v: Object.freeze({ label: 'Voltage', unit: 'V', zones: false }),
  current_a: Object.freeze({ label: 'Current', unit: 'A', zones: false }),
  active_power_w: Object.freeze({ label: 'Active power', unit: 'W', zones: false }),
  apparent_power_va: Object.freeze({ label: 'Apparent power', unit: 'VA', zones: false }),
  power_factor_ratio: Object.freeze({ label: 'Power factor', unit: 'ratio', zones: false }),
  frequency_hz: Object.freeze({ label: 'Frequency', unit: 'Hz', zones: false }),
  energy_wh_total: Object.freeze({ label: 'Cumulative energy', unit: 'Wh', zones: false }),
});

export const MEASUREMENT_SCALE = Object.freeze({
  temperature: Object.freeze({
    maximum: 40,
    minimum: 10,
    stops: Object.freeze([
      Object.freeze({ color: 0x456d8b, value: 10 }),
      Object.freeze({ color: 0x648d7c, value: 18 }),
      Object.freeze({ color: 0xc0a15c, value: 27 }),
      Object.freeze({ color: 0xc27b4f, value: 35 }),
      Object.freeze({ color: 0xa84d46, value: 40 }),
    ]),
  }),
  humidity: Object.freeze({
    maximum: 100,
    minimum: 0,
    stops: Object.freeze([
      Object.freeze({ color: 0x28769a, value: 0 }),
      Object.freeze({ color: 0x2e92a4, value: 25 }),
      Object.freeze({ color: 0x459878, value: 50 }),
      Object.freeze({ color: 0x83a04e, value: 75 }),
      Object.freeze({ color: 0xbf923e, value: 100 }),
    ]),
  }),
});

const pixelRatioCaps = Object.freeze({
  [PERFORMANCE_PROFILE.EFFICIENT]: 1,
  [PERFORMANCE_PROFILE.BALANCED]: 1.5,
  [PERFORMANCE_PROFILE.QUALITY]: 2,
});

const IDENTITY_POSITION = Object.freeze([0, 0, 0]);
const IDENTITY_ROTATION = Object.freeze([0, 0, 0]);
const IDENTITY_SCALE = Object.freeze([1, 1, 1]);
const PROXY_MESSAGE = 'Reference geometry unavailable. Non-physical software proxy active.';
const ANCHOR_COLOR = new THREE.Color(0x64727c);
const PREVIEW_COLOR = new THREE.Color(0x1597c7);
const CONTRAST_SURFACE_COLOR = 0x3a4142;

export function normalizePerformanceProfile(value) {
  return Object.hasOwn(pixelRatioCaps, value) ? value : PERFORMANCE_PROFILE.BALANCED;
}

export function performancePixelRatio(profile, devicePixelRatio) {
  const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(ratio, pixelRatioCaps[normalizePerformanceProfile(profile)]);
}

export function readPerformanceProfile(storage) {
  try {
    return normalizePerformanceProfile(storage?.getItem(PERFORMANCE_STORAGE_KEY));
  } catch {
    return PERFORMANCE_PROFILE.BALANCED;
  }
}

export function persistPerformanceProfile(storage, profile) {
  const normalized = normalizePerformanceProfile(profile);
  try {
    storage?.setItem(PERFORMANCE_STORAGE_KEY, normalized);
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
  return normalized;
}

function vector(value, fallback, name, allowZero = true) {
  const candidate = value ?? fallback;
  if (
    !Array.isArray(candidate) ||
    candidate.length !== 3 ||
    !candidate.every(Number.isFinite) ||
    (!allowZero && candidate.some((component) => component === 0))
  ) {
    throw new TypeError(`${name} must contain three finite values.`);
  }
  return [...candidate];
}

export function parseRackModelConfig(config, baseUrl) {
  if (config === null || typeof config !== 'object') {
    throw new TypeError('Rack model configuration must be an object.');
  }
  if (config.kind === 'rack') return { kind: 'rack', layout: config.layout ?? {} };
  const value = typeof config.url === 'string' ? config.url.trim() : '';
  if (value === '') return null;

  const base = new URL(baseUrl);
  const url = new URL(value, base);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.origin !== base.origin ||
    url.username !== '' ||
    url.password !== '' ||
    !url.pathname.toLowerCase().endsWith('.glb')
  ) {
    throw new TypeError('Rack model must be a same-origin GLB URL.');
  }

  return {
    url: url.href,
    position: vector(config.position, IDENTITY_POSITION, 'position'),
    rotation: vector(config.rotation, IDENTITY_ROTATION, 'rotation'),
    scale: vector(config.scale, IDENTITY_SCALE, 'scale', false),
  };
}

export function resolveRackModelResourceUrl(value, baseUrl) {
  const base = new URL(baseUrl);
  const url = new URL(value, base);
  if (['data:', 'blob:'].includes(url.protocol)) return url.href;
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== base.origin) {
    throw new TypeError('Rack model resources must be same-origin.');
  }
  return url.href;
}

export function createFunctionalProxy() {
  return new THREE.Mesh(
    new THREE.BoxGeometry(1, 2.4, 0.8),
    new THREE.MeshStandardMaterial({ color: 0x607d8b, roughness: 0.75, metalness: 0.15 })
  );
}

export function spatialAnchorKey(value) {
  return JSON.stringify([value?.asset_id ?? '', value?.sensor_id ?? '']);
}

function isVisible(object) {
  for (let parent = object; parent; parent = parent.parent) if (!parent.visible) return false;
  return true;
}

export function pickSpatialSensor(raycaster, modelRoot, markers) {
  const hit = raycaster
    .intersectObjects([...markers], true)
    .find(({ object }) => isVisible(object) && object.userData.spatialContext);
  if (!hit) return null;
  if (modelRoot?.userData.rackLayout) {
    const obstruction = raycaster
      .intersectObject(modelRoot, true)
      .find(({ object }) => isVisible(object) && object.isMesh && !object.material.transparent);
    if (obstruction && obstruction.distance < hit.distance - 0.0001) return null;
  }
  return hit.object.userData.spatialContext;
}

export function pickRackReference(raycaster, modelRoot) {
  if (!modelRoot?.userData.rackLayout) return null;
  const hit = raycaster.intersectObject(modelRoot, true).find(({ object }) => {
    return isVisible(object) && object.isMesh && !object.material.transparent;
  });
  for (let object = hit?.object; object; object = object.parent) {
    if (!object.userData.referenceOnly || !object.userData.displayName) continue;
    const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
    return {
      object_id: object.name,
      display_name: object.userData.displayName,
      dimensional_authority: object.userData.dimensionalAuthority,
      dimensions: size.toArray(),
      photo_evidence: object.userData.photoEvidence ?? [],
    };
  }
  return null;
}

export function normalizeSpatialAnchors(anchors) {
  if (!Array.isArray(anchors)) throw new TypeError('Spatial anchors must be an array.');
  const normalized = anchors.map((anchor) => {
    const assetId = typeof anchor?.asset_id === 'string' ? anchor.asset_id.trim() : '';
    const sensorId = typeof anchor?.sensor_id === 'string' ? anchor.sensor_id.trim() : '';
    const coordinateSystemId =
      typeof anchor?.coordinate_system_id === 'string' ? anchor.coordinate_system_id.trim() : '';
    const metric = typeof anchor?.metric === 'string' ? anchor.metric.trim() : '';
    if (assetId === '') throw new TypeError('Spatial anchor asset_id is required.');
    if (sensorId === '') throw new TypeError('Spatial anchor sensor_id is required.');
    if (coordinateSystemId === '') {
      throw new TypeError('Spatial anchor coordinate_system_id is required.');
    }
    if (!Object.hasOwn(SPATIAL_METRIC, metric)) {
      throw new TypeError('Spatial anchor metric is unsupported.');
    }
    if (anchor.unit !== SPATIAL_METRIC[metric].unit) {
      throw new TypeError('Spatial anchor unit does not match its metric.');
    }
    const installationReference = anchor.registration_state === 'installation_reference';
    if (!installationReference && !/^[1-9][0-9]*$/.test(String(anchor.position_version))) {
      throw new TypeError('Spatial anchor position_version is invalid.');
    }
    if (!installationReference && anchor.registration_state !== 'reference_geometry') {
      throw new TypeError(
        'Spatial anchor registration_state must be reference_geometry or installation_reference.'
      );
    }
    if (
      installationReference &&
      (anchor.coordinate_system_id !== 'rack-model-local' ||
        !['sht31-a', 'sht31-b', 'inmp441'].includes(anchor.module_id) ||
        anchor.position_verified !== false ||
        anchor.position_version !== null)
    )
      throw new TypeError('Installation references must be unmeasured rack module positions.');
    return {
      asset_id: assetId,
      coordinate_system_id: coordinateSystemId,
      metric,
      position: vector(anchor.position, null, 'position'),
      position_verified: anchor.position_verified === true,
      position_version: installationReference ? null : String(anchor.position_version),
      registration_state: 'reference_geometry',
      sensor_id: sensorId,
      unit: SPATIAL_METRIC[metric].unit,
      ...(installationReference
        ? { module_id: anchor.module_id, registration_state: 'installation_reference' }
        : {}),
    };
  });
  if (new Set(normalized.map(spatialAnchorKey)).size !== normalized.length) {
    throw new TypeError('Spatial anchor source identities must be unique.');
  }
  return normalized;
}

export function createTelemetryOverlay() {
  const root = new THREE.Group();
  const anchorRoot = new THREE.Group();
  const zoneRoot = new THREE.Group();
  root.add(anchorRoot, zoneRoot);
  return { anchors: new Map(), anchorRoot, markers: new Map(), root, zoneRoot };
}

export function modelLocalIntersection(raycaster, pointer, camera, modelRoot) {
  if (modelRoot === null) return null;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster
    .intersectObject(modelRoot, true)
    .find(({ object }) => object.isMesh && isVisible(object));
  return hit ? modelRoot.worldToLocal(hit.point.clone()).toArray() : null;
}

function disposeModel(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const ownedMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of ownedMaterials) {
      if (material) materials.add(material);
    }
  });
  for (const material of materials) {
    for (const property of Object.values(material)) {
      if (property?.isTexture) textures.add(property);
    }
    material.dispose();
  }
  for (const geometry of geometries) geometry.dispose();
  for (const texture of textures) texture.dispose();
}

function clearOwnedGroup(root) {
  for (const child of [...root.children]) {
    root.remove(child);
    disposeModel(child);
  }
}

export function measurementColor(metric, value) {
  const scale = MEASUREMENT_SCALE[metric];
  if (!scale || !Number.isFinite(value)) return null;
  const stops = scale.stops;
  if (value <= stops[0].value) return new THREE.Color(stops[0].color);
  for (let index = 1; index < stops.length; index += 1) {
    const upper = stops[index];
    if (value > upper.value) continue;
    const lower = stops[index - 1];
    return new THREE.Color(lower.color).lerp(
      new THREE.Color(upper.color),
      (value - lower.value) / (upper.value - lower.value)
    );
  }
  return new THREE.Color(stops.at(-1).color);
}

export function measurementScalePosition(metric, value) {
  const scale = MEASUREMENT_SCALE[metric];
  if (!scale || !Number.isFinite(value)) return null;
  return (
    THREE.MathUtils.clamp((value - scale.minimum) / (scale.maximum - scale.minimum), 0, 1) * 100
  );
}

const PROJECTION_DIRECTIONS = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
];

export function closestModelSurface(modelRoot, modelPosition, modelRadius) {
  if (modelRoot === null) return null;
  modelRoot.updateMatrixWorld(true);
  const worldPosition = modelRoot.localToWorld(modelPosition.clone());
  const reach = Math.max(modelRadius * 2, 1);
  let closest = null;
  for (const direction of PROJECTION_DIRECTIONS) {
    const raycaster = new THREE.Raycaster(
      worldPosition.clone().addScaledVector(direction, reach),
      direction.clone().negate(),
      0,
      reach * 2
    );
    for (const hit of raycaster.intersectObject(modelRoot, true)) {
      if (!hit.object.isMesh || !hit.face) continue;
      const distance = hit.point.distanceToSquared(worldPosition);
      if (closest === null || distance < closest.distance) closest = { distance, hit };
    }
  }
  if (closest === null) return null;
  const normal = closest.hit.face.normal
    .clone()
    .applyMatrix3(new THREE.Matrix3().getNormalMatrix(closest.hit.object.matrixWorld))
    .normalize();
  return { mesh: closest.hit.object, normal, position: closest.hit.point };
}

function raycastModel(modelRoot, origin, direction, far) {
  return new THREE.Raycaster(origin, direction, 0, far)
    .intersectObject(modelRoot, true)
    .find(({ object }) => object.isMesh);
}

export function middleCabinetSurfaces(modelRoot) {
  if (modelRoot === null) return null;
  modelRoot.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(modelRoot);
  if (bounds.isEmpty()) return null;
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const margin = Math.max(size.length() * 0.1, 0.1);
  const top = raycastModel(
    modelRoot,
    new THREE.Vector3(center.x, bounds.max.y + margin, center.z),
    new THREE.Vector3(0, -1, 0),
    size.y + margin * 2
  );
  const front = raycastModel(
    modelRoot,
    new THREE.Vector3(center.x, center.y, bounds.max.z + margin),
    new THREE.Vector3(0, 0, -1),
    size.z + margin * 2
  );
  const electricalY = center.y - size.y * 0.125;
  const electrical = raycastModel(
    modelRoot,
    new THREE.Vector3(center.x, electricalY, bounds.min.z - margin),
    new THREE.Vector3(0, 0, 1),
    size.z + margin * 2
  );
  if (!top || !front || !electrical) return null;
  return {
    electrical: modelRoot.worldToLocal(electrical.point.clone()).toArray(),
    front: modelRoot.worldToLocal(front.point.clone()).toArray(),
    top: modelRoot.worldToLocal(top.point.clone()).toArray(),
  };
}

export function measurementZoneSize(normal, modelSize) {
  const axis = new THREE.Vector3(Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z));
  const cabinetWidth = modelSize.x / 3;
  if (axis.y >= axis.x && axis.y >= axis.z) {
    return new THREE.Vector2(cabinetWidth * 0.85, modelSize.z * 0.76);
  }
  if (axis.x > axis.z) return new THREE.Vector2(modelSize.z * 0.6, modelSize.y * 0.4);
  return new THREE.Vector2(cabinetWidth * 0.78, modelSize.y * 0.55);
}

function surfaceQuaternion(normal) {
  return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
}

function physicalAnchorKey(anchor) {
  return JSON.stringify([anchor.asset_id, anchor.coordinate_system_id, ...anchor.position]);
}

function createSensorMarker(modelRoot, position, modelSize, modelRadius, ownerDocument) {
  const surface = closestModelSurface(modelRoot, position, modelRadius);
  if (surface === null) return null;
  const width = (modelSize.x / 3) * 0.085;
  const height = width * 0.72;
  const canvas = ownerDocument.createElement('canvas');
  canvas.width = 128;
  canvas.height = 96;
  const context = canvas.getContext('2d');
  context.fillStyle = 'rgba(42, 47, 47, 0.94)';
  context.fillRect(18, 14, 92, 68);
  context.strokeStyle = 'rgba(235, 237, 236, 0.82)';
  context.lineWidth = 4;
  context.strokeRect(18, 14, 92, 68);
  context.fillStyle = 'rgba(212, 207, 202, 0.92)';
  context.fillRect(7, 35, 11, 6);
  context.fillRect(7, 55, 11, 6);
  context.fillRect(110, 35, 11, 6);
  context.fillRect(110, 55, 11, 6);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const marker = new THREE.Group();
  marker.position.copy(surface.position).addScaledVector(surface.normal, width * 0.015);
  marker.quaternion.copy(surfaceQuaternion(surface.normal));
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      depthTest: true,
      map: texture,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      transparent: true,
    })
  );
  const accent = new THREE.Mesh(
    new THREE.CircleGeometry(width * 0.09, 20),
    new THREE.MeshBasicMaterial({ color: ANCHOR_COLOR, depthTest: true })
  );
  accent.position.z = width * 0.02;
  marker.add(plate, accent);
  marker.userData.accent = accent;
  return marker;
}

function createMeasurementZone(modelRoot, position, modelSize, modelRadius, ownerDocument) {
  const surface = closestModelSurface(modelRoot, position, modelRadius);
  if (surface === null) return null;
  const canvas = ownerDocument.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 3, 64, 64, 63);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.58)');
  gradient.addColorStop(0.55, 'rgba(255, 255, 255, 0.3)');
  gradient.addColorStop(0.82, 'rgba(255, 255, 255, 0.1)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const orientation = new THREE.Euler().setFromQuaternion(surfaceQuaternion(surface.normal));
  const size = measurementZoneSize(surface.normal, modelSize);
  const depth = Math.max(Math.min(size.x, size.y) * 0.12, modelRadius * 0.005);
  return new THREE.Mesh(
    new DecalGeometry(
      surface.mesh,
      surface.position.clone().addScaledVector(surface.normal, depth * 0.02),
      orientation,
      new THREE.Vector3(size.x, size.y, depth)
    ),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      depthTest: true,
      depthWrite: false,
      map: texture,
      opacity: 0.62,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      transparent: true,
    })
  );
}

function boundedError(error) {
  const message = error instanceof Error ? error.message : 'Unknown model loading error.';
  return message.slice(0, 160);
}

function normalizeSurfaceMode(mode) {
  if (mode === SURFACE_MODE.CONTRAST || mode === SURFACE_MODE.TEXTURED) return mode;
  throw new TypeError('Unknown surface mode.');
}

function contrastSurfaceMaterial(original) {
  const material = new THREE.MeshStandardMaterial({
    color: CONTRAST_SURFACE_COLOR,
    metalness: Math.min(Number.isFinite(original?.metalness) ? original.metalness : 0.12, 0.28),
    roughness: Math.max(Number.isFinite(original?.roughness) ? original.roughness : 0.78, 0.72),
  });
  material.name = `${original?.name || 'rack'} contrast`;
  material.side = original?.side ?? THREE.FrontSide;
  material.envMapIntensity = 0.28;
  return material;
}

export class RackViewer {
  constructor(
    canvas,
    onStateChange = () => {},
    performanceProfile = PERFORMANCE_PROFILE.BALANCED,
    onSpatialSelect = () => {},
    onRegistrationPoint = () => {},
    onReferenceSelect = () => {}
  ) {
    this.canvas = canvas;
    this.onStateChange = onStateChange;
    this.onSpatialSelect = onSpatialSelect;
    this.onRegistrationPoint = onRegistrationPoint;
    this.onReferenceSelect = onReferenceSelect;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xdce3e7);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.01, 1000);
    this.camera.position.set(1, 1, 1);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.78;
    this.performanceProfile = normalizePerformanceProfile(performanceProfile);
    this.renderer.setPixelRatio(
      performancePixelRatio(this.performanceProfile, window.devicePixelRatio)
    );
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.addEventListener('change', this.requestRender);
    const loadingManager = new THREE.LoadingManager();
    loadingManager.setURLModifier((url) => resolveRackModelResourceUrl(url, window.location.href));
    this.loader = new GLTFLoader(loadingManager);
    const telemetryOverlay = createTelemetryOverlay();
    this.telemetryAnchors = telemetryOverlay.anchors;
    this.telemetryAnchorRoot = telemetryOverlay.anchorRoot;
    this.telemetryMarkers = telemetryOverlay.markers;
    this.telemetryOverlayRoot = telemetryOverlay.root;
    this.measurementZoneRoot = telemetryOverlay.zoneRoot;
    this.scene.add(this.telemetryOverlayRoot);
    this.layerVisibility = {
      anchors: true,
      geometry: true,
      zones: true,
      airflow: true,
      soundWaves: true,
    };
    this.effectsActive = true;
    this.sensorEffects = null;
    this.lastFrameTime = null;
    this.reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.reducedMotion = this.reducedMotionQuery.matches;
    this.reducedMotionQuery.addEventListener('change', this.handleReducedMotion);
    this.canvas.ownerDocument.addEventListener('visibilitychange', this.handleEffectVisibility);
    this.activeSpatialMetric = 'temperature';
    this.selectedSpatialKey = null;
    this.registrationEnabled = false;
    this.registrationPointerStart = null;
    this.registrationPreview = null;
    this.modelRadius = 1;
    this.modelSize = new THREE.Vector3(1, 1, 1);
    this.modelRoot = null;
    this.frameHandle = null;
    this.loadRevision = 0;
    this.destroyed = false;
    this.surfaceMode = SURFACE_MODE.TEXTURED;
    this.inspectionMode = true;
    this.contrastMaterials = new Map();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    const environment = new RoomEnvironment();
    const generator = new THREE.PMREMGenerator(this.renderer);
    this.environmentTarget = generator.fromScene(environment, 0.04);
    this.scene.environment = this.environmentTarget.texture;
    this.scene.environmentIntensity = 0.5;
    environment.dispose();
    generator.dispose();

    this.scene.add(new THREE.HemisphereLight(0xf7fafb, 0x46515a, 0.9));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.3);
    keyLight.position.set(1, 1.5, 1);
    const fillLight = new THREE.DirectionalLight(0xdde8ee, 0.75);
    fillLight.position.set(-1, 0.7, -1);
    this.scene.add(keyLight, fillLight);

    this.canvas.addEventListener('pointerdown', this.rememberRegistrationPointer);
    this.canvas.addEventListener('click', this.handleCanvasClick);
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(canvas);
    this.resize();
    this.setState(MODEL_STATE.UNCONFIGURED);
  }

  requestRender = () => {
    if (this.destroyed || this.frameHandle !== null) return;
    this.frameHandle = requestAnimationFrame((timestamp) => {
      this.frameHandle = null;
      const delta =
        this.lastFrameTime === null
          ? 0
          : Math.min(Math.max((timestamp - this.lastFrameTime) / 1000, 0), 0.1);
      this.lastFrameTime = timestamp;
      const animate = this.sensorEffects ? stepSensorEffects(this.sensorEffects, delta) : false;
      this.renderer.render(this.scene, this.camera);
      if (animate) this.requestRender();
      else this.lastFrameTime = null;
    });
  };

  handleReducedMotion = (event) => {
    this.reducedMotion = event.matches;
    this.synchronizeSensorEffects();
  };

  handleEffectVisibility = () => this.synchronizeSensorEffects();

  setEffectsActive(active) {
    this.effectsActive = Boolean(active);
    this.lastFrameTime = null;
    this.synchronizeSensorEffects();
  }

  synchronizeSensorEffects(now = Date.now()) {
    if (!this.sensorEffects) return;
    updateSensorEffects(
      this.sensorEffects,
      this.telemetryAnchors,
      this.activeSpatialMetric,
      {
        active: this.effectsActive !== false && !this.canvas.ownerDocument.hidden,
        sensors: this.layerVisibility.anchors,
        zones: this.layerVisibility.zones,
        airflow: this.layerVisibility.airflow !== false,
        soundWaves: this.layerVisibility.soundWaves !== false,
        reducedMotion: this.reducedMotion === true,
        now,
      },
      measurementColor
    );
    this.requestRender();
  }

  resize = () => {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  };

  rememberRegistrationPointer = (event) => {
    this.registrationPointerStart = new THREE.Vector2(event.clientX, event.clientY);
  };

  handleCanvasClick = (event) => {
    const bounds = this.canvas.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return;
    if (
      this.registrationPointerStart?.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 5
    ) {
      return;
    }
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1
    );
    if (this.registrationEnabled) {
      const position = modelLocalIntersection(
        this.raycaster,
        this.pointer,
        this.camera,
        this.modelRoot
      );
      this.setRegistrationPreview(position);
      this.onRegistrationPoint(position);
      return;
    }
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const context = pickSpatialSensor(
      this.raycaster,
      this.modelRoot,
      this.telemetryMarkers.values()
    );
    if (context) this.onSpatialSelect(context);
    else {
      const reference = pickRackReference(this.raycaster, this.modelRoot);
      if (reference) this.onReferenceSelect(reference);
    }
  };

  setRegistrationMode(enabled) {
    this.registrationEnabled = Boolean(enabled);
    this.registrationPointerStart = null;
    this.canvas.dataset.registrationMode = String(this.registrationEnabled);
    if (!this.registrationEnabled) this.setRegistrationPreview(null);
  }

  setRegistrationPreview(position) {
    if (position === null) {
      if (this.registrationPreview !== null) this.registrationPreview.visible = false;
      this.requestRender();
      return;
    }
    if (this.registrationPreview === null) {
      const radius = Math.max(this.modelRadius * 0.011, 0.01);
      this.registrationPreview = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 14, 8),
        new THREE.MeshBasicMaterial({
          color: PREVIEW_COLOR,
          depthTest: false,
          opacity: 0.78,
          transparent: true,
          wireframe: true,
        })
      );
      this.telemetryOverlayRoot.add(this.registrationPreview);
    }
    this.registrationPreview.position.fromArray(position);
    this.registrationPreview.visible = true;
    this.requestRender();
  }

  setPerformanceProfile(profile) {
    this.performanceProfile = normalizePerformanceProfile(profile);
    this.renderer.setPixelRatio(
      performancePixelRatio(this.performanceProfile, window.devicePixelRatio)
    );
    this.resize();
    return this.performanceProfile;
  }

  setLayerVisibility(layer, visible) {
    if (!Object.hasOwn(this.layerVisibility, layer)) throw new TypeError('Unknown viewer layer.');
    this.layerVisibility[layer] = Boolean(visible);
    if (layer === 'geometry' && this.modelRoot !== null) {
      if (this.modelRoot.userData.rackLayout) {
        for (const component of this.modelRoot.children)
          if (component.name !== 'sensors') component.visible = Boolean(visible);
      } else this.modelRoot.visible = Boolean(visible);
    }
    if (layer === 'anchors') this.telemetryAnchorRoot.visible = Boolean(visible);
    if (layer === 'anchors') {
      const sensors = this.modelRoot?.getObjectByName('sensors');
      if (sensors) sensors.visible = Boolean(visible);
    }
    if (layer === 'zones') this.measurementZoneRoot.visible = Boolean(visible);
    this.synchronizeSensorEffects();
    this.requestRender();
  }

  contrastMaterialFor(material) {
    this.contrastMaterials ??= new Map();
    if (this.contrastMaterials.has(material)) return this.contrastMaterials.get(material);
    const contrast = contrastSurfaceMaterial(material);
    this.contrastMaterials.set(material, contrast);
    return contrast;
  }

  restoreSurfaceMaterials(root = this.modelRoot) {
    root?.traverse((object) => {
      if (!object.isMesh || object.userData.originalSurfaceMaterial === undefined) return;
      object.material = object.userData.originalSurfaceMaterial;
    });
  }

  applySurfaceMode(root = this.modelRoot) {
    if (root === null) return;
    this.surfaceMode ??= SURFACE_MODE.TEXTURED;
    root.traverse((object) => {
      if (!object.isMesh) return;
      if (object.userData.preserveSurface || object.material.transparent) return;
      object.userData.originalSurfaceMaterial ??= object.material;
      if (this.surfaceMode === SURFACE_MODE.TEXTURED) {
        object.material = object.userData.originalSurfaceMaterial;
        return;
      }
      object.material = Array.isArray(object.userData.originalSurfaceMaterial)
        ? object.userData.originalSurfaceMaterial.map((material) =>
            this.contrastMaterialFor(material)
          )
        : this.contrastMaterialFor(object.userData.originalSurfaceMaterial);
    });
  }

  setSurfaceMode(mode) {
    this.surfaceMode = normalizeSurfaceMode(mode);
    this.applySurfaceMode();
    this.requestRender();
    return this.surfaceMode;
  }

  setInspectionMode(enabled) {
    this.inspectionMode = Boolean(enabled);
    setRackInspection(this.modelRoot, this.inspectionMode);
    this.requestRender();
    return this.inspectionMode;
  }

  installationPlacements(sources) {
    return rackSourcePlacements(sources, this.modelRoot?.userData.rackLayout ?? {});
  }

  setSpatialAnchors(anchors = []) {
    const normalized = normalizeSpatialAnchors(anchors);
    clearOwnedGroup(this.telemetryAnchorRoot);
    clearOwnedGroup(this.measurementZoneRoot);
    this.sensorEffects = null;
    this.telemetryAnchors.clear();
    this.telemetryMarkers.clear();
    for (const anchor of normalized) {
      const position = new THREE.Vector3().fromArray(anchor.position);
      const markerKey = physicalAnchorKey(anchor);
      let marker = this.telemetryMarkers.get(markerKey) ?? null;
      if (marker === null && this.modelRoot !== null) {
        marker =
          anchor.registration_state === 'installation_reference'
            ? (this.modelRoot.getObjectByName(anchor.module_id) ?? null)
            : createSensorMarker(
                this.modelRoot,
                position,
                this.modelSize,
                this.modelRadius,
                this.canvas.ownerDocument
              );
        if (marker !== null) {
          marker.scale.setScalar(1);
          this.telemetryMarkers.set(markerKey, marker);
          if (!marker.userData.sensorModule) this.telemetryAnchorRoot.add(marker);
        }
      }
      this.telemetryAnchors.set(spatialAnchorKey(anchor), {
        anchor,
        marker,
        markerKey,
        record: null,
        zone: null,
      });
    }
    this.selectedSpatialKey = null;
    if (this.modelRoot?.userData.rackLayout) {
      this.sensorEffects = createSensorEffects(this.modelRoot, normalized);
      this.measurementZoneRoot.add(this.sensorEffects.root);
    }
    this.requestRender();
    return normalized.length;
  }

  hasSpatialAnchor(record) {
    return this.telemetryAnchors.has(spatialAnchorKey(record));
  }

  setSpatialSelection(context) {
    this.selectedSpatialKey = context === null ? null : spatialAnchorKey(context);
    const selectedMarkerKey = this.telemetryAnchors.get(this.selectedSpatialKey)?.markerKey;
    for (const [key, marker] of this.telemetryMarkers) {
      marker.scale.setScalar(key === selectedMarkerKey ? 1.35 : 1);
    }
    this.requestRender();
  }

  updateSpatialMeasurements(records = [], metric = this.activeSpatialMetric) {
    const presentation = SPATIAL_METRIC[metric];
    if (!presentation) throw new TypeError('Unknown spatial measurement metric.');
    this.activeSpatialMetric = metric;
    const metrics = presentation.metrics ?? [metric];
    const matching = new Map(
      records
        .filter(
          (record) =>
            metrics.includes(record?.metric) &&
            record.unit === SPATIAL_METRIC[record.metric]?.unit &&
            Number.isFinite(record.value) &&
            this.telemetryAnchors.get(spatialAnchorKey(record))?.anchor.metric === record.metric
        )
        .map((record) => [spatialAnchorKey(record), record])
    );
    const values = [...matching.values()].map((record) => record.value);
    const minimum = values.length === 0 ? null : Math.min(...values);
    const maximum = values.length === 0 ? null : Math.max(...values);
    let zoneCount = 0;

    for (const marker of this.telemetryMarkers.values()) {
      marker.visible = marker.userData.sensorModule === true;
      marker.traverse((object) => {
        delete object.userData.spatialContext;
      });
      marker.userData.accent.material.color.copy(ANCHOR_COLOR);
    }

    for (const [key, entry] of this.telemetryAnchors) {
      const metricMatches = metrics.includes(entry.anchor.metric);
      const record = matching.get(key) ?? null;
      entry.record = record;
      if (metricMatches && entry.marker !== null) {
        entry.marker.visible = true;
        entry.marker.userData.spatialContext = entry.anchor;
        entry.marker.traverse((object) => {
          object.userData.spatialContext = entry.anchor;
        });
      }
      if (!metricMatches || record === null) {
        if (entry.zone !== null) entry.zone.visible = false;
        continue;
      }

      const color = measurementColor(metric, record.value);
      entry.marker?.userData.accent.material.color.copy(color ?? ANCHOR_COLOR);
      if (!presentation.zones || entry.anchor.registration_state === 'installation_reference') {
        if (entry.zone !== null) entry.zone.visible = false;
        continue;
      }
      if (entry.zone === null) {
        entry.zone = createMeasurementZone(
          this.modelRoot,
          new THREE.Vector3().fromArray(entry.anchor.position),
          this.modelSize,
          this.modelRadius,
          this.canvas.ownerDocument
        );
        if (entry.zone === null) continue;
        entry.zone.userData.spatialAnchorKey = key;
        this.measurementZoneRoot.add(entry.zone);
      }
      entry.zone.material.color.copy(color);
      entry.zone.visible = true;
      zoneCount += 1;
    }

    const selectedRecord =
      this.selectedSpatialKey === null ? null : (matching.get(this.selectedSpatialKey) ?? null);
    this.setSpatialSelection(selectedRecord);
    this.synchronizeSensorEffects();
    this.requestRender();
    return {
      anchorCount: this.telemetryAnchors.size,
      count: matching.size,
      label: presentation.label,
      maximum,
      minimum,
      metric,
      unit: presentation.unit,
      zoneCount,
      moduleCount: new Set(
        [...matching.keys()].map((key) => this.telemetryAnchors.get(key).markerKey)
      ).size,
      zonesApplicable: !this.modelRoot?.userData.rackLayout,
    };
  }

  setState(state, message = '') {
    this.state = state;
    this.onStateChange({ state, message });
  }

  frameModel(root) {
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(root);
    if (bounds.isEmpty()) throw new Error('Rack model contains no renderable bounds.');

    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    bounds.getSize(this.modelSize);
    this.modelRadius = sphere.radius;
    const verticalHalfFov = THREE.MathUtils.degToRad(this.camera.fov) / 2;
    const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * this.camera.aspect);
    const halfFov = Math.min(verticalHalfFov, horizontalHalfFov);
    const distance = (sphere.radius / Math.sin(halfFov)) * 1.08;
    const far = distance + sphere.radius * 10;
    if (!(sphere.radius > 0) || !Number.isFinite(distance) || !Number.isFinite(far)) {
      throw new Error('Rack model bounds are invalid.');
    }

    const direction = this.camera.position.clone().sub(this.controls.target);
    if (root.userData.rackLayout && this.modelRoot !== root) direction.set(0.28, 0.1, 1);
    if (direction.lengthSq() === 0) direction.set(1, 1, 1);
    direction.normalize();
    this.camera.position.copy(sphere.center).addScaledVector(direction, distance);
    this.camera.near = Math.max(Number.EPSILON, sphere.radius / 1000);
    this.camera.far = far;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(sphere.center);
    this.controls.update();
  }

  frameActiveModel() {
    if (this.destroyed || this.modelRoot === null) return false;
    this.frameModel(this.modelRoot);
    this.requestRender();
    return true;
  }

  acceptanceAnchorPositions() {
    return middleCabinetSurfaces(this.modelRoot);
  }

  async loadModel(config) {
    const revision = ++this.loadRevision;
    this.removeModel();

    let parsed;
    try {
      parsed = parseRackModelConfig(config, window.location.href);
    } catch (error) {
      this.setState(MODEL_STATE.ERROR, boundedError(error));
      return false;
    }
    if (parsed === null) {
      const root = createFunctionalProxy();
      this.frameModel(root);
      this.modelRoot = root;
      root.visible = this.layerVisibility?.geometry ?? true;
      this.applySurfaceMode(root);
      this.scene.add(root);
      this.setState(MODEL_STATE.UNCONFIGURED, PROXY_MESSAGE);
      this.requestRender();
      return false;
    }

    this.setState(MODEL_STATE.LOADING);
    let root = null;
    try {
      if (parsed.kind === 'rack') root = createRackModel(parsed.layout);
      else root = (await this.loader.loadAsync(parsed.url)).scene;
      if (revision !== this.loadRevision || this.destroyed) {
        disposeModel(root);
        return false;
      }
      if (parsed.kind !== 'rack') {
        root.position.fromArray(parsed.position);
        root.rotation.set(...parsed.rotation);
        root.scale.fromArray(parsed.scale);
      }
      this.frameModel(root);
      this.modelRoot = root;
      setRackInspection(root, this.inspectionMode);
      const sensors = root.getObjectByName('sensors');
      if (sensors) sensors.visible = this.layerVisibility?.anchors ?? true;
      if (root.userData.rackLayout) {
        for (const component of root.children)
          if (component.name !== 'sensors')
            component.visible = this.layerVisibility?.geometry ?? true;
      } else root.visible = this.layerVisibility?.geometry ?? true;
      this.applySurfaceMode(root);
      this.scene.add(root);
      if (this.telemetryAnchors?.size > 0) {
        this.setSpatialAnchors([...this.telemetryAnchors.values()].map(({ anchor }) => anchor));
      }
      this.setState(MODEL_STATE.READY);
      this.requestRender();
      return true;
    } catch (error) {
      if (root !== null && this.modelRoot !== root) disposeModel(root);
      if (revision === this.loadRevision && !this.destroyed) {
        const message = boundedError(error);
        this.setState(MODEL_STATE.ERROR, message);
        console.error(`Rack model load failed: ${message}`);
      }
      return false;
    }
  }

  removeModel() {
    if (this.modelRoot === null) return;
    if (this.sensorEffects) {
      this.measurementZoneRoot.remove(this.sensorEffects.root);
      disposeModel(this.sensorEffects.root);
      this.sensorEffects = null;
    }
    this.scene.remove(this.modelRoot);
    this.restoreSurfaceMaterials(this.modelRoot);
    disposeModel(this.modelRoot);
    for (const material of this.contrastMaterials?.values() ?? []) material.dispose();
    this.contrastMaterials?.clear();
    this.modelRoot = null;
    this.requestRender();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    ++this.loadRevision;
    if (this.frameHandle !== null) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = null;
    this.canvas.removeEventListener('pointerdown', this.rememberRegistrationPointer);
    this.canvas.removeEventListener('click', this.handleCanvasClick);
    this.resizeObserver.disconnect();
    this.reducedMotionQuery?.removeEventListener('change', this.handleReducedMotion);
    this.canvas.ownerDocument.removeEventListener('visibilitychange', this.handleEffectVisibility);
    this.controls.removeEventListener('change', this.requestRender);
    this.controls.dispose();
    this.removeModel();
    clearOwnedGroup(this.telemetryAnchorRoot);
    clearOwnedGroup(this.measurementZoneRoot);
    if (this.registrationPreview !== null) disposeModel(this.registrationPreview);
    this.telemetryAnchors.clear();
    this.scene.remove(this.telemetryOverlayRoot);
    this.environmentTarget.dispose();
    this.renderer.dispose();
  }
}
