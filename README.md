# Drift — a real SPHEREx cutout lab

A browser viewer for real SPHEREx level-2 data. Pick a field, and the app asks
IRSA for the actual SPHEREx DR1 detector frames covering it, fetches a real FITS
cutout through a Worker proxy, and renders the IMAGE, VARIANCE, FLAGS and ZODI
arrays. Spectra are measured from those pixels with the WCS-WAVE table. Gaia DR3
and AllWISE overlays are live catalogue queries.

There is no deterministic sky model in the viewer and no simulated noise,
contamination or catalogue. The source of every displayed cutout is named in
the top-right badge of the frame.

## Run it

```sh
npm install        # or: bun install
npm run dev        # http://localhost:5305 (Vite + the Worker in workerd)
npm run build      # dist/client (assets) + dist/creative_agency/index.js (Worker)
npm run typecheck
```

## Deploy on Render

The repository includes `render.yaml` and a small Node entrypoint for Render.
The rendered site is the static `frontend/` app imported from the
`frontend-development` branch; the existing IRSA backend remains available at
`/api/*` from the same service.

1. Push this repository to GitHub.
2. In Render, choose **New → Blueprint** and select the repository.
3. Render reads `render.yaml`, runs `npm ci --include=dev && npm run build`, and
   starts `node server.mjs`.
4. The health check is `GET /api/health`.

To run the Render entrypoint locally after a build:

```sh
npm run build
PORT=3000 npm start
# http://localhost:3000
```

Render uses Node 22.22+, which is required by the current `react-router`
dependency.

## The real pipeline

1. `GET /api/spherex/find` queries IRSA SIA2 with
   `COLLECTION=spherex_dr1`, `POS=circle RA Dec radius`, `RESPONSEFORMAT=CSV`.
   Rows are grouped into real exposure groups, detector products and visits.
2. `GET /api/spherex/cutout` accepts only an allowlisted
   `https://irsa.ipac.caltech.edu/ibe/data/spherex/...fits` URL. It asks the IRSA
   cutout service for `center=RA,Dec&size=...&gzip=false`, strips the large EPSF
   table, and returns the remaining real FITS HDUs.
3. The browser parses the FITS with `src/lib/fits.ts`, keeps the original WCS,
   reads the sparse WCS-WAVE grid, and draws the selected physical plane.
4. `GET /api/spherex/spectrum` fetches real 24 × 2040 pixel detector strips for
   the selected visit, averages a five-pixel aperture row by row, and reads
   wavelength and bandwidth from WCS-WAVE. It returns the measured samples and
   real FLAGS values; nothing is interpolated across detector gaps.
5. `GET /api/catalog` queries Gaia DR3 through the ESA Gaia Archive TAP service
   and AllWISE through IRSA's Gator cone-search service. Positions are projected
   back onto the real detector WCS for the overlay.

The Worker source is `src/worker/index.ts`, `src/worker/irsa.ts` and
`src/worker/http.ts`. The client data layer is `src/lib/real.ts`; the viewer is
`src/components/RealSky.tsx` and `src/pages/Tool.tsx`.

`GET /api/spherex/brief` returns a compact field briefing computed from the same
SIA2 rows: visit count, detector products, bands, date span, cadence and an
estimated full-frame download size. `GET /api/spherex/summary` fetches one real
cutout and returns its server-side FITS summary: dimensions, IMAGE statistics,
VARIANCE and ZODI statistics, pixel scale, flag-bit counts, WCS-WAVE range and
key header values, plus the IAU constellation and sky coordinates. `GET
/api/spherex/frames` selects real time-separated visits for a field and returns
their SIA2 metadata, same-origin PNG URLs, and `sky`: IAU constellation, J2000
sexagesimal RA/Dec, galactic longitude/latitude and ecliptic longitude/latitude.
Those URLs are served by `GET /api/spherex/png`, which rasterizes the actual
IMAGE FITS pixels from the IRSA cutout. Its response headers expose the real
IMAGE min/max/low/high/median/mean, VARIANCE and ZODI medians, flagged-pixel
count, pixel scale, wavelength range and bandwidth, DATE-AVG, exposure when
present, detector, band, OBSID and BUNIT. The cutout's actual WCS-center
RA/Dec, IAU constellation name/symbol, galactic longitude/latitude and ecliptic
longitude/latitude are also sent as `X-Frame-Ra`, `X-Frame-Dec`,
`X-Frame-Constellation`, `X-Frame-Galactic-L/B` and `X-Frame-Ecliptic-Lon/Lat`.
Constellation names use
[`astronomy-engine`](https://github.com/cosinekitty/astronomy), not a hand-coded
lookup table. All of these routes use the same validation, cache and fallback
rules as the viewer routes. The Render frontend uses `/frames` and `/png`; it
does not generate demo pixels.

## Backend behaviour

- **Validation** — numeric sky fields are range-checked and enum parameters are
  allowlisted before an upstream request is made. Errors are JSON
  `{ error, code, requestId }` with `Cache-Control: no-store`.
- **SSRF boundary** — cutout and spectrum URLs must be HTTPS
  `irsa.ipac.caltech.edu/ibe/data/spherex/...fits` products. Userinfo, ports,
  fragments and path traversal are rejected.
- **Bounded upstream work** — transient `408`/`429`/5xx responses retry with
  exponential backoff and `Retry-After` support. SIA2 has a 50 s total budget;
  cutouts and TAP queries have 45 s budgets. Responses are size-limited.
- **Caching** — SIA2, catalogue and spectrum results use bounded TTL caches.
  Successful GETs are also stored in the `drift-api-v7` Cache API namespace and
  report `X-Cache: HIT` or `MISS`. Identical concurrent requests are coalesced.
  Inside the Worker, real cutout FITS buffers are kept in a bounded 96 MB,
  10-minute cache (`X-Cutout-Cache`), rendered PNGs in a bounded raster cache
  (`X-Raster-Cache`), and cutout summaries in a 64-entry cache
  (`X-Summary-Cache`). This avoids repeatedly downloading and reparsing the
  same IRSA product for the PNG, summary and spectrum paths.
- **Failure handling** — SIA2 and catalogue services enter a 30 s cooldown
  after a failed request, returning `503` with `Retry-After` instead of
  hammering a degraded archive. The default field falls back to the bundled
  real IRSA index with `X-Data-Fallback: bundled`; the badge labels it as
  cached.
- **Limits** — spectra accept at most six detector products, fetched three at a
time. A cutout response is capped at 40 MB and a spectrum strip is capped at
40 MB. `GET /api/health` is the lightweight liveness route.
- **Hard timeouts** — every upstream attempt is raced against a real timer, so a
  stalled archive connection cannot pin a Worker request open even if the
  platform fetch ignores an abort. SIA2 has a 12 s discovery budget before the
  bundled default index is used.
- **Pressure test** — `npm run stress` runs contract, validation, cache and
  concurrency checks against a running dev server. Set `BASE_URL` to target a
  different origin; `STRESS_ALLOW_UPSTREAM=1` treats 502-504 upstream failures as
  expected degradation.

### Cached real data

The default field (`RA 150°, Dec +19.5°`, `0.30°`) ships with a real SIA2 result
and a real D2 cutout so the first render does not wait on an IRSA queue:

- `public/data/spherex/dr1-150.json` — real SIA2 rows, cached 2026-11-14.
- `public/data/spherex/dr1-d2-150.fits` — real IRSA DR1 D2 cutout for the
  default field, 176 × 176 pixels, with EPSF removed.

When the bundled index is used, the badge reads **CACHED IRSA • REAL FITS**;
live SIA2 results read **LIVE IRSA • REAL FITS**. **Refetch** and any other field
use the live Worker routes. IRSA occasionally answers the cutout service with
`503 Server busy`; the proxy retries and the UI exposes a Retry button rather
than substituting a model.

## What is real

- **Imagery** — `IMAGE` HDU from the IRSA cutout, in native detector pixels.
- **Noise** — `VARIANCE` HDU from the same product.
- **Contamination** — `FLAGS` bitmask from the same product. The UI shows raw bit
  counts, not invented ghost/stray-light classes.
- **Zodiacal background** — `ZODI` HDU.
- **Spectra** — real pixel aperture means. Wavelength and bandwidth come from the
  FITS WCS-WAVE table. Some rows carry FLAGS; those samples are marked.
- **Overlays** — real Gaia DR3 and AllWISE catalogue positions, not scene stars.
- **Local FITS lab** — a dependency-free reader for real uncompressed SPHEREx
  products, including 2D images, 3D PSF planes, FLAGS and WCS-WAVE tables.

### Limits, stated plainly

A SPHEREx level-2 frame is a spectral–spatial detector image, not a clean
102-band sky cube. A small square cutout covers only a narrow wavelength slice;
the wide detector strip used for spectra covers the detector’s real spectral
range. The six-array, 102-channel band plan is instrument geometry, not a claim
that the viewer has a full 102-band image cube. Gaps in the spectrum are real
detector coverage gaps. No astrometric or photometric correction beyond the IRSA
level-2 pipeline is applied. IRSA availability is a hard dependency; cached
default data is the only offline pixel path.

## URL state

The viewer keeps the field, real visit, detector and catalogue layers in the
query string:

```
?ra=150.000&dec=19.500&fov=0.30&detector=D2&visit=2026W19_2A_0047&layer=gaia
```

`/guide#embed` documents the parameters and the real pipeline in the app.

## The 3I/ATLAS FITS lab

`public/data/3iatlas/3IATLAS-sample.fits` is a 9,244,800-byte all-extension
sample of IRSA product
`level2_2025W31_2A_0156_1D6_spx_l2b-v20-2025-264.fits` (detector 6,
2025-08-01T08:01:06 UTC, 113.5826 s). It contains IMAGE, FLAGS, VARIANCE and ZODI
crops, the full 101 × 101 × 121 PSF cube, and the 9 × 9 WCS-WAVE table. Its crop
origin is recorded in `CUTX0`/`CUTY0`.

`public/data/3iatlas/manifest.json` indexes all 259 products (18,553,268,160
bytes). The two download scripts are copied unmodified from IRSA. The FITS reader
caps files at 512 MB, does not upload anything and does not decode Rice-compressed
products. See `public/data/3iatlas/README.txt` for provenance.

## Design notes

The viewer is the landing surface, not a marketing page above a viewer. It
behaves like a map: scroll or use the +/- controls to zoom, drag to pan, click
to measure a pixel, and use the fit button to return to the whole cutout. The
zoom is a view transform on the native detector array; it does not resample or
invent pixels. The iridescent shell and typography are intentional, but the data
path stays FITS-first: no raster tiles, no synthesized sky, and the exact IRSA
product URL is linked from the frame.

This is not an official NASA, IPAC or SPHEREx mission product. Mission data and
catalogue services belong to their respective archives.

## Source map

```
src/worker/index.ts          Hono routes: find, cutout, spectrum, catalog
src/worker/sky.ts            IAU constellation + galactic/ecliptic coordinates
src/worker/http.ts           validation, retry, caches, URL allowlist, limits
src/worker/irsa.ts           SIA2, cutout proxy, FITS strip, catalogue services
src/lib/real.ts              client fetch/group/parse/projection helpers
src/components/RealSky.tsx   real FITS plane renderer + provenance badge
src/components/RealSpectrum.tsx  real aperture-spectrum chart
src/lib/fits.ts              dependency-free FITS reader and WCS-WAVE lookup
src/components/FitsLab.tsx   local all-extension FITS lab
src/pages/Tool.tsx           viewer page and real data state
```
