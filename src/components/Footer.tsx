import { ArrowUpRight } from 'lucide-react'

import { LINKS, NAV, SITE } from '../data'
import { Card } from './Card'
import { Logo, SectionLink } from './Nav'

const RESOURCES = [
  { label: 'IRSA SPHEREx archive', href: LINKS.irsa },
  { label: 'SPHEREx data explorer', href: LINKS.explorer },
  { label: 'Quick-release supplement', href: LINKS.supplement },
  { label: 'Comet 3I/ATLAS cutouts', href: LINKS.comet },
  { label: 'WISEView', href: LINKS.wise },
  { label: 'Gaia archive', href: LINKS.gaia },
  { label: 'Aladin (CDS)', href: LINKS.aladin },
  { label: 'Astropy', href: LINKS.astropy },
]

export function Footer() {
  return (
    <footer className="px-2 pb-2">
      <Card tone="night" className="px-5 pt-10 pb-6 sm:px-8 sm:pt-14">
        <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr_1fr]">
          <div className="max-w-sm">
            <Logo light />
            <p className="mt-4 text-night-muted">
              A real picture house for infrared light. IRSA SPHEREx cutouts, physical FITS planes, live Gaia and AllWISE overlays, and a
              spectrum read from the pixels. Open a real FITS file locally too.
            </p>
            <p className="caps mt-6 text-[10px] text-white/45">0.744–5.002 µm · 6.15″ pixels · 6 arrays × 17 channels</p>
          </div>
          <nav aria-label="Footer">
            <p className="caps mb-3 text-night-muted">Explore</p>
            <ul>
              {NAV.map((item) => (
                <li key={item.to}>
                  <SectionLink to={item.to} className="inline-flex min-h-10 items-center text-white transition-colors hov:text-violet-light">
                    {item.label}
                  </SectionLink>
                </li>
              ))}
              <li>
                <a href="#top" className="inline-flex min-h-10 items-center text-white transition-colors hov:text-violet-light">
                  Back to top
                </a>
              </li>
            </ul>
          </nav>
          <div>
            <p className="caps mb-3 text-night-muted">Data & tools</p>
            <ul className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-1">
              {RESOURCES.map((r) => (
                <li key={r.label}>
                  <a
                    href={r.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-9 items-center gap-1 text-[14px] text-white transition-colors hov:text-violet-light"
                  >
                    {r.label}
                    <ArrowUpRight className="size-3.5 opacity-50" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p aria-hidden className="display mt-16 -mb-[0.12em] text-center text-[clamp(4.5rem,-0.5rem+19.4vw,21rem)] leading-[0.8] tracking-[-0.07em] text-white select-none">
          Drift
        </p>

        <div className="mt-6 flex flex-col items-start justify-between gap-3 border-t border-white/12 pt-5 text-[12px] text-night-muted sm:flex-row sm:items-center">
          <p>
            Real IRSA SPHEREx cutouts and catalogue queries, plus a local real-FITS reader. Not a mission product. Mission data:{' '}
            <a href={LINKS.irsa} target="_blank" rel="noreferrer" className="text-white underline-offset-4 hov:underline">
              NASA/IPAC IRSA
            </a>
            .
          </p>
          <p className="caps text-[10px]">
            {SITE.name} · {SITE.tagline}
          </p>
        </div>
      </Card>
    </footer>
  )
}
