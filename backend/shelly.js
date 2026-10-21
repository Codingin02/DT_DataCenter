import { createHash } from 'node:crypto';
import { createDeviceStatusIngestor, createIngestor } from './app.js';

export const SHELLY_FIELDS = Object.freeze([
  ['pm1:0.voltage', 'voltage_v', 'V'],
  ['pm1:0.current', 'current_a', 'A'],
  ['pm1:0.apower', 'active_power_w', 'W'],
  ['pm1:0.aprtpower', 'apparent_power_va', 'VA'],
  ['pm1:0.pf', 'power_factor_ratio', 'ratio'],
  ['pm1:0.freq', 'frequency_hz', 'Hz'],
  ['pm1:0.aenergy.total', 'energy_wh_total', 'Wh'],
  ['pm1:0.ret_aenergy.total', 'returned_energy_wh_total', 'Wh'],
  ['pm1:0.temperature.tC', 'device_temperature_c', 'degC'],
  ['sys.uptime', 'uptime_s', 's'],
  ['sys.ram_size', 'ram_size_bytes', 'bytes'],
  ['sys.ram_free', 'ram_free_bytes', 'bytes'],
  ['sys.ram_min_free', 'ram_min_free_bytes', 'bytes'],
  ['sys.fs_size', 'fs_size_bytes', 'bytes'],
  ['sys.fs_free', 'fs_free_bytes', 'bytes'],
  ['sys.reset_reason', 'reset_reason', 'count'],
  ['sys.restart_required', 'restart_required', 'ratio'],
  ['wifi.rssi', 'wifi_rssi_dbm', 'dBm'],
  ['wifi.status', 'wifi_connected', 'ratio'],
  ['mqtt.connected', 'mqtt_connected', 'ratio'],
  ['pm1:0.errors', 'pm1_error_count', 'count'],
  ['pm1:0.flags', 'pm1_flag_count', 'count'],
]);

export function shellyMeasurements(status, complete = false) {
  return SHELLY_FIELDS.flatMap(([path, metric, unit]) => {
    const [component, ...parts] = path.split('.');
    let value = parts.reduce((v, part) => v?.[part], status[component]);
    if (complete && ['pm1_error_count', 'pm1_flag_count'].includes(metric) && status['pm1:0'])
      if (value === undefined) value = [];
    if (Array.isArray(value) && ['pm1_error_count', 'pm1_flag_count'].includes(metric))
      value = value.every((entry) => typeof entry === 'string') ? value.length : undefined;
    if (metric === 'wifi_connected' && typeof value === 'string')
      value = Number(value === 'got ip');
    if (typeof value === 'boolean' && ['mqtt_connected', 'restart_required'].includes(metric))
      value = Number(value);
    if (typeof value !== 'number' || !Number.isFinite(value)) return [];
    const errors = status['pm1:0']?.errors;
    const flags = status['pm1:0']?.flags;
    const degraded = component === 'pm1:0' && (errors?.length > 0 || flags?.length > 0);
    return [{ metric, value, unit, quality: degraded ? 'degraded' : 'good' }];
  });
}

export function shellyEnvelope(topic, payload, deviceId, replySource, receivedAt) {
  if (payload.length > 65536) throw new Error('Shelly payload exceeds limit.');
  const raw = JSON.parse(payload.toString('utf8'));
  if (topic === `${deviceId}/online` && typeof raw === 'boolean')
    return {
      online: raw,
      raw,
      ts: receivedAt.toISOString(),
      timestampBasis: 'received',
    };
  let status;
  let complete = false;
  let time;
  if (topic === `${replySource}/rpc`) {
    if (
      raw.src !== deviceId ||
      raw.dst !== replySource ||
      raw.id !== 'dt-status' ||
      !raw.result ||
      raw.error
    )
      return null;
    status = raw.result;
    complete = true;
    time = status.sys?.unixtime;
  } else if (topic === `${deviceId}/events/rpc`) {
    if (
      raw.src !== deviceId ||
      !['NotifyStatus', 'NotifyFullStatus', 'NotifyEvent'].includes(raw.method)
    )
      return null;
    status = raw.params;
    complete = raw.method === 'NotifyFullStatus';
    time = status?.ts;
  } else if (topic.startsWith(`${deviceId}/status/`)) {
    const component = topic.slice(`${deviceId}/status/`.length);
    if (!['pm1:0', 'sys', 'wifi', 'mqtt'].includes(component)) return null;
    status = { [component]: raw };
    time = component === 'sys' ? raw.unixtime : undefined;
  } else return null;
  if (!status || typeof status !== 'object' || Array.isArray(status)) return null;
  // Only status replies are requested; never persist configuration/RPC credentials.
  const safe = Object.keys(status).every((key) =>
    [
      'ts',
      'events',
      'pm1:0',
      'sys',
      'wifi',
      'mqtt',
      'ble',
      'bthome',
      'cloud',
      'matter',
      'plugpm_ui',
      'ws',
    ].includes(key)
  );
  if (!safe) throw new Error('Unexpected Shelly status fields.');
  const privateField = (value) =>
    value &&
    typeof value === 'object' &&
    Object.entries(value).some(
      ([key, child]) =>
        /password|passwd|token|secret|private.?key|username/i.test(key) || privateField(child)
    );
  if (privateField(raw)) throw new Error('Private fields are not telemetry.');
  const deviceTime = typeof time === 'number' && Number.isFinite(time) && time > 0;
  return {
    raw,
    status,
    complete,
    ts: deviceTime ? new Date(time * 1000).toISOString() : receivedAt.toISOString(),
    timestampBasis: deviceTime ? 'device' : 'received',
  };
}

export async function registerShelly(query, deviceId) {
  await query(
    `INSERT INTO digital_twin.assets (asset_id,site_id,asset_type,display_name)
    VALUES ($1,'campus-lab','infrastructure','Shelly Plug PM Gen3') ON CONFLICT DO NOTHING`,
    [deviceId]
  );
  await query(
    `INSERT INTO digital_twin.devices (device_id,site_id,asset_id)
    VALUES ($1,'campus-lab',$1) ON CONFLICT DO NOTHING`,
    [deviceId]
  );
  for (const [, metric, unit] of SHELLY_FIELDS) {
    await query(
      `INSERT INTO digital_twin.sensors (sensor_id,site_id,device_id,asset_id,metric,unit)
      VALUES ($1,'campus-lab',$2,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [`shelly-${metric}`, deviceId, metric, unit]
    );
  }
}

export function createShellyAdapter({
  pool,
  deviceId,
  replySource,
  onCurrentState,
  onOutcome = () => {},
}) {
  let bootId = null;
  let queue = Promise.resolve();
  const topics = [
    `${deviceId}/status/+`,
    `${deviceId}/events/rpc`,
    `${deviceId}/online`,
    `${replySource}/rpc`,
  ];

  async function process(topic, payload) {
    const receivedAt = new Date();
    let envelope;
    try {
      envelope = shellyEnvelope(topic, payload, deviceId, replySource, receivedAt);
    } catch {
      onOutcome('rejected');
      return;
    }
    if (!envelope) return;
    const client = await pool.connect();
    const updates = [];
    const query = (sql, values) => client.query(sql, values);
    try {
      await query('BEGIN');
      if (!bootId) {
        const previous = await query(
          `SELECT boot_id FROM digital_twin.shelly_messages
          WHERE device_id=$1 ORDER BY message_id DESC LIMIT 1`,
          [deviceId]
        );
        bootId = previous.rows[0]?.boot_id ?? null;
      }
      const sys = envelope.status?.sys;
      // Shelly exposes uptime, not a boot ID; keep the inferred start explicit.
      if (Number.isFinite(sys?.unixtime) && Number.isFinite(sys?.uptime)) {
        const epoch = Math.round(sys.unixtime - sys.uptime);
        const previousEpoch = Number(bootId?.replace('inferred-start-', ''));
        if (!bootId || Math.abs(previousEpoch - epoch) > 2) bootId = `inferred-start-${epoch}`;
      }
      if (!bootId) {
        await query('ROLLBACK');
        return;
      }
      const fingerprint = createHash('sha256')
        .update(topic)
        .update(payload)
        .update(
          envelope.timestampBasis === 'received'
            ? String(Math.floor(receivedAt.getTime() / 2000))
            : ''
        )
        .digest('hex');
      const receipt = await query(
        `INSERT INTO digital_twin.shelly_messages
        (device_id,topic,raw_payload,fingerprint,source_ts,timestamp_basis,boot_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING message_id`,
        [
          deviceId,
          topic,
          payload.toString('utf8'),
          fingerprint,
          envelope.ts,
          envelope.timestampBasis,
          bootId,
        ]
      );
      if (!receipt.rows.length) {
        await query('COMMIT');
        return;
      }
      const ingestStatus = createDeviceStatusIngestor({
        query,
        onCurrentState: (v) => updates.push(v),
      });
      if (envelope.online !== undefined) {
        await ingestStatus(
          `dt/campus-lab/device/${deviceId}/status`,
          JSON.stringify({
            schema_version: '1.0',
            site_id: 'campus-lab',
            device_id: deviceId,
            boot_id: bootId,
            status: envelope.online ? 'online' : 'offline',
          })
        );
      } else {
        const current = await query(
          `SELECT metric,value,quality,source_ts,received_at
            FROM digital_twin.current_state WHERE asset_id=$1`,
          [deviceId]
        );
        const ingest = createIngestor({ query, onCurrentState: (v) => updates.push(v) });
        const pm1 = envelope.status['pm1:0'];
        const conditions = [
          ['errors', 'pm1_error_count'],
          ['flags', 'pm1_flag_count'],
        ].some(([field, metric]) =>
          Array.isArray(pm1?.[field])
            ? pm1[field].length > 0
            : envelope.complete && pm1
              ? false
              : Number(current.rows.find((row) => row.metric === metric)?.value) > 0
        );
        for (const measurement of shellyMeasurements(envelope.status, envelope.complete)) {
          if (
            conditions &&
            SHELLY_FIELDS.some(
              ([path, metric]) => path.startsWith('pm1:0.') && metric === measurement.metric
            )
          )
            measurement.quality = 'degraded';
          const previous = current.rows.find((row) => row.metric === measurement.metric);
          if (
            previous &&
            Number(previous.value) === measurement.value &&
            previous.quality === measurement.quality &&
            Math.abs(Date.parse(envelope.ts) - new Date(previous.source_ts).getTime()) < 2000 &&
            receivedAt - new Date(previous.received_at) < 2000
          )
            continue;
          const telemetry = {
            schema_version: '1.0',
            site_id: 'campus-lab',
            device_id: deviceId,
            asset_id: deviceId,
            sensor_id: `shelly-${measurement.metric}`,
            boot_id: bootId,
            seq: Number(receipt.rows[0].message_id),
            ts: envelope.ts,
            ...measurement,
          };
          const result = await ingest(
            `dt/campus-lab/telemetry/${deviceId}/${telemetry.sensor_id}/${telemetry.metric}`,
            JSON.stringify(telemetry)
          );
          if (result.outcome === 'rejected')
            throw new Error('Shelly canonical measurement rejected.');
          onOutcome(result.outcome);
        }
        if (envelope.status.mqtt?.connected !== undefined) {
          await ingestStatus(
            `dt/campus-lab/device/${deviceId}/status`,
            JSON.stringify({
              schema_version: '1.0',
              site_id: 'campus-lab',
              device_id: deviceId,
              boot_id: bootId,
              status: envelope.status.mqtt.connected ? 'online' : 'offline',
            })
          );
        }
      }
      await query('COMMIT');
      for (const update of updates) onCurrentState(update);
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  return {
    topics,
    handles: (topic) => topic.startsWith(`${deviceId}/`) || topic === `${replySource}/rpc`,
    ingest(topic, payload) {
      const result = queue.then(() => process(topic, payload));
      queue = result.catch(() => {});
      return result;
    },
  };
}
