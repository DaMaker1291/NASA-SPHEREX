# SPHEREx Viewer Research, Document 2
## Astronomical Algorithms and the Science Logic

The science logic in this app is deliberately narrow. It is a viewer and a pixel-measurement tool, not a survey pipeline. That was a choice, not a shortcut. The more I read about coaddition, PSF matching, and difference imaging, the clearer it became that a browser tool should not pretend to do those things unless it can also show the validation.

This document covers the algorithms I researched, the ones I used, and the ones I deliberately left out.

## The boundary I drew

The app has four jobs:

1. Ask IRSA which real SPHEREx detector frames cover a position.
2. Fetch one real Level-2 cutout for a selected visit and detector.
3. Draw the real `IMAGE`, `VARIANCE`, `FLAGS`, and `ZODI` arrays with their native WCS.
4. Measure a real aperture spectrum from the real detector strip, using `WCS-WAVE`.

That is it. There is no sky model, no synthetic noise, no invented catalogue, and no hidden coadd. The top-right badge always says where the pixels came from.

The algorithms below are the ones that would be needed to go from “viewer” to “survey analysis.” I researched them because they determine what the viewer must not overclaim, and because they are the natural next layer if the tool grows.

## Cutouts, reprojection, and coaddition

A cutout is not a mosaic. IRSA’s SPHEREx cutout service takes a spatial subset of one parent MEF and cuts every extension the same way. It preserves the structure and metadata, including the WCS and the `WCS-WAVE` table. It does not resample the pixels or combine exposures.

For multi-epoch work, the standard approach is to define a common tangent plane and reproject each image onto it. `reproject` is the Python reference implementation; Montage is the long-standing C toolkit. Both handle FITS WCS, including SIP distortion, and both can coadd with weighting. Montage also has background rectification and image visualization tools.

The hard part is not the reprojection call. It is the background. SPHEREx images carry a zodiacal light model (`ZODI`) that is not subtracted from `IMAGE`. The zodiacal background changes with time and position. If you coadd epochs without matching the background, you get a moving pedestal and artificial structure. If you subtract `ZODI` naively, you can remove real diffuse emission. The archive gives you the model so you can make that decision explicitly.

I did not implement reprojection or coaddition. The app shows one native cutout at a time. The visit slider changes the exposure, not a stack. That keeps the geometry honest and avoids a false claim of deeper data.

The cutout service is still the right primitive for a future coadd. A server-side job could fetch several cutouts, reproject them to a common WCS, subtract or fit the background, and return a weight map. That is a real pipeline, with real failure modes. It should not be hidden inside a “difference” toggle.

## Difference imaging

The standard reference is Alard & Lupton’s optimal image subtraction. The idea is to find a convolution kernel that matches the PSF of the reference image to the PSF of the science image, then subtract. A simple pixel-by-pixel difference is not enough when the PSF changes between epochs, and SPHEREx’s PSF does change with wavelength and position.

A practical difference pipeline needs:

- A common astrometric frame.
- A PSF model or a set of matching stars.
- A background model on both images.
- A mask for saturated, flagged, and transient pixels.
- A kernel fit that is stable across the field.
- A way to reject artifacts that survive the subtraction.

Even then, bright stars leave residuals, satellite trails can mimic moving sources, and the undersampled PSF makes the kernel fit sensitive to pixel phase. The LSST stack adds decorrelation and artifact flags for exactly these reasons.

I did not build difference imaging. The app has no template, no registration, no PSF matching, and no artifact rejection. It would be irresponsible to put a “difference” button on a single cutout and call the result science.

What the app does have is the raw material: the visit list, the real flags, and the real variance. A future difference mode could use those, but it would need a separate validation set and a clear label.

## Proper-motion stacking

“Shift-and-stack” is the right idea for a fast mover. You assume a proper-motion vector, shift each epoch by the predicted motion, and stack. A real signal adds coherently; a stationary background smears. The search is over a grid of motion vectors, and the output is a score map.

The test targets in the research plan are useful because they cover different regimes:

- Barnard’s Star: about 10.3 arcsec yr⁻¹. Over a two-year baseline that is roughly 20 arcsec, or about three SPHEREx pixels. It is a bright, well-studied star, so it is a good astrometric sanity check.
- WISE 0855: a very faint Y dwarf with a large proper motion, roughly 8 arcsec yr⁻¹. It is a sensitivity and stacking challenge, not a single-epoch detection guarantee.
- Epsilon Indi B: the brown-dwarf pair has a separation of roughly 0.7–1.5 arcsec, far below the 6.15 arcsec SPHEREx pixel. It is unresolved. The tool can show a blended PSF and photometric variability, but it cannot “resolve” the pair.
- RW Aur and R Dra: variable stars. Their variability timescales are not matched to a six-month cadence, so a SPHEREx visit series can alias the period. The tool can show the sampling, but it cannot recover a period that the cadence does not support.

I did not implement shift-and-stack. The app does not propagate Gaia proper motions either. It fetches `pmra` and `pmdec` for Gaia sources, but the overlay uses the catalogue position at the epoch of the catalogue, not a motion-corrected position at the SPHEREx epoch. That is a real limitation, and it is stated in the guide.

If I add proper-motion stacking, it will be a separate job with a user-supplied vector, a score map, and a null test. It will not be a checkbox that silently changes the data.

## The 102 bands and the spectral cube question

The 102 channels are not a single cube in the Level-2 data. They are 17 nominal channels in each of six detector arrays. A small square cutout covers a narrow wavelength slice because the LVF maps wavelength to position. A wide detector strip covers the array’s full spectral range.

The app’s spectrum path uses a `24 × 2040` pixel strip from each selected detector. The server averages a five-pixel aperture row by row, reads the central wavelength and bandwidth from `WCS-WAVE`, and returns the measured samples. It does not interpolate across detector gaps. It does not fill missing channels. It does not combine the six arrays into a seamless 0.75–5 µm spectrum. The chart shows separate segments, with gaps where the detector coverage has gaps.

This is a deliberate “real pixels first” choice. A pretty continuous spectrum would be a lie unless the gaps and flags were modeled. The app marks samples with a real `FLAGS` bit in pink and reports the number of flagged samples.

I did not build a spectral cube, a pseudo-color composite, or an RGB mapping of 102 bands. The `BandExplorer` shows the nominal band plan and colors; it is instrument geometry, not a claim that the viewer has a 102-plane cube. The local FITS lab can read a real all-extension product, including the PSF cube, but that is a file inspector, not a sky cube.

A future cube builder would need to:

- Group exposures by position and survey.
- Resample each detector frame onto a common spatial grid.
- Assign each pixel to a spectral channel using `CWAVE`/`CBAND`.
- Carry variance, flags, and coverage.
- Decide how to handle gaps and overlaps.

That is a server-side job. It is not a browser rendering trick.

## Catalog cross-matching

The app uses two catalog services:

- Gaia DR3 through the ESA Gaia Archive TAP service, querying `gaiadr3.gaia_source` with an ADQL `CONTAINS(POINT(...), CIRCLE(...))`.
- AllWISE through IRSA’s Gator cone search, using the `allwise_p3as_psd` table and `w1mpro` / `w2mpro`.

Both are live queries. The positions are projected onto the detector WCS with the same WCS inversion used for the pixel probe. The overlay draws real catalogue positions; it does not invent scene stars.

The Gaia query returns `pmra` and `pmdec`, but the overlay does not propagate them. For a high-proper-motion star, the Gaia position at J2016.0 can be several arcseconds away from the SPHEREx epoch. That is another reason the app labels the overlay as a catalogue position, not a measured counterpart.

The app does not query SIMBAD or NED. The coordinate inputs are decimal degrees only. I did not add a name resolver because it would introduce a second network dependency and a parsing layer that the first version did not need. If I add one, Sesame is the obvious choice: it resolves names across SIMBAD, NED, and VizieR, and it has a simple HTTP GET interface. The app already has a URL-state model that could accept a `target=` parameter.

## Coordinate parsing

The current parser is intentionally strict:

- RA: decimal degrees, 0–360.
- Dec: decimal degrees, −90 to +90.
- FOV: 0.10–0.90 degrees.
- Detector and visit IDs are validated against the SIA result.

It does not parse sexagesimal strings, and it does not resolve object names. That is a real limitation for a public tool. A robust version would accept `17h57m47.67s +04d44m16.73s`, decimal degrees, and a name. The parsing rules are not hard, but the failure modes are: ambiguous names, epoch-dependent positions, and silent truncation.

The URL state is already there (`?ra=...&dec=...&fov=...&detector=...&visit=...`), so a resolver only needs to produce the same three numbers and then hand off to the existing search path.

## What shipped and what I parked

Shipped:

- SIA2 discovery of real DR1 detector frames.
- Real cutout fetch and FITS parsing.
- Native WCS pixel probe and catalogue projection.
- `IMAGE`, `VARIANCE`, `FLAGS`, `ZODI` layers.
- Real aperture spectrum from a wide detector strip.
- Gaia DR3 and AllWISE overlays.
- URL state for field, visit, detector, and layer.
- Local all-extension FITS lab.

Parked:

- Reprojection and coaddition.
- Background matching across epochs.
- Optimal image subtraction.
- Artifact rejection beyond the archive flags.
- Proper-motion shift-and-stack.
- Full 102-channel cube.
- Pseudo-color / RGB compositor.
- Sesame/SIMBAD name resolution.
- Sexagesimal parsing.
- Server-side async jobs.

The parked list is not a roadmap promise. It is a record of what the research covered and what the current app does not claim.

## Why this order

I built the discovery and cutout path first because everything else depends on having a real FITS file with a real WCS. Once that worked, the viewer could expose the real arrays and the real flags. The spectrum came next because it uses the same cutout service and the same WCS-WAVE table. Catalog overlays came after that because they are a projection problem, not a pixel problem.

The advanced algorithms come last because they need a stable data path and a validation set. Starting with difference imaging would have produced a demo that looked impressive and could not be trusted. Starting with the archive made a smaller tool that can be checked against the exact IRSA product.

## Sources

- Alard & Lupton, optimal image subtraction: https://iopscience.iop.org/article/10.1086/305984
- Astropy reproject mosaicking: https://docs.astropy.org/projects/reproject/en/stable/mosaicking.html
- Montage image mosaic engine: https://iopscience.iop.org/article/10.1088/1538-3873/aa5456
- Photutils ePSF building: https://docs.astropy.org/projects/photutils/en/latest/user_guide/epsf_building.html
- SPHEREx Data Products (WCS-WAVE, flags, PSF): https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products
- SPHEREx pipeline paper: https://iopscience.iop.org/article/10.3847/1538-4365/ae8843
- Gaia Archive programmatic access: https://www.cosmos.esa.int/web/gaia-users/archive/programmatic-access
- IRSA Gator program interface: https://irsa.ipac.caltech.edu/docs/howto/gator_prog_interface.html
- Sesame name resolver: https://cds.unistra.fr/cgi-bin/Sesame
- Astropy Sesame resolver: https://docs.astropy.org/en/stable/api/astropy.coordinates.get_icrs_coordinates.html
