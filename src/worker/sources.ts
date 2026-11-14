export type SourceId = 'sia' | 'tap' | 's3' | 'hips'

export type SourceProbe = {
  id: SourceId
  label: string
  ok: boolean
  status: number | null
  latencyMs: number | null
  detail: string
}

export type SourceHealth = {
  checkedAt: string
  ok: boolean
  discoveryOk: boolean
  pixelsOk: boolean
  sources: SourceProbe[]
}

const CACHE_MS = 15_000
const PROBE_TIMEOUT_MS = 6_000

const SIA_PROBE =
  'https://irsa.ipac.caltech.edu/SIA?COLLECTION=spherex_dr1&POS=circle+150+19.5+0.01&RESPONSEFORMAT=CSV&MAXREC=1'
const TAP_PROBE =
  'https://irsa.ipac.caltech.edu/TAP/sync?QUERY=SELECT+TOP+1+*+FROM+TAP_SCHEMA.tables&FORMAT=csv'
const S3_PROBE =
  'https://nasa-irsa-spherex.s3.us-east-1.amazonaws.com/?list-type=2&max-keys=1&prefix=dr1/level2/'
const HIPS_PROBE =
  'https://nasa-irsa-spherex.s3.us-east-1.amazonaws.com/dr1/hips5_cube/hips_20261026/Norder5/Dir0/Npix0_cube.fits'

let cache: { at: number; value: SourceHealth } | null = null
let inFlight: Promise<SourceHealth> | null = null

async function probe(
  id: SourceId,
  label: string,
  url: string,
  accept: string,
  range = false,
): Promise<SourceProbe> {
  const startedAt = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      headers: {
        Accept: accept,
        ...(range ? { Range: 'bytes=0-0' } : {}),
      },
      signal: controller.signal,
    })
    await response.body?.cancel().catch(() => {})
    return {
      id,
      label,
      ok: response.ok,
      status: response.status,
      latencyMs: Math.max(0, Date.now() - startedAt),
      detail: response.ok ? 'reachable' : `HTTP ${response.status}`,
    }
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError'
    return {
      id,
      label,
      ok: false,
      status: null,
      latencyMs: Math.max(0, Date.now() - startedAt),
      detail: timedOut ? `timed out after ${PROBE_TIMEOUT_MS / 1000}s` : 'network error',
    }
  } finally {
    clearTimeout(timer)
  }
}

async function buildHealth(): Promise<SourceHealth> {
  const sources = await Promise.all([
    probe('sia', 'SIA2 discovery', SIA_PROBE, 'text/csv'),
    probe('tap', 'IRSA TAP (catalog)', TAP_PROBE, 'text/csv'),
    probe('s3', 'S3 bucket', S3_PROBE, 'application/xml'),
    probe('hips', 'HIPS cube', HIPS_PROBE, 'application/fits', true),
  ])
  return {
    checkedAt: new Date().toISOString(),
    ok: sources.every((source) => source.ok),
    discoveryOk: sources.some((source) => source.id === 'sia' && source.ok),
    pixelsOk: sources.some((source) => (source.id === 's3' || source.id === 'hips') && source.ok),
    sources,
  }
}

export async function getSourceHealth(): Promise<SourceHealth> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value
  if (inFlight) return inFlight

  inFlight = buildHealth()
    .then((value) => {
      cache = { at: Date.now(), value }
      return value
    })
    .finally(() => {
      inFlight = null
    })
  return inFlight
}
