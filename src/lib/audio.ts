import type { Spectrum } from './spherex'

export type SpectrumVoice = { stop: () => void }

const silence = (done: () => void): SpectrumVoice => {
  done()
  return { stop: () => {} }
}

export function sonifySpectrum(
  spectrum: Spectrum,
  onStep: (index: number) => void,
  onDone: () => void,
): SpectrumVoice {
  if (typeof window === 'undefined') return silence(onDone)

  const AudioContextClass =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextClass) return silence(onDone)

  let ctx: AudioContext
  try {
    ctx = new AudioContextClass()
  } catch {
    return silence(onDone)
  }

  void ctx.resume()

  const master = ctx.createGain()
  master.gain.value = 0.28
  master.connect(ctx.destination)

  const step = 0.055
  const start = ctx.currentTime + 0.08
  const nodes: OscillatorNode[] = []
  const timers: number[] = []
  let closed = false

  spectrum.points.forEach((point, index) => {
    const at = start + index * step
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    const pan = ctx.createStereoPanner()
    const pitch = 880 * (220 / 880) ** ((point.band.lambda - 0.744) / (5.002 - 0.744))

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(pitch, at)

    const amplitude = 0.025 + Math.min(1, point.flux) * 0.11
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(amplitude, at + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + step * 0.96)

    pan.pan.value = -0.75 + 1.5 * (index / Math.max(1, spectrum.points.length - 1))
    oscillator.connect(gain)
    gain.connect(pan)
    pan.connect(master)
    oscillator.start(at)
    oscillator.stop(at + step)
    nodes.push(oscillator)

    timers.push(
      window.setTimeout(() => {
        if (!closed) onStep(index)
      }, (at - ctx.currentTime) * 1000),
    )
  })

  const endAt = (start - ctx.currentTime + spectrum.points.length * step + 0.2) * 1000
  const doneTimer = window.setTimeout(() => {
    if (closed) return
    closed = true
    onDone()
    window.setTimeout(() => {
      void ctx.close().catch(() => {})
    }, 250)
  }, endAt)

  return {
    stop: () => {
      if (closed) return
      closed = true
      window.clearTimeout(doneTimer)
      timers.forEach((timer) => window.clearTimeout(timer))
      nodes.forEach((oscillator) => {
        try {
          oscillator.stop()
        } catch {}
      })
      void ctx.close().catch(() => {})
    },
  }
}
