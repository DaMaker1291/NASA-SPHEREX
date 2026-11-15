import { Hono, type Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

import {
  briefFromFind,
  briefSpherex,
  findSpherex,
  getCatalog,
  getCutout,
  getSpectrum,
  summarizeCutout,
  summarizeObservations,
  type IrsaFind,
  type IrsaObservation,
} from './irsa'
import { ApiError, TtlCache, queryEnum, queryNumber, validateIrsaProductUri } from './http'
import { rasterizeCutoutCached } from './imaging'
import { skyContext, skyNeighborhood } from './sky'
import { getSourceHealth } from './sources'

type Env = {
  ASSETS: Fetcher
}

type Variables = {
  requestId: string
}

type AppContext = Context<{ Bindings: Env; Variables: Variables }>

const app = new Hono<{ Bindings: Env; Variables: Variables }>()

const MAX_SPECTRUM_DETECTORS = 6
const SPECTRUM_CONCURRENCY = 3
const CACHE_NAME = 'drift-api-v8'
const CACHE_STORED_AT = 'x-edge-stored-at'
const API_VERSION = '2026-11-15'
const DEFAULT_FIELD = { ra: 150, dec: 19.5, fov: 0.3 }
const summaryCache = new TtlCache<string, ReturnType<typeof summarizeCutout>>(600_000, 64)
const bootedAt = Date.now()
let edgeHits = 0
let edgeMisses = 0

function asciiHeader(value: string) {
  return value.replace(/[^\x20-\x7E]/g, '-')
}

function withCacheState(response: Response, state: 'HIT' | 'MISS') {
  if (state === 'HIT') edgeHits += 1
  else edgeMisses += 1
  const headers = new Headers(response.headers)
  headers.set('X-Cache', state)
  headers.set('X-API-Version', API_VERSION)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function cacheKey(request: Request): Request | null {
  if (request.method !== 'GET') return null
  const url = new URL(request.url)
  // Query order is not significant. Canonicalising it prevents the same
  // real request from filling several edge-cache slots.
  url.searchParams.sort()
  url.hash = ''
  return new Request(url.toString(), { method: 'GET' })
}

function cacheMaxAgeMs(response: Response) {
  const control = response.headers.get('cache-control') ?? ''
  const match = /(?:s-maxage|max-age)=(\d+)/i.exec(control)
  if (!match) return null
  const seconds = Number(match[1])
  return Number.isFinite(seconds) ? seconds * 1000 : null
}

function cacheExpired(response: Response) {
  const maxAge = cacheMaxAgeMs(response)
  if (maxAge === null) return false
  const date = Date.parse(response.headers.get('date') ?? '')
  return Number.isFinite(date) && Date.now() - date > maxAge
}

async function bundledFind(c: AppContext): Promise<IrsaFind | null> {
  try {
    const response = await c.env.ASSETS.fetch(
      new Request(new URL('/data/spherex/dr1-150.json', c.req.url), {
        headers: { Accept: 'application/json' },
      }),
    )
    if (!response.ok) return null
    const data = (await response.json()) as IrsaFind
    return {
      ...data,
      summary: data.summary ?? summarizeObservations(data.observations),
      source: { ...data.source, label: `${data.source.label} · bundled fallback` },
    }
  } catch {
    return null
  }
}

async function edgeMatch(request: Request) {
  const key = cacheKey(request)
  if (!key) return null
  try {
    const cache = await caches.open(CACHE_NAME)
    const cached = await cache.match(key)
    if (!cached) return null
    const storedAt = Number(cached.headers.get(CACHE_STORED_AT))
    const maxAge = cacheMaxAgeMs(cached)
    const tooOld = Number.isFinite(storedAt) && maxAge !== null && Date.now() - storedAt > maxAge
    if (tooOld || (cacheExpired(cached) && !Number.isFinite(storedAt))) {
      // Cache API entries are not guaranteed to expire on their own. Enforce
      // the response TTL explicitly instead of serving stale JSON forever.
      cache.delete(key).catch(() => {})
      return null
    }
    const headers = new Headers(cached.headers)
    headers.delete(CACHE_STORED_AT)
    return new Response(cached.body, {
      status: cached.status,
      statusText: cached.statusText,
      headers,
    })
  } catch {
    return null
  }
}

function edgeStore(c: AppContext, response: Response) {
  const key = cacheKey(c.req.raw)
  if (!key || !response.ok) return
  const control = response.headers.get('cache-control') ?? ''
  if (/no-store|private/i.test(control)) return
  try {
    const copy = response.clone()
    const headers = new Headers(copy.headers)
    headers.set(CACHE_STORED_AT, String(Date.now()))
    const cacheCopy = new Response(copy.body, {
      status: copy.status,
      statusText: copy.statusText,
      headers,
    })
    c.executionCtx.waitUntil(
      caches
        .open(CACHE_NAME)
        .then((cache) => cache.put(key, cacheCopy))
        .catch(() => {}),
    )
  } catch {
    // Local dev and tests may not expose a Cache API; the origin response still works.
  }
}

function publicReason(error: unknown) {
  return error instanceof ApiError ? error.message : 'Detector extraction failed.'
}

function apiError(c: AppContext, error: unknown) {
  const api = error instanceof ApiError ? error : new ApiError(500, 'The backend could not complete the request.', 'INTERNAL')
  if (api.status >= 500) {
    console.error(
      JSON.stringify({
        event: 'api_error',
        requestId: c.get('requestId'),
        path: c.req.path,
        status: api.status,
        code: api.code,
        detail: error instanceof Error ? error.message.slice(0, 500) : 'unknown error',
      }),
    )
  }

  if (api.status === 503 || api.status === 504) c.header('Retry-After', '5')
  c.header('Cache-Control', 'no-store')
  return c.json(
    {
      error: api.message,
      code: api.code,
      requestId: c.get('requestId'),
      ...(api.details === undefined ? {} : { details: api.details }),
    },
    api.status as ContentfulStatusCode,
  )
}

app.use('/api/*', async (c, next) => {
  const startedAt = Date.now()
  const requestId = (c.req.header('cf-ray') ?? crypto.randomUUID()).slice(0, 64)
  c.set('requestId', requestId)
  c.header('X-Request-Id', requestId)
  c.header('X-API-Version', API_VERSION)
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Referrer-Policy', 'no-referrer')
  c.header('Cross-Origin-Resource-Policy', 'same-origin')
  await next()
  c.header('X-Request-Id', requestId)
  c.header('X-API-Version', API_VERSION)
  c.header('Server-Timing', `app;dur=${Math.max(0, Date.now() - startedAt)}`)
})

app.get('/api/health', (c) => {
  c.header('Cache-Control', 'no-store')
  return c.json({
    ok: true,
    service: 'drift',
    source: 'IRSA SPHEREx DR1',
    apiVersion: API_VERSION,
    uptimeSeconds: Math.floor((Date.now() - bootedAt) / 1000),
    edgeCache: { name: CACHE_NAME, hits: edgeHits, misses: edgeMisses },
    time: new Date().toISOString(),
  })
})

app.get('/api/health/sources', async (c) => {
  c.header('Cache-Control', 'no-store')
  return c.json(await getSourceHealth())
})

app.get('/api/spherex/find', async (c) => {
  let ra: number
  let dec: number
  let fov: number
  try {
    ra = queryNumber(c.req.query('ra'), { label: 'ra', min: 0, max: 360, fallback: 150 })
    dec = queryNumber(c.req.query('dec'), { label: 'dec', min: -90, max: 90, fallback: 19.5 })
    fov = queryNumber(c.req.query('fov'), { label: 'fov', min: 0.1, max: 0.9, fallback: 0.3 })
  } catch (error) {
    return apiError(c, error)
  }

  try {
    const cached = await edgeMatch(c.req.raw)
    if (cached) return withCacheState(cached, 'HIT')

    const data = await findSpherex(ra, dec, fov)
    c.header('X-Data-Source', asciiHeader(data.source.label))
    if (data.cachedAt) {
      c.header('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=60')
      c.header('X-Data-Fallback', 'last-good')
    } else {
      c.header('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=60')
    }
    const response = c.json(data)
    edgeStore(c, response)
    return withCacheState(response, 'MISS')
  } catch (error) {
    const fallback =
      Math.abs(ra - DEFAULT_FIELD.ra) < 1e-9 &&
      Math.abs(dec - DEFAULT_FIELD.dec) < 1e-9 &&
      Math.abs(fov - DEFAULT_FIELD.fov) < 1e-9
        ? await bundledFind(c)
        : null
    if (fallback) {
      c.header('Cache-Control', 'public, max-age=60, s-maxage=60')
      c.header('X-Data-Source', asciiHeader(fallback.source.label))
      c.header('X-Data-Fallback', 'bundled')
      return c.json(fallback)
    }
    return apiError(c, error)
  }
})

app.get('/api/spherex/brief', async (c) => {
  let ra: number
  let dec: number
  let fov: number
  try {
    ra = queryNumber(c.req.query('ra'), { label: 'ra', min: 0, max: 360, fallback: 150 })
    dec = queryNumber(c.req.query('dec'), { label: 'dec', min: -90, max: 90, fallback: 19.5 })
    fov = queryNumber(c.req.query('fov'), { label: 'fov', min: 0.1, max: 0.9, fallback: 0.3 })
  } catch (error) {
    return apiError(c, error)
  }

  try {
    const cached = await edgeMatch(c.req.raw)
    if (cached) return withCacheState(cached, 'HIT')

    let data
    try {
      data = await briefSpherex(ra, dec, fov)
    } catch (error) {
      const fallback =
        Math.abs(ra - DEFAULT_FIELD.ra) < 1e-9 &&
        Math.abs(dec - DEFAULT_FIELD.dec) < 1e-9 &&
        Math.abs(fov - DEFAULT_FIELD.fov) < 1e-9
          ? await bundledFind(c)
          : null
      if (!fallback) throw error
      data = briefFromFind(fallback)
      c.header('X-Data-Fallback', 'bundled')
    }
    c.header('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=60')
    c.header('X-Data-Source', asciiHeader(data.source.label))
    const response = c.json(data)
    edgeStore(c, response)
    return withCacheState(response, 'MISS')
  } catch (error) {
    return apiError(c, error)
  }
})

app.get('/api/spherex/frames', async (c) => {
  let ra: number
  let dec: number
  let fov: number
  let limit: number
  let requestedDetector: 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6'
  let palette: 'iridescent' | 'gold' | 'ice' | 'mono'
  let stretch: 'linear' | 'asinh' | 'log'
  try {
    ra = queryNumber(c.req.query('ra'), { label: 'ra', min: 0, max: 360, fallback: 150 })
    dec = queryNumber(c.req.query('dec'), { label: 'dec', min: -90, max: 90, fallback: 19.5 })
    fov = queryNumber(c.req.query('fov'), { label: 'fov', min: 0.1, max: 0.9, fallback: 0.3 })
    limit = Math.round(queryNumber(c.req.query('limit'), { label: 'limit', min: 2, max: 8, fallback: 6 }))
    requestedDetector = queryEnum(c.req.query('detector'), ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'] as const, 'D2')
    palette = queryEnum(c.req.query('palette'), ['iridescent', 'gold', 'ice', 'mono'] as const, 'iridescent')
    stretch = queryEnum(c.req.query('stretch'), ['linear', 'asinh', 'log'] as const, 'asinh')
  } catch (error) {
    return apiError(c, error)
  }

  try {
    const cached = await edgeMatch(c.req.raw)
    if (cached) return withCacheState(cached, 'HIT')

    let data: IrsaFind
    try {
      data = await findSpherex(ra, dec, fov)
    } catch (error) {
      const fallback =
        Math.abs(ra - DEFAULT_FIELD.ra) < 1e-9 &&
        Math.abs(dec - DEFAULT_FIELD.dec) < 1e-9 &&
        Math.abs(fov - DEFAULT_FIELD.fov) < 1e-9
          ? await bundledFind(c)
          : null
      if (!fallback) throw error
      data = fallback
    }

    const groups = new Map<string, IrsaObservation[]>()
    for (const observation of data.observations) {
      const key = observation.obsid.replace(/_\d+$/, '')
      const rows = groups.get(key) ?? []
      rows.push(observation)
      groups.set(key, rows)
    }

    const available = new Set<string>()
    for (const rows of groups.values()) {
      for (const observation of rows) for (const detector of observation.detectors) available.add(detector.detector)
    }
    const detector = available.has(requestedDetector) ? requestedDetector : [...available].sort()[0]
    if (!detector) throw new ApiError(502, 'No detector products were returned for this field.', 'NO_DETECTORS')

    const frames = [...groups.values()]
      .map((rows) => {
        const ordered = [...rows].sort((a, b) => a.mjd - b.mjd)
        const row = ordered.find((observation) => observation.detectors.some((item) => item.detector === detector))
        const product = row?.detectors.find((item) => item.detector === detector)
        return row && product ? { row, product } : null
      })
      .filter((item): item is { row: IrsaObservation; product: IrsaFind['observations'][number]['detectors'][number] } => item !== null)
      .sort((a, b) => a.row.mjd - b.row.mjd)

    if (!frames.length) {
      throw new ApiError(502, `No ${detector} products were returned for this field.`, 'NO_PRODUCTS')
    }

    const picked = frames.length <= limit
      ? frames
      : Array.from(new Set(Array.from({ length: limit }, (_, index) => Math.round((index * (frames.length - 1)) / (limit - 1))))).map(
          (index) => frames[index],
        )
    const query = (uri: string) =>
      `/api/spherex/png?${new URLSearchParams({
        uri, ra: String(ra), dec: String(dec), fov: String(fov),
        palette, stretch, v: '7',
      }).toString()}`

    c.header('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=60')
    c.header('X-Data-Source', asciiHeader(data.source.label))
    if (data.cachedAt) c.header('X-Data-Fallback', 'last-good')
    const response = c.json({
      source: data.source,
      field: { ra, dec, fov },
      summary: data.summary,
      sky: skyContext(ra, dec),
      detector,
      detectorRequested: requestedDetector,
      availableDetectors: [...available].sort(),
      palette,
      stretch,
      frames: picked.map(({ row, product }) => ({
        id: row.obsid.replace(/_\d+$/, ''),
        obsid: row.obsid,
        iso: row.iso,
        date: row.iso.slice(0, 10),
        detector: product.detector,
        band: product.band,
        file: product.file,
        uri: product.uri,
        pngUrl: query(product.uri),
      })),
    })
    edgeStore(c, response)
    return withCacheState(response, 'MISS')
  } catch (error) {
    return apiError(c, error)
  }
})

app.get('/api/spherex/png', async (c) => {
  try {
    const rawUri = c.req.query('uri')
    if (!rawUri) throw new ApiError(400, 'uri is required.', 'MISSING_QUERY')
    const uri = validateIrsaProductUri(rawUri)
    const ra = queryNumber(c.req.query('ra'), { label: 'ra', min: 0, max: 360 })
    const dec = queryNumber(c.req.query('dec'), { label: 'dec', min: -90, max: 90 })
    const fov = queryNumber(c.req.query('fov'), { label: 'fov', min: 0.02, max: 0.9, fallback: 0.3 })
    const palette = queryEnum(c.req.query('palette'), ['iridescent', 'gold', 'ice', 'mono'] as const, 'iridescent')
    const stretch = queryEnum(c.req.query('stretch'), ['linear', 'asinh', 'log'] as const, 'asinh')
    const pixels = c.req.query('pixels')
      ? Math.round(queryNumber(c.req.query('pixels'), { label: 'pixels', min: 128, max: 1400 }))
      : null
    const sizeOverride = pixels ? `${pixels}pix` : undefined

    const cached = await edgeMatch(c.req.raw)
    if (cached) return withCacheState(cached, 'HIT')

    const cutout = await getCutout(uri, ra, dec, fov, sizeOverride)
    let rasterResult
    try {
      rasterResult = await rasterizeCutoutCached(
        `${cutout.uri}|${ra.toFixed(6)}|${dec.toFixed(6)}|${cutout.sizeLabel}|${palette}|${stretch}`,
        cutout.buffer,
        { palette, stretch },
      )
    } catch {
      throw new ApiError(502, 'IRSA returned a cutout the service could not rasterize.', 'BAD_UPSTREAM_RESPONSE')
    }
    const raster = rasterResult.raster

    c.header('Content-Type', 'image/png')
    c.header('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400')
    c.header('X-Data-Source', 'IRSA SPHEREx cutout raster')
    c.header('X-Data-Url', cutout.uri)
    c.header('X-Cutout-Cache', cutout.cached ? 'HIT' : 'MISS')
    c.header('X-Cutout-Size', cutout.sizeLabel)
    c.header('X-Raster-Cache', rasterResult.cached ? 'HIT' : 'MISS')
    c.header('X-Frame-Palette', palette)
    c.header('X-Frame-Stretch', stretch)
    c.header('X-Frame-Width', String(raster.width))
    c.header('X-Frame-Height', String(raster.height))
    c.header('X-Frame-Min', String(raster.stats.min))
    c.header('X-Frame-Max', String(raster.stats.max))
    c.header('X-Frame-Low', String(raster.stats.low))
    c.header('X-Frame-High', String(raster.stats.high))
    c.header('X-Frame-Median', String(raster.stats.median))
    c.header('X-Frame-Mean', String(raster.stats.mean))
    c.header('X-Frame-Variance-Median', String(raster.varianceStats?.median ?? ''))
    c.header('X-Frame-Zodi-Median', String(raster.zodiStats?.median ?? ''))
    c.header('X-Frame-Flagged', String(raster.flaggedPixels))
    c.header('X-Frame-Pixel-Scale', String(raster.pixelScale ?? ''))
    c.header('X-Frame-Wave-Min', String(raster.wave?.minWavelength ?? ''))
    c.header('X-Frame-Wave-Max', String(raster.wave?.maxWavelength ?? ''))
    c.header('X-Frame-Wave-BW-Min', String(raster.wave?.minBandwidth ?? ''))
    c.header('X-Frame-Wave-BW-Max', String(raster.wave?.maxBandwidth ?? ''))
    c.header('X-Frame-Date-Avg', asciiHeader(raster.dateAvg))
    c.header('X-Frame-Exposure', String(raster.exposure ?? ''))
    c.header('X-Frame-Bunit', asciiHeader(raster.bunit))
    c.header('X-Frame-Detector', asciiHeader(raster.detector))
    c.header('X-Frame-Band', asciiHeader(raster.band))
    c.header('X-Frame-Obsid', asciiHeader(raster.obsid))
    if (raster.center) {
      c.header('X-Frame-Ra', String(raster.center.ra))
      c.header('X-Frame-Dec', String(raster.center.dec))
    }
    if (raster.wcsCorners) {
      const { topLeft, topRight, bottomLeft, bottomRight } = raster.wcsCorners
      c.header('X-Frame-WCS-Corners', [topLeft, topRight, bottomLeft, bottomRight]
        .map((corner) => `${corner.ra.toFixed(7)},${corner.dec.toFixed(7)}`)
        .join(';'))
    }
    if (raster.sky) {
      c.header('X-Frame-Constellation', asciiHeader(raster.sky.constellation.name))
      c.header('X-Frame-Constellation-Symbol', asciiHeader(raster.sky.constellation.symbol))
      c.header('X-Frame-Galactic-L', String(raster.sky.galactic.l))
      c.header('X-Frame-Galactic-B', String(raster.sky.galactic.b))
      c.header('X-Frame-Ecliptic-Lon', String(raster.sky.ecliptic.lon))
      c.header('X-Frame-Ecliptic-Lat', String(raster.sky.ecliptic.lat))
    }
    const response = c.body(raster.png.buffer as ArrayBuffer)
    edgeStore(c, response)
    return withCacheState(response, 'MISS')
  } catch (error) {
    return apiError(c, error)
  }
})

app.get('/api/spherex/cutout', async (c) => {
  try {
    const rawUri = c.req.query('uri')
    if (!rawUri) throw new ApiError(400, 'uri is required.', 'MISSING_QUERY')
    const uri = validateIrsaProductUri(rawUri)
    const ra = queryNumber(c.req.query('ra'), { label: 'ra', min: 0, max: 360 })
    const dec = queryNumber(c.req.query('dec'), { label: 'dec', min: -90, max: 90 })
    const fov = queryNumber(c.req.query('fov'), { label: 'fov', min: 0.02, max: 0.9, fallback: 0.3 })

    const cached = await edgeMatch(c.req.raw)
    if (cached) return withCacheState(cached, 'HIT')

    const data = await getCutout(uri, ra, dec, fov)
    c.header('Content-Type', 'application/fits')
    c.header('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400')
    c.header('X-Data-Source', 'IRSA SPHEREx cutout')
    c.header('X-Data-Url', data.uri)
    c.header('X-Cutout-Size', String(data.size))
    c.header('X-Cutout-Cache', data.cached ? 'HIT' : 'MISS')
    const response = c.body(data.buffer)
    edgeStore(c, response)
    return withCacheState(response, 'MISS')
  } catch (error) {
    return apiError(c, error)
  }
})

app.get('/api/spherex/summary', async (c) => {
  try {
    const rawUri = c.req.query('uri')
    if (!rawUri) throw new ApiError(400, 'uri is required.', 'MISSING_QUERY')
    const uri = validateIrsaProductUri(rawUri)
    const ra = queryNumber(c.req.query('ra'), { label: 'ra', min: 0, max: 360 })
    const dec = queryNumber(c.req.query('dec'), { label: 'dec', min: -90, max: 90 })
    const fov = queryNumber(c.req.query('fov'), { label: 'fov', min: 0.02, max: 0.9, fallback: 0.3 })

    const cached = await edgeMatch(c.req.raw)
    if (cached) return withCacheState(cached, 'HIT')

    const cutout = await getCutout(uri, ra, dec, fov)
    const summaryKey = `${cutout.uri}|${ra.toFixed(6)}|${dec.toFixed(6)}|${fov.toFixed(3)}`
    let summary = summaryCache.get(summaryKey)
    let summaryCached = Boolean(summary)
    if (!summary) {
      try {
        summary = summarizeCutout(cutout.buffer)
      } catch {
        throw new ApiError(502, 'IRSA returned a cutout the Worker could not summarize.', 'BAD_UPSTREAM_RESPONSE')
      }
      summaryCache.set(summaryKey, summary)
    }
    const sky = summary.center ? skyContext(summary.center.ra, summary.center.dec) : skyContext(ra, dec)

    c.header('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400')
    c.header('X-Data-Source', 'IRSA SPHEREx cutout header summary')
    c.header('X-Cutout-Cache', cutout.cached ? 'HIT' : 'MISS')
    c.header('X-Summary-Cache', summaryCached ? 'HIT' : 'MISS')
    const response = c.json({
      source: {
        label: 'IRSA SPHEREx level-2 cutout · server-side FITS summary',
        url: cutout.uri,
        method: 'IRSA cutout service · real IMAGE, FLAGS and WCS-WAVE',
      },
      uri: cutout.uri,
      cutoutSize: cutout.size,
      sky,
      summary,
    })
    edgeStore(c, response)
    return withCacheState(response, 'MISS')
  } catch (error) {
    return apiError(c, error)
  }
})

app.get('/api/spherex/spectrum', async (c) => {
  try {
    const rawUris = c.req.queries('uri') ?? []
    if (!rawUris.length) throw new ApiError(400, 'At least one uri is required.', 'MISSING_QUERY')
    const uris = [...new Set(rawUris.map((uri) => validateIrsaProductUri(uri)))]
    if (uris.length > MAX_SPECTRUM_DETECTORS) {
      throw new ApiError(400, `A maximum of ${MAX_SPECTRUM_DETECTORS} detectors can be extracted.`, 'TOO_MANY_DETECTORS')
    }
    const ra = queryNumber(c.req.query('ra'), { label: 'ra', min: 0, max: 360 })
    const dec = queryNumber(c.req.query('dec'), { label: 'dec', min: -90, max: 90 })

    const cached = await edgeMatch(c.req.raw)
    if (cached) return withCacheState(cached, 'HIT')

    const segments = []
    const errors: string[] = []
    for (let index = 0; index < uris.length; index += SPECTRUM_CONCURRENCY) {
      const batch = uris.slice(index, index + SPECTRUM_CONCURRENCY)
      const results = await Promise.allSettled(batch.map((uri) => getSpectrum(uri, ra, dec)))
      for (const result of results) {
        if (result.status === 'fulfilled') segments.push(result.value)
        else errors.push(publicReason(result.reason))
      }
    }

    if (!segments.length) {
      throw new ApiError(502, errors[0] ?? 'No real spectra were returned.', 'NO_SPECTRA', { errors })
    }

    c.header('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=60')
    c.header('X-Data-Source', 'IRSA SPHEREx level-2 cutouts')
    const response = c.json({
      source: {
        label: 'IRSA SPHEREx level-2 cutouts · real pixel aperture',
        url: 'https://irsa.ipac.caltech.edu/',
        method: '24,2040 pixel strip · 5-pixel aperture · WCS-WAVE',
      },
      ra,
      dec,
      segments,
      errors,
    })
    edgeStore(c, response)
    return withCacheState(response, 'MISS')
  } catch (error) {
    return apiError(c, error)
  }
})

app.get('/api/sky/context', async (c) => {
  try {
    const ra = queryNumber(c.req.query('ra'), { label: 'ra', min: 0, max: 360, fallback: 150 })
    const dec = queryNumber(c.req.query('dec'), { label: 'dec', min: -90, max: 90, fallback: 19.5 })
    const radius = queryNumber(c.req.query('radius'), { label: 'radius', min: 0.05, max: 10, fallback: 2 })

    const cached = await edgeMatch(c.req.raw)
    if (cached) return withCacheState(cached, 'HIT')

    const data = skyNeighborhood(ra, dec, radius)
    c.header('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=3600')
    c.header('X-Data-Source', 'astronomy-engine IAU constellation geometry')
    const response = c.json({ source: { label: 'IAU constellation geometry · astronomy-engine', method: data.method }, ra, dec, ...data })
    edgeStore(c, response)
    return withCacheState(response, 'MISS')
  } catch (error) {
    return apiError(c, error)
  }
})

app.get('/api/catalog', async (c) => {
  try {
    const survey = queryEnum(c.req.query('survey'), ['gaia', 'wise'] as const, 'gaia')
    const ra = queryNumber(c.req.query('ra'), { label: 'ra', min: 0, max: 360, fallback: 150 })
    const dec = queryNumber(c.req.query('dec'), { label: 'dec', min: -90, max: 90, fallback: 19.5 })
    const radius = queryNumber(c.req.query('radius'), { label: 'radius', min: 0.02, max: 2, fallback: 0.2 })

    const cached = await edgeMatch(c.req.raw)
    if (cached) return withCacheState(cached, 'HIT')

    const data = await getCatalog(survey, ra, dec, radius)
    c.header('Cache-Control', 'public, max-age=1800, s-maxage=1800, stale-while-revalidate=300')
    c.header('X-Data-Source', asciiHeader(data.source.label))
    const response = c.json(data)
    edgeStore(c, response)
    return withCacheState(response, 'MISS')
  } catch (error) {
    return apiError(c, error)
  }
})

app.all('/api/*', (c) => apiError(c, new ApiError(404, 'API route not found.', 'NOT_FOUND')))

app.all('*', async (c) => {
  const response = await c.env.ASSETS.fetch(c.req.raw)
  const headers = new Headers(response.headers)
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'no-referrer')
  headers.set('Cross-Origin-Resource-Policy', 'same-origin')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
})

app.onError((error, c) => {
  if (c.req.path.startsWith('/api/')) return apiError(c, error)
  console.error(
    JSON.stringify({
      event: 'asset_error',
      path: c.req.path,
      detail: error instanceof Error ? error.message.slice(0, 500) : 'unknown error',
    }),
  )
  return c.text('Internal server error', 500)
})

export default app
