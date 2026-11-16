import {
  numberValue,
  parseFits,
  pixelScale,
  textValue,
  type FitsHeader,
  type FitsHdu,
  type FitsTable,
} from '../lib/fits'
import { ApiError, assertUpstreamOk, fetchWithRetry, readArrayBufferLimited } from './http'

const BUCKET = 'https://nasa-irsa-spherex.s3.us-east-1.amazonaws.com'
const PRODUCT_MARKER = '/ibe/data/spherex/'
const BLOCK = 2880
const CARD = 80
const RAD = Math.PI / 180
const MAX_RANGE_BYTES = 32 * 1024 * 1024
const HEADER_WINDOW = 64 * 1024
const CUTOUT_HDUS = new Set(['PRIMARY', 'IMAGE', 'VARIANCE', 'FLAGS', 'ZODI', 'WCS-WAVE'])
const encoder = new TextEncoder()

export type S3Cutout = {
  buffer: ArrayBuffer
  key: string
  url: string
}

export function s3KeyForUri(uri: string): string | null {
  let url: URL
  try {
    url = new URL(uri)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.hostname !== 'irsa.ipac.caltech.edu') return null
  const at = url.pathname.indexOf(PRODUCT_MARKER)
  if (at < 0) return null
  let key: string
  try {
    key = decodeURIComponent(url.pathname.slice(at + PRODUCT_MARKER.length))
  } catch {
    return null
  }
  if (!key || key.includes('..') || key.includes('\\') || !/^[A-Za-z0-9._/-]+\.fits$/i.test(key)) return null
  return key
}

function clamp(value: number, low: number, high: number) {
  return Math.min(high, Math.max(low, value))
}

function wrapRadians(value: number) {
  let angle = value
  while (angle > Math.PI) angle -= Math.PI * 2
  while (angle < -Math.PI) angle += Math.PI * 2
  return angle
}

function sipValue(header: FitsHeader, axis: 'A' | 'B', u: number, v: number) {
  const order = numberValue(header, `${axis}_ORDER`, 0)
  let value = 0
  for (let p = 0; p <= order; p += 1) {
    for (let q = 0; q <= order - p; q += 1) {
      value += numberValue(header, `${axis}_${p}_${q}`) * u ** p * v ** q
    }
  }
  return value
}

function skyToPixel(hdu: FitsHdu, ra: number, dec: number) {
  const header = hdu.header
  const fallback = { x: (hdu.width - 1) / 2, y: (hdu.height - 1) / 2 }
  if (!textValue(header, 'CTYPE1').startsWith('RA---TAN')) return fallback
  const crval1 = numberValue(header, 'CRVAL1', Number.NaN)
  const crval2 = numberValue(header, 'CRVAL2', Number.NaN)
  if (!Number.isFinite(crval1) || !Number.isFinite(crval2)) return fallback

  const raRad = ra * RAD
  const decRad = dec * RAD
  const dec0 = crval2 * RAD
  const delta = wrapRadians(raRad - crval1 * RAD)
  const cosc = Math.sin(dec0) * Math.sin(decRad) + Math.cos(dec0) * Math.cos(decRad) * Math.cos(delta)
  if (cosc <= 1e-10) return fallback

  const xi = (Math.cos(decRad) * Math.sin(delta)) / cosc / RAD
  const eta = (Math.cos(dec0) * Math.sin(decRad) - Math.sin(dec0) * Math.cos(decRad) * Math.cos(delta)) / cosc / RAD

  let a: number
  let b: number
  let c: number
  let d: number
  const cd11 = numberValue(header, 'CD1_1', Number.NaN)
  if (Number.isFinite(cd11)) {
    a = cd11
    b = numberValue(header, 'CD1_2')
    c = numberValue(header, 'CD2_1')
    d = numberValue(header, 'CD2_2')
  } else {
    const cdelt1 = numberValue(header, 'CDELT1', 1)
    const cdelt2 = numberValue(header, 'CDELT2', 1)
    a = numberValue(header, 'PC1_1', 1) * cdelt1
    b = numberValue(header, 'PC1_2') * cdelt2
    c = numberValue(header, 'PC2_1') * cdelt1
    d = numberValue(header, 'PC2_2', 1) * cdelt2
  }
  const determinant = a * d - b * c
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-15) return fallback

  const linearU = (d * xi - b * eta) / determinant
  const linearV = (-c * xi + a * eta) / determinant
  let u = linearU
  let v = linearV

  if (numberValue(header, 'A_ORDER') > 0 || numberValue(header, 'B_ORDER') > 0) {
    for (let iteration = 0; iteration < 12; iteration += 1) {
      const nextU = linearU - sipValue(header, 'A', u, v)
      const nextV = linearV - sipValue(header, 'B', u, v)
      if (Math.abs(nextU - u) < 1e-8 && Math.abs(nextV - v) < 1e-8) {
        u = nextU
        v = nextV
        break
      }
      u = nextU
      v = nextV
    }
  }

  const x = u + numberValue(header, 'CRPIX1', 0)
  const y = v + numberValue(header, 'CRPIX2', 0)
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : fallback
}

type PixelSize = { width: number; height: number }

function targetPixels(size: string, hdu: FitsHdu): PixelSize {
  const explicit = /^(\d+)(?:,(\d+))?pix$/i.exec(size.trim())
  if (explicit) {
    return {
      width: Math.max(1, Number(explicit[1])),
      height: Math.max(1, Number(explicit[2] ?? explicit[1])),
    }
  }

  const degrees = /^([0-9.]+)d$/i.exec(size.trim())
  if (!degrees) throw new Error(`Unsupported cutout size: ${size}`)
  const scale = pixelScale(hdu)
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('The FITS product has no usable pixel scale.')
  const side = Math.max(1, Math.round((Number(degrees[1]) * 3600) / scale))
  return { width: side, height: side }
}

function cropRect(hdu: FitsHdu, ra: number, dec: number, size: string) {
  const target = targetPixels(size, hdu)
  const width = Math.min(hdu.width, Math.max(1, target.width))
  const height = Math.min(hdu.height, Math.max(1, target.height))
  const center = skyToPixel(hdu, ra, dec)
  const x0 = clamp(Math.round(center.x - width / 2), 0, Math.max(0, hdu.width - width))
  const y0 = clamp(Math.round(center.y - height / 2), 0, Math.max(0, hdu.height - height))
  return { x0, y0, width, height }
}

function cropImageData(buffer: ArrayBuffer, hdu: FitsHdu, rect: { x0: number; y0: number; width: number; height: number }) {
  const bytesPerPixel = Math.abs(hdu.bitPix) / 8
  if (![1, 2, 4, 8].includes(bytesPerPixel)) throw new Error('Unsupported FITS pixel size.')
  const depth = Math.max(1, hdu.depth)
  const sourcePlane = hdu.width * hdu.height * bytesPerPixel
  const sourceRow = hdu.width * bytesPerPixel
  const targetRow = rect.width * bytesPerPixel
  const rawBytes = rect.width * rect.height * depth * bytesPerPixel
  const output = new Uint8Array(Math.ceil(rawBytes / BLOCK) * BLOCK)
  const source = new Uint8Array(buffer)

  for (let plane = 0; plane < depth; plane += 1) {
    for (let row = 0; row < rect.height; row += 1) {
      const sourceAt = hdu.dataStart + plane * sourcePlane + (rect.y0 + row) * sourceRow + rect.x0 * bytesPerPixel
      const targetAt = (plane * rect.height + row) * targetRow
      if (sourceAt + targetRow > hdu.dataStart + hdu.dataBytes) throw new Error('FITS crop exceeded its data block.')
      output.set(source.subarray(sourceAt, sourceAt + targetRow), targetAt)
    }
  }
  return output
}

function headerValue(value: string | number | boolean) {
  if (typeof value === 'boolean') return value ? 'T' : 'F'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '0'
  return `'${String(value).replace(/'/g, "''").slice(0, 68)}'`
}

function headerBlock(header: FitsHeader) {
  const cards: string[] = []
  for (const [key, value] of header) {
    if (!/^[A-Z0-9_-]{1,8}$/.test(key)) continue
    cards.push(`${key.padEnd(8)}= ${headerValue(value)}`.padEnd(CARD).slice(0, CARD))
  }
  cards.push('END'.padEnd(CARD))
  const text = encoder.encode(cards.join(''))
  const output = new Uint8Array(Math.ceil(text.byteLength / BLOCK) * BLOCK).fill(32)
  output.set(text)
  return output
}

function imageHeader(hdu: FitsHdu, width: number, height: number, x0: number, y0: number) {
  const header: FitsHeader = new Map()
  header.set('XTENSION', 'IMAGE')
  for (const [key, value] of hdu.header) {
    if (key === 'SIMPLE' || key === 'XTENSION' || key === 'NAXIS1' || key === 'NAXIS2' || key === 'NAXIS3') continue
    header.set(key, value)
  }
  header.set('BITPIX', hdu.bitPix)
  header.set('NAXIS', hdu.depth > 1 ? 3 : 2)
  header.set('NAXIS1', width)
  header.set('NAXIS2', height)
  if (hdu.depth > 1) header.set('NAXIS3', hdu.depth)
  header.set('PCOUNT', 0)
  header.set('GCOUNT', 1)
  header.set('CRPIX1', numberValue(hdu.header, 'CRPIX1', 0) - x0)
  header.set('CRPIX2', numberValue(hdu.header, 'CRPIX2', 0) - y0)
  header.set('CUTX0', x0)
  header.set('CUTY0', y0)
  return header
}

function tableBlock(buffer: ArrayBuffer, table: FitsTable) {
  const header: FitsHeader = new Map()
  header.set('XTENSION', 'BINTABLE')
  for (const [key, value] of table.header) {
    if (key === 'SIMPLE' || key === 'XTENSION') continue
    header.set(key, value)
  }
  header.set('BITPIX', 8)
  header.set('NAXIS', 2)
  header.set('NAXIS1', table.rowBytes)
  header.set('NAXIS2', table.rows)
  header.set('PCOUNT', numberValue(table.header, 'PCOUNT', 0))
  header.set('GCOUNT', 1)
  header.set('TFIELDS', table.columns.length)
  const head = headerBlock(header)
  const data = new Uint8Array(buffer.slice(table.dataStart, table.dataStart + table.dataBytes))
  const output = new Uint8Array(head.byteLength + data.byteLength)
  output.set(head)
  output.set(data, head.byteLength)
  return output
}

function joinChunks(chunks: Uint8Array[]) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const output = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    output.set(chunk, at)
    at += chunk.byteLength
  }
  return output.buffer
}

export function cropS3Product(buffer: ArrayBuffer, ra: number, dec: number, size: string) {
  const fits = parseFits(buffer)
  const primary: FitsHeader = new Map()
  primary.set('SIMPLE', true)
  primary.set('BITPIX', 8)
  primary.set('NAXIS', 0)
  primary.set('EXTEND', true)
  const chunks: Uint8Array[] = [headerBlock(primary)]
  let images = 0

  for (const hdu of fits.hdus) {
    const name = hdu.name.toUpperCase()
    if (name === 'EPSF' || name === 'PSF') continue
    images += 1
    const rect = cropRect(hdu, ra, dec, size)
    const data = cropImageData(buffer, hdu, rect)
    const header = imageHeader(hdu, rect.width, rect.height, rect.x0, rect.y0)
    chunks.push(headerBlock(header), data)
  }

  if (!images) throw new Error('The S3 product has no image extension to crop.')

  for (const table of fits.tables) {
    if (table.name.toUpperCase() !== 'WCS-WAVE') continue
    chunks.push(tableBlock(buffer, table))
  }

  return joinChunks(chunks)
}

async function s3Head(url: string) {
  const response = await fetchWithRetry(
    url,
    { method: 'HEAD', headers: { Accept: 'application/fits' } },
    { attempts: 2, timeoutMs: 15_000, totalTimeoutMs: 30_000 },
  )
  await assertUpstreamOk(response, 'NASA IRSA S3 object')
  const size = Number(response.headers.get('content-length'))
  if (!Number.isInteger(size) || size < BLOCK) throw new Error('S3 object has no usable Content-Length.')
  return size
}

async function s3Range(url: string, start: number, end: number) {
  const response = await fetchWithRetry(
    url,
    { headers: { Accept: 'application/fits', Range: `bytes=${start}-${end}` } },
    { attempts: 2, timeoutMs: 20_000, totalTimeoutMs: 45_000 },
  )
  if (!response.ok) await assertUpstreamOk(response, 'NASA IRSA S3 range')
  if (response.status !== 206) throw new Error(`S3 ignored byte-range request (HTTP ${response.status}).`)
  const buffer = await readArrayBufferLimited(response, MAX_RANGE_BYTES, 45_000)
  if (!buffer.byteLength) throw new Error('S3 returned an empty byte range.')
  return buffer
}

function headerFromPrefix(buffer: ArrayBuffer) {
  const header: Record<string, string> = {}
  let cursor = 0
  let ended = false
  while (!ended && cursor + BLOCK <= buffer.byteLength) {
    const block = new TextDecoder('ascii').decode(new Uint8Array(buffer, cursor, BLOCK))
    for (let at = 0; at < BLOCK; at += CARD) {
      const card = block.slice(at, at + CARD)
      const key = card.slice(0, 8).trim()
      if (key === 'END') { ended = true; break }
      if (!key || key === 'COMMENT' || key === 'HISTORY') continue
      const equals = card.indexOf('=')
      if (equals < 0) continue
      const raw = card.slice(equals + 1).trim()
      const quote = raw.indexOf("'")
      if (quote === 0) {
        let value = ''
        for (let index = 1; index < raw.length; index += 1) {
          if (raw[index] === "'") {
            if (raw[index + 1] === "'") { value += "'"; index += 1; continue }
            break
          }
          value += raw[index]
        }
        header[key] = value.trim()
      } else {
        header[key] = raw.split('/')[0].trim()
      }
    }
    cursor += BLOCK
  }
  if (!ended) throw new Error('FITS header exceeds the range window.')
  return { header, headerBytes: cursor }
}

function dataBlockBytes(header: Record<string, string>) {
  const naxis = Number(header.NAXIS ?? 0)
  if (!Number.isInteger(naxis) || naxis < 0) throw new Error('Invalid FITS NAXIS.')
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
  const bytes = (Math.abs(bitPix) / 8) * groups * (parameters + pixels)
  if (!Number.isFinite(bytes) || bytes < 0) throw new Error('Invalid FITS data size.')
  return Math.ceil(bytes / BLOCK) * BLOCK
}

type S3Layout = {
  offset: number
  headerBytes: number
  dataBytes: number
  name: string
  header: Record<string, string>
}

async function s3Layouts(url: string) {
  const size = await s3Head(url)
  const layouts: S3Layout[] = []
  let at = 0
  while (at + BLOCK <= size && layouts.length < 64) {
    const header = await s3Range(url, at, Math.min(size - 1, at + HEADER_WINDOW - 1))
    const parsed = headerFromPrefix(header)
    const name = parsed.header.EXTNAME || (layouts.length === 0 ? 'PRIMARY' : `HDU ${layouts.length}`)
    const dataBytes = dataBlockBytes(parsed.header)
    layouts.push({ offset: at, headerBytes: parsed.headerBytes, dataBytes, name: name.toUpperCase(), header: parsed.header })
    const next = at + parsed.headerBytes + dataBytes
    if (next <= at) throw new Error('FITS HDU layout did not advance.')
    at = next
  }
  return layouts
}

async function fetchS3WaveTableTail(url: string) {
  const size = await s3Head(url)
  const window = Math.min(size, 65_536)
  if (window < BLOCK) return null
  const tail = new Uint8Array(await s3Range(url, size - window, size - 1))
  const ascii = new TextDecoder('latin1').decode(tail)
  let cursor = ascii.length
  while (cursor > 0) {
    const at = ascii.lastIndexOf('XTENSION', cursor - 1)
    if (at < 0 || (size - window + at) % BLOCK !== 0) {
      if (at < 0) break
      cursor = at
      continue
    }
    try {
      const parsed = headerFromPrefix(tail.slice(at).buffer)
      const name = (parsed.header.EXTNAME || '').toUpperCase()
      if (name.includes('WCS')) {
        const length = parsed.headerBytes + dataBlockBytes(parsed.header)
        if (at + length <= tail.length) return tail.slice(at, at + length)
        return new Uint8Array(await s3Range(url, size - window + at, size - window + at + length - 1))
      }
    } catch {
    }
    cursor = at
  }
  return null
}

function numericHeader(layout: S3Layout): FitsHeader {
  const header: FitsHeader = new Map()
  for (const [key, value] of Object.entries(layout.header)) {
    const numeric = Number(value)
    header.set(key, value !== '' && Number.isFinite(numeric) ? numeric : value)
  }
  return header
}

const coverageCache = new Map<string, { covers: boolean; at: number }>()
const COVERAGE_TTL_MS = 10 * 60_000

/**
 * Check a real level-2 image footprint before the S3 fallback is allowed to
 * return it. The S3 index radius is deliberately loose, so a candidate can be
 * several degrees away; cropping that frame would silently clamp to an edge
 * and show unrelated sky as if it were the requested patch. If the footprint
 * cannot be verified, the frame is rejected rather than risk showing an
 * edge-clamped crop of unrelated sky.
 */
export async function s3ProductCovers(uri: string, ra: number, dec: number): Promise<boolean> {
  const key = s3KeyForUri(uri)
  if (!key) return false
  const cacheKey = `${key}|${ra.toFixed(5)}|${dec.toFixed(5)}`
  const cached = coverageCache.get(cacheKey)
  if (cached && Date.now() - cached.at < COVERAGE_TTL_MS) return cached.covers

  let covers = false
  try {
    const layouts = await s3Layouts(`${BUCKET}/${key}`)
    const image = layouts.find((layout) => layout.name === 'IMAGE')
    const width = Number(image?.header.NAXIS1)
    const height = Number(image?.header.NAXIS2)
    if (image && Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0) {
      const header = numericHeader(image)
      if (String(header.get('CTYPE1') ?? '').startsWith('RA---TAN')) {
        const hdu: FitsHdu = {
          index: 0,
          name: image.name,
          width,
          height,
          depth: 1,
          bitPix: Number(image.header.BITPIX ?? 0),
          dataStart: 0,
          dataBytes: 0,
          header,
        }
        const point = skyToPixel(hdu, ra, dec)
        covers = Number.isFinite(point.x) && Number.isFinite(point.y)
          && point.x >= 1 && point.x <= width - 2 && point.y >= 1 && point.y <= height - 2
      }
    }
  } catch {
    covers = false
  }

  if (coverageCache.size >= 512) {
    const oldest = coverageCache.keys().next()
    if (!oldest.done) coverageCache.delete(oldest.value)
  }
  coverageCache.set(cacheKey, { covers, at: Date.now() })
  return covers
}

async function fetchS3Cropped(url: string, ra: number, dec: number, size: string, imageOnly: boolean) {
  const layouts = await s3Layouts(url)
  const selected = layouts.filter((layout) => layout.name === 'IMAGE' || (!imageOnly && CUTOUT_HDUS.has(layout.name) && (layout.header.XTENSION || '').toUpperCase() === 'IMAGE'))
  if (!selected.length) throw new Error('The S3 product has no cutout HDUs.')

  const primary: FitsHeader = new Map()
  primary.set('SIMPLE', true)
  primary.set('BITPIX', 8)
  primary.set('NAXIS', 0)
  primary.set('EXTEND', true)

  const images = await Promise.all(selected.map(async (layout) => {
    const width = Number(layout.header.NAXIS1)
    const height = Number(layout.header.NAXIS2)
    const depth = Number(layout.header.NAXIS3 ?? 1)
    const bitPix = Number(layout.header.BITPIX)
    const bytesPerPixel = Math.abs(bitPix) / 8
    if (!Number.isInteger(width) || !Number.isInteger(height) || depth !== 1 || ![1, 2, 4, 8].includes(bytesPerPixel)) {
      throw new Error('The S3 image layout is not a single 2D plane.')
    }
    const header = numericHeader(layout)
    const hdu: FitsHdu = { index: 0, name: layout.name, width, height, depth, bitPix, dataStart: 0, dataBytes: 0, header }
    const rect = cropRect(hdu, ra, dec, size)
    const rowBytes = width * bytesPerPixel
    const start = layout.offset + layout.headerBytes + rect.y0 * rowBytes
    const band = await s3Range(url, start, start + rect.height * rowBytes - 1)
    const bandHdu: FitsHdu = { ...hdu, dataStart: 0, dataBytes: band.byteLength }
    const data = cropImageData(band, bandHdu, { ...rect, y0: 0 })
    return [headerBlock(imageHeader(hdu, rect.width, rect.height, rect.x0, rect.y0)), data]
  }))
  const waveTable = await fetchS3WaveTableTail(url)

  const chunks: Uint8Array[] = [headerBlock(primary)]
  for (const image of images) chunks.push(...image)
  if (waveTable) chunks.push(waveTable)
  return joinChunks(chunks)
}

async function fetchS3SelectedHdus(url: string, imageOnly = false) {
  const layouts = await s3Layouts(url)

  const selected = layouts.filter((layout) => layout.name === 'PRIMARY' || layout.name === 'IMAGE' || (!imageOnly && CUTOUT_HDUS.has(layout.name)))
  if (!selected.length) throw new Error('The S3 product has no cutout HDUs.')

  const chunks = await Promise.all(selected.map(async (layout) => {
    const length = layout.headerBytes + layout.dataBytes
    if (length < BLOCK) return new Uint8Array()
    return new Uint8Array(await s3Range(url, layout.offset, layout.offset + length - 1))
  }))
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0))
  let offset = 0
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength }
  return output.buffer
}

const HIPS_PREFIX = 'dr1/hips5_cube/hips_20261026/Norder5'
const HIPS_ORDER = 5
const HIPS_FRAMES = 102
const HIPS_CACHE_TTL_MS = 15 * 60_000
const hipsCache = new Map<string, { buffer: ArrayBuffer; width: number; height: number; key: string; url: string; at: number }>()

export type S3HipsPlane = {
  buffer: ArrayBuffer
  width: number
  height: number
  key: string
  url: string
}

export async function fetchS3HipsPlane(pixel: number, frame: number): Promise<S3HipsPlane> {
  if (!Number.isInteger(pixel) || pixel < 0 || pixel >= 12 * 4 ** HIPS_ORDER) {
    throw new ApiError(400, 'HiPS pixel is outside Norder 5.', 'OUT_OF_RANGE')
  }
  if (!Number.isInteger(frame) || frame < 0 || frame >= HIPS_FRAMES) {
    throw new ApiError(400, `HiPS frame must be 0..${HIPS_FRAMES - 1}.`, 'OUT_OF_RANGE')
  }

  const cacheKey = `${pixel}:${frame}`
  const cached = hipsCache.get(cacheKey)
  if (cached && Date.now() - cached.at < HIPS_CACHE_TTL_MS) return cached

  const directory = Math.floor(pixel / 10_000) * 10_000
  const key = `${HIPS_PREFIX}/Dir${directory}/Npix${pixel}_cube.fits`
  const url = `${BUCKET}/${key}`
  const primaryHeader = await s3Range(url, 0, HEADER_WINDOW - 1)
  const primary = headerFromPrefix(primaryHeader)
  const extensionOffset = Math.ceil(primary.headerBytes / BLOCK) * BLOCK
  const extensionHeader = await s3Range(url, extensionOffset, extensionOffset + HEADER_WINDOW - 1)
  const parsed = headerFromPrefix(extensionHeader)
  const width = Number(parsed.header.NAXIS1)
  const height = Number(parsed.header.NAXIS2)
  const planes = Number(parsed.header.NAXIS3 ?? 1)
  const bitPix = Number(parsed.header.BITPIX)
  if (!Number.isInteger(width) || !Number.isInteger(height) || ![ -32, -64 ].includes(bitPix)) {
    throw new Error('The S3 HiPS cube has an unsupported image layout.')
  }
  if (!Number.isInteger(planes) || frame >= planes) {
    throw new ApiError(400, 'That spectral frame is outside this HiPS cube.', 'OUT_OF_RANGE')
  }
  const planeBytes = width * height * (Math.abs(bitPix) / 8)
  if (planeBytes < BLOCK || planeBytes > MAX_RANGE_BYTES) throw new Error('The S3 HiPS plane is too large.')
  const start = extensionOffset + parsed.headerBytes + frame * planeBytes
  const plane = await s3Range(url, start, start + planeBytes - 1)

  const imageHeader: FitsHeader = new Map()
  imageHeader.set('SIMPLE', true)
  imageHeader.set('BITPIX', bitPix)
  imageHeader.set('NAXIS', 2)
  imageHeader.set('NAXIS1', width)
  imageHeader.set('NAXIS2', height)
  imageHeader.set('EXTEND', true)
  imageHeader.set('EXTNAME', 'IMAGE')
  imageHeader.set('BUNIT', parsed.header.BUNIT || 'MJy/sr')
  imageHeader.set('CTYPE1', 'RA---HPX')
  imageHeader.set('CTYPE2', 'DEC--HPX')
  imageHeader.set('ORDER', HIPS_ORDER)
  imageHeader.set('NPIX', pixel)
  const head = headerBlock(imageHeader)
  const output = new Uint8Array(head.byteLength + Math.ceil(plane.byteLength / BLOCK) * BLOCK)
  output.set(head)
  output.set(new Uint8Array(plane), head.byteLength)

  const result = { buffer: output.buffer, width, height, key, url }
  if (hipsCache.size >= 24) {
    const oldest = hipsCache.keys().next()
    if (!oldest.done) hipsCache.delete(oldest.value)
  }
  hipsCache.set(cacheKey, { ...result, at: Date.now() })
  return result
}

export async function fetchS3Cutout(uri: string, ra: number, dec: number, size: string, imageOnly = false): Promise<S3Cutout> {
  const key = s3KeyForUri(uri)
  if (!key) throw new ApiError(400, 'That product is not addressable through the public S3 bucket.', 'INVALID_URI')
  const url = `${BUCKET}/${key}`
  try {
    try {
      return { buffer: await fetchS3Cropped(url, ra, dec, size, imageOnly), key, url }
    } catch {
    }
    const buffer = await fetchS3SelectedHdus(url, imageOnly)
    return { buffer: cropS3Product(buffer, ra, dec, size), key, url }
  } catch (error) {
    throw new ApiError(502, `The S3 FITS product could not be read with byte ranges: ${error instanceof Error ? error.message : 'unknown error'}`, 'BAD_UPSTREAM_RESPONSE')
  }
}
