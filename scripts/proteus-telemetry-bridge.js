import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

import { connectAsync } from 'mqtt';
import { assertProducerRetired } from './acceptance-data.js';

const SITE_ID = 'dt-datacenter';
const ASSET_ID = 'dt-datacenter-rack';
const FULL_SCALE_24_BIT = 2 ** 23 - 1;
const PREFIX = 'DT_PROTEUS ';
const DEVICES = ['acceptance-mechanical-a', 'acceptance-mechanical-b', 'acceptance-acoustic'];

const SOURCES = {
  temperatureA: [
    'acceptance-mechanical-a',
    'acceptance-sht31-a-temperature',
    'temperature',
    'degC',
  ],
  humidityA: ['acceptance-mechanical-a', 'acceptance-sht31-a-humidity', 'humidity', 'percent_rh'],
  temperatureB: [
    'acceptance-mechanical-b',
    'acceptance-sht31-b-temperature',
    'temperature',
    'degC',
  ],
  humidityB: ['acceptance-mechanical-b', 'acceptance-sht31-b-humidity', 'humidity', 'percent_rh'],
  rms: ['acceptance-acoustic', 'acceptance-inmp441-rms', 'sound_rms_dbfs', 'dBFS'],
  peak: ['acceptance-acoustic', 'acceptance-inmp441-peak', 'sound_peak_dbfs', 'dBFS'],
};

const POWERSHELL_READER = String.raw`
$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new()
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class ProteusWindows {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
}
'@

function Find-ProteusDebugWindow {
  $script:found = [IntPtr]::Zero
  [ProteusWindows]::EnumWindows({
    param($handle, $unused)
    $title = [Text.StringBuilder]::new(256)
    [void][ProteusWindows]::GetWindowText($handle, $title, $title.Capacity)
    if ($title.ToString() -eq 'uPython\Debug - U1') {
      $script:found = $handle
      return $false
    }
    return $true
  }, [IntPtr]::Zero) | Out-Null
  return $script:found
}

$previous = $null
while ($true) {
  $handle = Find-ProteusDebugWindow
  if ($handle -eq [IntPtr]::Zero) {
    $previous = $null
    Start-Sleep -Milliseconds 250
    continue
  }

  $window = [Windows.Automation.AutomationElement]::FromHandle($handle)
  $edit = $window.FindFirst(
    [Windows.Automation.TreeScope]::Descendants,
    [Windows.Automation.PropertyCondition]::new(
      [Windows.Automation.AutomationElement]::ControlTypeProperty,
      [Windows.Automation.ControlType]::Edit
    )
  )
  if ($null -eq $edit) {
    Start-Sleep -Milliseconds 250
    continue
  }

  $pattern = $edit.GetCurrentPattern([Windows.Automation.TextPattern]::Pattern)
  $current = $pattern.DocumentRange.GetText(-1)
  if ($null -eq $previous) {
    $previous = $current
  } elseif ($current.StartsWith($previous)) {
    $delta = $current.Substring($previous.Length)
    $previous = $current
    foreach ($line in $delta -split '\r?\n') {
      if ($line.StartsWith('DT_PROTEUS ')) { Write-Output $line }
    }
  } else {
    $previous = $current
  }
  Start-Sleep -Milliseconds 250
}
`;

function loadEnvironment() {
  try {
    for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function crc(bytes) {
  let value = 0xff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1)
      value = value & 0x80 ? ((value << 1) ^ 0x31) & 0xff : (value << 1) & 0xff;
  }
  return value;
}

function decodeSht31(bytes) {
  if (
    !Array.isArray(bytes) ||
    bytes.length !== 6 ||
    bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)
  )
    throw new Error('Invalid SHT31 byte frame');
  if (crc(bytes.slice(0, 2)) !== bytes[2] || crc(bytes.slice(3, 5)) !== bytes[5])
    throw new Error('SHT31 CRC mismatch');
  const temperatureRaw = (bytes[0] << 8) | bytes[1];
  const humidityRaw = (bytes[3] << 8) | bytes[4];
  return {
    humidity: (100 * humidityRaw) / 65535,
    humidityRaw,
    temperature: -45 + (175 * temperatureRaw) / 65535,
    temperatureRaw,
  };
}

function decodePcm(samples) {
  if (
    !Array.isArray(samples) ||
    samples.length === 0 ||
    samples.some(
      (sample) => !Number.isInteger(sample) || sample < -(2 ** 23) || sample > FULL_SCALE_24_BIT
    )
  )
    throw new Error('Invalid signed 24-bit PCM frame');
  const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample ** 2, 0) / samples.length);
  const peak = Math.max(...samples.map(Math.abs));
  return {
    peak: peak === 0 ? -Infinity : 20 * Math.log10(peak / FULL_SCALE_24_BIT),
    rms: rms === 0 ? -Infinity : 20 * Math.log10(rms / FULL_SCALE_24_BIT),
  };
}

function decodeFrame(line) {
  if (!line.startsWith(PREFIX)) throw new Error('Unexpected Proteus output prefix');
  const frame = JSON.parse(line.slice(PREFIX.length));
  if (frame.kind !== 'telemetry' || !Number.isSafeInteger(frame.seq) || frame.seq < 0)
    throw new Error('Invalid Proteus telemetry frame');
  return {
    frame,
    pcm: decodePcm(frame.pcm),
    sensorA: decodeSht31(frame.sht31_a),
    sensorB: decodeSht31(frame.sht31_b),
  };
}

function measurement(source, value, rawValue) {
  const [deviceId, sensorId, metric, unit] = source;
  return { deviceId, metric, rawValue, sensorId, unit, value };
}

function measurements(decoded) {
  return [
    measurement(SOURCES.temperatureA, decoded.sensorA.temperature, decoded.sensorA.temperatureRaw),
    measurement(SOURCES.humidityA, decoded.sensorA.humidity, decoded.sensorA.humidityRaw),
    measurement(SOURCES.temperatureB, decoded.sensorB.temperature, decoded.sensorB.temperatureRaw),
    measurement(SOURCES.humidityB, decoded.sensorB.humidity, decoded.sensorB.humidityRaw),
    measurement(SOURCES.rms, decoded.pcm.rms),
    measurement(SOURCES.peak, decoded.pcm.peak),
  ];
}

function selfTest() {
  const decoded = decodeFrame(
    `${PREFIX}{"kind":"telemetry","seq":0,"state":0,"sht31_a":[98,3,94,128,0,162],"sht31_b":[96,140,211,122,225,164],"pcm":[5913726,-5913726,2956863,-2956863,0,1478431,-1478431,0]}`
  );
  if (Math.abs(decoded.sensorA.temperature - 22.001221) > 0.000001)
    throw new Error('Temperature conversion failed');
  if (Math.abs(decoded.sensorB.humidity - 48.000305) > 0.000001)
    throw new Error('Humidity conversion failed');
  if (measurements(decoded).length !== 6) throw new Error('Measurement mapping failed');
  console.log('self-test: PASS');
}

async function publishStatus(client, bootId, status) {
  await Promise.all(
    DEVICES.map((deviceId) =>
      client.publishAsync(
        `dt/${SITE_ID}/device/${deviceId}/status`,
        JSON.stringify({
          schema_version: '1.0',
          site_id: SITE_ID,
          device_id: deviceId,
          boot_id: bootId,
          status,
        }),
        { qos: 1, retain: true }
      )
    )
  );
}

async function main() {
  assertProducerRetired('live');
  loadEnvironment();
  const broker = process.env.MQTT_URL ?? 'mqtt://127.0.0.1:1883';
  const bootId = `proteus-${randomUUID()}`;
  const client = await connectAsync(broker, {
    clean: true,
    clientId: `dt-proteus-bridge-${process.pid}`,
    password: process.env.MQTT_PASSWORD,
    protocolVersion: 5,
    username: process.env.MQTT_USERNAME,
  });
  const encodedReader = Buffer.from(POWERSHELL_READER, 'utf16le').toString('base64');
  const reader = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodedReader],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  const lines = createInterface({ input: reader.stdout });
  let published = 0;
  let queue = Promise.resolve();
  let stopping = false;

  await publishStatus(client, bootId, 'online');
  console.log(
    JSON.stringify({ event: 'ready', boot_id: bootId, source: 'Proteus uPython debug console' })
  );

  lines.on('line', (line) => {
    if (!line.startsWith(PREFIX)) return;
    queue = queue
      .then(async () => {
        const decoded = decodeFrame(line);
        const timestamp = new Date().toISOString();
        const outgoing = measurements(decoded);
        for (const item of outgoing) {
          const payload = {
            schema_version: '1.0',
            site_id: SITE_ID,
            device_id: item.deviceId,
            boot_id: bootId,
            seq: decoded.frame.seq,
            sensor_id: item.sensorId,
            asset_id: ASSET_ID,
            metric: item.metric,
            value: item.value,
            unit: item.unit,
            ts: timestamp,
            quality: 'good',
          };
          if (item.rawValue !== undefined) payload.raw_value = item.rawValue;
          const topic = `dt/${SITE_ID}/telemetry/${item.deviceId}/${item.sensorId}/${item.metric}`;
          await client.publishAsync(topic, JSON.stringify(payload), { qos: 1 });
          published += 1;
          if (published <= 6 || decoded.frame.state !== 0)
            console.log(
              JSON.stringify({
                event: 'published',
                proteus_seq: decoded.frame.seq,
                state: decoded.frame.state,
                topic,
                payload,
              })
            );
        }
      })
      .catch((error) =>
        console.error(JSON.stringify({ event: 'frame_rejected', message: error.message }))
      );
  });
  reader.stderr.on('data', (chunk) => process.stderr.write(chunk));
  reader.on('error', (error) =>
    console.error(JSON.stringify({ event: 'reader_error', message: error.message }))
  );
  reader.on('exit', (code) => {
    if (!stopping) console.error(JSON.stringify({ event: 'reader_exit', code }));
  });

  const stop = async () => {
    if (stopping) return;
    stopping = true;
    lines.close();
    reader.kill();
    await queue;
    await publishStatus(client, bootId, 'offline');
    await client.endAsync();
    console.log(JSON.stringify({ event: 'stopped', published }));
  };
  process.once('SIGINT', () => stop().then(() => process.exit(0)));
  process.once('SIGTERM', () => stop().then(() => process.exit(0)));
}

if (process.argv.includes('--self-test')) selfTest();
else
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
