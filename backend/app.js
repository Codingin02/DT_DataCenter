import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { TextDecoder } from 'node:util';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { createMetrics, PROMETHEUS_CONTENT_TYPE } from './metrics.js';

const telemetrySchema = JSON.parse(
  readFileSync(new URL('../docs/contracts/telemetry.schema.json', import.meta.url), 'utf8')
);
const currentStateSchema = JSON.parse(
  readFileSync(new URL('../docs/contracts/current-state.schema.json', import.meta.url), 'utf8')
);
const deviceStatusSchema = JSON.parse(
  readFileSync(new URL('../docs/contracts/device-status.schema.json', import.meta.url), 'utf8')
);

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

const validateTelemetry = ajv.compile(telemetrySchema);
const validateDeviceStatus = ajv.compile(deviceStatusSchema);
const validateCurrentState = ajv.compile(currentStateSchema);
const canonicalIdPattern = new RegExp(telemetrySchema.$defs.canonical_id.pattern);
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
export const DEFAULT_MAX_PAYLOAD_BYTES = 64 * 1024;

const acceptMeasurementSql = `
  SELECT outcome, persisted_measurement_id, resulting_state_version
  FROM digital_twin.accept_measurement(
    $1::text,
    $2::text,
    $3::digital_twin.canonical_id,
    $4::digital_twin.canonical_id,
    $5::text,
    $6::bigint,
    $7::digital_twin.canonical_id,
    $8::digital_twin.canonical_id,
    $9::digital_twin.canonical_id,
    $10::digital_twin.finite_number,
    $11::digital_twin.unit_code,
    $12::timestamptz,
    $13::digital_twin.telemetry_quality,
    $14::integer
  )`;

const recordRejectionSql = `
  SELECT digital_twin.record_ingestion_rejection(
    $1::text,
    $2::text,
    $3::digital_twin.canonical_id,
    $4::text
  )`;

const recordDeviceStatusSql = `
  SELECT outcome,
    reason_code,
    resulting_status AS status,
    resulting_boot_id AS boot_id,
    resulting_received_at AS received_at,
    resulting_state_versions
  FROM digital_twin.record_device_status(
    $1::digital_twin.canonical_id,
    $2::digital_twin.canonical_id,
    $3::text,
    $4::text
  )`;

const readCurrentStateSql = `
  SELECT *
  FROM digital_twin.current_state
  WHERE asset_id = $1::digital_twin.canonical_id
  ORDER BY metric, sensor_id`;

const readHistorySql = `
  SELECT
    sensor_id,
    unit,
    date_bin($6::integer * interval '1 second', ts, timestamptz '2000-01-01') AS bucket,
    avg(value) AS average,
    min(value) AS minimum,
    max(value) AS maximum,
    count(*) AS sample_count
  FROM digital_twin.measurements
  WHERE asset_id = $1::digital_twin.canonical_id
    AND metric = $2::digital_twin.canonical_id
    AND ($3::digital_twin.canonical_id IS NULL OR sensor_id = $3)
    AND ts >= $4::timestamptz
    AND ts < $5::timestamptz
  GROUP BY sensor_id, unit, bucket
  ORDER BY sensor_id, bucket`;

const readAcceptedCurrentStateSql = `
  SELECT *
  FROM digital_twin.current_state
  WHERE measurement_id = $1::bigint
    AND state_version = $2::bigint`;

const readChangedCurrentStateSql = `
  SELECT *
  FROM digital_twin.current_state
  WHERE state_version = ANY($1::bigint[])
  ORDER BY state_version`;

const readSpatialRegistrationSql = `
  SELECT
    s.sensor_id,
    s.device_id,
    s.asset_id,
    s.metric,
    s.unit,
    cs.coordinate_system_id,
    cs.unit AS coordinate_unit,
    cs.handedness,
    cs.up_axis,
    cs.registration_verified,
    sp.position_x,
    sp.position_y,
    sp.position_z,
    sp.position_verified,
    sp.position_version,
    sp.recorded_at
  FROM digital_twin.sensors AS s
  LEFT JOIN digital_twin.coordinate_systems AS cs
    ON cs.site_id = s.site_id
   AND cs.is_canonical
  LEFT JOIN digital_twin.sensor_positions AS sp
    ON sp.site_id = s.site_id
   AND sp.sensor_id = s.sensor_id
   AND sp.coordinate_system_id = cs.coordinate_system_id
   AND sp.is_current
  WHERE s.enabled
  ORDER BY s.asset_id, s.sensor_id, s.metric`;

const registerSpatialAnchorSql = `
  WITH locked AS (
    SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))
  ),
  source AS (
    SELECT
      s.site_id,
      s.sensor_id,
      s.device_id,
      s.asset_id,
      s.metric,
      s.unit,
      cs.coordinate_system_id
    FROM digital_twin.sensors AS s
    JOIN digital_twin.coordinate_systems AS cs
      ON cs.site_id = s.site_id
     AND cs.coordinate_system_id = $2::digital_twin.canonical_id
     AND cs.is_canonical
    CROSS JOIN locked
    WHERE s.sensor_id = $1::digital_twin.canonical_id
      AND s.enabled
  ),
  next_position AS (
    SELECT
      source.*,
      COALESCE(MAX(sp.position_version), 0) + 1 AS position_version
    FROM source
    LEFT JOIN digital_twin.sensor_positions AS sp
      ON sp.site_id = source.site_id
     AND sp.sensor_id = source.sensor_id
    GROUP BY
      source.site_id,
      source.sensor_id,
      source.device_id,
      source.asset_id,
      source.metric,
      source.unit,
      source.coordinate_system_id
  ),
  retired AS (
    UPDATE digital_twin.sensor_positions AS sp
    SET is_current = false
    FROM source
    WHERE sp.site_id = source.site_id
      AND sp.sensor_id = source.sensor_id
      AND sp.is_current
    RETURNING sp.sensor_id
  ),
  inserted AS (
    INSERT INTO digital_twin.sensor_positions (
      site_id,
      sensor_id,
      coordinate_system_id,
      position_x,
      position_y,
      position_z,
      position_verified,
      position_version,
      is_current
    )
    SELECT
      next_position.site_id,
      next_position.sensor_id,
      next_position.coordinate_system_id,
      $3::digital_twin.finite_number,
      $4::digital_twin.finite_number,
      $5::digital_twin.finite_number,
      false,
      next_position.position_version,
      true
    FROM next_position
    CROSS JOIN (SELECT count(*) FROM retired) AS retirement_barrier
    RETURNING *
  )
  SELECT
    source.sensor_id,
    source.device_id,
    source.asset_id,
    source.metric,
    source.unit,
    inserted.coordinate_system_id,
    inserted.position_x,
    inserted.position_y,
    inserted.position_z,
    inserted.position_verified,
    inserted.position_version,
    inserted.recorded_at
  FROM inserted
  JOIN source USING (site_id, sensor_id, coordinate_system_id)`;

function validationReason(payload) {
  if (payload && Object.hasOwn(payload, 'schema_version') && payload.schema_version !== '1.0') {
    return 'unsupported-schema-version';
  }

  if (
    payload &&
    typeof payload.metric === 'string' &&
    typeof payload.unit === 'string' &&
    !telemetrySchema.oneOf.some(
      ({ properties }) =>
        properties.metric.const === payload.metric && properties.unit.const === payload.unit
    )
  ) {
    return 'unsupported-metric-unit';
  }

  return 'schema-validation';
}

function sanitizeDiagnosticText(value) {
  return typeof value === 'string' ? value.replaceAll('\0', '\uFFFD') : value;
}

async function recordRejection(query, topic, rawPayload, reasonCode, reasonDetail = null) {
  await query(recordRejectionSql, [
    sanitizeDiagnosticText(topic),
    sanitizeDiagnosticText(rawPayload),
    reasonCode,
    sanitizeDiagnosticText(reasonDetail),
  ]);
  return { outcome: 'rejected', reason_code: reasonCode };
}

export function createIngestor({
  query,
  maxPayloadBytes = DEFAULT_MAX_PAYLOAD_BYTES,
  onCurrentState,
}) {
  if (!Number.isSafeInteger(maxPayloadBytes) || maxPayloadBytes < 1) {
    throw new Error('maxPayloadBytes must be a positive safe integer.');
  }
  if (onCurrentState !== undefined && typeof onCurrentState !== 'function') {
    throw new Error('onCurrentState must be a function.');
  }

  return async function ingest(topic, payload) {
    const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
    if (bytes.length > maxPayloadBytes) {
      return recordRejection(
        query,
        topic,
        null,
        'payload-too-large',
        `Payload exceeds ${maxPayloadBytes} bytes.`
      );
    }

    let rawPayload;
    let telemetry;
    try {
      rawPayload = utf8Decoder.decode(bytes);
      telemetry = JSON.parse(rawPayload);
    } catch (error) {
      return recordRejection(query, topic, rawPayload ?? null, 'malformed-json', error.message);
    }

    if (!validateTelemetry(telemetry)) {
      const detail = ajv.errorsText(validateTelemetry.errors, { separator: '; ' }).slice(0, 1000);
      return recordRejection(query, topic, rawPayload, validationReason(telemetry), detail);
    }

    const expectedTopic = `dt/${telemetry.site_id}/telemetry/${telemetry.device_id}/${telemetry.sensor_id}/${telemetry.metric}`;
    if (topic !== expectedTopic) {
      return recordRejection(query, topic, rawPayload, 'topic-mismatch');
    }

    if (telemetry.quality === 'invalid') {
      return recordRejection(query, topic, rawPayload, 'invalid-quality');
    }

    const { rows } = await query(acceptMeasurementSql, [
      topic,
      telemetry.schema_version,
      telemetry.site_id,
      telemetry.device_id,
      telemetry.boot_id,
      telemetry.seq,
      telemetry.sensor_id,
      telemetry.asset_id,
      telemetry.metric,
      telemetry.value,
      telemetry.unit,
      telemetry.ts,
      telemetry.quality,
      telemetry.raw_value ?? null,
    ]);
    const result = rows[0];
    if (!result || !['accepted', 'duplicate', 'rejected'].includes(result.outcome)) {
      throw new Error('PostgreSQL returned an invalid ingestion result.');
    }

    if (result.outcome === 'accepted' && onCurrentState) {
      const currentState = await query(readAcceptedCurrentStateSql, [
        result.persisted_measurement_id,
        result.resulting_state_version,
      ]);
      if (currentState.rows.length > 1) {
        throw new Error('PostgreSQL returned multiple canonical current-state rows.');
      }
      if (currentState.rows[0]) {
        onCurrentState(normalizeCurrentState(currentState.rows[0]));
      }
    }

    return result;
  };
}

export function createDeviceStatusIngestor({
  query,
  maxPayloadBytes = DEFAULT_MAX_PAYLOAD_BYTES,
  onCurrentState,
}) {
  if (!Number.isSafeInteger(maxPayloadBytes) || maxPayloadBytes < 1) {
    throw new Error('maxPayloadBytes must be a positive safe integer.');
  }
  if (onCurrentState !== undefined && typeof onCurrentState !== 'function') {
    throw new Error('onCurrentState must be a function.');
  }

  return async function ingestDeviceStatus(topic, payload) {
    const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
    if (bytes.length > maxPayloadBytes) {
      return recordRejection(
        query,
        topic,
        null,
        'payload-too-large',
        `Payload exceeds ${maxPayloadBytes} bytes.`
      );
    }

    let rawPayload;
    let deviceStatus;
    try {
      rawPayload = utf8Decoder.decode(bytes);
      deviceStatus = JSON.parse(rawPayload);
    } catch (error) {
      return recordRejection(query, topic, rawPayload ?? null, 'malformed-json', error.message);
    }

    if (!validateDeviceStatus(deviceStatus)) {
      const reasonCode =
        deviceStatus?.schema_version !== undefined && deviceStatus.schema_version !== '1.0'
          ? 'unsupported-schema-version'
          : 'schema-validation';
      const detail = ajv
        .errorsText(validateDeviceStatus.errors, { separator: '; ' })
        .slice(0, 1000);
      return recordRejection(query, topic, rawPayload, reasonCode, detail);
    }

    const expectedTopic = `dt/${deviceStatus.site_id}/device/${deviceStatus.device_id}/status`;
    if (topic !== expectedTopic) {
      return recordRejection(query, topic, rawPayload, 'topic-mismatch');
    }

    const { rows } = await query(recordDeviceStatusSql, [
      deviceStatus.site_id,
      deviceStatus.device_id,
      deviceStatus.boot_id,
      deviceStatus.status,
    ]);
    const result = rows[0];
    if (!result || !['accepted', 'rejected'].includes(result.outcome)) {
      throw new Error('PostgreSQL returned an invalid device-status result.');
    }

    if (result.outcome === 'accepted') {
      if (!Array.isArray(result.resulting_state_versions)) {
        throw new Error('PostgreSQL returned invalid device-status state versions.');
      }
      const stateVersions = result.resulting_state_versions.map((value) =>
        toDecimalString(value, 'state_version')
      );
      if (onCurrentState && stateVersions.length > 0) {
        const currentState = await query(readChangedCurrentStateSql, [stateVersions]);
        for (const row of currentState.rows) {
          onCurrentState(normalizeCurrentState(row));
        }
      }
    }

    return result;
  };
}

function toIsoString(value, field) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`PostgreSQL returned an invalid ${field}.`);
  }
  return date.toISOString();
}

function toSafeInteger(value, field) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`PostgreSQL returned an unsafe ${field}.`);
  }
  return number;
}

function toDecimalString(value, field) {
  const text = String(value);
  if (!/^[1-9][0-9]*$/.test(text)) {
    throw new Error(`PostgreSQL returned an invalid ${field}.`);
  }
  return text;
}

function normalizeCurrentState(row) {
  const state = {
    contract_version: row.contract_version,
    asset_id: row.asset_id,
    metric: row.metric,
    value: Number(row.value),
    unit: row.unit,
    site_id: row.site_id,
    device_id: row.device_id,
    sensor_id: row.sensor_id,
    boot_id: row.boot_id,
    seq: toSafeInteger(row.seq, 'seq'),
    source_ts: toIsoString(row.source_ts, 'source_ts'),
    received_at: toIsoString(row.received_at, 'received_at'),
    quality: row.quality,
    source_status: row.source_status,
    measurement_id: toDecimalString(row.measurement_id, 'measurement_id'),
    state_version: toDecimalString(row.state_version, 'state_version'),
    updated_at: toIsoString(row.updated_at, 'updated_at'),
  };

  if (row.raw_value !== null && row.raw_value !== undefined) {
    const rawValue = Number(row.raw_value);
    if (!Number.isInteger(rawValue) || rawValue < 0 || rawValue > 65535) {
      throw new Error('PostgreSQL returned an invalid raw_value.');
    }
    state.raw_value = rawValue;
  }

  if (!validateCurrentState(state)) {
    throw new Error(
      `PostgreSQL current state violates contract: ${ajv.errorsText(validateCurrentState.errors)}`
    );
  }

  return state;
}

function historyResponse(assetId, metric, from, to, maxPoints, bucketSeconds, rows) {
  const series = new Map();
  for (const row of rows) {
    let entry = series.get(row.sensor_id);
    if (!entry) {
      entry = { sensor_id: row.sensor_id, unit: row.unit, points: [] };
      series.set(row.sensor_id, entry);
    }
    entry.points.push({
      ts: toIsoString(row.bucket, 'history bucket'),
      average: Number(row.average),
      minimum: Number(row.minimum),
      maximum: Number(row.maximum),
      count: toSafeInteger(row.sample_count, 'history sample_count'),
    });
  }
  return {
    asset_id: assetId,
    metric,
    from: from.toISOString(),
    to: to.toISOString(),
    max_points: maxPoints,
    bucket_seconds: bucketSeconds,
    series: [...series.values()],
  };
}

function parseHistoryRequest(url, assetId) {
  const metric = url.searchParams.get('metric') ?? '';
  const sensorId = url.searchParams.get('sensor_id');
  const from = new Date(url.searchParams.get('from') ?? '');
  const to = new Date(url.searchParams.get('to') ?? '');
  const maxPointsText = url.searchParams.get('max_points') ?? '1200';
  const maxPoints = Number(maxPointsText);
  if (
    !canonicalIdPattern.test(assetId) ||
    !canonicalIdPattern.test(metric) ||
    (sensorId !== null && !canonicalIdPattern.test(sensorId)) ||
    Number.isNaN(from.getTime()) ||
    Number.isNaN(to.getTime()) ||
    from >= to ||
    !/^\d+$/.test(maxPointsText) ||
    !Number.isSafeInteger(maxPoints) ||
    maxPoints < 50 ||
    maxPoints > 2000
  ) {
    return null;
  }
  const spanSeconds = (to.getTime() - from.getTime()) / 1000;
  if (spanSeconds > 31 * 24 * 60 * 60) return null;
  return {
    assetId,
    metric,
    sensorId,
    from,
    to,
    maxPoints,
    bucketSeconds: Math.max(1, Math.ceil(spanSeconds / (maxPoints - 1))),
  };
}

function spatialAnchorFromRow(row) {
  return {
    asset_id: row.asset_id,
    coordinate_system_id: row.coordinate_system_id,
    device_id: row.device_id,
    metric: row.metric,
    position: [Number(row.position_x), Number(row.position_y), Number(row.position_z)],
    position_verified: Boolean(row.position_verified),
    position_version: toDecimalString(row.position_version, 'position_version'),
    registration_state: 'reference_geometry',
    sensor_id: row.sensor_id,
    unit: row.unit,
  };
}

export function normalizeSpatialRegistration(rows) {
  return {
    anchors: rows
      .filter((row) => row.position_version !== null && row.position_version !== undefined)
      .map(spatialAnchorFromRow),
    sources: rows.map((row) => ({
      asset_id: row.asset_id,
      coordinate_system_id: row.coordinate_system_id ?? null,
      device_id: row.device_id,
      metric: row.metric,
      sensor_id: row.sensor_id,
      unit: row.unit,
    })),
  };
}

function parseSpatialRegistration(body) {
  if (
    body === null ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    !canonicalIdPattern.test(body.sensor_id ?? '') ||
    !canonicalIdPattern.test(body.coordinate_system_id ?? '') ||
    !Array.isArray(body.position) ||
    body.position.length !== 3 ||
    !body.position.every(Number.isFinite)
  ) {
    return null;
  }
  return {
    coordinateSystemId: body.coordinate_system_id,
    position: body.position,
    sensorId: body.sensor_id,
  };
}

async function readJsonRequest(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) {
    throw new Error('unsupported_media_type');
  }
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 4096) throw new Error('payload_too_large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('invalid_json');
  }
}

export function createCurrentStateEvents() {
  const clients = new Set();
  let closed = false;

  return {
    subscribe(response) {
      if (closed) return false;
      clients.add(response);
      response.once('close', () => clients.delete(response));
      return true;
    },
    publish(currentState) {
      if (closed) return;
      const frame = `id: ${currentState.state_version}\nevent: current-state\ndata: ${JSON.stringify(currentState)}\n\n`;
      for (const response of clients) {
        try {
          if (!response.write(frame)) {
            clients.delete(response);
            response.destroy();
          }
        } catch {
          clients.delete(response);
          response.destroy();
        }
      }
    },
    close() {
      if (closed) return;
      closed = true;
      const activeClients = [...clients];
      clients.clear();
      for (const response of activeClients) {
        try {
          response.end();
        } catch {
          response.destroy();
        }
      }
    },
    get clientCount() {
      return clients.size;
    },
  };
}

const safeResponseHeaders = {
  'content-security-policy': "default-src 'none'",
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
};

const staticContentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.glb', 'model/gltf-binary'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
]);

const staticContentSecurityPolicy =
  "default-src 'self'; base-uri 'none'; connect-src 'self' blob:; frame-ancestors 'none'; " +
  "img-src 'self' blob: data:; object-src 'none'; script-src 'self'; style-src 'self'";

function staticCacheHeaders(pathname, requestedPath) {
  if (requestedPath === 'index.html') return { 'cache-control': 'no-cache' };
  if (pathname === '/models/rack.glb') {
    return {
      'cache-control': 'public, max-age=3600',
      'cdn-cache-control': 'public, max-age=86400',
    };
  }
  if (
    requestedPath.startsWith('assets/') &&
    /-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/.test(requestedPath)
  ) {
    return { 'cache-control': 'public, max-age=31536000, immutable' };
  }
  return { 'cache-control': 'no-cache' };
}

function sendBody(response, statusCode, body, contentType, extraHeaders = {}) {
  response.writeHead(statusCode, {
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
    'content-type': contentType,
    ...safeResponseHeaders,
    ...extraHeaders,
  });
  response.end(body);
}

function sendJson(response, statusCode, body, extraHeaders = {}) {
  sendBody(
    response,
    statusCode,
    JSON.stringify(body),
    'application/json; charset=utf-8',
    extraHeaders
  );
}

async function serveStatic(request, response, pathname, staticRoot, logger) {
  if (!staticRoot || pathname.startsWith('/api/')) return false;
  if (request.method !== 'GET') {
    sendJson(response, 405, { error: 'method_not_allowed' }, { allow: 'GET' });
    return true;
  }

  let requestedPath;
  try {
    requestedPath = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).slice(1);
  } catch {
    sendJson(response, 400, { error: 'invalid_request_target' });
    return true;
  }

  if (requestedPath.includes('\0') || requestedPath.includes('\\')) {
    sendJson(response, 404, { error: 'not_found' });
    return true;
  }

  const root = resolve(staticRoot);
  const filePath = resolve(root, requestedPath);
  const relativePath = relative(root, filePath);
  if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    sendJson(response, 404, { error: 'not_found' });
    return true;
  }

  let body;
  try {
    body = await readFile(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'EISDIR') {
      sendJson(response, 404, { error: 'not_found' });
    } else {
      logger.error('Frontend asset read failed.', error);
      sendJson(response, 500, { error: 'internal_error' });
    }
    return true;
  }

  sendBody(
    response,
    200,
    body,
    staticContentTypes.get(extname(filePath).toLowerCase()) ?? 'application/octet-stream',
    {
      'content-security-policy': staticContentSecurityPolicy,
      ...staticCacheHeaders(pathname, requestedPath),
    }
  );
  return true;
}

export function createHttpHandler({
  query,
  metrics = createMetrics(),
  currentStateEvents = createCurrentStateEvents(),
  isMqttReady = () => false,
  isStopping = () => false,
  logger = console,
  staticRoot,
}) {
  return async function httpHandler(request, response) {
    metrics.recordHttpRequest();
    response.once('finish', () => {
      if (response.statusCode >= 400) metrics.recordHttpError();
    });

    let url;
    try {
      url = new URL(request.url ?? '/', 'http://localhost');
    } catch {
      sendJson(response, 400, { error: 'invalid_request_target' });
      return;
    }
    const { pathname } = url;

    if (pathname === '/metrics') {
      if (request.method !== 'GET') {
        sendJson(response, 405, { error: 'method_not_allowed' }, { allow: 'GET' });
        return;
      }
      try {
        await query('SELECT 1');
        metrics.setPostgresReady(true);
      } catch {
        metrics.setPostgresReady(false);
      }
      sendBody(response, 200, metrics.render(), PROMETHEUS_CONTENT_TYPE);
      return;
    }

    if (pathname === '/api/current-state/events') {
      if (request.method !== 'GET') {
        sendJson(response, 405, { error: 'method_not_allowed' }, { allow: 'GET' });
        return;
      }
      if (isStopping() || !currentStateEvents.subscribe(response)) {
        sendJson(response, 503, { status: 'not_ready' });
        return;
      }
      response.writeHead(200, {
        'cache-control': 'no-cache, no-transform',
        'content-type': 'text/event-stream; charset=utf-8',
        ...safeResponseHeaders,
      });
      response.flushHeaders();
      response.write('event: connected\ndata: {}\n\n');
      return;
    }

    if (pathname === '/health') {
      if (request.method !== 'GET') {
        sendJson(response, 405, { error: 'method_not_allowed' }, { allow: 'GET' });
        return;
      }
      sendJson(response, 200, { status: 'ok' });
      return;
    }

    if (pathname === '/ready') {
      if (request.method !== 'GET') {
        sendJson(response, 405, { error: 'method_not_allowed' }, { allow: 'GET' });
        return;
      }
      if (!isMqttReady()) {
        sendJson(response, 503, { status: 'not_ready' });
        return;
      }
      try {
        await query('SELECT 1');
        metrics.setPostgresReady(true);
        const ready = isMqttReady();
        sendJson(response, ready ? 200 : 503, { status: ready ? 'ready' : 'not_ready' });
      } catch (error) {
        metrics.setPostgresReady(false);
        logger.error('Readiness check failed.', error);
        sendJson(response, 503, { status: 'not_ready' });
      }
      return;
    }

    if (pathname === '/api/spatial-registration') {
      if (!['GET', 'POST'].includes(request.method)) {
        sendJson(response, 405, { error: 'method_not_allowed' }, { allow: 'GET, POST' });
        return;
      }
      if (request.method === 'GET') {
        try {
          const { rows } = await query(readSpatialRegistrationSql);
          sendJson(response, 200, normalizeSpatialRegistration(rows));
        } catch (error) {
          logger.error('Spatial registration read failed.', error);
          sendJson(response, 500, { error: 'internal_error' });
        }
        return;
      }

      let registration;
      try {
        registration = parseSpatialRegistration(await readJsonRequest(request));
      } catch (error) {
        const status =
          error.message === 'payload_too_large'
            ? 413
            : error.message === 'unsupported_media_type'
              ? 415
              : 400;
        sendJson(response, status, { error: error.message });
        return;
      }
      if (registration === null) {
        sendJson(response, 400, { error: 'invalid_spatial_registration' });
        return;
      }
      try {
        const { rows } = await query(registerSpatialAnchorSql, [
          registration.sensorId,
          registration.coordinateSystemId,
          ...registration.position,
        ]);
        if (!rows[0]) {
          sendJson(response, 409, { error: 'registration_context_unavailable' });
          return;
        }
        sendJson(response, 201, spatialAnchorFromRow(rows[0]));
      } catch (error) {
        logger.error('Spatial registration write failed.', error);
        sendJson(response, 500, { error: 'internal_error' });
      }
      return;
    }

    const historyMatch = /^\/api\/assets\/([^/]+)\/history$/.exec(pathname);
    if (historyMatch) {
      if (request.method !== 'GET') {
        sendJson(response, 405, { error: 'method_not_allowed' }, { allow: 'GET' });
        return;
      }
      let assetId;
      try {
        assetId = decodeURIComponent(historyMatch[1]);
      } catch {
        sendJson(response, 400, { error: 'invalid_history_query' });
        return;
      }
      const selection = parseHistoryRequest(url, assetId);
      if (selection === null) {
        sendJson(response, 400, { error: 'invalid_history_query' });
        return;
      }
      try {
        const { rows } = await query(readHistorySql, [
          selection.assetId,
          selection.metric,
          selection.sensorId,
          selection.from.toISOString(),
          selection.to.toISOString(),
          selection.bucketSeconds,
        ]);
        sendJson(
          response,
          200,
          historyResponse(
            selection.assetId,
            selection.metric,
            selection.from,
            selection.to,
            selection.maxPoints,
            selection.bucketSeconds,
            rows
          )
        );
      } catch (error) {
        logger.error('History read failed.', error);
        sendJson(response, 500, { error: 'internal_error' });
      }
      return;
    }

    const match = /^\/api\/assets\/([^/]+)\/current-state$/.exec(pathname);
    if (!match) {
      if (await serveStatic(request, response, pathname, staticRoot, logger)) return;
      sendJson(response, 404, { error: 'not_found' });
      return;
    }

    if (request.method !== 'GET') {
      sendJson(response, 405, { error: 'method_not_allowed' }, { allow: 'GET' });
      return;
    }

    let assetId;
    try {
      assetId = decodeURIComponent(match[1]);
    } catch {
      sendJson(response, 400, { error: 'invalid_asset_id' });
      return;
    }

    if (!canonicalIdPattern.test(assetId)) {
      sendJson(response, 400, { error: 'invalid_asset_id' });
      return;
    }

    try {
      const { rows } = await query(readCurrentStateSql, [assetId]);
      sendJson(response, 200, rows.map(normalizeCurrentState));
    } catch (error) {
      logger.error('Current-state read failed.', error);
      sendJson(response, 500, { error: 'internal_error' });
    }
  };
}
