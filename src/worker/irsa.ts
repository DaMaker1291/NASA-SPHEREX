import { imageStats, numberValue, parseFits, pixelScale, readImage, skyAt, textValue, waveAt, type FitsFile, type FitsHdu } from '../lib/fits'
import { fetchS3Cutout } from './s3'
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
const MAX_SIA_HTML_BYTES = 4_000_000
const MAX_CATALOG_BYTES = 2_000_000
const MAX_CUTOUT_BYTES = 40 * 1024 * 1024
const CUTOUT_CACHE_TTL_MS = 10 * 60_000
const CUTOUT_CACHE_MAX_BYTES = 96 * 1024 * 1024
const CUTOUT_PRIMARY_COOLDOWN_MS = 30_000
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

export type IrsaCoverage = {
  observed: boolean
  message: string
  checkedAt: string
  releases: string[]
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
  coverage?: IrsaCoverage
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
  source?: string
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
const SIA_TOTAL_BUDGET_MS = 40_000
const UPSTREAM_COOLDOWN_MS = 8_000
const LAST_GOOD_MS = 86_400_000
const searchCache = new TtlCache<string, IrsaFind>(300_000, 64)
const searchFlights = new SingleFlight<string, IrsaFind>(32)
const lastGoodSearch = new Map<string, { data: IrsaFind; at: number }>()
const siaCooldowns = new Map<string, number>()
let siaUnavailableUntil = 0
const catalogCache = new TtlCache<string, Awaited<ReturnType<typeof queryCatalog>>>(1_800_000, 64)
const catalogFlights = new SingleFlight<string, Awaited<ReturnType<typeof queryCatalog>>>(32)
const catalogCooldowns = new Map<string, number>()
const catalogUnavailableUntil: Record<'gaia' | 'wise', number> = { gaia: 0, wise: 0 }

function isInfrastructureFailure(error: unknown) {
  return error instanceof ApiError && (error.status === 503 || error.status === 504 || error.code === 'UPSTREAM_UNAVAILABLE')
}

function rememberCooldown(store: Map<string, number>, key: string, until: number) {
  if (store.size > 200) {
    const now = Date.now()
    for (const [entry, expiry] of store) if (expiry <= now) store.delete(entry)
  }
  store.set(key, until)
}
type CutoutBuffer = { buffer: ArrayBuffer; source: string }
const cutoutFlights = new SingleFlight<string, CutoutBuffer>(32)
const cutoutCache = new Map<string, { buffer: ArrayBuffer; source: string; at: number; bytes: number }>()
let cutoutCacheBytes = 0
let cutoutPrimaryUnavailableUntil = 0
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
  const keyCooldown = siaCooldowns.get(cacheKey) ?? 0
  if (Date.now() < keyCooldown || Date.now() < siaUnavailableUntil) {
    const stale = await lastGoodResult(cacheKey)
    if (stale) return stale
    throw new ApiError(503, 'Archive discovery is cooling down after a failed request; retry shortly.', 'UPSTREAM_BUSY')
  }

  return searchFlights.run(cacheKey, async () => {
    try {
      const [tapResult, siaResult] = await Promise.allSettled([
        queryTap(ra, dec, fov),
        querySia(ra, dec, fov, cacheKey),
      ])
      const tap = tapResult.status === 'fulfilled' ? tapResult.value : null
      const sia = siaResult.status === 'fulfilled' ? siaResult.value : null
      const result = (tap?.observations.length ? tap : null)
        ?? (sia?.observations.length ? sia : null)
        ?? tap
        ?? sia
      if (!result) {
        const error = siaResult.status === 'rejected' ? siaResult.reason : tapResult.status === 'rejected' ? tapResult.reason : null
        if (isInfrastructureFailure(error)) siaUnavailableUntil = Date.now() + UPSTREAM_COOLDOWN_MS
        rememberCooldown(siaCooldowns, cacheKey, Date.now() + SIA_COOLDOWN_MS)
        const stale = await lastGoodResult(cacheKey)
        if (stale) return stale
        throw error instanceof Error ? error : new ApiError(502, 'Archive discovery failed.', 'UPSTREAM_UNAVAILABLE')
      }
      siaCooldowns.delete(cacheKey)
      siaUnavailableUntil = 0
      searchCache.set(cacheKey, result)
      if (result.observations.length) rememberLastGood(cacheKey, result)
      return result
    } catch (error) {
      rememberCooldown(siaCooldowns, cacheKey, Date.now() + SIA_COOLDOWN_MS)
      if (isInfrastructureFailure(error)) siaUnavailableUntil = Date.now() + UPSTREAM_COOLDOWN_MS
      const stale = await lastGoodResult(cacheKey)
      if (stale) return stale
      throw error
    }
  })
}

function decodeHtml(value: string) {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ')
    .trim()
}

function parseSiaHtml(text: string): Array<Record<string, string>> {
  const headerRow = text.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/i)?.[0] ?? ''
  const headers = [...headerRow.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((match) => decodeHtml(match[1]))
  if (!headers.length) throw new Error('SIA HTML had no table header.')
  const rows: Array<Record<string, string>> = []
  for (const rowMatch of text.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...rowMatch[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => decodeHtml(match[1]))
    if (cells.length !== headers.length) continue
    const row: Record<string, string> = {}
    headers.forEach((header, index) => { row[header] = cells[index] })
    rows.push(row)
  }
  return rows
}

async function fetchSiaRows(ra: number, dec: number, collection: string, budgetMs: number): Promise<Array<Record<string, string>>> {
  const deadline = Date.now() + Math.max(0, budgetMs)
  const remaining = () => Math.max(0, deadline - Date.now())
  if (remaining() < 1_000) {
    throw new ApiError(504, 'Archive discovery deadline expired.', 'UPSTREAM_TIMEOUT')
  }
  const radius = 0.02
  const base = new URLSearchParams({
    COLLECTION: collection,
    POS: `circle ${ra.toFixed(6)} ${dec.toFixed(6)} ${radius.toFixed(4)}`,
    MAXREC: '300',
  })

  let csvError: unknown = null
  try {
    const params = new URLSearchParams(base)
    params.set('RESPONSEFORMAT', 'CSV')
    const csvBudget = remaining()
    const response = await fetchWithRetry(
      `${IRSA}/SIA?${params.toString()}`,
      { headers: { Accept: 'text/csv' } },
      { attempts: 1, timeoutMs: Math.min(30_000, csvBudget), totalTimeoutMs: csvBudget },
    )
    await assertUpstreamOk(response, 'Archive discovery service')
    const text = await readTextLimited(response, MAX_SIA_BYTES)
    if (!/^\s*</.test(text)) {
      const rows = parseCsv(text)
      return rows
    }
    return parseSiaHtml(text)
  } catch (error) {
    csvError = error
  }

  try {
    const htmlBudget = remaining()
    if (htmlBudget < 1_000) {
      if (csvError instanceof ApiError) throw csvError
      throw new ApiError(504, 'Archive discovery deadline expired.', 'UPSTREAM_TIMEOUT')
    }
    const params = new URLSearchParams(base)
    params.set('RESPONSEFORMAT', 'HTML')
    const response = await fetchWithRetry(
      `${IRSA}/SIA?${params.toString()}`,
      { headers: { Accept: 'text/html' } },
      { attempts: 1, timeoutMs: Math.min(12_000, htmlBudget), totalTimeoutMs: htmlBudget },
    )
    await assertUpstreamOk(response, 'Archive discovery service')
    const text = await readTextLimited(response, MAX_SIA_HTML_BYTES)
    return parseSiaHtml(text)
  } catch (htmlError) {
    if (csvError instanceof ApiError && csvError.status === 503) throw csvError
    if (htmlError instanceof ApiError) throw htmlError
    throw csvError instanceof Error ? csvError : new ApiError(502, 'Archive discovery returned malformed data.', 'BAD_UPSTREAM_RESPONSE')
  }
}

const SIA_COLLECTIONS = [
  { id: 'spherex_dr1', label: 'IRSA SIA2 · SPHEREx DR1' },
  { id: 'spherex_dr1_deep', label: 'IRSA SIA2 · SPHEREx DR1 deep' },
  { id: 'spherex_qr3', label: 'IRSA SIA2 · SPHEREx QR3 · failover' },
  { id: 'spherex_qr3_deep', label: 'IRSA SIA2 · SPHEREx QR3 deep · failover' },
  { id: 'spherex_dr1_cube', label: 'IRSA SIA2 · SPHEREx DR1 cube · failover' },
] as const

const TAP = `${IRSA}/TAP/sync`

function emptyCoverage() {
  return {
    observed: false,
    message: 'Region not yet observed in the current SPHEREx DR1/QR3 releases.',
    checkedAt: new Date().toISOString(),
    releases: ['DR1', 'QR3'],
  } satisfies IrsaCoverage
}

function emptyFind(ra: number, dec: number, fov: number, sourceLabel: string, query: string): IrsaFind {
  return {
    source: { label: sourceLabel, url: IRSA, query },
    field: { ra, dec, fov },
    observations: [],
    summary: summarizeObservations([]),
    coverage: emptyCoverage(),
  }
}

function rowValue(row: Record<string, string>, ...names: string[]) {
  for (const name of names) {
    const exact = row[name]
    if (exact !== undefined && exact !== '') return exact
    const found = Object.keys(row).find((key) => key.toLowerCase() === name.toLowerCase())
    if (found && row[found] !== '') return row[found]
  }
  return ''
}

function timeToMjd(value: string) {
  const numericTime = Number(value)
  if (Number.isFinite(numericTime) && numericTime > 10000) return numericTime
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed / 86400000 + 40587 : Number.NaN
}

function tapProductUri(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) {
    try { return validateIrsaProductUri(trimmed) } catch { return null }
  }
  const path = trimmed
    .replace(/^\/+/, '')
    .replace(/^irsa\.ipac\.caltech\.edu\//i, '')
  try { return validateIrsaProductUri(`https://irsa.ipac.caltech.edu/${path}`) } catch { return null }
}

async function queryTap(ra: number, dec: number, fov: number): Promise<IrsaFind> {
  const query = [
    'SELECT TOP 500',
    'a.uri AS uri,',
    'p.time_bounds_lower AS time_lower,',
    'p.time_bounds_upper AS time_upper,',
    'p.energy_bandpassname AS band,',
    'p.provenance_version AS release,',
    'p.planeid AS planeid',
    'FROM spherex.artifact a',
    'JOIN spherex.plane p ON a.planeid = p.planeid',
    `WHERE 1 = CONTAINS(POINT('ICRS', ${ra.toFixed(6)}, ${dec.toFixed(6)}), p.poly)`,
    'ORDER BY p.time_bounds_lower',
  ].join(' ')
  const params = new URLSearchParams({ QUERY: query, LANG: 'ADQL', FORMAT: 'csv', MAXREC: '500' })
  const response = await fetchWithRetry(
    `${TAP}?${params.toString()}`,
    { headers: { Accept: 'text/csv' } },
    { attempts: 1, timeoutMs: 12_000, totalTimeoutMs: 16_000 },
  )
  await assertUpstreamOk(response, 'Archive discovery service')
  const text = await readTextLimited(response, MAX_SIA_BYTES)
  if (/^\s*</.test(text)) throw new ApiError(502, 'Archive discovery returned a non-CSV response.', 'BAD_UPSTREAM_RESPONSE')
  const rows = parseCsv(text)
  const byTime = new Map<string, IrsaObservation>()

  for (const row of rows) {
    const uri = tapProductUri(rowValue(row, 'uri', 'access_url'))
    if (!uri) continue
    const file = uri.split('/').pop() ?? ''
    const detector = detectorFromFile(file)
    if (!detector) continue
    const mjd = timeToMjd(rowValue(row, 'time_lower', 'time_bounds_lower', 't_min'))
    if (!Number.isFinite(mjd)) continue
    const bandValue = rowValue(row, 'band', 'energy_bandpassname') || detector
    const obsid = visitFromFile(file, detector)
    const key = `${mjd.toFixed(6)}|${obsid}`
    const current = byTime.get(key) ?? {
      id: key,
      mjd,
      iso: mjdIso(mjd),
      obsid,
      release: (rowValue(row, 'release', 'provenance_version') || releaseFromUri(uri)).toUpperCase(),
      detectors: [],
    } satisfies IrsaObservation
    if (!current.detectors.some((item) => item.detector === detector)) {
      current.detectors.push({ detector, band: bandValue.replace(/^SPHEREx-/i, ''), uri, file })
    }
    byTime.set(key, current)
  }

  const observations = [...byTime.values()]
    .map((observation) => ({
      ...observation,
      detectors: observation.detectors.sort((a, b) => a.detector.localeCompare(b.detector)),
    }))
    .sort((a, b) => a.mjd - b.mjd)

  if (!observations.length) return emptyFind(ra, dec, fov, 'IRSA TAP · SPHEREx artifacts', 'spherex.artifact + spherex.plane · CONTAINS point · no rows')
  return {
    source: { label: 'IRSA TAP · SPHEREx artifacts', url: IRSA, query: 'spherex.artifact + spherex.plane · CONTAINS point' },
    field: { ra, dec, fov },
    observations,
    summary: summarizeObservations(observations),
  }
}

async function querySia(ra: number, dec: number, fov: number, cacheKey: string): Promise<IrsaFind> {
    let rows: Array<Record<string, string>> = []
    let sourceLabel: string = SIA_COLLECTIONS[0].label
    let sourceCollection: string = SIA_COLLECTIONS[0].id
    let lastError: unknown = null
    let answeredEmpty = false
    let deadlineExpired = false
    const deadline = Date.now() + SIA_TOTAL_BUDGET_MS

    for (const collection of SIA_COLLECTIONS) {
      const remaining = deadline - Date.now()
      if (remaining < 1_000) {
        deadlineExpired = true
        break
      }
      try {
        const candidate = await fetchSiaRows(ra, dec, collection.id, remaining)
        if (!candidate.length) {
          answeredEmpty = true
          continue
        }
        rows = candidate
        sourceLabel = collection.label
        sourceCollection = collection.id
        lastError = null
        break
      } catch (error) {
        lastError = error
      }
    }

    if (!rows.length) {
      if (deadlineExpired) {
        if (lastError instanceof ApiError) throw lastError
        throw new ApiError(504, `Archive discovery did not answer within ${SIA_TOTAL_BUDGET_MS / 1000}s.`, 'UPSTREAM_TIMEOUT')
      }
      if (answeredEmpty && !lastError) return emptyFind(ra, dec, fov, `${sourceLabel} · no coverage`, `${sourceCollection} · POS circle · no rows`)
      if (lastError instanceof ApiError) throw lastError
      throw new ApiError(502, 'The archive returned no products for that field.', 'NO_ROWS')
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

    if (!observations.length) {
      throw new ApiError(502, `${sourceLabel} returned no usable spectral images for that field.`, 'NO_ROWS')
    }

    const data: IrsaFind = {
      source: { label: sourceLabel, url: IRSA, query: `${sourceCollection} · POS circle · MAXREC 300` },
      field: { ra, dec, fov },
      observations,
      summary: summarizeObservations(observations),
    }
    searchCache.set(cacheKey, data)
    rememberLastGood(cacheKey, data)
    siaCooldowns.delete(cacheKey)
    siaUnavailableUntil = 0
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
  await assertUpstreamOk(response, 'Archive cutout service')
  const buffer = await readArrayBufferLimited(response, MAX_CUTOUT_BYTES)
  if (buffer.byteLength < BLOCK) {
    throw new ApiError(502, 'The archive returned an empty cutout.', 'BAD_UPSTREAM_RESPONSE')
  }
  const head = decoder.decode(new Uint8Array(buffer, 0, 6))
  if (head !== 'SIMPLE') {
    throw new ApiError(502, 'The archive returned a non-FITS cutout.', 'BAD_UPSTREAM_RESPONSE')
  }
  try {
    return stripEpsf(buffer)
  } catch {
    throw new ApiError(502, 'The archive returned a malformed FITS cutout.', 'BAD_UPSTREAM_RESPONSE')
  }
}

function readCutoutCache(key: string) {
  const entry = cutoutCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.at > CUTOUT_CACHE_TTL_MS) {
    cutoutCache.delete(key)
    cutoutCacheBytes -= entry.bytes
    return null
  }
  return { buffer: entry.buffer, source: entry.source }
}

function storeCutoutCache(key: string, buffer: ArrayBuffer, source: string) {
  const bytes = buffer.byteLength
  const previous = cutoutCache.get(key)
  if (previous) {
    cutoutCache.delete(key)
    cutoutCacheBytes -= previous.bytes
  }
  if (bytes > CUTOUT_CACHE_MAX_BYTES) return
  while (cutoutCacheBytes + bytes > CUTOUT_CACHE_MAX_BYTES && cutoutCache.size) {
    const oldest = cutoutCache.keys().next()
    if (oldest.done) break
    const entry = cutoutCache.get(oldest.value)
    if (entry) cutoutCacheBytes -= entry.bytes
    cutoutCache.delete(oldest.value)
  }
  cutoutCache.set(key, { buffer, source, at: Date.now(), bytes })
  cutoutCacheBytes += bytes
}

async function fetchCutoutWithFallback(uri: string, ra: number, dec: number, size: string, preferS3 = false, imageOnly = false): Promise<CutoutBuffer> {
  if (preferS3) {
    try {
      const direct = await fetchS3Cutout(uri, ra, dec, size, imageOnly)
      return { buffer: direct.buffer, source: `NASA IRSA S3 · direct ${direct.key.split('/')[0].toUpperCase()} product` }
    } catch (s3Error) {
      try {
        const buffer = await fetchCutout(uri, ra, dec, size)
        return { buffer, source: 'IRSA SPHEREx cutout service' }
      } catch (primaryError) {
        const s3Detail = s3Error instanceof Error ? s3Error.message : 'S3 product failed.'
        const primaryDetail = primaryError instanceof Error ? primaryError.message : 'Archive cutout failed.'
        throw new ApiError(
          502,
          `Both real cutout sources failed. S3: ${s3Detail} Archive: ${primaryDetail}`,
          'UPSTREAM_UNAVAILABLE',
        )
      }
    }
  }

  let primaryError: unknown = null
  if (Date.now() >= cutoutPrimaryUnavailableUntil) {
    try {
      const buffer = await fetchCutout(uri, ra, dec, size)
      cutoutPrimaryUnavailableUntil = 0
      return { buffer, source: 'IRSA SPHEREx cutout service' }
    } catch (error) {
      primaryError = error
      if (error instanceof ApiError && error.status >= 500) {
        cutoutPrimaryUnavailableUntil = Date.now() + CUTOUT_PRIMARY_COOLDOWN_MS
      }
    }
  } else {
    primaryError = new Error('The archive cutout service is cooling down after a failed request.')
  }

  try {
    const direct = await fetchS3Cutout(uri, ra, dec, size, imageOnly)
    return { buffer: direct.buffer, source: `NASA IRSA S3 · direct ${direct.key.split('/')[0].toUpperCase()} product` }
  } catch (s3Error) {
    const primaryDetail = primaryError instanceof Error ? primaryError.message : 'Archive cutout failed.'
    const s3Detail = s3Error instanceof Error ? s3Error.message : 'S3 product failed.'
    throw new ApiError(
      502,
      `Both real cutout sources failed. Archive: ${primaryDetail} S3: ${s3Detail}`,
      'UPSTREAM_UNAVAILABLE',
    )
  }
}

async function getCutoutBuffer(uri: string, ra: number, dec: number, size: string, preferS3 = false, imageOnly = false) {
  const key = `${uri}|${ra.toFixed(6)}|${dec.toFixed(6)}|${size}|${preferS3 ? 's3' : 'auto'}|${imageOnly ? 'image' : 'full'}`
  const cached = readCutoutCache(key)
  if (cached) return { ...cached, cached: true }
  const result = await cutoutFlights.run(key, async () => {
    const fresh = await fetchCutoutWithFallback(uri, ra, dec, size, preferS3, imageOnly)
    storeCutoutCache(key, fresh.buffer, fresh.source)
    return fresh
  })
  return { ...result, cached: false }
}

export async function getCutout(uri: string, ra: number, dec: number, fov: number, sizeOverride?: string, preferS3 = false, imageOnly = false) {
  const safeUri = validateIrsaProductUri(uri)
  if (!finite(ra) || ra < 0 || ra > 360 || !finite(dec) || dec < -90 || dec > 90) {
    throw new ApiError(400, 'Invalid cutout center.', 'OUT_OF_RANGE')
  }
  const size = clamp(fov, 0.02, 0.9).toFixed(3)
  const result = await getCutoutBuffer(safeUri, ra, dec, sizeOverride ?? `${size}d`, preferS3, imageOnly)
  return {
    buffer: result.buffer,
    size: Number(size),
    sizeLabel: sizeOverride ?? `${size}d`,
    uri: safeUri,
    source: result.source,
    cached: result.cached,
  }
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
  varianceStats: ReturnType<typeof imageStats>
  zodiStats: ReturnType<typeof imageStats>
  pixelScale: number | null
  center: { ra: number; dec: number } | null
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
  const image = hduByName(fits, 'IMAGE') ?? fits.hdus[0]
  const variance = hduByName(fits, 'VARIANCE')
  const zodi = hduByName(fits, 'ZODI')
  const flags = hduByName(fits, 'FLAGS')
  const header = image?.header
  const exposure = header ? numberValue(header, 'EXPTIME', Number.NaN) : Number.NaN
  const scale = image ? pixelScale(image) : Number.NaN
  const center = image ? skyAt(image, (image.width - 1) / 2, (image.height - 1) / 2) : null
  return {
    width: image?.width ?? 0,
    height: image?.height ?? 0,
    depth: image?.depth ?? 0,
    bitPix: image?.bitPix ?? 0,
    stats: image ? imageStats(readImage(buffer, image)) : null,
    varianceStats: variance ? imageStats(readImage(buffer, variance)) : null,
    zodiStats: zodi ? imageStats(readImage(buffer, zodi)) : null,
    pixelScale: Number.isFinite(scale) ? scale : null,
    center,
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

export async function getSpectrum(uri: string, ra: number, dec: number, preferS3 = true): Promise<SpectrumSegment> {
  const safeUri = validateIrsaProductUri(uri)
  if (!finite(ra) || ra < 0 || ra > 360 || !finite(dec) || dec < -90 || dec > 90) {
    throw new ApiError(400, 'Invalid spectrum center.', 'OUT_OF_RANGE')
  }
  const key = `${safeUri}|${ra.toFixed(6)}|${dec.toFixed(6)}|${preferS3 ? 's3' : 'auto'}`
  const cached = spectrumCache.get(key)
  if (cached) return cached

  return spectrumFlights.run(key, async () => {
    const { buffer, source } = await getCutoutBuffer(safeUri, ra, dec, '24,2040pix', preferS3)
    let fits: FitsFile
    try {
      fits = parseFits(buffer)
    } catch {
      throw new ApiError(502, 'The archive returned a malformed spectral FITS product.', 'BAD_UPSTREAM_RESPONSE')
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
      source,
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
  const keyCooldown = catalogCooldowns.get(cacheKey) ?? 0
  if (Date.now() < keyCooldown || Date.now() < catalogUnavailableUntil[survey]) {
    throw new ApiError(503, `${survey} TAP is cooling down after a failed request; retry shortly.`, 'UPSTREAM_BUSY')
  }

  return catalogFlights.run(cacheKey, async () => {
    try {
      const data = await queryCatalog(survey, ra, dec, radius)
      catalogCache.set(cacheKey, data)
      catalogCooldowns.delete(cacheKey)
      catalogUnavailableUntil[survey] = 0
      return data
    } catch (error) {
      rememberCooldown(catalogCooldowns, cacheKey, Date.now() + SIA_COOLDOWN_MS)
      if (isInfrastructureFailure(error)) catalogUnavailableUntil[survey] = Date.now() + UPSTREAM_COOLDOWN_MS
      throw error
    }
  })
}
