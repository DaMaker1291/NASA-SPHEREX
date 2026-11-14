import { ArrowRight, ExternalLink } from 'lucide-react'

import { ArrowLink, Title } from '../components/Bits'
import { ButtonLink } from '../components/Button'
import { Card } from '../components/Card'
import { Holo } from '../components/Holo'
import { Nav } from '../components/Nav'
import { LINKS } from '../data'
import { ARRAYS, INSTRUMENT } from '../lib/spherex'
import { useDocumentTitle } from '../lib/storage'

const PARAMS = [
  ['ra', 'Right ascension, degrees (0–360)', '150.000'],
  ['dec', 'Declination, degrees (−90 to +90)', '19.500'],
  ['fov', 'IRSA cutout size, degrees (0.10–0.90)', '0.30'],
  ['detector', 'Real detector product to display (D1–D6)', 'D2'],
  ['visit', 'Real SIA2 exposure group id', '2026W19_2A_0047'],
  ['layer', 'Real catalogue overlay: gaia or wise', 'gaia'],
]

const SIA = `https://irsa.ipac.caltech.edu/SIA
  ?COLLECTION=spherex_dr1
  &POS=circle 150 19.5 0.15
  &RESPONSEFORMAT=CSV
  &MAXREC=300`

const ROUTES = `GET /api/spherex/find?ra=150&dec=19.5&fov=0.3
GET /api/spherex/cutout?uri=…&ra=150&dec=19.5&fov=0.3
GET /api/spherex/spectrum?ra=150&dec=19.5&uri=…&uri=…
GET /api/catalog?survey=gaia&ra=150&dec=19.5&radius=0.2`

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-4 overflow-x-auto rounded-[var(--radius-control)] bg-night p-4 text-[12px] leading-relaxed text-[#d8d0ff]">
      <code>{children}</code>
    </pre>
  )
}

export function Guide() {
  useDocumentTitle('Field guide')
  return (
    <div className="grid grid-cols-1 gap-2 p-2">
      <section className="relative overflow-hidden rounded-[var(--radius-card)] bg-card px-5 pt-3 pb-8 sm:px-8">
        <Nav />
        <div className="grid gap-8 pt-10 pb-2 lg:grid-cols-[1.25fr_auto] lg:items-center">
          <div>
            <p className="caps text-[10px] text-violet">Field guide</p>
            <h1 className="display mt-3 text-[clamp(3rem,1.4rem+7vw,7.5rem)]">
              <span className="block">Read the</span>
              <span className="block">controls</span>
            </h1>
            <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-ink-2">
              Drift asks IRSA which real SPHEREx DR1 detector frames cover a position, fetches an actual level-2 FITS cutout, and draws
              the physical arrays in the browser. The spectrum is measured from those same pixels. Every view is a URL, and the source
              of the current cutout is named in the frame’s top-right badge.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <ButtonLink to="/#sky" variant="violet" iconRight={<ArrowRight className="size-4" />}>
                Back to the viewer
              </ButtonLink>
              <ButtonLink to="/#data" variant="outline">
                Real data path
              </ButtonLink>
              <ButtonLink to="/#fits" variant="outline">
                Open the FITS lab
              </ButtonLink>
            </div>
          </div>
          <div className="mx-auto w-44 sm:w-56" aria-hidden>
            <Holo kind="prism" motion priority />
          </div>
        </div>
      </section>

      <section id="embed" className="scroll-mt-2">
        <Card className="p-5 sm:p-8">
          <p className="caps text-[10px] text-violet">Sharing</p>
          <Title lines={['Every view', 'is a URL']} align="left" size="md" className="mt-2" />
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-2">
            The field, real exposure group, detector product and catalogue layer live in the query string. The address bar follows the
            viewer, and a recipient re-queries IRSA for the same real cutout. No model sky is bundled into the link.
          </p>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-line-strong">
                  <th className="caps py-2 pr-4 text-[9px] text-muted">Parameter</th>
                  <th className="caps py-2 pr-4 text-[9px] text-muted">Meaning</th>
                  <th className="caps py-2 text-[9px] text-muted">Example</th>
                </tr>
              </thead>
              <tbody>
                {PARAMS.map(([name, meaning, example]) => (
                  <tr key={name} className="border-b border-line">
                    <td className="py-2 pr-4 align-top">
                      <code className="rounded bg-soft px-1.5 py-0.5 text-[12px] text-violet-deep">{name}</code>
                    </td>
                    <td className="py-2 pr-4 align-top text-ink-2">{meaning}</td>
                    <td className="py-2 align-top text-muted">
                      <code className="text-[12px]">{example}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div>
              <p className="caps text-[10px] text-muted">A real default field</p>
              <Code>{`?ra=150.000&dec=19.500&fov=0.30&detector=D2`}</Code>
            </div>
            <div>
              <p className="caps text-[10px] text-muted">A real catalogue layer</p>
              <Code>{`?ra=150.000&dec=19.500&fov=0.30&detector=D2&layer=gaia`}</Code>
            </div>
          </div>
          <p className="caps mt-3 text-[9px] leading-relaxed text-muted">
            The `visit` value is an SIA2 exposure-group id, not a model frame index. Unknown ids fall back to a real group that contains
            the requested detector.
          </p>
        </Card>
      </section>

      <section id="data" className="scroll-mt-2 grid gap-2 lg:grid-cols-[1.1fr_1fr]">
        <Card className="p-5 sm:p-8">
          <p className="caps text-[10px] text-violet">The data path</p>
          <Title lines={['SIA2 in,', 'FITS out']} align="left" size="md" className="mt-2" />
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
            IRSA is the discovery and pixel source. The Worker only proxies the archive; it does not invent a fallback sky.
          </p>
          <ol className="mt-4 grid gap-2 text-[14px] text-ink-2">
            {[
              'SIA2 finds real SPHEREx DR1 detector products whose footprints cover the position.',
              'The Worker allowlists the exact IRSA FITS URL and asks the cutout service for a real center/size crop.',
              'The cutout is stripped of its large EPSF table and returned to the browser as FITS.',
              'The browser parses IMAGE, VARIANCE, FLAGS, ZODI and WCS-WAVE, then draws the physical plane you choose.',
              'Spectrum extraction fetches real detector strips and averages a five-pixel aperture row by row.',
              'Gaia DR3 positions come from Gaia TAP; AllWISE positions come from IRSA’s cone search. Both are projected onto the detector WCS.',
            ].map((step, index) => (
              <li key={step} className="flex gap-3 border-t border-line pt-2">
                <span className="caps text-[9px] text-violet">0{index + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <Code>{SIA}</Code>
          <p className="caps mt-3 text-[9px] leading-relaxed text-muted">
            The SIA query above is the same one exposed by the “Open this SIA2 query” link in the viewer.
          </p>
        </Card>

        <Card tone="night" className="p-5 sm:p-8">
          <p className="caps text-[10px] text-violet-light">Worker routes</p>
          <h2 className="display mt-2 text-[clamp(1.8rem,1.3rem+1.4vw,2.7rem)] text-white">No model endpoint</h2>
          <p className="mt-3 text-[14px] leading-relaxed text-night-muted">
            Four real routes serve the viewer. The cutout route validates the host and SPHEREx path before fetching anything, retries
            IRSA’s transient 503s, and returns the FITS bytes unchanged apart from dropping EPSF.
          </p>
          <Code>{ROUTES}</Code>
          <ul className="mt-4 grid gap-2 text-[13px] text-white/80">
            {[
              'Cached default index and cutout are real archive products, marked “cached” in the provenance badge.',
              'IRSA cutout 503s surface as an error with a Retry button, never as a synthetic image.',
              'No database, no user accounts, no uploaded FITS files.',
              'The bundled 3I/ATLAS sample is separate from this live path and is opened only in the local FITS lab.',
            ].map((item) => (
              <li key={item} className="flex gap-2 border-t border-white/10 pt-2">
                <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-violet-light" />
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2">
            {[
              { label: 'IRSA SPHEREx explorer', href: LINKS.explorer },
              { label: 'Gaia archive', href: LINKS.gaia },
              { label: 'IRSA', href: LINKS.irsa },
            ].map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="caps inline-flex items-center gap-1 text-[10px] text-violet-light hov:text-white"
              >
                {link.label} <ExternalLink className="size-3" aria-hidden />
              </a>
            ))}
          </div>
        </Card>
      </section>

      <section className="grid gap-2 lg:grid-cols-[1fr_1.1fr]">
        <Card className="p-5 sm:p-8">
          <p className="caps text-[10px] text-violet">Instrument</p>
          <Title lines={['The band', 'map']} align="left" size="md" className="mt-2" />
          <p className="mt-3 text-[14px] leading-relaxed text-ink-2">
            The six LVF arrays and seventeen channels each are real instrument geometry. A level-2 detector frame is a
            spectral–spatial image, so a small cutout covers a narrow wavelength slice. The wide strip used for spectra covers the
            detector’s real range; it is not a fabricated 102-band cube.
          </p>
          <table className="mt-5 w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-line-strong">
                <th className="caps py-2 text-[9px] text-muted">Array</th>
                <th className="caps py-2 text-[9px] text-muted">Range</th>
                <th className="caps py-2 text-[9px] text-muted">R</th>
                <th className="caps py-2 text-[9px] text-muted">Channels</th>
              </tr>
            </thead>
            <tbody>
              {ARRAYS.map((array) => (
                <tr key={array.id} className="border-b border-line">
                  <td className="py-2 font-medium">{array.short}</td>
                  <td className="py-2 text-ink-2">
                    {array.low.toFixed(2)}–{array.high.toFixed(2)} µm
                  </td>
                  <td className="py-2 tabular-nums text-ink-2">{array.r}</td>
                  <td className="py-2 tabular-nums text-ink-2">17</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="caps mt-4 text-[9px] leading-relaxed text-muted">
            {INSTRUMENT.range} · {INSTRUMENT.pixel}″ pixels · {INSTRUMENT.exposure.toFixed(2)} s exposures
          </p>
        </Card>

        <Card tone="violet" className="p-5 sm:p-8">
          <p className="caps text-[10px] text-white/70">What the spectrum is</p>
          <Title lines={['Real aperture', 'means']} align="left" size="md" className="mt-2 text-white" />
          <div className="mt-4 grid gap-3 text-[14px] leading-relaxed text-white/85">
            <p>
              The Worker fetches real 24 × 2040 pixel detector strips around the target. For each row it averages five spatial pixels
              and reads the central wavelength and bandwidth from the FITS WCS-WAVE table. The chart plots those measured samples.
            </p>
            <p>
              Lines are split by detector product, so gaps are real coverage gaps. Pink points carry at least one real FLAGS bit.
              There is no interpolation across gaps and no synthetic feature tagging.
            </p>
            <p className="text-white/70">
              Click the image to move the target, then press <strong className="font-medium text-white">Extract real spectrum</strong>.
              The source badge on the spectrum remains visible in its top right.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2">
            {[
              { label: 'IRSA SPHEREx', href: LINKS.explorer },
              { label: 'SPHEREx mission', href: LINKS.spherex },
              { label: 'Astropy', href: LINKS.astropy },
              { label: 'Aladin', href: LINKS.aladin },
            ].map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="caps inline-flex items-center gap-1 text-[10px] text-white hov:text-violet-light"
              >
                {link.label} <ExternalLink className="size-3" aria-hidden />
              </a>
            ))}
          </div>
        </Card>
      </section>

      <Card className="p-5 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="caps text-[10px] text-violet">Honesty</p>
            <Title lines={['What is', 'real']} align="left" size="md" className="mt-2" />
          </div>
          <p className="caps max-w-xs text-right text-[9px] leading-relaxed text-muted">
            Real pixels. Stated limits.
          </p>
        </div>
        <div className="mt-5 grid gap-6 text-[14px] leading-relaxed text-ink-2 md:grid-cols-3">
          <p>
            <strong className="font-medium text-ink">Real:</strong> the detector cutouts, IMAGE, VARIANCE, FLAGS, ZODI, WCS-WAVE
            wavelengths, aperture spectra, Gaia DR3 positions and AllWISE positions. The default cache is a real IRSA product and is
            labelled as cached.
          </p>
          <p>
            <strong className="font-medium text-ink">Not claimed:</strong> a full 102-band image cube, astrometric or photometric
            correction beyond level-2, a complete simultaneous spectrum from every array, or uninterrupted IRSA availability.
          </p>
          <p>
            <strong className="font-medium text-ink">Local:</strong> the FITS lab parses a file on your device. It does not upload it,
            and it does not decode Rice-compressed products. The 3I/ATLAS archive scripts and sample remain real mission data.
          </p>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <a href={LINKS.irsa} target="_blank" rel="noreferrer" className="caps inline-flex items-center gap-1 text-[10px] text-violet hov:underline">
              NASA/IPAC IRSA <ExternalLink className="size-3" aria-hidden />
            </a>
            <a href={LINKS.spherex} target="_blank" rel="noreferrer" className="caps inline-flex items-center gap-1 text-[10px] text-violet hov:underline">
              SPHEREx mission <ExternalLink className="size-3" aria-hidden />
            </a>
            <a href={LINKS.astropy} target="_blank" rel="noreferrer" className="caps inline-flex items-center gap-1 text-[10px] text-ink hov:text-violet">
              Astropy <ExternalLink className="size-3" aria-hidden />
            </a>
          </div>
          <ArrowLink to="/#sky" tone="ink" size="sm">
            Back to the sky
          </ArrowLink>
        </div>
        <p className="caps mt-4 text-[9px] text-muted">
          IRSA SPHEREx DR1 · Gaia DR3 · AllWISE · This is not an official NASA or IPAC product.
        </p>
      </Card>

      <Card className="p-5 sm:p-8">
        <p className="caps text-[10px] text-violet">Local ingest</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <h2 className="display text-[clamp(1.8rem,1.3rem+1.4vw,2.7rem)]">From FITS to pixels</h2>
          <ButtonLink to="/#fits" variant="outline">Open the FITS lab</ButtonLink>
        </div>
        <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-ink-2">
          The lab reads a real SPHEREx level-2 product in the browser. The file never leaves the device. The bundled sample keeps every
          extension of an actual 3I/ATLAS frame from IRSA: IMAGE, FLAGS, VARIANCE and ZODI crops, the full 101 × 101 × 121 PSF cube,
          and the 9 × 9 WCS-WAVE grid.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
          {[
            { label: 'curl download script', href: LINKS.cometCurl, download: true },
            { label: 'wget download script', href: LINKS.cometWget, download: true },
            { label: 'IRSA 3I/ATLAS page', href: LINKS.comet, download: false },
          ].map((link) => (
            <a
              key={link.label}
              href={link.href}
              download={link.download || undefined}
              target={link.download ? undefined : '_blank'}
              rel={link.download ? undefined : 'noreferrer'}
              className="caps inline-flex items-center gap-1 text-[10px] text-violet hov:underline"
            >
              {link.label} <ExternalLink className="size-3" aria-hidden />
            </a>
          ))}
        </div>
        <p className="caps mt-4 text-[9px] leading-relaxed text-muted">
          259 calibrated products · 18.55 GB · real sample included · nothing uploaded.
        </p>
      </Card>
    </div>
  )
}
