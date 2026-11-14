import { BANDS, FALLBACK_RELEASES, allBandIds, bandsForArray, type Level, type Release } from './spherex'

export type Mode = 'single' | 'difference' | 'blink' | 'coadd'
export type Layers = { gaia: boolean; wise: boolean; grid: boolean }

export type Config = {
  ra: number
  dec: number
  fov: number
  bands: number[]
  epoch: number
  epochB: number
  mode: Mode
  layers: Layers
  release: string
  level: Level
}

export const DEFAULT_CONFIG: Config = {
  ra: 150,
  dec: 19.5,
  fov: 0.6,
  bands: bandsForArray(2).map((band) => band.id),
  epoch: 0,
  epochB: 4,
  mode: 'single',
  layers: { gaia: false, wise: false, grid: true },
  release: 'qr3',
  level: 1,
}

const MODES: Mode[] = ['single', 'difference', 'blink', 'coadd']
const BAND_IDS = new Set(allBandIds())
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

const num = (value: string | null, fallback: number) => {
  if (value === null || value.trim() === '') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const int = (value: string | null, fallback: number) => Math.round(num(value, fallback))

function readBands(value: string | null): number[] {
  if (!value) return DEFAULT_CONFIG.bands
  if (value === 'all') return allBandIds()
  const ids = value
    .split(',')
    .map((part) => Number.parseInt(part, 10))
    .filter((id) => BAND_IDS.has(id))
  return ids.length ? [...new Set(ids)].sort((a, b) => a - b) : DEFAULT_CONFIG.bands
}

export function readConfig(releases: Release[] = FALLBACK_RELEASES): Config {
  if (typeof window === 'undefined') return DEFAULT_CONFIG

  const params = new URLSearchParams(window.location.search)
  const releaseIds = releases.map((release) => release.id)
  const release = params.get('release')
  const mode = params.get('mode') as Mode | null
  const layers = (params.get('layers') ?? 'grid').split(',')

  return {
    ra: ((num(params.get('ra'), DEFAULT_CONFIG.ra) % 360) + 360) % 360,
    dec: clamp(num(params.get('dec'), DEFAULT_CONFIG.dec), -89.9, 89.9),
    fov: clamp(num(params.get('fov'), DEFAULT_CONFIG.fov), 0.2, 3.5),
    bands: readBands(params.get('band')),
    epoch: Math.max(0, int(params.get('epoch'), DEFAULT_CONFIG.epoch)),
    epochB: Math.max(0, int(params.get('compare'), DEFAULT_CONFIG.epochB)),
    mode: mode && MODES.includes(mode) ? mode : DEFAULT_CONFIG.mode,
    layers: {
      gaia: layers.includes('gaia'),
      wise: layers.includes('wise'),
      grid: layers.includes('grid'),
    },
    release:
      release && releaseIds.includes(release)
        ? release
        : releaseIds.includes(DEFAULT_CONFIG.release)
          ? DEFAULT_CONFIG.release
          : releaseIds[0],
    level: clamp(int(params.get('level'), 1), 1, 3) as Level,
  }
}

function paramsFor(config: Config): URLSearchParams {
  const params = new URLSearchParams()
  params.set('ra', config.ra.toFixed(3))
  params.set('dec', config.dec.toFixed(3))
  params.set('fov', config.fov.toFixed(2))
  params.set('band', config.bands.length === BANDS.length ? 'all' : config.bands.join(','))
  params.set('epoch', String(config.epoch))
  params.set('compare', String(config.epochB))
  params.set('mode', config.mode)
  params.set('layers', (['gaia', 'wise', 'grid'] as const).filter((layer) => config.layers[layer]).join(','))
  params.set('release', config.release)
  params.set('level', String(config.level))
  return params
}

export function writeConfig(config: Config): void {
  if (typeof window === 'undefined') return
  const next = `${window.location.pathname}?${paramsFor(config)}${window.location.hash}`
  if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== next) {
    window.history.replaceState(null, '', next)
  }
}

export function shareUrl(config: Config): string {
  if (typeof window === 'undefined') return ''
  return `${window.location.origin}${window.location.pathname}?${paramsFor(config)}`
}

export function embedCode(config: Config): string {
  return `<iframe src="${shareUrl(config)}" width="960" height="760" style="border:0;border-radius:24px" loading="lazy" title="Drift — SPHEREx sky viewer"></iframe>`
}
