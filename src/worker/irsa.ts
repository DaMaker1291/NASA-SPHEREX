import { imageStats, numberValue, parseFits, readImage, textValue, waveAt, type FitsFile, type FitsHdu } from '../lib/fits'
import {
  ApiError,
  SingleFlight,
  TtlCache,
  assertUpstreamOk,
  fetchWithRetry,
  parseCsv,
  readArrayBufferLimited,
  readTextLimited,
  validateIrsaProductUri,
} from './http'

const IRSA = 'https://irsa.ipac.caltech.edu'
const GAIA_TAP = 'https://gea.esac.esa.int/tap-server/tap/sync'
const BLOCK = 2880
const CARD = 80
const MAX_SIA_BYTES = 1_500_000
const MAX_CATALOG_BYTES = 2_000_000
const MAX_CUTOUT_BYTES = 40 * 1024 * 1024
const MAX_HDUS = 64
const decoder = new TextDecoder('ascii')

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

export type IrsaFieldSummary = {
  visits: number
  observations: number
  products: number
  detectors: string[]
  bands: string[]
  firstIso: string
  lastIso: string
  spanDays: number
  medianGapDays: number | null
  estimatedBytes: number
}

export type IrsaFind = {
  source: {
    label: string
    url: string
    query: string
  }
  field: { ra: number; dec: number; fov: number }
  observations: IrsaObservation[]
  summary?: IrsaFieldSummary
  cachedAt?: string
}

export type SpectrumPoint = {
  lambda: number
  bandwidth: number
  flux: number
  variance: number
  flag: number
}

export type SpectrumSegment = {
  detector: string
  band: string
  uri: string
  points: SpectrumPoint[]
  minLambda: number
  maxLambda: number
  flagged: number
}

export type CatalogSource = {
  ra: number
  dec: number
  mag: number | null
  pmra?: number | null
  pmdec?: number | null
}

const finite = (value: number) => Number.isFinite(value)
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))
const BYTES_PER_PRODUCT = 72 * 1024 * 1024

export function summarizeObservations(observations: IrsaObservation[]): IrsaFieldSummary {
  const detectorSet = new Set<string>()
  const bandSet = new Set<string>()
  const visitSet = new Set<string>()
  const productSet = new Set<string>()
  const firstMjdByVisit = new Map<string, number>()
  for (const observation of observations) {
    const visit = observation.obsid.replace(/_\d+$/, '')
    visitSet.add(visit)
    if (!firstMjdByVisit.has(visit)) firstMjdByVisit.set(visit, observation.mjd)
    for (const detector of observation.detectors) {
      detectorSet.add(detector.detector)
      bandSet.add(detector.band)
      productSet.add(detector.uri || detector.file)
    }
  }
  const products = productSet.size
  const times = [...firstMjdByVisit.values()].sort((a, b) => a - b)
  const gaps = times.slice(1).map((time, index) => time - times[index]).filter((gap) => gap > 0).sort((a, b) => a - b)
  const medianGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : null
  return {
    visits: visitSet.size,
    observations: observations.length,
    products,
    detectors: [...detectorSet].sort(),
    bands: [...bandSet].sort(),
    firstIso: observations[0]?.iso ?? '',
    lastIso: observations[observations.length - 1]?.iso ?? '',
    spanDays: times.length > 1 ? times[times.length - 1] - times[0] : 0,
    medianGapDays: medianGap,
    estimatedBytes: products * BYTES_PER_PRODUCT,
  }
}
const numeric = (value: string | undefined) => {
  if (value === undefined || !value.trim()) return Number.NaN
  const parsed = Number(value)
  return finite(parsed) ? parsed : Number.NaN
}

function mjdIso(mjd: number) {
  const date = new Date((mjd - 40587) * 86400000)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().replace('.000Z', 'Z')
}

function detectorFromFile(file: string) {
  const match = file.match(/_([0-9]+D[1-6])_/)
  if (!match) return ''
  return `D${match[1].slice(-1)}`
}

function visitFromFile(file: string, detector: string) {
  if (!detector) return file.replace(/\.fits$/i, '')
  const marker = `_${detector}_`
  const at = file.indexOf(marker)
  return at > 0 ? file.slice(0, at + marker.length - 1).replace(/^level2_/, '') : file.replace(/\.fits$/i, '')
}

function releaseFromUri(uri: string) {
  const match = uri.match(/\/spherex\/([^/]+)\//)
  return match ? match[1].toUpperCase() : 'IRSA'
}

const SIA_COOLDOWN_MS = 30_000
const LAST_GOOD_MS = 86_400_000
const searchCache = new TtlCache<string, IrsaFind>(300_000, 64)
const searchFlights = new SingleFlight<string, IrsaFind>(32)
const lastGoodSearch = new Map<string, { data: IrsaFind; at: number }>()
let siaCooldownUntil = 0
const catalogCache = new TtlCache<string, Awaited<ReturnType<typeof queryCatalog>>>(1_800_000, 64)
const catalogFlights = new SingleFlight<string, Awaited<ReturnType<typeof queryCatalog>>>(32)
const catalogCooldownUntil: Record<'gaia' | 'wise', number> = { gaia: 0, wise: 0 }
const cutoutFlights = new SingleFlight<string, ArrayBuffer>(32)
const spectrumCache = new TtlCache<string, SpectrumSegment>(600_000, 64)
const spectrumFlights = new SingleFlight<string, SpectrumSegment>(32)

const LAST_GOOD_CACHE = 'drift-last-good'

function lastGoodKey(cacheKey: string) {
  return `https://drift.local/__last-good/${encodeURIComponent(cacheKey)}`
}

function rememberLastGood(cacheKey: string, data: IrsaFind) {
  if (!lastGoodSearch.has(cacheKey) && lastGoodSearch.size >= 100) {
    const oldest = lastGoodSearch.keys().next()
    if (!oldest.done) lastGoodSearch.delete(oldest.value)
  }
  lastGoodSearch.set(cacheKey, { data, at: Date.now() })
  try {
    void caches
      .open(LAST_GOOD_CACHE)
      .then((cache) =>
        cache.put(
          new Request(lastGoodKey(cacheKey)),
          new Response(JSON.stringify(data), {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=86400' },
          }),
        ),
      )
      .catch(() => {})
  } catch {
    // Local dev may not expose the Cache API; the in-isolate copy still works.
  }
}

async function lastGoodResult(cacheKey: string): Promise<IrsaFind | null> {
  let entry = lastGoodSearch.get(cacheKey)
  if (!entry) {
    try {
      const cache = await caches.open(LAST_GOOD_CACHE)
      const cached = await cache.match(lastGoodKey(cacheKey))
      if (cached) {
        const data = (await cached.json()) as IrsaFind
        entry = { data, at: Date.now() }
        lastGoodSearch.set(cacheKey, entry)
      }
    } catch {
      // No persistent cache available; fall back to the in-isolate copy only.
    }
  }
  if (!entry) return null
  if (Date.now() - entry.at > LAST_GOOD_MS) {
    lastGoodSearch.delete(cacheKey)
    return null
  }
  return {
    ...entry.data,
    source: { ...entry.data.source, label: `${entry.data.source.label} · last known good` },
    cachedAt: new Date(entry.at).toISOString(),
  }
}

export async function findSpherex(ra: number, dec: number, fov: number): Promise<IrsaFind> {
  if (!finite(ra) || ra < 0 || ra > 360 || !finite(dec) || dec < -90 || dec > 90 || !finite(fov) || fov < 0.1 || fov > 0.9) {
    throw new ApiError(400, 'Invalid sky position or field size.', 'OUT_OF_RANGE')
  }

  const cacheKey = `${ra.toFixed(4)}|${dec.toFixed(4)}|${fov.toFixed(2)}`
  const cached = searchCache.get(cacheKey)
  if (cached) return cached
  if (Date.now() < siaCooldownUntil) {
    const stale = await lastGoodResult(cacheKey)
    if (stale) return stale
    throw new ApiError(503, 'IRSA SIA2 is cooling down after a failed request; retry shortly.', 'UPSTREAM_BUSY')
  }

  return searchFlights.run(cacheKey, async () => {
    try {
      return await querySia(ra, dec, fov, cacheKey)
    } catch (error) {
      siaCooldownUntil = Date.now() + SIA_COOLDOWN_MS
      const stale = await lastGoodResult(cacheKey)
      if (stale) return stale
      throw error
    }
  })
}

async function querySia(ra: number, dec: number, fov: number, cacheKey: string): Promise<IrsaFind> {
    const radius = clamp(fov / 2, 0.05, 0.8)
    const params = new URLSearchParams({
      COLLECTION: 'spherex_dr1',
      POS: `circle ${ra.toFixed(6)} ${dec.toFixed(6)} ${radius.toFixed(4)}`,
      RESPONSEFORMAT: 'CSV',
      MAXREC: '300',
    })
    const url = `${IRSA}/SIA?${params.toString()}`
    const response = await fetchWithRetry(
      url,
      { headers: { Accept: 'text/csv' } },
      { attempts: 2, timeoutMs: 6_000, totalTimeoutMs: 12_000 },
    )
    await assertUpstreamOk(response, 'IRSA SIA2')
    const text = await readTextLimited(response, MAX_SIA_BYTES)
    if (/^\s*</.test(text)) {
      throw new ApiError(502, 'IRSA returned a non-CSV response.', 'BAD_UPSTREAM_RESPONSE')
    }

    let rows: Array<Record<string, string>>
    try {
      rows = parseCsv(text)
    } catch {
      throw new ApiError(502, 'IRSA returned malformed SIA2 CSV.', 'BAD_UPSTREAM_RESPONSE')
    }

    const byTime = new Map<string, IrsaObservation>()
    for (const row of rows) {
      const time = numeric(row.t_min)
      const band = row.energy_bandpassname
      if (!row.access_url || !finite(time) || !band) continue

      let uri: string
      try {
        uri = validateIrsaProductUri(row.access_url)
      } catch {
        continue
      }

      const file = uri.split('/').pop() ?? ''
      const detector = detectorFromFile(file)
      if (!detector) continue
      const key = `${time.toFixed(6)}|${row.obs_id}`
      const current =
        byTime.get(key) ??
        ({
          id: key,
          mjd: time,
          iso: mjdIso(time),
          obsid: row.obs_id || visitFromFile(file, detector),
          release: releaseFromUri(uri),
          detectors: [],
        } satisfies IrsaObservation)

      if (!current.detectors.some((item) => item.detector === detector)) {
        current.detectors.push({ detector, band: band.replace('SPHEREx-', ''), uri, file })
      }
      byTime.set(key, current)
    }

    const observations = [...byTime.values()]
      .map((observation) => ({
        ...observation,
        detectors: observation.detectors.sort((a, b) => a.detector.localeCompare(b.detector)),
      }))
      .sort((a, b) => a.mjd - b.mjd)

    const data: IrsaFind = {
      source: { label: 'IRSA SIA2 · SPHEREx DR1', url: IRSA, query: 'spherex_dr1 · POS circle · MAXREC 300' },
      field: { ra, dec, fov },
      observations,
      summary: summarizeObservations(observations),
    }
    searchCache.set(cacheKey, data)
    rememberLastGood(cacheKey, data)
    siaCooldownUntil = 0
    return data
}

function headerValue(raw: string) {
  const value = raw.trim()
  if (value.startsWith("'")) {
    let text = ''
    for (let index = 1; index < value.length; index += 1) {
      if (value[index] === "'") {
        if (value[index + 1] === "'") {
          text += "'"
          index += 1
          continue
        }
        return text.trim()
      }
      text += value[index]
    }
    return text.trim()
  }
  const comment = value.indexOf('/')
  return (comment >= 0 ? value.slice(0, comment) : value).trim()
}

function headerMap(buffer: ArrayBuffer, offset: number) {
  if (offset < 0 || offset % BLOCK !== 0) throw new Error('Invalid FITS HDU offset.')
  const header: Record<string, string> = {}
  let cursor = offset
  let ended = false
  let blocks = 0

  while (!ended) {
    if (blocks++ > 512) throw new Error('FITS header has too many blocks.')
    if (cursor + BLOCK > buffer.byteLength) throw new Error('Truncated FITS header.')
    const block = decoder.decode(new Uint8Array(buffer, cursor, BLOCK))
    for (let at = 0; at < BLOCK; at += CARD) {
      const card = block.slice(at, at + CARD)
      const key = card.slice(0, 8).trim()
      if (key === 'END') {
        ended = true
        break
      }
      if (!key || key === 'COMMENT' || key === 'HISTORY') continue
      const equals = card.indexOf('=')
      if (equals < 0) continue
      header[card.slice(0, equals).trim()] = headerValue(card.slice(equals + 1))
    }
    cursor += BLOCK
  }
  return { header, dataStart: cursor }
}

function hduBytes(header: Record<string, string>) {
  const naxis = Number(header.NAXIS ?? 0)
  if (!Number.isInteger(naxis) || naxis < 0 || naxis > 999) throw new Error('Invalid FITS NAXIS.')
  if (!naxis) return 0

  let pixels = 1
  for (let axis = 1; axis <= naxis; axis += 1) {
    const length = Number(header[`NAXIS${axis}`] ?? 0)
    if (!Number.isInteger(length) || length < 0) throw new Error('Invalid FITS axis length.')
    pixels *= length
    if (pixels > 1_000_000_000) throw new Error('FITS image is too large.')
  }

  const bitPix = Number(header.BITPIX)
  if (![8, 16, 32, 64, -32, -64].includes(bitPix)) throw new Error('Invalid FITS BITPIX.')
  const groups = Number(header.GCOUNT ?? 1)
  const parameters = Number(header.PCOUNT ?? 0)
  if (!Number.isInteger(groups) || groups < 1 || !Number.isInteger(parameters) || parameters < 0) {
    throw new Error('Invalid FITS group metadata.')
  }

  const bytes = (Math.abs(bitPix) / 8) * groups * (parameters + pixels)
  if (!Number.isFinite(bytes) || bytes < 0) throw new Error('Invalid FITS data size.')
  return Math.ceil(bytes / BLOCK) * BLOCK
}

export function stripEpsf(buffer: ArrayBuffer) {
  const chunks: Uint8Array[] = []
  let total = 0
  let at = 0
  let hdus = 0

  while (at + BLOCK <= buffer.byteLength) {
    if (hdus++ >= MAX_HDUS) throw new Error('FITS file has too many HDUs.')
    const { header, dataStart } = headerMap(buffer, at)
    const bytes = hduBytes(header)
    const end = dataStart + bytes
    if (!Number.isSafeInteger(end) || end > buffer.byteLength || end <= at) throw new Error('Truncated or invalid FITS data.')
    if ((header.EXTNAME ?? '').toUpperCase() !== 'EPSF') {
      const chunk = new Uint8Array(buffer.slice(at, end))
      chunks.push(chunk)
      total += chunk.byteLength
    }
    at = end
  }

  if (!chunks.length) throw new Error('FITS file has no usable HDUs.')
  const output = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output.buffer
}

function cutoutUrl(uri: string, ra: number, dec: number, size: string) {
  const url = new URL(validateIrsaProductUri(uri))
  url.search = ''
  url.hash = ''
  url.searchParams.set('center', `${ra.toFixed(6)},${dec.toFixed(6)}`)
  url.searchParams.set('size', size)
  url.searchParams.set('gzip', 'false')
  return url.toString()
}

async function fetchCutout(uri: string, ra: number, dec: number, size: string) {
  const target = cutoutUrl(uri, ra, dec, size)
  const response = await fetchWithRetry(
    target,
    { headers: { Accept: 'application/fits' } },
    { attempts: 3, timeoutMs: 20_000, totalTimeoutMs: 45_000 },
  )
  await assertUpstreamOk(response, 'IRSA cutout service')
  const buffer = await readArrayBufferLimited(response, MAX_CUTOUT_BYTES)
  if (buffer.byteLength < BLOCK) {
    throw new ApiError(502, 'IRSA returned an empty cutout.', 'BAD_UPSTREAM_RESPONSE')
  }
  const head = decoder.decode(new Uint8Array(buffer, 0, 6))
  if (head !== 'SIMPLE') {
    throw new ApiError(502, 'IRSA returned a non-FITS cutout.', 'BAD_UPSTREAM_RESPONSE')
  }
  try {
    return stripEpsf(buffer)
  } catch {
    throw new ApiError(502, 'IRSA returned a malformed FITS cutout.', 'BAD_UPSTREAM_RESPONSE')
  }
}

export async function getCutout(uri: string, ra: number, dec: number, fov: number) {
  const safeUri = validateIrsaProductUri(uri)
  if (!finite(ra) || ra < 0 || ra > 360 || !finite(dec) || dec < -90 || dec > 90) {
    throw new ApiError(400, 'Invalid cutout center.', 'OUT_OF_RANGE')
  }
  const size = clamp(fov, 0.02, 0.9).toFixed(3)
  const key = `${safeUri}|${ra.toFixed(6)}|${dec.toFixed(6)}|${size}`
  const buffer = await cutoutFlights.run(key, () => fetchCutout(safeUri, ra, dec, `${size}d`))
  return { buffer, size: Number(size), uri: safeUri }
}

function hduByName(fits: FitsFile, name: string) {
  return fits.hdus.find((hdu) => hdu.name.toUpperCase() === name) ?? null
}

function flagSummary(flags: Float32Array) {
  const counts = new Array<number>(32).fill(0)
  for (let i = 0; i < flags.length; i += 1) {
    let value = flags[i] | 0
    while (value) {
      const bit = 31 - Math.clz32(value & -value)
      counts[bit] += 1
      value &= value - 1
    }
  }
  return counts.map((count, bit) => ({ bit, count })).filter((item) => item.count > 0)
}

export type CutoutSummary = {
  width: number
  height: number
  depth: number
  bitPix: number
  stats: ReturnType<typeof imageStats>
  flags: Array<{ bit: number; count: number }>
  wave: { min: number; max: number; minBandwidth: number; maxBandwidth: number } | null
  meta: {
    detector: string
    band: string
    obsid: string
    dateAvg: string
    exposure: number | null
    bunit: string
    telescope: string
    instrument: string
    projection: string
  }
}

export function summarizeCutout(buffer: ArrayBuffer): CutoutSummary {
  const fits = parseFits(buffer)
  const image = fits.hdus[0]
  const flags = hduByName(fits, 'FLAGS')
  const header = image?.header
  const exposure = header ? numberValue(header, 'EXPTIME', Number.NaN) : Number.NaN
  return {
    width: image?.width ?? 0,
    height: image?.height ?? 0,
    depth: image?.depth ?? 0,
    bitPix: image?.bitPix ?? 0,
    stats: image ? imageStats(readImage(buffer, image)) : null,
    flags: flags ? flagSummary(readImage(buffer, flags)) : [],
    wave: fits.wave
      ? {
          min: fits.wave.minWavelength,
          max: fits.wave.maxWavelength,
          minBandwidth: fits.wave.minBandwidth,
          maxBandwidth: fits.wave.maxBandwidth,
        }
      : null,
    meta: {
      detector: header ? textValue(header, 'DETECTOR') : '',
      band: header ? textValue(header, 'BAND') : '',
      obsid: header ? textValue(header, 'OBSID') : '',
      dateAvg: header ? textValue(header, 'DATE-AVG', textValue(header, 'DATE-OBS')) : '',
      exposure: Number.isFinite(exposure) ? exposure : null,
      bunit: header ? textValue(header, 'BUNIT') : '',
      telescope: header ? textValue(header, 'TELESCOP') : '',
      instrument: header ? textValue(header, 'INSTRUME') : '',
      projection: header ? textValue(header, 'CTYPE1') : '',
    },
  }
}

function cropOffset(hdu: FitsHdu) {
  const cutX = numberValue(hdu.header, 'CUTX0', Number.NaN)
  const cutY = numberValue(hdu.header, 'CUTY0', Number.NaN)
  if (Number.isFinite(cutX) && Number.isFinite(cutY)) return { x: cutX, y: cutY }
  return {
    x: -numberValue(hdu.header, 'CRPIX1A', -1),
    y: -numberValue(hdu.header, 'CRPIX2A', -1),
  }
}

export async function getSpectrum(uri: string, ra: number, dec: number): Promise<SpectrumSegment> {
  const safeUri = validateIrsaProductUri(uri)
  if (!finite(ra) || ra < 0 || ra > 360 || !finite(dec) || dec < -90 || dec > 90) {
    throw new ApiError(400, 'Invalid spectrum center.', 'OUT_OF_RANGE')
  }
  const key = `${safeUri}|${ra.toFixed(6)}|${dec.toFixed(6)}`
  const cached = spectrumCache.get(key)
  if (cached) return cached

  return spectrumFlights.run(key, async () => {
    const buffer = await fetchCutout(safeUri, ra, dec, '24,2040pix')
    let fits: FitsFile
    try {
      fits = parseFits(buffer)
    } catch {
      throw new ApiError(502, 'IRSA returned a malformed spectral FITS product.', 'BAD_UPSTREAM_RESPONSE')
    }

    const image = hduByName(fits, 'IMAGE')
    const variance = hduByName(fits, 'VARIANCE')
    const flags = hduByName(fits, 'FLAGS')
    if (!image || !fits.wave || image.width < 1 || image.height < 1) {
      throw new ApiError(502, 'That cutout has no usable IMAGE or WCS-WAVE extension.', 'BAD_UPSTREAM_RESPONSE')
    }

    const flux = readImage(buffer, image)
    const noise = variance ? readImage(buffer, variance) : null
    const mask = flags ? readImage(buffer, flags) : null
    const offset = cropOffset(image)
    const centerX = Math.floor(image.width / 2)
    const lowX = Math.max(0, centerX - 2)
    const highX = Math.min(image.width - 1, centerX + 2)
    const stride = Math.max(1, Math.ceil(image.height / 180))
    const points: SpectrumPoint[] = []

    for (let y = 0; y < image.height; y += stride) {
      const { wavelength, bandwidth } = waveAt(fits.wave, offset.x + centerX + 1, offset.y + y + 1)
      if (!finite(wavelength) || !finite(bandwidth) || bandwidth <= 0) continue
      let sum = 0
      let sumVariance = 0
      let varianceCount = 0
      let count = 0
      let flag = 0
      for (let x = lowX; x <= highX; x += 1) {
        const value = flux[y * image.width + x]
        if (!finite(value)) continue
        sum += value
        if (noise) {
          const varianceValue = noise[y * image.width + x]
          if (finite(varianceValue)) {
            sumVariance += varianceValue
            varianceCount += 1
          }
        }
        if (mask) flag |= mask[y * image.width + x] | 0
        count += 1
      }
      if (!count) continue
      points.push({
        lambda: wavelength,
        bandwidth,
        flux: sum / count,
        variance: varianceCount ? sumVariance / (varianceCount * varianceCount) : Number.NaN,
        flag,
      })
    }

    if (!points.length) throw new ApiError(502, 'No finite spectral samples were found.', 'BAD_UPSTREAM_RESPONSE')
    const finitePoints = points.filter((point) => finite(point.flux))
    if (!finitePoints.length) throw new ApiError(502, 'No finite spectral samples were found.', 'BAD_UPSTREAM_RESPONSE')
    const flagged = finitePoints.filter((point) => point.flag !== 0).length
    const segment: SpectrumSegment = {
      detector: textValue(image.header, 'DETECTOR'),
      band: textValue(image.header, 'BAND', ''),
      uri: safeUri,
      points: finitePoints,
      minLambda: Math.min(...finitePoints.map((point) => point.lambda)),
      maxLambda: Math.max(...finitePoints.map((point) => point.lambda)),
      flagged,
    }
    spectrumCache.set(key, segment)
    return segment
  })
}

function parseIpacRows(text: string) {
  const rows: Array<Record<string, string>> = []
  let headers: string[] | null = null
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('|')) {
      if (!headers) headers = line.split('|').slice(1, -1).map((value) => value.trim())
      continue
    }
    if (!headers || !line.trim() || line.startsWith('\\')) continue
    const values = line.trim().split(/\s+/)
    if (values.length < headers.length) continue
    const row: Record<string, string> = {}
    headers.forEach((header, index) => {
      row[header] = values[index] ?? ''
    })
    rows.push(row)
  }
  return rows
}

async function queryWise(ra: number, dec: number, radius: number) {
  const r = Math.min(0.2, clamp(radius, 0.02, 0.2))
  const params = new URLSearchParams({
    catalog: 'allwise_p3as_psd',
    spatial: 'cone',
    objstr: `${ra.toFixed(6)} ${dec.toFixed(6)}`,
    radius: r.toFixed(4),
    radunits: 'deg',
    outfmt: '1',
    selcols: 'ra,dec,w1mpro,w2mpro',
    outrows: '500',
  })
  const response = await fetchWithRetry(
    `${IRSA}/cgi-bin/Gator/nph-query?${params.toString()}`,
    { headers: { Accept: 'text/plain' } },
    { attempts: 3, timeoutMs: 25_000, totalTimeoutMs: 45_000 },
  )
  await assertUpstreamOk(response, 'AllWISE catalogue')
  const text = await readTextLimited(response, MAX_CATALOG_BYTES)
  if (/^\s*</.test(text)) {
    throw new ApiError(502, 'AllWISE returned a non-table response.', 'BAD_UPSTREAM_RESPONSE')
  }

  const sources: CatalogSource[] = []
  for (const row of parseIpacRows(text)) {
    const sourceRa = numeric(row.ra)
    const sourceDec = numeric(row.dec)
    if (!finite(sourceRa) || !finite(sourceDec)) continue
    const mag = numeric(row.w1mpro)
    sources.push({ ra: sourceRa, dec: sourceDec, mag: finite(mag) ? mag : null, pmra: null, pmdec: null })
  }

  return {
    survey: 'wise' as const,
    source: { label: 'AllWISE · IRSA cone search', url: IRSA },
    count: sources.length,
    sources,
  }
}

async function queryCatalog(survey: 'gaia' | 'wise', ra: number, dec: number, radius: number) {
  if (survey === 'wise') return queryWise(ra, dec, radius)
  const r = clamp(radius, 0.02, 2)
  const raText = ra.toFixed(6)
  const decText = dec.toFixed(6)
  const radiusText = r.toFixed(4)
  const query = [
    'SELECT TOP 500 ra, dec, phot_g_mean_mag, pmra, pmdec',
    'FROM gaiadr3.gaia_source',
    `WHERE 1 = CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', ${raText}, ${decText}, ${radiusText}))`,
  ].join(' ')
  const params = new URLSearchParams({ QUERY: query, RESPONSEFORMAT: 'CSV', LANG: 'ADQL' })
  const response = await fetchWithRetry(
    `${GAIA_TAP}?${params.toString()}`,
    { headers: { Accept: 'text/csv' } },
    { attempts: 2, timeoutMs: 30_000, totalTimeoutMs: 45_000 },
  )
  await assertUpstreamOk(response, 'Gaia TAP')
  const text = await readTextLimited(response, MAX_CATALOG_BYTES)
  if (/^\s*</.test(text)) {
    throw new ApiError(502, 'Gaia TAP returned a non-CSV response.', 'BAD_UPSTREAM_RESPONSE')
  }

  let rows: Array<Record<string, string>>
  try {
    rows = parseCsv(text)
  } catch {
    throw new ApiError(502, 'Gaia TAP returned malformed CSV.', 'BAD_UPSTREAM_RESPONSE')
  }

  const sources: CatalogSource[] = []
  for (const row of rows) {
    const sourceRa = numeric(row.ra)
    const sourceDec = numeric(row.dec)
    if (!finite(sourceRa) || !finite(sourceDec)) continue
    const mag = numeric(row.phot_g_mean_mag)
    const pmra = numeric(row.pmra)
    const pmdec = numeric(row.pmdec)
    sources.push({
      ra: sourceRa,
      dec: sourceDec,
      mag: finite(mag) ? mag : null,
      pmra: finite(pmra) ? pmra : null,
      pmdec: finite(pmdec) ? pmdec : null,
    })
  }

  return {
    survey: 'gaia' as const,
    source: { label: 'Gaia DR3 · ESA Gaia Archive TAP', url: 'https://gea.esac.esa.int/archive/' },
    count: sources.length,
    sources,
  }
}

export function briefFromFind(find: IrsaFind) {
  return {
    source: find.source,
    field: find.field,
    summary: find.summary ?? summarizeObservations(find.observations),
    detectorProducts: find.summary?.products ?? find.observations.reduce((total, observation) => total + observation.detectors.length, 0),
    visits: find.observations.map((observation) => ({
      id: observation.obsid,
      iso: observation.iso,
      mjd: observation.mjd,
      release: observation.release,
      detectors: observation.detectors.map((detector) => ({
        detector: detector.detector,
        band: detector.band,
        file: detector.file,
      })),
    })),
  }
}

export async function briefSpherex(ra: number, dec: number, fov: number) {
  return briefFromFind(await findSpherex(ra, dec, fov))
}

export async function getCatalog(survey: 'gaia' | 'wise', ra: number, dec: number, radius: number) {
  if (!finite(ra) || ra < 0 || ra > 360 || !finite(dec) || dec < -90 || dec > 90 || !finite(radius) || radius < 0.02 || radius > 2) {
    throw new ApiError(400, 'Invalid catalogue position or radius.', 'OUT_OF_RANGE')
  }

  const cacheKey = `${survey}|${ra.toFixed(4)}|${dec.toFixed(4)}|${radius.toFixed(4)}`
  const cached = catalogCache.get(cacheKey)
  if (cached) return cached
  if (Date.now() < catalogCooldownUntil[survey]) {
    throw new ApiError(503, `${survey} TAP is cooling down after a failed request; retry shortly.`, 'UPSTREAM_BUSY')
  }

  return catalogFlights.run(cacheKey, async () => {
    try {
      const data = await queryCatalog(survey, ra, dec, radius)
      catalogCache.set(cacheKey, data)
      catalogCooldownUntil[survey] = 0
      return data
    } catch (error) {
      catalogCooldownUntil[survey] = Date.now() + 30_000
      throw error
    }
  })
}
