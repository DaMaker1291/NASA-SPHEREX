# Live SPHEREx data path

The viewer does not need a pre-bundled list of covered fields. For each field it
asks the Worker, which discovers real products on demand and streams only the
requested cutout.

## Discovery

- **IRSA TAP** (`/TAP/sync`) is queried against `spherex.artifact` joined to
  `spherex.plane` with a real `CONTAINS(POINT(...), p.poly)` coverage test. TAP
  includes newly ingested products before the SIA2 index catches up.
- **IRSA SIA2** (`/SIA`) is queried in parallel over DR1, DR1 deep, QR3, QR3
  deep and the DR1 cube collection. It is the availability fallback and also
  the source of SIA-specific metadata.
- TAP rows are preferred when they contain products; otherwise SIA2 rows are
  used. A successful query with zero rows is **not** an upstream error.

## Zero coverage

A valid zero-row TAP/SIA2 result returns HTTP 200 with:

```json
{
  "frames": [],
  "coverage": {
    "observed": false,
    "message": "Region not yet observed in the current SPHEREx DR1/QR3 releases."
  }
}
```

The viewer shows `NO COVERAGE` with that message. It does not call the mirror,
does not show an IRSA outage, and does not invent a frame. If the browser has
already shown the real local all-sky mosaic for this position, that clearly
labelled 30° context image remains visible instead of being replaced by an
empty viewer.

## Cutouts and fallback

The primary pixel path is the IRSA cutout service (`?center=…&size=…`), which
crops before transfer. If that service is unavailable, the Worker reads the
same real FITS product from the public
`nasa-irsa-spherex.s3.us-east-1.amazonaws.com` bucket using HTTP `Range`
requests:

1. `HEAD` establishes the object size.
2. FITS header blocks are read with small ranges to map HDU offsets.
3. Only `IMAGE`, `VARIANCE`, `FLAGS`, `ZODI` and `WCS-WAVE` (plus the primary
   header) are fetched and cropped.
4. Large HDUs such as `EPSF` are never downloaded by the fallback.
5. The frame endpoint accepts up to 24 visits per detector; the bundled default
   index and the checked-in mirror cover all six detectors.

## Local all-sky context

When IRSA cannot discover a field and there is no matching local visit mirror,
the browser reprojects a 30° context window from the checked-in NASA/JPL-Caltech
all-sky mosaic (`frontend/assets/spherex-allsky-2025.jpg`, 1600 × 800 Galactic
equirectangular). The fallback is local, requires no network request and is
labelled `LOCAL MOSAIC · REAL NASA IMAGE`. It is context only: the mosaic has no
per-visit FITS measurements and only about 0.225° per source pixel, so the
viewer does not pretend that its 30° window is the selected 0.3° cutout.

The checked S3 range test reads a 65 MB DR1 product into a 426 KB cropped
buffer while preserving `IMAGE`, `VARIANCE`, `ZODI` and `WCS-WAVE`.

## Remaining limit

Coverage is checked at query time from TAP/SIA2 rather than from a bundled MOC
polygon set. A true MOC preflight can be added later without changing the
coverage response contract: return `observed: false` for points outside the MOC
and keep the same 200 response. Until then, preset buttons remain clickable and
an unobserved field produces the explicit `NO COVERAGE` state.
