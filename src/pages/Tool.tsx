import {
  ArrowRight,
  Check,
  Copy,
  Database,
  ExternalLink,
  Layers3,
  RefreshCw,
  ScanLine,
  Target,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'

import { Badge, Title } from '../components/Bits'
import { Button, IconButton } from '../components/Button'
import { Card } from '../components/Card'
import { Field, Input, Select } from '../components/Field'
import { FitsLab } from '../components/FitsLab'
import { Holo } from '../components/Holo'
import { Nav } from '../components/Nav'
import { RealSky, type RealLayer } from '../components/RealSky'
import { RealSpectrumPanel } from '../components/RealSpectrum'
import { SourceHealthPanel } from '../components/SourceHealth'
import { LINKS } from '../data'
import { cx } from '../lib/cx'
import { ARRAYS, formatDec, formatRA } from '../lib/spherex'
import {
  DEFAULT_FIELD,
  REAL_PRESETS,
  detectorLabel,
  findRealField,
  formatBytes,
  formatTime,
  groupVisits,
  loadCatalog,
  loadRealCutout,
  loadRealSpectrum,
  loadSourceHealth,
  loadStaticIndex,
  normalizeField,
  skyAtPixel,
  summarizeVisits,
  type CatalogResult,
  type IrsaFind,
  type RealCutout,
  type RealSpectrum,
  type RealVisit,
  type SourceHealth,
} from '../lib/real'
import { useDocumentTitle } from '../lib/storage'

const FOVS = [0.1, 0.15, 0.2, 0.3, 0.5, 0.6]
const NONE = 'No real FITS cutout is loaded. IRSA is the only pixel source.'

function initialField() {
  if (typeof window === 'undefined') return DEFAULT_FIELD
  const params = new URLSearchParams(window.location.search)
  return normalizeField(
    Number(params.get('ra') ?? DEFAULT_FIELD.ra),
    Number(params.get('dec') ?? DEFAULT_FIELD.dec),
    Number(params.get('fov') ?? DEFAULT_FIELD.fov),
  )
}

function initialDetector() {
  if (typeof window === 'undefined') return 'D2'
  return new URLSearchParams(window.location.search).get('detector') ?? 'D2'
}

function fieldLabel(ra: number, dec: number) {
  return `${formatRA(ra)} ${formatDec(dec)}`
}

function formatGap(days: number | null | undefined) {
  if (days == null || !Number.isFinite(days)) return ''
  if (days >= 1) return `${days.toFixed(1)} days`
  if (days * 24 >= 1) return `${(days * 24).toFixed(1)} hours`
  return `${Math.max(1, Math.round(days * 1440))} minutes`
}

export function Tool() {
  useDocumentTitle()
  const [field, setField] = useState(initialField)
  const [draft, setDraft] = useState(field)
  const [find, setFind] = useState<IrsaFind | null>(null)
  const [visits, setVisits] = useState<RealVisit[]>([])
  const [visitIndex, setVisitIndex] = useState(0)
  const [detector, setDetector] = useState(initialDetector)
  const [cutout, setCutout] = useState<RealCutout | null>(null)
  const [layer, setLayer] = useState<RealLayer>('image')
  const [catalogs, setCatalogs] = useState<{ gaia: CatalogResult | null; wise: CatalogResult | null }>({
    gaia: null,
    wise: null,
  })
  const [catalogLayers, setCatalogLayers] = useState({ gaia: false, wise: false })
  const [catalogErrors, setCatalogErrors] = useState<{ gaia: string; wise: string }>({ gaia: '', wise: '' })
  const [probe, setProbe] = useState<{ x: number; y: number } | null>(null)
  const [target, setTarget] = useState({ ra: field.ra, dec: field.dec })
  const [spectrum, setSpectrum] = useState<RealSpectrum | null>(null)
  const [spectrumError, setSpectrumError] = useState('')
  const [loadingFind, setLoadingFind] = useState(true)
  const [loadingCutout, setLoadingCutout] = useState(false)
  const [loadingSpectrum, setLoadingSpectrum] = useState(false)
  const [findError, setFindError] = useState('')
  const [cutoutError, setCutoutError] = useState('')
  const [reload, setReload] = useState(0)
  const [copied, setCopied] = useState(false)
  const [sourceHealth, setSourceHealth] = useState<SourceHealth | null>(null)
  const [sourceHealthError, setSourceHealthError] = useState('')
  const findToken = useRef(0)
  const cutoutToken = useRef(0)
  const spectrumToken = useRef(0)
  const retryCount = useRef(0)

  const currentVisit = visits[visitIndex] ?? null
  const effectiveDetector = currentVisit?.detectors.find((item) => item.detector === detector) ?? currentVisit?.detectors[0] ?? null

  useEffect(() => {
    let live = true
    const check = () => {
      loadSourceHealth()
        .then((result) => {
          if (!live) return
          setSourceHealth(result)
          setSourceHealthError('')
        })
        .catch((error: unknown) => {
          if (!live) return
          setSourceHealthError(error instanceof Error ? error.message : 'Source probe failed.')
        })
    }
    void check()
    const timer = window.setInterval(check, 15_000)
    return () => {
      live = false
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    retryCount.current = 0
  }, [field.ra, field.dec, field.fov])

  useEffect(() => {
    if (!findError || loadingFind) return
    const delay = Math.min(60_000, 15_000 * 2 ** Math.min(retryCount.current, 2))
    const timer = window.setTimeout(() => {
      retryCount.current += 1
      setReload((value) => value + 1)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [findError, loadingFind])

  useEffect(() => {
    const token = findToken.current + 1
    findToken.current = token
    setLoadingFind(true)
    setFindError('')
    setFind(null)
    setVisits([])
    setCutout(null)
    setCutoutError('')
    setSpectrum(null)
    setSpectrumError('')
    setProbe(null)
    setTarget({ ra: field.ra, dec: field.dec })
    setCatalogs({ gaia: null, wise: null })

    const cached =
      reload === 0 && Math.abs(field.ra - DEFAULT_FIELD.ra) < 0.002 && Math.abs(field.dec - DEFAULT_FIELD.dec) < 0.002 && Math.abs(field.fov - DEFAULT_FIELD.fov) < 0.002
    const request = cached ? loadStaticIndex() : findRealField(field.ra, field.dec, field.fov)
    request
      .then((result) => {
        if (token !== findToken.current) return
        const grouped = groupVisits(result.observations)
        retryCount.current = 0
        setFind(result)
        setVisits(grouped)
        const requestedVisit = new URLSearchParams(window.location.search).get('visit')
        const requestedIndex = requestedVisit ? grouped.findIndex((visit) => visit.id === requestedVisit) : -1
        const preferredIndex = grouped.findLastIndex((visit) => visit.detectors.some((item) => item.detector === detector))
        const nextIndex = requestedIndex >= 0 ? requestedIndex : preferredIndex >= 0 ? preferredIndex : Math.max(0, grouped.length - 1)
        setVisitIndex(nextIndex)
        const nextVisit = grouped[nextIndex]
        if (nextVisit && !nextVisit.detectors.some((item) => item.detector === detector)) {
          setDetector(nextVisit.detectors[0]?.detector ?? 'D2')
        }
      })
      .catch((error: unknown) => {
        if (token !== findToken.current) return
        setFindError(error instanceof Error ? error.message : 'IRSA search failed.')
      })
      .finally(() => {
        if (token === findToken.current) setLoadingFind(false)
      })
  }, [field.ra, field.dec, field.fov, reload])

  useEffect(() => {
    if (!currentVisit || !effectiveDetector) {
      setCutout(null)
      return
    }
    const token = cutoutToken.current + 1
    cutoutToken.current = token
    setLoadingCutout(true)
    setCutoutError('')
    setCutout(null)
    setLayer('image')
    setSpectrum(null)
    setSpectrumError('')
    setProbe(null)
    setTarget({ ra: field.ra, dec: field.dec })

    loadRealCutout(effectiveDetector.uri, field.ra, field.dec, field.fov, reload > 0)
      .then((result) => {
        if (token !== cutoutToken.current) return
        setCutout(result)
      })
      .catch((error: unknown) => {
        if (token !== cutoutToken.current) return
        setCutoutError(error instanceof Error ? error.message : 'IRSA cutout failed.')
      })
      .finally(() => {
        if (token === cutoutToken.current) setLoadingCutout(false)
      })
  }, [field.ra, field.dec, field.fov, currentVisit?.id, effectiveDetector?.uri])

  useEffect(() => {
    if (!currentVisit) return
    if (!currentVisit.detectors.some((item) => item.detector === detector)) {
      setDetector(currentVisit.detectors[0]?.detector ?? 'D2')
    }
  }, [currentVisit, detector])

  useEffect(() => {
    const surveys: Array<'gaia' | 'wise'> = []
    if (catalogLayers.gaia && !catalogs.gaia) surveys.push('gaia')
    if (catalogLayers.wise && !catalogs.wise) surveys.push('wise')
    if (!surveys.length) return
    let live = true
    for (const survey of surveys) {
      setCatalogErrors((current) => ({ ...current, [survey]: '' }))
      loadCatalog(survey, field.ra, field.dec, Math.min(0.7, Math.max(0.05, field.fov * 0.65)))
        .then((result) => {
          if (!live) return
          setCatalogs((current) => ({ ...current, [survey]: result }))
        })
        .catch((error: unknown) => {
          if (!live) return
          setCatalogErrors((current) => ({
            ...current,
            [survey]: error instanceof Error ? error.message : 'Catalogue query failed.',
          }))
        })
    }
    return () => {
      live = false
    }
  }, [catalogLayers.gaia, catalogLayers.wise, catalogs.gaia, catalogs.wise, field.ra, field.dec, field.fov])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams()
    params.set('ra', field.ra.toFixed(3))
    params.set('dec', field.dec.toFixed(3))
    params.set('fov', field.fov.toFixed(2))
    params.set('detector', effectiveDetector?.detector ?? detector)
    if (currentVisit) params.set('visit', currentVisit.id)
    if (catalogLayers.gaia) params.set('layer', 'gaia')
    if (catalogLayers.wise) params.set('layer', 'wise')
    const next = `${window.location.pathname}?${params.toString()}${window.location.hash}`
    window.history.replaceState(null, '', next)
  }, [field, detector, effectiveDetector?.detector, currentVisit, catalogLayers])

  const applyField = (next: { ra: number; dec: number; fov: number }) => {
    const normalized = normalizeField(next.ra, next.dec, next.fov)
    setField(normalized)
    setDraft(normalized)
  }

  const selectVisit = (next: number) => {
    setVisitIndex(Math.min(visits.length - 1, Math.max(0, next)))
    setSpectrum(null)
    setSpectrumError('')
  }

  const toggleCatalog = (survey: 'gaia' | 'wise') => {
    setCatalogLayers((current) => ({ ...current, [survey]: !current[survey] }))
    setCatalogs((current) => ({ ...current, [survey]: current[survey] }))
  }

  const onProbe = (point: { x: number; y: number }) => {
    setProbe(point)
    if (!cutout) return
    const sky = skyAtPixel(cutout, point.x, point.y)
    if (sky) setTarget({ ra: sky.ra, dec: sky.dec })
    setSpectrum(null)
    setSpectrumError('')
  }

  const extractSpectrum = () => {
    if (!currentVisit || !currentVisit.detectors.length) return
    const token = spectrumToken.current + 1
    spectrumToken.current = token
    setLoadingSpectrum(true)
    setSpectrumError('')
    loadRealSpectrum(
      currentVisit.detectors.slice(0, 6).map((item) => item.uri),
      target.ra,
      target.dec,
    )
      .then((result) => {
        if (token !== spectrumToken.current) return
        setSpectrum(result)
      })
      .catch((error: unknown) => {
        if (token !== spectrumToken.current) return
        setSpectrumError(error instanceof Error ? error.message : 'Spectrum extraction failed.')
      })
      .finally(() => {
        if (token === spectrumToken.current) setLoadingSpectrum(false)
      })
  }

  const shareParams = new URLSearchParams()
  shareParams.set('ra', field.ra.toFixed(3))
  shareParams.set('dec', field.dec.toFixed(3))
  shareParams.set('fov', field.fov.toFixed(2))
  shareParams.set('detector', effectiveDetector?.detector ?? detector)
  if (currentVisit) shareParams.set('visit', currentVisit.id)
  if (catalogLayers.gaia) shareParams.set('layer', 'gaia')
  if (catalogLayers.wise) shareParams.set('layer', 'wise')
  const share = typeof window === 'undefined' ? '' : `${window.location.origin}${window.location.pathname}?${shareParams.toString()}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(share)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {}
  }

  const first = currentVisit?.iso ? currentVisit.iso.slice(0, 10) : '—'
  const last = currentVisit?.endIso ? currentVisit.endIso.slice(0, 10) : '—'
  const dataSource = find?.source.label ?? 'IRSA SIA2 · SPHEREx DR1'
  const release = currentVisit?.observations[0]?.release ?? 'DR1'
  const provenance = {
    uri: cutout?.uri ?? effectiveDetector?.uri ?? '',
    release,
    detector: effectiveDetector?.detector ?? '',
    iso: currentVisit?.iso ?? '',
    loading: loadingFind || loadingCutout,
    cached: cutout?.cached,
  }
  const summary = find?.summary ?? (visits.length ? summarizeVisits(visits) : null)
  const visitProducts = currentVisit ? new Set(currentVisit.observations.flatMap((observation) => observation.detectors.map((item) => item.uri))).size : 0
  const flaggedPixels = cutout?.flagCounts.reduce((total, count) => total + count, 0) ?? 0

  return (
    <div className="grid grid-cols-1 gap-2 p-2">
      <Card className="px-4 py-0">
        <Nav />
      </Card>

      <section id="sky" aria-labelledby="sky-title" className="scroll-mt-2">
        <Card className="p-5 sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="caps text-[10px] text-violet">IRSA SPHEREx DR1 · live FITS</p>
              <Title id="sky-title" lines={['Point at', 'the sky']} align="left" size="md" className="mt-2" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="outline">real cutouts</Badge>
              <Badge tone={loadingFind ? 'neutral' : findError ? 'outline' : 'violet'}>
                {loadingFind ? 'querying IRSA' : findError ? 'IRSA unavailable' : `${visits.length} real visits`}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                onClick={() => void copy()}
              >
                {copied ? 'Copied' : 'Copy link'}
              </Button>
            </div>
          </div>
          <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-pretty text-ink-2">
            A real detector frame is the map. Scroll to zoom into the native pixels, drag to move across the cutout, and click once to
            measure the spectrum under that pixel. Switch the science array, variance, flag bitmask and zodiacal model without leaving
            the FITS. The source label stays in the top right of the frame.
          </p>

          <form
            className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            onSubmit={(event) => {
              event.preventDefault()
              applyField(draft)
            }}
          >
            <Field label="Right ascension" hint="degrees, 0–360">
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  min={0}
                  max={360}
                  step={0.01}
                  value={draft.ra}
                  onChange={(event) => setDraft((current) => ({ ...current, ra: Number(event.target.value) || 0 }))}
                />
              )}
            </Field>
            <Field label="Declination" hint="degrees, −90 to +90">
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  min={-89.9}
                  max={89.9}
                  step={0.01}
                  value={draft.dec}
                  onChange={(event) => setDraft((current) => ({ ...current, dec: Number(event.target.value) || 0 }))}
                />
              )}
            </Field>
            <Field label="Field of view" hint="native IRSA cutout size">
              {(props) => (
                <Select
                  {...props}
                  value={draft.fov}
                  onChange={(event) => setDraft((current) => ({ ...current, fov: Number(event.target.value) }))}
                >
                  {FOVS.map((fov) => (
                    <option key={fov} value={fov}>
                      {fov.toFixed(2)}°
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <div className="flex items-end">
              <Button type="submit" variant="violet" size="md" icon={<RefreshCw className="size-4" />} className="w-full">
                Query IRSA
              </Button>
            </div>
          </form>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="caps mr-1 text-[9px] text-muted">Real coverage</span>
            {REAL_PRESETS.map((preset) => {
              const active = Math.abs(preset.ra - field.ra) < 0.002 && Math.abs(preset.dec - field.dec) < 0.002
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyField(preset)}
                  title={preset.note}
                  className={cx(
                    'round rounded-full border px-3 py-1.5 text-[11px] transition-colors',
                    active ? 'border-violet bg-violet text-white' : 'border-line-strong text-ink hov:border-ink',
                  )}
                >
                  {preset.label}
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => {
                setReload((value) => value + 1)
              }}
              className="round inline-flex items-center gap-1.5 rounded-full border border-line-strong px-3 py-1.5 text-[11px] text-ink transition-colors hov:border-ink"
            >
              <RefreshCw className="size-3" aria-hidden /> Refetch
            </button>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="mx-auto w-full min-w-0 max-w-[1000px]">
              <RealSky
                cutout={cutout}
                loading={loadingCutout}
                error={cutoutError}
                layer={layer}
                onLayer={setLayer}
                catalogs={catalogs}
                catalogLayers={catalogLayers}
                onToggleCatalog={toggleCatalog}
                probe={probe}
                onProbe={onProbe}
                onRetry={() => {
                  setReload((value) => value + 1)
                }}
                provenance={provenance}
              />

              <div className="mt-3 rounded-[var(--radius-card-sm)] border border-line bg-soft p-4">
                <div className="flex items-center gap-2.5">
                  <IconButton
                    aria-label="Previous real visit"
                    tone="outline"
                    size="sm"
                    disabled={!visits.length}
                    onClick={() => selectVisit(visitIndex - 1)}
                  >
                    <ArrowRight className="size-4 rotate-180" aria-hidden />
                  </IconButton>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, visits.length - 1)}
                    step={1}
                    value={visitIndex}
                    onChange={(event) => selectVisit(Number(event.target.value))}
                    className="range min-w-0 flex-1"
                    aria-label="Real SPHEREx visit"
                    disabled={!visits.length}
                  />
                  <span className="caps w-20 shrink-0 text-right text-[9px] tabular-nums text-muted">
                    {visits.length ? `${String(visitIndex + 1).padStart(2, '0')} / ${String(visits.length).padStart(2, '0')}` : '00 / 00'}
                  </span>
                  <IconButton
                    aria-label="Next real visit"
                    tone="outline"
                    size="sm"
                    disabled={!visits.length}
                    onClick={() => selectVisit(visitIndex + 1)}
                  >
                    <ArrowRight className="size-4" aria-hidden />
                  </IconButton>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="caps text-[9px] text-muted">
                    {currentVisit ? `${formatTime(currentVisit.iso)} · ${currentVisit.obsid}` : 'waiting for IRSA observations'}
                  </p>
                  <p className="caps text-[9px] text-muted">
                    {currentVisit
                      ? `${visitProducts} detector products · ${currentVisit.detectors.length} arrays · ${currentVisit.observations.length} exposures`
                      : 'no model frames'}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid content-start gap-3">
              <Card size="sm" className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="caps text-[9px] text-muted">Observation</p>
                  <span className="caps rounded-full bg-violet-soft px-2 py-0.5 text-[8px] text-violet-deep">{release}</span>
                </div>
                <div className="mt-2 grid gap-2">
                  <label className="caps block text-[8px] text-muted" htmlFor="real-visit">
                    Exposure group
                  </label>
                  <select
                    id="real-visit"
                    value={visitIndex}
                    onChange={(event) => selectVisit(Number(event.target.value))}
                    className="round h-9 w-full rounded-full border border-line-strong bg-card px-3 text-[12px]"
                    disabled={!visits.length}
                  >
                    {visits.map((visit, index) => (
                      <option key={visit.id} value={index}>
                        {visit.iso.slice(0, 10)} · {visit.obsid}
                      </option>
                    ))}
                  </select>
                  <label className="caps block text-[8px] text-muted" htmlFor="real-detector">
                    Detector array
                  </label>
                  <select
                    id="real-detector"
                    value={effectiveDetector?.detector ?? ''}
                    onChange={(event) => setDetector(event.target.value)}
                    className="round h-9 w-full rounded-full border border-line-strong bg-card px-3 text-[12px]"
                    disabled={!currentVisit?.detectors.length}
                  >
                    {(currentVisit?.detectors ?? []).map((item) => (
                      <option key={item.detector} value={item.detector}>
                        {detectorLabel(item.detector)} · {item.band}
                      </option>
                    ))}
                  </select>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line pt-3">
                  {[
                    ['Start', first],
                    ['End', last],
                    ['Product', effectiveDetector?.file.split('_').slice(-1)[0] ?? '—'],
                    ['Pixel scale', cutout?.scale ? `${cutout.scale.toFixed(2)}″` : '—'],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="caps text-[8px] text-muted">{label}</dt>
                      <dd className="mt-0.5 truncate text-[11px] tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
                {effectiveDetector && (
                  <a
                    href={effectiveDetector.uri}
                    target="_blank"
                    rel="noreferrer"
                    className="caps mt-3 inline-flex items-center gap-1.5 text-[9px] text-violet hov:underline"
                  >
                    Open exact FITS at IRSA <ExternalLink className="size-3" aria-hidden />
                  </a>
                )}
              </Card>

              <Card size="sm" className="p-4">
                <p className="caps flex items-center gap-1.5 text-[9px] text-muted">
                  <Layers3 className="size-3" aria-hidden /> Real planes
                </p>
                <div className="mt-2 grid gap-1">
                  {[
                    ['IMAGE', cutout?.stats ? 'science pixels' : 'not loaded', 'MJy sr⁻¹'],
                    ['VARIANCE', cutout?.variancePixels ? 'pipeline variance' : 'not loaded', 'real'],
                    ['FLAGS', cutout?.flagPixels ? 'bit mask' : 'not loaded', '32-bit'],
                    ['ZODI', cutout?.zodiPixels ? 'zodiacal model' : 'not loaded', 'real'],
                  ].map(([name, value, unit]) => (
                    <div key={name} className="flex items-center justify-between gap-2 border-t border-line py-1.5 first:border-t-0">
                      <span className="caps text-[9px] text-ink">{name}</span>
                      <span className="caps text-[8px] text-muted">
                        {value} · {unit}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="caps mt-3 text-[8px] leading-relaxed text-muted">No synthesized noise, ghost or stray-light layer is drawn.</p>
              </Card>

              <Card size="sm" className="p-4">
                <p className="caps text-[9px] text-muted">Field brief</p>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
                  {[
                    ['Visits', summary ? String(summary.visits) : '—'],
                    ['Products', summary ? String(summary.products) : '—'],
                    ['Detectors', summary ? summary.detectors.join(' ') : '—'],
                    ['Bands', summary ? summary.bands.join(' ') : '—'],
                    ['Span', summary ? `${summary.spanDays.toFixed(1)} d` : '—'],
                    ['Cutout set', summary ? formatBytes(summary.estimatedBytes) : '—'],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p className="caps text-[8px] text-muted">{label}</p>
                      <p className="mt-0.5 truncate text-[12px] tabular-nums">{value}</p>
                    </div>
                  ))}
                </div>
                <p className="caps mt-3 border-t border-line pt-2 text-[8px] leading-relaxed text-muted">
                  {summary?.firstIso
                    ? `${formatTime(summary.firstIso)} → ${formatTime(summary.lastIso)}`
                    : 'No SIA2 visits for this field yet.'}
                </p>
                <p className="caps mt-1 text-[8px] leading-relaxed text-muted">
                  {summary?.medianGapDays != null
                    ? `Median visit gap ${formatGap(summary.medianGapDays)} · estimated full-frame bytes only`
                    : 'Cadence appears when more than one visit is returned.'}
                </p>
              </Card>

              {cutout && (
                <Card size="sm" className="p-4">
                  <p className="caps text-[9px] text-muted">Frame diagnostics</p>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
                    {[
                      ['IMAGE median', cutout.stats ? cutout.stats.median.toExponential(2) : '—'],
                      ['IMAGE range', cutout.stats ? `${cutout.stats.min.toExponential(1)} / ${cutout.stats.max.toExponential(1)}` : '—'],
                      ['Wavelength', cutout.fits.wave ? `${cutout.fits.wave.minWavelength.toFixed(2)}–${cutout.fits.wave.maxWavelength.toFixed(2)} μm` : 'not in cutout'],
                      ['Flagged pixels', flaggedPixels ? String(flaggedPixels) : '0'],
                      ['Bitmask bits', String(cutout.flagCounts.filter((count) => count > 0).length)],
                      ['FITS blocks', String(cutout.fits.totalHdus)],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <p className="caps text-[8px] text-muted">{label}</p>
                        <p className="mt-0.5 truncate text-[11px] tabular-nums">{value}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              <SourceHealthPanel health={sourceHealth} error={sourceHealthError} />

              <Card size="sm" className="p-4">
                <p className="caps flex items-center gap-1.5 text-[9px] text-muted">
                  <Target className="size-3" aria-hidden /> Real catalog overlays
                </p>
                <div className="mt-2 grid gap-1">
                  {([
                    ['gaia', 'Gaia DR3', '#b9a2ff'],
                    ['wise', 'AllWISE', '#74e3ff'],
                  ] as const).map(([survey, label, color]) => (
                    <button
                      key={survey}
                      type="button"
                      onClick={() => toggleCatalog(survey)}
                      aria-pressed={catalogLayers[survey]}
                      className="flex min-h-9 items-center justify-between gap-2 rounded-[10px] px-1 text-[13px] transition-colors hover:bg-soft"
                    >
                      <span className="flex items-center gap-2">
                        <span aria-hidden className="size-2 rounded-full" style={{ background: color }} />
                        {label}
                      </span>
                      <span className={cx('caps text-[9px]', catalogLayers[survey] ? 'text-violet' : 'text-muted')}>
                        {catalogLayers[survey] ? `${catalogs[survey]?.count ?? 0} sources` : 'off'}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="caps mt-2 text-[8px] leading-relaxed text-muted">
                  {catalogErrors.gaia || catalogErrors.wise || 'Sourced live from Gaia Archive TAP and IRSA TAP. No synthetic markers.'}
                </p>
              </Card>

              <Card tone="violet" size="sm" className="p-4">
                <p className="caps text-[9px] text-white/70">Pixel provenance</p>
                <p className="mt-2 text-[15px] leading-tight text-white">
                  {fieldLabel(field.ra, field.dec)} · {field.fov.toFixed(2)}°
                </p>
                <p className="caps mt-2 text-[9px] leading-relaxed text-white/65">
                  {cutout ? `${cutout.image.width} × ${cutout.image.height} real pixels · ${cutout.observedAt || formatTime(currentVisit?.iso ?? '')}` : NONE}
                </p>
                <p className="caps mt-2 text-[8px] leading-relaxed text-white/45">
                  {dataSource} · {find?.source.query ?? 'POS circle'}
                </p>
              </Card>
            </div>
          </div>

          <p className="caps mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[9px] text-muted">
            <span>Field {fieldLabel(field.ra, field.dec)} · {field.fov.toFixed(2)}°</span>
            <a href={LINKS.explorer} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-violet hov:underline">
              IRSA SPHEREx explorer <ExternalLink className="size-3" aria-hidden />
            </a>
            <span>Source label always top right</span>
          </p>
        </Card>
      </section>

      <section id="bands" aria-labelledby="bands-title" className="scroll-mt-2">
        <Card tone="night" as="section" className="p-5 sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <p className="caps text-[10px] text-violet-light">Real extracted light</p>
              <Title id="bands-title" lines={['Read the', 'photons']} align="left" size="md" className="mt-2 text-white" />
              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-night-muted">
                The spectrum is read from the same IRSA detector cutouts as the image. A five-pixel aperture is averaged row by row and
                each row is assigned its WCS-WAVE wavelength. Pink samples carry a real FLAGS bit.
              </p>
            </div>
            <p className="display text-[clamp(3rem,2rem+6vw,7rem)] leading-none text-white/12" aria-hidden>
              λ
            </p>
          </div>

          <div className="mt-8 grid gap-8 border-t border-white/10 pt-6 lg:grid-cols-[1.12fr_1fr]">
            <RealSpectrumPanel
              spectrum={spectrum}
              loading={loadingSpectrum}
              error={spectrumError}
              coordinate={fieldLabel(target.ra, target.dec)}
              onLoad={extractSpectrum}
            />

            <div className="grid content-start gap-3">
              <div className="rounded-[var(--radius-card-sm)] border border-white/10 p-4">
                <p className="caps text-[9px] text-white/45">Current detector products</p>
                <ul className="mt-2 divide-y divide-white/8">
                  {(currentVisit?.detectors ?? []).map((item) => (
                    <li key={item.detector} className="flex items-center justify-between gap-3 py-2">
                      <span className="flex items-center gap-2 text-[13px] text-white">
                        <span aria-hidden className="size-1.5 rounded-full" style={{ background: ARRAYS.find((array) => `D${array.id}` === item.detector)?.tint ?? '#fff' }} />
                        {detectorLabel(item.detector)}
                      </span>
                      <span className="caps text-[9px] tabular-nums text-white/55">{item.band} · real cutout</span>
                    </li>
                  ))}
                  {!currentVisit?.detectors.length && <li className="py-2 text-[13px] text-white/45">No detector products for this visit.</li>}
                </ul>
              </div>
              <p className="caps text-[9px] leading-relaxed text-white/40">
                Six arrays, seventeen channels each. The real cutout points to the detector frame; the complete 102-band plan is
                instrument geometry, not a fabricated data cube. Gaps in the plot are real coverage gaps.
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {[
                  { label: 'Astropy', href: LINKS.astropy },
                  { label: 'Aladin', href: LINKS.aladin },
                  { label: 'IRSA', href: LINKS.irsa },
                ].map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="caps inline-flex items-center gap-1 text-[9px] text-white/55 transition-colors hov:text-white"
                  >
                    {link.label} <ExternalLink className="size-2.5" aria-hidden />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </section>

      <section id="data" aria-labelledby="data-title" className="grid scroll-mt-2 gap-2 lg:grid-cols-[1.15fr_1fr]">
        <Card as="section" className="p-5 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="caps text-[10px] text-violet">Real coverage</p>
              <Title id="data-title" lines={['Every pixel', 'has a source']} align="left" size="md" className="mt-2" />
            </div>
            <span className="caps text-[9px] text-muted">{dataSource}</span>
          </div>
          <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-ink-2">
            SIA2 returns the actual SPHEREx DR1 detector products covering this position. No release list is invented here; the count
            is whatever IRSA returned for the field.
          </p>

          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3">
            {[
              ['Detector arrays', currentVisit ? String(currentVisit.detectors.length) : '—'],
              ['Real visits', visits.length ? String(visits.length) : '—'],
              ['First exposure', first],
              ['Last exposure', last],
              ['Cutout size', cutout ? `${cutout.image.width} × ${cutout.image.height} px` : '—'],
              ['Source', release],
            ].map(([label, value]) => (
              <div key={label} className="border-t border-line pt-2">
                <dt className="caps text-[9px] text-muted">{label}</dt>
                <dd className="mt-0.5 truncate text-[14px] tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <a
              href={`${LINKS.irsa}SIA?COLLECTION=spherex_dr1&POS=circle+${field.ra}+${field.dec}+${(field.fov / 2).toFixed(3)}&RESPONSEFORMAT=CSV`}
              target="_blank"
              rel="noreferrer"
              className={cx('caps inline-flex items-center gap-1.5 text-[10px] text-violet hov:underline')}
            >
              Open this SIA2 query <ExternalLink className="size-3" aria-hidden />
            </a>
            <Link to="/guide#data" className="caps inline-flex items-center gap-1.5 text-[10px] text-ink hov:text-violet">
              How the real pipeline works <ArrowRight className="size-3" aria-hidden />
            </Link>
          </div>
        </Card>

        <Card as="section" className="p-5 sm:p-8">
          <p className="caps text-[10px] text-violet">What is real</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <h2 className="display text-[clamp(1.8rem,1.4rem+1.2vw,2.6rem)]">FITS only</h2>
            <span className="caps text-[9px] text-muted">no model cube</span>
          </div>
          <ul className="mt-5 grid gap-2">
            {[
              ['Imagery', 'IMAGE HDU from the IRSA cutout', ScanLine],
              ['Noise', 'VARIANCE HDU, not a synthesized field', Layers3],
              ['Contamination', 'FLAGS bitmask, bit counts shown raw', Database],
              ['Overlays', 'Gaia DR3 TAP + AllWISE cone search', Target],
            ].map(([label, value, Icon]) => (
              <li key={label as string} className="flex items-start gap-3 border-t border-line pt-2.5">
                <Icon className="mt-0.5 size-4 shrink-0 text-violet" aria-hidden />
                <div>
                  <p className="text-[13px] font-medium">{label as string}</p>
                  <p className="mt-0.5 text-[12px] leading-snug text-muted">{value as string}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="caps mt-4 text-[9px] leading-relaxed text-muted">
            The 3I/ATLAS FITS lab below is a separate real all-extension product. Nothing in this viewer is drawn from a random seed.
          </p>
        </Card>
      </section>

      <section id="fits" aria-labelledby="fits-title" className="scroll-mt-2">
        <Card tone="night" as="section" className="p-5 sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <p className="caps text-[10px] text-violet-light">Real photons · local ingest</p>
              <Title id="fits-title" lines={['Bring the', 'data home']} align="left" size="md" className="mt-2 text-white" />
              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-night-muted">
                Drop a real SPHEREx level-2 FITS file and every extension is parsed, stretched and mapped in your browser. Nothing is
                uploaded. The bundled sample is an all-extension cutout of an actual 3I/ATLAS frame.
              </p>
            </div>
            <div className="text-right">
              <p className="display text-[clamp(2.4rem,1.8rem+3vw,4.6rem)] leading-none text-white/12" aria-hidden>
                FITS
              </p>
              <p className="caps mt-1 text-[9px] text-white/40">local only · no account</p>
            </div>
          </div>
          <FitsLab />
        </Card>
      </section>

      <Card className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="min-w-0">
          <p className="caps text-[10px] text-violet">Send the real field</p>
          <Title lines={['Embed', 'this cutout']} align="left" size="md" className="mt-2" />
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
            The field, real visit, detector and catalogue layers are in the URL. The recipient queries IRSA for the same cutout; no
            model sky is bundled.
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <input
              readOnly
              value={share}
              onFocus={(event) => event.currentTarget.select()}
              aria-label="Shareable link"
              className="round h-12 min-w-0 flex-1 rounded-full border border-line-strong bg-soft px-4 text-[13px] text-ink-2"
            />
            <Button
              variant="violet"
              icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              onClick={() => void copy()}
            >
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link to="/guide#embed" className="caps inline-flex items-center gap-1.5 text-[10px] text-violet hov:underline">
              URL & iframe reference <ArrowRight className="size-3" aria-hidden />
            </Link>
            <a
              href={`https://aladin.cds.unistra.fr/AladinLite/?target=${field.ra.toFixed(2)}%20${field.dec.toFixed(2)}&fov=${(field.fov * 60).toFixed(2)}&survey=P%2FDSS2%2Fcolor`}
              target="_blank"
              rel="noreferrer"
              className="caps inline-flex items-center gap-1.5 text-[10px] text-ink hov:text-violet"
            >
              Cross-check in Aladin <ExternalLink className="size-3" aria-hidden />
            </a>
          </div>
        </div>
        <div className="mx-auto w-40 sm:w-52" aria-hidden>
          <Holo kind="prism" motion />
        </div>
      </Card>
    </div>
  )
}
