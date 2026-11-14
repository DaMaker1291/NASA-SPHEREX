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
   and AllWISE through IRSA TAP. Positions are projected back onto the real
   detector WCS for the overlay.

The Worker source is `src/worker/index.ts` and `src/worker/irsa.ts`. The client
data layer is `src/lib/real.ts`; the viewer is `src/components/RealSky.tsx` and
`src/pages/Tool.tsx`.

### Cached real data

The default field (`RA 150°, Dec +19.5°`, `0.30°`) ships with a real SIA2 result
and a real D2 cutout so the first render does not wait on an IRSA queue:

- `public/data/spherex/dr1-150.json` — real SIA2 rows, cached 2026-11-14.
- `public/data/spherex/dr1-d2-150.fits` — real IRSA DR1 D2 cutout for the
  default field, 176 × 176 pixels, with EPSF removed.

The badge marks this as a cached IRSA cutout. **Refetch** and any other field use
the live Worker routes. IRSA occasionally answers the cutout service with
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

The iridescent shell, typography and card layout are intentional. The data path
is deliberately FITS-first: no raster tiles, no synthesized sky, and the exact
IRSA product URL is linked from the viewer.

This is not an official NASA, IPAC or SPHEREx mission product. Mission data and
catalogue services belong to their respective archives.

## Source map

```
src/worker/index.ts          Hono routes: find, cutout, spectrum, catalog
src/worker/irsa.ts           SIA2, cutout proxy, FITS strip, TAP catalogues
src/lib/real.ts              client fetch/group/parse/projection helpers
src/components/RealSky.tsx   real FITS plane renderer + provenance badge
src/components/RealSpectrum.tsx  real aperture-spectrum chart
src/lib/fits.ts              dependency-free FITS reader and WCS-WAVE lookup
src/components/FitsLab.tsx   local all-extension FITS lab
src/pages/Tool.tsx           viewer page and real data state
```
