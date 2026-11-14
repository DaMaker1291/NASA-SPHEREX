import { useId, useState, type SVGProps } from 'react'

import { IMAGES, type HoloKind } from '../data'
import { cx } from '../lib/cx'

const RENDER = {
  knot: IMAGES.holoKnot,
  prism: IMAGES.holoPrism,
} satisfies Record<HoloKind, { src: string }>
const IRI = [
  [0, '#1f0679'],
  [0.16, '#5b14f5'],
  [0.32, '#a68bff'],
  [0.43, '#ffc4ef'],
  [0.5, '#ffffff'],
  [0.58, '#93ebff'],
  [0.72, '#6a2cff'],
  [0.88, '#3a0bb8'],
  [1, '#16044d'],
] as const

function Stops({ stops }: { stops: readonly (readonly [number, string])[] }) {
  return (
    <>
      {stops.map(([o, c]) => (
        <stop key={o} offset={o} stopColor={c} />
      ))}
    </>
  )
}

type Props = { kind: HoloKind; motion?: boolean; priority?: boolean; className?: string } & Omit<SVGProps<SVGSVGElement>, 'children'>

const SHADOW = 'drop-shadow-[0_26px_28px_rgb(60_10_180/0.2)]'
const motionClass = (kind: HoloKind, motion: boolean) =>
  cx(motion && kind === 'knot' && 'animate-[spin-slow_80s_linear_infinite]', motion && kind !== 'knot' && 'animate-float')

export function Holo({ kind, motion = false, priority = false, className, ...rest }: Props) {
  const src: string = RENDER[kind].src
  const [failed, setFailed] = useState(false)
  if (src && !failed) {
    return (
      <span aria-hidden className={cx('block', className)}>
        <img
          src={src}
          alt=""
          width={880}
          height={880}
          draggable={false}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
          decoding="async"
          onError={() => setFailed(true)}
          className={cx('block h-auto w-full select-none', SHADOW, motionClass(kind, motion))}
        />
      </span>
    )
  }
  return <HoloSvg kind={kind} motion={motion} className={className} {...rest} />
}

export function HoloSvg({ kind, motion = false, className, ...rest }: Omit<Props, 'priority'>) {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, '')
  const id = (s: string) => `${raw}-${s}`
  const url = (s: string) => `url(#${id(s)})`
  return (
    <svg
      viewBox="0 0 600 600"
      aria-hidden
      focusable="false"
      className={cx('block overflow-visible', SHADOW, className)}
      {...rest}
    >
      <defs>
        <linearGradient id={id('iri')} x1="0" y1="0" x2="1" y2="1">
          <Stops stops={IRI} />
        </linearGradient>
        <linearGradient id={id('iri2')} x1="1" y1="0" x2="0" y2="1">
          <Stops stops={IRI} />
        </linearGradient>
        <linearGradient id={id('iri3')} x1="0" y1="1" x2="1" y2="0">
          <Stops stops={IRI} />
        </linearGradient>
        <linearGradient id={id('shade')} x1="1" y1="0" x2="0" y2="0.6">
          <stop offset="0" stopColor="#0a0230" stopOpacity="0" />
          <stop offset="0.3" stopColor="#0a0230" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#0a0230" stopOpacity="0" />
          <stop offset="0.78" stopColor="#0a0230" stopOpacity="0.5" />
          <stop offset="1" stopColor="#0a0230" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={id('edge')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a0db8" />
          <stop offset="1" stopColor="#0e0333" />
        </linearGradient>
        <filter id={id('soft')} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
      </defs>
      <g
        className={cx('origin-center [transform-box:fill-box]', motionClass(kind, motion))}
      >
        {kind === 'knot' ? <Knot url={url} /> : <Prism url={url} />}
      </g>
    </svg>
  )
}

type Draw = { url: (s: string) => string }

function Tube({ rx, ry, rotate, grad, url, width = 30 }: Draw & { rx: number; ry: number; rotate: number; grad: string; width?: number }) {
  return (
    <g transform={`rotate(${rotate} 300 300)`}>
      <ellipse cx="300" cy="300" rx={rx} ry={ry} fill="none" stroke="#16044d" strokeOpacity="0.9" strokeWidth={width + 4} />
      <ellipse cx="300" cy="300" rx={rx} ry={ry} fill="none" stroke={url(grad)} strokeWidth={width} />
      <ellipse cx="300" cy="300" rx={rx + width * 0.2} ry={ry + width * 0.2} fill="none" stroke={url('shade')} strokeWidth={width * 0.55} />
      <ellipse cx="300" cy="300" rx={rx - width * 0.2} ry={ry - width * 0.16} fill="none" stroke="#fff" strokeOpacity="0.9" strokeWidth={width * 0.12} filter={url('soft')} />
      <ellipse cx="300" cy="300" rx={rx + width * 0.28} ry={ry + width * 0.26} fill="none" stroke="#ffd3f3" strokeOpacity="0.35" strokeWidth={width * 0.08} filter={url('soft')} />
    </g>
  )
}

function Knot({ url }: Draw) {
  return (
    <>
      <Tube url={url} rx={252} ry={70} rotate={-36} grad="iri2" width={38} />
      <Tube url={url} rx={240} ry={60} rotate={4} grad="iri3" width={32} />
      <Tube url={url} rx={256} ry={76} rotate={34} grad="iri" width={38} />
      <Tube url={url} rx={236} ry={90} rotate={92} grad="iri" width={42} />
    </>
  )
}

function Prism({ url }: Draw) {
  return (
    <>
      <path d="M300 60 L 520 470 L 300 540 Z" fill={url('iri')} stroke={url('edge')} strokeWidth="5" strokeLinejoin="round" />
      <path d="M300 60 L 80 470 L 300 540 Z" fill={url('iri2')} stroke={url('edge')} strokeWidth="5" strokeLinejoin="round" />
      <path d="M300 70 L 300 530" stroke="#fff" strokeWidth="5" opacity="0.85" filter={url('soft')} />
      <path d="M110 462 L 296 70" stroke="#fff" strokeWidth="3" opacity="0.5" filter={url('soft')} />
    </>
  )
}
