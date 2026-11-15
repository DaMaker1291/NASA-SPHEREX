import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'

const root = new URL('../public/mirror/', import.meta.url)
const digest = (buffer) => createHash('sha256').update(buffer).digest('hex')

test('the mirrored field is made only of validated real SPHEREx files', async () => {
  const manifest = JSON.parse(await readFile(new URL('index.json', root), 'utf8'))
  assert.equal(manifest.schemaVersion, 2)
  assert.ok(Array.isArray(manifest.fields) && manifest.fields.length > 0)
  assert.match(manifest.note, /No synthetic frames/i)

  for (const field of manifest.fields) {
    assert.ok(field.ra >= 0 && field.ra <= 360)
    assert.ok(field.dec >= -90 && field.dec <= 90)
    assert.ok(field.detector)
    assert.ok(field.frames.length > 0)

    for (const frame of field.frames) {
      assert.match(frame.uri, /^https:\/\/irsa\.ipac\.caltech\.edu\//)
      assert.ok(frame.obsid)
      assert.ok(frame.png && frame.pngSha256)
      assert.ok(frame.fits && frame.fitsSha256)
      assert.equal(frame.measurement?.measured, true)
      assert.ok(Number.isFinite(frame.measurement.median))
      assert.ok(Number.isFinite(frame.measurement.waveMin))
      assert.ok(Number.isFinite(frame.measurement.waveMax))

      const png = await readFile(join(root.pathname, frame.png))
      assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      assert.equal(digest(png), frame.pngSha256)
      assert.equal(png.length, frame.pngBytes)

      const fits = await readFile(join(root.pathname, frame.fits))
      assert.equal(fits.subarray(0, 6).toString('ascii'), 'SIMPLE')
      assert.equal(digest(fits), frame.fitsSha256)
      assert.equal(fits.length, frame.fitsBytes)
    }
  }
})
