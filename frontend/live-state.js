const CANONICAL_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const DECIMAL_ID = /^[1-9][0-9]*$/;
const METRIC_UNITS = new Map([
  ['temperature', 'degC'],
  ['humidity', 'percent_rh'],
  ['sound_rms_dbfs', 'dBFS'],
  ['sound_peak_dbfs', 'dBFS'],
  ['net_bytes_received_total', 'bytes'],
  ['net_bytes_sent_total', 'bytes'],
  ['net_packets_received_total', 'count'],
  ['net_packets_sent_total', 'count'],
  ['net_packets_received_errors_total', 'count'],
  ['net_packets_outbound_errors_total', 'count'],
  ['net_packets_received_discarded_total', 'count'],
  ['net_packets_outbound_discarded_total', 'count'],
  ['net_current_bandwidth_bytes', 'bytes_per_second'],
  ['net_receive_throughput_bytes_per_second', 'bytes_per_second'],
  ['net_transmit_throughput_bytes_per_second', 'bytes_per_second'],
  ['net_link_utilization_ratio', 'ratio'],
  ['net_operation_status', 'ratio'],
  ['voltage_v', 'V'],
  ['current_a', 'A'],
  ['active_power_w', 'W'],
  ['apparent_power_va', 'VA'],
  ['power_factor_ratio', 'ratio'],
  ['frequency_hz', 'Hz'],
  ['energy_wh_total', 'Wh'],
  ['returned_energy_wh_total', 'Wh'],
  ['wifi_rssi_dbm', 'dBm'],
  ['ram_size_bytes', 'bytes'],
  ['ram_free_bytes', 'bytes'],
  ['ram_min_free_bytes', 'bytes'],
  ['fs_size_bytes', 'bytes'],
  ['fs_free_bytes', 'bytes'],
  ['device_temperature_c', 'degC'],
  ['uptime_s', 's'],
  ['mqtt_connected', 'ratio'],
  ['wifi_connected', 'ratio'],
  ['restart_required', 'ratio'],
  ['reset_reason', 'count'],
  ['pm1_error_count', 'count'],
  ['pm1_flag_count', 'count'],
]);
const QUALITY = new Set(['good', 'degraded', 'unknown']);
const SOURCE_STATUS = new Set(['fresh', 'stale', 'offline', 'unknown', 'invalid']);
const CURRENT_STATE_FIELDS = new Set([
  'contract_version',
  'asset_id',
  'metric',
  'value',
  'raw_value',
  'unit',
  'site_id',
  'device_id',
  'sensor_id',
  'boot_id',
  'seq',
  'source_ts',
  'received_at',
  'quality',
  'source_status',
  'measurement_id',
  'state_version',
  'updated_at',
]);
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export const LIVE_STATE = Object.freeze({
  UNCONFIGURED: 'LIVE_ASSET_UNCONFIGURED',
  CONNECTING: 'LIVE_STREAM_CONNECTING',
  SYNCHRONIZING: 'LIVE_STATE_SYNCHRONIZING',
  LIVE: 'LIVE_STREAM_CONNECTED',
  UNSYNCHRONIZED: 'LIVE_STREAM_UNSYNCHRONIZED',
  DISCONNECTED: 'LIVE_STREAM_DISCONNECTED',
});

function timestamp(value) {
  return typeof value === 'string' && RFC3339.test(value) && Number.isFinite(Date.parse(value));
}

function normalizeCurrentState(value) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Object.keys(value).some((field) => !CURRENT_STATE_FIELDS.has(field)) ||
    value.contract_version !== '1.0' ||
    !CANONICAL_ID.test(value.asset_id) ||
    !CANONICAL_ID.test(value.site_id) ||
    !CANONICAL_ID.test(value.device_id) ||
    !CANONICAL_ID.test(value.sensor_id) ||
    !METRIC_UNITS.has(value.metric) ||
    METRIC_UNITS.get(value.metric) !== value.unit ||
    !Number.isFinite(value.value) ||
    !Number.isSafeInteger(value.seq) ||
    value.seq < 0 ||
    value.seq > 9007199254740991 ||
    typeof value.boot_id !== 'string' ||
    value.boot_id.length < 1 ||
    value.boot_id.length > 128 ||
    value.boot_id.trim() !== value.boot_id ||
    value.boot_id.includes('\0') ||
    !timestamp(value.source_ts) ||
    !timestamp(value.received_at) ||
    !timestamp(value.updated_at) ||
    !QUALITY.has(value.quality) ||
    !SOURCE_STATUS.has(value.source_status) ||
    !DECIMAL_ID.test(value.measurement_id) ||
    !DECIMAL_ID.test(value.state_version)
  ) {
    return null;
  }

  const hasRawValue = Object.hasOwn(value, 'raw_value');
  if (
    hasRawValue &&
    (!['temperature', 'humidity'].includes(value.metric) ||
      !Number.isInteger(value.raw_value) ||
      value.raw_value < 0 ||
      value.raw_value > 65535)
  ) {
    return null;
  }

  const normalized = {
    contract_version: value.contract_version,
    asset_id: value.asset_id,
    metric: value.metric,
    value: value.value,
    unit: value.unit,
    site_id: value.site_id,
    device_id: value.device_id,
    sensor_id: value.sensor_id,
    boot_id: value.boot_id,
    seq: value.seq,
    source_ts: value.source_ts,
    received_at: value.received_at,
    quality: value.quality,
    source_status: value.source_status,
    measurement_id: value.measurement_id,
    state_version: value.state_version,
    updated_at: value.updated_at,
  };
  if (hasRawValue) normalized.raw_value = value.raw_value;
  return normalized;
}

export function currentStateKey(value) {
  return JSON.stringify([value.asset_id, value.sensor_id, value.metric]);
}

export class LiveObservationBuffer {
  constructor() {
    this.points = [];
    this.last = null;
    this.version = 0n;
    this.interrupted = false;
  }

  append(record, connected = true, now = Date.now()) {
    if (!connected) this.interrupted = true;
    const length = this.points.length;
    this.points = this.points.filter((point) => Date.parse(point.source_ts) >= now - 300_000);
    const trimmed = length !== this.points.length;
    if (
      !record ||
      !Number.isFinite(record.value) ||
      !Number.isFinite(Date.parse(record.source_ts)) ||
      !DECIMAL_ID.test(record.state_version) ||
      (this.last && currentStateKey(record) !== currentStateKey(this.last)) ||
      BigInt(record.state_version) <= this.version
    )
      return trimmed;
    this.version = BigInt(record.state_version);
    if (['offline', 'invalid'].includes(record.source_status)) {
      this.interrupted = true;
      return trimmed;
    }
    const time = Date.parse(record.source_ts);
    if (
      time < now - 300_000 ||
      (this.last &&
        (record.measurement_id === this.last.measurement_id ||
          time <= Date.parse(this.last.source_ts)))
    )
      return trimmed;
    const gapLimit = record.device_id === 'rack-controller' ? 1500 : 30_000;
    const breakBefore = Boolean(
      this.last &&
      (this.interrupted ||
        record.boot_id !== this.last.boot_id ||
        time - Date.parse(this.last.source_ts) > gapLimit)
    );
    this.last = { ...record, breakBefore };
    this.points.push(this.last);
    if (this.points.length > 300) this.points.splice(0, this.points.length - 300);
    this.interrupted = false;
    return true;
  }
}

export function summarizeDeviceStatus(records) {
  if (records.length === 0) return 'unknown — not observed';
  if (records.every(({ source_status: status }) => status === 'offline')) return 'offline';
  return 'unknown — no direct online status observed';
}

export class LiveCurrentState {
  constructor({
    assetId,
    assetIds,
    deviceId = null,
    fetchImpl = globalThis.fetch,
    EventSourceImpl = globalThis.EventSource,
    onRecordsChange = () => {},
    onConnectionChange = () => {},
  }) {
    this.assetId = typeof assetId === 'string' ? assetId.trim() : '';
    if (this.assetId !== '' && !CANONICAL_ID.test(this.assetId)) {
      throw new TypeError('Configured asset_id is invalid.');
    }
    this.assetIds = new Set(assetIds ?? [this.assetId].filter(Boolean));
    if ([...this.assetIds].some((id) => typeof id !== 'string' || !CANONICAL_ID.test(id))) {
      throw new TypeError('Configured asset scope is invalid.');
    }
    if (deviceId !== null && (typeof deviceId !== 'string' || !CANONICAL_ID.test(deviceId))) {
      throw new TypeError('Configured device_id is invalid.');
    }
    this.deviceId = deviceId;
    this.fetchImpl = fetchImpl.bind(globalThis);
    this.EventSourceImpl = EventSourceImpl;
    this.onRecordsChange = onRecordsChange;
    this.onConnectionChange = onConnectionChange;
    this.current = new Map();
    this.eventSource = null;
    this.snapshotController = null;
    this.snapshotRevision = 0;
    this.invalidRecordCount = 0;
    this.destroyed = false;
  }

  get records() {
    const records = [...this.current.values()];
    const hostNics = new Map();
    for (const record of records) {
      if (!record.device_id.startsWith('host-') || !record.sensor_id.startsWith('nic-')) continue;
      const latest = hostNics.get(record.device_id);
      if (!latest || BigInt(record.state_version) > BigInt(latest.state_version))
        hostNics.set(record.device_id, record);
    }
    return records.filter(
      (record) =>
        !hostNics.has(record.device_id) ||
        !record.sensor_id.startsWith('nic-') ||
        record.sensor_id.split('-net_')[0] ===
          hostNics.get(record.device_id).sensor_id.split('-net_')[0]
    );
  }

  addAssets(ids) {
    if (ids.some((id) => typeof id !== 'string' || !CANONICAL_ID.test(id)))
      throw new TypeError('Configured asset scope is invalid.');
    const added = ids.filter((id) => !this.assetIds.has(id));
    for (const id of added) this.assetIds.add(id);
    if (added.length && this.eventSource && !this.destroyed) void this.synchronize();
    return added.length > 0;
  }

  start() {
    if (this.destroyed || this.eventSource !== null) return false;
    if (this.assetIds.size === 0) {
      this.onConnectionChange(LIVE_STATE.UNCONFIGURED);
      return false;
    }

    this.onConnectionChange(LIVE_STATE.CONNECTING);
    this.eventSource = new this.EventSourceImpl('/api/current-state/events');
    this.eventSource.addEventListener('open', this.handleOpen);
    this.eventSource.addEventListener('error', this.handleError);
    this.eventSource.addEventListener('current-state', this.handleCurrentState);
    return true;
  }

  handleOpen = () => {
    void this.synchronize();
  };

  handleError = () => {
    ++this.snapshotRevision;
    this.snapshotController?.abort();
    this.snapshotController = null;
    this.onConnectionChange(LIVE_STATE.DISCONNECTED);
  };

  handleCurrentState = (event) => {
    let value;
    try {
      value = JSON.parse(event.data);
    } catch {
      this.rejectRecord();
      return;
    }
    this.apply([value]);
  };

  async synchronize() {
    const revision = ++this.snapshotRevision;
    this.snapshotController?.abort();
    const controller = new globalThis.AbortController();
    this.snapshotController = controller;
    this.onConnectionChange(LIVE_STATE.SYNCHRONIZING);

    try {
      const snapshots = await Promise.all(
        [...this.assetIds].map(async (id) => {
          const response = await this.fetchImpl(
            `/api/assets/${encodeURIComponent(id)}/current-state`,
            {
              signal: controller.signal,
            }
          );
          if (!response.ok)
            throw new Error(`Current-state snapshot returned HTTP ${response.status}.`);
          const rows = await response.json();
          if (!Array.isArray(rows)) throw new Error('Current-state snapshot must be an array.');
          return rows;
        })
      );
      if (this.destroyed || revision !== this.snapshotRevision) return;
      this.apply(snapshots.flat());
      this.onConnectionChange(LIVE_STATE.LIVE);
    } catch (error) {
      if (error?.name !== 'AbortError' && !this.destroyed && revision === this.snapshotRevision) {
        this.onConnectionChange(LIVE_STATE.UNSYNCHRONIZED);
      }
    } finally {
      if (revision === this.snapshotRevision) this.snapshotController = null;
    }
  }

  apply(values) {
    let changed = false;
    for (const value of values) {
      const record = normalizeCurrentState(value);
      if (record === null) {
        this.rejectRecord();
        continue;
      }
      if (!this.assetIds.has(record.asset_id)) continue;
      if (this.deviceId !== null && record.device_id !== this.deviceId) continue;
      const key = currentStateKey(record);
      const previous = this.current.get(key);
      if (previous && BigInt(previous.state_version) >= BigInt(record.state_version)) continue;
      this.current.set(key, record);
      changed = true;
    }
    if (changed) this.onRecordsChange(this.records);
    return changed;
  }

  rejectRecord() {
    if (this.invalidRecordCount < Number.MAX_SAFE_INTEGER) ++this.invalidRecordCount;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    ++this.snapshotRevision;
    this.snapshotController?.abort();
    this.snapshotController = null;
    if (this.eventSource !== null) {
      this.eventSource.removeEventListener('open', this.handleOpen);
      this.eventSource.removeEventListener('error', this.handleError);
      this.eventSource.removeEventListener('current-state', this.handleCurrentState);
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}
