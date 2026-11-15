# SPHEREx Viewer Research, Document 1
## Data Access, Products, and Instrument Reality

The first useful decision I made was not to treat SPHEREx as “a big image of the sky.” It is not one image, and it is not 102 independent pictures. It is a set of detector-level spectral images, each one tied to a specific exposure, detector, and pointing. Once I understood that, the rest of the design followed: query the archive for the right exposures, fetch a small real cutout, preserve its native geometry, and show the actual FITS extensions instead of inventing a cube.

This document is the archive-and-instrument side of that work. The companion documents cover the science algorithms, the backend, and the front end.

## Where the data actually lives

The archive is NASA/IPAC/IRSA, not MAST and not a custom SPHEREx server. IRSA hosts the SPHEREx spectral images, the higher-level cubes and catalogs, the SIA2 search service, the cutout service, and the documentation. The mission itself is a JPL/Caltech project, but IRSA is the public data access point.

There is also a cloud copy. IRSA publishes the SPHEREx Quick Release data in the public AWS bucket `nasa-irsa-spherex` in `us-east-1`, and the bucket is listed in the AWS Open Data Registry. The bucket is useful for bulk work, header reads, and building a local index. It is not a spatial search engine. That distinction mattered later: an object store can hold the files, but it cannot answer “which detector frames cover this RA/Dec?” without an index I would have had to build and maintain.

The on-premises copy and the cloud copy are not identical access paths. SIA2 and the SPHEREx cutout service operate on the IRSA-held products. The cloud bucket gives direct object access. For a browser tool that needs a small, valid FITS cutout with all of its extensions, the IRSA cutout service was the better fit.

Data release status also matters. IRSA released SPHEREx Data Release 1 in November 2026. DR1 reprocesses the QR2 spectral images so that DR1 and QR3 form a uniformly processed set, and it adds an all-sky cube in the 102 nominal channels. QR2 is no longer returned in IRSA or VO searches, though direct downloads remain available for a transition period. I used the `spherex_dr1` collection for the live search and cached a real DR1 result for the default field.

The data are public. IRSA’s terms of use allow public data access, and the SPHEREx documentation asks users to cite the appropriate DOI and include the mission acknowledgment. That is not just a footer issue; it is part of shipping an archive tool honestly.

## What one observation really is

A SPHEREx Level-2 product is a Multi-Extension FITS file for one detector and one pointing. The active detector is 2,040 × 2,040 pixels, with four rows and columns of reference pixels at the border. The file is roughly 72 MB. It contains six HDUs:

- `IMAGE`: calibrated surface brightness in MJy sr⁻¹.
- `FLAGS`: a per-pixel bitmask of status and processing flags.
- `VARIANCE`: per-pixel variance in (MJy sr⁻¹)².
- `ZODI`: a model of the zodiacal light background, not subtracted from `IMAGE`.
- `PSF` or `EPSF`: the point-spread function product. In the R7/DR1 era the calibration product is an effective PSF; the Level-2 file still carries a PSF extension.
- `WCS-WAVE`: a FITS lookup table mapping pixel coordinates to central wavelength and bandwidth.

That is the unit I request. Not a 102-band cube. One detector frame covers a broad band, and the wavelength varies across the frame because of the linear variable filter. The spacecraft repoints between exposures so that a source falls at different positions in the detector and is sampled at different wavelengths. A complete spectrum is built from multiple exposures, not from one 102-plane data cube sitting in a single file.

This is the single most important correction to the rough volume formula. “Single epoch size × 102 bands × four epochs per year × two years” overcounts the file structure by a large factor, because the 102 channels are 17 channels across each of six detector arrays. There are six Level-2 files per pointing, not 102. The higher-level all-sky cube is a separate, much larger product.

The published numbers make the scale clear:

- One spectral image: about 72 MB.
- The spectral-image collection: about 190 TB.
- The all-sky data cubes: about 95 TB.
- The high-reliability source catalog: about 120 TB.

That is hundreds of terabytes, effectively petabyte-class when calibration and ancillary products are included. It is not something a browser should download, and it is not something I wanted to mirror. The app requests one small cutout at a time. The default field ships with one cached SIA index and one 176 × 176 D2 cutout, which is a few megabytes, not a local archive.

## The instrument geometry

The telescope has a 20 cm effective aperture and a field of view of two 3.5° × 11.3° fields, split by a dichroic. There are six Teledyne H2RG HgCdTe detector arrays, each 2,048 × 2,048 with 2,040 × 2,040 optically active pixels. Three arrays are in the short-wave infrared focal plane and three are in the mid-wave infrared focal plane.

Each array has a linear variable filter mounted above it. The filter’s central wavelength changes along one axis of the array. That is why a single detector frame is simultaneously an image and a spectrum: position on the detector encodes wavelength. The six arrays cover:

- Band 1: 0.744–1.116 µm, R ≈ 39.
- Band 2: 1.099–1.651 µm, R ≈ 41.
- Band 3: 1.636–2.421 µm, R ≈ 41.
- Band 4: 2.423–3.822 µm, R ≈ 35.
- Band 5: 3.809–4.420 µm, R ≈ 112.
- Band 6: 4.412–5.002 µm, R ≈ 128.

The exact resolving powers are quoted slightly differently in different mission papers, usually 35–130; the archive table above is the one I used in the app. Each band is divided into 17 nominal spectral channels for survey planning, giving 102 channels across the instrument. The pixel scale is 6.15 arcsec, the frame time is 1.5349 s, and the nominal exposure is 113.58 s.

The key operational point is that the six arrays do not each see the same wavelength range at the same time. The dichroic sends short wavelengths to one focal plane and long wavelengths to the other. Within each array, the LVF makes the wavelength change across the field. A single pointing therefore gives you six broad spectral slices at different positions, not a simultaneous 0.75–5 µm spectrum of every source.

That has consequences for “adding arrays for S/N.” You can combine arrays to cover more wavelength, but you cannot simply add them as if they were redundant measurements of the same band. They are different spectral samples, with different PSFs, different backgrounds, and different detector systematics. The app exposes the detector choice for exactly this reason: it lets you look at one real array at a time rather than pretending the six are interchangeable.

## PSF behavior

The SPHEREx PSF is significantly undersampled at the native 6.15 arcsec pixel scale. The mission’s PSF products are built to deal with that. The older QR2 product is a 121-plane cube of 101 × 101 PSFs, oversampled 10×, on an 11 × 11 grid across the detector. The R7/DR1 calibration uses effective PSFs: 33 × 33 arrays oversampled 5×, with 21 × 21 spatial zones for most detectors and a finer 11 × 41 grid for detector 3 along the dispersion direction.

The PSF changes with position and with wavelength. The sky simulator paper describes the variation as continuous across the focal plane, with PSF width generally increasing toward longer wavelengths and additional optical variation across the field. This is not a cosmetic detail. It means a simple coadd that assumes one PSF for all epochs and all bands will be wrong at some level, and a difference image that ignores PSF matching will produce residuals around every star.

I did not try to solve that in the browser. The viewer draws the native pixels and reports the pixel scale from the WCS. The local FITS lab can read the PSF cube when the user supplies a real product. The app does not claim to have performed PSF-matched photometry.

## Cadence and time

The survey is not a simple “two epochs per field per year” cadence. SPHEREx completes four all-sky maps over its 25-month prime mission. The maps are organized into four surveys: Surveys 1 and 2 in the first 12.5 months, Surveys 3 and 4 in the second 12.5 months. Surveys 1 and 3 use one observatory position angle; Surveys 2 and 4 use the other. Surveys 3 and 4 are shifted by about 6 arcminutes relative to Surveys 1 and 2 to improve spectral sampling.

The all-sky survey is designed to place every source within each spectral channel at least once per six-month survey. The deep fields near the north and south ecliptic poles get much more coverage. So the number of useful visits depends strongly on where you point. A field near the ecliptic pole can have many more epochs than a random all-sky field. The app does not hard-code a cadence; it shows whatever visits SIA2 returns for the requested position.

Time metadata is present and usable, but it needs care. The Level-2 header has `TIMESYS = UTC`, `DATE-OBS`, `MJD-OBS`, `DATE-BEG`, `MJD-BEG`, `DATE-AVG`, `MJD-AVG`, `DATE-END`, and `MJD-END`. `MJD-OBS` is the start of the observation, not a barycentric-corrected time. I did not find a barycentric time column in the Level-2 product. For high-precision proper-motion work, that correction has to be applied by the analysis layer, with the spacecraft orbit and the target position. The viewer uses `DATE-AVG` for display because it is the midpoint of the exposure and is the least misleading single timestamp for a frame.

This is also why I did not promise “proper motion over the SPHEREx baseline” as a built-in feature. The data can support that work, but it needs a time model and a stacking method, not just a slider.

## Flags and WCS

The `FLAGS` extension is a real bitmask, not a quality score. It includes bits for transients and cosmic rays, overflow, surface-ramp errors, nonfunctional pixels, dichroic-edge pixels, persistence, outliers, crosstalk, known-source masks, ghosts, blooms, snowballs, halos, and satellite halos. The names and bit assignments are in Table 10 of the Explanatory Supplement. The app shows the raw bits and counts them; it does not relabel a bit as “ghost” or “stray light” unless the archive does.

The WCS is a tangent-plane projection with SIP distortion. The headers contain `CTYPE1 = RA---TAN-SIP`, `CTYPE2 = DEC--TAN-SIP`, the usual `CRPIX`, `CRVAL`, `PC`, and the `A_*`/`B_*` SIP coefficients. The fine-astrometry step uses Gaia DR3 as the reference, with Gaia proper motions propagated to the observation epoch. The archive reports a median alignment precision of about 0.1–0.4 arcsec for images with a good `FINAST` flag. The maximum distortion at the corners can be around 13 pixels, or roughly 80 arcsec, which is why a cutout cannot be treated as a simple north-up picture.

IRSA’s cutout service preserves the parent image’s orientation. The axes of a cutout are aligned with the detector axes, not with north and east. That is not a bug in the cutout; it is the real geometry. The app therefore uses the FITS WCS for every coordinate conversion and does not rotate the image to a conventional sky orientation.

The `WCS-WAVE` table is a separate spectral WCS. It is a lookup table, not a 3D image. IRSA notes that it is intended for visualization; for science analysis, the standalone `CWAVE` and `CBAND` calibration products are the better choice. I used `WCS-WAVE` because the viewer is a visualization and measurement tool, and because it is already in the Level-2 cutout. The app labels the resulting spectrum as a real pixel-aperture measurement, not a calibrated science spectrum.

## What I changed in the build because of this

These are the concrete decisions that came out of the archive research:

- Use IRSA SIA2 as the discovery layer, not a bulk download.
- Request the `spherex_dr1` collection, with `POS=circle` and CSV output.
- Use the IRSA cutout service for a spatial subset, and strip the large `EPSF` HDU before sending the FITS to the browser.
- Preserve the native detector WCS and orientation. Do not reproject to north-up.
- Show `IMAGE`, `VARIANCE`, `FLAGS`, and `ZODI` as separate real layers.
- Treat `WCS-WAVE` as a visualization lookup table, not a full spectral cube.
- Cache one real default field so the first render does not depend on a live archive queue.
- Do not claim a 102-band cube. The six arrays and 17 channels are instrument geometry; the app says so.

The result is a tool that is honest about the unit of data it has. It does not pretend that a 176 × 176 cutout is the whole spectrum, and it does not pretend that a six-month survey is a nightly time series.

## Sources

- SPHEREx instrument page: https://spherex.caltech.edu/page/instrument
- SPHEREx survey page: https://spherex.caltech.edu/page/survey
- SPHEREx Explanatory Supplement (IRSA): https://irsa.ipac.caltech.edu/data/SPHEREx/docs/SPHEREx_Expsupp.pdf
- IRSA SPHEREx mission page: https://irsa.ipac.caltech.edu/Missions/spherex.html
- SPHEREx Data Products: https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products
- SPHEREx Data Access: https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-access
- IRSA Cloud Access: https://irsa.ipac.caltech.edu/cloud_access/
- SPHEREx DR1: https://irsa.ipac.caltech.edu/data/SPHEREx/docs/overview_dr1.html
- SPHEREx Cutout Tool: https://irsa.ipac.caltech.edu/data/SPHEREx/docs/cutout_tool.html
- IRSA Image Server cutouts: https://irsa.ipac.caltech.edu/ibe/cutouts.html
- SPHEREx pipeline paper: https://iopscience.iop.org/article/10.3847/1538-4365/ae8843
- SPHEREx sky simulator paper: https://iopscience.iop.org/article/10.3847/1538-4365/ae04cc
