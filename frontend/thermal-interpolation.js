function isFiniteVector3(position) {
  return (
    Array.isArray(position) &&
    position.length === 3 &&
    Number.isFinite(position[0]) &&
    Number.isFinite(position[1]) &&
    Number.isFinite(position[2])
  );
}

/**
 * @param {[number, number, number]} target
 * @param {{ position: [number, number, number], temperature: number }[]} sources
 * @param {number} sigma
 * @returns {number | null}
 */
export function interpolateGaussianTemperature(target, sources, sigma) {
  if (
    !isFiniteVector3(target) ||
    !Array.isArray(sources) ||
    !Number.isFinite(sigma) ||
    sigma <= 0
  ) {
    return null;
  }

  let weightedTemperature = 0;
  let totalWeight = 0;

  for (const source of sources) {
    if (!source || !isFiniteVector3(source.position) || !Number.isFinite(source.temperature)) {
      return null;
    }

    const distance = Math.hypot(
      target[0] - source.position[0],
      target[1] - source.position[1],
      target[2] - source.position[2]
    );
    const normalizedDistance = distance / sigma;
    const weight = Math.exp(-0.5 * normalizedDistance * normalizedDistance);

    if (weight === 0) {
      continue;
    }

    weightedTemperature += weight * source.temperature;
    totalWeight += weight;
  }

  if (totalWeight === 0 || !Number.isFinite(weightedTemperature)) {
    return null;
  }

  const temperature = weightedTemperature / totalWeight;
  return Number.isFinite(temperature) ? temperature : null;
}
