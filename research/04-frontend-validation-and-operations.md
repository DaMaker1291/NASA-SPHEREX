# SPHEREx Viewer Research, Document 4
## Frontend, Visualization, Validation, and Operations

The front end had one job: make a real detector frame legible without hiding what it is. That sounds simple until you look at the data. A SPHEREx Level-2 frame is a 2,040 × 2,040 spectral image with a non-standard spectral WCS, a flag bitmask, a variance plane, a zodiacal model, and a PSF product. It is not a JPEG, and it is not a north-up sky map.

This document covers the viewer choices, the time-series and spectrum UI, the stretch/color decisions, the validation targets, and the operational behavior that keeps the tool honest when the archive is unavailable.

## The front-end stack

The client is React 19 with TypeScript, Vite, and Tailwind CSS. The Worker is Hono. The app uses a small set of dependencies: `lucide-react` for icons, `motion` for a few transitions, and `react-router` for the guide and tool pages. There is no charting library, no mapping library, and no general-purpose FITS viewer embedded in the page.

That was deliberate. The core view is a single FITS cutout, not a multi-survey sky atlas. A general-purpose viewer such as Aladin Lite is excellent at HiPS surveys, catalogue overlays, footprints, and coordinate grids. It would be the right choice for a “browse the sky” product. It is not the right choice for a native detector frame whose pixel coordinates map to wavelength through a FITS lookup table. I evaluated Aladin Lite, and I kept it as an external cross-check link rather than embedding it.

The custom canvas gives me direct control over:

- The exact FITS plane being drawn.
- The pixel-to-sky and pixel-to-wavelength mapping.
- The flag-bit color mapping.
- The catalogue projection onto the detector WCS.
- The provenance badge and the error states.

It also keeps the bundle small and the interaction immediate.

## The viewer

The browser parses the FITS file with a dependency-free reader in `src/lib/fits.ts`. It reads the primary header, the image HDUs, the binary tables, the `WCS-WAVE` table, and the FITS statistics. It supports 2D images, 3D PSF planes, `FLAGS`, and `WCS-WAVE`. It does not decode Rice-compressed products, and it caps local files at 512 MB so a user cannot accidentally freeze the tab.

`RealSky.tsx` draws the selected plane onto a 2D canvas. The default is `IMAGE`, but the user can switch to `VARIANCE`, `FLAGS`, or `ZODI`. Each layer has its own normalization:

- `IMAGE` uses a fixed iridescent lookup table with a sampled min/max stretch.
- `VARIANCE` uses a violet-to-cyan scale.
- `FLAGS` maps the lowest set bit to a hue and leaves zero as near-black.
- `ZODI` uses a blue-to-cyan scale.

The viewer does not invent a “ghost” or “stray light” layer. The `FLAGS` view shows the raw bits. The status line counts the bits and shows the first few counts. If the archive flags a pixel, the viewer shows the flag; it does not reinterpret it.

The canvas also handles the pixel probe. Moving the pointer converts the canvas position to a detector pixel, then to sky coordinates through the FITS WCS, and to wavelength through `WCS-WAVE`. The readout shows RA/Dec, wavelength, bandwidth, the current layer value, and the pixel scale. Clicking sets the spectrum target.

The provenance badge is always in the top-right of the frame. It links to the exact IRSA product, names the release and detector, shows the observation time, and marks a cached cutout. That badge is not decoration. It is the audit trail.

The viewer has explicit empty and error states. If IRSA does not return a cutout, the frame says so and offers a retry. It does not draw a placeholder sky. If the cutout is cached, it says “cached IRSA cutout” rather than pretending it is live.

## Time series

The time-series UI is a visit scrubber, not a video. The user can step through the real exposure groups returned by SIA2, or drag the range slider. The frame updates to the selected visit and detector. The URL records the visit ID so a link can reopen the same frame.

That is enough to inspect variability and cadence, but it is not a movie. I did not build playback, ping-pong, or a difference mode. Those are useful, but they imply a level of temporal alignment and artifact handling that the current data path does not provide. A “difference” toggle on a single visit would be misleading.

If I add playback, it should render from a preflighted sequence: same field, same detector, same WCS, same stretch, and a clear timestamp overlay. It should also state the cadence gaps. A smooth 30 fps video would hide the fact that the visits are months apart.

## Spectrum

The spectrum panel is a hand-drawn SVG, not Plotly or uPlot. The x-axis is logarithmic in wavelength; the y-axis is a percentile stretch of the measured aperture flux. Each detector segment gets its own line and color. Flagged samples are pink dots. The panel reports the number of samples, the detector segments, and the flagged count.

The server extracts the spectrum from a `24 × 2040` pixel strip. It averages five pixels across the aperture row by row, reads the wavelength and bandwidth from `WCS-WAVE`, and returns only finite samples. It does not interpolate across gaps. It does not merge the six arrays into one continuous curve.

That choice keeps the chart honest but less pretty. A continuous 0.75–5 µm curve would require interpolation and gap filling; the app would then have to label which parts were measured and which were inferred. I preferred the segmented chart with visible gaps.

The chart is also linked to the image in a simple way: clicking the image sets the spectrum target, and the readout shows the wavelength under the cursor. It is not full linked brushing across every band and epoch. That would be a larger state model, and it would need a real cube.

## Stretching and color

The local FITS lab exposes three stretches: asinh, linear, and log. Asinh is the default because it handles the high dynamic range of infrared images without crushing the faint structure. The main `RealSky` view uses a fixed perceptual lookup table rather than a user-selected stretch; the goal there is a consistent, readable false-color image, not a photometric display.

I did not build an RGB compositor. Mapping 102 bands to RGB is a science-visualization project of its own. A fixed “blue/green/red” channel integration would imply a color truth that the data do not have. The `BandExplorer` shows the nominal band colors and wavelengths; it is a planning view, not a rendered composite.

If I add RGB, it should let the user choose three bands or three wavelength windows, show the exact ranges, and preserve the per-channel stretch. It should not default to a misleading “true color” label.

## Validation targets

The research plan named four useful archetypes. I used them as validation thinking, not as claims that the current viewer detects them.

| Target | Why it matters | What the tool can and cannot show |
|---|---|---|
| Barnard’s Star | High proper motion, about 10.3 arcsec yr⁻¹; roughly 20 arcsec over two years | The visit series can show the field at different epochs. The current viewer does not shift-and-stack or measure a PM. |
| WISE 0855 | Very faint Y dwarf, fast mover; a stacking and sensitivity test | Single-epoch detection is not guaranteed. The tool can show the real cutout and flags; it does not claim a detection. |
| Epsilon Indi B | Brown-dwarf pair separated by roughly 0.7–1.5 arcsec | The pair is unresolved at 6.15 arcsec pixels. The tool can show a blended PSF and variability, not a resolved binary. |
| RW Aur / R Dra | Variables with timescales that can alias a six-month cadence | The visit scrubber shows the sampling. It cannot recover a period the cadence does not support. |

The point of the table is to keep the claims aligned with the data. A viewer that shows real frames is useful even when it cannot solve the science case. Pretending otherwise would be the failure mode.

## Testing and CI

The current verification is:

- `npm run typecheck`
- `npm run build`
- A manual check that the default field loads the cached SIA index and D2 cutout.
- A manual check that the live `find` and `cutout` routes return real data when IRSA is healthy.

I did not add automated tests. That is a gap, not a virtue. The tests I would add first are:

1. **FITS fixture test.** Parse a small real cutout and assert the HDU names, dimensions, WCS keywords, and `WCS-WAVE` values.
2. **Grouping test.** Feed a fixed SIA CSV and assert the visit groups, detector lists, and MJD ordering.
3. **Allowlist test.** Assert that a non-IRSA host, a non-SPHEREx path, a port, userinfo, and traversal are rejected.
4. **Golden image test.** Render a known cutout with a fixed stretch and compare a small PNG hash.
5. **Astrometry test.** Solve a cutout with Astrometry.net and assert the residual is below 0.1 pixel.

The last one is the most valuable and the most expensive. It needs a local solve and a stable reference. It is the right test for a tool that claims to preserve the WCS.

## Documentation and citation

The README documents the real pipeline, the backend behavior, the cached default data, and the limits. The in-app guide repeats the important parts for users who never open the repository. It says what is real, what is not claimed, and how the URL state works.

The data citation is separate from the app citation. IRSA asks users to cite the DR1 spectral images (DOI 10.26131/IRSA678) and the all-sky cube (DOI 10.26131/IRSA679), and to include the SPHEREx acknowledgment:

“This publication makes use of data products from the Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer (SPHEREx), which is a joint project of the Jet Propulsion Laboratory and the California Institute of Technology, and is funded by the National Aeronautics and Space Administration.”

The app itself is not an official NASA, IPAC, or SPHEREx product. That disclaimer is in the README and should stay in any public deployment.

I did not mint a DOI for the app. If it is released as a citable tool, Zenodo is the obvious route: tag a release, archive the source, and put the DOI in the README and the guide.

## Operations

The operational model is simple:

- `/api/health` reports liveness without touching IRSA.
- Successful responses carry cache headers and `X-Data-Source`.
- Upstream failures return a JSON error with a request ID.
- SIA2 and catalogue failures trigger a 30-second cooldown.
- The default field falls back to the bundled real SIA result and cutout.
- The viewer shows an error and a retry button; it never substitutes a synthetic frame.

The current IRSA SIA2/TAP outage is a good test of that model. SIA2 and TAP return 502s; the cutout service and S3 are healthy. The default field still loads from the bundled data. The northern and southern presets cannot resolve visits because they have no cached index. The app reports the failure instead of drawing a model sky.

That is the right behavior for an archive tool. It is also a reminder that “available” is a dependency, not a property of the app.

## What I would do next

In order:

1. Add cached SIA indexes for the two non-default presets, so an IRSA discovery outage does not break them.
2. Add the FITS fixture and allowlist tests.
3. Add a Sesame name resolver and sexagesimal parsing.
4. Add a server-side coadd job with background matching and a weight map.
5. Add proper-motion shift-and-stack as a separate, validated job.
6. Add a 102-channel cube builder only after the coadd and spectral mapping are solid.

The order matters. The first two are reliability work. The next two are usability and science. The cube is last because it is the easiest to fake and the hardest to validate.

## Sources

- Aladin Lite documentation: https://aladin.cds.unistra.fr/AladinLite/doc
- Aladin Lite API reference: https://aladin.cds.unistra.fr/AladinLite/doc/API
- SPHEREx Data Products (PSF, flags, WCS-WAVE): https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products
- SPHEREx DR1 and citation: https://irsa.ipac.caltech.edu/data/SPHEREx/docs/overview_dr1.html
- IRSA SPHEREx mission page and acknowledgment: https://irsa.ipac.caltech.edu/Missions/spherex.html
- IRSA data use terms: https://irsa.ipac.caltech.edu/data_use_terms.html
- SPHEREx pipeline paper: https://iopscience.iop.org/article/10.3847/1538-4365/ae8843
- Astropy photutils ePSF: https://docs.astropy.org/projects/photutils/en/latest/user_guide/epsf_building.html
- Gaia Archive: https://gea.esac.esa.int/archive/
- AllWISE at IRSA: https://irsa.ipac.caltech.edu/Missions/wise.html
