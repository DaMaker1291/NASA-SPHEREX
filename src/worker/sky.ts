import { Constellation, Rotation_EQJ_GAL } from 'astronomy-engine'

const RAD = Math.PI / 180
const DEG = 180 / Math.PI

function unitVector(ra: number, dec: number) {
  const r = ra * RAD
  const d = dec * RAD
  return {
    x: Math.cos(d) * Math.cos(r),
    y: Math.cos(d) * Math.sin(r),
    z: Math.sin(d),
  }
}

function sexagesimal(value: number, units: ['h', 'm', 's'] | ['°', '′', '″'], signed: boolean) {
  const sign = signed && value < 0 ? '−' : ''
  const absolute = Math.abs(value)
  const first = Math.floor(absolute)
  const minutes = Math.floor((absolute - first) * 60)
  const seconds = ((absolute - first) * 60 - minutes) * 60
  return `${sign}${first}${units[0]} ${String(minutes).padStart(2, '0')}${units[1]} ${seconds.toFixed(2).padStart(5, '0')}${units[2]}`
}

export function skyNeighborhood(ra: number, dec: number, radiusDeg = 1.5) {
  const center = skyContext(ra, dec)
  const radius = Math.min(10, Math.max(0.05, radiusDeg))
  const bearings = [
    ['north', 0], ['north-east', 45], ['east', 90], ['south-east', 135],
    ['south', 180], ['south-west', 225], ['west', 270], ['north-west', 315],
  ] as const
  const neighbors = new Map<string, { name: string; symbol: string; direction: string; ra: number; dec: number; separation: number }>()
  for (const [direction, bearing] of bearings) {
    const angle = bearing * RAD
    const decRad = dec * RAD
    const raRad = ra * RAD
    const targetDec = Math.asin(
      Math.sin(decRad) * Math.cos(radius * RAD) +
      Math.cos(decRad) * Math.sin(radius * RAD) * Math.cos(angle),
    )
    const targetRa = raRad + Math.atan2(
      Math.sin(angle) * Math.sin(radius * RAD) * Math.cos(decRad),
      Math.cos(radius * RAD) - Math.sin(decRad) * Math.sin(targetDec),
    )
    const neighborRa = ((targetRa * DEG) % 360 + 360) % 360
    const neighborDec = targetDec * DEG
    const constellation = Constellation(neighborRa / 15, neighborDec)
    if (constellation.name === center.constellation.name) continue
    const key = constellation.name
    if (neighbors.has(key)) continue
    neighbors.set(key, {
      name: constellation.name,
      symbol: constellation.symbol,
      direction,
      ra: neighborRa,
      dec: neighborDec,
      separation: radius,
    })
  }
  return {
    ...center,
    radiusDeg: radius,
    neighbors: [...neighbors.values()],
    method: 'astronomy-engine IAU constellation lookup at eight offset bearings',
  }
}

export function skyContext(ra: number, dec: number) {
  const constellation = Constellation(ra / 15, dec)
  const vector = unitVector(ra, dec)

  const galacticRotation = Rotation_EQJ_GAL().rot
  const gx = galacticRotation[0][0] * vector.x + galacticRotation[1][0] * vector.y + galacticRotation[2][0] * vector.z
  const gy = galacticRotation[0][1] * vector.x + galacticRotation[1][1] * vector.y + galacticRotation[2][1] * vector.z
  const gz = galacticRotation[0][2] * vector.x + galacticRotation[1][2] * vector.y + galacticRotation[2][2] * vector.z
  const galacticL = ((Math.atan2(gy, gx) * DEG) % 360 + 360) % 360
  const galacticB = Math.asin(Math.max(-1, Math.min(1, gz))) * DEG

  const obliquity = 23.4392911 * RAD
  const eclipticX = vector.x
  const eclipticY = vector.y * Math.cos(obliquity) + vector.z * Math.sin(obliquity)
  const eclipticZ = -vector.y * Math.sin(obliquity) + vector.z * Math.cos(obliquity)
  const eclipticLon = ((Math.atan2(eclipticY, eclipticX) * DEG) % 360 + 360) % 360
  const eclipticLat = Math.asin(Math.max(-1, Math.min(1, eclipticZ))) * DEG

  return {
    constellation: { name: constellation.name, symbol: constellation.symbol },
    raHms: sexagesimal(ra / 15, ['h', 'm', 's'], false),
    decDms: sexagesimal(dec, ['°', '′', '″'], true),
    galactic: { l: galacticL, b: galacticB },
    ecliptic: { lon: eclipticLon, lat: eclipticLat },
  }
}
