import {
  flagBitCounts,
  imageStats,
  numberValue,
  parseFits,
  readImage,
  skyAt,
  textValue,
  waveAt,
  type FitsFile,
  type FitsHdu,
  type FitsStats,
} from './fits'

export type IrsaDetector = {
  detector: string
  band: string
  uri: string
  file: string
}

export type IrsaObservation = {
  id: string
  mjd: number
  iso: string
  obsid: string
  release: string
  detectors: IrsaDetector[]
}

export type IrsaFind = {
  source: { label: string; url: string; query: string }
  field: { ra: number; dec: number; fov: number }
  observations: IrsaObservation[]
  cachedAt?: string
}

export type RealVisit = {
  id: string
  obsid: string
  iso: string
  endIso: string
  mjd: number
  observations: IrsaObservation[]
  detectors: IrsaDetector[]
}

export type RealCutout = {
  uri: string
  fileName: string
  buffer: ArrayBuffer
  fits: FitsFile
  image: FitsHdu
  variance: FitsHdu | null
  flags: FitsHdu | null
  zodi: FitsHdu | null
  pixels: Float32Array
  variancePixels: Float32Array | null
  flagPixels: Float32Array | null
  zodiPixels: Float32Array | null
  stats: FitsStats | null
  flagCounts: number[]
  cutX: number
  cutY: number
  scale: number
  observedAt: string
  obsid: string
  cached: boolean
}

export type RealSpectrumPoint = {
  lambda: number
  bandwidth: number
  flux: number
  variance: number
  flag: number
}

export type RealSpectrumSegment = {
  detector: string
  band: string
  uri: string
  points: RealSpectrumPoint[]
  minLambda: number
  maxLambda: number
  flagged: number
}

export type RealSpectrum = {
  source: { label: string; url: string; method: string }
  ra: number
  dec: number
  segments: RealSpectrumSegment[]
  errors: string[]
}

export type CatalogSource = {
  ra: number
  dec: number
  mag: number | null
  pmra?: number | null
  pmdec?: number | null
}

export type CatalogResult = {
  survey: 'gaia' | 'wise'
  source: { label: string; url: string }
  count: number
  sources: CatalogSource[]
}

export const DEFAULT_FIELD = { ra: 150, dec: 19.5, fov: 0.3 }
export const REAL_PRESETS = [
  { ra: 150, dec: 19.5, fov: 0.3, label: 'RA 150 · Dec +19.5', note: 'SPHEREx DR1 coverage · 2025 April–June' },
  { ra: 152.573, dec: 50.163, fov: 0.3, label: 'RA 152.6 · Dec +50.2', note: 'SPHEREx DR1 coverage · northern field' },
  { ra: 127.694, dec: -39.178, fov: 0.3, label: 'RA 127.7 · Dec −39.2', note: 'SPHEREx DR1 coverage · southern field' },
] as const

const cutoff = (value: number) => Math.min(89.9, Math.max(-89.9, value))
const wrap = (value: number) => ((((value + 180) % 360) + 360) % 360) - 180

function hduByName(fits: FitsFile, name: string) {
  return fits.hdus.find((hdu) => hdu.name.toUpperCase() === name) ?? null
}

function hduOffset(hdu: FitsHdu) {
  const cutX = numberValue(hdu.header, 'CUTX0', Number.NaN)
  const cutY = numberValue(hdu.header, 'CUTY0', Number.NaN)
  if (Number.isFinite(cutX) && Number.isFinite(cutY)) return { x: cutX, y: cutY }
  return { x: -numberValue(hdu.header, 'CRPIX1A', -1), y: -numberValue(hdu.header, 'CRPIX2A', -1) }
}

export function groupVisits(observations: IrsaObservation[]): RealVisit[] {
  const groups = new Map<string, IrsaObservation[]>()
  for (const observation of observations) {
    const key = observation.obsid.replace(/_\d+$/, '')
    const list = groups.get(key) ?? []
    list.push(observation)
    groups.set(key, list)
  }

  return [...groups.entries()]
    .map(([key, rows]) => {
      const ordered = [...rows].sort((a, b) => a.mjd - b.mjd)
      const detectors = new Map<string, IrsaDetector>()
      for (const row of ordered) {
        for (const detector of row.detectors) {
          if (!detectors.has(detector.detector)) detectors.set(detector.detector, detector)
        }
      }
      return {
        id: key,
        obsid: key,
        iso: ordered[0]?.iso ?? '',
        endIso: ordered[ordered.length - 1]?.iso ?? '',
        mjd: ordered[0]?.mjd ?? 0,
        observations: ordered,
        detectors: [...detectors.values()].sort((a, b) => a.detector.localeCompare(b.detector)),
      }
    })
    .sort((a, b) => a.mjd - b.mjd)
}

export async function loadStaticIndex() {
  const response = await fetch('/data/spherex/dr1-150.json')
  if (!response.ok) throw new Error('The cached IRSA index is unavailable.')
  return (await response.json()) as IrsaFind
}

export async function findRealField(ra: number, dec: number, fov: number) {
  const params = new URLSearchParams({ ra: String(ra), dec: String(dec), fov: String(fov) })
  const response = await fetch(`/api/spherex/find?${params.toString()}`)
  const data = (await response.json()) as IrsaFind | { error: string }
  if (!response.ok || 'error' in data) throw new Error('error' in data ? data.error : 'IRSA search failed.')
  return data
}

const cutoutCache = new Map<string, RealCutout>()

export async function loadRealCutout(uri: string, ra: number, dec: number, fov: number, live = false) {
  const params = new URLSearchParams({ uri, ra: String(ra), dec: String(dec), fov: String(fov) })
  const key = params.toString()
  const cached = cutoutCache.get(key)
  if (cached) return cached

  const canCache =
    uri.includes('2026W19_2A_0047_1D2') &&
    Math.abs(ra - 150) < 0.01 &&
    Math.abs(dec - 19.5) < 0.01 &&
    Math.abs(fov - 0.3) < 0.01

  if (canCache && !live) {
    const response = await fetch('/data/spherex/dr1-d2-150.fits')
    if (!response.ok) throw new Error('The cached IRSA cutout is unavailable.')
    return cutoutFromBuffer(await response.arrayBuffer(), uri, true)
  }

  try {
    const response = await fetch(`/api/spherex/cutout?${key}`)
    const type = response.headers.get('content-type') ?? ''
    if (!response.ok || !type.includes('fits')) {
      let message = `IRSA cutout returned ${response.status}.`
      try {
        const parsed = (await response.json()) as { error?: string }
        if (parsed.error) message = parsed.error
      } catch {}
      throw new Error(message)
    }

    const result = cutoutFromBuffer(await response.arrayBuffer(), uri, false)
    cutoutCache.set(key, result)
    return result
  } catch (error) {
    if (!canCache) throw error
    const response = await fetch('/data/spherex/dr1-d2-150.fits')
    if (!response.ok) throw error
    const result = cutoutFromBuffer(await response.arrayBuffer(), uri, true)
    cutoutCache.set(key, result)
    return result
  }
}

function cutoutFromBuffer(buffer: ArrayBuffer, uri: string, cached: boolean): RealCutout {
  const fits = parseFits(buffer)
  const image = fits.hdus.find((hdu) => hdu.name.toUpperCase() === 'IMAGE') ?? fits.hdus[0]
  if (!image) throw new Error('The cutout has no image extension.')
  const variance = hduByName(fits, 'VARIANCE')
  const flags = hduByName(fits, 'FLAGS')
  const zodi = hduByName(fits, 'ZODI')
  const pixels = readImage(buffer, image)
  const flagPixels = flags ? readImage(buffer, flags) : null
  const offset = hduOffset(image)
  return {
    uri,
    fileName: uri.split('/').pop() ?? 'IRSA cutout',
    buffer,
    fits,
    image,
    variance,
    flags,
    zodi,
    pixels,
    variancePixels: variance ? readImage(buffer, variance) : null,
    flagPixels,
    zodiPixels: zodi ? readImage(buffer, zodi) : null,
    stats: imageStats(pixels),
    flagCounts: flagPixels ? flagBitCounts(flagPixels) : [],
    cutX: offset.x,
    cutY: offset.y,
    scale: pixelScaleSafe(image),
    observedAt: textValue(image.header, 'DATE-AVG', textValue(image.header, 'DATE-OBS', '')),
    obsid: textValue(image.header, 'OBSID', ''),
    cached,
  }
}

function pixelScaleSafe(hdu: FitsHdu) {
  const cd11 = numberValue(hdu.header, 'CD1_1', Number.NaN)
  const a = Number.isFinite(cd11)
    ? cd11
    : numberValue(hdu.header, 'PC1_1', 1) * numberValue(hdu.header, 'CDELT1', 1)
  const b = Number.isFinite(cd11)
    ? numberValue(hdu.header, 'CD1_2')
    : numberValue(hdu.header, 'PC1_2') * numberValue(hdu.header, 'CDELT2', 1)
  const c = Number.isFinite(cd11)
    ? numberValue(hdu.header, 'CD2_1')
    : numberValue(hdu.header, 'PC2_1') * numberValue(hdu.header, 'CDELT1', 1)
  const d = Number.isFinite(cd11)
    ? numberValue(hdu.header, 'CD2_2')
    : numberValue(hdu.header, 'PC2_2', 1) * numberValue(hdu.header, 'CDELT2', 1)
  return Math.sqrt(Math.abs(a * d - b * c)) * 3600
}

export async function loadRealSpectrum(uris: string[], ra: number, dec: number) {
  const params = new URLSearchParams({ ra: String(ra), dec: String(dec) })
  for (const uri of uris) params.append('uri', uri)
  const response = await fetch(`/api/spherex/spectrum?${params.toString()}`)
  const data = (await response.json()) as RealSpectrum | { error: string }
  if (!response.ok || 'error' in data) throw new Error('error' in data ? data.error : 'Spectrum extraction failed.')
  return data
}

export async function loadCatalog(survey: 'gaia' | 'wise', ra: number, dec: number, radius: number) {
  const params = new URLSearchParams({ survey, ra: String(ra), dec: String(dec), radius: String(radius) })
  const response = await fetch(`/api/catalog?${params.toString()}`)
  const data = (await response.json()) as CatalogResult | { error: string }
  if (!response.ok || 'error' in data) throw new Error('error' in data ? data.error : 'Catalogue query failed.')
  return data
}

export function worldToPixel(hdu: FitsHdu, ra: number, dec: number) {
  const center = skyAt(hdu, hdu.width / 2, hdu.height / 2)
  if (!center) return null
  let x = hdu.width / 2
  let y = hdu.height / 2
  for (let pass = 0; pass < 14; pass += 1) {
    const sky = skyAt(hdu, x, y)
    if (!sky) return null
    const dra = wrap(ra - sky.ra) * Math.cos((dec * Math.PI) / 180)
    const ddec = dec - sky.dec
    if (Math.abs(dra) < 1e-7 && Math.abs(ddec) < 1e-7) break
    const sx = skyAt(hdu, x + 1, y)
    const sy = skyAt(hdu, x, y + 1)
    if (!sx || !sy) return null
    const j11 = wrap(sx.ra - sky.ra) * Math.cos((dec * Math.PI) / 180)
    const j21 = sx.dec - sky.dec
    const j12 = wrap(sy.ra - sky.ra) * Math.cos((dec * Math.PI) / 180)
    const j22 = sy.dec - sky.dec
    const det = j11 * j22 - j12 * j21
    if (!Number.isFinite(det) || Math.abs(det) < 1e-14) break
    x -= (j22 * dra - j12 * ddec) / det
    y -= (-j21 * dra + j11 * ddec) / det
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  }
  if (x < -2 || y < -2 || x > hdu.width + 2 || y > hdu.height + 2) return null
  return { x, y }
}

export function waveAtPixel(cutout: RealCutout, x: number, y: number) {
  if (!cutout.fits.wave) return null
  return waveAt(cutout.fits.wave, cutout.cutX + x + 1, cutout.cutY + y + 1)
}

export function skyAtPixel(cutout: RealCutout, x: number, y: number) {
  return skyAt(cutout.image, x + 1, y + 1)
}

export function detectorLabel(detector: string) {
  return detector.replace(/^D/, 'Detector ')
}

export function formatTime(iso: string) {
  if (!iso) return 'time unavailable'
  return iso.replace('T', ' ').replace('Z', ' UTC').slice(0, 20)
}

export function formatMjd(mjd: number) {
  return mjd.toFixed(5)
}

export function normalizeField(ra: number, dec: number, fov: number) {
  return {
    ra: ((ra % 360) + 360) % 360,
    dec: cutoff(dec),
    fov: Math.min(0.9, Math.max(0.1, fov)),
  }
}
