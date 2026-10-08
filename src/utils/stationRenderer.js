// x, y: -1..1 across the station's square, y down. t: seconds of animation (still while the view is paused).

import { parsePlanetColor } from './planetRenderer'
import { hashText } from './random'
import { clamp } from './math'

export const STATION_TYPES = ['ring', 'spindle', 'shipyard', 'outpost']
export const DEFAULT_STATION_TYPE = 'ring'

export const DEFAULT_HULL_COLOR = 0x9aa3ad
export const DEFAULT_LIGHTS_COLOR = 0xffc860
const PANEL = { light: 0x5a82c4, base: 0x34599a, mid: 0x26457a, dark: 0x172b4f }
const BEACON = 0xff4a3a
const SPARKS = [0xfff6c8, 0x9fe0ff]

// Tiny glyphs of the system screen: # hull, P panel, L the blinking light.
export const STATION_GLYPHS = {
  ring: ['.###.', '#.L.#', '.###.'],
  spindle: ['...#L', '..##.', '.##..', '##...'],
  shipyard: ['####L', '#.#.#', '#####'],
  outpost: ['..L..', '..#..', 'PP#PP']
}

const TAU = Math.PI * 2
const LIGHT = (() => {
  const length = Math.hypot(0.5, 0.5, 0.7)
  return { x: -0.5 / length, y: -0.5 / length, z: 0.7 / length }
})()

const frac = value => value - Math.floor(value)

function scale(color, amount) {
  const channel = shift => clamp(Math.round(((color >> shift) & 0xff) * amount), 0, 255) << shift
  return channel(16) | channel(8) | channel(0)
}

function towardWhite(color, amount) {
  const channel = shift => {
    const value = (color >> shift) & 0xff
    return Math.round(value + (255 - value) * amount) << shift
  }
  return channel(16) | channel(8) | channel(0)
}

function random(a, b, seed = 0) {
  let hash = seed >>> 0
  hash ^= Math.imul(a | 0, 0x27d4eb2d)
  hash ^= Math.imul(b | 0, 0x165667b1)
  hash = Math.imul(hash ^ (hash >>> 15), 0x85ebca6b)
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35)
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296
}

const blink = (t, period, duty, phase = 0) => frac(t / period + phase) < duty

function tone(palette, light, dither) {
  if (light > 0.75 + dither * 0.1) return palette.light
  if (light > 0.5 + dither * 0.1) return palette.base
  if (light > 0.28 + dither * 0.1) return dither > 0.5 ? palette.base : palette.mid
  return dither > 0.5 ? palette.mid : palette.dark
}

/** → { type, hull, lights, seed, palette }; an unknown type falls back to the ring (getSatellites reports it). */
export function createStationConfig(data = {}) {
  const type = STATION_TYPES.includes(data?.type) ? data.type : DEFAULT_STATION_TYPE
  const hull = parsePlanetColor(data?.color, DEFAULT_HULL_COLOR)
  const lights = parsePlanetColor(data?.lights, DEFAULT_LIGHTS_COLOR)
  return {
    type,
    hull,
    lights,
    seed: hashText(data?.name ?? type),
    palette: {
      hull: { light: towardWhite(hull, 0.35), base: hull, mid: scale(hull, 0.7), dark: scale(hull, 0.42) },
      lights,
      window: scale(hull, 0.25)
    }
  }
}

const RING = { tilt: 0.42, radius: 0.72, band: 0.13, wall: 0.15, hub: 0.17, segments: 12, windows: 24 }

function ringFace(x, y) {
  const flatY = y / RING.tilt
  const r = Math.hypot(x, flatY)
  if (Math.abs(r - RING.radius) > RING.band) return null
  return { r, near: flatY >= 0, theta: Math.atan2(flatY, x) }
}

function sampleRing(config, x, y, t, cell, dither) {
  const { hull } = config.palette
  const spin = t * 0.35
  const line = Math.max(cell * 0.55, 0.028)

  const top = ringFace(x, y)
  let wall = null
  if (!top) {
    const step = Math.min(cell * 0.5, RING.wall / 4)
    for (let shift = step; shift <= RING.wall; shift += step) {
      wall = ringFace(x, y - shift)
      if (wall) {
        wall.depth = shift / RING.wall
        break
      }
    }
  }

  const topColor = () => {
    const along = frac(((top.theta - spin) * RING.segments) / TAU)
    let light = 0.62 - 0.22 * x
    if (top.r < RING.radius - RING.band * 0.5) light -= 0.22
    if (along < 0.1) light -= 0.3
    return tone(hull, light, dither)
  }
  const wallColor = () => {
    const outer = wall.r >= RING.radius
    const facing = outer ? -Math.cos(wall.theta) : Math.cos(wall.theta)
    const place = ((wall.theta - spin) * RING.windows) / TAU
    const index = Math.floor(place)
    if (wall.depth > 0.25 && wall.depth < 0.8 && frac(place) > 0.25 && frac(place) < 0.7) {
      const chance = random(index, outer ? 1 : 2, config.seed)
      if (chance > 0.9) return blink(t, 1.7, 0.5, chance) ? config.palette.lights : config.palette.window
      return chance > 0.25 ? config.palette.lights : config.palette.window
    }
    return tone(hull, 0.3 + 0.32 * Math.max(0, facing), dither)
  }

  const spoke = near => {
    for (let index = 0; index < 4; index++) {
      const angle = spin + Math.PI / 4 + (index * Math.PI) / 2
      if (Math.sin(angle) >= 0 !== near) continue
      const dx = Math.cos(angle)
      const dy = Math.sin(angle) * RING.tilt
      const length = Math.hypot(dx, dy)
      const along = (x * dx + y * dy) / length
      const across = Math.abs(x * dy - y * dx) / length
      if (across < line && along > RING.hub * length && along < (RING.radius - RING.band) * length) {
        return tone(hull, 0.42 - 0.15 * x, dither)
      }
    }
    return null
  }

  if (top?.near) return topColor()
  if (wall?.near) return wallColor()
  const nearSpoke = spoke(true)
  if (nearSpoke !== null) return nearSpoke

  const hubDistance = Math.hypot(x, y) / RING.hub
  if (hubDistance <= 1) {
    const nx = x / RING.hub
    const ny = y / RING.hub
    if (Math.abs(y) < line && frac((Math.asin(clamp(nx, -1, 1)) + spin) * 1.5) < 0.5) return config.palette.lights
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))
    return tone(hull, nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z, dither)
  }
  if (Math.abs(x) < line) {
    if (y < -RING.hub && y > -0.6) return tone(hull, 0.45, dither)
    if (y <= -0.6 && y > -0.68) return blink(t, 1.2, 0.35) ? BEACON : hull.dark
    if (y > RING.hub && y < 0.5) return tone(hull, 0.35, dither)
  }

  const farSpoke = spoke(false)
  if (farSpoke !== null) return farSpoke
  if (top) return topColor()
  if (wall) return wallColor()
  return null
}

const SPINDLE = { angle: -0.42, core: 0.52, tip: 0.76, radius: 0.19, fin: 0.3, finHalf: 0.44 }
const SPINDLE_AXIS = { x: Math.cos(SPINDLE.angle), y: Math.sin(SPINDLE.angle) }
const SPINDLE_SIDE = { x: -Math.sin(SPINDLE.angle), y: Math.cos(SPINDLE.angle) }

function spindleRadius(u) {
  const distance = Math.abs(u)
  if (distance <= SPINDLE.core) return SPINDLE.radius
  if (distance <= SPINDLE.tip) return SPINDLE.radius * (1 - ((distance - SPINDLE.core) / (SPINDLE.tip - SPINDLE.core)) * 0.7)
  return 0
}

function sampleSpindle(config, x, y, t, cell, dither) {
  const { hull } = config.palette
  const spin = t * 0.5
  const line = Math.max(cell * 0.55, 0.028)
  const u = x * SPINDLE_AXIS.x + y * SPINDLE_AXIS.y
  const v = x * SPINDLE_SIDE.x + y * SPINDLE_SIDE.y

  const fin = front => {
    if (Math.abs(u) > SPINDLE.finHalf) return null
    for (let index = 0; index < 3; index++) {
      const angle = spin + 0.3 + (index * TAU) / 3
      if (Math.cos(angle) > 0 !== front) continue
      const from = SPINDLE.radius * 0.95 * Math.sin(angle)
      const to = (SPINDLE.radius + SPINDLE.fin) * Math.sin(angle)
      const inside = Math.abs(to - from) < line * 2
        ? Math.abs(v - (from + to) / 2) < line
        : v > Math.min(from, to) && v < Math.max(from, to)
      if (!inside) continue
      if (frac(u * 7 + 0.5) < 0.14) return PANEL.dark
      return tone(PANEL, 0.3 + 0.6 * Math.abs(Math.cos(angle)), dither)
    }
    return null
  }

  const frontFin = fin(true)
  if (frontFin !== null) return frontFin

  const radius = spindleRadius(u)
  if (radius > 0 && Math.abs(v) < radius) {
    const side = v / radius
    const depth = Math.sqrt(Math.max(0, 1 - side * side))
    let light = side * (SPINDLE_SIDE.x * LIGHT.x + SPINDLE_SIDE.y * LIGHT.y) + depth * LIGHT.z
    if (frac((u + SPINDLE.core) / 0.17) < 0.1) light -= 0.25
    if (Math.abs(u) < SPINDLE.core - 0.03) {
      const around = ((Math.asin(clamp(side, -1, 1)) - spin) * 6) / TAU
      const belt = Math.floor(around)
      if (belt % 2 === 0 && frac(around) > 0.2 && frac(around) < 0.8 && frac(u * 16) > 0.2 && frac(u * 16) < 0.75) {
        return random(belt, Math.floor(u * 16), config.seed) > 0.3 ? config.palette.lights : config.palette.window
      }
    }
    return tone(hull, light, dither)
  }
  if (u > SPINDLE.tip && u < SPINDLE.tip + 0.07 && Math.abs(v) < Math.max(line, SPINDLE.radius * 0.35)) {
    return tone(hull, 0.45, dither)
  }
  if (u >= SPINDLE.tip + 0.07 && u < SPINDLE.tip + 0.11 && Math.abs(v) < line) return config.palette.lights
  if (u < -SPINDLE.tip && Math.abs(v) < line) {
    if (u > -SPINDLE.tip - 0.14) return tone(hull, 0.4, dither)
    if (u > -SPINDLE.tip - 0.2) return blink(t, 1.2, 0.35) ? BEACON : hull.dark
  }

  return fin(false)
}

const YARD = { left: -0.88, right: 0.88, top: -0.46, bottom: 0.46, girder: 0.09, depth: { x: 0.12, y: -0.1 } }
const YARD_POSTS = [-0.88, -0.29, 0.29, 0.88]
const SHIP = { back: -0.62, nose: 0.66, waist: 0.25, height: 0.19, y: 0.02 }

function shipHeight(x) {
  if (x < SHIP.back || x > SHIP.nose) return 0
  if (x <= SHIP.waist) return SHIP.height
  return SHIP.height * (1 - (x - SHIP.waist) / (SHIP.nose - SHIP.waist))
}

function sampleShipyard(config, x, y, t, cell, dither) {
  const { hull } = config.palette
  const line = Math.max(cell * 0.55, 0.028)
  const build = 0.05 + 0.35 * random(7, 11, config.seed)
  const { girder } = YARD

  const height = shipHeight(x)
  if (Math.abs(x - build) < 0.07 && Math.abs(y - SHIP.y) < Math.max(height, line)) {
    const spark = random(Math.floor(x / cell), Math.floor(y / cell) + Math.floor(t * 12) * 131, config.seed)
    if (spark > 0.9) return SPARKS[spark > 0.95 ? 1 : 0]
  }

  const craneX = 0.55 * Math.sin(t * 0.4)
  if (Math.abs(x - craneX) < 0.06 && y > YARD.top && y < YARD.top + girder) return config.palette.lights
  if (Math.abs(x - craneX) < line && y >= YARD.top + girder && y < -0.26) return tone(hull, 0.35, dither)
  if (Math.abs(x - craneX) < Math.max(line, 0.035) && y >= -0.26 && y < -0.21) return config.palette.lights

  const inGirder = (y > YARD.top && y < YARD.top + girder) || (y > YARD.bottom - girder && y < YARD.bottom)
  const inPost = YARD_POSTS.some(post => Math.abs(x - post) < girder / 2)
  const inside = x > YARD.left - girder / 2 && x < YARD.right + girder / 2
  if (inside && (inGirder || (inPost && y > YARD.top && y < YARD.bottom))) {
    const corner = Math.abs(Math.abs(x) - YARD.right) < girder / 2 && y < YARD.top + girder
    if (corner) return blink(t, 1.4, 0.4, x > 0 ? 0.5 : 0) ? (x > 0 ? BEACON : config.palette.lights) : hull.dark
    const edge = inGirder && (y < YARD.top + line * 2 || y > YARD.bottom - line * 2 || Math.abs(y) > 0.46 - line * 2)
    const brace = Math.abs(frac((x + y) / (girder * 2)) - 0.5) < 0.2 || Math.abs(frac((x - y) / (girder * 2)) - 0.5) < 0.2
    if (inPost || edge || brace || cell > girder / 2) return tone(hull, 0.58 - 0.2 * x, dither)
    return null
  }

  if (height > 0 && Math.abs(y - SHIP.y) < height) {
    const side = (y - SHIP.y) / height
    if (x < build) {
      const depth = Math.sqrt(Math.max(0, 1 - side * side))
      let light = side * LIGHT.y + depth * LIGHT.z + 0.15
      if (frac(x / 0.12) < 0.1) light -= 0.25
      if (side > -0.45 && side < -0.15 && frac(x / 0.06) < 0.5 && random(Math.floor(x / 0.06), 3, config.seed) > 0.35) {
        return config.palette.lights
      }
      return tone(hull, light, dither)
    }
    const rib = frac((x - build) / 0.09) < Math.max(0.2, cell / 0.09)
    const skin = Math.abs(side) > 1 - Math.max(0.15, (cell * 1.1) / height)
    const keel = Math.abs(y - SHIP.y) < line
    if (rib || skin || keel) return tone(hull, 0.34, dither)
  }
  if (x >= SHIP.back - 0.12 && x < SHIP.back && Math.abs(y - SHIP.y) < SHIP.height * 0.7) {
    return Math.abs(y - SHIP.y) < SHIP.height * 0.25 ? hull.dark : tone(hull, 0.3, dither)
  }

  const bx = x - YARD.depth.x
  const by = y - YARD.depth.y
  const backEdge = (
    (Math.abs(by - YARD.top) < line || Math.abs(by - YARD.bottom) < line) && bx > YARD.left && bx < YARD.right
  ) || (
    (Math.abs(bx - YARD.left) < line || Math.abs(bx - YARD.right) < line) && by > YARD.top && by < YARD.bottom
  )
  return backEdge ? hull.dark : null
}

function sampleOutpost(config, x, y, t, cell, dither) {
  const { hull } = config.palette
  const spin = t * 0.25
  const line = Math.max(cell * 0.55, 0.028)

  const mastX = 0.16
  if (Math.abs(x - mastX) < Math.max(line, 0.03) && y > -0.7 && y <= -0.62) return blink(t, 1.3, 0.3) ? BEACON : hull.dark
  if (Math.abs(x - mastX) < line && y > -0.62 && y < -0.15) return tone(hull, 0.45, dither)

  const dishX = -0.14
  const turn = Math.cos(spin * 2.8)
  const dishWidth = 0.17 * Math.max(0.2, Math.abs(turn))
  const dx = (x - dishX) / dishWidth
  const dy = (y + 0.38) / 0.09
  if (dx * dx + dy * dy <= 1) {
    const inner = dx * dx + dy * dy < 0.4
    if (turn > 0) return inner ? tone(hull, 0.35, dither) : hull.light
    return tone(hull, 0.3 + 0.2 * -dx, dither)
  }
  if (Math.abs(x - dishX) < line && y > -0.3 && y < -0.15) return tone(hull, 0.4, dither)

  if (Math.abs(x) < 0.34 && Math.abs(y) < 0.15) {
    const side = y / 0.15
    if (Math.abs(x) > 0.3) return tone(hull, 0.35, dither)
    if (side > -0.35 && side < 0.1 && frac(x / 0.1) > 0.3 && frac(x / 0.1) < 0.75) {
      return random(Math.floor(x / 0.1), 5, config.seed) > 0.3 ? config.palette.lights : config.palette.window
    }
    const depth = Math.sqrt(Math.max(0, 1 - side * side))
    return tone(hull, side * LIGHT.y + depth * LIGHT.z - 0.12 * x, dither)
  }
  if (Math.abs(x) < 0.07 && y >= 0.15 && y < 0.4) return tone(hull, 0.42 - x, dither)
  if (Math.abs(x) < Math.max(line, 0.05) && y >= 0.4 && y < 0.46) return config.palette.lights

  const reach = Math.abs(x)
  if (reach >= 0.34 && reach < 0.44 && Math.abs(y) < line) return tone(hull, 0.35, dither)
  const facing = Math.abs(Math.cos(spin))
  const wing = 0.2 * (0.3 + 0.7 * facing)
  if (reach >= 0.44 && reach < 0.95 && Math.abs(y) < Math.max(wing, line)) {
    if (frac((reach - 0.44) / 0.1) < 0.14 || Math.abs(y) < line * 0.5) return PANEL.dark
    return tone(PANEL, 0.3 + 0.6 * facing - 0.1 * x, dither)
  }
  return null
}

const SAMPLERS = { ring: sampleRing, spindle: sampleSpindle, shipyard: sampleShipyard, outpost: sampleOutpost }

/** 0xRRGGBB, or null for empty space. cell: one pixel in the same units, so thin parts stay a pixel wide. */
export function sampleStation(config, x, y, t = 0, { cell = 0.05, dither = 0 } = {}) {
  const sampler = SAMPLERS[config?.type] ?? sampleRing
  return sampler(config, x, y, t, cell, dither)
}
