export function sourceFilterKey(sensorId) {
  if (sensorId.startsWith('sht31-a-')) return 'SHT31 A';
  if (sensorId.startsWith('sht31-b-')) return 'SHT31 B';
  if (sensorId.startsWith('rack-sound-')) return 'INMP441';
  if (sensorId.startsWith('shelly-')) return 'Rack Power';
  if (sensorId.startsWith('nic-')) return 'Host Network';
  if (sensorId.startsWith('rack-controller-')) return 'Rack Controller';
  return sensorId;
}

export function sourceLabel(sensorId, displayName) {
  if (typeof displayName === 'string' && displayName.trim()) return displayName.trim();
  const label = sourceFilterKey(sensorId);
  return label === sensorId ? 'Unnamed source' : label;
}

export function unitLabel(unit) {
  return { degC: '°C', percent_rh: '%RH', bytes_per_second: 'B/s' }[unit] ?? unit;
}

export function measurementValue(value, unit, maximumFractionDigits) {
  if (!Number.isFinite(value)) return 'Not observed';
  if (!['degC', '°C', 'percent_rh', '%RH', 'dBFS'].includes(unit))
    return maximumFractionDigits === undefined
      ? String(value)
      : value.toLocaleString('en-GB', { maximumFractionDigits });
  const rounded = value.toFixed(1);
  return rounded === '-0.0' ? '0.0' : rounded;
}

export function readingLabel(record) {
  if (['mqtt_connected', 'wifi_connected', 'net_operation_status'].includes(record.metric))
    return record.value === 1 ? 'Connected' : 'Disconnected';
  if (record.metric === 'restart_required') return record.value === 1 ? 'Required' : 'Not required';
  if (!Number.isFinite(record.value)) return 'Not observed';
  return `${measurementValue(record.value, record.unit)} ${unitLabel(record.unit)}`;
}

export function observationState(record, now = Date.now()) {
  if (['offline', 'invalid'].includes(record.source_status)) return record.source_status;
  const age = Math.max(
    now - Date.parse(record.source_ts),
    Number.isFinite(Date.parse(record.received_at)) ? now - Date.parse(record.received_at) : 0
  );
  const [delayed, stale] = record.metric?.startsWith('net_')
    ? [15_000, 30_000]
    : record.device_id === 'rack-controller'
      ? [10_000, 30_000]
      : record.device_id?.startsWith('shellyplug')
        ? [30_000, 60_000]
        : [120_000, 120_000];
  if (age > stale || record.source_status === 'stale') return 'stale';
  if (record.quality === 'degraded') return 'degraded';
  if (age > delayed) return 'delayed';
  return 'fresh';
}

export function observationLabel(record, now) {
  const state = observationState(record, now);
  return state === 'fresh' ? readingLabel(record) : `${readingLabel(record)} · ${state}`;
}

export function visibleStreamRecords(records, definitions, group = 'all', source = '') {
  const groups = ['environment', 'acoustic', 'electrical', 'telecommunications', 'diagnostic'];
  return records
    .filter(
      (record) =>
        (group === 'all' ||
          definitions[record.metric]?.group === (group === 'device' ? 'diagnostic' : group)) &&
        (!source || sourceFilterKey(record.sensor_id) === source)
    )
    .sort(
      (a, b) =>
        groups.indexOf(definitions[a.metric]?.group) -
          groups.indexOf(definitions[b.metric]?.group) || a.sensor_id.localeCompare(b.sensor_id)
    );
}
