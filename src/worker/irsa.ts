import { imageStats, numberValue, parseFits, readImage, textValue, waveAt, type FitsFile, type FitsHdu } from '../lib/fits'

const IRSA = 'https://irsa.ipac.caltech.edu'
const TAP = `${IRSA}/TAP/sync`
const GAIA_TAP = 'https://gea.esac.esa.int/tap-server/tap/sync'
const BLOCK = 2880
const CARD = 80
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

export type IrsaFind = {
  source: {
    label: string
    url: string
    query: string
  }
  field: { ra: number; dec: number; fov: number }
  observations: IrsaObservation[]
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

function mjdIso(mjd: number) {
  const date = new Date((mjd - 40587) * 86400000)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().replace('.000Z', 'Z')
}

function parseCsv(text: string) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  if (lines.length < 2 || /^</.test(lines[0])) return []
  const headers = lines[0].split(',').map((value) => value.trim())
  return lines.slice(1).map((line) => {
    const values = line.split(',')
    const row: Record<string, string> = {}
    headers.forEach((header, index) => {
      row[header] = (values[index] ?? '').trim()
    })
    return row
  })
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

const searchCache = new Map<string, { at: number; data: IrsaFind }>()

export async function findSpherex(ra: number, dec: number, fov: number): Promise<IrsaFind> {
  const cacheKey = `${ra.toFixed(4)}|${dec.toFixed(4)}|${fov.toFixed(2)}`
  const cached = searchCache.get(cacheKey)
  if (cached && Date.now() - cached.at < 300_000) return cached.data

  const radius = clamp(fov / 2, 0.05, 0.8)
  const params = new URLSearchParams({
    COLLECTION: 'spherex_dr1',
    POS: `circle ${ra} ${dec} ${radius}`,
    RESPONSEFORMAT: 'CSV',
    MAXREC: '300',
  })
  const url = `${IRSA}/SIA?${params.toString()}`
  const response = await fetch(url, { signal: AbortSignal.timeout(50_000) })
  if (!response.ok) throw new Error(`IRSA SIA2 returned ${response.status}.`)
  const rows = parseCsv(await response.text())
  const byTime = new Map<string, IrsaObservation>()

  for (const row of rows) {
    const uri = row.access_url
    const time = Number(row.t_min)
    const band = row.energy_bandpassname
    if (!uri || !finite(time) || !band) continue
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
    source: { label: 'IRSA SIA2 · SPHEREx DR1', url: IRSA, query: 'spherex_dr1 · POS circle' },
    field: { ra, dec, fov },
    observations,
  }
  searchCache.set(cacheKey, { at: Date.now(), data })
  return data
}

function headerMap(buffer: ArrayBuffer, offset: number) {
  const header: Record<string, string> = {}
  let cursor = offset
  let ended = false
  while (!ended) {
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
      header[card.slice(0, equals).trim()] = card.slice(equals + 1).trim()
    }
    cursor += BLOCK
  }
  return { header, dataStart: cursor }
}

function hduBytes(header: Record<string, string>) {
  const naxis = Number(header.NAXIS) || 0
  if (!naxis) return 0
  let pixels = 1
  for (let axis = 1; axis <= naxis; axis += 1) pixels *= Number(header[`NAXIS${axis}`]) || 0
  const bitPix = Math.abs(Number(header.BITPIX) || 8)
  const groups = Number(header.GCOUNT) || 1
  const parameters = Number(header.PCOUNT) || 0
  return Math.ceil(((bitPix / 8) * pixels * groups + parameters) / BLOCK) * BLOCK
}

export function stripEpsf(buffer: ArrayBuffer) {
  const chunks: Uint8Array[] = []
  let total = 0
  let at = 0
  while (at + BLOCK <= buffer.byteLength) {
    const { header, dataStart } = headerMap(buffer, at)
    const bytes = hduBytes(header)
    const end = dataStart + bytes
    if (end > buffer.byteLength) throw new Error('Truncated FITS data.')
    if ((header.EXTNAME ?? '').toUpperCase() !== 'EPSF') {
      const chunk = new Uint8Array(buffer.slice(at, end))
      chunks.push(chunk)
      total += chunk.byteLength
    }
    at = end
  }
  const output = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output.buffer
}

function cutoutUrl(uri: string, ra: number, dec: number, size: string) {
  const url = new URL(uri)
  if (url.protocol !== 'https:' || url.hostname !== 'irsa.ipac.caltech.edu') throw new Error('That source is not an IRSA URL.')
  if (!url.pathname.startsWith('/ibe/data/spherex/')) throw new Error('That source is not a SPHEREx product.')
  url.searchParams.set('center', `${ra},${dec}`)
  url.searchParams.set('size', size)
  url.searchParams.set('gzip', 'false')
  return url.toString()
}

async function fetchCutout(uri: string, ra: number, dec: number, size: string) {
  const target = cutoutUrl(uri, ra, dec, size)
  let last = ''
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 1800))
    try {
      const response = await fetch(target, { signal: AbortSignal.timeout(70_000) })
      if (!response.ok) {
        last = `IRSA cutout returned ${response.status}.`
        continue
      }
      const buffer = await response.arrayBuffer()
      if (buffer.byteLength < BLOCK) {
        last = 'IRSA returned an empty cutout.'
        continue
      }
      const head = decoder.decode(new Uint8Array(buffer, 0, 6))
      if (head !== 'SIMPLE') {
        last = decoder.decode(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 240))).trim()
        continue
      }
      return stripEpsf(buffer)
    } catch (error) {
      last = error instanceof Error ? error.message : 'IRSA cutout failed.'
    }
  }
  throw new Error(last || 'IRSA cutout failed.')
}

export async function getCutout(uri: string, ra: number, dec: number, fov: number) {
  const size = clamp(fov, 0.02, 0.9).toFixed(3)
  const buffer = await fetchCutout(uri, ra, dec, `${size}d`)
  return { buffer, size: Number(size), uri }
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
  stats: ReturnType<typeof imageStats>
  flags: Array<{ bit: number; count: number }>
  wave: { min: number; max: number; minBandwidth: number; maxBandwidth: number } | null
}

export function summarizeCutout(buffer: ArrayBuffer): CutoutSummary {
  const fits = parseFits(buffer)
  const image = fits.hdus[0]
  const flags = hduByName(fits, 'FLAGS')
  return {
    width: image?.width ?? 0,
    height: image?.height ?? 0,
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
  const buffer = await fetchCutout(uri, ra, dec, '24,2040pix')
  const fits = parseFits(buffer)
  const image = hduByName(fits, 'IMAGE')
  const variance = hduByName(fits, 'VARIANCE')
  const flags = hduByName(fits, 'FLAGS')
  if (!image || !fits.wave) throw new Error('That cutout has no IMAGE or WCS-WAVE extension.')

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
    let count = 0
    let flag = 0
    for (let x = lowX; x <= highX; x += 1) {
      const value = flux[y * image.width + x]
      if (!finite(value)) continue
      sum += value
      if (noise) {
        const varianceValue = noise[y * image.width + x]
        if (finite(varianceValue)) sumVariance += varianceValue
      }
      if (mask) flag |= mask[y * image.width + x] | 0
      count += 1
    }
    if (!count) continue
    points.push({
      lambda: wavelength,
      bandwidth,
      flux: sum / count,
      variance: noise ? sumVariance / (count * count) : Number.NaN,
      flag,
    })
  }

  if (!points.length) throw new Error('No finite spectral samples were found.')
  const finitePoints = points.filter((point) => finite(point.flux))
  const flagged = finitePoints.filter((point) => point.flag !== 0).length
  return {
    detector: textValue(image.header, 'DETECTOR'),
    band: textValue(image.header, 'BAND', ''),
    uri,
    points: finitePoints,
    minLambda: Math.min(...finitePoints.map((point) => point.lambda)),
    maxLambda: Math.max(...finitePoints.map((point) => point.lambda)),
    flagged,
  }
}

export async function getCatalog(survey: 'gaia' | 'wise', ra: number, dec: number, radius: number) {
  const r = clamp(radius, 0.02, 2)
  const query =
    survey === 'gaia'
      ? [
          'SELECT TOP 500 ra, dec, phot_g_mean_mag, pmra, pmdec',
          'FROM gaiadr3.gaia_source',
          `WHERE 1 = CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', ${ra}, ${dec}, ${r}))`,
        ].join(' ')
      : [
          'SELECT TOP 500 ra, dec, w1mpro, w2mpro',
          'FROM allwise_p3as_psd',
          `WHERE 1 = CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', ${ra}, ${dec}, ${r}))`,
        ].join(' ')

  const endpoint = survey === 'gaia' ? GAIA_TAP : TAP
  const params = new URLSearchParams({ QUERY: query, RESPONSEFORMAT: 'CSV' })
  if (survey === 'gaia') params.set('LANG', 'ADQL')
  const response = await fetch(`${endpoint}?${params.toString()}`, {
    headers: { Accept: 'text/csv' },
    signal: AbortSignal.timeout(45_000),
  })
  if (!response.ok) throw new Error(`${survey} TAP returned ${response.status}.`)
  const rows = parseCsv(await response.text())
  const sources: CatalogSource[] = []
  for (const row of rows) {
    const sourceRa = Number(row.ra)
    const sourceDec = Number(row.dec)
    if (!finite(sourceRa) || !finite(sourceDec)) continue
    const mag = Number(survey === 'gaia' ? row.phot_g_mean_mag : row.w1mpro)
    sources.push({
      ra: sourceRa,
      dec: sourceDec,
      mag: finite(mag) ? mag : null,
      pmra: survey === 'gaia' && finite(Number(row.pmra)) ? Number(row.pmra) : null,
      pmdec: survey === 'gaia' && finite(Number(row.pmdec)) ? Number(row.pmdec) : null,
    })
  }
  return {
    survey,
    source: {
      label: survey === 'gaia' ? 'Gaia DR3 · ESA Gaia Archive TAP' : 'AllWISE · IRSA TAP',
      url: survey === 'gaia' ? 'https://gea.esac.esa.int/archive/' : IRSA,
    },
    count: sources.length,
    sources,
  }
}
