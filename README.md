# Drift — a real SPHEREx cutout lab

A public-facing browser viewer for real SPHEREx level-2 data. Pick a named
moving target or enter any coordinates, and the app asks IRSA for the actual
SPHEREx DR1 detector frames covering it, fetches real FITS cutouts through a
Worker proxy, and plays them as a visit-by-visit sequence. Discovery tries
IRSA TAP against `spherex.artifact`/`spherex.plane` first for newly ingested
rows, with SIA2 covering DR1, deep and QR3 collections as the availability
fallback. A zero-row result is a real `NO COVERAGE` state, not a synthetic
frame. A filmstrip, blink control and a real difference view make it practical
to spot motion or brightness changes. Spectra are measured from those pixels
with the WCS-WAVE table. Gaia DR3 and AllWISE overlays are live catalogue queries.

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
The rendered site is the self-contained static `frontend/` viewer; the IRSA
backend is served from the same service at `/api/*`.

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
   `COLLECTION=spherex_dr1`, `POS=circle RA Dec 0.02`, and CSV (falling back to
the HTML table when CSV is unhealthy). The cone is deliberately narrow: it asks
which products cover the target, not for every product inside the display FOV.
This keeps real target searches fast and avoids partial edge cutouts. Rows are
grouped into real exposure groups, detector products and visits.
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
  exponential backoff and `Retry-After` support. SIA2 has a 28 s discovery
  budget (12 s CSV plus 16 s HTML fallback); cutouts and TAP queries have
  45 s budgets. Responses are size-limited.
- **Caching** — SIA2, catalogue and spectrum results use bounded TTL caches.
  Successful GETs are also stored in the `drift-api-v8` Cache API namespace and
  report `X-Cache: HIT` or `MISS`. Query parameters are canonicalised before
  use as cache keys, and the stored timestamp is checked against the response
  `Cache-Control` TTL so a Cache API entry cannot be served stale forever.
  Identical concurrent requests are coalesced. `/api/health` exposes per-isolate
  edge-cache hit/miss counters.
  Inside the Worker, real cutout FITS buffers are kept in a bounded 96 MB,
  10-minute cache (`X-Cutout-Cache`), rendered PNGs in a bounded raster cache
  (`X-Raster-Cache`), and cutout summaries in a 64-entry cache
  (`X-Summary-Cache`). This avoids repeatedly downloading and reparsing the
  same IRSA product for the PNG, summary and spectrum paths.
- **Failure handling** — a failed field enters a 30 s per-key cooldown, while
  infrastructure failures add a short 8 s service-wide circuit breaker. One bad
  field therefore cannot poison unrelated SIA2 or catalogue searches.
  Degraded requests return `503` with `Retry-After`; last-known-good SIA2 data
  is preferred when available. The default field falls back to the bundled real
  IRSA index with `X-Data-Fallback: bundled`; the badge labels it as cached.
- **Limits** — spectra accept at most six detector products, fetched three at a
time. A cutout response is capped at 40 MB and a spectrum strip is capped at
40 MB. `GET /api/health` is the lightweight liveness route and reports the API
version, isolate uptime and edge-cache counters.
- **Observability and headers** — every API response carries `X-Request-Id`,
  `X-API-Version` and a `Server-Timing: app;dur=…` measurement. Static assets
  carry `X-Content-Type-Options`, `Referrer-Policy` and
  `Cross-Origin-Resource-Policy`.
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
than substituting a model. If the cutout service is unavailable, the Worker can
read the same product from the public SPHEREx S3 bucket using HTTP byte ranges;
it fetches the header blocks and only the IMAGE/VARIANCE/FLAGS/ZODI/WCS-WAVE
HDUs needed for the crop, rather than downloading the full 65 MB product. See
`docs/live-data.md`.

### Verified local mirror

`public/mirror/` contains a checked, local mirror of the default field in all
six detector bands, with twelve real visits per band. Each mirrored frame has a
PNG preview, a real FITS cutout, the original IRSA URI, and SHA-256 checksums;
`npm run mirror:verify` validates all 144 files and signatures. The
browser verifies every mirrored PNG before display and labels it
**LOCAL MIRROR · REAL FITS**. A matching verified field is shown immediately
while the live IRSA request refreshes in the background; if that request fails,
the mirror remains visible. This keeps the default field available when IRSA
discovery is unavailable. The ingestor talks directly to IRSA TAP/SIA2 and the
IRSA/S3 cutout sources, so it does not need the app API; a fresh run mirrors up
to 24 visits per detector by default and can mirror every available visit with
`--limit 0`. The mirror contains real archive products only; it does not invent
missing fields. If a map click has no local coverage and IRSA is unavailable,
the viewer moves to the nearest verified field and labels it as a fallback; it
never displays that field's pixels under the clicked coordinates. See
`docs/mirror.md` for the ingestion CLI and the limits of a selected-field mirror.

### Local all-sky mosaic fallback

`frontend/assets/spherex-allsky-2025.jpg` is the checked-in, real
**NASA/JPL-Caltech SPHEREx All Sky Map 2025** (1600 × 800, Galactic
equirectangular). When a map position has no matching local visit mirror and
IRSA does not answer, the browser reprojects a **30° context window** around the
requested coordinates from that local image and labels it
**LOCAL MOSAIC · REAL NASA IMAGE**. The selected 0.3° field remains the
navigation/query position; the 30° image is explicitly a context view, not a
per-visit FITS cutout and not a claim that the mosaic has 0.3° resolution.
Nothing is fetched for this fallback and no synthetic pixels are added.

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
level-2 pipeline is applied. IRSA availability is a hard dependency for new
discovery; the verified default-field mirror remains available when it is down.
Other fields still require the live archive to be discovered; no synthetic
pixel path exists for them.

## URL state

The viewer keeps the field, real visit, detector and catalogue layers in the
query string:

```
?target=barnard&ra=269.45207&dec=4.69339&fov=0.30
```

`target` is one of the named presets (`barnard`, `epsindi`, `wise0855`,
`rwaur`, `rdra`, `spherex`) or `custom`. The viewer writes the current target
and coordinates back to the URL, so **Copy link** opens the same sky patch.

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

## Public viewer

The landing page is the viewer: it auto-loads a real field, keeps the image
large, and places coordinates and provenance next to it. Named presets cover
Barnard's Star, Epsilon Indi B, WISE 0855−0714, RW Aurigae and R Draconis.
The RA/Dec parser accepts decimal degrees or sexagesimal values. Real visits
load progressively; partial detector-edge frames are removed so the sequence
does not jump in shape. **Blink A/B** toggles two visits; **Difference**
subtracts their PNG rasters in the browser. The workspace below the viewer has
separate Wavelength, Constellations, Data verification, Learning lab, Sky games
and Mail sections. Wavelength uses the six real detector bands and server-side
palette/stretch filters; the wide button requests a larger native-scale cutout;
constellation membership and neighbourhoods come from IAU geometry; and the
verification panel cross-checks SIA2 metadata, FITS headers, IAU geometry,
Gaia DR3 catalogue context and a SHA-256 payload receipt.

Regression checks used during development loaded all five named targets from
the local Worker, measured their first real cutout, and exercised playback,
blink, difference and mobile layout:

```
GET /api/spherex/frames?ra=269.452075&dec=4.69339&fov=0.3&limit=8
GET /api/spherex/frames?ra=331.04417&dec=-56.78283&fov=0.3&limit=8
GET /api/spherex/frames?ra=133.795129&dec=-7.245147&fov=0.3&limit=8
GET /api/spherex/frames?ra=76.95625&dec=30.40111&fov=0.3&limit=8
GET /api/spherex/frames?ra=248.1675&dec=66.755&fov=0.3&limit=8
```

## Change finder and real light curve

The **Change finder** workspace turns the viewer into a discovery tool rather
than only a picture browser:

- It compares two real visits pixel by pixel after a small smoothing pass.
- It ranks residuals with a robust median/MAD threshold and non-maximum
  suppression, so one changing star does not fill the list with 30 neighbours.
- Each candidate is converted back to J2000 RA/Dec through the real cutout WCS,
  not through a guessed screen grid.
- Every candidate is cross-matched against Gaia DR3 within 1.2′. A Gaia source
  is context, not confirmation; edge-coverage candidates are explicitly marked
  as possible pointing artifacts.
- The **real light curve** plots the FITS median from every measured visit and
  lets you click any point to jump to that visit.

The scan reports what it actually did and never labels a lead a confirmed
transient. R Draconis is a useful sanity check: its genuine long-period
variability appears in the visit medians, while the candidate list still needs
human review.

## Time and filter dock

A compact **Time & filters** strip sits directly under the sky stage, so the
two most-used controls do not require a trip into the workspace:

- **Time** — previous / play / next, a visit slider, and a named visit selector
  showing the real observation date and detector.
- **Filters** — detector band D1–D6, palette and intensity stretch. These drive
  the same `/api/spherex/frames` and palette/stretch state used elsewhere.
- **More filters ↓** opens the full Wavelength & filters workspace.

The dock mirrors the transport, band rail and lab selectors in both directions;
there is one viewer state, not two competing ones. It is responsive at phone
width and uses native range/select controls for keyboard and assistive access.

## Map app

Opening a target link, any preset, **Map app**, or **Full screen** puts the real
viewer into a full-viewport map application. The sky canvas runs behind floating
chrome instead of sitting in a page column:

- Search, live-IRSA status, history and zoom stay over the map.
- The time/filter dock stays at the bottom, with the coordinates/scale strip above it.
- **Details** opens the measured FITS observation drawer.
- **Sequence** opens playback, speed, blink, difference, the visit filmstrip and
  side-by-side comparison.
- **Tools** opens the full observation workspace in a drawer, including bands,
  constellations, verification, lessons, games, change finder and mail.
- **Link** copies the current field state; **Exit** restores the normal page.

The app uses `?app=1` in the URL. Exiting writes `app=0`, so reloading a normal
target link does not force the app back open. All labels, fields and values are
serialised from the same real frame/workspace state used outside the app; there
is no second viewer or mock data path.

## Map-like sky navigation

The viewer behaves like a map over real SPHEREx cutouts:

- **Scroll** zooms toward the cursor, with 12× headroom and a **1:1** native-pixel shortcut.
- **Drag** pans when zoomed in. At fit scale, dragging the field left/right/up/down
  moves to the adjacent sky and loads a new real IRSA field.
- **Double-click** reads the published WCS corners of the displayed cutout and
  recentres on that exact sky position.
- **Pinch** on touch devices preserves the midpoint under your fingers.
- **All-sky map** in the corner shows the real positions of the five targets and
  the current field. Click or drag it to travel anywhere in J2000 coordinates.
- **Search** accepts named targets or coordinates such as `248.17, 66.75` and
  `16h 32m 20s, +66 45`.
- **Back / forward** restores previous sky positions.
- The compass is derived from the cutout WCS orientation, the scale bar from the
  current field width and zoom, and the coordinates under the pointer from the
  four WCS corners exposed by the raster endpoint.

The WCS corners come from real `RA---TAN` FITS geometry (`skyAt` in
`src/lib/fits.ts`) and are returned as `X-Frame-WCS-Corners` in display order:
top-left, top-right, bottom-left, bottom-right. No synthetic star field is
drawn behind the observations.

## Wavelength workspace

The viewer exposes all six real SPHEREx detector bands. The band chips and the
query-panel selector set the `detector` parameter (`D1`–`D6`); the backend
rebuilds the visit sequence from the matching SIA2 products. The ranges shown
for each band were measured from real DR1 WCS-WAVE headers for the calibrated
field and are confirmed again per frame after load:

```
D1 0.735–1.126 μm
D2 1.086–1.668 μm
D3 1.616–2.439 μm
D4 2.398–3.863 μm
D5 3.798–4.443 μm
D6 4.402–5.025 μm
```

Palette (`iridescent`, `gold`, `ice`, `mono`) and intensity stretch (`asinh`,
`linear`, `log`) are real server-side raster controls (`/api/spherex/png`).
They change presentation only; the underlying FITS pixels are unchanged.

### Native-scale wide window

The normal 0.30° view is about 176 px because SPHEREx sampling is about
6.15″/pixel. The wide button requests a 0.90° cutout at that same native
sampling, which returns roughly 490 × 354 px for R Draconis. This is a wider
field, not synthetic upscaling. Near a detector edge IRSA can clip the
window and shift its measured centre; the verification panel reports that
shift rather than hiding it. Pixel detail remains archive-limited. The viewer
also supports 12× zoom, pan, 1:1 native-pixel view, optional sharpening and
browser full screen.

## Constellations and verification

`GET /api/sky/context?ra=…&dec=…&radius=5` returns the IAU constellation at the
centre plus neighbouring constellations sampled at eight compass bearings with
`astronomy-engine`. The Constellations workspace shows the centre, Galactic and
Ecliptic coordinates, and the neighbours with their direction.

The Data verification workspace compares independent evidence for the frame on
screen:

1. IRSA SIA2 discovery row: date, detector, observation ID, product URI.
2. IRSA FITS cutout headers: DATE-AVG, DETECTOR, OBSID, WCS centre, WCS-WAVE.
3. IAU constellation membership computed independently from J2000 geometry.
4. Gaia DR3 catalogue context queried at the cutout centre.
5. SHA-256 receipt of the actual PNG payload.

Green checks mean the two sources agree; amber checks state a real mismatch or
unavailable value. The Gaia and SHA-256 rows are receipts, not agreement checks,
and are not counted in the score. **Download full JSON receipt** exports the
frame identity, requested and measured centres, WCS corners, pixel scale,
measurements, all check details, the Gaia query result and the SHA-256 in one
portable file.

## Source map

```
frontend/index.html         Public Render viewer, workspace, learning/game panels
frontend/script.js          Real-frame viewer, bands, wide window, verification receipt
frontend/style.css          Responsive public viewer and workspace
src/worker/index.ts          Hono routes: find, cutout, png, spectrum, sky context, catalog
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
