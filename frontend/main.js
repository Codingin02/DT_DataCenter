import {
  MEASUREMENT_SCALE,
  MODEL_STATE,
  SPATIAL_METRIC,
  SURFACE_MODE,
  RackViewer,
  measurementColor,
  normalizeSpatialAnchors,
  spatialAnchorKey,
} from './rack-viewer.js';
import {
  LIVE_STATE,
  LiveCurrentState,
  currentStateKey,
  summarizeDeviceStatus,
} from './live-state.js';
import { historyUrl, renderHistoryChart } from './history-chart.js';

const requestedAssetId = new window.URLSearchParams(window.location.search).get('asset_id')?.trim();
const assetId = requestedAssetId || document.body.dataset.assetId?.trim() || '';
const canvas = document.querySelector('#rack-canvas');
const viewerStatus = document.querySelector('#viewer-status');
const currentCounts = document.querySelectorAll('[data-current-count]');
const assetCount = document.querySelector('#asset-count');
const hardwareTopology = document.querySelector('[data-hardware-topology]');
const hardwareNodes = document.querySelectorAll('[data-hardware-node]');
const hardwareTraces = document.querySelectorAll('[data-trace]');
const hardwareStateTargets = document.querySelectorAll('[data-hardware-state]');
const hardwareDetail = document.querySelector('#hardware-detail');
const hardwareTitle = document.querySelector('[data-hardware-title]');
const hardwareStateLabel = document.querySelector('[data-hardware-state-label]');
const hardwareCondition = document.querySelector('[data-hardware-condition]');
const hardwareDecision = document.querySelector('[data-hardware-decision]');
const hardwareDiagnostics = document.querySelector('[data-hardware-diagnostics]');
const hardwareConditionTargets = document.querySelectorAll('[data-condition]');
const hardwareValueTargets = document.querySelectorAll('[data-hardware-value]');
const scopeTraces = document.querySelector('[data-scope-traces]');
const scopeSource = document.querySelector('[data-scope-source]');
const scopeRanges = document.querySelectorAll('[data-scope-range]');
const hardwareFacts = document.querySelector('[data-hardware-facts]');
const hardwarePinMatrix = document.querySelector('[data-pin-matrix]');
const mechanicalCounts = document.querySelectorAll('[data-mechanical-count]');
const streamRegistryBody = document.querySelector('#stream-registry-body');
const streamFilters = document.querySelectorAll('[data-stream-filter]');
const surfaceModeButton = document.querySelector('#surface-mode');
const layerControl = document.querySelector('.layer-control');
const anchorCounts = document.querySelectorAll('[data-anchor-count]');
const measurementZoneState = document.querySelector('#measurement-zone-state');
const zoneSummaries = document.querySelectorAll('[data-zone-summary]');
const spatialSurface = document.querySelector('[data-workspace-surface="spatial"]');
const spatialOverlays = document.querySelectorAll('[data-spatial-overlay]');
const workspacePath = document.querySelector('#workspace-path');
const spatialLayerMetric = document.querySelector('#spatial-layer-metric');
const spatialLayerState = document.querySelector('#spatial-layer-state');
const spatialLayerMessage = document.querySelector('#spatial-layer-message');
const spatialLayerCallout = document.querySelector('.spatial-layer-state');
const measurementLegend = document.querySelector('#measurement-legend');
const referenceScaleGroup = document.querySelector('.reference-scale-group');
const referenceScaleHome = referenceScaleGroup.parentElement;
const viewerPanel = document.querySelector('.viewer');
const measurementBrowserGroup = document.querySelector('.measurement-browser-group');
const legendMetric = document.querySelector('#legend-metric');
const legendPanels = document.querySelectorAll('[data-measurement-legend]');
const workspaceMain = document.querySelector('.workspace-main');
const workspaceBrowser = document.querySelector('.workspace-browser');
const workspacePanels = document.querySelectorAll('[data-workspace-panel]');
const workspaceSurfaces = document.querySelectorAll('[data-workspace-surface]');
const systemSurfaces = document.querySelectorAll('[data-system-surface]');
const domainButtons = document.querySelectorAll('[data-system-domain]');
const domainSelector = document.querySelector('.domain-selector');
const domainSummaries = document.querySelectorAll('[data-domain-summary]');
const metricInputs = document.querySelectorAll('.spatial-metric-input');
const inspector = document.querySelector('#measurement-inspector');
const inspectorHome = inspector.parentElement;
const inspectorTechnical = inspector.querySelector('.inspector-technical');
const inspectorKicker = document.querySelector('#inspector-kicker');
const inspectorEmpty = document.querySelector('#inspector-empty');
const inspectorDetail = document.querySelector('#inspector-detail');
const clearSelectionButton = document.querySelector('#clear-selection');
const inspectorTitle = document.querySelector('#inspector-title');
const inspectorValue = document.querySelector('#inspector-value');
const inspectorUnit = document.querySelector('#inspector-unit');
const inspectorSwatch = document.querySelector('#inspector-swatch');
const inspectorSensor = document.querySelector('#inspector-sensor');
const inspectorMetric = document.querySelector('#inspector-metric');
const inspectorAsset = document.querySelector('#inspector-asset');
const inspectorQuality = document.querySelector('#inspector-quality');
const inspectorSource = document.querySelector('#inspector-source');
const inspectorAcquired = document.querySelector('#inspector-acquired');
const inspectorReceived = document.querySelector('#inspector-received');
const inspectorRawRow = document.querySelector('#inspector-raw-row');
const inspectorRaw = document.querySelector('#inspector-raw');
const inspectorRegistration = document.querySelector('#inspector-registration');
const inspectorCoordinateRow = document.querySelector('#inspector-coordinate-row');
const inspectorCoordinate = document.querySelector('#inspector-coordinate');
const inspectorPositionRow = document.querySelector('#inspector-position-row');
const inspectorPosition = document.querySelector('#inspector-position');
const analyticsDock = document.querySelector('#context-analytics');
const analyticsContext = document.querySelector('#analytics-context');
const analyticsPanels = document.querySelectorAll('.analytics-grid [data-metric]');
const historyQuery = document.querySelector('#history-query');
const historyMetric = document.querySelector('#history-metric');
const historySource = document.querySelector('#history-source');
const historyRangeButtons = document.querySelectorAll('[data-history-range]');
const analyticsHistoryChart = document.querySelector('#analytics-history-chart');
const analyticsHistoryState = document.querySelector('#analytics-history-state');
const analyticsBrowserState = document.querySelector('#analytics-browser-state');
const analyticsBrowserMetric = document.querySelector('#analytics-browser-metric');
const analyticsBrowserSource = document.querySelector('#analytics-browser-source');
const analyticsBrowserRange = document.querySelector('#analytics-browser-range');
const navigationItems = document.querySelectorAll('[data-navigation]');
const assetContexts = document.querySelectorAll('[data-asset-context]');
const registrationSource = document.querySelector('#registration-source');
const startRegistrationButton = document.querySelector('#start-registration');
const inspectRegistrationButton = document.querySelector('#inspect-registration');
const registrationMessage = document.querySelector('#registration-message');
const registrationPreviewPanel = document.querySelector('#registration-preview');
const registrationPreviewAxes = document.querySelectorAll('[data-preview-axis]');
const confirmRegistrationButton = document.querySelector('#confirm-registration');
const cancelRegistrationButton = document.querySelector('#cancel-registration');
const registrationGroup = document.querySelector('.registration-group');
const spatialReadinessGroup = document.querySelector('.spatial-readiness-group');
const spatialRegistrationAbort = new window.AbortController();
const statusTargets = {
  backend: document.querySelectorAll('[data-status="backend"]'),
  device: document.querySelectorAll('[data-status="device"]'),
  geometry: document.querySelectorAll('[data-status="geometry"]'),
  stream: document.querySelectorAll('[data-status="stream"]'),
};

const messages = {
  [MODEL_STATE.UNCONFIGURED]: 'Reference geometry unavailable.',
  [MODEL_STATE.LOADING]: 'Loading reference geometry…',
  [MODEL_STATE.READY]: 'Reference geometry loaded.',
  [MODEL_STATE.ERROR]: 'Reference geometry failed to load.',
};

const modelPresentation = {
  [MODEL_STATE.UNCONFIGURED]: ['Unavailable', 'unknown'],
  [MODEL_STATE.LOADING]: ['Loading', 'active'],
  [MODEL_STATE.READY]: ['Loaded', 'healthy'],
  [MODEL_STATE.ERROR]: ['Error', 'error'],
};

const connectionPresentation = {
  [LIVE_STATE.UNCONFIGURED]: ['Not checked', 'unknown', 'Disabled', 'unknown'],
  [LIVE_STATE.CONNECTING]: ['Checking', 'active', 'Connecting', 'active'],
  [LIVE_STATE.SYNCHRONIZING]: ['Available', 'healthy', 'Synchronizing', 'active'],
  [LIVE_STATE.LIVE]: ['Ready', 'healthy', 'Active', 'healthy'],
  [LIVE_STATE.UNSYNCHRONIZED]: ['Available', 'healthy', 'Snapshot unavailable', 'attention'],
  [LIVE_STATE.DISCONNECTED]: ['Unavailable', 'error', 'Disconnected', 'error'],
};

const metricPresentation = {
  temperature: {
    group: 'environment',
    label: 'Temperature',
    reference: 'ASHRAE inlet thermal',
    system: 'Mechanical',
    unit: 'degC',
  },
  humidity: {
    group: 'environment',
    label: 'Humidity',
    reference: 'Moisture / dew-point context',
    system: 'Mechanical',
    unit: 'percent_rh',
  },
  sound_rms_dbfs: { group: 'acoustic', label: 'RMS', system: 'Acoustic', unit: 'dBFS' },
  sound_peak_dbfs: { group: 'acoustic', label: 'Peak', system: 'Acoustic', unit: 'dBFS' },
  brownout_count: { group: 'diagnostic', label: 'Brownouts', system: 'Hardware', unit: 'count' },
  reset_count: { group: 'diagnostic', label: 'Resets', system: 'Hardware', unit: 'count' },
  mqtt_reconnect_count: {
    group: 'diagnostic',
    label: 'MQTT reconnects',
    system: 'Hardware',
    unit: 'count',
  },
  uptime_s: { group: 'diagnostic', label: 'Uptime', system: 'Hardware', unit: 's' },
  crc_error_count: { group: 'diagnostic', label: 'CRC errors', system: 'Hardware', unit: 'count' },
  i2c_retry_count: { group: 'diagnostic', label: 'I²C retries', system: 'Hardware', unit: 'count' },
  sensor_reset_count: {
    group: 'diagnostic',
    label: 'Sensor resets',
    system: 'Hardware',
    unit: 'count',
  },
  i2s_error_count: { group: 'diagnostic', label: 'I²S errors', system: 'Hardware', unit: 'count' },
  dma_overrun_count: {
    group: 'diagnostic',
    label: 'DMA overruns',
    system: 'Hardware',
    unit: 'count',
  },
  clip_ratio: { group: 'diagnostic', label: 'Clipping ratio', system: 'Hardware', unit: 'ratio' },
  stuck_sample_ratio: {
    group: 'diagnostic',
    label: 'Stuck samples',
    system: 'Hardware',
    unit: 'ratio',
  },
  supply_voltage_v: { group: 'diagnostic', label: 'Supply voltage', system: 'Hardware', unit: 'V' },
  supply_current_ma: {
    group: 'diagnostic',
    label: 'Supply current',
    system: 'Hardware',
    unit: 'mA',
  },
  net_bytes_received_total: {
    group: 'telecommunications',
    label: 'Rx bytes total',
    system: 'Telecommunications',
    unit: 'bytes',
  },
  net_bytes_sent_total: {
    group: 'telecommunications',
    label: 'Tx bytes total',
    system: 'Telecommunications',
    unit: 'bytes',
  },
  net_packets_received_total: {
    group: 'telecommunications',
    label: 'Rx packets total',
    system: 'Telecommunications',
    unit: 'count',
  },
  net_packets_sent_total: {
    group: 'telecommunications',
    label: 'Tx packets total',
    system: 'Telecommunications',
    unit: 'count',
  },
  net_packets_received_errors_total: {
    group: 'telecommunications',
    label: 'Rx errors total',
    system: 'Telecommunications',
    unit: 'count',
  },
  net_packets_outbound_errors_total: {
    group: 'telecommunications',
    label: 'Tx errors total',
    system: 'Telecommunications',
    unit: 'count',
  },
  net_packets_received_discarded_total: {
    group: 'telecommunications',
    label: 'Rx drops total',
    system: 'Telecommunications',
    unit: 'count',
  },
  net_packets_outbound_discarded_total: {
    group: 'telecommunications',
    label: 'Tx drops total',
    system: 'Telecommunications',
    unit: 'count',
  },
  net_current_bandwidth_bytes: {
    group: 'telecommunications',
    label: 'Link capacity',
    system: 'Telecommunications',
    unit: 'bytes_per_second',
  },
  net_receive_throughput_bytes_per_second: {
    group: 'telecommunications',
    label: 'Rx throughput',
    system: 'Telecommunications',
    unit: 'bytes_per_second',
  },
  net_transmit_throughput_bytes_per_second: {
    group: 'telecommunications',
    label: 'Tx throughput',
    system: 'Telecommunications',
    unit: 'bytes_per_second',
  },
  net_link_utilization_ratio: {
    group: 'telecommunications',
    label: 'Link utilization',
    system: 'Telecommunications',
    unit: 'ratio',
  },
  net_operation_status: {
    group: 'telecommunications',
    label: 'NIC operation state',
    system: 'Telecommunications',
    unit: 'ratio',
  },
  voltage_v: { group: 'electrical', label: 'Voltage', system: 'Electrical', unit: 'V' },
  current_a: { group: 'electrical', label: 'Current', system: 'Electrical', unit: 'A' },
  active_power_w: {
    group: 'electrical',
    label: 'Active power',
    system: 'Electrical',
    unit: 'W',
  },
  apparent_power_va: {
    group: 'electrical',
    label: 'Apparent power',
    system: 'Electrical',
    unit: 'VA',
  },
  power_factor_ratio: {
    group: 'electrical',
    label: 'Power factor',
    system: 'Electrical',
    unit: 'ratio',
  },
  frequency_hz: {
    group: 'electrical',
    label: 'Frequency',
    system: 'Electrical',
    unit: 'Hz',
  },
  energy_wh_total: {
    group: 'electrical',
    label: 'Cumulative energy',
    system: 'Electrical',
    unit: 'Wh',
  },
};

const workspacePresentation = {
  assets: ['Assets', 'Hardware condition'],
  streams: ['Streams', 'Measurement sources'],
  analytics: ['Analytics', 'Historical context'],
  events: ['Events', 'Operational records'],
};

const stateTone = {
  good: 'healthy',
  fresh: 'healthy',
  degraded: 'attention',
  stale: 'attention',
  offline: 'error',
  invalid: 'error',
  unknown: 'unknown',
};

const hardwareAssets = Object.freeze({
  'esp32-s3': Object.freeze({
    title: 'ESP32-S3 DevKitC-1',
    breadcrumb: 'ESP32-S3',
    traces: Object.freeze(['i2c0', 'i2c1', 'i2s0', 'transport']),
    sensors: Object.freeze([
      'acceptance-esp32-brownout',
      'acceptance-esp32-reset',
      'acceptance-esp32-mqtt-reconnect',
      'acceptance-esp32-uptime',
      'acceptance-esp32-supply-voltage',
      'acceptance-esp32-supply-current',
    ]),
    primaryMetrics: Object.freeze(['temperature', 'humidity', 'sound_rms_dbfs']),
    diagnostics: Object.freeze([
      ['Brownout resets', 'brownout_count'],
      ['Restart count', 'reset_count'],
      ['MQTT reconnects', 'mqtt_reconnect_count'],
      ['Uptime', 'uptime_s'],
      ['Supply voltage', 'supply_voltage_v'],
      ['Supply current', 'supply_current_ma'],
    ]),
    facts: Object.freeze([
      ['Variant', 'N16R8'],
      ['Role', 'Edge acquisition / transport'],
      ['Firmware', 'ESP-IDF'],
      ['Transport', 'Wi-Fi -> MQTT'],
      ['Acquisition interfaces', 'I2C0, I2C1, I2S0'],
      ['Power', '3V3, GND'],
      ['Supply reference', '3.0–3.6 V; nominal 3.3 V'],
      ['External supply capability', '≥500 mA recommended'],
    ]),
    pins: Object.freeze([
      ['GPIO4', 'INMP441 WS', 'I2S0 WS / LRCLK'],
      ['GPIO5', 'INMP441 SCK', 'I2S0 BCLK'],
      ['GPIO6', 'INMP441 SD', 'I2S0 DATA IN'],
      ['GPIO8', 'SHT31 A SDA', 'I2C0 SDA'],
      ['GPIO9', 'SHT31 A SCL', 'I2C0 SCL'],
      ['GPIO10', 'SHT31 B SDA', 'I2C1 SDA'],
      ['GPIO11', 'SHT31 B SCL', 'I2C1 SCL'],
      ['3V3', 'SHT31 A / SHT31 B / INMP441', 'Power rail'],
      ['GND', 'SHT31 A / SHT31 B / INMP441 / L/R', 'Ground rail'],
    ]),
  }),
  'sht31-a': Object.freeze({
    title: 'SHT31 A',
    breadcrumb: 'SHT31 A',
    traces: Object.freeze(['i2c0']),
    sensors: Object.freeze(['acceptance-sht31-a-temperature', 'acceptance-sht31-a-humidity']),
    diagnosticSensors: Object.freeze([
      'acceptance-sht31-a-crc',
      'acceptance-sht31-a-retry',
      'acceptance-sht31-a-reset',
      'acceptance-sht31-a-supply-voltage',
      'acceptance-sht31-a-supply-current',
    ]),
    diagnostics: Object.freeze([
      ['CRC errors', 'crc_error_count'],
      ['I²C retries', 'i2c_retry_count'],
      ['Sensor resets', 'sensor_reset_count'],
      ['Supply voltage', 'supply_voltage_v'],
      ['Supply current', 'supply_current_ma'],
    ]),
    facts: Object.freeze([
      ['Model', 'DFRobot Fermion SEN0331 / SHT31'],
      ['Interface', 'I2C0'],
      ['Reference placement', 'Middle rack top / roof surface'],
      ['State basis', 'Configured reference; observed from current state'],
      ['Supply reference', '2.15–5.5 V; module current <1.5 mA'],
      ['Typical accuracy', '±0.2 °C; ±2 %RH'],
      ['Best-performance environment', '5–60 °C; 20–80 %RH'],
      ['Humidity drift reference', 'typ. <0.25 %RH/year'],
      ['Temperature drift reference', 'max <0.03 °C/year'],
    ]),
    pins: Object.freeze([
      ['VCC', 'ESP32 3V3', 'Power'],
      ['GND', 'ESP32 GND', 'Ground'],
      ['SDA', 'GPIO8', 'I2C0 data'],
      ['SCL', 'GPIO9', 'I2C0 clock'],
      ['INT', 'NC', 'Not used'],
      ['RST', 'NC', 'Not used'],
    ]),
  }),
  'sht31-b': Object.freeze({
    title: 'SHT31 B',
    breadcrumb: 'SHT31 B',
    traces: Object.freeze(['i2c1']),
    sensors: Object.freeze(['acceptance-sht31-b-temperature', 'acceptance-sht31-b-humidity']),
    diagnosticSensors: Object.freeze([
      'acceptance-sht31-b-crc',
      'acceptance-sht31-b-retry',
      'acceptance-sht31-b-reset',
      'acceptance-sht31-b-supply-voltage',
      'acceptance-sht31-b-supply-current',
    ]),
    diagnostics: Object.freeze([
      ['CRC errors', 'crc_error_count'],
      ['I²C retries', 'i2c_retry_count'],
      ['Sensor resets', 'sensor_reset_count'],
      ['Supply voltage', 'supply_voltage_v'],
      ['Supply current', 'supply_current_ma'],
    ]),
    facts: Object.freeze([
      ['Model', 'DFRobot Fermion SEN0331 / SHT31'],
      ['Interface', 'I2C1'],
      ['Reference placement', 'Middle rack front-center'],
      ['State basis', 'Configured reference; observed from current state'],
      ['Supply reference', '2.15–5.5 V; module current <1.5 mA'],
      ['Typical accuracy', '±0.2 °C; ±2 %RH'],
      ['Best-performance environment', '5–60 °C; 20–80 %RH'],
      ['Humidity drift reference', 'typ. <0.25 %RH/year'],
      ['Temperature drift reference', 'max <0.03 °C/year'],
    ]),
    pins: Object.freeze([
      ['VCC', 'ESP32 3V3', 'Power'],
      ['GND', 'ESP32 GND', 'Ground'],
      ['SDA', 'GPIO10', 'I2C1 data'],
      ['SCL', 'GPIO11', 'I2C1 clock'],
      ['INT', 'NC', 'Not used'],
      ['RST', 'NC', 'Not used'],
    ]),
  }),
  inmp441: Object.freeze({
    title: 'INMP441',
    breadcrumb: 'INMP441',
    traces: Object.freeze(['i2s0']),
    sensors: Object.freeze(['acceptance-inmp441-rms', 'acceptance-inmp441-peak']),
    diagnosticSensors: Object.freeze([
      'acceptance-inmp441-i2s-error',
      'acceptance-inmp441-dma-overrun',
      'acceptance-inmp441-clip-ratio',
      'acceptance-inmp441-stuck-ratio',
      'acceptance-inmp441-supply-voltage',
      'acceptance-inmp441-supply-current',
    ]),
    diagnostics: Object.freeze([
      ['I²S errors', 'i2s_error_count'],
      ['DMA overruns', 'dma_overrun_count'],
      ['Clipping ratio', 'clip_ratio'],
      ['Stuck samples', 'stuck_sample_ratio'],
      ['Supply voltage', 'supply_voltage_v'],
      ['Supply current', 'supply_current_ma'],
    ]),
    facts: Object.freeze([
      ['Model', 'INMP441'],
      ['Interface', 'I2S0'],
      ['Semantics', 'Acoustic diagnostic only'],
      ['Calibration', 'No SPL / dBA / LAeq policy'],
      ['CHIPEN', 'Module-specific / internal if not exposed'],
      ['Supply reference', '1.62–3.63 V; characterized 1.8–3.3 V'],
      ['Current at 3.3 V', 'typ. 2.2 mA; max 2.5 mA'],
      ['Sensitivity reference', 'typ. −26 dBFS; approx. −29 to −23 dBFS'],
      ['Noise floor reference', 'approx. −87 dBFS'],
      ['Maximum acoustic input', '120 dB SPL (reference only; not measured as SPL)'],
    ]),
    pins: Object.freeze([
      ['VDD', 'ESP32 3V3', 'Power'],
      ['GND', 'ESP32 GND', 'Ground'],
      ['SCK', 'GPIO5', 'I2S0 BCLK'],
      ['WS', 'GPIO4', 'I2S0 WS / LRCLK'],
      ['SD', 'GPIO6', 'I2S0 DATA IN'],
      ['L/R', 'GND', 'Left-channel selection'],
    ]),
  }),
  electrical: Object.freeze({
    title: 'Electrical Measurement Point',
    breadcrumb: 'Electrical',
    traces: Object.freeze(['electrical']),
    sensors: Object.freeze([
      'acceptance-voltage',
      'acceptance-current',
      'acceptance-active-power',
      'acceptance-apparent-power',
      'acceptance-power-factor',
      'acceptance-frequency',
      'acceptance-energy',
    ]),
    diagnostics: Object.freeze([]),
    facts: Object.freeze([
      ['Role', 'Rack electrical instrumentation reference'],
      ['Provenance', 'Simulated source'],
      ['Instrument', 'Instrument model pending physical selection'],
      ['Method reference', 'IEC 61000-4-30; conformance not assessed'],
    ]),
    pins: Object.freeze([]),
  }),
});

let spatialAnchors = [];
let registrationSources = [];
let registrationPreview = null;
let activeWorkspace = 'twin';
let activeSystemDomain = 'architecture';
let activeSpatialMetric = 'temperature';
let activeSurfaceMode = SURFACE_MODE.TEXTURED;
let activeHistoryRange = '5d';
let selectedKey = null;
let selectedHardwareKey = null;
let scopeRange = 'live';
let scopeRequest;
let scopeRequestKey = '';
let scopeFetchedAt = 0;
let activeStreamFilter = 'all';
let connectionState = LIVE_STATE.UNCONFIGURED;
const diagnosticBaseline = new Map();
const recentDiagnosticChanges = new Map();
let liveState;
let viewer;
let historyAbort;

function setStatus(name, value, tone) {
  for (const element of statusTargets[name]) {
    element.textContent = value;
    element.dataset.tone = tone;
  }
}

function productSource(sensorId, group) {
  if (sensorId.startsWith('acceptance-') && group === 'telecommunications') return 'Host NIC';
  if (sensorId.startsWith('acceptance-sht31-a-')) return 'SHT31 A';
  if (sensorId.startsWith('acceptance-sht31-b-')) return 'SHT31 B';
  if (sensorId.startsWith('acceptance-inmp441-')) return 'INMP441';
  if (sensorId.startsWith('acceptance-esp32-')) return 'ESP32-S3';
  if (sensorId.startsWith('acceptance-net-')) return 'Host NIC';
  if (sensorId.startsWith('acceptance-')) return 'Rack Electrical';
  return sensorId;
}

function renderConnectionStatus(records) {
  const [backendValue, backendTone, streamValue, streamTone] =
    connectionPresentation[connectionState];
  setStatus('backend', backendValue, backendTone);
  setStatus(
    'stream',
    connectionState === LIVE_STATE.UNSYNCHRONIZED && records.length > 0 ? 'Receiving' : streamValue,
    connectionState === LIVE_STATE.UNSYNCHRONIZED && records.length > 0 ? 'active' : streamTone
  );
}

function isSpatialWorkspace() {
  return (
    activeWorkspace === 'twin' ||
    (activeWorkspace === 'systems' && ['architecture', 'mechanical'].includes(activeSystemDomain))
  );
}

function isMeasurementSpatialWorkspace() {
  return (
    activeWorkspace === 'twin' ||
    (activeWorkspace === 'systems' && activeSystemDomain === 'mechanical')
  );
}

function setBreadcrumb(parts) {
  workspacePath.replaceChildren(
    ...parts.map((part) => {
      const item = document.createElement('li');
      item.textContent = part;
      return item;
    })
  );
}

function synchronizeWorkspaceSurface() {
  const spatial = isSpatialWorkspace();
  const spatialMode =
    activeWorkspace === 'systems' ? activeSystemDomain : activeWorkspace === 'twin' ? 'twin' : '';
  for (const surface of workspaceSurfaces) {
    surface.hidden =
      surface === spatialSurface ? !spatial : surface.dataset.workspaceSurface !== activeWorkspace;
  }
  for (const surface of systemSurfaces) {
    surface.hidden =
      activeWorkspace !== 'systems' || surface.dataset.systemSurface !== activeSystemDomain;
  }

  for (const overlay of spatialOverlays)
    overlay.hidden = overlay.dataset.spatialOverlay !== spatialMode;
  if (activeWorkspace === 'twin') {
    measurementBrowserGroup.after(inspector);
    viewerPanel.prepend(referenceScaleGroup);
    inspectorTechnical.open = false;
  } else {
    inspectorHome.append(inspector);
    referenceScaleHome.append(referenceScaleGroup);
    inspectorTechnical.open = true;
  }
  if (activeWorkspace === 'twin') {
    setBreadcrumb(['Twin', 'Measurement', SPATIAL_METRIC[activeSpatialMetric].label]);
  } else if (activeWorkspace === 'systems') {
    setBreadcrumb(['Systems', activeSystemDomain[0].toUpperCase() + activeSystemDomain.slice(1)]);
  } else if (activeWorkspace === 'assets' && selectedHardwareKey !== null) {
    setBreadcrumb(['Assets', 'Hardware condition', hardwareAssets[selectedHardwareKey].breadcrumb]);
  } else {
    setBreadcrumb(workspacePresentation[activeWorkspace]);
  }

  spatialLayerCallout.hidden =
    !isMeasurementSpatialWorkspace() || spatialLayerCallout.dataset.quiet === 'true';
  workspaceMain.dataset.workspace = activeWorkspace;
  workspaceMain.dataset.spatialMode = spatialMode;
  requestAnimationFrame(() => viewer?.resize());
}

function synchronizeNavigation() {
  const active =
    [...navigationItems].find((item) => item.hash === window.location.hash) ?? navigationItems[0];
  activeWorkspace = active.dataset.workspace;
  for (const item of navigationItems) {
    if (item === active) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  }
  for (const panel of workspacePanels) {
    panel.hidden = panel.dataset.workspacePanel !== activeWorkspace;
  }
  synchronizeWorkspaceSurface();
  if (window.location.hash) document.querySelector(active.hash)?.focus({ preventScroll: true });
}

function renderRegistrationControl(message = '') {
  registrationSource.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent =
    registrationSources.length === 0 ? 'No canonical source available' : 'Choose canonical source';
  registrationSource.append(placeholder);
  for (const source of registrationSources) {
    const option = document.createElement('option');
    option.value = source.sensor_id;
    option.textContent = `${source.sensor_id} · ${metricPresentation[source.metric]?.label ?? source.metric}`;
    option.disabled = source.coordinate_system_id === null;
    registrationSource.append(option);
  }
  registrationSource.disabled = registrationSources.length === 0;
  startRegistrationButton.disabled = true;
  inspectRegistrationButton.disabled = true;
  registrationMessage.textContent =
    message ||
    (registrationSources.length === 0
      ? 'No canonical sensor source available for registration.'
      : registrationSources.some(({ coordinate_system_id }) => coordinate_system_id !== null)
        ? 'Choose a canonical source, then select a point on the reference geometry.'
        : 'No canonical reference coordinate system is available.');
}

function setSpatialAnchors(anchors) {
  spatialAnchors = normalizeSpatialAnchors(anchors);
  viewer?.setSpatialAnchors(spatialAnchors);
  const locations = new Set(
    spatialAnchors.map(
      ({ coordinate_system_id, position }) => `${coordinate_system_id}:${position.join(',')}`
    )
  );
  for (const element of anchorCounts)
    element.textContent = `${locations.size} location${locations.size === 1 ? '' : 's'}`;
}

async function loadSpatialRegistration(message = '') {
  try {
    const response = await fetch('/api/spatial-registration', {
      headers: { accept: 'application/json' },
      signal: spatialRegistrationAbort.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    if (!Array.isArray(result.sources) || !Array.isArray(result.anchors)) {
      throw new TypeError('Invalid spatial registration response.');
    }
    registrationSources = result.sources.filter(
      (source) =>
        typeof source?.sensor_id === 'string' &&
        typeof source?.asset_id === 'string' &&
        typeof source?.metric === 'string' &&
        Object.hasOwn(SPATIAL_METRIC, source.metric) &&
        (source.coordinate_system_id === null || typeof source.coordinate_system_id === 'string')
    );
    setSpatialAnchors(result.anchors);
    renderRegistrationControl(message);
    renderMeasurements(liveState?.records ?? []);
  } catch {
    if (spatialRegistrationAbort.signal.aborted) return;
    registrationSources = [];
    setSpatialAnchors([]);
    renderRegistrationControl('Spatial registration service unavailable.');
  }
}

function samePosition(left, right) {
  return left?.length === 3 && left.every((value, index) => Math.abs(value - right[index]) < 1e-6);
}

async function synchronizeAcceptanceAnchors() {
  const positions = viewer?.acceptanceAnchorPositions();
  if (!positions) throw new Error('Middle cabinet surfaces unavailable.');
  const required = [
    ['acceptance-sht31-a-temperature', positions.top],
    ['acceptance-sht31-a-humidity', positions.top],
    ['acceptance-sht31-b-temperature', positions.front],
    ['acceptance-sht31-b-humidity', positions.front],
    ['acceptance-voltage', positions.electrical],
    ['acceptance-current', positions.electrical],
    ['acceptance-active-power', positions.electrical],
    ['acceptance-apparent-power', positions.electrical],
    ['acceptance-power-factor', positions.electrical],
    ['acceptance-frequency', positions.electrical],
    ['acceptance-energy', positions.electrical],
  ];
  let changed = false;
  for (const [sensorId, position] of required) {
    const source = registrationSources.find(({ sensor_id: candidate }) => candidate === sensorId);
    const anchor = spatialAnchors.find(({ sensor_id: candidate }) => candidate === sensorId);
    if (!source?.coordinate_system_id)
      throw new Error(`Missing coordinate system for ${sensorId}.`);
    if (samePosition(anchor?.position, position)) continue;
    const response = await fetch('/api/spatial-registration', {
      body: JSON.stringify({
        coordinate_system_id: source.coordinate_system_id,
        position,
        sensor_id: sensorId,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      signal: spatialRegistrationAbort.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    changed = true;
  }
  if (changed) await loadSpatialRegistration();
}

async function initializeSpatialRepresentation() {
  const [modelLoaded] = await Promise.all([
    viewer?.loadModel({ url: canvas.dataset.modelUrl }) ?? false,
    loadSpatialRegistration(),
  ]);
  if (!modelLoaded) return;
  renderMeasurements(liveState?.records ?? []);
  if (!registrationSources.some(({ sensor_id: id }) => id.startsWith('acceptance-'))) return;
  try {
    await synchronizeAcceptanceAnchors();
  } catch {
    if (spatialRegistrationAbort.signal.aborted) return;
    spatialLayerCallout.dataset.quiet = 'false';
    spatialLayerCallout.hidden = false;
    spatialLayerState.textContent = 'Spatial placement unavailable';
    spatialLayerMessage.textContent = 'Middle-cabinet sensor surfaces could not be persisted.';
  }
}

function selectSpatialContext(context) {
  selectedKey = spatialAnchorKey(context);
  renderMeasurements(liveState?.records ?? []);
}

try {
  viewer = new RackViewer(
    canvas,
    ({ state, message }) => {
      canvas.dataset.state = state;
      setStatus('geometry', ...modelPresentation[state]);
      viewerStatus.textContent = message ? `${messages[state]} ${message}` : messages[state];
      changeRegistrationSource();
    },
    undefined,
    selectSpatialContext,
    (position) => {
      if (position === null) {
        registrationPreview = null;
        registrationPreviewPanel.hidden = true;
        registrationMessage.textContent = 'Select a point on the loaded reference geometry.';
        return;
      }
      const source = registrationSources.find(
        ({ sensor_id }) => sensor_id === registrationSource.value
      );
      if (!source?.coordinate_system_id) return;
      registrationPreview = {
        coordinate_system_id: source.coordinate_system_id,
        position,
        sensor_id: source.sensor_id,
      };
      for (const element of registrationPreviewAxes) {
        element.textContent = String(position[Number(element.dataset.previewAxis)]);
      }
      registrationPreviewPanel.hidden = false;
      registrationMessage.textContent = 'Reference geometry point selected. Confirm to persist.';
    }
  );
  setSpatialAnchors(spatialAnchors);
} catch (error) {
  canvas.dataset.state = MODEL_STATE.ERROR;
  setStatus('geometry', 'Error', 'error');
  viewerStatus.textContent = 'WebGL is unavailable in this browser.';
  const message = error instanceof Error ? error.message.slice(0, 160) : 'Unknown WebGL error.';
  console.error(`Rack viewer initialization failed: ${message}`);
}

function createRegistryRow(record) {
  const presentation = metricPresentation[record.metric];
  const key = currentStateKey(record);
  const row = document.createElement('div');
  row.className = 'registry-source-row';
  row.dataset.currentKey = key;
  row.setAttribute('role', 'row');
  if (key === selectedKey) row.dataset.selected = 'true';

  const system = document.createElement('span');
  system.textContent = presentation.system;
  const metric = document.createElement('button');
  metric.type = 'button';
  metric.className = 'registry-metric';
  metric.dataset.selectKey = key;
  metric.textContent = presentation.label;
  const source = document.createElement('small');
  source.textContent = productSource(record.sensor_id, presentation.group);
  metric.append(source);
  const reading = document.createElement('span');
  reading.className = 'registry-reading';
  reading.textContent = `${record.value} ${record.unit}`;
  const sourceTime = document.createElement('time');
  sourceTime.dateTime = record.source_ts;
  sourceTime.textContent = record.source_ts;
  sourceTime.title = record.source_ts;
  const spatial = document.createElement('span');
  spatial.className = 'registry-spatial';
  const registered = viewer?.hasSpatialAnchor(record) ?? false;
  const state = document.createElement('small');
  const spatialMetric = ['environment', 'acoustic', 'electrical'].includes(presentation.group);
  state.textContent = spatialMetric ? (registered ? 'Located' : 'Unregistered') : '—';
  const locate = document.createElement('button');
  locate.type = 'button';
  locate.dataset.locateKey = key;
  locate.textContent = 'Locate in Twin';
  locate.disabled = !registered;
  if (!registered) locate.title = 'Spatial anchor unregistered';
  spatial.append(state);
  if (registered) spatial.append(locate);
  row.append(system, metric, reading, sourceTime, spatial);
  return row;
}

function createDefinitionRegistryRow(system, label, value, spatialState, reference = '') {
  const row = document.createElement('div');
  row.className = 'registry-source-row registry-definition-row';
  row.setAttribute('role', 'row');
  for (const [index, cellValue] of [system, label, value, 'Not observed', spatialState].entries()) {
    const cell = document.createElement('span');
    cell.textContent = cellValue;
    if (index === 1) {
      cell.className = 'registry-metric';
      const definition = document.createElement('small');
      definition.textContent = 'Configured definition';
      cell.append(definition);
      if (reference) {
        const referenceText = document.createElement('small');
        referenceText.textContent = reference;
        cell.append(referenceText);
      }
    }
    row.append(cell);
  }
  return row;
}

function renderStreamRegistry(records) {
  streamRegistryBody.replaceChildren();
  const matches = (group) => activeStreamFilter === 'all' || activeStreamFilter === group;
  streamRegistryBody.append(
    ...records
      .filter((record) =>
        matches(
          metricPresentation[record.metric]?.group === 'diagnostic'
            ? 'device'
            : metricPresentation[record.metric]?.group
        )
      )
      .map(createRegistryRow)
  );
  for (const [metric, presentation] of Object.entries(metricPresentation)) {
    if (!matches(presentation.group === 'diagnostic' ? 'device' : presentation.group)) continue;
    if (records.some((record) => record.metric === metric)) continue;
    streamRegistryBody.append(
      createDefinitionRegistryRow(
        presentation.system,
        presentation.label,
        `Not observed · ${presentation.unit}`,
        ['environment', 'acoustic', 'electrical'].includes(presentation.group)
          ? 'Unregistered'
          : '—',
        presentation.reference
      )
    );
  }
  if (matches('device')) {
    const deviceStatus = summarizeDeviceStatus(records);
    streamRegistryBody.append(
      createDefinitionRegistryRow(
        'Device',
        'Device status',
        deviceStatus === 'online'
          ? 'Online'
          : deviceStatus === 'offline'
            ? 'Offline'
            : records.length > 0
              ? 'Measurements received'
              : 'Not observed',
        '—'
      )
    );
  }
}

function renderSelectedContext(record, anchor) {
  const supportedWorkspace =
    activeWorkspace === 'twin' ||
    (activeWorkspace === 'systems' && activeSystemDomain === 'mechanical');
  const hasSelection = (record !== null || anchor !== null) && supportedWorkspace;
  inspector.hidden = !hasSelection;
  inspector.dataset.empty = String(!hasSelection);
  inspectorEmpty.hidden = hasSelection;
  inspectorDetail.hidden = !hasSelection;
  clearSelectionButton.hidden = !hasSelection;
  workspaceMain.dataset.inspectorOpen = String(hasSelection && activeWorkspace !== 'twin');
  workspaceMain.dataset.inspectorContext = hasSelection ? 'selection' : '';
  const showDock =
    record !== null &&
    hasSelection &&
    activeWorkspace !== 'twin' &&
    isMeasurementSpatialWorkspace();
  analyticsDock.hidden = !showDock;
  workspaceMain.dataset.analyticsOpen = String(showDock);

  for (const panel of analyticsPanels) {
    panel.classList.toggle(
      'is-context',
      record !== null && hasSelection && panel.dataset.metric === record.metric
    );
  }
  if (!hasSelection) {
    inspectorKicker.textContent = 'Workspace context';
    inspectorTitle.textContent = 'Spatial context';
    analyticsContext.textContent = 'No measurement selected';
    inspectorSwatch.hidden = true;
    viewer?.setSpatialSelection(null);
    return;
  }

  const context = record ?? anchor;
  const presentation = metricPresentation[context.metric];
  inspectorKicker.textContent = 'Selected context';
  inspectorTitle.textContent = presentation.label;
  inspectorValue.textContent = record === null ? 'Not observed' : String(record.value);
  inspectorUnit.textContent = context.unit;
  const color = record === null ? null : measurementColor(record.metric, record.value);
  inspectorSwatch.hidden = color === null;
  if (color) {
    inspectorSwatch.style.backgroundColor = `#${color.getHexString()}`;
    inspectorSwatch.title = 'Visualization color; no alarm policy configured';
  }
  inspectorSensor.textContent = productSource(context.sensor_id, presentation.group);
  inspectorSensor.title = inspectorSensor.textContent;
  inspectorMetric.textContent = context.metric;
  inspectorAsset.textContent =
    context.asset_id === 'acceptance-context' ? 'Rack' : context.asset_id;
  inspectorAsset.title = inspectorAsset.textContent;
  inspectorQuality.textContent = record?.quality ?? 'Not observed';
  inspectorQuality.dataset.tone = stateTone[record?.quality] ?? 'unknown';
  inspectorSource.textContent = record?.source_status ?? 'Not observed';
  inspectorSource.dataset.tone = stateTone[record?.source_status] ?? 'unknown';
  inspectorAcquired.textContent = record?.source_ts ?? 'Not observed';
  inspectorAcquired.title = record?.source_ts ?? '';
  inspectorReceived.textContent = record?.received_at ?? 'Not observed';
  inspectorReceived.title = record?.received_at ?? '';
  const hasRawValue = record !== null && Object.hasOwn(record, 'raw_value');
  inspectorRawRow.hidden = !hasRawValue;
  if (hasRawValue) inspectorRaw.textContent = String(record.raw_value);
  inspectorRegistration.textContent = anchor ? 'Located on rack model' : 'Unregistered';
  inspectorCoordinateRow.hidden = anchor === null;
  inspectorPositionRow.hidden = anchor === null;
  if (anchor) {
    inspectorCoordinate.textContent = anchor.coordinate_system_id;
    inspectorCoordinate.title = anchor.coordinate_system_id;
    const position = anchor.position.join(', ');
    inspectorPosition.textContent = position;
    inspectorPosition.title = position;
  }
  analyticsContext.textContent = record
    ? `${presentation.label} · ${productSource(record.sensor_id, presentation.group)}`
    : 'No measurement selected';
  viewer?.setSpatialSelection(anchor);
}

function renderHistoryUnavailable(container, message = 'No historical series available') {
  container.replaceChildren();
  const empty = document.createElement('p');
  empty.className = 'history-empty';
  empty.textContent = message;
  container.append(empty);
}

async function loadHistory(container, metric, signal, maxPoints) {
  renderHistoryUnavailable(container, 'Loading canonical history…');
  try {
    const response = await fetch(
      historyUrl({
        assetId,
        metric,
        sensorId: container === analyticsHistoryChart ? historySource.value : '',
        range: activeHistoryRange,
        maxPoints,
      }),
      { headers: { accept: 'application/json' }, signal }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const rendered = renderHistoryChart(container, payload);
    if (container === analyticsHistoryChart) {
      analyticsHistoryState.textContent = rendered
        ? `${activeHistoryRange} · ${payload.series.length} source${payload.series.length === 1 ? '' : 's'}`
        : 'No historical series available';
      analyticsBrowserState.textContent = rendered
        ? `${payload.series.length} historical source${payload.series.length === 1 ? '' : 's'}`
        : 'No historical series available';
      analyticsBrowserMetric.textContent = metricPresentation[metric]?.label ?? metric;
      analyticsBrowserSource.textContent = historySource.value || 'All matching sources';
      analyticsBrowserRange.textContent = activeHistoryRange;
    }
  } catch {
    if (signal.aborted) return;
    renderHistoryUnavailable(container, 'History unavailable');
    if (container === analyticsHistoryChart) {
      analyticsHistoryState.textContent = 'History unavailable';
      analyticsBrowserState.textContent = 'History unavailable';
    }
  }
}

function refreshHistory() {
  historyAbort?.abort();
  historyAbort = new window.AbortController();
  const { signal } = historyAbort;
  if (!assetId) {
    if (activeWorkspace === 'analytics') {
      renderHistoryUnavailable(
        analyticsHistoryChart,
        'Configure an asset context to query history.'
      );
      analyticsHistoryState.textContent = 'Asset not configured';
    }
    return;
  }
  if (activeWorkspace === 'analytics') {
    if (!historyMetric.value) {
      renderHistoryUnavailable(analyticsHistoryChart, 'Select a canonical metric');
      analyticsHistoryState.textContent = 'Select a metric';
      return;
    }
    void loadHistory(analyticsHistoryChart, historyMetric.value, signal, 1200);
    return;
  }
  if (activeWorkspace !== 'systems' || activeSystemDomain === 'architecture') return;
  const surface =
    activeSystemDomain === 'mechanical'
      ? document.querySelector('[data-spatial-overlay="mechanical"]')
      : document.querySelector(`[data-system-surface="${activeSystemDomain}"]`);
  for (const card of surface?.querySelectorAll('[data-history-metric]') ?? []) {
    void loadHistory(card.querySelector('.history-chart'), card.dataset.historyMetric, signal, 480);
  }
}

function updateHistorySources(records) {
  const selected = historySource.value;
  const matching = records.filter((record) => record.metric === historyMetric.value);
  historySource.replaceChildren();
  const all = document.createElement('option');
  all.value = '';
  all.textContent = 'All matching sources';
  historySource.append(all);
  for (const record of matching) {
    const option = document.createElement('option');
    option.value = record.sensor_id;
    option.textContent = record.sensor_id;
    historySource.append(option);
  }
  historySource.value = matching.some(({ sensor_id }) => sensor_id === selected) ? selected : '';
}

function renderAssets(records) {
  const active = hardwareActivity(records);
  const conditions = Object.fromEntries(
    Object.keys(hardwareAssets).map((key) => [
      key,
      hardwareConditionState(key, records, active[key]),
    ])
  );
  assetCount.textContent = `${Object.values(active).filter(Boolean).length} sources with data`;

  for (const node of hardwareNodes) {
    const key = node.dataset.hardwareNode;
    node.dataset.active = String(Boolean(active[key]));
    node.dataset.condition = ['watch', 'degraded'].includes(conditions[key].tone)
      ? conditions[key].tone
      : 'unknown';
    node.setAttribute('aria-pressed', String(selectedHardwareKey === key));
  }
  for (const target of hardwareConditionTargets) {
    const condition = conditions[target.dataset.condition];
    const observed = active[target.dataset.condition];
    target.textContent = ['watch', 'degraded'].includes(condition.tone)
      ? condition.label
      : observed
        ? 'Data available'
        : 'No data';
    target.dataset.tone = ['watch', 'degraded'].includes(condition.tone)
      ? condition.tone
      : 'unknown';
    const detail =
      target.parentElement.querySelector('small') ??
      target.parentElement.appendChild(document.createElement('small'));
    detail.textContent = hardwareStripDetail(target.dataset.condition, records);
    detail.hidden = !detail.textContent;
  }
  for (const state of hardwareStateTargets) {
    const condition = conditions[state.dataset.hardwareState];
    state.textContent = ['watch', 'degraded'].includes(condition.tone)
      ? condition.label
      : active[state.dataset.hardwareState]
        ? 'Data available'
        : 'No data';
    state.dataset.tone = ['watch', 'degraded'].includes(condition.tone)
      ? condition.tone
      : 'unknown';
  }
  for (const trace of hardwareTraces) {
    const traceKey = trace.dataset.trace;
    trace.dataset.active = String(
      traceKey.startsWith('power') ||
        (traceKey === 'i2c0' && active['sht31-a']) ||
        (traceKey === 'i2c1' && active['sht31-b']) ||
        (traceKey === 'i2s0' && active.inmp441) ||
        (traceKey === 'electrical' && active.electrical) ||
        (traceKey === 'transport' && active['esp32-s3'])
    );
  }
  for (const target of hardwareValueTargets) {
    target.textContent = hardwareLiveValue(target.dataset.hardwareValue, records);
  }
  const powerFactor = records.find(({ sensor_id: id }) => id === 'acceptance-power-factor');
  const frequency = records.find(({ sensor_id: id }) => id === 'acceptance-frequency');
  document.querySelector('[data-hardware-secondary="electrical"]').textContent =
    powerFactor && frequency ? `PF ${powerFactor.value} · ${frequency.value} Hz` : '';
  for (const target of document.querySelectorAll('[data-hardware-power]')) {
    const key = target.dataset.hardwarePower;
    const voltage = records.find(({ sensor_id: id }) => id === `acceptance-${key}-supply-voltage`);
    const current = records.find(({ sensor_id: id }) => id === `acceptance-${key}-supply-current`);
    target.textContent = voltage && current ? `${voltage.value} V · ${current.value} mA` : '';
  }
  const acoustic = Object.fromEntries(
    records
      .filter(({ metric }) => ['sound_rms_dbfs', 'sound_peak_dbfs'].includes(metric))
      .map((record) => [record.metric, record])
  );
  const acousticSummary =
    acoustic.sound_rms_dbfs && acoustic.sound_peak_dbfs
      ? `RMS ${acoustic.sound_rms_dbfs.value} · Peak ${acoustic.sound_peak_dbfs.value} dBFS`
      : 'RMS + Peak dBFS';
  for (const target of document.querySelectorAll('[data-acoustic-summary]')) {
    target.textContent = acousticSummary;
  }
  renderHardwareDetail(active, conditions, records);
}

function hardwareStripDetail(key, records) {
  const metric =
    key === 'esp32-s3'
      ? 'uptime_s'
      : key === 'electrical'
        ? 'voltage_v'
        : key === 'inmp441'
          ? 'i2s_error_count'
          : 'crc_error_count';
  const asset = hardwareAssets[key];
  const record = records.find(
    ({ sensor_id: sensorId, metric: candidate }) =>
      candidate === metric && (asset.diagnosticSensors ?? asset.sensors).includes(sensorId)
  );
  if (!record) return '';
  if (metric === 'uptime_s') return `${Math.floor(record.value / 86_400)} d uptime`;
  if (metric === 'voltage_v') return `${record.value} V`;
  return `${metric === 'crc_error_count' ? 'CRC' : 'I²S err'} ${record.value}`;
}

function hardwareActivity(records) {
  const active = {};
  for (const [key, asset] of Object.entries(hardwareAssets)) {
    active[key] = asset.primaryMetrics
      ? records.some(({ metric }) => asset.primaryMetrics.includes(metric))
      : records.some(({ sensor_id }) => asset.sensors.includes(sensor_id));
  }
  return active;
}

function hardwareConditionState(key, records, active) {
  const asset = hardwareAssets[key];
  const ownedSensors = new Set([...asset.sensors, ...(asset.diagnosticSensors ?? [])]);
  const ownedRecords = asset.primaryMetrics
    ? records.filter(
        ({ metric, sensor_id: sensorId }) =>
          asset.primaryMetrics.includes(metric) || ownedSensors.has(sensorId)
      )
    : records.filter(({ sensor_id: sensorId }) => ownedSensors.has(sensorId));
  const diagnosticMetrics = asset.diagnostics.map(([, metric]) => metric);
  const diagnostics = ownedRecords.filter(
    ({ metric, sensor_id: sensorId }) =>
      diagnosticMetrics.includes(metric) &&
      (asset.diagnosticSensors ?? asset.sensors).includes(sensorId)
  );
  if (!active)
    return {
      decision: 'Validate against reference',
      label: 'Unknown',
      tone: 'unknown',
      reasons: ['No current canonical observation'],
    };
  if (ownedRecords.some(({ quality }) => ['degraded', 'invalid'].includes(quality))) {
    return {
      decision: 'Inspect',
      label: 'Degraded',
      tone: 'degraded',
      reasons: ['Current source reports degraded or invalid quality'],
    };
  }
  if (
    ownedRecords.some(({ source_ts: timestamp }) => Date.now() - Date.parse(timestamp) > 120_000)
  ) {
    return {
      decision: 'Inspect',
      label: 'Degraded',
      tone: 'degraded',
      reasons: [
        'Current observation is more than two minutes old (DT_DataCenter operational policy)',
      ],
    };
  }
  if (diagnosticMetrics.length && diagnostics.length < diagnosticMetrics.length) {
    return {
      decision: 'Validate against reference',
      label: 'Unknown',
      tone: 'unknown',
      reasons: ['Current diagnostic or power evidence is incomplete'],
    };
  }
  if (key === 'electrical' && ownedRecords.length < asset.sensors.length) {
    return {
      decision: 'Validate against reference',
      label: 'Unknown',
      tone: 'unknown',
      reasons: ['Rack electrical measurements are incomplete'],
    };
  }
  const reasons = [];
  for (const record of diagnostics) {
    if (record.metric.endsWith('_count')) {
      const identity = `${record.sensor_id}:${record.metric}`;
      const previous = diagnosticBaseline.get(identity);
      if (previous !== undefined && record.value > previous)
        recentDiagnosticChanges.set(identity, Date.now());
      diagnosticBaseline.set(identity, record.value);
      if (Date.now() - (recentDiagnosticChanges.get(identity) ?? 0) < 15 * 60_000)
        reasons.push(
          `${record.metric}: new count observed within 15 min (DT_DataCenter operational policy)`
        );
    }
    if (record.metric.endsWith('_ratio') && record.value > 0.01)
      reasons.push(
        `${record.metric}: ${(record.value * 100).toFixed(2)}% (DT_DataCenter operational policy)`
      );
    if (record.metric === 'supply_voltage_v') {
      const [minimum, maximum] =
        key === 'inmp441' ? [1.62, 3.63] : key.startsWith('sht31-') ? [2.15, 5.5] : [3, 3.6];
      if (record.value < minimum || record.value > maximum)
        reasons.push(
          `Simulated supply ${record.value} V outside manufacturer reference ${minimum}–${maximum} V`
        );
    }
  }
  if (reasons.length) return { decision: 'Inspect', label: 'Watch', tone: 'watch', reasons };
  return {
    decision: 'Continue operation',
    label: 'Nominal',
    tone: 'nominal',
    reasons: [
      diagnosticMetrics.length
        ? 'Current diagnostics present; no new counter change observed in this session'
        : 'Current rack electrical observations present; meter model remains pending',
    ],
  };
}

function hardwareLiveValue(key, records) {
  if (key === 'esp32-s3') {
    const uptime = records.find(({ sensor_id: id }) => id === 'acceptance-esp32-uptime');
    return uptime ? `Uptime ${Math.floor(uptime.value / 86_400)} d` : 'Not observed';
  }
  const metrics = {
    'sht31-a': ['acceptance-sht31-a-temperature', 'acceptance-sht31-a-humidity'],
    'sht31-b': ['acceptance-sht31-b-temperature', 'acceptance-sht31-b-humidity'],
    inmp441: ['acceptance-inmp441-rms', 'acceptance-inmp441-peak'],
    electrical: ['acceptance-voltage', 'acceptance-current', 'acceptance-active-power'],
  }[key];
  const values = metrics
    ?.map((sensorId) => records.find(({ sensor_id: candidate }) => candidate === sensorId))
    .filter(Boolean);
  return values?.length
    ? values
        .map(
          ({ value, unit, metric }) =>
            `${key === 'inmp441' ? (metric === 'sound_rms_dbfs' ? 'RMS ' : 'Peak ') : ''}${value} ${unit === 'degC' ? '°C' : unit === 'percent_rh' ? '%RH' : unit}`
        )
        .join(' · ')
    : 'Not observed';
}

function diagnosticValue(record) {
  if (!record) return 'Not measured';
  if (record.unit === 'ratio') return `${(record.value * 100).toFixed(2)}%`;
  return `${record.value} ${record.unit}`;
}

function renderHardwareDetail(active, conditions, records) {
  const asset = selectedHardwareKey === null ? null : hardwareAssets[selectedHardwareKey];
  hardwareDetail.hidden = asset === null;
  hardwareTopology.dataset.selectedHardware = selectedHardwareKey ?? '';
  if (asset === null) return;

  hardwareTitle.textContent = asset.title;
  const condition = conditions[selectedHardwareKey];
  hardwareStateLabel.textContent = active[selectedHardwareKey]
    ? 'Current data available'
    : 'No current data';
  hardwareCondition.closest('.condition-decision').hidden = !['watch', 'degraded'].includes(
    condition.tone
  );
  hardwareCondition.textContent = condition.label;
  hardwareCondition.dataset.tone = condition.tone;
  hardwareDecision.textContent = condition.decision;
  const diagnosticRecords = new Map(
    records
      .filter(({ sensor_id: sensorId }) =>
        (asset.diagnosticSensors ?? asset.sensors).includes(sensorId)
      )
      .map((record) => [record.metric, record])
  );
  const availableDiagnostics = asset.diagnostics.filter(([, metric]) =>
    diagnosticRecords.has(metric)
  );
  hardwareDiagnostics.closest('section').hidden = availableDiagnostics.length === 0;
  hardwareDiagnostics.replaceChildren(
    ...availableDiagnostics.map(([label, metric]) => {
      const row = document.createElement('div');
      row.append(
        Object.assign(document.createElement('dt'), {
          textContent: label,
        }),
        Object.assign(document.createElement('dd'), {
          textContent: diagnosticValue(diagnosticRecords.get(metric)),
        })
      );
      return row;
    })
  );
  hardwareFacts.replaceChildren(
    ...asset.facts.map(([term, detail]) => {
      const row = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = term;
      dd.textContent = detail;
      row.append(dt, dd);
      return row;
    })
  );
  hardwarePinMatrix.replaceChildren(
    ...asset.pins.map(([pin, connection, role]) => {
      const row = document.createElement('tr');
      for (const value of [pin, connection, role]) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      }
      return row;
    })
  );
  renderHardwareScope(records);
}

function hardwareScopeSignals(key) {
  return {
    'esp32-s3': [
      ['acceptance-esp32-supply-current', 'supply_current_ma'],
      ['acceptance-esp32-supply-voltage', 'supply_voltage_v'],
      ['acceptance-esp32-mqtt-reconnect', 'mqtt_reconnect_count'],
    ],
    'sht31-a': [
      ['acceptance-sht31-a-temperature', 'temperature'],
      ['acceptance-sht31-a-humidity', 'humidity'],
      ['acceptance-sht31-a-retry', 'i2c_retry_count'],
    ],
    'sht31-b': [
      ['acceptance-sht31-b-temperature', 'temperature'],
      ['acceptance-sht31-b-humidity', 'humidity'],
      ['acceptance-sht31-b-retry', 'i2c_retry_count'],
    ],
    inmp441: [
      ['acceptance-inmp441-rms', 'sound_rms_dbfs'],
      ['acceptance-inmp441-peak', 'sound_peak_dbfs'],
      ['acceptance-inmp441-clip-ratio', 'clip_ratio'],
    ],
    electrical: [
      ['acceptance-voltage', 'voltage_v'],
      ['acceptance-current', 'current_a'],
      ['acceptance-active-power', 'active_power_w'],
    ],
  }[key];
}

async function loadHardwareHistory(container, sensorId, metric, range, signal, maxPoints) {
  renderHistoryUnavailable(container, 'Loading history…');
  try {
    const response = await fetch(historyUrl({ assetId, metric, sensorId, range, maxPoints }), {
      signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    renderHistoryChart(container, await response.json());
  } catch {
    if (!signal.aborted) renderHistoryUnavailable(container, 'History unavailable');
  }
}

function renderHardwareScope(records) {
  if (!selectedHardwareKey) return;
  scopeSource.textContent = hardwareAssets[selectedHardwareKey].title;
  if (!assetId) {
    scopeTraces.textContent = 'Asset context not configured; no historical source is available.';
    return;
  }
  const signals = hardwareScopeSignals(selectedHardwareKey);
  const key = `${selectedHardwareKey}\0${scopeRange}`;
  for (const [sensorId] of signals) {
    const label = scopeTraces.querySelector(`[data-scope-value="${sensorId}"]`);
    if (label)
      label.textContent = diagnosticValue(records.find(({ sensor_id: id }) => id === sensorId));
  }
  if (scopeRequestKey === key && (scopeRange !== 'live' || Date.now() - scopeFetchedAt < 60_000))
    return;
  scopeRequest?.abort();
  scopeRequest = new window.AbortController();
  scopeRequestKey = key;
  scopeFetchedAt = Date.now();
  scopeTraces.replaceChildren(
    ...signals.map(([sensorId, metric]) => {
      const panel = document.createElement('div');
      panel.className = 'hardware-scope-signal';
      const title = document.createElement('p');
      title.textContent = metricPresentation[metric]?.label ?? metric;
      const value = document.createElement('strong');
      value.dataset.scopeValue = sensorId;
      value.textContent = diagnosticValue(records.find(({ sensor_id: id }) => id === sensorId));
      const chart = document.createElement('div');
      chart.className = 'history-chart';
      panel.append(title, value, chart);
      void loadHardwareHistory(
        chart,
        sensorId,
        metric,
        scopeRange === 'live' ? '1h' : scopeRange,
        scopeRequest.signal,
        240
      );
      return panel;
    })
  );
}

function scaleGradient(scale) {
  return `linear-gradient(0deg, ${scale.stops
    .map(({ color, value }) => {
      const position = ((value - scale.minimum) / (scale.maximum - scale.minimum)) * 100;
      return `#${color.toString(16).padStart(6, '0')} ${position}%`;
    })
    .join(', ')})`;
}

function renderMeasurementLegend() {
  const scale = MEASUREMENT_SCALE[activeSpatialMetric];
  const showLegend = activeWorkspace === 'twin' && scale !== undefined;
  referenceScaleGroup.hidden = !showLegend;
  measurementLegend.hidden = !showLegend;
  if (!showLegend) return;

  legendMetric.textContent = SPATIAL_METRIC[activeSpatialMetric].label;
  for (const panel of legendPanels) {
    const active = panel.dataset.measurementLegend === activeSpatialMetric;
    panel.hidden = !active;
    if (!active) continue;
    panel.querySelector('[data-legend-gradient]').style.background = scaleGradient(scale);
  }
}

function renderSpatialState(records) {
  const presentation = SPATIAL_METRIC[activeSpatialMetric];
  const activeMetrics = presentation.metrics ?? [activeSpatialMetric];
  const groupObserved = records.some(({ metric }) => activeMetrics.includes(metric));
  const result = viewer?.updateSpatialMeasurements(records, activeSpatialMetric) ?? {
    anchorCount: 0,
    count: 0,
    label: SPATIAL_METRIC[activeSpatialMetric].label,
    maximum: null,
    minimum: null,
    unit: SPATIAL_METRIC[activeSpatialMetric].unit,
    zoneCount: 0,
  };
  spatialLayerMetric.textContent = 'Measurement context';
  legendMetric.textContent = result.label;
  measurementZoneState.textContent =
    result.zoneCount === 0
      ? 'Unavailable'
      : `${result.zoneCount} measured point${result.zoneCount === 1 ? '' : 's'}`;
  for (const summary of zoneSummaries) summary.textContent = measurementZoneState.textContent;

  let quiet = false;
  if (result.anchorCount === 0) {
    spatialLayerState.textContent = 'Spatial measurement unavailable';
    spatialLayerMessage.textContent = MEASUREMENT_SCALE[activeSpatialMetric]
      ? `No registered source with current ${result.label.toLowerCase()} measurement.`
      : 'Register a physical sensor position to enable this layer.';
  } else if (!presentation.zones && groupObserved) {
    quiet = true;
  } else if (!presentation.zones) {
    spatialLayerState.textContent = `${result.label} not observed`;
    spatialLayerMessage.textContent = 'No matching canonical current measurement is available.';
  } else if (result.count === 0) {
    spatialLayerState.textContent = 'Registered source not observed';
    spatialLayerMessage.textContent = 'No matching canonical current measurement is available.';
  } else if (SPATIAL_METRIC[activeSpatialMetric].zones && result.zoneCount === 0) {
    spatialLayerState.textContent = 'Spatial surface unavailable';
    spatialLayerMessage.textContent = 'The registered point could not be projected onto geometry.';
  } else {
    quiet = true;
  }
  spatialLayerCallout.dataset.quiet = String(quiet);

  renderMeasurementLegend(records);
  spatialLayerCallout.hidden = !isMeasurementSpatialWorkspace() || quiet;
}

function focusCurrentKey(key) {
  for (const element of document.querySelectorAll('[data-current-key]')) {
    if (element.dataset.currentKey === key) {
      element.focus({ preventScroll: true });
      return;
    }
  }
}

function setHardwareFocus(key) {
  hardwareTopology.dataset.focusHardware = key ?? '';
  const traces = key === null ? [] : hardwareAssets[key].traces;
  for (const trace of hardwareTraces) {
    trace.dataset.focused = String(traces.includes(trace.dataset.trace));
  }
}

function selectHardware(event) {
  const node = event.target.closest('[data-hardware-node]');
  const trace = event.target.closest('[data-trace]');
  const traceOwner = {
    i2c0: 'sht31-a',
    i2c1: 'sht31-b',
    i2s0: 'inmp441',
    transport: 'esp32-s3',
    electrical: 'electrical',
  };
  const key = node?.dataset.hardwareNode ?? traceOwner[trace?.dataset.trace];
  if (!key) return;
  selectedHardwareKey = key;
  setHardwareFocus(key);
  renderAssets(liveState?.records ?? []);
  synchronizeWorkspaceSurface();
}

function renderMeasurements(records) {
  const simulationPresent = records.some(({ device_id: id }) => id?.startsWith('acceptance-'));
  registrationGroup.hidden = simulationPresent;
  spatialReadinessGroup.hidden = simulationPresent;
  const summaries = {
    temperature: records
      .filter(({ metric }) => metric === 'temperature')
      .sort((a, b) => a.sensor_id.localeCompare(b.sensor_id))
      .map(
        ({ value }, index) => `${String.fromCharCode(65 + index)} ${Number(value).toFixed(1)} °C`
      )
      .join(' · '),
    humidity: records
      .filter(({ metric }) => metric === 'humidity')
      .sort((a, b) => a.sensor_id.localeCompare(b.sensor_id))
      .map(
        ({ value }, index) => `${String.fromCharCode(65 + index)} ${Number(value).toFixed(1)} %RH`
      )
      .join(' · '),
  };
  const rms = records.find(({ metric }) => metric === 'sound_rms_dbfs');
  const peak = records.find(({ metric }) => metric === 'sound_peak_dbfs');
  summaries.acoustic = [
    rms && `RMS ${Number(rms.value).toFixed(2)} dBFS`,
    peak && `Peak ${Number(peak.value).toFixed(2)} dBFS`,
  ]
    .filter(Boolean)
    .join('\n');
  const electrical = new Map(records.map(({ metric, value }) => [metric, Number(value)]));
  summaries.electrical = [
    electrical.has('voltage_v') &&
      electrical.has('current_a') &&
      `${electrical.get('voltage_v').toFixed(1)} V · ${electrical.get('current_a').toFixed(1)} A`,
    electrical.has('active_power_w') &&
      electrical.has('power_factor_ratio') &&
      `${electrical.get('active_power_w').toFixed(0)} W · PF ${electrical.get('power_factor_ratio').toFixed(2)}`,
  ]
    .filter(Boolean)
    .join('\n');
  for (const target of document.querySelectorAll('[data-twin-summary]')) {
    target.textContent = summaries[target.dataset.twinSummary] || 'Not observed';
  }
  const focusedKey = document.activeElement?.dataset.currentKey;
  let selectedRecord =
    selectedKey === null
      ? null
      : (records.find((record) => currentStateKey(record) === selectedKey) ?? null);
  const selectedAnchor =
    selectedKey === null
      ? null
      : (spatialAnchors.find((anchor) => spatialAnchorKey(anchor) === selectedKey) ?? null);
  if (selectedRecord === null && selectedAnchor !== null) {
    selectedRecord =
      records.find(
        (record) =>
          record.asset_id === selectedAnchor.asset_id &&
          record.sensor_id === selectedAnchor.sensor_id &&
          record.metric === selectedAnchor.metric
      ) ?? null;
  }
  const anchorForRecord =
    selectedRecord === null
      ? selectedAnchor
      : (spatialAnchors.find(
          (anchor) => spatialAnchorKey(anchor) === spatialAnchorKey(selectedRecord)
        ) ?? null);
  if (selectedRecord === null && selectedAnchor === null) selectedKey = null;
  const sorted = [...records].sort((left, right) =>
    [left.asset_id, left.sensor_id, left.metric]
      .join('\0')
      .localeCompare([right.asset_id, right.sensor_id, right.metric].join('\0'))
  );
  renderStreamRegistry(sorted);
  renderAssets(records);
  updateHistorySources(records);
  renderSpatialState(records);
  renderSelectedContext(selectedRecord, anchorForRecord);

  if (focusedKey !== undefined) focusCurrentKey(focusedKey);
  const countLabel = `${records.length} current measurement${records.length === 1 ? '' : 's'}`;
  for (const element of currentCounts) element.textContent = countLabel;
  const environmentalCount = records.filter((record) =>
    ['temperature', 'humidity'].includes(record.metric)
  ).length;
  const mechanicalLabel =
    environmentalCount === 0
      ? 'Not observed'
      : `${environmentalCount} current measurement${environmentalCount === 1 ? '' : 's'}`;
  for (const element of mechanicalCounts) element.textContent = mechanicalLabel;
  const deviceStatus = summarizeDeviceStatus(records);
  setStatus(
    'device',
    deviceStatus === 'online'
      ? 'Online'
      : deviceStatus === 'offline'
        ? 'Offline'
        : records.length > 0
          ? 'Data received'
          : 'Not observed',
    deviceStatus === 'online' ? 'healthy' : deviceStatus === 'offline' ? 'error' : 'unknown'
  );
  renderConnectionStatus(records);
}

for (const element of assetContexts)
  element.textContent = assetId === 'acceptance-context' ? 'Rack' : assetId || 'Not configured';
try {
  liveState = new LiveCurrentState({
    assetId,
    onRecordsChange: renderMeasurements,
    onConnectionChange: (state) => {
      connectionState = state;
      renderConnectionStatus(liveState?.records ?? []);
    },
  });
  liveState.start();
} catch {
  for (const element of assetContexts) element.textContent = 'Invalid configuration';
  setStatus('backend', 'Not checked', 'unknown');
  setStatus('stream', 'Disabled', 'unknown');
}

function handleRegistryAction(event) {
  const select = event.target.closest('[data-select-key]');
  const locate = event.target.closest('[data-locate-key]');
  const key = select?.dataset.selectKey ?? locate?.dataset.locateKey;
  if (!key) return;
  const record = (liveState?.records ?? []).find((candidate) => currentStateKey(candidate) === key);
  if (!record) return;
  selectedKey = key;
  if (locate) {
    activeSpatialMetric = ['sound_rms_dbfs', 'sound_peak_dbfs'].includes(record.metric)
      ? 'acoustic'
      : metricPresentation[record.metric]?.group === 'electrical'
        ? 'electrical'
        : record.metric;
    for (const input of metricInputs) input.checked = input.value === activeSpatialMetric;
    window.location.hash = '#twin-workspace';
  }
  renderMeasurements(liveState.records);
}

function changeStreamFilter(event) {
  const button = event.target.closest('[data-stream-filter]');
  if (!button) return;
  activeStreamFilter = button.dataset.streamFilter;
  for (const choice of streamFilters)
    choice.setAttribute('aria-pressed', String(choice === button));
  renderStreamRegistry(liveState?.records ?? []);
}

function changeRegistrationSource() {
  registrationPreview = null;
  registrationPreviewPanel.hidden = true;
  viewer?.setRegistrationMode(false);
  const source = registrationSources.find(
    ({ sensor_id }) => sensor_id === registrationSource.value
  );
  startRegistrationButton.disabled =
    !source?.coordinate_system_id || canvas.dataset.state !== MODEL_STATE.READY;
  inspectRegistrationButton.disabled = !spatialAnchors.some(
    ({ sensor_id }) => sensor_id === source?.sensor_id
  );
  registrationMessage.textContent = source?.coordinate_system_id
    ? 'Select model point to begin reference geometry registration.'
    : 'Choose a canonical source with a reference coordinate system.';
}

function cancelRegistration(message = 'Registration cancelled. No anchor was created.') {
  if (typeof message !== 'string') message = 'Registration cancelled. No anchor was created.';
  registrationPreview = null;
  registrationPreviewPanel.hidden = true;
  confirmRegistrationButton.disabled = false;
  viewer?.setRegistrationMode(false);
  registrationMessage.textContent = message;
}

function startRegistration() {
  const source = registrationSources.find(
    ({ sensor_id }) => sensor_id === registrationSource.value
  );
  if (!source?.coordinate_system_id || canvas.dataset.state !== MODEL_STATE.READY) return;
  registrationPreview = null;
  registrationPreviewPanel.hidden = true;
  viewer?.setRegistrationMode(true);
  registrationMessage.textContent = 'Select a point on the loaded reference geometry.';
}

function inspectRegistration() {
  const anchor = spatialAnchors.find(({ sensor_id }) => sensor_id === registrationSource.value);
  if (!anchor) return;
  selectedKey = spatialAnchorKey(anchor);
  renderMeasurements(liveState?.records ?? []);
}

async function confirmRegistration() {
  if (registrationPreview === null) return;
  confirmRegistrationButton.disabled = true;
  try {
    const response = await fetch('/api/spatial-registration', {
      body: JSON.stringify(registrationPreview),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      signal: spatialRegistrationAbort.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const [anchor] = normalizeSpatialAnchors([await response.json()]);
    setSpatialAnchors([
      ...spatialAnchors.filter(
        (candidate) => spatialAnchorKey(candidate) !== spatialAnchorKey(anchor)
      ),
      anchor,
    ]);
    changeRegistrationSource();
    cancelRegistration('Reference geometry anchor registered.');
    renderMeasurements(liveState?.records ?? []);
  } catch {
    if (spatialRegistrationAbort.signal.aborted) return;
    confirmRegistrationButton.disabled = false;
    registrationMessage.textContent = 'Spatial registration could not be persisted.';
  }
}

function clearSelection() {
  const clearedKey = selectedKey;
  selectedKey = null;
  renderMeasurements(liveState?.records ?? []);
  focusCurrentKey(clearedKey);
}

function changeLayer(event) {
  const input = event.target.closest('[data-layer]');
  if (input === null) return;
  viewer?.setLayerVisibility(input.dataset.layer, input.checked);
}

function changeSurfaceMode() {
  activeSurfaceMode =
    activeSurfaceMode === SURFACE_MODE.TEXTURED ? SURFACE_MODE.CONTRAST : SURFACE_MODE.TEXTURED;
  viewer?.setSurfaceMode(activeSurfaceMode);
  const contrast = activeSurfaceMode === SURFACE_MODE.CONTRAST;
  surfaceModeButton.setAttribute('aria-pressed', String(contrast));
  surfaceModeButton.title = contrast ? 'Textured surface' : 'Contrast surface';
}

function changeMetric(event) {
  const input = event.target.closest('.spatial-metric-input');
  if (input === null) return;
  activeSpatialMetric = input.value;
  for (const candidate of metricInputs) candidate.checked = candidate.value === activeSpatialMetric;
  if (selectedKey !== null) {
    const selected = (liveState?.records ?? []).find(
      (record) => currentStateKey(record) === selectedKey
    );
    const replacement = (liveState?.records ?? []).find(
      (record) =>
        record.asset_id === selected?.asset_id &&
        record.sensor_id === selected?.sensor_id &&
        (SPATIAL_METRIC[activeSpatialMetric].metrics ?? [activeSpatialMetric]).includes(
          record.metric
        )
    );
    selectedKey = replacement ? currentStateKey(replacement) : null;
  }
  renderMeasurements(liveState?.records ?? []);
  synchronizeWorkspaceSurface();
}

function changeSystemDomain(event) {
  const button = event.target.closest('[data-system-domain]');
  if (button === null) return;
  activeSystemDomain = button.dataset.systemDomain;
  for (const candidate of domainButtons) {
    candidate.setAttribute('aria-pressed', String(candidate === button));
  }
  for (const summary of domainSummaries) {
    summary.hidden = summary.dataset.domainSummary !== activeSystemDomain;
  }
  synchronizeWorkspaceSurface();
  renderMeasurements(liveState?.records ?? []);
  refreshHistory();
}

function navigateWorkspace() {
  synchronizeNavigation();
  if (activeWorkspace !== 'twin') cancelRegistration();
  renderMeasurements(liveState?.records ?? []);
  refreshHistory();
}

function changeHistoryQuery(event) {
  const range = event.target.closest('[data-history-range]');
  if (event.type === 'click' && !range) return;
  if (range) {
    activeHistoryRange = range.dataset.historyRange;
    for (const button of historyRangeButtons) {
      button.setAttribute('aria-pressed', String(button === range));
    }
  }
  updateHistorySources(liveState?.records ?? []);
  refreshHistory();
}

for (const [metric, presentation] of Object.entries(metricPresentation)) {
  const option = document.createElement('option');
  option.value = metric;
  option.textContent = `${presentation.system} · ${presentation.label}`;
  historyMetric.append(option);
}
historyMetric.value = 'temperature';

synchronizeNavigation();
renderMeasurements(liveState?.records ?? []);
void initializeSpatialRepresentation();
window.addEventListener('hashchange', navigateWorkspace);
document.querySelector('#stream-browser').addEventListener('click', changeStreamFilter);
streamRegistryBody.addEventListener('click', handleRegistryAction);
hardwareTopology.addEventListener('click', selectHardware);
for (const button of scopeRanges)
  button.addEventListener('click', () => {
    scopeRange = button.dataset.scopeRange;
    for (const choice of scopeRanges)
      choice.setAttribute('aria-pressed', String(choice === button));
    renderHardwareScope(liveState?.records ?? []);
  });
hardwareTopology.addEventListener('keydown', (event) => {
  if (!['Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  selectHardware(event);
});
hardwareTopology.addEventListener('pointerover', (event) =>
  setHardwareFocus(
    event.target.closest('[data-hardware-node]')?.dataset.hardwareNode ?? selectedHardwareKey
  )
);
hardwareTopology.addEventListener('pointerout', () => setHardwareFocus(selectedHardwareKey));
clearSelectionButton.addEventListener('click', clearSelection);
surfaceModeButton.addEventListener('click', changeSurfaceMode);
layerControl.addEventListener('change', changeLayer);
workspaceBrowser.addEventListener('change', changeMetric);
domainSelector.addEventListener('click', changeSystemDomain);
registrationSource.addEventListener('change', changeRegistrationSource);
startRegistrationButton.addEventListener('click', startRegistration);
inspectRegistrationButton.addEventListener('click', inspectRegistration);
confirmRegistrationButton.addEventListener('click', confirmRegistration);
cancelRegistrationButton.addEventListener('click', cancelRegistration);
historyQuery.addEventListener('change', changeHistoryQuery);
historyQuery.addEventListener('click', changeHistoryQuery);

window.addEventListener(
  'pagehide',
  () => {
    window.removeEventListener('hashchange', navigateWorkspace);
    document.querySelector('#stream-browser').removeEventListener('click', changeStreamFilter);
    streamRegistryBody.removeEventListener('click', handleRegistryAction);
    hardwareTopology.removeEventListener('click', selectHardware);
    clearSelectionButton.removeEventListener('click', clearSelection);
    surfaceModeButton.removeEventListener('click', changeSurfaceMode);
    layerControl.removeEventListener('change', changeLayer);
    workspaceBrowser.removeEventListener('change', changeMetric);
    domainSelector.removeEventListener('click', changeSystemDomain);
    registrationSource.removeEventListener('change', changeRegistrationSource);
    startRegistrationButton.removeEventListener('click', startRegistration);
    inspectRegistrationButton.removeEventListener('click', inspectRegistration);
    confirmRegistrationButton.removeEventListener('click', confirmRegistration);
    cancelRegistrationButton.removeEventListener('click', cancelRegistration);
    historyQuery.removeEventListener('change', changeHistoryQuery);
    historyQuery.removeEventListener('click', changeHistoryQuery);
    historyAbort?.abort();
    spatialRegistrationAbort.abort();
    liveState?.destroy();
    viewer?.destroy();
  },
  { once: true }
);
