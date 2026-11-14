import { useEffect, useRef } from 'react'

import { cx } from '../lib/cx'
import { renderSky } from '../lib/render'
import type { Field, Scene } from '../lib/spherex'

const THUMB = 64

type Props = {
  scene: Scene
  field: Field
  epoch: number
  lambda: number
  bandIds: number[]
  onSelect: (epoch: number) => void
}

export function VisitStrip({ scene, field, epoch, lambda, bandIds, onSelect }: Props) {
  return (
    <div className="mt-1">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="caps text-[9px] text-muted">Contact sheet · {scene.epochs.length} frames</p>
        <p className="caps text-[9px] text-muted">Click a frame to inspect</p>
      </div>
      <div className="overflow-x-auto pb-1">
        <div className="filmstrip min-w-[730px] rounded-[var(--radius-control)] bg-[#05040b] px-3 pt-5 pb-4">
          <div className="flex justify-between gap-1.5">
            {scene.epochs.map((visit) => {
              const active = visit.index === epoch
              return (
                <div key={visit.index} className="w-[64px] shrink-0">
                  <button
                    type="button"
                    onClick={() => onSelect(visit.index)}
                    aria-pressed={active}
                    aria-label={`Visit ${visit.index + 1}, ${visit.label}${visit.flags.length ? `, flagged ${visit.flags.join(', ')}` : ''}`}
                    className={cx(
                      'group relative block w-full overflow-hidden rounded-[4px] border transition-[border-color,transform] duration-[var(--duration-fast)]',
                      active
                        ? 'border-violet-light shadow-[0_0_0_1px_rgba(185,162,255,0.9),0_10px_24px_-12px_rgba(91,20,245,0.9)]'
                        : 'border-white/12 hover:border-white/45',
                    )}
                  >
                    <Thumbnail scene={scene} field={field} epoch={visit.index} lambda={lambda} bandCount={bandIds.length} />
                    <span className="caps absolute top-1 left-1 rounded-[2px] bg-black/55 px-1 py-0.5 text-[7px] leading-none text-white/85 tabular-nums backdrop-blur-sm">
                      {String(visit.index + 1).padStart(2, '0')}
                    </span>
                    {visit.flags.length > 0 && (
                      <span
                        aria-hidden
                        title={visit.flags.join(', ')}
                        className="absolute top-1 right-1 size-1.5 rounded-full bg-pink shadow-[0_0_6px_rgba(255,138,216,0.9)]"
                      />
                    )}
                  </button>
                  <p className="caps mt-1 text-center text-[7px] text-white/40">{visit.iso.slice(5).replace('-', '/')}</p>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function Thumbnail({
  scene,
  field,
  epoch,
  lambda,
  bandCount,
}: {
  scene: Scene
  field: Field
  epoch: number
  lambda: number
  bandCount: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = THUMB * dpr
    canvas.height = THUMB * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    renderSky(ctx, {
      scene,
      field,
      epoch,
      compare: epoch,
      lambda,
      bandCount,
      layers: { gaia: false, wise: false, grid: false },
      mode: 'single',
      size: THUMB,
      hint: null,
      reveal: null,
      probe: null,
    })
  }, [scene, field, epoch, lambda, bandCount])

  return <canvas ref={ref} aria-hidden className="block w-full" style={{ aspectRatio: '1 / 1' }} />
}
