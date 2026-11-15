import assert from 'node:assert/strict'
import test from 'node:test'

import {
  angularSeparation,
  luma,
  normalizeRa,
  robustChangeThreshold,
  unwrapRa,
} from '../frontend/math.js'
import { imageStats, stretchValue, waveAt } from '../src/lib/fits.ts'

const close = (actual, expected, epsilon = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} was not within ${epsilon} of ${expected}`)
}

test('great-circle separation is zero, symmetric, and correct at the poles', () => {
  close(angularSeparation(0, 0, 0, 0), 0)
  close(angularSeparation(0, 0, 90, 0), 90)
  close(angularSeparation(0, 0, 0, 90), 90)
  close(angularSeparation(0, 0, 180, 0), 180)
  close(angularSeparation(10, 20, 10, 20), 0)
  close(angularSeparation(10, 20, 30, -20), angularSeparation(30, -20, 10, 20))
  assert.equal(angularSeparation(Number.NaN, 0, 0, 0), null)
})

test('right-ascension wrapping keeps the viewer on the same sky', () => {
  assert.equal(normalizeRa(370), 10)
  assert.equal(normalizeRa(-10), 350)
  assert.equal(normalizeRa(720), 0)
  assert.equal(unwrapRa(350, 10), -10)
  assert.equal(unwrapRa(10, 350), 370)
  assert.equal(unwrapRa(180, 0), 180)
})

test('luma weights match the change finder channel formula', () => {
  close(luma(255, 0, 0), 76.245, 1e-12)
  close(luma(0, 255, 0), 149.685, 1e-12)
  close(luma(0, 0, 255), 29.07, 1e-12)
  close(luma(100, 100, 100), 100, 1e-12)
})

test('change-finder threshold uses absolute-residual median and MAD', () => {
  assert.deepEqual(robustChangeThreshold([]), { median: 0, mad: 0, threshold: 7 })
  assert.deepEqual(robustChangeThreshold([0, 0, 0, 0, 0, 0]), { median: 0, mad: 0, threshold: 7 })
  assert.deepEqual(robustChangeThreshold([0, 0, 0, 10, 10, 10]), {
    median: 10,
    mad: 10,
    threshold: 70,
  })
  assert.deepEqual(robustChangeThreshold([1, 2, 3, 4]), { median: 3, mad: 1, threshold: 9 })
  assert.deepEqual(robustChangeThreshold(new Float32Array([1, 2, 3, 4])), {
    median: 3,
    mad: 1,
    threshold: 9,
  })
})

test('image statistics use the documented 1%, 99.5% and median samples', () => {
  const stats = imageStats(Float32Array.from({ length: 101 }, (_, index) => index))
  assert.ok(stats)
  assert.equal(stats.min, 0)
  assert.equal(stats.max, 100)
  assert.equal(stats.low, 1)
  assert.equal(stats.high, 100)
  assert.equal(stats.median, 50)
  close(stats.mean, 50)
  assert.equal(imageStats(new Float32Array()), null)
  assert.equal(imageStats(new Float32Array([Number.NaN, Number.NaN])), null)
})

test('linear, asinh and log stretches share endpoints and clamp off-scale values', () => {
  const stats = { min: 0, max: 10, low: 0, high: 10, median: 5, mean: 5 }
  assert.equal(stretchValue(0, stats, 'linear'), 0)
  assert.equal(stretchValue(5, stats, 'linear'), 0.5)
  assert.equal(stretchValue(10, stats, 'linear'), 1)
  assert.equal(stretchValue(-100, stats, 'linear'), 0)
  assert.equal(stretchValue(100, stats, 'linear'), 1)
  close(stretchValue(5, stats, 'asinh'), Math.asinh(6) / Math.asinh(12))
  close(stretchValue(5, stats, 'log'), Math.log1p(49.5) / Math.log(100))
  assert.equal(stretchValue(0, stats, 'asinh'), 0)
  assert.equal(stretchValue(10, stats, 'asinh'), 1)
  assert.equal(stretchValue(0, stats, 'log'), 0)
  assert.equal(stretchValue(10, stats, 'log'), 1)
})

test('WCS wavelength interpolation is bilinear and clamps at the table edge', () => {
  const wave = {
    xs: [1, 2, 3],
    ys: [10, 20],
    wavelengths: [1, 2, 3, 4, 5, 6],
    bandwidths: [10, 20, 30, 40, 50, 60],
  }

  assert.deepEqual(waveAt(wave, 1, 10), { wavelength: 1, bandwidth: 10 })
  assert.deepEqual(waveAt(wave, 3, 20), { wavelength: 6, bandwidth: 60 })
  assert.deepEqual(waveAt(wave, 2, 15), { wavelength: 3.5, bandwidth: 35 })
  assert.deepEqual(waveAt(wave, 2.5, 15), { wavelength: 4, bandwidth: 40 })
  assert.deepEqual(waveAt(wave, 0, 0), { wavelength: 1, bandwidth: 10 })
  assert.deepEqual(waveAt(wave, 99, 99), { wavelength: 6, bandwidth: 60 })
})
