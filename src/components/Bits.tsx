import { ArrowUpRight } from 'lucide-react'
import { animate, useInView, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'

import { cx } from '../lib/cx'

export function ArrowLink({
  className,
  tone = 'violet',
  size = 'md',
  children,
  ...rest
}: LinkProps & { tone?: 'violet' | 'ink' | 'light'; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <Link
      className={cx(
        'group inline-flex min-h-10 items-center gap-1.5 font-medium uppercase tracking-[-0.02em] transition-colors duration-[var(--duration-fast)]',
        size === 'sm' && 'text-sm',
        size === 'md' && 'text-[clamp(1.1rem,0.9rem+0.6vw,1.6rem)]',
        size === 'lg' && 'text-[clamp(1.4rem,1rem+1.2vw,2.25rem)]',
        tone === 'violet' && 'text-violet hov:text-violet-deep',
        tone === 'ink' && 'text-ink hov:text-violet',
        tone === 'light' && 'on-dark text-white hov:text-violet-light',
        className,
      )}
      {...rest}
    >
      {children}
      <ArrowUpRight
        className="size-[1.15em] shrink-0 transition-transform duration-[var(--duration-base)] ease-[var(--ease-out-soft)] group-hov:translate-x-0.5 group-hov:-translate-y-0.5"
        strokeWidth={1.6}
        aria-hidden
      />
    </Link>
  )
}

export function CountUp({ value, prefix = '', suffix = '' }: { value: number; prefix?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const seen = useInView(ref, { once: true })
  const reduce = useReducedMotion()
  const [count, setCount] = useState(reduce ? value : 0)

  useEffect(() => {
    if (!seen) return
    if (reduce) {
      setCount(value)
      return
    }
    const controls = animate(0, value, {
      duration: 1.6,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (next) => setCount(Math.round(next)),
    })
    return () => controls.stop()
  }, [seen, value, reduce])

  return (
    <span ref={ref} className="tabular-nums">
      {prefix}
      {count}
      {suffix}
    </span>
  )
}

export function Stat({
  value,
  label,
  align = 'center',
  tone = 'ink',
}: {
  value: number
  label: string[]
  align?: 'center' | 'left'
  tone?: 'ink' | 'light'
}) {
  return (
    <div className={cx('flex flex-col', align === 'center' ? 'items-center text-center' : 'items-start text-left')}>
      <p className="flex items-start text-[clamp(2rem,1.4rem+1.6vw,3rem)] leading-none font-normal tracking-[-0.05em]">
        <span
          className={cx('mt-[0.08em] mr-0.5 text-[0.45em] leading-none', tone === 'ink' ? 'text-violet' : 'text-violet-light')}
          aria-hidden
        >
          +
        </span>
        <span className="sr-only">More than </span>
        <CountUp value={value} />
      </p>
      <p className={cx('caps mt-2', tone === 'light' && 'text-night-muted')}>
        {label.map((line, index) => (
          <span key={line} className="block">
            {line}
            {index < label.length - 1 && <span className="sr-only"> </span>}
          </span>
        ))}
      </p>
    </div>
  )
}

export function Title({
  lines,
  as: Tag = 'h2',
  align = 'right',
  size = 'md',
  className,
  id,
}: {
  lines: string[]
  as?: 'h1' | 'h2' | 'h3' | 'p'
  align?: 'left' | 'right'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  id?: string
}) {
  return (
    <Tag
      id={id}
      className={cx(
        'display',
        align === 'right' ? 'text-right' : 'text-left',
        size === 'sm' && 'text-[clamp(1.5rem,1.1rem+1.2vw,2.25rem)] leading-[0.95]',
        size === 'md' && 'text-[clamp(2rem,1.2rem+2.4vw,3.25rem)] leading-[0.92] tracking-[-0.05em]',
        size === 'lg' && 'text-[clamp(2.8rem,1.4rem+4.6vw,6.5rem)]',
        size === 'xl' && 'text-[clamp(3.4rem,0.6rem+9.6vw,10.5rem)] tracking-[-0.06em]',
        className,
      )}
    >
      {lines.map((line) => (
        <span key={line} className="block">
          {line}
        </span>
      ))}
    </Tag>
  )
}

type BadgeTone = 'neutral' | 'violet' | 'outline' | 'success' | 'light'

export function Badge({ tone = 'neutral', children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        'round inline-flex h-7 items-center rounded-full px-3 text-[12px] font-medium whitespace-nowrap',
        tone === 'neutral' && 'bg-soft text-ink',
        tone === 'violet' && 'bg-violet-soft text-violet-deep',
        tone === 'outline' && 'border border-line-strong text-ink',
        tone === 'success' && 'bg-success/10 text-success',
        tone === 'light' && 'bg-white/14 text-white',
        className,
      )}
    >
      {children}
    </span>
  )
}
