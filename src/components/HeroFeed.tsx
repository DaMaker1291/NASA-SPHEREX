import { useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { renderSky } from '../lib/render'
import { BAND_BY_ID, FALLBACK_RELEASES, PRESETS, bandsForArray, buildScene } from '../lib/spherex'

const PRESET = PRESETS[0]
const RELEASE = FALLBACK_RELEASES[0]
const BAND_IDS = bandsForArray(2).map((b) => b.id)
const LAMBDA = BAND_IDS.reduce((sum, id) => sum + (BAND_BY_ID.get(id)?.lambda ?? 0), 0) / BAND_IDS.length
const SIZE = 320

export function HeroFeed() {
  const scene = useMemo(() => buildScene({ ra: PRESET.ra, dec: PRESET.dec, fov: PRESET.fov }, RELEASE, 1), [])
  const [epoch, setEpoch] = useState(0)
  const reduce = useReducedMotion()
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (reduce) return
    const id = window.setInterval(() => setEpoch((e) => (e + 1) % scene.epochs.length), 1600)
    return () => window.clearInterval(id)
  }, [scene, reduce])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = SIZE * dpr
    canvas.height = SIZE * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    renderSky(ctx, {
      scene,
      field: { ra: PRESET.ra, dec: PRESET.dec, fov: PRESET.fov },
      epoch,
      compare: epoch,
      lambda: LAMBDA,
      bandCount: BAND_IDS.length,
      layers: { gaia: false, wise: false, grid: false },
      mode: 'single',
      size: SIZE,
      hint: null,
      reveal: null,
      probe: null,
    })
  }, [scene, epoch])

  return (
    <figure className="m-0 -rotate-2">
      <div className="rounded-[12px] bg-card p-2 shadow-[var(--shadow-float)]">
        <div className="relative overflow-hidden rounded-[6px] bg-[#04030a]">
          <canvas ref={ref} style={{ width: '100%', height: 'auto', aspectRatio: '1 / 1' }} role="img" aria-label="Live modelled SPHEREx field, cycling through ten visits" />
          <div className="pointer-events-none absolute inset-0">
            <span className="caps absolute top-2 left-2 flex items-center gap-1 rounded-full bg-black/45 px-1.5 py-1 text-[7px] text-white/85 backdrop-blur-sm">
              <span className="size-1 animate-pulse rounded-full bg-pink" aria-hidden /> rec
            </span>
            <span className="caps absolute top-2 right-2 rounded-full bg-black/45 px-1.5 py-1 text-[7px] text-white/70 tabular-nums backdrop-blur-sm">
              {String(epoch + 1).padStart(2, '0')}/{scene.epochs.length}
            </span>
            <span className="caps absolute bottom-2 left-2 text-[7px] text-white/60">150.000 +19.500</span>
            <span className="caps absolute right-2 bottom-2 text-[7px] text-white/35">QR3</span>
          </div>
        </div>
        <figcaption className="flex items-center justify-between px-1 pt-2">
          <span className="caps text-[8px] text-muted">Field note 001</span>
          <span className="caps text-[8px] text-muted">SPHEREx · 102 bands</span>
        </figcaption>
      </div>
    </figure>
  )
}
