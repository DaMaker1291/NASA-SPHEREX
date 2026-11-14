3I/ATLAS all-extension sample
=============================

This directory contains:

  3IATLAS-sample.fits
    An 8.8 MB cutout of a real SPHEREx level-2 product for comet 3I/ATLAS.
    It preserves the complete extension set:

      IMAGE     512 x 512 centre crop, 32-bit float
      FLAGS     512 x 512 centre crop, 32-bit integer bit fields
      VARIANCE  512 x 512 centre crop, 32-bit float
      ZODI      512 x 512 centre crop, 32-bit float
      PSF       101 x 101 x 121 full cube, 32-bit float
      WCS-WAVE  9 x 9 wavelength/bandwidth control grid

    The image extensions keep the original WCS. CRPIX1/2 are shifted for the
    crop, and CUTX0/CUTY0 record the crop origin in the original 2040 x 2040
    detector so WCS-WAVE can still be evaluated at every sample pixel. The PSF
    cube and the binary table are copied in full. Pixel values are unchanged
    from the original big-endian FITS arrays.

  3IATLASImages-wget.sh
  3IATLASImages-curl.sh
    The official IRSA download scripts for the complete 3I/ATLAS collection,
    copied unmodified. They retrieve 259 FITS products (18.55 GB).

  manifest.json
    An index of all 259 products, generated from the official wget script:
    week, visit, frame, detector, filename, size and the direct IRSA URL.

Source
------

Original product:
  level2_2025W31_2A_0156_1D6_spx_l2b-v20-2025-264.fits
  https://irsa.ipac.caltech.edu/ibe/data/spherex/qr2/level2/2025W31_2A/l2b-v20-2025-264/6/level2_2025W31_2A_0156_1D6_spx_l2b-v20-2025-264.fits

Observation: 2025W31_2A_0156_1, detector 6, 2025-08-01T08:01:06 UTC
Exposure: 113.5826 s
Centre: RA 253.125505683 deg, Dec -17.8956411818 deg (ICRS)

The full collection and scripts are published by NASA/IPAC IRSA:
  https://irsa.ipac.caltech.edu/data/SPHEREx/docs/comet3iatlas/index.html

No endorsement by NASA, IPAC or the SPHEREx mission is implied.
