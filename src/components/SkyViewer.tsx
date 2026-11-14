import { useEffect, useRef, useState } from 'react'

import { coordinateAt, formatDec, formatRA, type Field, type Point, type Scene } from '../lib/spherex'
import { renderSky, type Layers } from '../lib/render'
import { cx } from '../lib/cx'

type Props = {
  scene: Scene
  field: Field
  epoch: number
  compare: number
  mode: 'single' | 'difference' | 'coadd'
  lambda: number
  bandIds: number[]
  arrayCount: number
  layers: Layers
  hint: Point | null
  reveal: Point | null
  probe: Point | null
  onSkyClick: (p: Point) => void
  hunting: boolean
  epochLabel: string
  epochISO: string
  bandLabel: string
  releaseLabel: string
  mb: number
}

export function SkyViewer({
  scene,
  field,
  epoch,
  compare,
  mode,
  lambda,
  bandIds,
  arrayCount,
  layers,
  hint,
  reveal,
  probe,
  onSkyClick,
  hunting,
  epochLabel,
  epochISO,
  bandLabel,
  releaseLabel,
  mb,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const downRef = useRef<{ x: number; y: number } | null>(null)
  const [size, setSize] = useState(560)
  const [hover, setHover] = useState<Point | null>(null)
  const [progress, setProgress] = useState(1)
  const transferKey = `${scene.epochs.length}|${field.ra.toFixed(2)}|${field.dec.toFixed(2)}|${field.fov}|${bandIds.length}|${arrayCount}|${releaseLabel}`

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setSize(Math.max(260, Math.floor(el.getBoundingClientRect().width)))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(size * dpr)
    canvas.height = Math.round(size * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    renderSky(ctx, {
      scene,
      field: { ra: field.ra, dec: field.dec, fov: field.fov },
      epoch,
      compare,
      lambda,
      bandCount: bandIds.length,
      layers,
      mode,
      size,
      hint,
      reveal,
      probe,
    })
  }, [scene, field, epoch, compare, lambda, bandIds.length, layers, mode, size, hint, reveal, probe])

  useEffect(() => {
    setProgress(0)
    const duration = Math.min(900, 190 + mb * 18)
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      setProgress(p)
      if (p < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [transferKey, mb])

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left) / rect.width - 0.5,
      y: (event.clientY - rect.top) / rect.height - 0.5,
    }
  }

  const cursor = coordinateAt(field, hover ?? { x: 0, y: 0 })
  const scanWidth = (field.fov / 5) * 60

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative overflow-hidden rounded-[var(--radius-card-sm)] border border-white/10 bg-[#04030a] shadow-[inset_0_0_80px_rgb(91_20_245/0.18)]">
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: 'auto', aspectRatio: '1 / 1' }}
          className="block touch-none select-none"
          aria-label={`SPHEREx sky cutout, visit ${epoch + 1}, ${bandLabel}`}
          role="img"
          onPointerDown={(e) => {
            downRef.current = pointFromEvent(e)
          }}
          onPointerMove={(e) => setHover(pointFromEvent(e))}
          onPointerLeave={() => setHover(null)}
          onPointerUp={(e) => {
            const start = downRef.current
            const p = pointFromEvent(e)
            downRef.current = null
            if (!start) return
            if (Math.hypot(p.x - start.x, p.y - start.y) > 0.012) return
            onSkyClick(p)
          }}
        />

        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.5) 0 1px, transparent 1px 4px)' }}
        />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_50%,transparent_55%,rgba(4,3,10,0.55)_100%)]" />

        {hover && (
          <div
            aria-hidden
            className="pointer-events-none absolute z-10"
            style={{ left: `${(hover.x + 0.5) * 100}%`, top: `${(hover.y + 0.5) * 100}%` }}
          >
            <span className="absolute size-9 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/35" />
            <span className="absolute size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pink shadow-[0_0_8px_rgba(255,138,216,0.9)]" />
            <span className="absolute top-1/2 left-1/2 h-px w-14 -translate-x-1/2 -translate-y-1/2 bg-white/15" />
            <span className="absolute top-1/2 left-1/2 h-14 w-px -translate-x-1/2 -translate-y-1/2 bg-white/15" />
            <span
              className={cx(
                'caps absolute top-6 whitespace-nowrap text-[8px] text-white/65',
                hover.x > 0.24 ? 'right-6 text-right' : 'left-6',
              )}
            >
              {formatRA(cursor.ra)} {formatDec(cursor.dec)}
            </span>
          </div>
        )}

        <span aria-hidden className="pointer-events-none absolute top-3 left-3 size-4 border-t border-l border-white/35" />
        <span aria-hidden className="pointer-events-none absolute top-3 right-3 size-4 border-t border-r border-white/35" />
        <span aria-hidden className="pointer-events-none absolute bottom-3 left-3 size-4 border-b border-l border-white/35" />
        <span aria-hidden className="pointer-events-none absolute right-3 bottom-3 size-4 border-r border-b border-white/35" />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              title={epochLabel}
              className="caps rounded-full bg-white/10 px-2.5 py-1.5 text-[10px] text-white backdrop-blur-sm"
            >
              {mode === 'difference' ? 'A − B' : mode === 'coadd' ? 'Temporal stack' : `Visit ${epoch + 1}/${scene.epochs.length}`} · {epochISO}
            </span>
            <span className="caps rounded-full bg-violet/25 px-2.5 py-1.5 text-[10px] text-white backdrop-blur-sm">{releaseLabel}</span>
          </div>
          <span className="caps rounded-full border border-white/15 bg-black/25 px-2.5 py-1.5 text-[10px] text-white/75 backdrop-blur-sm">{bandLabel}</span>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 sm:p-5">
          <div>
            <span className="block h-[3px] w-16 rounded-full bg-gradient-to-r from-white to-white/20" />
            <span className="caps mt-1.5 block text-[10px] text-white/60">{scanWidth.toFixed(1)}′ · 6.15″ px</span>
          </div>
          <div className="text-right">
            <span className="caps block text-[10px] text-white/75">
              {formatRA(cursor.ra)} {formatDec(cursor.dec)}
            </span>
            <span className="caps mt-1 block text-[9px] text-white/35">modelled cube · SPHEREx geometry</span>
          </div>
        </div>

        <span className="caps pointer-events-none absolute inset-x-0 top-1/2 hidden -translate-y-1/2 text-center text-[10px] text-white/25 sm:block">
          {hunting ? 'click the mover to make your guess' : 'click the sky to extract a spectrum'}
        </span>

        {progress < 1 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#04030a]/78 backdrop-blur-[2px]">
            <p className="caps text-[10px] text-white/70">Assembling cutout</p>
            <p className="text-lg tracking-[-0.03em] text-white">
              {arrayCount} {arrayCount === 1 ? 'array' : 'arrays'} · {mb.toFixed(1)} MB
            </p>
            <div className="h-[3px] w-40 overflow-hidden rounded-full bg-white/15">
              <div className="h-full bg-gradient-to-r from-violet to-cyan" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          </div>
        )}
      </div>

      <p className={cx('caps mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted')}>
        <span>Arrows scrub · space plays</span>
        <span className="text-violet">{hunting ? 'Hunt mode: click to guess' : 'Probe mode: click for a spectrum'}</span>
      </p>
    </div>
  )
}
