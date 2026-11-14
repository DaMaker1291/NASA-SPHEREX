#!/usr/bin/env node
import { readFileSync } from 'node:fs'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5305'
const TIMEOUT_MS = Number(process.env.STRESS_TIMEOUT_MS ?? 30_000)
const ALLOW_UPSTREAM_FAILURE = process.env.STRESS_ALLOW_UPSTREAM === '1'

const bundled = JSON.parse(readFileSync('public/data/spherex/dr1-150.json', 'utf8'))
const firstDetector = bundled.observations
  .flatMap((observation) => observation.detectors)
  .find((detector) => detector.detector === 'D2')
const uri = firstDetector?.uri
if (!uri) throw new Error('The bundled index has no detector URI to test.')

const cases = [
  {
    name: 'health',
    path: '/api/health',
    count: 40,
    concurrency: 10,
    expected: [200],
  },
  {
    name: 'source probes',
    path: '/api/health/sources',
    count: 6,
    concurrency: 2,
    expected: [200],
  },
  {
    name: 'SIA2 discovery',
    path: '/api/spherex/find?ra=150&dec=19.5&fov=0.3',
    count: 5,
    concurrency: 2,
    expected: [200],
    upstream: true,
  },
  {
    name: 'field brief',
    path: '/api/spherex/brief?ra=150&dec=19.5&fov=0.3',
    count: 5,
    concurrency: 2,
    expected: [200],
    upstream: true,
  },
  {
    name: 'cutout',
    path: `/api/spherex/cutout?uri=${encodeURIComponent(uri)}&ra=150&dec=19.5&fov=0.3`,
    count: 4,
    concurrency: 2,
    expected: [200],
    upstream: true,
    binary: true,
  },
  {
    name: 'cutout summary',
    path: `/api/spherex/summary?uri=${encodeURIComponent(uri)}&ra=150&dec=19.5&fov=0.3`,
    count: 4,
    concurrency: 2,
    expected: [200],
    upstream: true,
  },
  {
    name: 'Gaia catalogue',
    path: '/api/catalog?survey=gaia&ra=150&dec=19.5&radius=0.1',
    count: 4,
    concurrency: 2,
    expected: [200],
    upstream: true,
  },
  {
    name: 'guard: bad RA',
    path: '/api/spherex/find?ra=999&dec=19.5&fov=0.3',
    count: 12,
    concurrency: 6,
    expected: [400],
  },
  {
    name: 'guard: bad URI',
    path: '/api/spherex/cutout?uri=https%3A%2F%2Fexample.com%2Fevil.fits&ra=150&dec=19.5&fov=0.3',
    count: 12,
    concurrency: 6,
    expected: [400],
  },
  {
    name: 'guard: unknown route',
    path: '/api/not-a-route',
    count: 12,
    concurrency: 6,
    expected: [404],
  },
]

const percentile = (sorted, fraction) => {
  if (!sorted.length) return 0
  const at = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))
  return sorted[at]
}

async function once(testCase, index) {
  const started = performance.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let status = 0
  let ok = false
  let detail = ''
  let requestId = ''
  let cache = ''
  let bytes = 0
  try {
    const response = await fetch(`${BASE}${testCase.path}`, { signal: controller.signal })
    status = response.status
    requestId = response.headers.get('x-request-id') ?? ''
    cache = response.headers.get('x-cache') ?? ''
    const body = testCase.binary ? await response.arrayBuffer() : await response.text()
    bytes = testCase.binary ? body.byteLength : Buffer.byteLength(body)
    ok = testCase.expected.includes(status)
    if (testCase.binary) {
      const head = new TextDecoder().decode(body.slice(0, 6))
      if (head !== 'SIMPLE') detail = `not FITS (${head || 'empty'})`
    } else if (body.trim().startsWith('{')) {
      const parsed = JSON.parse(body)
      if (parsed.requestId && parsed.requestId !== requestId) detail = 'requestId mismatch'
    }
  } catch (error) {
    detail = error instanceof Error ? error.message : 'request failed'
  } finally {
    clearTimeout(timer)
  }
  return {
    name: testCase.name,
    index,
    status,
    ok,
    detail,
    requestId,
    cache,
    bytes,
    ms: performance.now() - started,
  }
}

async function run(testCase) {
  const results = []
  let cursor = 0
  const workers = Array.from({ length: Math.min(testCase.concurrency, testCase.count) }, async () => {
    while (true) {
      const index = cursor++
      if (index >= testCase.count) return
      results.push(await once(testCase, index))
    }
  })
  await Promise.all(workers)
  return results
}

const all = []
for (const testCase of cases) {
  const results = await run(testCase)
  all.push(...results)
  const times = results.map((result) => result.ms).sort((a, b) => a - b)
  const statuses = [...new Set(results.map((result) => result.status))].sort()
  const success = results.filter((result) => result.ok).length
  const firstFailure = results.find((result) => !result.ok)
  console.log(
    [
      testCase.name.padEnd(22),
      `${success}/${results.length}`.padStart(7),
      `status ${statuses.join(',') || 'none'}`.padEnd(18),
      `p50 ${percentile(times, 0.5).toFixed(0)}ms`,
      `p95 ${percentile(times, 0.95).toFixed(0)}ms`,
      `max ${Math.max(...times).toFixed(0)}ms`,
      firstFailure ? `FAIL ${firstFailure.detail || `HTTP ${firstFailure.status}`}` : '',
    ].join('  '),
  )
}

const failures = all.filter((result) => !result.ok)
const upstreamFailures = failures.filter((result) => result.status >= 502 && result.status <= 504)
const hardFailures = failures.filter((result) => !(ALLOW_UPSTREAM_FAILURE && result.status >= 502 && result.status <= 504))
const missingRequestIds = all.filter((result) => result.status >= 200 && result.status < 500 && !result.requestId)
const cacheHits = all.filter((result) => result.cache === 'HIT').length
const cacheMisses = all.filter((result) => result.cache === 'MISS').length

console.log('\nverdict')
console.log(`  requests: ${all.length}`)
console.log(`  failures: ${failures.length} (${upstreamFailures.length} upstream 502-504)`)
console.log(`  request id missing: ${missingRequestIds.length}`)
console.log(`  cache: ${cacheHits} hit / ${cacheMisses} miss`)
if (hardFailures.length) {
  for (const failure of hardFailures.slice(0, 12)) {
    console.log(`  FAIL ${failure.name} #${failure.index}: ${failure.detail || `HTTP ${failure.status}`}`)
  }
  process.exitCode = 1
} else if (upstreamFailures.length) {
  console.log('  upstream archive failures were observed; rerun with STRESS_ALLOW_UPSTREAM=1 to treat them as expected degradation.')
  process.exitCode = ALLOW_UPSTREAM_FAILURE ? 0 : 1
}
