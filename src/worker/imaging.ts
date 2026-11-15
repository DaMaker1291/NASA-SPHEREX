import {
  imageStats,
  numberValue,
  parseFits,
  pixelScale,
  readImage,
  skyAt,
  stretchValue,
  textValue,
  type FitsStats,
  type WaveTable,
} from '../lib/fits'
import { skyContext } from './sky'

export type PaletteName = 'iridescent' | 'gold' | 'ice' | 'mono'
export type StretchName = 'linear' | 'asinh' | 'log'

const PALETTES: Record<PaletteName, number[][]> = {
  iridescent: [
    [4, 3, 14], [24, 10, 68], [72, 15, 176], [139, 28, 246],
    [255, 93, 204], [255, 218, 236], [255, 250, 232],
  ],
  gold: [
    [7, 5, 2], [38, 19, 4], [96, 49, 9], [172, 98, 22],
    [235, 166, 72], [255, 224, 160], [255, 250, 230],
  ],
  ice: [
    [2, 5, 12], [7, 18, 44], [12, 49, 92], [31, 111, 151],
    [99, 190, 210], [196, 239, 247], [247, 254, 255],
  ],
  mono: [
    [3, 3, 3], [28, 28, 28], [72, 72, 72], [126, 126, 126],
    [184, 184, 184], [232, 232, 232], [255, 255, 255],
  ],
}

function paletteLut(name: PaletteName) {
  const stops = PALETTES[name]
  return Array.from({ length: 256 }, (_, index) => {
    const scaled = (index / 255) * (stops.length - 1)
    const stop = Math.min(stops.length - 2, Math.floor(scaled))
    const mix = scaled - stop
    return [0, 1, 2].map((channel) =>
      Math.round(stops[stop][channel] * (1 - mix) + stops[stop + 1][channel] * mix),
    )
  })
}

const LUTS: Record<PaletteName, number[][]> = {
  iridescent: paletteLut('iridescent'),
  gold: paletteLut('gold'),
  ice: paletteLut('ice'),
  mono: paletteLut('mono'),
}

const CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array) {
  const name = new TextEncoder().encode(type)
  const output = new Uint8Array(12 + data.length)
  const view = new DataView(output.buffer)
  view.setUint32(0, data.length)
  output.set(name, 4)
  output.set(data, 8)
  view.setUint32(8 + data.length, crc32(output.subarray(4, 8 + data.length)))
  return output
}

async function encodePng(width: number, height: number, rgba: Uint8Array) {
  const stride = width * 4
  const raw = new Uint8Array((stride + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1)
  }

  const compressed = new Uint8Array(
    await new Response(
      new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate')),
    ).arrayBuffer(),
  )
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  header[8] = 8
  header[9] = 6
  header[10] = 0
  header[11] = 0
  header[12] = 0

  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  const parts = [
    signature,
    chunk('IHDR', header),
    chunk('IDAT', compressed),
    chunk('IEND', new Uint8Array(0)),
  ]
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const png = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    png.set(part, offset)
    offset += part.length
  }
  return png
}

export type CutoutRaster = {
  png: Uint8Array
  width: number
  height: number
  stats: FitsStats
  varianceStats: FitsStats | null
  zodiStats: FitsStats | null
  pixelScale: number | null
  flaggedPixels: number
  wave: WaveTable | null
  dateAvg: string
  exposure: number | null
  bunit: string
  detector: string
  band: string
  obsid: string
  center: { ra: number; dec: number } | null
  sky: ReturnType<typeof skyContext> | null
}

const RASTER_CACHE_TTL_MS = 10 * 60_000
const RASTER_CACHE_MAX_ENTRIES = 64
const rasterCache = new Map<string, { raster: CutoutRaster; at: number }>()

export async function rasterizeCutout(
  buffer: ArrayBuffer,
  options: { palette?: PaletteName; stretch?: StretchName } = {},
): Promise<CutoutRaster> {
  const palette = options.palette ?? 'iridescent'
  const stretch = options.stretch ?? 'asinh'
  const lut = LUTS[palette] ?? LUTS.iridescent
  const fits = parseFits(buffer)
  const image = fits.hdus.find((hdu) => hdu.name.toUpperCase() === 'IMAGE') ?? fits.hdus[0]
  if (!image) throw new Error('The cutout has no image extension.')
  const pixels = readImage(buffer, image)
  const stats = imageStats(pixels)
  if (!stats) throw new Error('The cutout has no finite image pixels.')
  const variance = fits.hdus.find((hdu) => hdu.name.toUpperCase() === 'VARIANCE')
  const zodi = fits.hdus.find((hdu) => hdu.name.toUpperCase() === 'ZODI')
  const flags = fits.hdus.find((hdu) => hdu.name.toUpperCase() === 'FLAGS')
  const flagValues = flags ? readImage(buffer, flags) : null
  const flaggedPixels = flagValues
    ? flagValues.reduce((total, value) => total + (Number.isFinite(value) && value !== 0 ? 1 : 0), 0)
    : 0
  const scale = pixelScale(image)
  const exposure = numberValue(image.header, 'EXPTIME', Number.NaN)
  const center = skyAt(image, (image.width - 1) / 2, (image.height - 1) / 2)
  const centerSky = center ? skyContext(center.ra, center.dec) : null

  const rgba = new Uint8Array(image.width * image.height * 4)
  for (let index = 0; index < pixels.length; index += 1) {
    const value = pixels[index]
    const at = index * 4
    if (!Number.isFinite(value)) {
      rgba[at + 3] = 255
      continue
    }
    const color = lut[Math.round(stretchValue(value, stats, stretch) * 255)]
    rgba[at] = color[0]
    rgba[at + 1] = color[1]
    rgba[at + 2] = color[2]
    rgba[at + 3] = 255
  }

  return {
    png: await encodePng(image.width, image.height, rgba),
    width: image.width,
    height: image.height,
    stats,
    varianceStats: variance ? imageStats(readImage(buffer, variance)) : null,
    zodiStats: zodi ? imageStats(readImage(buffer, zodi)) : null,
    pixelScale: Number.isFinite(scale) ? scale : null,
    flaggedPixels,
    wave: fits.wave,
    dateAvg: textValue(image.header, 'DATE-AVG'),
    exposure: Number.isFinite(exposure) ? exposure : null,
    bunit: textValue(image.header, 'BUNIT'),
    detector: textValue(image.header, 'DETECTOR'),
    band: textValue(image.header, 'BAND'),
    obsid: textValue(image.header, 'OBSID'),
    center,
    sky: centerSky,
  }
}

export async function rasterizeCutoutCached(
  key: string,
  buffer: ArrayBuffer,
  options: { palette?: PaletteName; stretch?: StretchName } = {},
) {
  const cached = rasterCache.get(key)
  if (cached && Date.now() - cached.at <= RASTER_CACHE_TTL_MS) {
    return { raster: cached.raster, cached: true }
  }
  if (cached) rasterCache.delete(key)

  const raster = await rasterizeCutout(buffer, options)
  if (rasterCache.size >= RASTER_CACHE_MAX_ENTRIES) {
    const oldest = rasterCache.keys().next()
    if (!oldest.done) rasterCache.delete(oldest.value)
  }
  rasterCache.set(key, { raster, at: Date.now() })
  return { raster, cached: false }
}
