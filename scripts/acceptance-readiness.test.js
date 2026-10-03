import assert from 'node:assert/strict';
import test from 'node:test';

import {
  acceptanceReadinessExpectations,
  summarizeAcceptanceReadiness,
} from './acceptance-data.js';

function completeState() {
  const expected = acceptanceReadinessExpectations();
  return {
    historyReady: true,
    assetReady: true,
    devices: expected.devices.map((device_id) => ({
      device_id,
      connectivity_status: 'online',
    })),
    currentState: expected.currentIdentities.map((identity) => {
      const [sensor_id, metric] = identity.split('\0');
      return { sensor_id, metric, boot_id: 'acceptance-live' };
    }),
    anchors: expected.anchors.map((sensor_id) => ({ sensor_id })),
  };
}

test('acceptance readiness requires the complete live canonical state', () => {
  const ready = summarizeAcceptanceReadiness(completeState());
  assert.equal(ready.ready, true);
  assert.equal(ready.currentMeasurements, ready.expectedMeasurements);
  assert.equal(ready.anchors, ready.expectedAnchors);

  const historicalOnly = completeState();
  historicalOnly.currentState[0].boot_id = 'acceptance-history';
  assert.equal(summarizeAcceptanceReadiness(historicalOnly).ready, false);

  const offline = completeState();
  offline.devices[0].connectivity_status = 'offline';
  assert.equal(summarizeAcceptanceReadiness(offline).ready, false);

  const incomplete = completeState();
  incomplete.historyReady = false;
  incomplete.assetReady = false;
  incomplete.anchors.pop();
  const result = summarizeAcceptanceReadiness(incomplete);
  assert.equal(result.ready, false);
  assert.equal(result.historyReady, false);
  assert.equal(result.assetReady, false);
  assert.equal(result.anchors, result.expectedAnchors - 1);
});
