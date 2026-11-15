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

  // SIP is defined around CRPIX. A few fixed-point passes solve
  // u + A(u, v) = linearU and v + B(u, v) = linearV. Keep the linear
  // coordinates fixed; subtracting from the running coordinates instead
  // would walk away from the solution.
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

/**
 * Crop a full SPHEREx MEF product directly from S3. The archive cutout
 * service is the primary source; this path exists so a real S3 product can
 * still be served when the IRSA HTTP service is unavailable.
 */
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

async function fetchS3SelectedHdus(url: string) {
  const size = await s3Head(url)
  const layouts: Array<{ offset: number; headerBytes: number; dataBytes: number; name: string }> = []
  let at = 0
  while (at + BLOCK <= size && layouts.length < 64) {
    const header = await s3Range(url, at, Math.min(size - 1, at + HEADER_WINDOW - 1))
    const parsed = headerFromPrefix(header)
    const name = parsed.header.EXTNAME || (layouts.length === 0 ? 'PRIMARY' : `HDU ${layouts.length}`)
    const dataBytes = dataBlockBytes(parsed.header)
    layouts.push({ offset: at, headerBytes: parsed.headerBytes, dataBytes, name: name.toUpperCase() })
    const next = at + parsed.headerBytes + dataBytes
    if (next <= at) throw new Error('FITS HDU layout did not advance.')
    at = next
  }

  const chunks: Uint8Array[] = []
  let total = 0
  for (const layout of layouts) {
    if (layout.name !== 'PRIMARY' && !CUTOUT_HDUS.has(layout.name)) continue
    const length = layout.headerBytes + layout.dataBytes
    if (length < BLOCK) continue
    const bytes = await s3Range(url, layout.offset, layout.offset + length - 1)
    const chunk = new Uint8Array(bytes)
    chunks.push(chunk)
    total += chunk.byteLength
  }
  if (!chunks.length) throw new Error('The S3 product has no cutout HDUs.')
  const output = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength }
  return output.buffer
}

export async function fetchS3Cutout(uri: string, ra: number, dec: number, size: string): Promise<S3Cutout> {
  const key = s3KeyForUri(uri)
  if (!key) throw new ApiError(400, 'That product is not addressable through the public S3 bucket.', 'INVALID_URI')
  const url = `${BUCKET}/${key}`
  try {
    const buffer = await fetchS3SelectedHdus(url)
    return { buffer: cropS3Product(buffer, ra, dec, size), key, url }
  } catch (error) {
    throw new ApiError(502, `The S3 FITS product could not be read with byte ranges: ${error instanceof Error ? error.message : 'unknown error'}`, 'BAD_UPSTREAM_RESPONSE')
  }
}
