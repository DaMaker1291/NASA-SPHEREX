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
does not show an IRSA outage, and does not invent a frame.

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

The checked S3 range test reads a 65 MB DR1 product into a 426 KB cropped
buffer while preserving `IMAGE`, `VARIANCE`, `ZODI` and `WCS-WAVE`.

## Remaining limit

Coverage is checked at query time from TAP/SIA2 rather than from a bundled MOC
polygon set. A true MOC preflight can be added later without changing the
coverage response contract: return `observed: false` for points outside the MOC
and keep the same 200 response. Until then, preset buttons remain clickable and
an unobserved field produces the explicit `NO COVERAGE` state.
