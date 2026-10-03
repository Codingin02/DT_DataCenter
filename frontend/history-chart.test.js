import assert from 'node:assert/strict';
import test from 'node:test';

import { historyGeometry, historyUrl } from './history-chart.js';

test('history requests are bounded and five-day chart geometry preserves extrema', () => {
  const url = historyUrl({
    assetId: 'test-rack',
    metric: 'temperature',
    sensorId: 'test-sensor',
    range: '5d',
    maxPoints: 1200,
    now: Date.parse('2026-01-06T00:00:00.000Z'),
  });
  assert.match(url, /^\/api\/assets\/test-rack\/history\?/);
  assert.match(url, /metric=temperature/);
  assert.match(url, /max_points=1200/);
  assert.match(url, /sensor_id=test-sensor/);
  assert.throws(() => historyUrl({ assetId: 'x', metric: 'x', range: '30d' }), /Unsupported/);

  const geometry = historyGeometry({
    from: '2026-01-01T00:00:00.000Z',
    to: '2026-01-06T00:00:00.000Z',
    series: [
      {
        sensor_id: 'test-sensor',
        unit: 'degC',
        points: [
          { ts: '2026-01-01T00:00:00.000Z', average: 20, minimum: 16, maximum: 21 },
          { ts: '2026-01-05T23:59:00.000Z', average: 26, minimum: 25, maximum: 34 },
        ],
      },
    ],
  });
  assert.equal(geometry.minimum, 16);
  assert.equal(geometry.maximum, 34);
  assert.match(geometry.series[0].average, /^M/);
  assert.match(geometry.series[0].envelope, /Z$/);

  const referenceGeometry = historyGeometry({
    metric: 'temperature',
    from: '2026-01-01T00:00:00.000Z',
    to: '2026-01-01T01:00:00.000Z',
    series: [{ sensor_id: 'x', unit: 'degC', points: [{ ts: '2026-01-01T00:30:00.000Z', average: 22, minimum: 21, maximum: 23 }] }],
  });
  assert.equal(referenceGeometry.minimum, 18);
  assert.equal(referenceGeometry.maximum, 27);
});
