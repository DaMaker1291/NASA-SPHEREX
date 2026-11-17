export const MEASUREMENT_SCHEMA = 'spherex-explorer/measurement/v1'
export const APERTURE_METHOD = '5-pixel detector-row mean'
export const MEASUREMENT_ALGORITHM_VERSION = 'aperture-v1'

export type MeasurementProvenance = {
  schema: typeof MEASUREMENT_SCHEMA
  measurementId: string
  observationId: string
  uri: string
  detector: string
  band: string
  method: string
  algorithmVersion: string
  coordinateFrame: 'ICRS'
  skySource: 'requested' | 'wcs'
  sky: { ra: number; dec: number } | null
  pixel: { x: number; y: number; space: 'cutout' } | null
  aperture: {
    shape: '5-pixel row'
    width: 5
    samples: number
  } | null
  units: {
    flux: string
    wavelength: string
    variance: string
  }
  quality: {
    flags: 'FITS FLAGS bitmask'
    flaggedSamples: number
    totalSamples: number
  }
}

export type MeasurementProvenanceInput = {
  uri: string
  detector: string
  band: string
  observationId: string
  ra: number
  dec: number
  skySource?: 'requested' | 'wcs'
  pixelX: number
  pixelY: number
  apertureSamples: number
  fluxUnit: string
  varianceUnit: string
  flaggedSamples: number
  totalSamples: number
}

/**
 * A stable identifier for one extraction. It deliberately excludes wall-clock
 * time so two runs over the same observation and coordinates can be compared.
 */
export function measurementId(uri: string, detector: string, ra: number, dec: number, method = APERTURE_METHOD) {
  const product = uri.split('/').pop() || uri
  return `spherex:${detector || 'unknown'}:${ra.toFixed(6)}:${dec.toFixed(6)}:${method}:${product}`
}

export function createMeasurementProvenance(input: MeasurementProvenanceInput): MeasurementProvenance {
  return {
    schema: MEASUREMENT_SCHEMA,
    measurementId: measurementId(input.uri, input.detector, input.ra, input.dec),
    observationId: input.observationId,
    uri: input.uri,
    detector: input.detector,
    band: input.band,
    method: APERTURE_METHOD,
    algorithmVersion: MEASUREMENT_ALGORITHM_VERSION,
    coordinateFrame: 'ICRS',
    skySource: input.skySource ?? 'requested',
    sky:
      Number.isFinite(input.ra) && Number.isFinite(input.dec)
        ? { ra: input.ra, dec: input.dec }
        : null,
    pixel:
      Number.isFinite(input.pixelX) && Number.isFinite(input.pixelY)
        ? { x: input.pixelX, y: input.pixelY, space: 'cutout' }
        : null,
    aperture: {
      shape: '5-pixel row',
      width: 5,
      samples: input.apertureSamples,
    },
    units: {
      flux: input.fluxUnit,
      wavelength: 'micrometre',
      variance: input.varianceUnit,
    },
    quality: {
      flags: 'FITS FLAGS bitmask',
      flaggedSamples: input.flaggedSamples,
      totalSamples: input.totalSamples,
    },
  }
}

export function isMeasurementProvenance(value: unknown): value is MeasurementProvenance {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<MeasurementProvenance>
  if (candidate.schema !== MEASUREMENT_SCHEMA) return false
  if (!candidate.measurementId || !candidate.observationId || !candidate.uri) return false
  if (!candidate.detector || candidate.method !== APERTURE_METHOD) return false
  if (candidate.algorithmVersion !== MEASUREMENT_ALGORITHM_VERSION) return false
  if (candidate.coordinateFrame !== 'ICRS') return false
  if (candidate.skySource && !['requested', 'wcs'].includes(candidate.skySource)) return false
  if (candidate.sky && (!Number.isFinite(candidate.sky.ra) || !Number.isFinite(candidate.sky.dec))) return false
  if (candidate.pixel && (!Number.isFinite(candidate.pixel.x) || !Number.isFinite(candidate.pixel.y))) return false
  if (!candidate.aperture || candidate.aperture.width !== 5) return false
  if (!candidate.units || !candidate.units.flux || !candidate.units.variance) return false
  if (!candidate.quality) return false
  return (
    Number.isInteger(candidate.quality.flaggedSamples) &&
    Number.isInteger(candidate.quality.totalSamples) &&
    candidate.quality.totalSamples >= 0 &&
    candidate.quality.flaggedSamples >= 0
  )
}
