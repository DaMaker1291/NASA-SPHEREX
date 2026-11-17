import assert from 'node:assert/strict'
import test from 'node:test'

import {
  APERTURE_METHOD,
  MEASUREMENT_ALGORITHM_VERSION,
  MEASUREMENT_SCHEMA,
  createMeasurementProvenance,
  isMeasurementProvenance,
  measurementId,
} from '../src/lib/measurement.ts'

const input = {
  uri: 'https://irsa.ipac.caltech.edu/ibe/data/spherex/level2/example_1D2.fits',
  detector: 'D2',
  band: '2',
  observationId: 'example_1D2',
  ra: 269.452075,
  dec: 4.69339,
  pixelX: 88,
  pixelY: 88,
  apertureSamples: 102,
  fluxUnit: 'MJy/sr',
  varianceUnit: 'MJy/sr squared',
  flaggedSamples: 4,
  totalSamples: 102,
}

test('measurement provenance is versioned, deterministic and complete', () => {
  const first = createMeasurementProvenance(input)
  const second = createMeasurementProvenance(input)

  assert.equal(first.schema, MEASUREMENT_SCHEMA)
  assert.equal(first.method, APERTURE_METHOD)
  assert.equal(first.algorithmVersion, MEASUREMENT_ALGORITHM_VERSION)
  assert.equal(first.coordinateFrame, 'ICRS')
  assert.equal(first.skySource, 'requested')
  assert.deepEqual(first.sky, { ra: 269.452075, dec: 4.69339 })
  assert.deepEqual(first.pixel, { x: 88, y: 88, space: 'cutout' })
  assert.deepEqual(first.aperture, { shape: '5-pixel row', width: 5, samples: 102 })
  assert.deepEqual(first.quality, {
    flags: 'FITS FLAGS bitmask',
    flaggedSamples: 4,
    totalSamples: 102,
  })
  assert.equal(first.measurementId, second.measurementId)
  assert.equal(first.measurementId, measurementId(input.uri, input.detector, input.ra, input.dec))
  assert.ok(isMeasurementProvenance(first))
})

test('measurement provenance rejects incomplete or mismatched records', () => {
  const valid = createMeasurementProvenance(input)
  assert.equal(isMeasurementProvenance({ ...valid, schema: 'other' }), false)
  assert.equal(isMeasurementProvenance({ ...valid, algorithmVersion: 'other' }), false)
  assert.equal(isMeasurementProvenance({ ...valid, aperture: { ...valid.aperture, width: 3 } }), false)
  assert.equal(isMeasurementProvenance({ ...valid, quality: { ...valid.quality, flaggedSamples: Number.NaN } }), false)
  assert.equal(isMeasurementProvenance(null), false)
})

test('missing sky or pixel values are represented as null, not zero', () => {
  const missing = createMeasurementProvenance({
    ...input,
    ra: Number.NaN,
    dec: Number.NaN,
    pixelX: Number.NaN,
    pixelY: Number.NaN,
  })
  assert.equal(missing.sky, null)
  assert.equal(missing.pixel, null)
  assert.ok(isMeasurementProvenance(missing))
})
