import type { Release } from './spherex'

const STATUSES = new Set<Release['status']>(['current', 'archived', 'retired'])

export function parseManifest(data: unknown): { releases: Release[]; updated: string | null } {
  if (!data || typeof data !== 'object') return { releases: [], updated: null }
  const record = data as Record<string, unknown>
  if (!Array.isArray(record.releases)) return { releases: [], updated: null }

  const releases: Release[] = []

  for (const entry of record.releases) {
    if (!entry || typeof entry !== 'object') continue
    const item = entry as Record<string, unknown>
    if (typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.start !== 'string') continue

    releases.push({
      id: item.id,
      name: item.name,
      status: typeof item.status === 'string' && STATUSES.has(item.status as Release['status']) ? (item.status as Release['status']) : 'archived',
      start: item.start,
      cadenceDays: Math.max(1, Number(item.cadenceDays) || 7),
      epochs: Math.max(2, Math.min(24, Number(item.epochs) || 8)),
      product: typeof item.product === 'string' ? item.product : '',
      notes: typeof item.notes === 'string' ? item.notes : '',
    })
  }

  return { releases, updated: typeof record.updated === 'string' ? record.updated : null }
}
