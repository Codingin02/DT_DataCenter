import { readFileSync } from 'node:fs';
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
    $13::digital_twin.telemetry_quality
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
  ORDER BY metric`;

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

  if (!validateCurrentState(state)) {
    throw new Error(
      `PostgreSQL current state violates contract: ${ajv.errorsText(validateCurrentState.errors)}`
    );
  }

  return state;
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

export function createHttpHandler({
  query,
  metrics = createMetrics(),
  currentStateEvents = createCurrentStateEvents(),
  isMqttReady = () => false,
  isStopping = () => false,
  logger = console,
}) {
  return async function httpHandler(request, response) {
    metrics.recordHttpRequest();
    response.once('finish', () => {
      if (response.statusCode >= 400) metrics.recordHttpError();
    });

    let pathname;
    try {
      pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    } catch {
      sendJson(response, 400, { error: 'invalid_request_target' });
      return;
    }

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

    const match = /^\/api\/assets\/([^/]+)\/current-state$/.exec(pathname);
    if (!match) {
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
