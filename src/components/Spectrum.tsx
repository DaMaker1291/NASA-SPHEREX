import { Square, Volume2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { sonifySpectrum, type SpectrumVoice } from '../lib/audio'
import { BANDS, type Spectrum, type SpectrumPoint } from '../lib/spherex'
import { cx } from '../lib/cx'
import { Badge } from './Bits'

const W = 660
const H = 260
const PAD = { l: 40, r: 14, t: 18, b: 34 }
const LAMBDA_MIN = 0.744
const LAMBDA_MAX = 5.002

const xFor = (lambda: number) =>
  PAD.l + ((Math.log(lambda) - Math.log(LAMBDA_MIN)) / (Math.log(LAMBDA_MAX) - Math.log(LAMBDA_MIN))) * (W - PAD.l - PAD.r)

const TICKS = [
  { lambda: 0.75, label: '0.75' },
  { lambda: 1.1, label: '1.1' },
  { lambda: 1.65, label: '1.65' },
  { lambda: 2.42, label: '2.4' },
  { lambda: 3.3, label: '3.3' },
  { lambda: 4.4, label: '4.4' },
  { lambda: 5.0, label: '5.0' },
]

export function SpectrumChart({
  spectrum,
  bandIds,
  playhead = null,
}: {
  spectrum: Spectrum
  bandIds: number[]
  playhead?: SpectrumPoint | null
}) {
  const points = spectrum.points
  const maxFlux = 1.12
  const yFor = (flux: number) => PAD.t + (1 - flux / maxFlux) * (H - PAD.t - PAD.b)

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(p.band.lambda).toFixed(1)},${yFor(p.flux).toFixed(1)}`).join(' ')
  const area = `${line} L${xFor(points[points.length - 1].band.lambda).toFixed(1)},${H - PAD.b} L${xFor(points[0].band.lambda).toFixed(1)},${H - PAD.b} Z`

  const selected = BANDS.filter((b) => bandIds.includes(b.id))
  const selLo = selected.length ? Math.min(...selected.map((b) => b.lambda)) : 0
  const selHi = selected.length ? Math.max(...selected.map((b) => b.lambda)) : 0

  return (
    <figure className="m-0">
      <div className="relative overflow-hidden rounded-[var(--radius-control)] border border-white/10 bg-white/[0.03]">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Model spectrum across all 102 SPHEREx bands">
          <defs>
            <linearGradient id="spec-stroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#cdbaff" />
              <stop offset="0.35" stopColor="#74e3ff" />
              <stop offset="0.68" stopColor="#b9a2ff" />
              <stop offset="1" stopColor="#ff8ad8" />
            </linearGradient>
            <linearGradient id="spec-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#5b14f5" stopOpacity="0.38" />
              <stop offset="1" stopColor="#5b14f5" stopOpacity="0.02" />
            </linearGradient>
            <radialGradient id="spec-head" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.35" stopColor="#ffb3e6" />
              <stop offset="1" stopColor="#ff8ad8" stopOpacity="0" />
            </radialGradient>
          </defs>

          {[0.25, 0.5, 0.75, 1].map((f) => (
            <line key={f} x1={PAD.l} x2={W - PAD.r} y1={yFor(f)} y2={yFor(f)} stroke="rgba(255,255,255,0.08)" strokeDasharray="2 4" />
          ))}
          <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="rgba(255,255,255,0.2)" />

          {selected.length > 0 && (
            <rect
              x={xFor(selLo)}
              y={PAD.t}
              width={Math.max(2, xFor(selHi) - xFor(selLo))}
              height={H - PAD.t - PAD.b}
              fill="#5b14f5"
              opacity="0.16"
            />
          )}

          <path d={area} fill="url(#spec-fill)" />
          <path d={line} fill="none" stroke="url(#spec-stroke)" strokeWidth="2" strokeLinejoin="round" />

          {points.map((p) => (
            <g key={p.band.id}>
              <line
                x1={xFor(p.band.lambda)}
                x2={xFor(p.band.lambda)}
                y1={yFor(Math.min(1, p.flux + p.err))}
                y2={yFor(Math.max(0, p.flux - p.err))}
                stroke="rgba(255,255,255,0.28)"
                strokeWidth="1"
              />
              <circle cx={xFor(p.band.lambda)} cy={yFor(p.flux)} r="1.7" fill="#fff" opacity="0.85" />
            </g>
          ))}

          {playhead && (
            <g>
              <line
                x1={xFor(playhead.band.lambda)}
                x2={xFor(playhead.band.lambda)}
                y1={PAD.t}
                y2={H - PAD.b}
                stroke="#ff8ad8"
                strokeWidth="1"
                opacity="0.7"
              />
              <circle cx={xFor(playhead.band.lambda)} cy={yFor(playhead.flux)} r="12" fill="url(#spec-head)" opacity="0.7" />
              <circle cx={xFor(playhead.band.lambda)} cy={yFor(playhead.flux)} r="3.4" fill="#fff" stroke="#ff8ad8" strokeWidth="1.8" />
            </g>
          )}

          {TICKS.map((t) => (
            <g key={t.label}>
              <line x1={xFor(t.lambda)} x2={xFor(t.lambda)} y1={H - PAD.b} y2={H - PAD.b + 4} stroke="rgba(255,255,255,0.35)" />
              <text x={xFor(t.lambda)} y={H - 12} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.5)" fontFamily="Inter Tight, system-ui, sans-serif">
                {t.label}
              </text>
            </g>
          ))}
          <text x={PAD.l} y={12} fontSize="10" fill="rgba(255,255,255,0.4)" fontFamily="Inter Tight, system-ui, sans-serif">
            Fλ (normalised)
          </text>
          <text x={W - PAD.r} y={H - 12} textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.4)" fontFamily="Inter Tight, system-ui, sans-serif">
            µm
          </text>
        </svg>
      </div>

      <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="caps text-[10px] text-white/55">{spectrum.summary}</span>
        <span className="caps text-[10px] text-white/40">102 channels · generated in the browser</span>
      </figcaption>

      <ul className="mt-3 flex flex-wrap gap-1.5">
        {spectrum.features.map((f) => (
          <li
            key={f.label}
            title={f.note}
            className={cx(
              'round flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]',
              f.detected ? 'border-pink/40 bg-pink/10 text-pink' : 'border-white/12 text-white/35',
            )}
          >
            <span aria-hidden className={cx('size-1.5 rounded-full', f.detected ? 'bg-pink' : 'bg-white/20')} />
            {f.label} <span className="tabular-nums opacity-60">{f.lambda}</span>
          </li>
        ))}
      </ul>
    </figure>
  )
}

export function SpectrumLab({
  spectrum,
  bandIds,
  coordinate,
}: {
  spectrum: Spectrum
  bandIds: number[]
  coordinate: string
}) {
  const [playing, setPlaying] = useState(false)
  const [active, setActive] = useState<number | null>(null)
  const voice = useRef<SpectrumVoice | null>(null)

  useEffect(
    () => () => {
      voice.current?.stop()
      voice.current = null
    },
    [],
  )

  useEffect(() => {
    voice.current?.stop()
    voice.current = null
    setPlaying(false)
    setActive(null)
  }, [spectrum])

  const toggle = () => {
    if (playing) {
      voice.current?.stop()
      voice.current = null
      setPlaying(false)
      setActive(null)
      return
    }
    let finished = false
    const next = sonifySpectrum(spectrum, setActive, () => {
      finished = true
      voice.current = null
      setPlaying(false)
      setActive(null)
    })
    voice.current = next
    if (!finished) setPlaying(true)
  }

  const point = active === null ? null : (spectrum.points[active] ?? null)

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="caps flex flex-wrap items-center gap-2 text-[9px] text-night-muted">
            Aperture spectrum <Badge tone="light">on the fly</Badge>
          </p>
          <p className="mt-1.5 text-[17px] tracking-[-0.02em] text-white">
            {coordinate}
            <span className="text-white/35"> · 102 channels</span>
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-pressed={playing}
          className={cx(
            'round inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[11px] font-medium transition-colors',
            playing
              ? 'border-pink/60 bg-pink/15 text-pink'
              : 'border-white/20 text-white/75 hover:border-white/50 hover:text-white',
          )}
        >
          {playing ? <Square className="size-3" aria-hidden /> : <Volume2 className="size-3.5" aria-hidden />}
          {playing ? 'Stop the light' : 'Listen to the light'}
          {playing && (
            <span className="eq" aria-hidden>
              <span />
              <span />
              <span />
            </span>
          )}
        </button>
      </div>

      <div className="mt-4">
        <SpectrumChart spectrum={spectrum} bandIds={bandIds} playhead={point} />
      </div>

      <p className="caps mt-4 text-[9px] leading-relaxed text-white/35">
        Wavelength becomes pitch, flux becomes volume: 102 channels in about six seconds. Click anywhere in the viewer (outside hunt
        mode) to move the aperture and compose a new chord.
      </p>
    </div>
  )
}
