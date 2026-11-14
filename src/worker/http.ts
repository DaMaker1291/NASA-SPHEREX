export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, message: string, code = 'API_ERROR', details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504])
const MAX_URI_LENGTH = 2048
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type NumberRule = {
  label: string
  min: number
  max: number
  fallback?: number
}

export function queryNumber(value: string | undefined, rule: NumberRule): number {
  if (value === undefined) {
    if (rule.fallback !== undefined) return rule.fallback
    throw new ApiError(400, `${rule.label} is required.`, 'MISSING_QUERY')
  }
  if (!value.trim()) throw new ApiError(400, `${rule.label} must be a number.`, 'INVALID_QUERY')
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new ApiError(400, `${rule.label} must be a finite number.`, 'INVALID_QUERY')
  }
  if (parsed < rule.min || parsed > rule.max) {
    throw new ApiError(400, `${rule.label} must be between ${rule.min} and ${rule.max}.`, 'OUT_OF_RANGE')
  }
  return parsed
}

export function queryEnum<T extends string>(
  value: string | undefined,
  values: readonly T[],
  fallback: T,
): T {
  if (value === undefined) return fallback
  if (!values.includes(value as T)) {
    throw new ApiError(400, `Expected one of: ${values.join(', ')}.`, 'INVALID_QUERY')
  }
  return value as T
}

export function validateIrsaProductUri(raw: string): string {
  if (!raw || raw.length > MAX_URI_LENGTH) {
    throw new ApiError(400, 'uri must be a valid IRSA product URL.', 'INVALID_URI')
  }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new ApiError(400, 'uri must be a valid URL.', 'INVALID_URI')
  }

  if (url.protocol !== 'https:' || url.hostname !== 'irsa.ipac.caltech.edu') {
    throw new ApiError(400, 'Only https://irsa.ipac.caltech.edu product URLs are allowed.', 'INVALID_URI')
  }
  if (url.port || url.username || url.password || url.hash) {
    throw new ApiError(400, 'That IRSA URL has unsupported components.', 'INVALID_URI')
  }

  let path: string
  try {
    path = decodeURIComponent(url.pathname)
  } catch {
    throw new ApiError(400, 'uri has invalid URL encoding.', 'INVALID_URI')
  }

  if (path.includes('..') || path.includes('\\')) {
    throw new ApiError(400, 'uri must not contain path traversal.', 'INVALID_URI')
  }
  if (!/^\/ibe\/data\/spherex\/[A-Za-z0-9._/-]+\.fits$/i.test(path)) {
    throw new ApiError(400, 'uri must point to a SPHEREx FITS product.', 'INVALID_URI')
  }

  return url.toString()
}

export function parseCsv(input: string): Array<Record<string, string>> {
  const text = input.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }

  if (quoted) throw new Error('Malformed CSV: unterminated quoted field.')
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  if (!rows.length) return []

  const headers = rows[0].map((header) => header.trim())
  if (!headers.length || headers.some((header) => !header)) {
    throw new Error('Malformed CSV: missing header names.')
  }

  return rows
    .slice(1)
    .filter((values) => values.some((value) => value.trim() !== ''))
    .map((values) => {
      const parsed: Record<string, string> = {}
      headers.forEach((header, index) => {
        parsed[header] = (values[index] ?? '').trim()
      })
      return parsed
    })
}

export class TtlCache<K, V> {
  private readonly entries = new Map<K, { expiresAt: number; value: V }>()
  private readonly ttlMs: number
  private readonly maxEntries: number

  constructor(ttlMs: number, maxEntries: number) {
    this.ttlMs = ttlMs
    this.maxEntries = maxEntries
  }

  get(key: K): V | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (Date.now() >= entry.expiresAt) {
      this.entries.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key: K, value: V) {
    if (!this.entries.has(key) && this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next()
      if (!oldest.done) this.entries.delete(oldest.value)
    }
    this.entries.set(key, { expiresAt: Date.now() + this.ttlMs, value })
  }
}

export class SingleFlight<K, V> {
  private readonly active = new Map<K, Promise<V>>()
  private readonly maxActive: number

  constructor(maxActive = 64) {
    this.maxActive = maxActive
  }

  run(key: K, task: () => Promise<V>): Promise<V> {
    const existing = this.active.get(key)
    if (existing) return existing
    if (this.active.size >= this.maxActive) return task()

    const promise = Promise.resolve()
      .then(task)
      .finally(() => {
        if (this.active.get(key) === promise) this.active.delete(key)
      })
    this.active.set(key, promise)
    return promise
  }
}

function retryDelay(response: Response, attempt: number) {
  const retryAfter = response.headers.get('retry-after')
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 8000)
    const date = Date.parse(retryAfter)
    if (Number.isFinite(date)) return Math.min(Math.max(0, date - Date.now()), 8000)
  }
  return Math.min(8000, 300 * 2 ** attempt + Math.floor(Math.random() * 200))
}

export async function fetchWithRetry(
  input: string | URL,
  init: RequestInit,
  options: { attempts?: number; timeoutMs: number; totalTimeoutMs?: number },
): Promise<Response> {
  const attempts = Math.max(1, Math.min(5, options.attempts ?? 3))
  const startedAt = Date.now()
  const totalTimeoutMs = options.totalTimeoutMs ?? null
  const elapsed = () => Date.now() - startedAt
  const remaining = () => (totalTimeoutMs === null ? Number.POSITIVE_INFINITY : totalTimeoutMs - elapsed())
  const canWait = (delay: number) => totalTimeoutMs === null || elapsed() + delay < totalTimeoutMs
  let lastError: unknown

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (remaining() <= 0) break
    const controller = new AbortController()
    const attemptTimeout = Math.max(1000, Math.min(options.timeoutMs, remaining()))
    let timer: ReturnType<typeof setTimeout> | undefined
    const hardTimeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(new ApiError(504, 'The upstream archive timed out.', 'UPSTREAM_TIMEOUT'))
      }, attemptTimeout)
    })
    try {
      const request = fetch(input, { ...init, signal: controller.signal })
      request.catch(() => {})
      const response = await Promise.race([request, hardTimeout])
      if (response.ok || !RETRYABLE.has(response.status) || attempt === attempts - 1) {
        return response
      }
      const delay = retryDelay(response, attempt)
      await response.body?.cancel().catch(() => {})
      if (!canWait(delay)) return response
      await sleep(delay)
    } catch (error) {
      lastError = error
      if (attempt === attempts - 1) break
      const delay = retryDelay(new Response(null), attempt)
      if (!canWait(delay)) break
      await sleep(delay)
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }

  if (lastError instanceof DOMException && lastError.name === 'AbortError') {
    throw new ApiError(504, 'The upstream archive timed out.', 'UPSTREAM_TIMEOUT')
  }
  if (totalTimeoutMs !== null && remaining() <= 0) {
    throw new ApiError(504, 'The upstream archive took too long to respond.', 'UPSTREAM_TIMEOUT')
  }
  throw new ApiError(502, 'The upstream archive could not be reached.', 'UPSTREAM_UNAVAILABLE')
}

export async function assertUpstreamOk(response: Response, label: string) {
  if (response.ok) return
  await response.body?.cancel().catch(() => {})
  if (response.status === 429 || response.status === 503) {
    throw new ApiError(503, `${label} is busy; please retry in a moment.`, 'UPSTREAM_BUSY')
  }
  if (response.status >= 500) {
    throw new ApiError(502, `${label} is temporarily unavailable (${response.status}).`, 'UPSTREAM_UNAVAILABLE')
  }
  throw new ApiError(502, `${label} rejected the request (${response.status}).`, 'UPSTREAM_ERROR')
}

function contentLength(response: Response) {
  const raw = response.headers.get('content-length')
  if (!raw) return null
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : null
}

async function readStreamLimited(response: Response, maxBytes: number, timeoutMs: number) {
  const declared = contentLength(response)
  if (declared !== null && declared > maxBytes) {
    await response.body?.cancel().catch(() => {})
    throw new ApiError(502, 'The upstream response was too large.', 'UPSTREAM_TOO_LARGE')
  }
  if (!response.body) return new Uint8Array(0)

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let timedOut = false
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true
      reader.cancel().catch(() => {})
      reject(new ApiError(504, 'The upstream archive stopped sending data.', 'UPSTREAM_TIMEOUT'))
    }, timeoutMs)
  })

  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout])
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        throw new ApiError(502, 'The upstream response was too large.', 'UPSTREAM_TOO_LARGE')
      }
      chunks.push(value)
    }
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    if (timedOut) await reader.cancel().catch(() => {})
  }

  const output = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output
}

export async function readTextLimited(response: Response, maxBytes: number, timeoutMs = 20_000): Promise<string> {
  return new TextDecoder().decode(await readStreamLimited(response, maxBytes, timeoutMs))
}

export async function readArrayBufferLimited(
  response: Response,
  maxBytes: number,
  timeoutMs = 30_000,
): Promise<ArrayBuffer> {
  return (await readStreamLimited(response, maxBytes, timeoutMs)).buffer
}
