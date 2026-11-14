import { Hono } from 'hono'

import { findSpherex, getCatalog, getCutout, getSpectrum } from './irsa'

type Env = {
  ASSETS: Fetcher
}

const app = new Hono<{ Bindings: Env }>()

const number = (value: string | undefined, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

app.get('/api/health', (c) => c.json({ ok: true, tool: 'drift', source: 'IRSA' }))

app.get('/api/spherex/find', async (c) => {
  const ra = number(c.req.query('ra'), 150)
  const dec = number(c.req.query('dec'), 19.5)
  const fov = number(c.req.query('fov'), 0.3)
  try {
    const data = await findSpherex(ra, dec, fov)
    c.header('Cache-Control', 'public, max-age=300')
    return c.json(data)
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'IRSA search failed.' }, 502)
  }
})

app.get('/api/spherex/cutout', async (c) => {
  const uri = c.req.query('uri')
  const ra = number(c.req.query('ra'), Number.NaN)
  const dec = number(c.req.query('dec'), Number.NaN)
  const fov = number(c.req.query('fov'), 0.3)
  if (!uri || !Number.isFinite(ra) || !Number.isFinite(dec)) {
    return c.json({ error: 'uri, ra and dec are required.' }, 400)
  }
  try {
    const data = await getCutout(uri, ra, dec, fov)
    c.header('Content-Type', 'application/fits')
    c.header('Cache-Control', 'public, max-age=86400')
    c.header('X-Data-Source', 'IRSA SPHEREx cutout')
    c.header('X-Data-Url', uri)
    return c.body(data.buffer)
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'IRSA cutout failed.' }, 502)
  }
})

app.get('/api/spherex/spectrum', async (c) => {
  const ra = number(c.req.query('ra'), Number.NaN)
  const dec = number(c.req.query('dec'), Number.NaN)
  const uris = c.req.queries('uri') ?? []
  if (!Number.isFinite(ra) || !Number.isFinite(dec) || !uris.length) {
    return c.json({ error: 'ra, dec and at least one uri are required.' }, 400)
  }
  if (uris.length > 6) return c.json({ error: 'A maximum of six detectors can be extracted.' }, 400)

  const segments = []
  const errors: string[] = []
  for (const uri of uris) {
    try {
      segments.push(await getSpectrum(uri, ra, dec))
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Detector extraction failed.')
    }
  }
  if (!segments.length) {
    return c.json({ error: errors[0] ?? 'No real spectra were returned.', errors }, 502)
  }
  return c.json({
    source: {
      label: 'IRSA SPHEREx level-2 cutouts · real pixel aperture',
      url: 'https://irsa.ipac.caltech.edu/',
      method: '24,2040 pixel strip · 5-pixel aperture · WCS-WAVE',
    },
    ra,
    dec,
    segments,
    errors,
  })
})

app.get('/api/catalog', async (c) => {
  const survey = c.req.query('survey') === 'wise' ? 'wise' : 'gaia'
  const ra = number(c.req.query('ra'), 150)
  const dec = number(c.req.query('dec'), 19.5)
  const radius = number(c.req.query('radius'), 0.2)
  try {
    const data = await getCatalog(survey, ra, dec, radius)
    c.header('Cache-Control', 'public, max-age=1800')
    return c.json(data)
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Catalogue query failed.' }, 502)
  }
})

app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404))

app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))

export default app
