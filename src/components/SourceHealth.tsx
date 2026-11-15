import { Activity } from 'lucide-react'

import { cx } from '../lib/cx'
import type { SourceHealth } from '../lib/real'
import { Card } from './Card'

const PENDING = [
  { id: 'sia', label: 'SIA2 discovery · DR1', ok: false, latencyMs: null, detail: 'checking' },
  { id: 'sia-qr3', label: 'SIA2 discovery · QR3', ok: false, latencyMs: null, detail: 'checking' },
  { id: 'tap', label: 'IRSA TAP', ok: false, latencyMs: null, detail: 'checking' },
  { id: 's3', label: 'S3 bucket', ok: false, latencyMs: null, detail: 'checking' },
  { id: 'hips', label: 'HIPS cube', ok: false, latencyMs: null, detail: 'checking' },
] as const

export function SourceHealthPanel({ health, error }: { health: SourceHealth | null; error: string }) {
  const sources = health?.sources ?? PENDING
  const checked = health
    ? new Date(health.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : ''

  return (
    <Card size="sm" className="p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="caps flex items-center gap-1.5 text-[9px] text-muted">
          <Activity className="size-3" aria-hidden /> Real sources
        </p>
        <span className="caps text-[8px] tabular-nums text-muted">{checked ? `checked ${checked}` : 'probing'}</span>
      </div>
      <div className="mt-2 grid gap-1">
        {sources.map((source) => (
          <div key={source.id} className="flex items-center justify-between gap-2 border-t border-line py-1.5 first:border-t-0">
            <span className="flex min-w-0 items-center gap-2 text-[12px]">
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full"
                style={{ background: source.ok ? '#4ade80' : health ? '#fbbf24' : '#94a3b8' }}
              />
              <span className="truncate">{source.label}</span>
            </span>
            <span className={cx('caps shrink-0 text-[8px] tabular-nums', source.ok ? 'text-muted' : 'text-amber-700')}>
              {source.ok ? `${source.latencyMs ?? '—'} ms` : source.detail}
            </span>
          </div>
        ))}
      </div>
      <p className="caps mt-2 text-[8px] leading-relaxed text-muted">
        {error ||
          (health
            ? health.ok
              ? 'Core discovery and pixel sources are reachable. No synthetic sky is drawn.'
              : health.discoveryOk
                ? 'Discovery is up; a real pixel source is degraded. The viewer keeps the last real frame visible.'
                : 'Discovery did not respond on the last probe. Cached real fields remain visible; no synthetic sky is drawn.'
            : 'Checking SIA2 DR1, SIA2 QR3, TAP, S3 and HIPS from the Worker.')}
      </p>
    </Card>
  )
}
