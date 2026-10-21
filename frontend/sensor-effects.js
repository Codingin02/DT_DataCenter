import * as THREE from 'three';
import { observationState } from './presentation.js';

export const VISUAL_INFLUENCE_RADIUS_M = 0.3;

function fresh(record, now) {
  return (
    record?.quality === 'good' &&
    Number.isFinite(record.value) &&
    Number.isFinite(Date.parse(record.source_ts)) &&
    Number.isFinite(Date.parse(record.received_at)) &&
    observationState(record, now) === 'fresh'
  );
}

function featherTexture() {
  const size = 64;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const radiusSquared = (((x + 0.5) / size) * 2 - 1) ** 2 + (((y + 0.5) / size) * 2 - 1) ** 2;
      const index = (y * size + x) * 4;
      pixels[index] = pixels[index + 1] = pixels[index + 2] = 255;
      pixels[index + 3] = Math.round(255 * Math.max(0, 1 - radiusSquared) ** 3);
    }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.needsUpdate = true;
  return texture;
}

function noPicking() {}

export function createSensorEffects(modelRoot, anchors) {
  const root = new THREE.Group();
  root.name = 'sensor-effects';
  root.visible = false;
  root.userData.illustrative = true;
  const fields = [];
  const sounds = [];
  const texture = featherTexture();
  const radius = VISUAL_INFLUENCE_RADIUS_M;
  let plane;
  let ringGeometry;
  modelRoot.updateMatrixWorld(true);
  for (const anchor of anchors) {
    const key = JSON.stringify([anchor.asset_id, anchor.sensor_id]);
    if (['sht31-a', 'sht31-b'].includes(anchor.module_id) && anchor.metric === 'temperature') {
      const group = new THREE.Group();
      group.name = `${anchor.module_id}-temperature-field`;
      group.position.fromArray(anchor.position).applyMatrix4(modelRoot.matrixWorld);
      group.userData.visualInfluenceRadiusM = radius;
      group.userData.positionVerified = anchor.position_verified;
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      plane ??= new THREE.PlaneGeometry(radius * 2, radius * 2);
      for (const [x, y] of [
        [0, 0],
        [Math.PI / 2, 0],
        [0, Math.PI / 2],
      ]) {
        const mesh = new THREE.Mesh(plane, material);
        mesh.rotation.set(x, y, 0);
        mesh.raycast = noPicking;
        group.add(mesh);
      }
      root.add(group);
      fields.push({ key, group, material, record: null, color: new THREE.Color(), fresh: false });
    }
    if (anchor.module_id === 'inmp441' && anchor.metric === 'sound_rms_dbfs') {
      const group = new THREE.Group();
      group.name = 'inmp441-sound-waves';
      ringGeometry ??= new THREE.RingGeometry(0.96, 1, 48);
      group.position.fromArray(anchor.position).applyMatrix4(modelRoot.matrixWorld);
      for (let index = 0; index < 3; index++) {
        const ring = new THREE.Mesh(
          ringGeometry,
          new THREE.MeshBasicMaterial({
            color: 0x718f8b,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0,
            depthWrite: false,
          })
        );
        ring.raycast = noPicking;
        group.add(ring);
      }
      root.add(group);
      const peak = anchors.find(
        (candidate) => candidate.module_id === 'inmp441' && candidate.metric === 'sound_peak_dbfs'
      );
      sounds.push({
        key,
        peakKey: peak ? JSON.stringify([peak.asset_id, peak.sensor_id]) : null,
        group,
        record: null,
        peak: null,
      });
    }
  }
  const count = 24;
  const particles = new THREE.BufferGeometry();
  particles.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  particles.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 4), 4));
  const airflow = new THREE.Points(
    particles,
    new THREE.PointsMaterial({
      size: 0.015,
      map: texture,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    })
  );
  airflow.name = 'illustrative-upward-airflow';
  airflow.userData.direction = 'upward_illustrative';
  airflow.frustumCulled = false;
  airflow.raycast = noPicking;
  root.add(airflow);
  return {
    root,
    fields,
    sounds,
    airflow,
    modelRoot,
    phase: 0,
    activeCount: 0,
    state: null,
    point: new THREE.Vector3(),
    neutral: new THREE.Color(0x83949a),
  };
}

export function updateSensorEffects(effects, entries, metric, state, colorFor) {
  effects.state = state;
  effects.metric = metric;
  for (const field of effects.fields) {
    field.record = entries.get(field.key)?.record ?? null;
    const color = field.record ? colorFor('temperature', field.record.value) : null;
    if (color) field.color.copy(color);
  }
  for (const sound of effects.sounds) {
    sound.record = entries.get(sound.key)?.record ?? null;
    sound.peak = entries.get(sound.peakKey)?.record ?? null;
  }
  return stepSensorEffects(effects, 0, state.now);
}

export function stepSensorEffects(effects, deltaSeconds, now = Date.now()) {
  const state = effects.state;
  effects.activeCount = 0;
  effects.root.visible = Boolean(state?.active && state.sensors && state.zones);
  if (!effects.root.visible) return false;
  // Display-only phase: it represents neither airflow velocity nor acoustic frequency.
  if (!state.reducedMotion) effects.phase = (effects.phase + Math.max(0, deltaSeconds) * 0.18) % 1;
  let thermal = 0;
  for (const field of effects.fields) {
    field.fresh = effects.metric === 'temperature' && fresh(field.record, now);
    field.group.visible = field.fresh;
    if (field.fresh) {
      field.material.color.copy(field.color);
      thermal++;
    }
  }
  effects.airflow.visible = thermal > 0 && state.airflow;
  if (effects.airflow.visible) {
    const positions = effects.airflow.geometry.attributes.position;
    const colors = effects.airflow.geometry.attributes.color;
    const layout = effects.modelRoot.userData.rackLayout;
    for (let index = 0; index < positions.count; index++) {
      const phase = (index / positions.count + effects.phase) % 1;
      const y = 0.12 + phase * (layout.height - 0.18);
      const bend = THREE.MathUtils.smoothstep(y, layout.height - 0.48, layout.height - 0.08);
      effects.point
        .set(
          (index % 2 ? -1 : 1) *
            THREE.MathUtils.lerp(layout.width / 2 - 0.045, layout.fanColumnSpacing / 2, bend),
          y,
          THREE.MathUtils.lerp(0.1, -layout.fanRowSpacing / 2, bend)
        )
        .applyMatrix4(effects.modelRoot.matrixWorld);
      positions.setXYZ(index, effects.point.x, effects.point.y, effects.point.z);
      let color = effects.neutral;
      for (const field of effects.fields)
        if (
          field.fresh &&
          effects.point.distanceToSquared(field.group.position) < VISUAL_INFLUENCE_RADIUS_M ** 2
        )
          color = field.color;
      colors.setXYZW(index, color.r, color.g, color.b, Math.sin(phase * Math.PI) * 0.75);
    }
    positions.needsUpdate = colors.needsUpdate = true;
  }
  let acoustic = 0;
  for (const sound of effects.sounds) {
    const record = fresh(sound.record, now)
      ? sound.record
      : fresh(sound.peak, now)
        ? sound.peak
        : null;
    sound.group.visible =
      effects.metric === 'acoustic' && state.soundWaves && record !== null && record.value <= 0;
    if (!sound.group.visible) continue;
    acoustic++;
    const intensity = THREE.MathUtils.clamp((record.value + 80) / 80, 0, 1);
    for (let index = 0; index < sound.group.children.length; index++) {
      const ring = sound.group.children[index];
      const phase = (effects.phase + index / 3) % 1;
      ring.scale.setScalar(0.025 + phase * 0.13);
      ring.material.opacity = (0.18 + intensity * 0.38) * (1 - phase) ** 2;
    }
  }
  effects.activeCount = thermal + acoustic;
  effects.root.visible = effects.activeCount > 0;
  return !state.reducedMotion && (effects.airflow.visible || acoustic > 0);
}
