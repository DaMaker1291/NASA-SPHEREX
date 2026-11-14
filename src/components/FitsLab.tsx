import { AlertTriangle, Crosshair, Database, ExternalLink, FileUp, LoaderCircle, ScanLine, Upload } from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type PointerEvent } from 'react'

import { LINKS } from '../data'
import { cx } from '../lib/cx'
import {
  drawFits,
  flagBitCounts,
  imageStats,
  numberValue,
  parseFits,
  pixelScale,
  readImage,
  skyAt,
  textValue,
  waveAt,
  type FitsFile,
  type FitsHdu,
  type FitsStats,
  type Stretch,
} from '../lib/fits'
import { formatDec, formatRA } from '../lib/spherex'

const STRETCHES: Array<{ id: Stretch; label: string; note: string }> = [
  { id: 'asinh', label: 'Asinh', note: 'faint structure' },
  { id: 'linear', label: 'Linear', note: 'true ratios' },
  { id: 'log', label: 'Log', note: 'wide range' },
]

const HDU_LABEL: Record<string, string> = {
  IMAGE: 'Science',
  FLAGS: 'Flags',
  VARIANCE: 'Variance',
  ZODI: 'Zodiacal',
  PSF: 'PSF cube',
}

type ArchiveFile = {
  url: string
  week: string
  detector: number
  visit: number
  frame: number
  obsid: string
  name: string
  size: number
}

type ArchiveManifest = {
  files: ArchiveFile[]
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatFlux(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return '—'
  if (value === 0) return '0'
  const size = Math.abs(value)
  if (size >= 10000 || size < 0.001) return value.toExponential(2)
  return value.toFixed(3)
}

function formatDate(value: string) {
  if (!value) return '—'
  return value.replace('T', ' ').slice(0, 19)
}

function formatExposure(value: number) {
  return Number.isFinite(value) ? `${value.toFixed(1)} s` : '—'
}

function formatScale(value: number) {
  return Number.isFinite(value) ? `${value.toFixed(2)}″` : '—'
}

function formatWave(value: number | undefined) {
  return value !== undefined && Number.isFinite(value) ? `${value.toFixed(3)} μm` : '—'
}

function formatBandwidth(value: number | undefined) {
  return value !== undefined && Number.isFinite(value) ? `Δ ${value.toFixed(4)} μm` : '—'
}

function flagName(hdu: FitsHdu, bit: number) {
  if (bit === numberValue(hdu.header, 'MP_HOT', -1)) return 'hot'
  if (bit === numberValue(hdu.header, 'MP_COLD', -1)) return 'cold'
  return `bit ${bit}`
}

function waveColor(value: number, min: number, max: number) {
  const mix = Math.min(1, Math.max(0, (value - min) / (max - min || 1)))
  return `hsl(${258 + mix * 82} 88% ${27 + mix * 54}%)`
}

function hduLabel(hdu: FitsHdu) {
  return HDU_LABEL[hdu.name.toUpperCase()] ?? hdu.name.toLowerCase().replaceAll('_', ' ')
}

export function FitsLab() {
  const [fits, setFits] = useState<FitsFile | null>(null)
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null)
  const [fileName, setFileName] = useState('')
  const [hduIndex, setHduIndex] = useState(0)
  const [image, setImage] = useState<Float32Array | null>(null)
  const [stats, setStats] = useState<FitsStats | null>(null)
  const [stretch, setStretch] = useState<Stretch>('asinh')
  const [loading, setLoading] = useState(false)
  const [decoding, setDecoding] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [probe, setProbe] = useState<{ x: number; y: number } | null>(null)
  const [width, setWidth] = useState(0)
  const [slice, setSlice] = useState(0)
  const [flagBit, setFlagBit] = useState<number | null>(null)
  const [flagCounts, setFlagCounts] = useState<number[] | null>(null)
  const [archive, setArchive] = useState<ArchiveFile[]>([])
  const [selectedUrl, setSelectedUrl] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const autoRef = useRef(false)
  const loadedRef = useRef(false)
  const readRef = useRef(0)

  const hdu = fits?.hdus.find((item) => item.index === hduIndex) ?? fits?.hdus[0] ?? null
  const active = fits !== null && hdu !== null
  const busy = loading || decoding
  const source = hdu ? textValue(hdu.header, 'SRCFILE') : ''
  const cutout = hdu ? textValue(hdu.header, 'CUTOUT') : ''
  const unit = hdu ? textValue(hdu.header, 'BUNIT') : ''
  const celestial = hdu ? textValue(hdu.header, 'CTYPE1').startsWith('RA---TAN') : false
  const center = hdu && celestial
    ? {
        ra: numberValue(hdu.header, 'CRVAL1', Number.NaN),
        dec: numberValue(hdu.header, 'CRVAL2', Number.NaN),
      }
    : null
  const probeSky = hdu && probe ? skyAt(hdu, probe.x + 1, probe.y + 1) : null
  const probeValue = hdu && probe && image ? image[probe.y * hdu.width + probe.x] : Number.NaN
  const cutX = hdu ? numberValue(hdu.header, 'CUTX0') : 0
  const cutY = hdu ? numberValue(hdu.header, 'CUTY0') : 0
  const probeWave = fits?.wave && hdu && probe && hdu.name.toUpperCase() !== 'PSF'
    ? waveAt(fits.wave, cutX + probe.x + 1, cutY + probe.y + 1)
    : null
  const centerWave = fits?.wave && hdu && hdu.name.toUpperCase() !== 'PSF'
    ? waveAt(fits.wave, cutX + hdu.width / 2 + 0.5, cutY + hdu.height / 2 + 0.5)
    : null
  const hduBitPix = hdu?.bitPix ?? 0
  const integerPlane = hduBitPix === 32 || hduBitPix === 16 || hduBitPix === 8
  const flagPlane = hdu?.name.toUpperCase() === 'FLAGS'
  const weeks = [...new Set(archive.map((file) => file.week))]
  const selected = archive.find((file) => file.url === selectedUrl) ?? null

  const accept = (data: ArrayBuffer, name: string) => {
    const parsed = parseFits(data)
    setFits(parsed)
    setBuffer(data)
    setFileName(name)
    setHduIndex(parsed.hdus[0].index)
    setProbe(null)
    setImage(null)
    setStats(null)
    setSlice(0)
    setFlagBit(null)
    setFlagCounts(null)
    setError('')
    loadedRef.current = true
  }

  const openFile = async (file: File) => {
    const token = readRef.current + 1
    readRef.current = token
    setLoading(true)
    setError('')
    try {
      if (file.size > 512 * 1024 * 1024) throw new Error('That file is larger than 512 MB. Try a single SPHEREx level-2 product.')
      const data = await file.arrayBuffer()
      if (token !== readRef.current) return
      accept(data, file.name)
    } catch (caught) {
      if (token !== readRef.current) return
      setFits(null)
      setBuffer(null)
      setFileName(file.name)
      setImage(null)
      setStats(null)
      setFlagCounts(null)
      setError(caught instanceof Error ? caught.message : 'That file could not be read.')
    } finally {
      if (token === readRef.current) setLoading(false)
    }
  }

  const openSample = async () => {
    autoRef.current = true
    const token = readRef.current + 1
    readRef.current = token
    setLoading(true)
    setError('')
    try {
      const response = await fetch(LINKS.cometSample, { cache: 'no-cache' })
      if (!response.ok) throw new Error('The sample could not be loaded. Check the connection and try again.')
      const data = await response.arrayBuffer()
      if (token !== readRef.current) return
      accept(data, '3IATLAS-sample.fits')
    } catch (caught) {
      if (token !== readRef.current) return
      setError(caught instanceof Error ? caught.message : 'The sample could not be loaded.')
    } finally {
      if (token === readRef.current) setLoading(false)
    }
  }

  useEffect(() => {
    const element = wrapRef.current
    if (!element) return
    const measure = () => setWidth(element.getBoundingClientRect().width)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let live = true
    fetch(LINKS.cometManifest)
      .then(async (response) => (response.ok ? ((await response.json()) as ArchiveManifest) : null))
      .then((data: ArchiveManifest | null) => {
        if (live && data?.files?.length) setArchive(data.files)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    setSlice(Math.floor((hdu?.depth ?? 1) / 2))
    setFlagBit(null)
  }, [hdu])

  useEffect(() => {
    const element = wrapRef.current
    if (!element) return
    const loadIfVisible = () => {
      if (autoRef.current || loadedRef.current) return
      const rect = element.getBoundingClientRect()
      if (rect.top > window.innerHeight + 240 || rect.bottom < -240) return
      autoRef.current = true
      void openSample()
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadIfVisible()
      },
      { rootMargin: '240px' },
    )
    observer.observe(element)
    const timer = window.setTimeout(loadIfVisible, 800)
    window.addEventListener('scroll', loadIfVisible, { passive: true })
    window.addEventListener('resize', loadIfVisible)
    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
      window.removeEventListener('scroll', loadIfVisible)
      window.removeEventListener('resize', loadIfVisible)
    }
  }, [])

  useEffect(() => {
    if (!buffer || !hdu) {
      setImage(null)
      setStats(null)
      setFlagCounts(null)
      return
    }
    let live = true
    setDecoding(true)
    setImage(null)
    setStats(null)
    setProbe(null)
    setError('')
    const timer = window.setTimeout(() => {
      try {
        const raw = readImage(buffer, hdu, slice)
        const counts = hdu.name.toUpperCase() === 'FLAGS' ? flagBitCounts(raw) : null
        let next = raw
        if (counts && flagBit !== null) {
          next = new Float32Array(raw.length)
          const mask = 1 << flagBit
          for (let i = 0; i < raw.length; i += 1) next[i] = (raw[i] & mask) !== 0 ? 1 : 0
        }
        const nextStats = imageStats(next)
        if (!live) return
        setFlagCounts(counts)
        setImage(next)
        setStats(nextStats)
      } catch (caught) {
        if (!live) return
        setError(caught instanceof Error ? caught.message : 'This HDU could not be decoded.')
      } finally {
        if (live) setDecoding(false)
      }
    }, 30)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [buffer, hdu, slice, flagBit])

  useEffect(() => {
    if (!canvasRef.current || !hdu || !image || !stats) return
    drawFits(canvasRef.current, image, hdu, stats, stretch, width || 680)
  }, [hdu, image, stats, stretch, width])

  const pointAt = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!hdu) return null
    const rect = event.currentTarget.getBoundingClientRect()
    const nx = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    const ny = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    return {
      x: Math.min(hdu.width - 1, Math.floor(nx * hdu.width)),
      y: Math.min(hdu.height - 1, hdu.height - 1 - Math.floor(ny * hdu.height)),
    }
  }

  const onInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    if (file) void openFile(file)
    event.currentTarget.value = ''
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file) void openFile(file)
  }

  const selectHdu = (next: number) => {
    setHduIndex(next)
    setProbe(null)
  }

  return (
    <div className="mt-7 grid gap-4 lg:grid-cols-[1.25fr_0.9fr]">
      <div className="grid content-start gap-3">
        <div
          ref={wrapRef}
          onDragEnter={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cx(
            'relative overflow-hidden rounded-[var(--radius-card-sm)] border bg-[#04030a] transition-colors',
            dragging ? 'border-violet-light shadow-[0_0_0_3px_rgb(185_162_255/0.22)]' : 'border-white/12',
          )}
          style={active && hdu ? { aspectRatio: `${hdu.width} / ${hdu.height}` } : undefined}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".fits,.fit,.fts,application/fits"
            onChange={onInput}
            className="sr-only"
            aria-label="Choose a FITS file"
          />

          {active && hdu ? (
            <canvas
              ref={canvasRef}
              style={{ aspectRatio: `${hdu.width} / ${hdu.height}` }}
              className="block w-full touch-none select-none"
              role="img"
              aria-label={`Real FITS image ${hdu.name}, ${hdu.width} by ${hdu.height} pixels${hdu.depth > 1 ? `, plane ${slice + 1} of ${hdu.depth}` : ''}`}
              onPointerDown={(event) => setProbe(pointAt(event))}
              onPointerMove={(event) => setProbe(pointAt(event))}
              onPointerLeave={() => setProbe(null)}
            />
          ) : (
            <div className="flex min-h-[390px] flex-col items-center justify-center px-5 py-10 text-center sm:min-h-[460px]">
              <span className="grid size-14 place-items-center rounded-full border border-white/15 bg-white/5 text-violet-light">
                {loading ? <LoaderCircle className="size-6 animate-spin" aria-hidden /> : <Upload className="size-6" aria-hidden />}
              </span>
              <p className="display mt-5 text-[clamp(2.3rem,1.6rem+3.4vw,4.6rem)] leading-[0.9] text-white">
                {loading ? 'Reading the file' : 'Drop a FITS'}
              </p>
              <p className="mt-3 max-w-sm text-[14px] leading-relaxed text-white/55">
                Open a real SPHEREx level-2 file and read every extension here. The pixels stay on this device — nothing is uploaded.
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => void openSample()}
                  disabled={loading}
                  className="round inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[14px] font-medium text-ink transition-colors hov:bg-violet hov:text-white disabled:opacity-50"
                >
                  <ScanLine className="size-4" aria-hidden />
                  Open the real 3I/ATLAS frame
                </button>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={loading}
                  className="caps inline-flex h-11 items-center gap-1.5 rounded-full border border-white/20 px-4 text-[10px] text-white/75 transition-colors hov:border-white hov:text-white disabled:opacity-50"
                >
                  <FileUp className="size-3.5" aria-hidden />
                  Choose a file
                </button>
              </div>
              <p className="caps mt-4 text-[9px] text-white/35">six-extension 3I/ATLAS cutout · 8.8 MB · or drop a full 71 MB product</p>
            </div>
          )}

          {active && hdu && (
            <>
              <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-3 sm:p-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="caps rounded-full bg-white/10 px-2.5 py-1.5 text-[10px] text-white backdrop-blur-sm">
                    {hduLabel(hdu)} · HDU {hdu.index}
                  </span>
                  {textValue(hdu.header, 'OBSID') && (
                    <span className="caps rounded-full bg-black/30 px-2.5 py-1.5 text-[10px] text-white/70 backdrop-blur-sm">
                      {textValue(hdu.header, 'OBSID')}
                    </span>
                  )}
                </div>
                <span
                  title={source || fileName || 'Local FITS file'}
                  className="caps inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/25 px-2.5 py-1.5 text-[9px] text-white/60 backdrop-blur-sm"
                >
                  <span aria-hidden className="size-1.5 rounded-full bg-cyan" />
                  {fileName.includes('3IATLAS') ? 'IRSA · 3I/ATLAS QR2' : 'local file · no upload'}
                </span>
              </div>

              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3 sm:p-4">
                <div>
                  <span
                    aria-hidden
                    className="mb-1.5 block h-[3px] w-24 rounded-full bg-[linear-gradient(90deg,#04030e,#4810a4,#8b1cf6,#ff5dcc,#fff0e8)]"
                  />
                  <span className="caps block text-[9px] text-white/45">
                    {flagBit !== null ? `FLAG ${flagName(hdu, flagBit)} MASK` : `${STRETCHES.find((item) => item.id === stretch)?.label} stretch · p1–p99.5`}
                  </span>
                  <span className="caps mt-1 block text-[10px] text-white/75">
                    {formatFlux(stats?.low)} – {formatFlux(stats?.high)} {unit}
                  </span>
                </div>
                <div className="text-right">
                  <span className="caps block text-[10px] text-white/80">
                    {probeSky ? `${formatRA(probeSky.ra)} ${formatDec(probeSky.dec)}` : center && Number.isFinite(center.ra) ? `${formatRA(center.ra)} ${formatDec(center.dec)}` : 'WCS unavailable'}
                  </span>
                  <span className="caps mt-1 block text-[9px] text-white/40">
                    {probe && Number.isFinite(probeValue) ? `${formatFlux(probeValue)} ${unit}` : 'move to inspect a pixel'}
                  </span>
                  {probeWave ? (
                    <span className="caps mt-1 block text-[9px] text-violet-light">
                      {formatWave(probeWave.wavelength)} · {formatBandwidth(probeWave.bandwidth)}
                    </span>
                  ) : centerWave ? (
                    <span className="caps mt-1 block text-[9px] text-white/35">
                      center {formatWave(centerWave.wavelength)} · {formatBandwidth(centerWave.bandwidth)}
                    </span>
                  ) : null}
                </div>
              </div>

              {probe && hdu && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute z-10"
                  style={{
                    left: `${((probe.x + 0.5) / hdu.width) * 100}%`,
                    top: `${((hdu.height - 1 - probe.y + 0.5) / hdu.height) * 100}%`,
                  }}
                >
                  <span className="absolute size-8 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/35" />
                  <span className="absolute size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pink shadow-[0_0_8px_rgb(255_138_216/0.9)]" />
                  <span className="absolute top-1/2 left-1/2 size-12 -translate-x-1/2 -translate-y-1/2 border border-dashed border-white/20" />
                </div>
              )}

              {busy && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#04030a]/82 backdrop-blur-[2px]">
                  <LoaderCircle className="size-6 animate-spin text-violet-light" aria-hidden />
                  <p className="caps text-[10px] text-white/65">{loading ? 'Reading file' : 'Decoding HDU'}</p>
                  <p className="text-[13px] text-white/40">
                    {hdu.width} × {hdu.height}{hdu.depth > 1 ? ` × ${hdu.depth}` : ''} · {hduBitPix > 0 ? 'integer' : 'float'} pixels
                  </p>
                </div>
              )}

              <span aria-hidden className="pointer-events-none absolute top-3 left-3 size-4 border-t border-l border-white/25" />
              <span aria-hidden className="pointer-events-none absolute top-3 right-3 size-4 border-t border-r border-white/25" />
              <span aria-hidden className="pointer-events-none absolute bottom-3 left-3 size-4 border-b border-l border-white/25" />
              <span aria-hidden className="pointer-events-none absolute right-3 bottom-3 size-4 border-r border-b border-white/25" />
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {(fits?.hdus ?? []).map((item) => (
              <button
                key={item.index}
                type="button"
                onClick={() => selectHdu(item.index)}
                aria-pressed={item.index === hdu?.index}
                title={`${item.name} · ${item.width}×${item.height}${item.depth > 1 ? `×${item.depth}` : ''} · BITPIX ${item.bitPix}`}
                className={cx(
                  'round rounded-full border px-3 py-1.5 text-left text-[11px] transition-colors',
                  item.index === hdu?.index
                    ? 'border-white bg-white text-ink'
                    : 'border-white/15 text-white/60 hov:border-white/40 hov:text-white',
                )}
              >
                <span className="block font-medium">{hduLabel(item)}</span>
                <span className="caps block text-[8px] opacity-55">HDU {item.index}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {STRETCHES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setStretch(item.id)}
                aria-pressed={stretch === item.id}
                title={item.note}
                className={cx(
                  'round rounded-full px-2.5 py-1.5 text-[10px] transition-colors',
                  stretch === item.id ? 'bg-violet text-white' : 'text-white/45 hov:bg-white/10 hov:text-white',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {hdu && hdu.depth > 1 && (
          <div className="flex items-center gap-3 rounded-[12px] border border-white/10 px-3 py-2">
            <span className="caps shrink-0 text-[9px] text-white/45">{hdu.name.toUpperCase() === 'PSF' ? 'PSF plane' : 'Cube plane'}</span>
            <input
              type="range"
              min={0}
              max={hdu.depth - 1}
              value={Math.min(slice, hdu.depth - 1)}
              onChange={(event) => {
                setSlice(Number(event.currentTarget.value))
                setProbe(null)
              }}
              aria-label={`${hdu.name} plane`}
              className="h-1 min-w-0 flex-1 accent-violet"
            />
            <span className="caps w-14 text-right text-[9px] tabular-nums text-white/65">
              {Math.min(slice, hdu.depth - 1) + 1}/{hdu.depth}
            </span>
          </div>
        )}

        {flagPlane && hdu && flagCounts && (
          <div className="rounded-[12px] border border-white/10 px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="caps text-[9px] text-amber-200/65">Flag bits · all 32 checked</span>
              <button
                type="button"
                onClick={() => setFlagBit(null)}
                aria-pressed={flagBit === null}
                className={cx(
                  'caps rounded-full px-2.5 py-1 text-[8px] transition-colors',
                  flagBit === null ? 'bg-white text-ink' : 'text-white/50 hov:bg-white/10 hov:text-white',
                )}
              >
                raw values
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {flagCounts.map((count, bit) =>
                count > 0 ? (
                  <button
                    key={bit}
                    type="button"
                    onClick={() => setFlagBit(bit)}
                    aria-pressed={flagBit === bit}
                    title={`${flagName(hdu, bit)} · ${count.toLocaleString()} pixels`}
                    className={cx(
                      'round rounded-full border px-2 py-1 text-[9px] tabular-nums transition-colors',
                      flagBit === bit
                        ? 'border-amber-200 bg-amber-200 text-ink'
                        : 'border-white/15 text-white/55 hov:border-white/40 hov:text-white',
                    )}
                  >
                    {flagName(hdu, bit)} · {count.toLocaleString()}
                  </button>
                ) : null,
              )}
            </div>
            <p className="caps mt-2 text-[8px] leading-relaxed text-white/30">
              {flagBit === null ? 'Raw bit fields. Pick a bit to isolate it.' : `Showing ${flagName(hdu, flagBit)} only.`}
            </p>
          </div>
        )}

        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-[12px] border border-danger/35 bg-danger/10 px-3 py-2.5 text-[13px] text-[#ffb4b7]">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        )}
      </div>

      <div className="grid content-start gap-3">
        <div className="rounded-[var(--radius-card-sm)] border border-white/10 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="caps flex items-center gap-1.5 text-[9px] text-white/45">
              <Crosshair className="size-3" aria-hidden /> Header
            </p>
            <span className="caps text-[9px] text-white/35">{fileName ? formatBytes(buffer?.byteLength ?? 0) : 'no file'}</span>
          </div>
          <p className="mt-2 truncate text-[13px] text-white" title={fileName}>
            {fileName || 'A SPHEREx FITS file'}
          </p>
          {hdu ? (
            <>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
                {[
                  ['Detector', textValue(hdu.header, 'DETECTOR', '—')],
                  ['Date', formatDate(textValue(hdu.header, 'DATE-AVG', textValue(hdu.header, 'DATE-OBS')))],
                  ['Exposure', formatExposure(numberValue(hdu.header, 'XPOSURE', Number.NaN))],
                  ['Pixel scale', formatScale(pixelScale(hdu))],
                  ['Image', `${hdu.width} × ${hdu.height}${hdu.depth > 1 ? ` × ${hdu.depth}` : ''}`],
                  ['Bit depth', `${Math.abs(hdu.bitPix)}-bit ${integerPlane ? 'int' : 'float'}`],
                ].map(([label, value]) => (
                  <div key={label} className="border-t border-white/10 pt-1.5">
                    <dt className="caps text-[8px] text-white/40">{label}</dt>
                    <dd className="mt-0.5 truncate text-[12px] tabular-nums text-white/85">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-3 border-t border-white/10 pt-2.5">
                <p className="caps text-[8px] text-white/40">Center · ICRS</p>
                <p className="mt-0.5 text-[12px] tabular-nums text-white/85">
                  {center && Number.isFinite(center.ra) ? `${formatRA(center.ra)} ${formatDec(center.dec)}` : 'No celestial WCS'}
                </p>
              </div>
              {centerWave && (
                <div className="mt-2.5 grid grid-cols-2 gap-2 border-t border-white/10 pt-2.5">
                  <div>
                    <p className="caps text-[8px] text-white/35">Wavelength</p>
                    <p className="text-[11px] tabular-nums text-violet-light">{formatWave(centerWave.wavelength)}</p>
                  </div>
                  <div>
                    <p className="caps text-[8px] text-white/35">Bandwidth</p>
                    <p className="text-[11px] tabular-nums text-white/75">{formatBandwidth(centerWave.bandwidth)}</p>
                  </div>
                </div>
              )}
              <div className="mt-2.5 grid grid-cols-3 gap-2 border-t border-white/10 pt-2.5">
                <div>
                  <p className="caps text-[8px] text-white/35">min</p>
                  <p className="text-[11px] tabular-nums text-white/75">{formatFlux(stats?.min)}</p>
                </div>
                <div>
                  <p className="caps text-[8px] text-white/35">median</p>
                  <p className="text-[11px] tabular-nums text-white/75">{formatFlux(stats?.median)}</p>
                </div>
                <div>
                  <p className="caps text-[8px] text-white/35">max</p>
                  <p className="text-[11px] tabular-nums text-white/75">{formatFlux(stats?.max)}</p>
                </div>
              </div>
              {flagPlane && (
                <p className="caps mt-2 text-[8px] leading-relaxed text-amber-200/60">
                  Flag plane — integer bit fields, not flux.
                </p>
              )}
              {source && (
                <p className="caps mt-2 truncate text-[8px] text-white/30" title={source}>
                  {cutout || 'Cutout'} · {source}
                </p>
              )}
            </>
          ) : (
            <p className="mt-2 text-[13px] leading-relaxed text-white/45">
              Open a file to see its observation id, detector, exposure, WCS centre and pixel statistics.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="caps inline-flex h-9 items-center gap-1.5 rounded-full border border-white/20 px-3 text-[9px] text-white/70 transition-colors hov:border-white hov:text-white"
            >
              <FileUp className="size-3" aria-hidden /> Choose file
            </button>
            <button
              type="button"
              onClick={() => void openSample()}
              className="caps inline-flex h-9 items-center gap-1.5 rounded-full px-2 text-[9px] text-violet-light transition-colors hov:text-white"
            >
              <ScanLine className="size-3" aria-hidden /> Reset sample
            </button>
          </div>
        </div>

        {fits?.wave && (
          <div className="rounded-[var(--radius-card-sm)] border border-white/10 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="caps flex items-center gap-1.5 text-[9px] text-white/45">
                <ScanLine className="size-3" aria-hidden /> WCS-WAVE
              </p>
              <span className="caps text-[9px] text-white/30">HDU {fits.wave.table.index}</span>
            </div>
            <p className="mt-2 text-[14px] leading-snug text-white">
              Every detector pixel has a wavelength.
            </p>
            <div className="mt-2 grid grid-cols-9 gap-0.5" aria-hidden>
              {fits.wave.wavelengths.map((value, index) => (
                <span
                  key={index}
                  title={`${formatWave(value)} · ${formatBandwidth(fits.wave?.bandwidths[index])}`}
                  style={{ background: Number.isFinite(value) ? waveColor(value, fits.wave?.minWavelength ?? 0, fits.wave?.maxWavelength ?? 1) : '#16121f' }}
                  className="aspect-square rounded-[2px]"
                />
              ))}
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2 border-t border-white/10 pt-2.5">
              <div>
                <p className="caps text-[8px] text-white/35">Wavelength</p>
                <p className="text-[11px] tabular-nums text-violet-light">{formatWave(fits.wave.minWavelength)} – {formatWave(fits.wave.maxWavelength)}</p>
              </div>
              <div>
                <p className="caps text-[8px] text-white/35">Bandwidth</p>
                <p className="text-[11px] tabular-nums text-white/75">Δ {fits.wave.minBandwidth.toFixed(4)} – {fits.wave.maxBandwidth.toFixed(4)} μm</p>
              </div>
            </div>
            <p className="caps mt-2 text-[8px] leading-relaxed text-white/25">
              {fits.wave.table.name} · {fits.wave.xs.length} × {fits.wave.ys.length} control grid · bilinear lookup at the cursor
            </p>
          </div>
        )}

        <div className="rounded-[var(--radius-card-sm)] border border-white/10 p-4">
          <p className="caps flex items-center gap-1.5 text-[9px] text-white/45">
            <Database className="size-3" aria-hidden /> The full release
          </p>
          <p className="mt-2 text-[14px] leading-snug text-white">
            259 calibrated 3I/ATLAS products. <span className="text-white/45">18.55 GB · Quick Release 2.</span>
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-white/45">
            Download IRSA's official script, run it in a data folder, then drop any resulting <code className="text-white/70">.fits</code> file here.
          </p>
          {archive.length > 0 && (
            <div className="mt-3 border-t border-white/10 pt-2.5">
              <label htmlFor="fits-archive" className="caps block text-[8px] text-white/35">
                All {archive.length} products · direct from IRSA
              </label>
              <select
                id="fits-archive"
                value={selectedUrl}
                onChange={(event) => setSelectedUrl(event.currentTarget.value)}
                className="mt-1.5 w-full rounded-[9px] border border-white/15 bg-[#0b0716] px-2.5 py-2 text-[11px] text-white/75"
              >
                <option value="">Choose a visit…</option>
                {weeks.map((week) => (
                  <optgroup key={week} label={week}>
                    {archive
                      .filter((file) => file.week === week)
                      .map((file) => (
                        <option key={file.url} value={file.url}>
                          {file.obsid} · D{file.detector} · frame {file.frame}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
              {selected && (
                <a
                  href={selected.url}
                  target="_blank"
                  rel="noreferrer"
                  className="caps mt-2 inline-flex h-8 items-center gap-1.5 rounded-full border border-white/20 px-2.5 text-[8px] text-white/65 transition-colors hov:border-white hov:text-white"
                >
                  <ExternalLink className="size-3" aria-hidden /> Download {selected.obsid} · 71.6 MB
                </a>
              )}
              <p className="caps mt-2 text-[8px] leading-relaxed text-white/25">
                Every frame indexed. IRSA serves the 71.6 MB product; download it, then drop it above.
              </p>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <a
              href={LINKS.cometCurl}
              download
              className="caps inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-[9px] text-ink transition-colors hov:bg-violet hov:text-white"
            >
              <FileUp className="size-3" aria-hidden /> curl script
            </a>
            <a
              href={LINKS.cometWget}
              download
              className="caps inline-flex h-9 items-center gap-1.5 rounded-full border border-white/20 px-3 text-[9px] text-white/70 transition-colors hov:border-white hov:text-white"
            >
              <FileUp className="size-3" aria-hidden /> wget script
            </a>
            <a
              href={LINKS.comet}
              target="_blank"
              rel="noreferrer"
              className="caps inline-flex h-9 items-center gap-1 px-2 text-[9px] text-violet-light transition-colors hov:text-white"
            >
              IRSA page <ExternalLink className="size-3" aria-hidden />
            </a>
          </div>
          <p className="caps mt-3 text-[8px] leading-relaxed text-white/25">
            Files stay in the browser. The sample is real, all-extension data, not a rendering.
          </p>
        </div>
      </div>
    </div>
  )
}
