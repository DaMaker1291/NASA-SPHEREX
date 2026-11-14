export type DetectorArray = {
  id: number
  short: string
  label: string
  low: number
  high: number
  r: number
  tint: string
}

export const ARRAYS: DetectorArray[] = [
  { id: 1, short: 'B1', label: 'Band 1', low: 0.744, high: 1.116, r: 39, tint: '#d8ccff' },
  { id: 2, short: 'B2', label: 'Band 2', low: 1.099, high: 1.651, r: 41, tint: '#f4efff' },
  { id: 3, short: 'B3', label: 'Band 3', low: 1.636, high: 2.421, r: 41, tint: '#a9f0ff' },
  { id: 4, short: 'B4', label: 'Band 4', low: 2.423, high: 3.822, r: 35, tint: '#74e3ff' },
  { id: 5, short: 'B5', label: 'Band 5', low: 3.809, high: 4.42, r: 112, tint: '#ffb3e6' },
  { id: 6, short: 'B6', label: 'Band 6', low: 4.412, high: 5.002, r: 128, tint: '#ff77cf' },
]

export const CHANNELS_PER_ARRAY = 17
export const BAND_COUNT = ARRAYS.length * CHANNELS_PER_ARRAY

export const INSTRUMENT = {
  aperture: '20 cm',
  fov: '2 × (3.5° × 11.3°)',
  pixel: 6.15,
  exposure: 113.58,
  bands: BAND_COUNT,
  arrays: ARRAYS.length,
  channels: CHANNELS_PER_ARRAY,
  range: '0.744–5.002 µm',
} as const

export type Band = {
  id: number
  array: number
  channel: number
  lambda: number
  width: number
}

export const BANDS: Band[] = ARRAYS.flatMap((array) =>
  Array.from({ length: CHANNELS_PER_ARRAY }, (_, i) => {
    const f = (i + 0.5) / CHANNELS_PER_ARRAY
    const lambda = array.low * (array.high / array.low) ** f
    return {
      id: (array.id - 1) * CHANNELS_PER_ARRAY + i + 1,
      array: array.id,
      channel: i + 1,
      lambda: Number(lambda.toFixed(4)),
      width: Number((lambda / array.r).toFixed(4)),
    }
  }),
)

export const BAND_BY_ID = new Map(BANDS.map((band) => [band.id, band]))

const ARRAY_BANDS = new Map(ARRAYS.map((array) => [array.id, BANDS.filter((band) => band.array === array.id)]))
export const bandsForArray = (arrayId: number) => ARRAY_BANDS.get(arrayId) ?? []
export const allBandIds = () => BANDS.map((band) => band.id)

const STOPS: Array<[number, string]> = [
  [0.744, '#cdbaff'],
  [1.1, '#ffffff'],
  [1.65, '#bff6ff'],
  [2.42, '#74e3ff'],
  [3.0, '#b9a2ff'],
  [3.82, '#ff8ad8'],
  [4.42, '#ff5ec4'],
  [5.002, '#a326ff'],
]

const rgb = (hex: string) => {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

export function bandColor(lambda: number): string {
  const first = STOPS[0]
  const last = STOPS[STOPS.length - 1]
  if (lambda <= first[0]) return first[1]
  if (lambda >= last[0]) return last[1]

  for (let i = 1; i < STOPS.length; i++) {
    const [high, highColor] = STOPS[i]
    if (lambda > high) continue
    const [low, lowColor] = STOPS[i - 1]
    const t = (lambda - low) / (high - low)
    const a = rgb(lowColor)
    const b = rgb(highColor)
    return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)} ${Math.round(a[1] + (b[1] - a[1]) * t)} ${Math.round(a[2] + (b[2] - a[2]) * t)})`
  }

  return last[1]
}

export type ReleaseStatus = 'current' | 'archived' | 'retired'

export type Release = {
  id: string
  name: string
  status: ReleaseStatus
  start: string
  cadenceDays: number
  epochs: number
  product: string
  notes: string
}

export const FALLBACK_RELEASES: Release[] = [
  {
    id: 'qr3',
    name: 'Quick Release 3',
    status: 'current',
    start: '2026-09-04',
    cadenceDays: 2,
    epochs: 10,
    product: 'L2 spectral images · 2040×2040 · 6 HDUs',
    notes: 'Weekly arrivals. Deeper calibrations and improved ice-band response.',
  },
  {
    id: 'qr2',
    name: 'Quick Release 2',
    status: 'archived',
    start: '2025-10-16',
    cadenceDays: 7,
    epochs: 8,
    product: 'L2 spectral images · 2040×2040 · 6 HDUs',
    notes: 'First well-calibrated release; headers corrected April 2026.',
  },
  {
    id: 'qr1',
    name: 'Quick Release 1',
    status: 'retired',
    start: '2025-07-02',
    cadenceDays: 7,
    epochs: 6,
    product: 'L2 spectral images · early calibration',
    notes: 'Retired from IRSA in February 2026. Kept here to show the archive growing.',
  },
]

export type Field = { ra: number; dec: number; fov: number }
export type Point = { x: number; y: number }

export type Star = {
  x: number
  y: number
  flux: number
  temp: number
  pmx: number
  pmy: number
}

export type Galaxy = { x: number; y: number; flux: number; size: number; pa: number; ratio: number }

export type Mover = {
  id: string
  name: string
  kind: 'comet' | 'asteroid'
  x0: number
  y0: number
  vx: number
  vy: number
  flux: number
  temp: number
  visible: boolean[]
  tail: boolean
}

export type Flag = 'ghost' | 'stray' | 'cosmic' | 'saturated'

export const CONTAMINATION: Record<Flag, { label: string; short: string; detail: string; tone: 'warn' | 'danger' | 'info' }> = {
  ghost: { label: 'Optical ghost', short: 'GHOST', detail: 'Reflection of a bright source elsewhere in the field.', tone: 'warn' },
  stray: { label: 'Stray light', short: 'STRAY', detail: 'Scattered moonlight or Earthshine lifts one side of the array.', tone: 'danger' },
  cosmic: { label: 'Cosmic-ray hit', short: 'CR', detail: 'Charged-particle hit; masked by the level-2 pipeline.', tone: 'info' },
  saturated: { label: 'Saturation', short: 'SAT', detail: 'A bright source clips the detector; photometry is unreliable.', tone: 'warn' },
}

export type Epoch = {
  index: number
  iso: string
  label: string
  visit: string
  flags: Flag[]
  moon: number
  quality: number
  exposure: number
}

export type Scene = {
  seed: number
  stars: Star[]
  galaxies: Galaxy[]
  movers: Mover[]
  epochs: Epoch[]
}

export type Level = 1 | 2 | 3

export const TOLERANCE: Record<Level, number> = { 1: 0.055, 2: 0.042, 3: 0.032 }
export const LEVEL_LABEL: Record<Level, string> = { 1: 'Bright mover', 2: 'Faint mover', 3: 'Needle in the noise' }

export function hash(input: string): number {
  let value = 2166136261
  for (let i = 0; i < input.length; i++) {
    value ^= input.charCodeAt(i)
    value = Math.imul(value, 16777619)
  }
  return value >>> 0
}

export function mulberry32(seed: number) {
  let value = seed >>> 0
  return () => {
    value = (value + 0x6d2b79f5) >>> 0
    let t = value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))
const DAY = 86_400_000
const DESIGNATIONS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'

function epochDate(start: string, days: number) {
  const date = new Date(Date.parse(`${start}T00:00:00Z`) + days * DAY)
  return {
    iso: date.toISOString().slice(0, 10),
    label: date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }),
  }
}

function designation(random: () => number, kind: Mover['kind']) {
  const letter = DESIGNATIONS[Math.floor(random() * DESIGNATIONS.length)]
  const n = 1 + Math.floor(random() * 89)
  return kind === 'comet' ? `C/2026 ${letter}${n}` : `2026 ${letter}${letter}${n}`
}

export function buildScene(field: Field, release: Release, level: Level = 1): Scene {
  const key = `${field.ra.toFixed(3)}|${field.dec.toFixed(3)}|${field.fov.toFixed(3)}|${release.id}`
  const seed = hash(key)
  const starRandom = mulberry32(hash(`${seed}|stars`))
  const galaxyRandom = mulberry32(hash(`${seed}|galaxies`))
  const epochRandom = mulberry32(hash(`${seed}|epochs`))
  const moverRandom = mulberry32(hash(`${seed}|movers|${level}`))

  const count = clamp(Math.round(340 * (field.fov / 0.6) ** 1.85), 240, 1500)
  const stars: Star[] = Array.from({ length: count }, () => ({
    x: (starRandom() - 0.5) * 1.04,
    y: (starRandom() - 0.5) * 1.04,
    flux: 0.06 + starRandom() ** 2.7 * 1.7,
    temp: starRandom() ** 0.75,
    pmx: (starRandom() - 0.5) * 0.00045,
    pmy: (starRandom() - 0.5) * 0.00045,
  }))

  for (let i = 0; i < 7; i++) {
    stars.push({
      x: (starRandom() - 0.5) * 0.8,
      y: (starRandom() - 0.5) * 0.8,
      flux: 1.5 + starRandom() * 2.2,
      temp: starRandom(),
      pmx: (starRandom() - 0.5) * 0.0003,
      pmy: (starRandom() - 0.5) * 0.0003,
    })
  }

  const galaxies: Galaxy[] = Array.from({ length: 2 + Math.floor(galaxyRandom() * 4) }, () => ({
    x: (galaxyRandom() - 0.5) * 0.9,
    y: (galaxyRandom() - 0.5) * 0.9,
    flux: 0.18 + galaxyRandom() * 0.55,
    size: 0.022 + galaxyRandom() * 0.05,
    pa: galaxyRandom() * Math.PI,
    ratio: 0.35 + galaxyRandom() * 0.6,
  }))

  const epochs: Epoch[] = Array.from({ length: release.epochs }, (_, i) => {
    const date = epochDate(release.start, i * release.cadenceDays)
    const roll = epochRandom()
    const flags: Flag[] = []
    if (roll < 0.12) flags.push('ghost')
    if (roll > 0.86) flags.push('stray')
    if (roll > 0.42 && roll < 0.47) flags.push('cosmic')
    if (roll > 0.71 && roll < 0.735) flags.push('saturated')
    return {
      index: i,
      iso: date.iso,
      label: date.label,
      visit: `${release.id.toUpperCase()} · ${String(i + 1).padStart(2, '0')}`,
      flags,
      moon: Math.round(35 + epochRandom() * 120),
      quality: flags.includes('stray') ? 0.5 : flags.length ? 0.78 : 1,
      exposure: INSTRUMENT.exposure,
    }
  })

  const movers: Mover[] = Array.from({ length: level === 3 ? 2 : 1 }, (_, k) => {
    const kind: Mover['kind'] = moverRandom() < 0.45 ? 'comet' : 'asteroid'
    const speed = 0.028 + moverRandom() * 0.032
    const angle = moverRandom() * Math.PI * 2
    const vx = Math.cos(angle) * speed
    const vy = Math.sin(angle) * speed
    const spanX = vx * (release.epochs - 1)
    const spanY = vy * (release.epochs - 1)
    const x0 = -spanX / 2 + (moverRandom() - 0.5) * 0.34
    const y0 = -spanY / 2 + (moverRandom() - 0.5) * 0.34
    const visible = epochs.map(() => {
      if (level === 1) return true
      return moverRandom() > (level === 2 ? 0.22 : 0.4)
    })
    visible[0] = true
    visible[Math.floor(visible.length / 2)] = true
    visible[visible.length - 1] = true
    const base = level === 1 ? 0.9 + moverRandom() * 0.35 : level === 2 ? 0.5 + moverRandom() * 0.14 : 0.3 + moverRandom() * 0.1
    return {
      id: `mover-${k + 1}`,
      name: designation(moverRandom, kind),
      kind,
      x0,
      y0,
      vx,
      vy,
      flux: k === 0 ? base : base * 0.8,
      temp: kind === 'comet' ? 0.75 : 0.55,
      visible,
      tail: kind === 'comet',
    }
  })

  return { seed, stars, galaxies, movers, epochs }
}

export function moverAt(mover: Mover, epoch: number): Point | null {
  if (!mover.visible[epoch]) return null
  return { x: mover.x0 + mover.vx * epoch, y: mover.y0 + mover.vy * epoch }
}

export function moverTravel(mover: Mover, epochs: number, fov: number): string {
  const arcmin = Math.hypot(mover.vx, mover.vy) * (epochs - 1) * fov * 60
  return `${arcmin.toFixed(1)}′`
}

export function formatRA(ra: number): string {
  const hours = ((((ra % 360) + 360) % 360) / 15).toFixed(2).padStart(5, '0')
  return `${hours}h`
}

export function formatDec(dec: number): string {
  return `${dec < 0 ? '−' : '+'}${Math.abs(dec).toFixed(2)}°`
}

export function coordinateAt(field: Field, point: Point) {
  const cos = Math.max(0.2, Math.cos((field.dec * Math.PI) / 180))
  const ra = (((field.ra - (point.x * field.fov) / cos) % 360) + 360) % 360
  return { ra, dec: clamp(field.dec - point.y * field.fov, -89.9, 89.9) }
}

export function cutoutMB(fov: number, bandCount: number): number {
  const side = (fov * 3600) / INSTRUMENT.pixel
  return (side * side * 4 * Math.max(1, bandCount)) / 1e6
}

export function describeBands(ids: number[]): string {
  const bands = ids.map((id) => BAND_BY_ID.get(id)).filter((band): band is Band => Boolean(band))
  if (!bands.length) return 'No bands selected'
  if (bands.length === 1) {
    const band = bands[0]
    return `${ARRAYS[band.array - 1].short} · ch ${String(band.channel).padStart(2, '0')} · ${band.lambda.toFixed(2)} µm`
  }
  if (bands.length === CHANNELS_PER_ARRAY) {
    const array = ARRAYS[bands[0].array - 1]
    if (bands.every((band) => band.array === array.id)) return `${array.short} stack · 17 channels`
  }
  const low = Math.min(...bands.map((band) => band.lambda))
  const high = Math.max(...bands.map((band) => band.lambda))
  return `${bands.length} bands · ${low.toFixed(2)}–${high.toFixed(2)} µm`
}

export function activeArrays(ids: number[]): DetectorArray[] {
  const active = new Set(ids.map((id) => BAND_BY_ID.get(id)?.array).filter((id): id is number => id !== undefined))
  return ARRAYS.filter((array) => active.has(array.id))
}

const gauss = (x: number, mean: number, sigma: number) => Math.exp(-((x - mean) ** 2) / (2 * sigma * sigma))

export type SpectrumPoint = { band: Band; flux: number; err: number }
export type SpectrumFeature = { label: string; lambda: string; detected: boolean; note: string }
export type Spectrum = {
  points: SpectrumPoint[]
  features: SpectrumFeature[]
  summary: string
  peak: number
}

export function apertureSpectrum(scene: Scene, x: number, y: number, bandCount: number): Spectrum {
  let nearStar = 0
  let cool = 0
  let nearGalaxy = 0

  for (const star of scene.stars) {
    const weight = Math.exp(-((star.x - x) ** 2 + (star.y - y) ** 2) / 0.0009) * star.flux
    if (weight > nearStar) {
      nearStar = weight
      cool = star.temp
    }
  }

  for (const galaxy of scene.galaxies) {
    const weight = Math.exp(-((galaxy.x - x) ** 2 + (galaxy.y - y) ** 2) / 0.006) * galaxy.flux
    if (weight > nearGalaxy) nearGalaxy = weight
  }

  const galaxy = Math.min(1, nearGalaxy * 2.2)
  const random = mulberry32(hash(`${scene.seed}|spec|${x.toFixed(3)}|${y.toFixed(3)}`))

  const points = BANDS.map((band) => {
    const lambda = band.lambda
    const scale = (lambda / 1.6) ** -0.85
    let flux = 0.1 + nearGalaxy * 0.95 * scale + nearStar * 2.1 * (lambda / 1.6) ** (-1.2 + 2.1 * cool)
    flux *= 1 - 0.45 * cool * gauss(lambda, 3.05, 0.16)
    flux *= 1 + 0.8 * galaxy * gauss(lambda, 3.3, 0.09)
    flux *= 1 - 0.32 * galaxy * gauss(lambda, 4.26, 0.08)
    const noise = ((0.015 + flux * 0.05) / Math.sqrt(Math.max(1, bandCount))) * (0.6 + random())
    return { band, flux: Math.max(0.001, flux + noise), err: Math.abs(noise) }
  })

  const peak = Math.max(...points.map((point) => point.flux))
  const normalized = points.map((point) => ({ ...point, flux: point.flux / peak, err: point.err / peak }))
  const ice = cool > 0.52 && nearStar > 0.02
  const pah = galaxy > 0.25
  const co2 = galaxy > 0.45

  return {
    points: normalized,
    peak,
    summary: pah
      ? 'PAH-rich aperture — likely a star-forming galaxy'
      : nearStar > 0.35
        ? 'Stellar continuum, reddened by dust'
        : 'Background-limited aperture',
    features: [
      { label: 'H₂O ice', lambda: '3.05 µm', detected: ice, note: 'Broad absorption, cold ices' },
      { label: 'PAH 3.3', lambda: '3.3 µm', detected: pah, note: 'Emission from hot dust' },
      { label: 'CO₂ ice', lambda: '4.26 µm', detected: co2, note: 'Absorption in icy grains' },
    ],
  }
}

export type Preset = { id: string; name: string; ra: number; dec: number; fov: number; blurb: string }

export const PRESETS: Preset[] = [
  {
    id: 'ecliptic',
    name: 'Ecliptic drift',
    ra: 150,
    dec: 19.5,
    fov: 0.6,
    blurb: 'A busy ecliptic field — the natural hunting ground for NEOs and comets.',
  },
  {
    id: 'pleiades',
    name: 'Pleiades',
    ra: 56.75,
    dec: 24.12,
    fov: 0.9,
    blurb: 'Hot young stars wrapped in the infrared nebulosity SPHEREx was built for.',
  },
  {
    id: 'orion',
    name: 'Orion core',
    ra: 83.82,
    dec: -5.39,
    fov: 0.7,
    blurb: 'Star formation, ices and PAH emission inside one 0.7° cutout.',
  },
  {
    id: 'coma',
    name: 'Coma cluster',
    ra: 194.95,
    dec: 27.98,
    fov: 1.2,
    blurb: 'A galaxy cluster: stack arrays to pull faint members out of the noise.',
  },
  {
    id: 'pole',
    name: 'South galactic pole',
    ra: 12.86,
    dec: -27.13,
    fov: 1.8,
    blurb: 'A clean, low-extinction window for deep coadds and slow movers.',
  },
]
