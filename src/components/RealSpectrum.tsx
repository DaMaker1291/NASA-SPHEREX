import { ExternalLink, RefreshCw } from 'lucide-react'

import { cx } from '../lib/cx'
import type { RealSpectrum } from '../lib/real'

const W = 720
const H = 280
const PAD = { l: 48, r: 18, t: 28, b: 38 }
const TINTS = ['#cdbaff', '#74e3ff', '#ff8ad8', '#b9a2ff', '#ffffff', '#ffcf8a']

function percentile(values: number[], fraction: number) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * fraction)))]
}

export function RealSpectrumPanel({
  spectrum,
  loading,
  error,
  coordinate,
  onLoad,
}: {
  spectrum: RealSpectrum | null
  loading: boolean
  error: string
  coordinate: string
  onLoad: () => void
}) {
  const segments = spectrum?.segments ?? []
  const points = segments.flatMap((segment) => segment.points).filter((point) => Number.isFinite(point.lambda) && Number.isFinite(point.flux))
  const lambdas = points.map((point) => point.lambda)
  const fluxes = points.map((point) => point.flux)
  const lowLambda = lambdas.length ? Math.min(...lambdas) : 0.744
  const highLambda = lambdas.length ? Math.max(...lambdas) : 5.002
  const lowFlux = fluxes.length ? percentile(fluxes, 0.02) : 0
  const highFlux = fluxes.length ? percentile(fluxes, 0.98) : 1
  const spanLambda = Math.log(highLambda) - Math.log(lowLambda) || 1
  const spanFlux = highFlux - lowFlux || 1
  const xFor = (lambda: number) => PAD.l + ((Math.log(lambda) - Math.log(lowLambda)) / spanLambda) * (W - PAD.l - PAD.r)
  const yFor = (flux: number) => H - PAD.b - ((flux - lowFlux) / spanFlux) * (H - PAD.t - PAD.b)
  const ticks = Array.from({ length: 5 }, (_, index) => {
    const lambda = lowLambda * (highLambda / lowLambda) ** (index / 4)
    return { lambda, x: xFor(lambda) }
  })
  const flagged = segments.reduce((sum, segment) => sum + segment.flagged, 0)
  const source = spectrum?.source

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="caps flex flex-wrap items-center gap-2 text-[9px] text-night-muted">
            Aperture spectrum <span className="rounded-full bg-white/10 px-2 py-0.5 text-[8px] text-white/65">real pixels</span>
          </p>
          <p className="mt-1.5 text-[17px] tracking-[-0.02em] text-white">
            {coordinate}
            <span className="text-white/35"> · {points.length.toLocaleString()} samples</span>
          </p>
        </div>
        <a
          href={source?.url ?? 'https://irsa.ipac.caltech.edu/'}
          target="_blank"
          rel="noreferrer"
          className="max-w-[16rem] rounded-[10px] border border-white/20 bg-white/[0.04] px-3 py-2 text-right transition-colors hover:border-white/50"
        >
          <span className="caps block text-[8px] text-white/40">Data source · top right</span>
          <span className="caps mt-0.5 flex items-center justify-end gap-1 text-[9px] text-white/85">
            IRSA · SPHEREx DR1 <ExternalLink className="size-2.5" aria-hidden />
          </span>
          <span className="caps mt-0.5 block text-[8px] text-white/45">
            {segments.length ? `${segments.map((segment) => segment.detector).join(' · ')} real cutouts` : 'no cutout loaded'}
          </span>
        </a>
      </div>

      <div className="relative mt-4 overflow-hidden rounded-[var(--radius-control)] border border-white/10 bg-white/[0.03]">
        {points.length ? (
          <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Real extracted SPHEREx aperture spectrum">
            <defs>
              <linearGradient id="real-spec-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#5b14f5" stopOpacity="0.22" />
                <stop offset="1" stopColor="#5b14f5" stopOpacity="0" />
              </linearGradient>
            </defs>

            {[0.25, 0.5, 0.75, 1].map((fraction) => {
              const y = PAD.t + fraction * (H - PAD.t - PAD.b)
              return <line key={fraction} x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} stroke="rgba(255,255,255,0.08)" strokeDasharray="2 4" />
            })}
            <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="rgba(255,255,255,0.2)" />

            {segments.map((segment, index) => {
              const color = TINTS[index % TINTS.length]
              const ordered = [...segment.points]
                .filter((point) => Number.isFinite(point.lambda) && Number.isFinite(point.flux))
                .sort((a, b) => a.lambda - b.lambda)
              const path = ordered
                .map((point, pointIndex) => `${pointIndex === 0 ? 'M' : 'L'}${xFor(point.lambda).toFixed(1)},${yFor(point.flux).toFixed(1)}`)
                .join(' ')
              return (
                <g key={`${segment.detector}-${index}`}>
                  <path d={path} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" opacity="0.95" />
                  {ordered
                    .filter((point) => point.flag !== 0)
                    .slice(0, 80)
                    .map((point, pointIndex) => (
                      <circle key={pointIndex} cx={xFor(point.lambda)} cy={yFor(point.flux)} r="1.6" fill="#ff8ad8" opacity="0.7" />
                    ))}
                </g>
              )
            })}

            {ticks.map((tick) => (
              <g key={tick.lambda}>
                <line x1={tick.x} x2={tick.x} y1={H - PAD.b} y2={H - PAD.b + 4} stroke="rgba(255,255,255,0.35)" />
                <text
                  x={tick.x}
                  y={H - 14}
                  textAnchor="middle"
                  fontSize="10"
                  fill="rgba(255,255,255,0.5)"
                  fontFamily="Inter Tight, system-ui, sans-serif"
                >
                  {tick.lambda < 1 ? tick.lambda.toFixed(2) : tick.lambda.toFixed(1)}
                </text>
              </g>
            ))}

            <text x={PAD.l} y={17} fontSize="10" fill="rgba(255,255,255,0.45)" fontFamily="Inter Tight, system-ui, sans-serif">
              mean aperture flux · MJy sr⁻¹
            </text>
            <text x={W - PAD.r} y={H - 14} textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.4)" fontFamily="Inter Tight, system-ui, sans-serif">
              observed λ · µm
            </text>
          </svg>
        ) : (
          <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 px-5 text-center">
            <p className="caps text-[10px] text-white/45">{loading ? 'Extracting real spectra from IRSA' : 'No real spectrum loaded'}</p>
            <p className="max-w-[22rem] text-[13px] leading-relaxed text-white/50">
              Each detector strip is a real FITS cutout. The server averages a five-pixel aperture and reads wavelength from WCS-WAVE.
            </p>
            <button
              type="button"
              onClick={onLoad}
              disabled={loading}
              className="round inline-flex h-9 items-center gap-1.5 rounded-full border border-white/25 px-4 text-[11px] text-white transition-colors hover:border-white disabled:opacity-40"
            >
              <RefreshCw className={cx('size-3.5', loading && 'animate-spin')} aria-hidden />
              {loading ? 'Working…' : 'Extract real spectrum'}
            </button>
          </div>
        )}

        {loading && points.length > 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-night/45 backdrop-blur-[1px]">
            <p className="caps text-[9px] text-white/70">Loading more real detector strips…</p>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {segments.map((segment, index) => (
            <span key={`${segment.detector}-${index}`} className="caps flex items-center gap-1.5 rounded-full border border-white/12 px-2.5 py-1 text-[8px] text-white/60">
              <span aria-hidden className="size-1.5 rounded-full" style={{ background: TINTS[index % TINTS.length] }} />
              {segment.detector} · {segment.points.length} pts
            </span>
          ))}
          {flagged > 0 && <span className="caps rounded-full border border-pink/35 px-2.5 py-1 text-[8px] text-pink">{flagged} flagged samples</span>}
        </div>
        <button
          type="button"
          onClick={onLoad}
          disabled={loading}
          className="caps inline-flex items-center gap-1 text-[9px] text-white/45 transition-colors hover:text-white disabled:opacity-40"
        >
          <RefreshCw className={cx('size-3', loading && 'animate-spin')} aria-hidden /> reload real spectrum
        </button>
      </div>

      {error && <p className="mt-2 text-[12px] leading-snug text-pink">{error}</p>}
      <p className="caps mt-3 text-[9px] leading-relaxed text-white/35">
        {source?.method ?? 'Pixel aperture means from real IRSA cutouts'} · SPHEREx level-2. Gaps are detector coverage, not interpolated
        data. Pink points carry at least one real FLAGS bit.
      </p>
    </div>
  )
}
