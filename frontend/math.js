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

function clip(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

function wrap(value, period) {
  return value < 0 ? period - (-value % period) : value % period;
}

function bitCombine(x, y) {
  return (
    (x & 1) | ((x & 2) | (y & 1)) << 1 | ((x & 4) | (y & 2)) << 2 |
    ((x & 8) | (y & 4)) << 3 | ((x & 16) | (y & 8)) << 4 |
    ((x & 32) | (y & 16)) << 5 | ((x & 64) | (y & 32)) << 6 |
    ((x & 128) | (y & 64)) << 7 | ((x & 256) | (y & 128)) << 8 |
    ((x & 512) | (y & 256)) << 9 | ((x & 1024) | (y & 512)) << 10 |
    ((x & 2048) | (y & 1024)) << 11 | ((x & 4096) | (y & 2048)) << 12 |
    ((x & 8192) | (y & 4096)) << 13 | ((x & 16384) | (y & 8192)) << 14 |
    ((x & 32768) | (y & 16384)) << 15 | ((y & 32768) << 16)
  )
}

// HEALPix NESTED pixel containing a J2000 position. This is used only to
// select a pre-rendered SPHEREx HiPS context tile; it never drives visit data.
export function healpixNest(ra, dec, order = 5) {
  if (!Number.isFinite(ra) || !Number.isFinite(dec) || !Number.isInteger(order) || order < 0 || order > 15) return null
  if (dec < -90 || dec > 90) return null
  const nside = 2 ** order
  const radians = Math.PI / 180
  const z = Math.sin(dec * radians)
  const a = normalizeRa(ra) * radians
  let t
  let u
  if (Math.abs(z) <= 2 / 3) {
    t = a
    u = 3 * Math.PI / 8 * z
  } else {
    const sigma = Math.sign(z) * (2 - Math.sqrt(3 * (1 - Math.abs(z))))
    const period = Math.PI / 2
    const partial = a % period
    t = a - (Math.abs(sigma) - 1) * (partial - Math.PI / 4)
    u = Math.PI / 4 * sigma
  }
  const quarter = Math.PI / 4
  const tt = wrap(t / quarter, 8) - 4
  const uu = u / quarter + 5
  const pp = clip((uu + tt) / 2, 0, 5)
  const PP = Math.floor(pp)
  const qq = clip((uu - tt) / 2, 3 - PP, 6 - PP)
  const QQ = Math.floor(qq)
  const V = 5 - (PP + QQ)
  if (V < 0) return null
  const H = PP - QQ + 4
  const face = 4 * V + ((H >> 1) % 4)
  const x = clip(Math.floor(nside * (pp % 1)), 0, nside - 1)
  const y = clip(Math.floor(nside * (qq % 1)), 0, nside - 1)
  return face * nside * nside + bitCombine(x, y)
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
