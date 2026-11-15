#!/usr/bin/env node
// Build a spatial index for the public NASA IRSA SPHEREx S3 bucket.
//
// IRSA's SIA2/TAP endpoints can be unavailable even when the public S3 bucket
// is healthy. This script lists the DR1 level-2 objects, reads only the first
// FITS header window for one file per observation, and writes compact 10-degree
// sky-cell shards. The browser API can then resolve RA/Dec to real products
// without asking SIA2 first.

import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const BUCKET = 'https://nasa-irsa-spherex.s3.us-east-1.amazonaws.com'
const DEFAULT_OUT = 'public/data/spherex/s3-index'
const DEFAULT_PREFIX = 'dr1/level2/'
const HEADER_WINDOW = 32 * 1024
const CELL_DEGREES = 10
const FETCH_TIMEOUT_MS = 30_000

function usage() {
  console.log(`Usage: node scripts/build-s3-index-full.mjs [options]

  --prefix <prefix>      S3 key prefix (default dr1/level2/)
  --detector <n>         Detector folder to index (default 2, D2)
  --concurrency <n>      Parallel header readers (default 32, max 96)
  --limit <n>            Stop after n observations (0 = all, default 0)
  --max-pages <n>        Stop after n listings pages (0 = all, default 0)
  --cell <degrees>       Sky-cell size in degrees (default 10)
  --out <dir>            Output directory (default public/data/spherex/s3-index)
  --resume               Resume a checkpoint from .dev-logs after an interruption

The script indexes one small-slew file per observation. The other small-slew
files are adjacent pointings; the header position is the real pointing centre.
`)
}

function parseArgs(argv) {
  const options = {
    prefix: DEFAULT_PREFIX,
    detector: 2,
    concurrency: 32,
    limit: 0,
    maxPages: 0,
    cell: CELL_DEGREES,
    out: DEFAULT_OUT,
    resume: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') { usage(); process.exit(0) }
    if (arg === '--resume') { options.resume = true; continue }
    if (!['--prefix', '--detector', '--concurrency', '--limit', '--max-pages', '--cell', '--out'].includes(arg)) {
      throw new Error(`Unknown option: ${arg}`)
    }
    const value = argv[index + 1]
    if (value === undefined) throw new Error(`${arg} needs a value`)
    index += 1
    if (arg === '--prefix') options.prefix = value
    else if (arg === '--detector') options.detector = Number(value)
    else if (arg === '--concurrency') options.concurrency = Number(value)
    else if (arg === '--limit') options.limit = Number(value)
    else if (arg === '--max-pages') options.maxPages = Number(value)
    else if (arg === '--cell') options.cell = Number(value)
    else options.out = value
  }
  if (!Number.isInteger(options.detector) || options.detector < 1 || options.detector > 6) throw new Error('--detector must be 1..6')
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 96) throw new Error('--concurrency must be 1..96')
  if (!Number.isInteger(options.limit) || options.limit < 0) throw new Error('--limit must be 0 or a positive integer')
  if (!Number.isInteger(options.maxPages) || options.maxPages < 0) throw new Error('--max-pages must be 0 or a positive integer')
  if (!Number.isFinite(options.cell) || options.cell < 1 || options.cell > 45) throw new Error('--cell must be 1..45 degrees')
  if (!options.prefix || !options.out) throw new Error('--prefix and --out cannot be empty')
  return options
}

function xmlText(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function keyUrl(key) {
  return `${BUCKET}/${key.split('/').map(encodeURIComponent).join('/')}`
}

async function retry(operation, attempts = 5) {
  let lastError = null
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, Math.min(8_000, 500 * attempt * attempt)))
    }
  }
  throw lastError instanceof Error ? lastError : new Error('S3 request failed')
}

async function listPage(prefix, token) {
  const params = new URLSearchParams({ 'list-type': '2', prefix, 'max-keys': '1000' })
  if (token) params.set('continuation-token', token)
  const response = await retry(() => fetchWithTimeout(`${BUCKET}?${params.toString()}`))
  if (!response.ok) throw new Error(`S3 listing returned HTTP ${response.status}`)
  const xml = await response.text()
  const objects = []
  for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const body = match[1]
    const key = xmlText(/<Key>([\s\S]*?)<\/Key>/.exec(body)?.[1] ?? '')
    const size = Number(/<Size>(\d+)<\/Size>/.exec(body)?.[1] ?? NaN)
    if (key) objects.push({ key, size })
  }
  const truncated = /<IsTruncated>true<\/IsTruncated>/i.test(xml)
  const next = /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1]
  return { objects, truncated, next: next ? xmlText(next) : null }
}

function headerValue(text, name) {
  const quoted = new RegExp(`${name}\\s*=\\s*'([^']*)'`).exec(text)
  if (quoted) return quoted[1].trim()
  const number = new RegExp(`${name}\\s*=\\s*([-+0-9.Ee]+)`).exec(text)
  return number ? number[1].trim() : null
}

function parsePointing(text) {
  const ra = Number(headerValue(text, 'CRVAL1'))
  const dec = Number(headerValue(text, 'CRVAL2'))
  if (!Number.isFinite(ra) || !Number.isFinite(dec)) throw new Error('no CRVAL1/CRVAL2 in header window')
  if (ra < 0 || ra > 360 || dec < -90 || dec > 90) throw new Error('CRVAL1/CRVAL2 out of range')
  const obsid = headerValue(text, 'OBSID')
  const date = headerValue(text, 'DATE-AVG') || headerValue(text, 'DATE-OBS') || headerValue(text, 'DATE')
  if (!obsid || !date) throw new Error('no OBSID/DATE in header window')
  return {
    ra: Number(ra.toFixed(4)),
    dec: Number(dec.toFixed(4)),
    obsid: obsid.replace(/_\d+$/, ''),
    date,
  }
}

async function readPointing(object) {
  const response = await retry(() => fetchWithTimeout(keyUrl(object.key), {
    headers: { Range: `bytes=0-${HEADER_WINDOW - 1}`, Accept: 'application/fits' },
  }))
  if (!response.ok) throw new Error(`range returned HTTP ${response.status}`)
  const buffer = new Uint8Array(await response.arrayBuffer())
  if (!buffer.byteLength) throw new Error('empty header window')
  const text = new TextDecoder('latin1').decode(buffer)
  return parsePointing(text)
}

async function run() {
  const options = parseArgs(process.argv.slice(2))
  const outDir = resolve(options.out)
  const marker = `_1D${options.detector}_`
  const checkpointPath = resolve('.dev-logs/s3-index-checkpoint.json')
  let objects = []
  let entries = new Map()
  let failures = []
  let pages = 0
  let listedAll = true
  let cursor = 0
  let completed = 0

  if (options.resume) {
    try {
      const saved = JSON.parse(await readFile(checkpointPath, 'utf8'))
      if (saved.prefix === options.prefix && saved.detector === options.detector && saved.out === outDir) {
        objects = saved.objects || []
        entries = new Map((saved.entries || []).map((entry) => [entry.o, entry]))
        failures = saved.failures || []
        pages = saved.pages || 0
        listedAll = saved.listedAll !== false
        cursor = saved.cursor || 0
        completed = saved.completed || 0
        console.log(`resuming from checkpoint: ${completed}/${objects.length} scanned, ${entries.size} pointings`)
      }
    } catch {
      // No usable checkpoint: start from the listing.
    }
  }

  if (!objects.length) {
    let token = null
    while (true) {
      const page = await listPage(options.prefix, token)
      pages += 1
      for (const object of page.objects) {
        if (object.key.endsWith('.fits') && object.key.includes(marker)) objects.push(object)
      }
      if (options.limit && objects.length >= options.limit) {
        objects.length = options.limit
        listedAll = false
        break
      }
      if (!page.truncated || !page.next) break
      if (options.maxPages && pages >= options.maxPages) {
        listedAll = false
        break
      }
      token = page.next
      if (pages % 25 === 0) console.log(`listed ${pages} pages · ${objects.length} candidate observations`)
    }

    if (!objects.length) throw new Error(`No ${marker} objects found under ${options.prefix}`)
    console.log(`listing complete: ${pages} page(s), ${objects.length} candidate observations`)
  }

  async function writeCheckpoint() {
    const data = {
      prefix: options.prefix,
      detector: options.detector,
      out: outDir,
      pages,
      listedAll,
      cursor,
      completed,
      objects,
      entries: [...entries.values()],
      failures,
    }
    await mkdir(dirname(checkpointPath), { recursive: true })
    const temporary = `${checkpointPath}.part-${process.pid}`
    await writeFile(temporary, `${JSON.stringify(data)}\n`, 'utf8')
    await rename(temporary, checkpointPath)
  }

  await writeCheckpoint()
  let checkpointWriting = false
  const started = Date.now()

  async function worker() {
    while (cursor < objects.length) {
      const object = objects[cursor]
      cursor += 1
      try {
        const pointing = await readPointing(object)
        if (!entries.has(pointing.obsid)) {
          entries.set(pointing.obsid, {
            r: pointing.ra,
            d: pointing.dec,
            t: pointing.date,
            o: pointing.obsid,
            k: object.key,
            s: object.size,
          })
        }
      } catch (error) {
        if (failures.length < 100) failures.push({ key: object.key, reason: error instanceof Error ? error.message : 'unknown error' })
      }
      completed += 1
      if (completed % 1000 === 0) {
        const seconds = Math.max(1, (Date.now() - started) / 1000)
        console.log(`scanned ${completed}/${objects.length} · ${entries.size} pointings · ${Math.round(completed / seconds)}/s`)
      }
      if (completed % 5000 === 0 && !checkpointWriting) {
        checkpointWriting = true
        void writeCheckpoint().finally(() => { checkpointWriting = false })
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(options.concurrency, objects.length) }, worker))
  await writeCheckpoint()
  const pointings = [...entries.values()].sort((a, b) => a.o.localeCompare(b.o))
  const cells = new Map()
  for (const entry of pointings) {
    const x = Math.max(0, Math.min(35, Math.floor(entry.r / options.cell)))
    const y = Math.max(0, Math.min(Math.floor(180 / options.cell) - 1, Math.floor((entry.d + 90) / options.cell)))
    const key = `${x}-${y}`
    const bucket = cells.get(key) ?? []
    bucket.push(entry)
    cells.set(key, bucket)
  }

  await mkdir(dirname(resolve(outDir, 'index.json')), { recursive: true })
  await mkdir(resolve(outDir, 'cells'), { recursive: true })
  for (const [key, bucket] of cells) {
    await writeFile(resolve(outDir, 'cells', `cell-${key}.json`), `${JSON.stringify(bucket)}\n`, 'utf8')
  }

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    bucket: BUCKET,
    prefix: options.prefix,
    detector: `D${options.detector}`,
    cellDegrees: options.cell,
    xCells: Math.ceil(360 / options.cell),
    yCells: Math.ceil(180 / options.cell),
    pagesListed: pages,
    objectsScanned: completed,
    pointings: pointings.length,
    complete: listedAll && failures.length === 0,
    failures,
    source: 'NASA/IPAC Infrared Science Archive (IRSA) SPHEREx DR1 public S3 bucket',
  }
  await writeFile(resolve(outDir, 'index.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  if (manifest.complete) await unlink(checkpointPath).catch(() => {})
  console.log(`wrote ${pointings.length} pointings in ${cells.size} cells to ${outDir}`)
  console.log(`complete=${manifest.complete} failures=${failures.length}`)
  if (!manifest.complete) process.exitCode = 2
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
