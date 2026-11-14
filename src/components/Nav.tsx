import { ArrowUpRight } from 'lucide-react'
import type { MouseEvent, ReactNode } from 'react'
import { Link, useLocation } from 'react-router'

import { NAV, SITE } from '../data'
import { cx } from '../lib/cx'

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
        <circle cx="16" cy="16" r="13" fill="none" stroke={light ? '#fff' : 'var(--color-violet)'} strokeWidth="2.4" />
        <circle cx="16" cy="16" r="6.5" fill={light ? '#fff' : 'var(--color-violet)'} />
        <circle cx="25" cy="7" r="2.2" fill={light ? '#fff' : 'var(--color-violet)'} />
      </svg>
      <span className="text-lg font-semibold tracking-[-0.04em]">{SITE.name}</span>
    </span>
  )
}

export function SectionLink({
  to,
  className,
  children,
  'aria-current': ariaCurrent,
}: {
  to: string
  className?: string
  children: ReactNode
  'aria-current'?: 'page'
}) {
  const { pathname } = useLocation()
  const hash = to.startsWith('/#') ? to.slice(2) : ''
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!hash || pathname !== '/') return
    event.preventDefault()
    document.getElementById(hash)?.scrollIntoView({ behavior: 'instant', block: 'start' })
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${hash}`)
  }
  return (
    <Link to={to} className={className} onClick={onClick} aria-current={ariaCurrent}>
      {children}
    </Link>
  )
}

export function Nav() {
  const { pathname, hash } = useLocation()
  const isActive = (to: string) => (to.startsWith('/#') ? pathname === '/' && hash === to.slice(1) : pathname === to)
  return (
    <header className="relative z-10 flex h-14 items-center justify-between gap-4">
      <Link to="/" aria-label={`${SITE.name} home`} className="round -m-1 rounded-full p-1">
        <Logo />
      </Link>
      <nav aria-label="Main" className="hidden md:block">
        <ul className="flex items-center gap-[clamp(1.5rem,1rem+2.6vw,4rem)]">
          {NAV.map((item) => {
            const active = isActive(item.to)
            return (
              <li key={item.to}>
                <SectionLink
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'caps relative inline-flex min-h-10 items-center text-[12px] transition-colors',
                    'after:absolute after:inset-x-0 after:bottom-2 after:h-px after:origin-left after:scale-x-0 after:bg-current after:transition-transform after:duration-[var(--duration-base)] hov:after:scale-x-100',
                    active ? 'text-violet after:scale-x-100' : 'text-ink',
                  )}
                >
                  {item.label}
                </SectionLink>
              </li>
            )
          })}
        </ul>
      </nav>
      <Link
        to="/guide"
        className="caps round inline-flex h-10 items-center gap-1.5 rounded-full border border-line-strong px-4 text-[11px] transition-colors hov:border-ink md:hidden"
      >
        Guide <ArrowUpRight className="size-3.5" aria-hidden />
      </Link>
      <span className="caps hidden text-[10px] text-muted md:inline-flex">IRSA · DR1</span>
    </header>
  )
}
