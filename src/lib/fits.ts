export type FitsValue = string | number | boolean
export type FitsHeader = Map<string, FitsValue>

export type FitsHdu = {
  index: number
  name: string
  width: number
  height: number
  depth: number
  bitPix: number
  dataStart: number
  dataBytes: number
  header: FitsHeader
}

export type FitsColumn = {
  name: string
  format: string
  code: string
  count: number
  size: number
  offset: number
  unit: string
  dims: string
}

export type FitsTable = {
  index: number
  name: string
  rows: number
  rowBytes: number
  dataStart: number
  dataBytes: number
  columns: FitsColumn[]
  header: FitsHeader
}

export type WaveTable = {
  table: FitsTable
  xs: number[]
  ys: number[]
  wavelengths: number[]
  bandwidths: number[]
  minWavelength: number
  maxWavelength: number
  minBandwidth: number
  maxBandwidth: number
}

export type FitsFile = {
  primary: FitsHeader
  hdus: FitsHdu[]
  tables: FitsTable[]
  wave: WaveTable | null
  totalHdus: number
}

export type FitsStats = {
  min: number
  max: number
  low: number
  high: number
  median: number
  mean: number
}

export type Stretch = 'linear' | 'asinh' | 'log'

const BLOCK = 2880
const CARD = 80
const RAD = Math.PI / 180
const decoder = new TextDecoder('ascii')

function pad(bytes: number) {
  return Math.ceil(bytes / BLOCK) * BLOCK
}

function parseValue(text: string) {
  let value = text.trim()
  if (!value) return undefined

  if (value[0] === "'") {
    let string = ''
    for (let i = 1; i < value.length; i += 1) {
      if (value[i] === "'") {
        if (value[i + 1] === "'") {
          string += "'"
          i += 1
        } else {
          break
        }
      } else {
        string += value[i]
      }
    }
    return string.trim()
  }

  const slash = value.indexOf('/')
  if (slash >= 0) value = value.slice(0, slash).trim()
  if (value === 'T') return true
  if (value === 'F') return false
  const number = Number(value.replace(/D([+-]?\d+)$/i, 'E$1'))
  return Number.isFinite(number) ? number : value
}

function readHeader(buffer: ArrayBuffer, offset: number) {
  const header: FitsHeader = new Map()
  let cursor = offset
  let ended = false

  while (!ended) {
    if (cursor + BLOCK > buffer.byteLength) throw new Error('The FITS header is incomplete.')
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
      const name = card.slice(0, equals).trim()
      const value = parseValue(card.slice(equals + 1))
      if (value !== undefined) header.set(name, value)
    }
    cursor += BLOCK
  }

  return { header, dataStart: cursor }
}

export function numberValue(header: FitsHeader, key: string, fallback = 0) {
  const value = header.get(key)
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function textValue(header: FitsHeader, key: string, fallback = '') {
  const value = header.get(key)
  return value === undefined ? fallback : String(value).trim()
}

function rawBytes(header: FitsHeader) {
  const naxis = numberValue(header, 'NAXIS')
  if (!naxis) return 0
  const bitPix = numberValue(header, 'BITPIX', 8)
  let pixels = 1
  for (let axis = 1; axis <= naxis; axis += 1) pixels *= numberValue(header, `NAXIS${axis}`)
  const groups = numberValue(header, 'GCOUNT', 1)
  const parameters = numberValue(header, 'PCOUNT')
  return pad((Math.abs(bitPix) / 8) * pixels * groups + parameters)
}

function readColumns(header: FitsHeader) {
  const fields = numberValue(header, 'TFIELDS')
  const columns: FitsColumn[] = []
  let offset = 0

  for (let i = 1; i <= fields; i += 1) {
    const format = textValue(header, `TFORM${i}`).trim()
    const match = format.match(/^(\d*)([A-Z])/)
    if (!match) continue
    const count = Math.max(1, Number(match[1] || 1))
    const code = match[2]
    const size = code === 'A' ? 1 : code === 'E' || code === 'J' ? 4 : code === 'D' || code === 'K' ? 8 : code === 'I' ? 2 : 1
    columns.push({
      name: textValue(header, `TTYPE${i}`, `COLUMN ${i}`),
      format,
      code,
      count,
      size,
      offset,
      unit: textValue(header, `TUNIT${i}`),
      dims: textValue(header, `TDIM${i}`),
    })
    offset += count * size
  }

  return columns
}

function readTable(index: number, header: FitsHeader, dataStart: number, dataBytes: number): FitsTable {
  return {
    index,
    name: textValue(header, 'EXTNAME', `HDU ${index}`),
    rows: numberValue(header, 'NAXIS2'),
    rowBytes: numberValue(header, 'NAXIS1'),
    dataStart,
    dataBytes,
    columns: readColumns(header),
    header,
  }
}

function readColumn(buffer: ArrayBuffer, table: FitsTable, column: FitsColumn) {
  const values: number[] = []
  for (let row = 0; row < table.rows; row += 1) {
    for (let i = 0; i < column.count; i += 1) {
      const at = table.dataStart + row * table.rowBytes + column.offset + i * column.size
      if (at + column.size > buffer.byteLength) return values
      const view = new DataView(buffer, at, column.size)
      let value = Number.NaN
      if (column.code === 'E') value = view.getFloat32(0, false)
      else if (column.code === 'D') value = view.getFloat64(0, false)
      else if (column.code === 'J') value = view.getInt32(0, false)
      else if (column.code === 'I') value = view.getInt16(0, false)
      else if (column.code === 'K') value = Number(view.getBigInt64(0, false))
      values.push(value)
    }
  }
  return values
}

function readWave(buffer: ArrayBuffer, table: FitsTable): WaveTable | null {
  const xColumn = table.columns.find((column) => column.name.toUpperCase() === 'X')
  const yColumn = table.columns.find((column) => column.name.toUpperCase() === 'Y')
  const valueColumn = table.columns.find((column) => column.name.toUpperCase() === 'VALUES')
  if (!xColumn || !yColumn || !valueColumn) return null

  const xs = readColumn(buffer, table, xColumn)
  const ys = readColumn(buffer, table, yColumn)
  const raw = readColumn(buffer, table, valueColumn)
  if (xs.length < 2 || ys.length < 2 || raw.length < xs.length * ys.length * 2) return null

  const wavelengths: number[] = []
  const bandwidths: number[] = []
  for (let i = 0; i < xs.length * ys.length; i += 1) {
    wavelengths.push(raw[i * 2])
    bandwidths.push(raw[i * 2 + 1])
  }

  const finite = (values: number[]) => values.filter((value) => Number.isFinite(value))
  const waveValues = finite(wavelengths)
  const bandValues = finite(bandwidths)
  if (!waveValues.length || !bandValues.length) return null

  return {
    table,
    xs,
    ys,
    wavelengths,
    bandwidths,
    minWavelength: Math.min(...waveValues),
    maxWavelength: Math.max(...waveValues),
    minBandwidth: Math.min(...bandValues),
    maxBandwidth: Math.max(...bandValues),
  }
}

export function parseFits(buffer: ArrayBuffer): FitsFile {
  if (buffer.byteLength < BLOCK) throw new Error('That file is too small to be a FITS file.')

  const hdus: FitsHdu[] = []
  const tables: FitsTable[] = []
  let primary: FitsHeader = new Map()
  let wave: WaveTable | null = null
  let index = 0
  let at = 0

  while (at + BLOCK <= buffer.byteLength && index < 64) {
    const { header, dataStart } = readHeader(buffer, at)
    if (index === 0) primary = header
    const naxis = numberValue(header, 'NAXIS')
    const bitPix = numberValue(header, 'BITPIX', 8)
    const width = numberValue(header, 'NAXIS1')
    const height = numberValue(header, 'NAXIS2')
    const bytes = rawBytes(header)
    const kind = textValue(header, 'XTENSION', index === 0 ? 'PRIMARY' : '')
    const table = kind.startsWith('BINTABLE') || kind.startsWith('TABLE')

    if (bytes && dataStart + bytes > buffer.byteLength) throw new Error('The FITS data is truncated.')

    if (table) {
      const parsed = readTable(index, header, dataStart, bytes)
      tables.push(parsed)
      if (!wave && parsed.name.toUpperCase() === 'WCS-WAVE') wave = readWave(buffer, parsed)
    } else if (naxis >= 2 && width > 0 && height > 0) {
      hdus.push({
        index,
        name: textValue(header, 'EXTNAME', index === 0 ? 'PRIMARY' : `HDU ${index}`),
        width,
        height,
        depth: naxis >= 3 ? Math.max(1, numberValue(header, 'NAXIS3', 1)) : 1,
        bitPix,
        dataStart,
        dataBytes: bytes,
        header,
      })
    }

    at = dataStart + bytes
    index += 1
  }

  if (!hdus.length) throw new Error('No 2D image HDUs were found in that FITS file.')
  return { primary, hdus, tables, wave, totalHdus: index }
}

export function readImage(buffer: ArrayBuffer, hdu: FitsHdu, slice = 0) {
  const count = hdu.width * hdu.height
  const values = new Float32Array(count)
  const bytesPerPixel = Math.abs(hdu.bitPix) / 8
  const plane = Math.max(0, Math.min(Math.max(0, hdu.depth - 1), Math.floor(slice)))
  const planeBytes = count * bytesPerPixel
  const offset = plane * planeBytes
  const start = hdu.dataStart + offset
  const available = Math.max(0, Math.min(hdu.dataBytes - offset, buffer.byteLength - start))
  const view = new DataView(buffer, start, available)
  const scale = numberValue(hdu.header, 'BSCALE', 1)
  const zero = numberValue(hdu.header, 'BZERO')
  const usable = Math.min(count, Math.floor(available / bytesPerPixel))

  for (let i = 0; i < usable; i += 1) {
    const at = i * bytesPerPixel
    let value: number
    if (hdu.bitPix === -32) value = view.getFloat32(at, false)
    else if (hdu.bitPix === -64) value = view.getFloat64(at, false)
    else if (hdu.bitPix === 32) value = view.getInt32(at, false)
    else if (hdu.bitPix === 16) value = view.getInt16(at, false)
    else if (hdu.bitPix === 8) value = view.getUint8(at)
    else value = Number.NaN
    values[i] = scale === 1 && zero === 0 ? value : value * scale + zero
  }

  for (let i = usable; i < count; i += 1) values[i] = Number.NaN
  return values
}

export function imageStats(data: Float32Array): FitsStats | null {
  const stride = Math.max(1, Math.ceil(data.length / 180000))
  const values: number[] = []
  let sum = 0

  for (let i = 0; i < data.length; i += stride) {
    const value = data[i]
    if (!Number.isFinite(value)) continue
    values.push(value)
    sum += value
  }

  if (!values.length) return null
  values.sort((a, b) => a - b)
  const pick = (fraction: number) => values[Math.min(values.length - 1, Math.max(0, Math.round((values.length - 1) * fraction)))]
  const low = pick(0.01)
  const high = Math.max(pick(0.995), low + 1e-9)

  return {
    min: values[0],
    max: values[values.length - 1],
    low,
    high,
    median: pick(0.5),
    mean: sum / values.length,
  }
}

export function flagBitCounts(data: Float32Array) {
  const counts = new Array<number>(32).fill(0)
  for (let i = 0; i < data.length; i += 1) {
    let value = data[i] | 0
    while (value) {
      const lowest = value & -value
      const bit = 31 - Math.clz32(lowest)
      counts[bit] += 1
      value &= value - 1
    }
  }
  return counts
}

function gridCell(grid: number[], value: number) {
  let index = 0
  while (index < grid.length - 2 && grid[index + 1] < value) index += 1
  const span = grid[index + 1] - grid[index] || 1
  return { index, mix: Math.min(1, Math.max(0, (value - grid[index]) / span)) }
}

export function waveAt(wave: WaveTable, x: number, y: number) {
  const xCell = gridCell(wave.xs, x)
  const yCell = gridCell(wave.ys, y)
  const cols = wave.xs.length
  const at = (row: number, col: number) => row * cols + col
  const x0 = xCell.index
  const x1 = Math.min(cols - 1, x0 + 1)
  const y0 = yCell.index
  const y1 = Math.min(wave.ys.length - 1, y0 + 1)
  const mix = (a: number, b: number, t: number) => a * (1 - t) + b * t
  const sample = (values: number[]) => {
    const top = mix(values[at(y0, x0)], values[at(y0, x1)], xCell.mix)
    const bottom = mix(values[at(y1, x0)], values[at(y1, x1)], xCell.mix)
    return mix(top, bottom, yCell.mix)
  }
  return { wavelength: sample(wave.wavelengths), bandwidth: sample(wave.bandwidths) }
}

export function stretchValue(value: number, stats: FitsStats, mode: Stretch) {
  const span = stats.high - stats.low || 1
  const normalized = Math.min(1, Math.max(0, (value - stats.low) / span))
  if (mode === 'asinh') return Math.asinh(normalized * 12) / Math.asinh(12)
  if (mode === 'log') return Math.log1p(normalized * 99) / Math.log(100)
  return normalized
}

const STOPS = [
  [4, 3, 14],
  [24, 10, 68],
  [72, 15, 176],
  [139, 28, 246],
  [255, 93, 204],
  [255, 218, 236],
  [255, 250, 232],
]

const LUT = Array.from({ length: 256 }, (_, i) => {
  const scaled = (i / 255) * (STOPS.length - 1)
  const stop = Math.min(STOPS.length - 2, Math.floor(scaled))
  const mix = scaled - stop
  return [0, 1, 2].map((channel) => Math.round(STOPS[stop][channel] * (1 - mix) + STOPS[stop + 1][channel] * mix))
})

export function drawFits(canvas: HTMLCanvasElement, data: Float32Array, hdu: FitsHdu, stats: FitsStats, mode: Stretch, cssWidth: number) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const width = Math.round(Math.min(1400, Math.max(320, cssWidth * dpr)))
  const height = Math.max(1, Math.round((width * hdu.height) / hdu.width))
  canvas.width = width
  canvas.height = height
  const image = ctx.createImageData(width, height)

  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(hdu.height - 1, hdu.height - 1 - Math.floor((y * hdu.height) / height))
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(hdu.width - 1, Math.floor((x * hdu.width) / width))
      const value = data[sourceY * hdu.width + sourceX]
      const color = Number.isFinite(value) ? LUT[Math.round(stretchValue(value, stats, mode) * 255)] : [0, 0, 0]
      const at = (y * width + x) * 4
      image.data[at] = color[0]
      image.data[at + 1] = color[1]
      image.data[at + 2] = color[2]
      image.data[at + 3] = 255
    }
  }

  ctx.putImageData(image, 0, 0)
}

export function pixelScale(hdu: FitsHdu) {
  const header = hdu.header
  if (!textValue(header, 'CTYPE1')) return Number.NaN
  const cd11 = numberValue(header, 'CD1_1', Number.NaN)
  let a: number
  let b: number
  let c: number
  let d: number
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
  return Math.sqrt(Math.abs(a * d - b * c)) * 3600
}

export function skyAt(hdu: FitsHdu, x: number, y: number) {
  const header = hdu.header
  const ctype = textValue(header, 'CTYPE1')
  if (!ctype.startsWith('RA---TAN')) return null
  const crval1 = numberValue(header, 'CRVAL1', Number.NaN)
  const crval2 = numberValue(header, 'CRVAL2', Number.NaN)
  if (!Number.isFinite(crval1) || !Number.isFinite(crval2)) return null

  let u = x - numberValue(header, 'CRPIX1', 0)
  let v = y - numberValue(header, 'CRPIX2', 0)
  const aOrder = numberValue(header, 'A_ORDER')
  const bOrder = numberValue(header, 'B_ORDER')
  let du = 0
  let dv = 0

  if (aOrder > 0) {
    for (let p = 0; p <= aOrder; p += 1) {
      for (let q = 0; q <= aOrder - p; q += 1) du += numberValue(header, `A_${p}_${q}`) * u ** p * v ** q
    }
  }
  if (bOrder > 0) {
    for (let p = 0; p <= bOrder; p += 1) {
      for (let q = 0; q <= bOrder - p; q += 1) dv += numberValue(header, `B_${p}_${q}`) * u ** p * v ** q
    }
  }
  u += du
  v += dv

  const cd11 = numberValue(header, 'CD1_1', Number.NaN)
  let xi: number
  let eta: number
  if (Number.isFinite(cd11)) {
    xi = cd11 * u + numberValue(header, 'CD1_2') * v
    eta = numberValue(header, 'CD2_1') * u + numberValue(header, 'CD2_2') * v
  } else {
    const cdelt1 = numberValue(header, 'CDELT1', 1)
    const cdelt2 = numberValue(header, 'CDELT2', 1)
    xi = (numberValue(header, 'PC1_1', 1) * u + numberValue(header, 'PC1_2') * v) * cdelt1
    eta = (numberValue(header, 'PC2_1') * u + numberValue(header, 'PC2_2', 1) * v) * cdelt2
  }

  const xr = xi * RAD
  const yr = eta * RAD
  const rho = Math.hypot(xr, yr)
  const dec0 = crval2 * RAD

  if (rho < 1e-12) return { ra: crval1, dec: crval2 }

  const c = Math.atan(rho)
  const dec = Math.asin(Math.cos(c) * Math.sin(dec0) + (yr * Math.sin(c) * Math.cos(dec0)) / rho) / RAD
  const ra = crval1 + Math.atan2(xr * Math.sin(c), rho * Math.cos(dec0) * Math.cos(c) - yr * Math.sin(dec0) * Math.sin(c)) / RAD
  return { ra: ((ra % 360) + 360) % 360, dec }
}
