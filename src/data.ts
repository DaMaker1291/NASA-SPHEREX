export const SITE = {
  name: 'Drift',
  tagline: 'A real SPHEREx data lab',
} as const

export const NAV = [
  { label: 'Viewer', to: '/#sky' },
  { label: 'Bands', to: '/#bands' },
  { label: 'Data', to: '/#data' },
  { label: 'FITS', to: '/#fits' },
  { label: 'Guide', to: '/guide' },
] as const

export const LINKS = {
  spherex: 'https://spherex.caltech.edu/',
  irsa: 'https://irsa.ipac.caltech.edu/',
  explorer: 'https://irsa.ipac.caltech.edu/applications/spherex/',
  supplement: 'https://irsa.ipac.caltech.edu/data/SPHEREx/docs/SPHEREx_Expsupp_QR.pdf',
  comet: 'https://irsa.ipac.caltech.edu/data/SPHEREx/docs/comet3iatlas/index.html',
  cometSample: '/data/3iatlas/3IATLAS-sample.fits',
  cometManifest: '/data/3iatlas/manifest.json',
  cometWget: '/data/3iatlas/3IATLASImages-wget.sh',
  cometCurl: '/data/3iatlas/3IATLASImages-curl.sh',
  wise: 'http://byw.tools/wiseview',
  gaia: 'https://archive.stsci.edu/missions-and-data/gaia',
  aladin: 'https://aladin.cds.unistra.fr/',
  neossat: 'https://www.asc-csa.gc.ca/eng/satellites/neossat/',
  neossatData: 'https://data.asc-csa.gc.ca/dataset/neossat',
  astropy: 'https://www.astropy.org/',
  manifest: '/data/releases.json',
} as const

export const IMAGES = {
  holoKnot: { src: '/images/holo/knot.webp', alt: '' },
  holoPrism: { src: '/images/holo/prism.webp', alt: '' },
} as const satisfies Record<string, { src: string; alt: string }>
export type HoloKind = 'knot' | 'prism'
