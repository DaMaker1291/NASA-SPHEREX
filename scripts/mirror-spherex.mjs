#!/usr/bin/env node
/**
 * Real SPHEREx mirror builder.
 *
 * The CLI talks directly to IRSA TAP/SIA2 for discovery and to the IRSA cutout
 * service or the public SPHEREx S3 bucket for pixels. It does not need a
 * running local API. Every PNG/FITS byte is checked and hashed before it can
 * appear in a manifest. A failure never publishes a partial manifest, and
 * content-addressed filenames keep a failed refresh from overwriting bytes
 * referenced by the previous manifest.
 *
 * Default:
 *   node scripts/mirror-spherex.mjs
 *
 * Ingest another real field:
 *   node scripts/mirror-spherex.mjs --field orion:83.822:-5.391:0.3 --detector D2
 *
 * Verify every mirrored byte:
 *   node scripts/mirror-spherex.mjs --verify
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_OUT = join(ROOT, 'public', 'mirror')
const IRSA_HOST = 'irsa.ipac.caltech.edu'
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const FIELD_ID = /^[a-z0-9][a-z0-9-]*$/
const DEFAULTS = [
  { id: 'default-d1', ra: 150, dec: 19.5, fov: 0.3, detector: 'D1' },
  { id: 'default-d2', ra: 150, dec: 19.5, fov: 0.3, detector: 'D2' },
  { id: 'default-d3', ra: 150, dec: 19.5, fov: 0.3, detector: 'D3' },
  { id: 'default-d4', ra: 150, dec: 19.5, fov: 0.3, detector: 'D4' },
  { id: 'default-d5', ra: 150, dec: 19.5, fov: 0.3, detector: 'D5' },
  { id: 'default-d6', ra: 150, dec: 19.5, fov: 0.3, detector: 'D6' },
]

function usage() {
  console.log(`Usage:
  node scripts/mirror-spherex.mjs [options]

Options:
  --out DIR             Mirror directory (default public/mirror)
  --field ID:RA:DEC:FOV  Add a field; repeatable. Defaults to all six checked-in fields.
  --detector D2          Detector for --field entries (default D2)
  --palette NAME         Palette stored in the manifest (default iridescent)
  --stretch NAME         Stretch stored in the manifest (default asinh)
  --limit N              Frames per field: 0 for all, otherwise 2..500 (default 24)
  --bundled FILE         Use a checked-in real IRSA search JSON instead of live discovery
  --verify               Verify an existing mirror and exit
  --help                 Show this help

Discovery uses IRSA TAP with SIA2 fallback. Pixels come from the IRSA cutout
service with direct S3 byte-range fallback. --bundled only replays a real
index that was already returned by IRSA; it does not invent observations. The
script never invents a frame.
It exits non-zero if a requested frame cannot be fetched or validated, and
verifies the complete candidate manifest before publishing it.`)
}

function parseArgs(argv) {
  const options = {
    out: DEFAULT_OUT,
    fields: [],
    detector: 'D2',
    palette: 'iridescent',
    stretch: 'asinh',
    limit: 24,
    bundled: null,
    verify: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') { usage(); process.exit(0) }
    if (arg === '--verify') { options.verify = true; continue }
    if (arg === '--out' || arg === '--field' || arg === '--detector' || arg === '--palette' || arg === '--stretch' || arg === '--limit' || arg === '--bundled') {
      const value = argv[i + 1]
      if (!value) throw new Error(`${arg} needs a value`)
      i += 1
      if (arg === '--out') options.out = resolve(ROOT, value)
      else if (arg === '--bundled') options.bundled = resolve(ROOT, value)
      else if (arg === '--detector') {
        options.detector = value.toUpperCase()
        if (!/^D[1-6]$/.test(options.detector)) throw new Error('--detector must be D1 through D6')
      } else if (arg === '--palette') options.palette = value
      else if (arg === '--stretch') options.stretch = value
      else if (arg === '--limit') {
        const n = Number(value)
        if (!Number.isInteger(n) || n < 0 || n > 500 || n === 1) throw new Error('--limit must be 0 (all) or an integer from 2 to 500')
        options.limit = n
      } else {
        const parts = value.split(':')
        if (parts.length !== 4) throw new Error('--field expects ID:RA:DEC:FOV')
        const [id, ra, dec, fov] = parts
        const numbers = [Number(ra), Number(dec), Number(fov)]
        if (!FIELD_ID.test(id) || numbers.some((number) => !Number.isFinite(number))) throw new Error(`Invalid --field ${value}`)
        if (numbers[0] < 0 || numbers[0] > 360 || numbers[1] < -90 || numbers[1] > 90) throw new Error('--field coordinates are out of range')
        if (numbers[2] < 0.1 || numbers[2] > 0.9) throw new Error('--field FOV must be from 0.1 to 0.9 degrees')
        options.fields.push({ id, ra: numbers[0], dec: numbers[1], fov: numbers[2] })
      }
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  options.fields = options.fields.length
    ? options.fields.map((field) => ({ ...field, detector: options.detector, palette: options.palette, stretch: options.stretch }))
    : DEFAULTS.map((field) => ({ ...field, palette: options.palette, stretch: options.stretch }))

  const ids = new Set()
  for (const field of options.fields) {
    if (!FIELD_ID.test(field.id)) throw new Error(`Invalid field id: ${field.id}`)
    if (ids.has(field.id)) throw new Error(`Duplicate field id: ${field.id}`)
    ids.add(field.id)
  }
  return options
}

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')
const safePart = (value) => String(value).replace(/[^A-Za-z0-9_-]+/g, '_')

let archiveRuntimePromise = null

async function loadArchiveRuntime() {
  const entry = [
    "export { findSpherex, getCutout } from './src/worker/irsa.ts';",
    "export { rasterizeCutout } from './src/worker/imaging.ts';",
    "export { skyContext } from './src/worker/sky.ts';",
  ].join('\n')
  let result
  try {
    result = await build({
      stdin: { contents: entry, resolveDir: ROOT, sourcefile: 'mirror-runtime.ts', loader: 'ts' },
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      write: false,
      logLevel: 'silent',
    })
  } catch (error) {
    throw new Error(`Could not prepare the direct IRSA/S3 runtime: ${error instanceof Error ? error.message : 'unknown esbuild error'}`)
  }
  const output = result.outputFiles?.[0]?.text
  if (!output) throw new Error('Could not prepare the direct IRSA/S3 runtime: esbuild produced no module.')
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`)
}

function archiveRuntime() {
  archiveRuntimePromise ??= loadArchiveRuntime()
  return archiveRuntimePromise
}

function assertPng(buffer, label) {
  if (buffer.length < PNG_SIGNATURE.length || !buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error(`${label} is not a PNG`)
  }
}

function assertFits(buffer, label) {
  if (buffer.subarray(0, 6).toString('ascii') !== 'SIMPLE') throw new Error(`${label} is not a FITS file`)
}

function assertRealIrsaUri(value, label) {
  let url
  try { url = new URL(String(value)) } catch { throw new Error(`${label} has no valid IRSA product URI`) }
  if (url.protocol !== 'https:' || url.hostname !== IRSA_HOST || !url.pathname.startsWith('/ibe/data/spherex/')) {
    throw new Error(`${label} is not a SPHEREx IRSA product URI`)
  }
}

export function selectFrames(found, detector) {
  const groups = new Map()
  const available = new Set()
  for (const observation of found.observations) {
    if (!observation?.obsid) continue
    for (const product of observation.detectors) available.add(product.detector)
    const key = observation.obsid.replace(/_\d+$/, '')
    const rows = groups.get(key) ?? []
    rows.push(observation)
    groups.set(key, rows)
  }
  if (!available.has(detector)) {
    throw new Error(`No ${detector} products were returned; available detectors: ${[...available].sort().join(', ') || 'none'}`)
  }

  const frames = []
  for (const rows of groups.values()) {
    const ordered = [...rows].sort((a, b) => a.mjd - b.mjd)
    const row = ordered.find((observation) => observation.detectors.some((item) => item.detector === detector))
    const product = row?.detectors.find((item) => item.detector === detector)
    if (row && product) frames.push({ row, product })
  }
  return frames.sort((a, b) => a.row.mjd - b.row.mjd)
}

export function sampleFrames(frames, limit) {
  if (!limit || frames.length <= limit) return frames
  if (limit === 1) return [frames[Math.floor(frames.length / 2)]]
  return Array.from(
    new Set(Array.from({ length: limit }, (_, index) => Math.round((index * (frames.length - 1)) / (limit - 1)))),
  ).map((index) => frames[index])
}

function measurementFromRaster(raster, product, field, cutout) {
  const stats = raster.stats
  if (!stats || ![stats.median, stats.mean].every(Number.isFinite) || raster.width <= 0 || raster.height <= 0) {
    throw new Error(`Raster ${product.file} has no real FITS image statistics`)
  }
  if (![raster.wave?.minWavelength, raster.wave?.maxWavelength].every(Number.isFinite)) {
    throw new Error(`Raster ${product.file} has no real WCS-WAVE range`)
  }
  return {
    measured: true,
    width: raster.width,
    height: raster.height,
    min: stats.min,
    max: stats.max,
    low: stats.low,
    high: stats.high,
    median: stats.median,
    mean: stats.mean,
    varianceMedian: raster.varianceStats?.median ?? null,
    zodiMedian: raster.zodiStats?.median ?? null,
    flagged: raster.flaggedPixels,
    ra: raster.center?.ra ?? null,
    dec: raster.center?.dec ?? null,
    waveMin: raster.wave?.minWavelength ?? null,
    waveMax: raster.wave?.maxWavelength ?? null,
    waveBwMin: raster.wave?.minBandwidth ?? null,
    waveBwMax: raster.wave?.maxBandwidth ?? null,
    galacticL: raster.sky?.galactic?.l ?? null,
    galacticB: raster.sky?.galactic?.b ?? null,
    eclipticLon: raster.sky?.ecliptic?.lon ?? null,
    eclipticLat: raster.sky?.ecliptic?.lat ?? null,
    dateAvg: raster.dateAvg || '',
    exposure: raster.exposure ?? null,
    bunit: raster.bunit || '',
    detector: product.detector,
    band: product.band,
    obsid: product.obsid ?? '',
    constellation: raster.sky?.constellation?.name ?? '',
    constellationSymbol: raster.sky?.constellation?.symbol ?? '',
    cutoutSize: cutout.sizeLabel,
    palette: field.palette,
    stretch: field.stretch,
  }
}

async function loadBundledField(path, field) {
  let data
  try {
    data = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    throw new Error(`Could not read bundled IRSA index ${path}: ${error instanceof Error ? error.message : 'invalid JSON'}`)
  }
  if (!Array.isArray(data?.observations) || !data.observations.length) {
    throw new Error(`Bundled IRSA index ${path} has no real observations`)
  }
  const center = data.field
  if (!center || !Number.isFinite(center.ra) || !Number.isFinite(center.dec) || !Number.isFinite(center.fov)) {
    throw new Error(`Bundled IRSA index ${path} has no field centre`)
  }
  const raDelta = Math.min(Math.abs(center.ra - field.ra), 360 - Math.abs(center.ra - field.ra))
  if (raDelta > 0.01 || Math.abs(center.dec - field.dec) > 0.01 || Math.abs(center.fov - field.fov) > 0.01) {
    throw new Error(`Bundled IRSA index ${path} is for RA ${center.ra}, Dec ${center.dec}, FOV ${center.fov}; it does not match ${field.id}`)
  }
  const source = data.source || { label: 'IRSA SIA2', url: 'https://irsa.ipac.caltech.edu/' }
  return {
    ...data,
    field: { ra: center.ra, dec: center.dec, fov: center.fov },
    source: {
      ...source,
      label: `${source.label || 'IRSA SIA2'} · checked-in real index`,
      url: source.url || 'https://irsa.ipac.caltech.edu/',
    },
  }
}

export async function ingestField(options, field, archiveOverride = null) {
  const archive = archiveOverride ?? await archiveRuntime()
  const found = options.bundled
    ? await loadBundledField(options.bundled, field)
    : await archive.findSpherex(field.ra, field.dec, field.fov)
  if (!Array.isArray(found.observations) || !found.observations.length) {
    throw new Error(`No real SPHEREx observations returned for ${field.id}`)
  }
  const frames = sampleFrames(selectFrames(found, field.detector), options.limit)
  if (!frames.length) throw new Error(`No ${field.detector} products were returned for ${field.id}`)

  const fieldDir = join(options.out, 'fields', field.id)
  const entries = []
  const seen = new Set()
  for (const { row, product } of frames) {
    if (!row.obsid || seen.has(row.obsid)) throw new Error(`Duplicate observation ${row.obsid} for ${field.id}`)
    assertRealIrsaUri(product.uri, `Observation ${row.obsid}`)
    seen.add(row.obsid)

    const cutout = await archive.getCutout(product.uri, field.ra, field.dec, field.fov)
    const raster = await archive.rasterizeCutout(cutout.buffer, { palette: field.palette, stretch: field.stretch })
    const png = Buffer.from(raster.png)
    const fits = Buffer.from(cutout.buffer)
    assertPng(png, `PNG ${row.obsid}`)
    assertFits(fits, `FITS ${row.obsid}`)
    const measurement = measurementFromRaster(raster, { ...product, obsid: row.obsid }, field, cutout)

    const pngSha256 = sha256(png)
    const fitsSha256 = sha256(fits)
    const stem = safePart(`${row.obsid}-${product.detector}`)
    const pngPath = join(fieldDir, 'frames', `${stem}-${pngSha256.slice(0, 24)}.png`)
    const fitsPath = join(fieldDir, 'fits', `${stem}-${fitsSha256.slice(0, 24)}.fits`)

    // Content-addressed names keep a failed refresh from overwriting files
    // referenced by the previous manifest.
    await writeAtomic(pngPath, png)
    await writeAtomic(fitsPath, fits)

    entries.push({
      id: row.obsid.replace(/_\d+$/, ''),
      obsid: row.obsid,
      iso: row.iso,
      date: row.iso.slice(0, 10),
      detector: product.detector,
      band: product.band,
      uri: product.uri,
      file: product.file || '',
      dataSource: cutout.source,
      png: relativeMirrorPath(options.out, pngPath),
      pngBytes: png.length,
      pngSha256,
      measurement,
      fits: relativeMirrorPath(options.out, fitsPath),
      fitsBytes: fits.length,
      fitsSha256,
    })
  }

  return {
    id: field.id,
    label: `${field.id} · RA ${field.ra} · Dec ${field.dec}`,
    ra: field.ra,
    dec: field.dec,
    fov: field.fov,
    detector: field.detector,
    palette: field.palette,
    stretch: field.stretch,
    sourceLabel: `${found.source.label} · direct`,
    sourceUrl: found.source.url,
    sky: archive.skyContext(field.ra, field.dec),
    summary: found.summary ?? null,
    frames: entries,
  }
}

async function writeAtomic(path, data) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.part-${process.pid}`
  await writeFile(temporary, data)
  await rename(temporary, path)
}

async function readManifest(path) {
  let raw
  try {
    raw = await readFile(path, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`${path} is not valid JSON; refusing to replace it`)
  }
  if (!parsed || parsed.schemaVersion !== 2 || !Array.isArray(parsed.fields)) {
    throw new Error(`${path} is not a schema version 2 mirror manifest; refusing to replace it`)
  }
  return parsed
}

function relativeMirrorPath(out, path) {
  const value = relative(out, path)
  if (!value || value.startsWith('..') || isAbsolute(value)) throw new Error(`Path escapes mirror: ${path}`)
  return value.split(sep).join('/')
}

function resolveMirrorPath(out, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath || relativePath.startsWith('/') || relativePath.includes('\\') || relativePath.split('/').includes('..')) {
    throw new Error(`Invalid mirror path: ${relativePath}`)
  }
  const absolute = resolve(out, relativePath)
  const value = relative(out, absolute)
  if (!value || value.startsWith('..') || isAbsolute(value)) throw new Error(`Path escapes mirror: ${relativePath}`)
  return absolute
}

async function verifyManifest(manifest, out) {
  if (!manifest || manifest.schemaVersion !== 2 || !Array.isArray(manifest.fields) || !manifest.fields.length) {
    throw new Error('Mirror manifest has no schema version 2 fields')
  }
  const fieldIds = new Set()
  let files = 0
  for (const field of manifest.fields) {
    if (!FIELD_ID.test(field.id) || fieldIds.has(field.id)) throw new Error(`Invalid or duplicate field id: ${field.id}`)
    if (!Number.isFinite(field.ra) || field.ra < 0 || field.ra > 360 || !Number.isFinite(field.dec) || field.dec < -90 || field.dec > 90) {
      throw new Error(`Invalid field centre: ${field.id}`)
    }
    if (!Number.isFinite(field.fov) || field.fov < 0.1 || field.fov > 0.9) throw new Error(`Invalid field FOV: ${field.id}`)
    if (!Array.isArray(field.frames) || !field.frames.length) throw new Error(`No frames in field: ${field.id}`)
    fieldIds.add(field.id)
    const obsids = new Set()
    for (const frame of field.frames) {
      if (!frame.obsid || obsids.has(frame.obsid)) throw new Error(`Invalid or duplicate observation: ${frame.obsid || field.id}`)
      obsids.add(frame.obsid)
      assertRealIrsaUri(frame.uri, `Frame ${frame.obsid}`)
      const measurement = frame.measurement
      if (!measurement || measurement.measured !== true) throw new Error(`Missing real measurement metadata: ${frame.obsid}`)
      const numbers = [measurement.median, measurement.mean, measurement.waveMin, measurement.waveMax, measurement.width, measurement.height]
      if (numbers.some((number) => !Number.isFinite(number)) || measurement.width <= 0 || measurement.height <= 0) {
        throw new Error(`Incomplete real FITS measurements: ${frame.obsid}`)
      }
      for (const [kind, signature] of [['png', assertPng], ['fits', assertFits]]) {
        const relativePath = frame[kind]
        const expected = frame[`${kind}Sha256`]
        const bytes = frame[`${kind}Bytes`]
        if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected) || !Number.isInteger(bytes) || bytes <= 0) {
          throw new Error(`Incomplete ${kind} metadata: ${frame.obsid}`)
        }
        const buffer = await readFile(resolveMirrorPath(out, relativePath))
        if (buffer.length !== bytes) throw new Error(`Size mismatch: ${relativePath}`)
        if (sha256(buffer) !== expected) throw new Error(`Checksum mismatch: ${relativePath}`)
        signature(buffer, relativePath)
        files += 1
      }
    }
  }
  return { fields: manifest.fields.length, files }
}

async function verify(options) {
  const manifest = await readManifest(join(options.out, 'index.json'))
  if (!manifest) throw new Error(`No mirror manifest in ${options.out}`)
  const result = await verifyManifest(manifest, options.out)
  console.log(`OK: ${result.fields} field(s), ${result.files} file(s), all signatures and SHA-256 checksums valid.`)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.verify) {
    await verify(options)
    return
  }

  await mkdir(options.out, { recursive: true })
  const manifestPath = join(options.out, 'index.json')
  const previous = await readManifest(manifestPath)
  const byId = new Map((previous?.fields || []).map((field) => [field.id, field]))

  for (const field of options.fields) {
    console.log(`Mirroring ${field.id} (${field.detector}) directly from IRSA/S3`)
    const result = await ingestField(options, field)
    byId.set(result.id, result)
    console.log(`  ${result.frames.length} real PNG + FITS frame(s) written`)
  }

  const manifest = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    source: 'NASA/IPAC Infrared Science Archive (IRSA) SPHEREx',
    sourceUrl: 'https://irsa.ipac.caltech.edu/',
    note: 'Real archive products mirrored directly from IRSA and S3. No synthetic frames. Verify with --verify.',
    fields: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)),
  }

  // Verify the complete candidate before replacing the manifest. This means a
  // failed or partial ingestion leaves both the old manifest and its bytes in
  // place.
  const result = await verifyManifest(manifest, options.out)
  await writeAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`Wrote ${relative(ROOT, manifestPath)} (${result.fields} field(s), ${result.files} file(s) verified)`)
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch((error) => {
    console.error(`Mirror failed: ${error.message}`)
    process.exitCode = 1
  })
}
