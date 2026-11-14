import { ArrowDown } from 'lucide-react'
import { motion } from 'motion/react'

import { INSTRUMENT } from '../lib/spherex'
import { Stat } from './Bits'
import { ButtonLink, buttonClass } from './Button'
import { Holo } from './Holo'
import { Nav } from './Nav'

const EASE = [0.22, 1, 0.36, 1] as const
const FACTS = [
  `${INSTRUMENT.bands} bands`,
  `${INSTRUMENT.arrays} arrays × ${INSTRUMENT.channels} channels`,
  INSTRUMENT.range,
  `${INSTRUMENT.pixel}″ pixels`,
  `${INSTRUMENT.exposure.toFixed(1)} s exposures`,
  INSTRUMENT.fov,
  'IRSA DR1',
  'real FITS cutouts',
]

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden rounded-[var(--radius-card)] bg-card px-5 pt-3 pb-5 sm:px-8">
      <Nav />
      <div className="relative flex flex-col lg:block lg:h-[clamp(620px,calc(100svh_-_240px),740px)]">
        <div className="order-1 mt-7 grid grid-cols-3 gap-3 sm:mt-9 lg:absolute lg:top-[3%] lg:right-0 lg:mt-0 lg:flex lg:gap-[clamp(1.5rem,1rem+1.8vw,3rem)]">
          <Stat value={102} label={['infrared', 'bands']} />
          <Stat value={6} label={['detector', 'arrays']} />
          <Stat value={4} label={['real FITS', 'planes']} />
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.92, rotate: -7 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ duration: 1.4, ease: EASE }}
          className="order-2 mx-auto -my-2 mt-6 w-[min(86vw,380px)] lg:absolute lg:top-[2%] lg:left-[7%] lg:m-0 lg:w-[min(36vw,calc(90svh_-_288px),520px)]"
        >
          <Holo kind="knot" motion priority />
        </motion.div>

        <div className="relative z-20 order-3 mt-6 lg:absolute lg:bottom-[2%] lg:left-[0%] lg:mt-0 lg:w-[clamp(180px,14vw,220px)]">
          <p className="caps mb-3 max-w-[14rem] text-[10px] leading-[1.3] text-muted">
            Real SPHEREx detector pixels. IRSA SIA2 finds the frame; IRSA serves the cutout; WCS-WAVE names every wavelength.
          </p>
          <div className="hidden rounded-[var(--radius-card-sm)] border border-line bg-soft p-3 lg:block">
            <p className="caps text-[8px] text-violet">Live source</p>
            <p className="mt-1 text-[12px] leading-snug text-ink">IRSA SIA2 → SPHEREx DR1 → FITS cutout</p>
            <p className="caps mt-2 text-[8px] leading-relaxed text-muted">No model cube. No seeded stars. The source label stays on the frame.</p>
          </div>
        </div>

        <div className="relative z-10 order-4 mt-7 flex flex-col items-start gap-5 lg:absolute lg:right-0 lg:bottom-0 lg:mt-0 lg:items-end lg:text-right">
          <p className="caps text-[10px] text-violet">SPHEREx picture house · IRSA DR1</p>
          <h1
            id="hero-title"
            className="display text-left text-[clamp(3.2rem,15.5vw,5.6rem)] sm:text-[clamp(4rem,12vw,7.4rem)] lg:text-right lg:text-[min(8.4vw,14svh,8.4rem)]"
          >
            {['Read', 'the real', 'sky'].map((line, i) => (
              <span key={line} className="block overflow-hidden pb-[0.04em]">
                <motion.span
                  className="block"
                  initial={{ y: '105%' }}
                  animate={{ y: 0 }}
                  transition={{ duration: 1.05, delay: 0.12 + i * 0.11, ease: EASE }}
                >
                  {line}
                </motion.span>
              </span>
            ))}
          </h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.55, ease: EASE }}
            className="max-w-md text-[15px] leading-relaxed text-pretty text-muted lg:max-w-sm"
          >
            Real SPHEREx cutouts from IRSA. Scrub actual visits, switch physical FITS planes, overlay real Gaia and WISE catalogues, and
            extract a spectrum from the pixels.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.68, ease: EASE }}
            className="flex flex-wrap items-center gap-2"
          >
            <a href="#sky" className={buttonClass('violet', 'md')}>
              Open the viewer <ArrowDown className="size-4" aria-hidden />
            </a>
            <ButtonLink to="/guide" variant="outline" size="md">
              How it works
            </ButtonLink>
            <a
              href="#fits"
              onClick={(event) => {
                event.preventDefault()
                document.getElementById('fits')?.scrollIntoView({ behavior: 'instant', block: 'start' })
                window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#fits`)
              }}
              className={buttonClass('outline', 'md')}
            >
              Open real FITS
            </a>
          </motion.div>
        </div>
      </div>

      <div className="marquee-mask mt-6 overflow-hidden border-t border-line pt-3">
        <div className="flex w-max animate-marquee">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex shrink-0 items-center" aria-hidden={copy === 1}>
              {FACTS.map((fact) => (
                <span key={fact} className="caps mr-6 flex items-center gap-2 text-[9px] whitespace-nowrap text-muted">
                  <span aria-hidden className="size-1 rounded-full bg-violet/70" />
                  {fact}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
