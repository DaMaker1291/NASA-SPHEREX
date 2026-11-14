import { ARRAYS, BANDS, bandColor, bandsForArray, describeBands } from '../lib/spherex'
import { cx } from '../lib/cx'

type Props = {
  bandIds: number[]
  onToggleBand: (id: number) => void
  onToggleArray: (id: number) => void
  onPreset: (preset: 'all' | 'rainbow' | 'reset') => void
}

const short = (id: number) => BANDS.find((b) => b.id === id)?.lambda ?? 0

export function BandExplorer({ bandIds, onToggleBand, onToggleArray, onPreset }: Props) {
  const selected = new Set(bandIds)
  return (
    <div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
        {ARRAYS.map((array) => {
          const channels = bandsForArray(array.id)
          const count = channels.filter((b) => selected.has(b.id)).length
          const full = count === channels.length
          return (
            <div key={array.id}>
              <button
                type="button"
                onClick={() => onToggleArray(array.id)}
                aria-pressed={full}
                className="group flex w-full items-baseline justify-between gap-2 text-left"
              >
                <span className={cx('display text-2xl leading-none transition-colors', count ? 'text-white' : 'text-white/45 group-hover:text-white')}>
                  {array.short}
                </span>
                <span className={cx('caps text-[9px] tabular-nums', count ? 'text-violet-light' : 'text-white/35')}>
                  {count}/17
                </span>
              </button>
              <p className="caps mt-1 text-[9px] tracking-[0.01em] text-white/35">
                {array.low.toFixed(2)}–{array.high.toFixed(2)} µm
              </p>
              <div className="mt-2.5 flex h-20 items-end gap-[2px]" role="group" aria-label={`${array.label} channels`}>
                {channels.map((band) => {
                  const on = selected.has(band.id)
                  return (
                    <button
                      key={band.id}
                      type="button"
                      onClick={() => onToggleBand(band.id)}
                      aria-pressed={on}
                      aria-label={`${array.short} channel ${band.channel}, ${band.lambda.toFixed(2)} micrometres`}
                      title={`${array.short} · channel ${band.channel} · ${band.lambda.toFixed(2)} µm — click to ${on ? 'drop' : 'add'}`}
                      className={cx(
                        'round min-w-0 flex-1 rounded-[3px] transition-[height,opacity,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-out-soft)]',
                        on ? 'opacity-100' : 'opacity-35 hover:opacity-70',
                      )}
                      style={{
                        height: on ? '100%' : '58%',
                        background: bandColor(band.lambda),
                        boxShadow: on ? '0 0 0 1px rgba(255,255,255,0.55), 0 6px 18px -6px rgb(91 20 245 / 0.9)' : undefined,
                      }}
                    />
                  )
                })}
              </div>
              <div aria-hidden className="mt-1.5 h-px w-full bg-gradient-to-r from-white/25 to-transparent" />
            </div>
          )
        })}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
        <p className="caps text-[10px] text-white/55">
          Selected: <span className="text-white">{describeBands(bandIds)}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Quick onClick={() => onPreset('all')}>All 102 bands</Quick>
          <Quick onClick={() => onPreset('rainbow')}>Rainbow stack</Quick>
          <Quick onClick={() => onPreset('reset')}>Single channel</Quick>
        </div>
      </div>
      <p className="caps mt-3 text-[9px] leading-relaxed text-white/35">
        Click a bar to toggle one channel. Click an array name to stack all 17 of its channels — the wider stack buys signal-to-noise
        but blends wavelengths. Effective wavelength of this stack: {bandIds.length ? (bandIds.reduce((s, id) => s + short(id), 0) / bandIds.length).toFixed(2) : '—'} µm.
      </p>
    </div>
  )
}

function Quick({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="round inline-flex h-9 items-center rounded-full border border-white/18 px-3.5 text-[12px] font-medium text-white/85 transition-colors duration-[var(--duration-fast)] hover:border-white/45 hover:bg-white/8 hover:text-white"
    >
      {children}
    </button>
  )
}
