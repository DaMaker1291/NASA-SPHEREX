# SPHEREx real-data mirror

The mirror is a local, checked copy of real SPHEREx products. It is not a sky
model, not a fallback renderer, and not generated filler. Every frame is
downloaded directly from IRSA or S3, checked for its PNG/FITS file signature,
and stored with a SHA-256 checksum. The browser verifies the PNG checksum before
displaying a mirrored frame.

## What is mirrored

`public/mirror/index.json` describes the mirrored fields and frames. Each field
contains its real IRSA provenance, field centre, detector, palette, stretch,
summary and frame list. Each frame has:

- the original `uri` and `obsid`
- a mirrored PNG and its SHA-256
- a mirrored FITS cutout and its SHA-256
- the original observation date and detector
- the real FITS measurement headers: median/mean light, flagged pixels, WCS
  centre, and measured wavelength range

The measurement block is required. The ingestor refuses to publish a mirror
frame that did not return real measurement headers. This is what lets the
Learning lab and Sky games use mirrored visits in exactly the same way as live
IRSA visits; static PNGs alone cannot carry HTTP measurement headers.

The checked-in seed currently mirrors the app's default field, **RA 150°,
Dec +19.5°, 0.3°**, in all six detector bands, with twelve real visits per
band from IRSA DR1. A fresh run can mirror up to 24 visits per detector by
default, or every available visit with `--limit 0`; the checked-in seed is not
rewritten until a real ingestion succeeds. Other preset fields are not populated
while IRSA's discovery service is unavailable; the ingestor will not invent
them. Run it again when those fields can be discovered.

## Commands

```bash
# Rebuild/refresh the default field directly from IRSA/S3
npm run mirror:default

# Verify every mirrored PNG/FITS signature and checksum
npm run mirror:verify

# Ingest another real field once discovery is available
node scripts/mirror-spherex.mjs \
  --field orion:83.822:-5.391:0.3 \
  --detector D2 --limit 24

# Replay the checked-in real index when IRSA discovery is down
node scripts/mirror-spherex.mjs \
  --bundled public/data/spherex/dr1-150.json --limit 12
```

The ingestor normally discovers visits with IRSA TAP (falling back to SIA2),
then fetches each FITS cutout from the IRSA cutout service or the public S3
bucket. It can also be given a checked-in real index through `--bundled` when
the archive's discovery service is down. It rasterizes the real FITS itself and
stores the real products and measurement metadata; no app server is involved.
`--limit` defaults to 24, accepts 2 through 500, and `--limit 0` mirrors every
visit discovery returns. PNG and FITS cutouts are always mirrored together;
there is no PNG-only mode.

The manifest is schema version 2. Every frame carries a `measurement` object
with the real archive-derived values used by the learner and games.

## Mirror-first loading

When a real field is requested, the browser checks for a matching mirror before
starting the IRSA discovery request. If a complete field matches the requested
coordinates, detector, palette and stretch, the app verifies every mirrored PNG
and displays it immediately with the **LOCAL MIRROR · REAL FITS** provenance.
The IRSA request continues in the background; a successful response replaces
the mirror with live or cached IRSA data.

If the background request fails, the verified mirror stays visible and its
source label records the refresh failure. For a coordinate with no exact
mirror while IRSA is down, the viewer moves to the nearest verified field and
labels it as a fallback; it never presents those pixels as the clicked patch. Existing live or cached visits are
retained on failure in the same way when no mirror matches. No local file is
shown merely because it exists: it must pass the manifest, path, checksum and
measurement checks first.

## Failure behavior

- A failed download aborts the run before the manifest is replaced. The
  complete candidate manifest is verified first, and mirrored files use
  content-addressed names, so a failed refresh cannot overwrite bytes still
  referenced by the previous manifest.
- A PNG must start with the PNG signature; a FITS file must start with `SIMPLE`.
- Every frame must have real measurement metadata; an unmeasured frame is
  rejected rather than substituted.
- A malformed existing manifest is an error, never an empty mirror that would
  silently drop previously mirrored fields.
- `--verify` rehashes every file, checks the signatures and byte counts, and
  rejects frames without measurement metadata or an IRSA product URI.
- The browser refuses to display a mirror frame whose PNG SHA-256 does not
  match the manifest.
- The browser rejects the whole mirror field if any frame lacks a PNG/FITS
  checksum, a readable measurement block, or a valid local path; it does not
  display a filtered subset. It verifies every mirror PNG before replacing the
  current visit set, so one bad frame cannot leave a partial mirror on screen.
- If no mirror field matches the requested coordinates, detector, palette and
  stretch, the app keeps showing the existing real data if it has any, or shows
  an explicit archive error. It never substitutes synthetic pixels.

## Scale

The full SPHEREx level-2 archive is far too large for this repository. This
mirror is intentionally scoped to selected fields/frames. For broader coverage,
run the ingestor directly and place `public/mirror` (or an equivalent object-store
prefix) behind a CDN or object store with versioning and checksums. The ingestor
and manifest format can be reused for that larger mirror; the storage and crawl
budget are the limiting factors.
