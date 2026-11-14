import { AlertTriangle, ExternalLink, LoaderCircle, Maximize2, Minus, Plus, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { formatDec, formatRA } from '../lib/spherex'
import {
  formatTime,
  skyAtPixel,
  waveAtPixel,
  worldToPixel,
  type CatalogResult,
  type RealCutout,
} from '../lib/real'
import { cx } from '../lib/cx'

export type RealLayer = 'image' | 'variance' | 'flags' | 'zodi'

const LAYER_LABEL: Record<RealLayer, string> = {
  image: 'Science image',
  variance: 'Variance',
  flags: 'Flags',
  zodi: 'Zodiacal model',
}

const STOPS = [
  [4, 3, 14],
  [24, 10, 68],
  [72, 15, 176],
  [139, 28, 246],
  [255, 93, 204],
  [255, 218, 236],
  [255, 250, 232],
]

const LUT = Array.from({ length: 256 }, (_, index) => {
  const scaled = (index / 255) * (STOPS.length - 1)
  const stop = Math.min(STOPS.length - 2, Math.floor(scaled))
  const mix = scaled - stop
  return [0, 1, 2].map((channel) =>
    Math.round(STOPS[stop][channel] * (1 - mix) + STOPS[stop + 1][channel] * mix),
  )
})

const layerStats = (cutout: RealCutout, layer: RealLayer) => {
  const data =
    layer === 'variance'
      ? cutout.variancePixels
      : layer === 'flags'
        ? cutout.flagPixels
        : layer === 'zodi'
          ? cutout.zodiPixels
          : cutout.pixels
  if (!data) return null
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  let sum = 0
  let count = 0
  const stride = Math.max(1, Math.floor(data.length / 120000))
  for (let index = 0; index < data.length; index += stride) {
    const value = data[index]
    if (!Number.isFinite(value)) continue
    min = Math.min(min, value)
    max = Math.max(max, value)
    sum += value
    count += 1
  }
  if (!count) return null
  return { min, max, mean: sum / count }
}

function colorFor(value: number, min: number, max: number, layer: RealLayer) {
  if (!Number.isFinite(value)) return [0, 0, 0]
  if (layer === 'flags') {
    if (!value) return [12, 9, 22]
    const bit = 31 - Math.clz32((value | 0) & -(value | 0))
    const hue = (bit * 47 + 285) % 360
    return hsl(hue, 82, 61)
  }
  const span = max - min || 1
  const normalized = Math.min(1, Math.max(0, (value - min) / span))
  if (layer === 'variance') return hsl(278 + normalized * 74, 75, 16 + normalized * 64)
  if (layer === 'zodi') return hsl(188 + normalized * 58, 65, 12 + normalized * 60)
  return LUT[Math.round(normalized * 255)]
}

function hsl(hue: number, saturation: number, lightness: number) {
  const s = saturation / 100
  const l = lightness / 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x]
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

type Props = {
  cutout: RealCutout | null
  loading: boolean
  error: string
  layer: RealLayer
  onLayer: (layer: RealLayer) => void
  catalogs: { gaia: CatalogResult | null; wise: CatalogResult | null }
  catalogLayers: { gaia: boolean; wise: boolean }
  onToggleCatalog: (survey: 'gaia' | 'wise') => void
  probe: { x: number; y: number } | null
  onProbe: (point: { x: number; y: number }) => void
  onRetry: () => void
  provenance: { uri: string; release: string; detector: string; iso: string; loading: boolean; cached?: boolean }
}

export function RealSky({
  cutout,
  loading,
  error,
  layer,
  onLayer,
  catalogs,
  catalogLayers,
  onToggleCatalog,
  probe,
  onProbe,
  onRetry,
  provenance,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{ id: number; x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null)
  const [size, setSize] = useState(620)
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [view, setView] = useState<{ cx: number; cy: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  const imageWidth = cutout?.image.width ?? 1
  const imageHeight = cutout?.image.height ?? 1
  const activeZoom = Math.min(16, Math.max(1, zoom))
  const viewWidth = imageWidth / activeZoom
  const viewHeight = imageHeight / activeZoom
  const halfWidth = viewWidth / 2
  const halfHeight = viewHeight / 2
  const centerX = Math.min(imageWidth - halfWidth, Math.max(halfWidth, view?.cx ?? imageWidth / 2))
  const centerY = Math.min(imageHeight - halfHeight, Math.max(halfHeight, view?.cy ?? imageHeight / 2))

  useEffect(() => {
    setZoom(1)
    setView(null)
    setHover(null)
  }, [cutout?.uri])

  useEffect(() => {
    const element = wrapRef.current
    if (!element) return
    const measure = () => setSize(Math.max(280, Math.floor(element.getBoundingClientRect().width)))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !cutout) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const width = Math.round(Math.min(1100, size * dpr))
    const height = Math.max(1, Math.round((width * cutout.image.height) / cutout.image.width))
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return
    const data =
      layer === 'variance'
        ? cutout.variancePixels
        : layer === 'flags'
          ? cutout.flagPixels
          : layer === 'zodi'
            ? cutout.zodiPixels
            : cutout.pixels
    if (!data) {
      context.fillStyle = '#04030a'
      context.fillRect(0, 0, width, height)
      return
    }
    const stats = layerStats(cutout, layer)
    const min = stats?.min ?? 0
    const max = stats?.max ?? 1
    const viewLeft = centerX - halfWidth
    const viewTop = centerY + halfHeight
    const image = context.createImageData(width, height)
    for (let y = 0; y < height; y += 1) {
      const sourceY = Math.min(
        cutout.image.height - 1,
        Math.max(0, Math.floor(viewTop - ((y + 0.5) / height) * viewHeight)),
      )
      for (let x = 0; x < width; x += 1) {
        const sourceX = Math.min(
          cutout.image.width - 1,
          Math.max(0, Math.floor(viewLeft + ((x + 0.5) / width) * viewWidth)),
        )
        const color = colorFor(data[sourceY * cutout.image.width + sourceX], min, max, layer)
        const at = (y * width + x) * 4
        image.data[at] = color[0]
        image.data[at + 1] = color[1]
        image.data[at + 2] = color[2]
        image.data[at + 3] = 255
      }
    }
    context.putImageData(image, 0, 0)

    const toCanvas = (pixelX: number, pixelY: number) => ({
      x: ((pixelX - viewLeft) / viewWidth) * width,
      y: ((viewTop - pixelY) / viewHeight) * height,
    })
    const drawCatalog = (catalog: CatalogResult | null, color: string) => {
      if (!catalog) return
      context.strokeStyle = color
      context.lineWidth = Math.max(1, dpr)
      context.setLineDash([3 * dpr, 3 * dpr])
      for (const source of catalog.sources) {
        const pixel = worldToPixel(cutout.image, source.ra, source.dec)
        if (!pixel) continue
        const point = toCanvas(pixel.x, pixel.y)
        if (point.x < -12 || point.y < -12 || point.x > width + 12 || point.y > height + 12) continue
        context.beginPath()
        context.arc(point.x, point.y, 4.5 * dpr, 0, Math.PI * 2)
        context.stroke()
      }
      context.setLineDash([])
    }
    if (catalogLayers.gaia) drawCatalog(catalogs.gaia, 'rgba(255,138,216,0.95)')
    if (catalogLayers.wise) drawCatalog(catalogs.wise, 'rgba(116,227,255,0.95)')

    if (probe) {
      const point = toCanvas(probe.x, probe.y)
      context.strokeStyle = 'rgba(255,255,255,0.9)'
      context.lineWidth = dpr
      context.beginPath()
      context.arc(point.x, point.y, 8 * dpr, 0, Math.PI * 2)
      context.stroke()
      context.beginPath()
      context.moveTo(point.x - 14 * dpr, point.y)
      context.lineTo(point.x + 14 * dpr, point.y)
      context.moveTo(point.x, point.y - 14 * dpr)
      context.lineTo(point.x, point.y + 14 * dpr)
      context.stroke()
    }
  }, [cutout, layer, size, catalogs, catalogLayers, probe, activeZoom, centerX, centerY, viewWidth, viewHeight])

  const pixelAt = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!cutout) return null
    const rect = event.currentTarget.getBoundingClientRect()
    const nx = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    const ny = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    const left = centerX - halfWidth
    const top = centerY + halfHeight
    return {
      x: Math.min(cutout.image.width - 1, Math.max(0, Math.floor(left + nx * viewWidth))),
      y: Math.min(cutout.image.height - 1, Math.max(0, Math.floor(top - ny * viewHeight))),
    }
  }

  const applyZoom = (nextZoom: number, nx = 0.5, ny = 0.5) => {
    if (!cutout) return
    const next = Math.min(16, Math.max(1, nextZoom))
    if (Math.abs(next - activeZoom) < 0.0001) return
    const anchorX = centerX - halfWidth + nx * viewWidth
    const anchorY = centerY + halfHeight - ny * viewHeight
    const nextWidth = imageWidth / next
    const nextHeight = imageHeight / next
    const nextCenterX = Math.min(
      imageWidth - nextWidth / 2,
      Math.max(nextWidth / 2, anchorX + (0.5 - nx) * nextWidth),
    )
    const nextCenterY = Math.min(
      imageHeight - nextHeight / 2,
      Math.max(nextHeight / 2, anchorY + (ny - 0.5) * nextHeight),
    )
    setZoom(next)
    setView({ cx: nextCenterX, cy: nextCenterY })
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !cutout) return
    const onWheel = (event: WheelEvent) => {
      if (!event.deltaY) return
      event.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const nx = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
      const ny = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
      applyZoom(activeZoom * Math.exp(-event.deltaY * 0.0018), nx, ny)
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [cutout, activeZoom, centerX, centerY, viewWidth, viewHeight, imageWidth, imageHeight])

  const hoverSky = cutout && hover ? skyAtPixel(cutout, hover.x, hover.y) : null
  const hoverWave = cutout && hover ? waveAtPixel(cutout, hover.x, hover.y) : null
  const hoverValue = cutout && hover
    ? (layer === 'variance'
        ? cutout.variancePixels?.[hover.y * cutout.image.width + hover.x]
        : layer === 'flags'
          ? cutout.flagPixels?.[hover.y * cutout.image.width + hover.x]
          : layer === 'zodi'
            ? cutout.zodiPixels?.[hover.y * cutout.image.width + hover.x]
            : cutout.pixels[hover.y * cutout.image.width + hover.x]) ?? Number.NaN
    : Number.NaN

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative overflow-hidden rounded-[var(--radius-card-sm)] border border-white/12 bg-[#04030a]">
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: 'auto' }}
          className={`block touch-none select-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          role="img"
          aria-label={
            cutout
              ? `Real IRSA SPHEREx ${cutout.image.width} by ${cutout.image.height} pixel detector cutout, ${LAYER_LABEL[layer]}, ${activeZoom.toFixed(1)} times zoom`
              : 'Real IRSA SPHEREx cutout loading'
          }
          onPointerDown={(event) => {
            if (!cutout) return
            if (event.pointerType === 'mouse' && event.button !== 0) return
            dragRef.current = {
              id: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              cx: centerX,
              cy: centerY,
              moved: false,
            }
            event.currentTarget.setPointerCapture(event.pointerId)
            setDragging(true)
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current
            if (drag && drag.id === event.pointerId) {
              const rect = event.currentTarget.getBoundingClientRect()
              const dx = event.clientX - drag.x
              const dy = event.clientY - drag.y
              if (Math.hypot(dx, dy) > 3) drag.moved = true
              if (drag.moved) {
                setView({
                  cx: Math.min(
                    imageWidth - halfWidth,
                    Math.max(halfWidth, drag.cx - (dx / rect.width) * viewWidth),
                  ),
                  cy: Math.min(
                    imageHeight - halfHeight,
                    Math.max(halfHeight, drag.cy + (dy / rect.height) * viewHeight),
                  ),
                })
                setHover(null)
                return
              }
            }
            setHover(pixelAt(event))
          }}
          onPointerUp={(event) => {
            const drag = dragRef.current
            dragRef.current = null
            setDragging(false)
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId)
            }
            if (drag && drag.id === event.pointerId && drag.moved) return
            const point = pixelAt(event)
            if (point) onProbe(point)
          }}
          onPointerCancel={() => {
            dragRef.current = null
            setDragging(false)
          }}
          onPointerLeave={() => {
            if (!dragRef.current) setHover(null)
          }}
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="caps rounded-full bg-black/45 px-2.5 py-1.5 text-[9px] text-white/75 backdrop-blur-sm">
              {cutout ? `${cutout.image.width} × ${cutout.image.height} detector pixels` : 'IRSA cutout'}
            </span>
            <span className="caps rounded-full bg-violet/30 px-2.5 py-1.5 text-[9px] text-white backdrop-blur-sm">
              {LAYER_LABEL[layer]} · real array
            </span>
            <span className="caps rounded-full bg-black/45 px-2.5 py-1.5 text-[9px] tabular-nums text-white/75 backdrop-blur-sm">
              {activeZoom.toFixed(1)}×
            </span>
          </div>

          <a
            href={provenance.uri || 'https://irsa.ipac.caltech.edu/'}
            target="_blank"
            rel="noreferrer"
            className="pointer-events-auto max-w-[15rem] rounded-[10px] border border-white/20 bg-black/55 px-3 py-2 text-right backdrop-blur-md transition-colors hover:border-white/55"
            title="Open the exact IRSA product used here"
          >
            <span className="caps block text-[8px] text-white/45">Data source · top right</span>
            <span className="caps mt-0.5 flex items-center justify-end gap-1 text-[9px] text-white">
              IRSA · SPHEREx {provenance.release || 'DR1'} <ExternalLink className="size-2.5" aria-hidden />
            </span>
            <span className="caps mt-0.5 block text-[8px] text-white/55">
              {provenance.loading ? 'querying SIA2…' : `${provenance.detector || '—'} · ${formatTime(provenance.iso)}`}
            </span>
            {provenance.cached && <span className="caps mt-0.5 block text-[8px] text-cyan">cached IRSA cutout</span>}
          </a>
        </div>

        {cutout && (
          <div className="absolute top-1/2 right-3 z-20 flex -translate-y-1/2 flex-col gap-1 rounded-full border border-white/20 bg-black/55 p-1 backdrop-blur-md">
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => applyZoom(activeZoom * 1.5)}
              className="grid size-8 place-items-center rounded-full text-white/75 transition-colors hover:bg-white/15 hover:text-white"
            >
              <Plus className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => applyZoom(activeZoom / 1.5)}
              disabled={activeZoom <= 1}
              className="grid size-8 place-items-center rounded-full text-white/75 transition-colors hover:bg-white/15 hover:text-white disabled:opacity-30"
            >
              <Minus className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Fit the whole cutout"
              onClick={() => {
                setZoom(1)
                setView(null)
              }}
              className="grid size-8 place-items-center rounded-full text-white/75 transition-colors hover:bg-white/15 hover:text-white"
            >
              <Maximize2 className="size-3.5" aria-hidden />
            </button>
          </div>
        )}

        {cutout && (
          <div className="pointer-events-none absolute right-3 bottom-15 z-10 hidden text-right sm:block">
            <span className="caps block text-[8px] text-white/40">scroll to zoom · drag to pan · click to measure</span>
          </div>
        )}

        {cutout && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3 sm:p-4">
            <div>
              <span className="caps block text-[8px] text-white/45">{cutout.obsid || 'IRSA level-2'} · native detector frame</span>
              <span className="caps mt-1 block text-[10px] text-white/75">
                {hoverSky ? `${formatRA(hoverSky.ra)} ${formatDec(hoverSky.dec)}` : 'move to inspect'}
              </span>
              {hoverWave && (
                <span className="caps mt-1 block text-[8px] text-violet-light">
                  λ {hoverWave.wavelength.toFixed(3)} μm · Δ {hoverWave.bandwidth.toFixed(4)} μm
                </span>
              )}
            </div>
            <div className="text-right">
              <span className="caps block text-[8px] text-white/45">{layersValueLabel(layer)}</span>
              <span className="caps mt-0.5 block text-[10px] text-white/80">
                {Number.isFinite(hoverValue) ? formatValue(hoverValue, layer) : '—'}
              </span>
              <span className="caps mt-1 block text-[8px] text-white/35">
                {cutout.scale > 0 ? `${cutout.scale.toFixed(2)}″ / pixel` : 'WCS scale unavailable'}
              </span>
            </div>
          </div>
        )}

        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#04030a]/80 px-5 text-center backdrop-blur-[2px]">
            <LoaderCircle className="size-6 animate-spin text-violet-light" aria-hidden />
            <p className="caps text-[10px] text-white/75">Fetching real IRSA cutout</p>
            <p className="max-w-[18rem] text-[13px] leading-relaxed text-white/45">
              SIA2 finds the detector frame, then the IRSA cutout service returns the real FITS arrays.
            </p>
          </div>
        )}

        {!loading && error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#04030a]/88 px-5 text-center backdrop-blur-[2px]">
            <AlertTriangle className="size-6 text-pink" aria-hidden />
            <p className="caps text-[10px] text-pink">IRSA did not return this cutout</p>
            <p className="max-w-[20rem] text-[13px] leading-relaxed text-white/55">{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="round mt-1 inline-flex h-9 items-center gap-1.5 rounded-full border border-white/25 px-4 text-[11px] text-white transition-colors hover:border-white"
            >
              <RefreshCw className="size-3.5" aria-hidden /> Retry IRSA
            </button>
          </div>
        )}

        {!loading && !error && !cutout && (
          <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 px-5 text-center">
            <p className="caps text-[10px] text-white/45">No real cutout loaded</p>
            <p className="max-w-[20rem] text-[14px] leading-relaxed text-white/55">
              Choose a field with SPHEREx DR1 coverage. The viewer only draws the FITS pixels IRSA returns.
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="round inline-flex h-9 items-center gap-1.5 rounded-full border border-white/25 px-4 text-[11px] text-white transition-colors hover:border-white"
            >
              <RefreshCw className="size-3.5" aria-hidden /> Query IRSA
            </button>
          </div>
        )}

        <span aria-hidden className="pointer-events-none absolute top-3 left-3 size-4 border-t border-l border-white/25" />
        <span aria-hidden className="pointer-events-none absolute right-3 bottom-3 size-4 border-r border-b border-white/25" />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="FITS plane">
          {(['image', 'variance', 'flags', 'zodi'] as RealLayer[]).map((option) => {
            const available =
              option === 'image' ||
              (option === 'variance' && cutout?.variancePixels) ||
              (option === 'flags' && cutout?.flagPixels) ||
              (option === 'zodi' && cutout?.zodiPixels)
            return (
              <button
                key={option}
                type="button"
                onClick={() => onLayer(option)}
                aria-pressed={layer === option}
                disabled={!available}
                className={cx(
                  'round h-8 rounded-full border px-3 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-30',
                  layer === option
                    ? 'border-violet bg-violet text-white'
                    : 'border-line-strong bg-card text-ink hov:border-ink',
                )}
              >
                {LAYER_LABEL[option]}
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(['gaia', 'wise'] as const).map((survey) => (
            <button
              key={survey}
              type="button"
              onClick={() => onToggleCatalog(survey)}
              aria-pressed={catalogLayers[survey]}
              className={cx(
                'round h-8 rounded-full border px-3 text-[11px] transition-colors',
                catalogLayers[survey]
                  ? survey === 'gaia'
                    ? 'border-pink bg-pink/15 text-[#a3217b]'
                    : 'border-cyan bg-cyan/15 text-[#08718f]'
                  : 'border-line-strong bg-card text-ink hov:border-ink',
              )}
            >
              {survey === 'gaia' ? 'Gaia DR3' : 'AllWISE'}
            </button>
          ))}
        </div>
      </div>

      {cutout && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          <p className="caps text-[9px] text-muted">
            {catalogLayers.gaia || catalogLayers.wise
              ? `${catalogs.gaia?.count ?? 0} Gaia · ${catalogs.wise?.count ?? 0} WISE real sources`
              : 'click the image for a real pixel spectrum'}
          </p>
          {cutout.flagCounts.some((count) => count > 0) && (
            <p className="caps text-[9px] text-muted">
              flag bits: {cutout.flagCounts.map((count, bit) => (count ? `${bit}:${count}` : '')).filter(Boolean).slice(0, 5).join(' · ')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function layersValueLabel(layer: RealLayer) {
  if (layer === 'variance') return 'Variance'
  if (layer === 'flags') return 'Flag bitmask'
  if (layer === 'zodi') return 'Zodiacal surface brightness'
  return 'Science pixel'
}

function formatValue(value: number, layer: RealLayer) {
  if (layer === 'flags') return `0x${(value | 0).toString(16).padStart(4, '0')}`
  if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)) return value.toExponential(2)
  return value.toFixed(4)
}
