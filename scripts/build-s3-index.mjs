#!/usr/bin/env node
// Build a bounded, real-data S3 scan index for SPHEREx products.
//
// This does not crawl the archive. It lists at most --limit objects, reads only
// their FITS header blocks with byte ranges, and writes the positions it can
// verify. Products without usable header coordinates are omitted rather than
// guessed.

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const BUCKET = 'https://nasa-irsa-spherex.s3.us-east-1.amazonaws.com'
const BLOCK = 2880
const CARD = 80
const HEADER_WINDOW = BLOCK * 12
const MAX_HDUS = 12
const FETCH_TIMEOUT_MS = 20_000

function usage() {
  console.log(`Usage: node scripts/build-s3-index.mjs [options]

  --limit <n>         Maximum objects to scan (default 250, max 5000)
  --concurrency <n>   Parallel header readers (default 4, max 16)
  --prefix <prefix>   S3 key prefix (default dr1/level2/)
  --max-pages <n>     Maximum ListObjectsV2 pages (default 10, max 100)
  --out <path>        Output JSON path (default public/data/spherex/s3-index.json)

The scan is deliberately bounded. It is not a complete archive index.`)
}

function readArgs(argv) {
  const options = {
    limit: 250,
    concurrency: 4,
    prefix: 'dr1/level2/',
    maxPages: 10,
    out: 'public/data/spherex/s3-index.json'
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') { usage(); process.exit(0) }
    const next = argv[index + 1]
    if (arg === '--limit') { options.limit = Number(next); index += 1; continue }
    if (arg === '--concurrency') { options.concurrency = Number(next); index += 1; continue }
    if (arg === '--prefix') { options.prefix = String(next ?? ''); index += 1; continue }
    if (arg === '--max-pages') { options.maxPages = Number(next); index += 1; continue }
    if (arg === '--out') { options.out = String(next ?? ''); index += 1; continue }
    throw new Error(`Unknown option: ${arg}`)
  }
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 5000) throw new Error('--limit must be an integer from 1 to 5000.')
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 16) throw new Error('--concurrency must be an integer from 1 to 16.')
  if (!Number.isInteger(options.maxPages) || options.maxPages < 1 || options.maxPages > 100) throw new Error('--max-pages must be an integer from 1 to 100.')
  if (!options.prefix || !options.out) throw new Error('--prefix and --out cannot be empty.')
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

async function listPage(prefix, token) {
  const params = new URLSearchParams({ 'list-type': '2', prefix, 'max-keys': '1000' })
  if (token) params.set('continuation-token', token)
  const response = await fetchWithTimeout(`${BUCKET}?${params.toString()}`, { headers: { Accept: 'application/xml' } })
  if (!response.ok) throw new Error(`S3 listing returned HTTP ${response.status}.`)
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

function keyUrl(key) {
  return `${BUCKET}/${key.split('/').map(encodeURIComponent).join('/')}`
}

async function readRange(key, start, end, size) {
  const to = Math.min(size - 1, end)
  const response = await fetchWithTimeout(keyUrl(key), {
    headers: { Accept: 'application/fits', Range: `bytes=${start}-${to}` }
  })
  if (!response.ok) throw new Error(`range ${start}-${to} returned HTTP ${response.status}`)
  if (response.status !== 206 && !(size <= HEADER_WINDOW && response.status === 200)) {
    throw new Error(`range request returned HTTP ${response.status}`)
  }
  return new Uint8Array(await response.arrayBuffer())
}

function parseHeader(buffer) {
  const header = {}
  let cursor = 0
  let ended = false
  while (!ended && cursor + BLOCK <= buffer.byteLength) {
    const block = new TextDecoder('ascii').decode(buffer.subarray(cursor, cursor + BLOCK))
    for (let at = 0; at < BLOCK; at += CARD) {
      const card = block.slice(at, at + CARD)
      const key = card.slice(0, 8).trim()
      if (key === 'END') { ended = true; break }
      if (!key || key === 'COMMENT' || key === 'HISTORY') continue
      const equals = card.indexOf('=')
      if (equals < 0) continue
      const raw = card.slice(equals + 1).trim()
      if (raw.startsWith("'")) {
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
  if (!ended) throw new Error('header did not terminate inside the range window')
  return { header, headerBytes: cursor }
}

function dataBlockBytes(header) {
  const naxis = Number(header.NAXIS ?? 0)
  if (!Number.isInteger(naxis) || naxis < 0) throw new Error('invalid NAXIS')
  if (!naxis) return 0
  let pixels = 1
  for (let axis = 1; axis <= naxis; axis += 1) {
    const length = Number(header[`NAXIS${axis}`] ?? 0)
    if (!Number.isInteger(length) || length < 0) throw new Error(`invalid NAXIS${axis}`)
    pixels *= length
    if (pixels > 2_000_000_000) throw new Error('FITS image is too large to index')
  }
  const bitpix = Number(header.BITPIX)
  if (![8, 16, 32, 64, -32, -64].includes(bitpix)) throw new Error('invalid BITPIX')
  const groups = Number(header.GCOUNT ?? 1)
  const parameters = Number(header.PCOUNT ?? 0)
  const bytes = (Math.abs(bitpix) / 8) * groups * (parameters + pixels)
  if (!Number.isFinite(bytes) || bytes < 0) throw new Error('invalid data size')
  return Math.ceil(bytes / BLOCK) * BLOCK
}

function pick(header, names) {
  for (const name of names) {
    const value = header[name]
    if (value !== undefined && String(value).trim() !== '') return String(value).trim()
  }
  return null
}

function pickNumber(header, names) {
  const raw = pick(header, names)
  if (raw === null) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

function normalizeRa(ra) {
  if (!Number.isFinite(ra)) return null
  const value = ((ra % 360) + 360) % 360
  return value
}

function normalizeDec(dec) {
  return Number.isFinite(dec) && dec >= -90 && dec <= 90 ? dec : null
}

function positionFromHeaders(headers) {
  let ra = null
  let dec = null
  for (const header of headers) {
    const candidateRa = normalizeRa(pickNumber(header, ['RA', 'RA_OBJ', 'OBJ_RA', 'RA_CENT', 'RA_CENTER', 'CRVAL1']))
    const candidateDec = normalizeDec(pickNumber(header, ['DEC', 'DEC_OBJ', 'OBJ_DEC', 'DEC_CENT', 'DEC_CENTER', 'CRVAL2']))
    if (candidateRa !== null && candidateDec !== null) { ra = candidateRa; dec = candidateDec; break }
  }
  return { ra, dec }
}

async function scanObject(object) {
  if (!Number.isFinite(object.size) || object.size < BLOCK) throw new Error('object has no usable size')
  const headers = []
  let offset = 0
  for (let hdu = 0; hdu < MAX_HDUS && offset + BLOCK <= object.size; hdu += 1) {
    const bytes = await readRange(object.key, offset, offset + HEADER_WINDOW - 1, object.size)
    const parsed = parseHeader(bytes)
    headers.push(parsed.header)
    const dataBytes = dataBlockBytes(parsed.header)
    const next = offset + parsed.headerBytes + dataBytes
    if (next <= offset) break
    offset = next
  }
  const { ra, dec } = positionFromHeaders(headers)
  if (ra === null || dec === null) return null
  const merged = Object.assign({}, ...headers)
  const date = pick(merged, ['DATE-OBS', 'DATE_AVG', 'DATE-AVG', 'OBS_DATE', 'DATE'])
  return {
    key: object.key,
    size: object.size,
    ra: Number(ra.toFixed(6)),
    dec: Number(dec.toFixed(6)),
    date,
    obsid: pick(merged, ['OBSID', 'OBS_ID', 'OBSERVATION_ID']),
    detector: pick(merged, ['DETECTOR', 'BAND', 'CHANNEL']),
    release: pick(merged, ['RELEASE', 'PROVENANCE_VERSION', 'DATA_RELEASE']),
    uri: `https://irsa.ipac.caltech.edu/ibe/data/spherex/${object.key}`
  }
}

async function run() {
  const options = readArgs(process.argv.slice(2))
  const outPath = resolve(options.out)
  const listing = []
  let token = null
  let pages = 0
  let truncated = true
  while (truncated && pages < options.maxPages && listing.length < options.limit) {
    const page = await listPage(options.prefix, token)
    pages += 1
    for (const object of page.objects) {
      if (listing.length >= options.limit) break
      if (/\.fits?$/i.test(object.key)) listing.push(object)
    }
    truncated = page.truncated
    token = page.next
    console.log(`listed page ${pages}: ${listing.length} FITS object(s) queued`)
    if (!token) break
  }

  if (!listing.length) throw new Error(`No .fits objects found under ${options.prefix}.`)

  const entries = []
  const failures = []
  let cursor = 0
  let completed = 0
  const workers = Array.from({ length: Math.min(options.concurrency, listing.length) }, async () => {
    while (cursor < listing.length) {
      const object = listing[cursor]
      cursor += 1
      try {
        const entry = await scanObject(object)
        if (entry) entries.push(entry)
        else failures.push({ key: object.key, reason: 'no RA/Dec in the first FITS headers' })
      } catch (error) {
        failures.push({ key: object.key, reason: error instanceof Error ? error.message : 'unknown error' })
      }
      completed += 1
      if (completed % 25 === 0 || completed === listing.length) {
        console.log(`scanned ${completed}/${listing.length} · ${entries.length} positioned`)
      }
    }
  })
  await Promise.all(workers)
  entries.sort((a, b) => a.key.localeCompare(b.key))

  const output = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      bucket: BUCKET,
      prefix: options.prefix,
      method: 'S3 ListObjectsV2 plus FITS header byte ranges',
      note: 'Bounded real-data index, not a complete S3 crawl. Missing coordinates are omitted, never inferred.'
    },
    pagesListed: pages,
    objectsQueued: listing.length,
    objectsWithPosition: entries.length,
    limits: { objects: options.limit, concurrency: options.concurrency, pages: options.maxPages },
    failures: failures.slice(0, 100),
    entries
  }
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
  console.log(`wrote ${entries.length} positioned entries to ${outPath}`)
  if (failures.length) console.log(`${failures.length} object(s) omitted; see failures in the JSON.`)
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
