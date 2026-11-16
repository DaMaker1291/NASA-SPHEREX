import { summarizeObservations, type IrsaFind, type IrsaObservation } from './irsa'

type AssetFetcher = {
  fetch(request: Request): Promise<Response>
}

type IndexManifest = {
  schemaVersion: number
  generatedAt: string
  bucket: string
  prefix: string
  detector: string
  cellDegrees: number
  xCells: number
  yCells: number
  pointings: number
  complete: boolean
  source: string
}

type IndexEntry = {
  r: number
  d: number
  t: string
  o: string
  k: string
  s?: number
}

const INDEX_ROOT = '/data/spherex/s3-index'
const MANIFEST_TTL_MS = 300_000
const SHARD_TTL_MS = 600_000
const MAX_SHARDS = 160
const MAX_VISITS = 240
const DETECTORS = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'] as const
const RAD = Math.PI / 180

let manifestCache: { value: IndexManifest; at: number } | null = null
const shardCache = new Map<string, { value: IndexEntry[]; at: number }>()

function angularDistance(ra1: number, dec1: number, ra2: number, dec2: number) {
  const dRa = (ra1 - ra2) * RAD
  const dDec = (dec1 - dec2) * RAD
  const a = Math.sin(dDec / 2) ** 2 + Math.cos(dec1 * RAD) * Math.cos(dec2 * RAD) * Math.sin(dRa / 2) ** 2
  return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a))) / RAD
}

async function loadManifest(assets: AssetFetcher, origin: string): Promise<IndexManifest | null> {
  if (manifestCache && Date.now() - manifestCache.at < MANIFEST_TTL_MS) return manifestCache.value
  try {
    const response = await assets.fetch(new Request(new URL(`${INDEX_ROOT}/index.json`, origin), { headers: { Accept: 'application/json' } }))
    if (!response.ok) return null
    const value = (await response.json()) as IndexManifest
    if (value?.schemaVersion !== 1 || !Number.isFinite(value.cellDegrees) || !value.xCells || !value.yCells) return null
    manifestCache = { value, at: Date.now() }
    return value
  } catch {
    return null
  }
}

async function loadShard(assets: AssetFetcher, origin: string, key: string): Promise<IndexEntry[]> {
  const cached = shardCache.get(key)
  if (cached && Date.now() - cached.at < SHARD_TTL_MS) return cached.value
  try {
    const response = await assets.fetch(new Request(new URL(`${INDEX_ROOT}/cells/cell-${key}.json`, origin), { headers: { Accept: 'application/json' } }))
    if (!response.ok) return []
    const value = (await response.json()) as IndexEntry[]
    if (!Array.isArray(value)) return []
    if (shardCache.size >= MAX_SHARDS) {
      const oldest = shardCache.keys().next()
      if (!oldest.done) shardCache.delete(oldest.value)
    }
    shardCache.set(key, { value, at: Date.now() })
    return value
  } catch {
    return []
  }
}

function nearbyCells(manifest: IndexManifest, ra: number, dec: number, radiusDegrees: number) {
  const { cellDegrees: cell, xCells, yCells } = manifest
  const minX = Math.floor((ra - radiusDegrees) / cell)
  const maxX = Math.floor((ra + radiusDegrees) / cell)
  const minY = Math.max(0, Math.floor((dec - radiusDegrees + 90) / cell))
  const maxY = Math.min(yCells - 1, Math.floor((dec + radiusDegrees + 90) / cell))
  const cells: string[] = []
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const wrapped = ((x % xCells) + xCells) % xCells
      const key = `${wrapped}-${y}`
      if (!cells.includes(key)) cells.push(key)
    }
  }
  return cells
}

function detectorKey(key: string, detector: string) {
  const number = detector.slice(1)
  return key
    .replace(/\/2\//, `/${number}/`)
    .replace(/_1D2_/, `_1D${number}_`)
}

function entryObservation(entry: IndexEntry): IrsaObservation | null {
  const date = new Date(entry.t)
  if (Number.isNaN(date.getTime())) return null
  const detectors = DETECTORS.flatMap((detector) => {
    const key = detectorKey(entry.k, detector)
    const file = key.split('/').pop() ?? ''
    if (!file.endsWith('.fits')) return []
    return [{
      detector,
      band: detector,
      file,
      uri: `https://irsa.ipac.caltech.edu/ibe/data/spherex/${key}`,
    }]
  })
  if (!detectors.length) return null
  return {
    id: entry.o,
    mjd: date.getTime() / 86400000 + 40587,
    iso: date.toISOString(),
    obsid: entry.o,
    release: 'DR1',
    detectors,
  }
}

export async function findSpherexInS3Index(
  assets: AssetFetcher,
  origin: string,
  ra: number,
  dec: number,
  fov: number,
): Promise<IrsaFind | null> {
  const manifest = await loadManifest(assets, origin)
  if (!manifest) return null

  const radius = 2.45 + fov / 2
  const cells = nearbyCells(manifest, ra, dec, radius + manifest.cellDegrees)
  const shards = await Promise.all(cells.map((key) => loadShard(assets, origin, key)))
  const candidates = shards.flat()
  const seen = new Set<string>()
  const observations: IrsaObservation[] = []
  for (const entry of candidates) {
    if (!entry || !Number.isFinite(entry.r) || !Number.isFinite(entry.d)) continue
    if (seen.has(entry.o)) continue
    if (angularDistance(ra, dec, entry.r, entry.d) > radius) continue
    const observation = entryObservation(entry)
    if (!observation) continue
    seen.add(entry.o)
    observations.push(observation)
    if (observations.length >= MAX_VISITS) break
  }

  if (!observations.length) {
    return {
      source: {
        label: `NASA IRSA S3 index · DR1 · ${manifest.complete ? 'no indexed coverage' : 'partial index'}`,
        url: manifest.bucket,
        query: `S3 spatial index · ${manifest.pointings} pointings`,
      },
      field: { ra, dec, fov },
      observations: [],
      summary: summarizeObservations([]),
      coverage: {
        observed: false,
        message: manifest.complete
          ? 'No DR1 level-2 visit is indexed within this field. The S3 index is complete; this region is not covered.'
          : 'No indexed DR1 visit is near this field yet. The S3 index is still being populated; IRSA SIA2 is not required for indexed fields.',
        checkedAt: new Date().toISOString(),
        releases: ['DR1'],
      },
    }
  }

  observations.sort((a, b) => a.mjd - b.mjd)
  return {
    source: {
      label: 'NASA IRSA S3 index · DR1 · SIA2-independent',
      url: manifest.bucket,
      query: `S3 spatial index · ${manifest.pointings} pointings · cell ${manifest.cellDegrees}°`,
    },
    field: { ra, dec, fov },
    observations,
    summary: summarizeObservations(observations),
    coverage: {
      observed: true,
      message: `${observations.length} indexed DR1 visit${observations.length === 1 ? '' : 's'} found without SIA2.`,
      checkedAt: new Date().toISOString(),
      releases: ['DR1'],
    },
  }
}
