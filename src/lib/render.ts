import {
  coordinateAt,
  formatDec,
  formatRA,
  hash,
  moverAt,
  mulberry32,
  type Field,
  type Point,
  type Scene,
  type Star,
} from './spherex'

export type Layers = { gaia: boolean; wise: boolean; grid: boolean }
export type ViewMode = 'single' | 'difference' | 'coadd'

export type SkyRequest = {
  scene: Scene
  field: Field
  epoch: number
  compare: number
  lambda: number
  bandCount: number
  layers: Layers
  mode: ViewMode
  size: number
  hint: Point | null
  reveal: Point | null
  probe: Point | null
}

const TINTS = ['#cbbcff', '#f0eaff', '#ffffff', '#a9efff', '#ffb2e7']
const SPRITES = new Map<string, HTMLCanvasElement>()
const TILES = new Map<string, HTMLCanvasElement>()

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))
const rgba = (hex: string, alpha: number) => {
  const value = Number.parseInt(hex.slice(1), 16)
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`
}

function sprite(name: string, color: string, stops: Array<[number, string]>) {
  const key = `${name}:${color}`
  const cached = SPRITES.get(key)
  if (cached) return cached

  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  for (const [offset, stop] of stops) gradient.addColorStop(offset, stop)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 64, 64)
  SPRITES.set(key, canvas)
  return canvas
}

const glowSprite = (color: string) =>
  sprite('glow', color, [
    [0, 'rgba(255, 255, 255, 1)'],
    [0.14, rgba(color, 0.96)],
    [0.34, rgba(color, 0.4)],
    [0.62, rgba(color, 0.12)],
    [1, rgba(color, 0)],
  ])

const softSprite = (color: string) =>
  sprite('soft', color, [
    [0, rgba(color, 0.82)],
    [0.4, rgba(color, 0.3)],
    [1, rgba(color, 0)],
  ])

function noiseTile(seed: number) {
  const key = String(seed)
  const cached = TILES.get(key)
  if (cached) return cached

  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 160
  const ctx = canvas.getContext('2d')!
  const image = ctx.createImageData(160, 160)
  const random = mulberry32(seed)
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i] = 235
    image.data[i + 1] = 226
    image.data[i + 2] = 255
    image.data[i + 3] = random() ** 4.2 * 255
  }
  ctx.putImageData(image, 0, 0)
  TILES.set(key, canvas)
  return canvas
}

const starSignal = (star: Star, lambda: number) => star.flux * (lambda / 1.6) ** (-1.25 + 2.3 * star.temp)

function paintBackground(ctx: CanvasRenderingContext2D, size: number, lambda: number) {
  ctx.fillStyle = '#04030a'
  ctx.fillRect(0, 0, size, size)
  const warm = clamp((lambda - 1.4) / 3.4, 0, 1)

  const violet = ctx.createRadialGradient(size * 0.18, size * 0.12, 0, size * 0.18, size * 0.12, size * 0.85)
  violet.addColorStop(0, `rgba(91, 20, 245, ${0.2 + warm * 0.05})`)
  violet.addColorStop(0.45, 'rgba(45, 8, 130, 0.09)')
  violet.addColorStop(1, 'rgba(4, 3, 10, 0)')
  ctx.fillStyle = violet
  ctx.fillRect(0, 0, size, size)

  const cyan = ctx.createRadialGradient(size * 0.86, size * 0.82, 0, size * 0.86, size * 0.82, size * 0.72)
  cyan.addColorStop(0, `rgba(116, 227, 255, ${0.06 + warm * 0.02})`)
  cyan.addColorStop(1, 'rgba(4, 3, 10, 0)')
  ctx.fillStyle = cyan
  ctx.fillRect(0, 0, size, size)

  const pink = ctx.createRadialGradient(size * 0.62, size * 0.28, 0, size * 0.62, size * 0.28, size * 0.55)
  pink.addColorStop(0, `rgba(255, 138, 216, ${0.035 + warm * 0.02})`)
  pink.addColorStop(1, 'rgba(4, 3, 10, 0)')
  ctx.fillStyle = pink
  ctx.fillRect(0, 0, size, size)
}

function paintStars(ctx: CanvasRenderingContext2D, scene: Scene, lambda: number, size: number) {
  const psf = size * 0.0031
  ctx.globalCompositeOperation = 'lighter'

  for (const star of scene.stars) {
    const x = (star.x + 0.5) * size
    const y = (star.y + 0.5) * size
    if (x < -24 || y < -24 || x > size + 24 || y > size + 24) continue

    const signal = starSignal(star, lambda)
    if (signal < 0.02) continue

    const brightness = Math.min(1.7, signal)
    const radius = psf * (1.15 + Math.sqrt(brightness) * 2.7)
    const tint = TINTS[Math.min(TINTS.length - 1, Math.floor(star.temp * TINTS.length))]
    ctx.globalAlpha = clamp(0.24 + brightness * 0.5, 0.22, 1)
    ctx.drawImage(glowSprite(tint), x - radius * 3, y - radius * 3, radius * 6, radius * 6)
  }

  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
}

function paintGalaxies(ctx: CanvasRenderingContext2D, scene: Scene, lambda: number, size: number) {
  ctx.globalCompositeOperation = 'lighter'

  for (const galaxy of scene.galaxies) {
    const x = (galaxy.x + 0.5) * size
    const y = (galaxy.y + 0.5) * size
    const radius = size * galaxy.size
    const signal = galaxy.flux * (lambda / 1.6) ** -0.5
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(galaxy.pa)
    ctx.scale(1, galaxy.ratio)
    ctx.globalAlpha = clamp(0.16 + signal * 0.4, 0.1, 0.6)
    ctx.drawImage(softSprite('#b9a2ff'), -radius * 2.2, -radius * 2.2, radius * 4.4, radius * 4.4)
    ctx.restore()
  }

  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
}

function paintContamination(ctx: CanvasRenderingContext2D, scene: Scene, epoch: number, size: number) {
  const flags = scene.epochs[epoch]?.flags ?? []
  if (!flags.length) return

  if (flags.includes('stray')) {
    const gradient = ctx.createLinearGradient(0, 0, size * 0.72, size)
    gradient.addColorStop(0, 'rgba(255, 196, 239, 0.17)')
    gradient.addColorStop(0.5, 'rgba(255, 196, 239, 0.05)')
    gradient.addColorStop(1, 'rgba(255, 196, 239, 0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size, size)
  }

  if (flags.includes('ghost')) {
    const gradient = ctx.createRadialGradient(size * 0.73, size * 0.3, size * 0.02, size * 0.73, size * 0.3, size * 0.26)
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0)')
    gradient.addColorStop(0.72, 'rgba(203, 188, 255, 0.12)')
    gradient.addColorStop(1, 'rgba(203, 188, 255, 0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size, size)
  }

  if (flags.includes('cosmic')) {
    const random = mulberry32(hash(`${scene.seed}|cr|${epoch}`))
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < 3; i++) {
      const x = random() * size
      const y = random() * size
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + 4 + random() * 9, y + 2 + random() * 4)
      ctx.stroke()
    }
    ctx.globalCompositeOperation = 'source-over'
  }

  if (flags.includes('saturated')) {
    const gradient = ctx.createRadialGradient(size * 0.3, size * 0.68, 0, size * 0.3, size * 0.68, size * 0.13)
    gradient.addColorStop(0, 'rgba(255, 179, 230, 0.55)')
    gradient.addColorStop(0.35, 'rgba(255, 138, 216, 0.16)')
    gradient.addColorStop(1, 'rgba(255, 138, 216, 0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size, size)
  }
}

function paintMovers(ctx: CanvasRenderingContext2D, scene: Scene, epoch: number, lambda: number, size: number) {
  for (const mover of scene.movers) {
    const position = moverAt(mover, epoch)
    if (!position) continue

    const x = (position.x + 0.5) * size
    const y = (position.y + 0.5) * size
    if (x < -60 || y < -60 || x > size + 60 || y > size + 60) continue

    const signal = mover.flux * (lambda / 1.6) ** (-0.9 + 2 * mover.temp)
    const radius = size * 0.0048 * (1 + Math.sqrt(Math.min(2, signal)) * 1.6)
    ctx.globalCompositeOperation = 'lighter'

    if (mover.tail) {
      const length = Math.hypot(mover.vx, mover.vy) || 1
      const ux = mover.vx / length
      const uy = mover.vy / length
      for (let k = 1; k <= 6; k++) {
        const tx = x - ux * k * size * 0.011
        const ty = y - uy * k * size * 0.011
        ctx.globalAlpha = 0.14 * (1 - k / 7)
        ctx.drawImage(softSprite('#74e3ff'), tx - radius * 2.4, ty - radius * 2.4, radius * 4.8, radius * 4.8)
      }
    }

    ctx.globalAlpha = clamp(0.35 + signal * 0.55, 0.3, 1)
    ctx.drawImage(glowSprite('#ffb2e7'), x - radius * 4, y - radius * 4, radius * 8, radius * 8)
    ctx.globalAlpha = clamp(0.5 + signal * 0.5, 0.4, 1)
    ctx.drawImage(glowSprite('#ffffff'), x - radius * 1.9, y - radius * 1.9, radius * 3.8, radius * 3.8)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }
}

function paintNoise(ctx: CanvasRenderingContext2D, scene: Scene, epoch: number, size: number, bandCount: number) {
  const alpha = clamp(0.3 / Math.sqrt(1 + (bandCount - 1) * 0.35), 0.055, 0.3)
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = alpha
  ctx.drawImage(noiseTile(hash(`${scene.seed}|${epoch}`)), 0, 0, size, size)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
}

function paintSky(ctx: CanvasRenderingContext2D, request: SkyRequest, epoch: number, noise: boolean, stack = false) {
  const { size, scene, lambda, bandCount } = request
  paintBackground(ctx, size, lambda)
  paintGalaxies(ctx, scene, lambda, size)
  paintStars(ctx, scene, lambda, size)
  paintContamination(ctx, scene, epoch, size)

  if (stack) {
    for (let visit = 0; visit < scene.epochs.length; visit++) paintMovers(ctx, scene, visit, lambda, size)
  } else {
    paintMovers(ctx, scene, epoch, lambda, size)
  }

  if (noise) paintNoise(ctx, scene, epoch, size, bandCount * (stack ? scene.epochs.length : 1))
}

function paintGrid(ctx: CanvasRenderingContext2D, request: SkyRequest) {
  const { size, field } = request
  const font = `${Math.max(9, Math.round(size * 0.0145))}px 'Inter Tight', system-ui, sans-serif`

  ctx.save()
  ctx.strokeStyle = 'rgba(185, 162, 255, 0.22)'
  ctx.setLineDash([3, 5])
  ctx.lineWidth = 1
  ctx.font = font
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)'

  for (let i = 1; i < 5; i++) {
    const fraction = i / 5
    ctx.beginPath()
    ctx.moveTo(fraction * size, 0)
    ctx.lineTo(fraction * size, size)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, fraction * size)
    ctx.lineTo(size, fraction * size)
    ctx.stroke()

    const top = coordinateAt(field, { x: fraction - 0.5, y: -0.5 })
    ctx.fillText(formatRA(top.ra), fraction * size + 4, size * 0.035)
    const left = coordinateAt(field, { x: -0.5, y: fraction - 0.5 })
    ctx.fillText(formatDec(left.dec), 4, fraction * size - 5)
  }

  ctx.restore()
}

function paintGaia(ctx: CanvasRenderingContext2D, request: SkyRequest) {
  const { size, scene } = request
  const font = `${Math.max(9, Math.round(size * 0.0145))}px 'Inter Tight', system-ui, sans-serif`
  const catalog = scene.stars.filter((_, i) => i % 9 === 0).slice(0, 26)

  ctx.save()
  ctx.strokeStyle = 'rgba(185, 162, 255, 0.8)'
  ctx.fillStyle = 'rgba(185, 162, 255, 0.8)'
  ctx.lineWidth = 1

  for (const star of catalog) {
    const x = (star.x + 0.5) * size
    const y = (star.y + 0.5) * size
    ctx.beginPath()
    ctx.moveTo(x - 3.5, y)
    ctx.lineTo(x + 3.5, y)
    ctx.moveTo(x, y - 3.5)
    ctx.lineTo(x, y + 3.5)
    ctx.stroke()

    const dx = star.pmx * size * 26
    const dy = star.pmy * size * 26
    if (Math.hypot(dx, dy) > 2.5) {
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + dx, y + dy)
      ctx.stroke()
    }
  }

  ctx.font = font
  ctx.fillStyle = 'rgba(185, 162, 255, 0.85)'
  ctx.fillText('Gaia proper motions', size * 0.04, size * 0.965)
  ctx.restore()
}

function paintWise(ctx: CanvasRenderingContext2D, request: SkyRequest) {
  const { size, scene } = request
  const font = `${Math.max(9, Math.round(size * 0.0145))}px 'Inter Tight', system-ui, sans-serif`

  ctx.save()
  ctx.strokeStyle = 'rgba(116, 227, 255, 0.55)'
  ctx.lineWidth = 1
  ctx.setLineDash([2, 4])

  for (const galaxy of scene.galaxies.slice(0, 4)) {
    const x = (galaxy.x + 0.5) * size
    const y = (galaxy.y + 0.5) * size
    ctx.beginPath()
    ctx.arc(x, y, 12 + size * 0.014, 0, Math.PI * 2)
    ctx.stroke()
  }

  ctx.setLineDash([])
  ctx.font = font
  ctx.fillStyle = 'rgba(116, 227, 255, 0.85)'
  ctx.fillText('WISE infrared sources', size * 0.04, size * 0.93)
  ctx.restore()
}

function paintProbe(ctx: CanvasRenderingContext2D, point: Point, size: number) {
  const x = (point.x + 0.5) * size
  const y = (point.y + 0.5) * size

  ctx.save()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.lineWidth = 1
  ctx.setLineDash([2, 3])
  ctx.beginPath()
  ctx.arc(x, y, 13, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.strokeStyle = 'rgba(255, 179, 230, 0.95)'
  ctx.beginPath()
  ctx.moveTo(x - 18, y)
  ctx.lineTo(x - 6, y)
  ctx.moveTo(x + 6, y)
  ctx.lineTo(x + 18, y)
  ctx.moveTo(x, y - 18)
  ctx.lineTo(x, y - 6)
  ctx.moveTo(x, y + 6)
  ctx.lineTo(x, y + 18)
  ctx.stroke()
  ctx.restore()
}

function paintHint(ctx: CanvasRenderingContext2D, point: Point, size: number) {
  const x = (point.x + 0.5) * size
  const y = (point.y + 0.5) * size

  ctx.save()
  ctx.strokeStyle = 'rgba(255, 138, 216, 0.55)'
  ctx.lineWidth = 1.5
  ctx.setLineDash([4, 5])
  ctx.beginPath()
  ctx.arc(x, y, size * 0.12, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

function paintReveal(ctx: CanvasRenderingContext2D, point: Point, size: number) {
  const x = (point.x + 0.5) * size
  const y = (point.y + 0.5) * size
  const radius = Math.max(16, size * 0.05)

  ctx.save()
  ctx.strokeStyle = '#ff8ad8'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.stroke()

  ctx.strokeStyle = 'rgba(255, 138, 216, 0.45)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(x, y, radius + 7, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x - radius - 16, y)
  ctx.lineTo(x - radius - 5, y)
  ctx.moveTo(x + radius + 5, y)
  ctx.lineTo(x + radius + 16, y)
  ctx.stroke()

  ctx.font = `600 ${Math.max(10, size * 0.017)}px 'Inter Tight', system-ui, sans-serif`
  ctx.fillStyle = '#ffb3e6'
  ctx.fillText('MOVING SOURCE', x - radius, y - radius - 12)
  ctx.restore()
}

function paintOverlays(ctx: CanvasRenderingContext2D, request: SkyRequest) {
  if (request.layers.grid) paintGrid(ctx, request)
  if (request.layers.gaia) paintGaia(ctx, request)
  if (request.layers.wise) paintWise(ctx, request)
  if (request.probe) paintProbe(ctx, request.probe, request.size)
  if (request.hint) paintHint(ctx, request.hint, request.size)
  if (request.reveal) paintReveal(ctx, request.reveal, request.size)
}

export function renderSky(ctx: CanvasRenderingContext2D, request: SkyRequest) {
  const size = Math.max(2, Math.floor(request.size))
  ctx.clearRect(0, 0, size, size)
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1

  if (request.mode === 'difference') {
    const a = document.createElement('canvas')
    const b = document.createElement('canvas')
    a.width = a.height = size
    b.width = b.height = size
    const actx = a.getContext('2d')
    const bctx = b.getContext('2d')
    if (!actx || !bctx) return

    paintSky(actx, request, request.epoch, false)
    paintSky(bctx, request, request.compare, false)
    ctx.drawImage(a, 0, 0)
    ctx.globalCompositeOperation = 'difference'
    ctx.drawImage(b, 0, 0)
    ctx.globalCompositeOperation = 'multiply'
    const tint = ctx.createLinearGradient(0, 0, size, size)
    tint.addColorStop(0, '#cbbcff')
    tint.addColorStop(0.45, '#ffffff')
    tint.addColorStop(1, '#74e3ff')
    ctx.fillStyle = tint
    ctx.fillRect(0, 0, size, size)
    ctx.globalCompositeOperation = 'source-over'
  } else if (request.mode === 'coadd') {
    paintSky(ctx, request, request.epoch, true, true)
  } else {
    paintSky(ctx, request, request.epoch, true)
  }

  paintOverlays(ctx, request)
}
