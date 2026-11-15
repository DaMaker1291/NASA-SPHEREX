// Pure sky and image math shared by the browser viewer and the Node tests.
// Keep this module free of DOM access so the same code can be exercised
// directly by the test runner.

export function angularSeparation(ra1, dec1, ra2, dec2) {
  if (![ra1, dec1, ra2, dec2].every(Number.isFinite)) return null;
  const rad = Math.PI / 180;
  const a = Math.sin((dec2 - dec1) * rad / 2) ** 2 +
    Math.cos(dec1 * rad) * Math.cos(dec2 * rad) * Math.sin((ra2 - ra1) * rad / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(a))) / rad;
}

export function normalizeRa(ra) {
  return ((ra % 360) + 360) % 360;
}

export function unwrapRa(ra, reference) {
  let value = ra;
  while (value - reference > 180) value -= 360;
  while (value - reference < -180) value += 360;
  return value;
}

export function luma(red, green, blue) {
  return red * 0.299 + green * 0.587 + blue * 0.114;
}

// The change finder works on absolute residuals. Its median and MAD are
// sampled at floor(n / 2), and the floor keeps a quiet field from producing
// noise candidates while still adapting to a genuinely noisy visit.
export function robustChangeThreshold(values) {
  const samples = Array.from(values).filter(Number.isFinite).sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)] || 0;
  const deviations = samples.map(value => Math.abs(value - median)).sort((a, b) => a - b);
  const mad = deviations[Math.floor(deviations.length / 2)] || 0;
  return { median, mad, threshold: Math.max(7, median + 6 * Math.max(mad, 0.3)) };
}
