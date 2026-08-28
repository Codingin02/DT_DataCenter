import assert from 'node:assert/strict';
import test from 'node:test';

import { interpolateGaussianTemperature } from './thermal-interpolation.js';

function assertApproximatelyEqual(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);
}

test('a single source returns its temperature', () => {
  const result = interpolateGaussianTemperature(
    [0, 0, 0],
    [{ position: [0, 0, 0], temperature: 24 }],
    1
  );

  assert.equal(result, 24);
});

test('multiple equally distant sources produce their weighted mean', () => {
  const result = interpolateGaussianTemperature(
    [0, 0, 0],
    [
      { position: [-1, 0, 0], temperature: 20 },
      { position: [1, 0, 0], temperature: 30 },
    ],
    1
  );

  assertApproximatelyEqual(result, 25);
});

test('nearer sources have greater influence', () => {
  const result = interpolateGaussianTemperature(
    [0, 0, 0],
    [
      { position: [0, 0, 0], temperature: 20 },
      { position: [2, 0, 0], temperature: 30 },
    ],
    1
  );

  assertApproximatelyEqual(result, 21.192029220221173);
});

test('sigma is supplied by the caller and changes the weighting', () => {
  const sources = [
    { position: [0, 0, 0], temperature: 20 },
    { position: [2, 0, 0], temperature: 30 },
  ];

  assertApproximatelyEqual(
    interpolateGaussianTemperature([0, 0, 0], sources, 0.5),
    20.003353501304666
  );
  assertApproximatelyEqual(
    interpolateGaussianTemperature([0, 0, 0], sources, 2),
    23.77540668798145
  );
});

test('invalid or non-finite inputs return no result', () => {
  const target = [0, 0, 0];
  const sources = [{ position: [0, 0, 0], temperature: 20 }];
  const invalidInputs = [
    [[Number.NaN, 0, 0], sources, 1],
    [target, [{ position: [Number.POSITIVE_INFINITY, 0, 0], temperature: 20 }], 1],
    [target, [{ position: [0, 0, 0], temperature: Number.NEGATIVE_INFINITY }], 1],
    [target, sources, 0],
    [target, sources, -1],
    [target, sources, Number.NaN],
    [target, sources, Number.POSITIVE_INFINITY],
    [target, null, 1],
  ];

  for (const input of invalidInputs) {
    assert.equal(interpolateGaussianTemperature(...input), null);
  }
});

test('empty input or zero usable weight returns no result', () => {
  assert.equal(interpolateGaussianTemperature([0, 0, 0], [], 1), null);
  assert.equal(
    interpolateGaussianTemperature([0, 0, 0], [{ position: [1000, 0, 0], temperature: 20 }], 1),
    null
  );
});
