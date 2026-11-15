# SPHEREx all-sky mosaic

`spherex-allsky-2025.jpg` is the official **NASA/JPL-Caltech SPHEREx All Sky Map 2025** all-sky mosaic, downloaded from:

https://spherex.caltech.edu/download/MediaFile/76/binary/original

The original is a 4000 × 2000 TIFF in a Galactic equirectangular projection. It was resampled to 1600 × 800 and encoded as JPEG for the navigator; no synthetic pixels or features were added. The minimap resamples this real mosaic into the app's equatorial RA/Dec canvas using the J2000 equatorial-to-Galactic rotation, so the image and the coordinate grid stay aligned.

The same checked-in image is used as the offline all-sky fallback: for a field without a local visit mirror, the browser reprojects a 30° context window around the requested coordinates. That view is labelled as a NASA/JPL-Caltech mosaic context, not a per-visit FITS cutout; no pixels are fetched or synthesized for it.

Image credit: **NASA/JPL-Caltech**. Image use policy: https://spherex.caltech.edu/page/image-use-policy
