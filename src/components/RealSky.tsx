import { AlertTriangle, ExternalLink, LoaderCircle, RefreshCw } from 'lucide-react'
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
  const [size, setSize] = useState(620)
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)

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
    const image = context.createImageData(width, height)
    for (let y = 0; y < height; y += 1) {
      const sourceY = Math.min(cutout.image.height - 1, cutout.image.height - 1 - Math.floor((y * cutout.image.height) / height))
      for (let x = 0; x < width; x += 1) {
        const sourceX = Math.min(cutout.image.width - 1, Math.floor((x * cutout.image.width) / width))
        const color = colorFor(data[sourceY * cutout.image.width + sourceX], min, max, layer)
        const at = (y * width + x) * 4
        image.data[at] = color[0]
        image.data[at + 1] = color[1]
        image.data[at + 2] = color[2]
        image.data[at + 3] = 255
      }
    }
    context.putImageData(image, 0, 0)

    const scaleX = width / cutout.image.width
    const scaleY = height / cutout.image.height
    const drawCatalog = (catalog: CatalogResult | null, color: string) => {
      if (!catalog) return
      context.strokeStyle = color
      context.lineWidth = Math.max(1, dpr)
      context.setLineDash([3 * dpr, 3 * dpr])
      for (const source of catalog.sources) {
        const pixel = worldToPixel(cutout.image, source.ra, source.dec)
        if (!pixel) continue
        const x = pixel.x * scaleX
        const y = (cutout.image.height - 1 - pixel.y) * scaleY
        context.beginPath()
        context.arc(x, y, 4.5 * dpr, 0, Math.PI * 2)
        context.stroke()
      }
      context.setLineDash([])
    }
    if (catalogLayers.gaia) drawCatalog(catalogs.gaia, 'rgba(255,138,216,0.95)')
    if (catalogLayers.wise) drawCatalog(catalogs.wise, 'rgba(116,227,255,0.95)')

    if (probe) {
      const x = probe.x * scaleX
      const y = (cutout.image.height - 1 - probe.y) * scaleY
      context.strokeStyle = 'rgba(255,255,255,0.9)'
      context.lineWidth = dpr
      context.beginPath()
      context.arc(x, y, 8 * dpr, 0, Math.PI * 2)
      context.stroke()
      context.beginPath()
      context.moveTo(x - 14 * dpr, y)
      context.lineTo(x + 14 * dpr, y)
      context.moveTo(x, y - 14 * dpr)
      context.lineTo(x, y + 14 * dpr)
      context.stroke()
    }
  }, [cutout, layer, size, catalogs, catalogLayers, probe])

  const pixelAt = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!cutout) return null
    const rect = event.currentTarget.getBoundingClientRect()
    const nx = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    const ny = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    return {
      x: Math.min(cutout.image.width - 1, Math.floor(nx * cutout.image.width)),
      y: Math.min(cutout.image.height - 1, cutout.image.height - 1 - Math.floor(ny * cutout.image.height)),
    }
  }

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
          className="block touch-none select-none"
          role="img"
          aria-label={
            cutout
              ? `Real IRSA SPHEREx ${cutout.image.width} by ${cutout.image.height} pixel detector cutout, ${LAYER_LABEL[layer]}`
              : 'Real IRSA SPHEREx cutout loading'
          }
          onPointerMove={(event) => setHover(pixelAt(event))}
          onPointerLeave={() => setHover(null)}
          onPointerUp={(event) => {
            const point = pixelAt(event)
            if (point) onProbe(point)
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
