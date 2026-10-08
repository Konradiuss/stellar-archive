// Satellites live inside their planet in the map file (`planet.satellites[]`), so planet numbering and old links stay.

import { DEFAULT_STATION_TYPE, STATION_TYPES } from './stationRenderer'
import { warnMap } from './mapJournal'

export const SATELLITE_KINDS = ['moon', 'station']
// Orbit radius in planet radii and body radius as a share of the planet.
const FIRST_DISTANCE = 2.2
const DISTANCE_STEP = 0.7
// Stations are drawn a little larger than their real size, or they would be lost.
const DEFAULT_SIZE = { moon: 0.3, station: 0.35 }
const DEFAULT_SPEED = { moon: 0.012, station: 0.02 }
// Bodies without an angle do not start on one line.
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
// Mini orbits on the system screen, in screen pixels: never lost, never huge.
export const MINI_ORBIT_MIN_PX = 10
export const MINI_ORBIT_MAX_PX = 24
const MINI_ORBIT_GAP_PX = 3
// More bodies than this share one halo on the system screen.
export const MINI_ORBIT_RINGS_MAX = 3
const SWARM_RADIUS_PX = 20
const RING_CLEARANCE_PX = 3
// Same tilt as the planet rings.
export const ORBIT_TILT = 0.3

// Map data does not change after loading: each planet is read once, so its warnings show once.
const cache = new WeakMap()

const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0
const finite = value => typeof value === 'number' && Number.isFinite(value)
// Bodies whose distances differ by less than this share an orbit.
const orbitKey = distance => Math.round(distance * 100)

function angleOf(data) {
  if (data.angle === undefined || data.angle === null || data.angle === '') return null
  const degrees = Number(data.angle)
  return Number.isFinite(degrees) ? (degrees * Math.PI) / 180 : null
}

/**
 * [{ index, data, kind, type, distance, size, angle, speed, orbit }]: `index` is the place in
 * `planet.satellites` (addresses use it); `type` is a station's look (null for a moon); `orbit` counts
 * from the planet. Bodies on one orbit go at the speed of the first; ones without an angle are spread evenly.
 */
export function getSatellites(planet) {
  if (!planet || typeof planet !== 'object') return []
  const cached = cache.get(planet)
  if (cached && cached.list === planet.satellites) return cached.result
  const list = Array.isArray(planet.satellites) ? planet.satellites : []
  const labelOf = (data, index) => `Satellite "${data?.name ?? index + 1}" of "${planet?.name ?? '?'}"`
  const result = []
  list.forEach((data, index) => {
    const label = labelOf(data, index)
    if (!data || typeof data !== 'object') {
      warnMap(label, 'Not a satellite { … }: left out.')
      return
    }
    const kind = data.kind ?? 'moon'
    if (!SATELLITE_KINDS.includes(kind)) {
      warnMap(label, `Kind "${kind}" is neither "moon" nor "station": left out.`)
      return
    }
    let type = null
    if (kind === 'station') {
      type = data.type ?? DEFAULT_STATION_TYPE
      if (!STATION_TYPES.includes(type)) {
        warnMap(label, `Station type "${type}" is unknown (${STATION_TYPES.join(', ')}): "${DEFAULT_STATION_TYPE}" is used.`)
        type = DEFAULT_STATION_TYPE
      }
    }
    const check = (field, fallback) => {
      if (data[field] === undefined) return fallback
      if (positive(data[field])) return data[field]
      warnMap(label, `"${field}" ${JSON.stringify(data[field])} is not valid: ${fallback} is used.`)
      return fallback
    }
    result.push({
      index,
      data,
      kind,
      type,
      distance: check('distance', FIRST_DISTANCE + DISTANCE_STEP * result.length),
      size: Math.min(1, check('size', DEFAULT_SIZE[kind])),
      angle: angleOf(data),
      // Radians per 60 fps frame, as planets.
      speed: finite(data.speed) ? data.speed : DEFAULT_SPEED[kind]
    })
  })

  const orbits = new Map()
  result.forEach(satellite => {
    const key = orbitKey(satellite.distance)
    if (!orbits.has(key)) orbits.set(key, [])
    orbits.get(key).push(satellite)
  })
  const keys = [...orbits.keys()].sort((a, b) => a - b)
  result.forEach((satellite, number) => {
    const members = orbits.get(orbitKey(satellite.distance))
    const [first] = members
    satellite.orbit = keys.indexOf(orbitKey(satellite.distance))
    if (satellite !== first) {
      if (finite(satellite.data.speed) && satellite.data.speed !== first.speed) {
        warnMap(labelOf(satellite.data, satellite.index), `"speed" ${satellite.data.speed} differs from its orbit's: ${first.speed} of "${first.data.name}" is used.`)
      }
      satellite.speed = first.speed
    }
    if (satellite.angle === null) {
      satellite.angle = members.length > 1
        ? (first.angle ?? 0) + (members.indexOf(satellite) * Math.PI * 2) / members.length
        : GOLDEN_ANGLE * number
    }
  })
  cache.set(planet, { list: planet.satellites, result })
  return result
}

export const isShownSatellite = data => !!data && typeof data === 'object' && SATELLITE_KINDS.includes(data.kind ?? 'moon')

export function orbitCount(planets) {
  return (Array.isArray(planets) ? planets : [])
    .filter(planet => planet && typeof planet === 'object')
    .reduce((count, planet) => count + 1 + (Array.isArray(planet.satellites) ? planet.satellites.filter(isShownSatellite).length : 0), 0)
}

export function findSatellite(planet, satelliteIndex) {
  return getSatellites(planet).find(satellite => satellite.index === satelliteIndex) ?? null
}

export function orbitDistances(satellites) {
  const distances = []
  satellites.forEach(satellite => { distances[satellite.orbit] = satellite.distance })
  return distances.filter(distance => distance !== undefined)
}

/**
 * unit: px per planet radius, lowered so the farthest shown orbit fits; reaches: how far each orbit's
 * bodies stick out (px). Too crowded orbits spread evenly; far ones that still do not fit are left out.
 * → { radii: [px of each shown orbit], visible }
 */
export function layoutOrbits(distances, { unit = Infinity, minRadius = 0, maxRadius, spacing = 0, reaches = [] }) {
  const count = distances.length
  if (!count) return { radii: [], visible: 0 }
  const reach = index => reaches[index] ?? 0
  const tight = []
  for (let index = 0; index < count; index++) {
    tight.push(index ? tight[index - 1] + reach(index - 1) + reach(index) + spacing : minRadius)
  }
  let visible = 1
  while (visible < count && tight[visible] + reach(visible) <= maxRadius) visible++

  const last = visible - 1
  const scale = Math.min(unit, (maxRadius - reach(last)) / distances[last])
  const radii = []
  for (let index = 0; index < visible; index++) {
    const nearest = index ? radii[index - 1] + reach(index - 1) + reach(index) + spacing : minRadius
    radii.push(Math.max(nearest, distances[index] * scale))
  }
  const slack = maxRadius - (radii[last] + reach(last))
  if (slack < 0 && visible > 1) {
    const spare = Math.max(0, maxRadius - (tight[last] + reach(last)))
    for (let index = 0; index < visible; index++) radii[index] = tight[index] + (spare * index) / last
  }
  return { radii, visible }
}

// px: a station needs a few pixels more.
const MIN_BODY_PX = { moon: 6, station: 14 }
const BODY_SPACING_PX = 2
// Crowded orbits shrink their bodies first, then drop the far ones; sizes never go below this share.
const BODY_SCALES = [1, 0.8, 0.6, 0.4]
const MIN_BODY_SHRINK = 0.7
export const PLANET_VIEW_LIMIT = 6

/** ringOuter in planet radii (0 without a ring). → { bodies: [{ satellite, orbitRadius, bodyRadius }], orbits: [px], hidden } */
export function planetViewLayout(satellites, { discRadius, ringOuter = 0, maxRadius, limit = PLANET_VIEW_LIMIT }) {
  if (!satellites.length || !discRadius) return { bodies: [], orbits: [], hidden: satellites.length }
  const ordered = [...satellites].sort((a, b) => a.orbit - b.orbit)
  const wanted = ordered.slice(0, limit)
  const orbitCount = wanted[wanted.length - 1].orbit + 1
  const distances = orbitDistances(satellites).slice(0, orbitCount)
  let result = null
  for (const bodyScale of BODY_SCALES) {
    const sizeOf = satellite => Math.max(
      (MIN_BODY_PX[satellite.kind] ?? MIN_BODY_PX.moon) * Math.max(MIN_BODY_SHRINK, bodyScale),
      satellite.size * discRadius * bodyScale
    )
    const reaches = distances.map((_, orbit) => Math.max(0, ...wanted.filter(item => item.orbit === orbit).map(sizeOf)))
    const minRadius = Math.max(discRadius * 1.3, ringOuter ? ringOuter * discRadius + reaches[0] + BODY_SPACING_PX : 0)
    const { radii, visible } = layoutOrbits(distances, { unit: discRadius, minRadius, maxRadius, spacing: BODY_SPACING_PX, reaches })
    result = { radii, visible, sizeOf }
    if (visible === orbitCount) break
  }
  const bodies = wanted
    .filter(satellite => satellite.orbit < result.visible)
    .map(satellite => ({ satellite, orbitRadius: result.radii[satellite.orbit], bodyRadius: result.sizeOf(satellite) }))
  return { bodies, orbits: result.radii, hidden: satellites.length - bodies.length }
}

// The big planet shrinks for its satellites down to MIN_PLANET_DISC_SHARE, no more than it has to.
export const PLANET_DISC_SHARE = 0.35
export const MIN_PLANET_DISC_SHARE = 0.22
// A big planet (its `size`) still leaves the window a few pixels.
export const MAX_PLANET_DISC_SHARE = 0.48
const DISC_SHARE_STEP = 0.01
const VIEW_EDGE_PX = 4

/** scale: planetScale() of the planet. */
export function planetDiscShare(scale = 1, share = PLANET_DISC_SHARE) {
  return Math.min(MAX_PLANET_DISC_SHARE, share * scale)
}

/** The largest disc with which up to `limit` bodies fit, else the one showing the most. → { share, discRadius, ...planetViewLayout } */
export function fitPlanetView(satellites, { width, height, ringOuter = 0, scale = 1, limit = PLANET_VIEW_LIMIT }) {
  const side = Math.min(width, height)
  const wanted = Math.min(satellites.length, limit)
  let best = null
  for (let step = 0; PLANET_DISC_SHARE - step * DISC_SHARE_STEP >= MIN_PLANET_DISC_SHARE - 1e-9; step++) {
    const share = planetDiscShare(scale, Math.round((PLANET_DISC_SHARE - step * DISC_SHARE_STEP) * 100) / 100)
    const discRadius = side * share
    const layout = planetViewLayout(satellites, { discRadius, ringOuter, maxRadius: width / 2 - VIEW_EDGE_PX, limit })
    const fit = { share, discRadius, ...layout }
    if (!best || layout.bodies.length > best.bodies.length) best = fit
    if (layout.bodies.length >= wanted) break
  }
  return best
}

// Must match SystemView.vue: .planet-params 200px, the .planet-display-container gap 20px,
// .planet-canvas-wrapper at most 60% wide.
const PARAMS_WIDTH_PX = 200
const PARAMS_GAP_PX = 20
const ORBIT_VIEW_MAX_SHARE = 0.6

export function orbitViewSize({ width, height }, params) {
  if (!params) return { width, height }
  return { width: Math.max(0, Math.min(width - PARAMS_WIDTH_PX - PARAMS_GAP_PX, width * ORBIT_VIEW_MAX_SHARE)), height }
}

export function needsSatelliteGrid(satellites, { width, height }, ringOuter = 0, scale = 1) {
  if (!satellites.length || !width || !height) return false
  return fitPlanetView(satellites, { width, height, ringOuter, scale }).hidden > 0
}

/** → [{ orbit, distance, bodies }], nearest first. */
export function satelliteRows(satellites) {
  const rows = []
  for (const satellite of satellites) {
    rows[satellite.orbit] ??= { orbit: satellite.orbit, distance: satellite.distance, bodies: [] }
    rows[satellite.orbit].bodies.push(satellite)
  }
  return rows.filter(Boolean)
}

/** Up to MINI_ORBIT_RINGS_MAX bodies: { mode: 'rings', radii }; more: { mode: 'swarm', haloRadius }. */
export function miniOrbitLayout(satellites, planetRadiusPx, ringOuterPx = 0) {
  const minRadius = Math.max(MINI_ORBIT_MIN_PX, Math.ceil(ringOuterPx) + RING_CLEARANCE_PX)
  if (satellites.length > MINI_ORBIT_RINGS_MAX) {
    return { mode: 'swarm', haloRadius: Math.min(MINI_ORBIT_MAX_PX, Math.max(minRadius, SWARM_RADIUS_PX)) }
  }
  const { radii } = layoutOrbits(orbitDistances(satellites), {
    unit: planetRadiusPx,
    minRadius,
    maxRadius: MINI_ORBIT_MAX_PX,
    spacing: MINI_ORBIT_GAP_PX
  })
  return { mode: 'rings', radii: radii.map(Math.round) }
}

export function miniOrbitReach(layout) {
  if (layout.mode === 'swarm') return layout.haloRadius
  return layout.radii.length ? layout.radii[layout.radii.length - 1] : 0
}

/** x, y from the planet centre; `behind`: on the upper, far half. */
export function ellipsePosition(angle, radius, tilt = ORBIT_TILT) {
  const x = Math.cos(angle) * radius
  const y = Math.sin(angle) * radius * tilt
  return { x, y, behind: Math.sin(angle) < 0 }
}

const BEHIND_LIGHT = 0.6
const LIGHT_FADE = 0.5

export function orbitLight(angle) {
  const depth = Math.min(1, Math.max(0, (Math.sin(angle) + LIGHT_FADE) / (LIGHT_FADE * 2)))
  const smooth = depth * depth * (3 - 2 * depth)
  return BEHIND_LIGHT + (1 - BEHIND_LIGHT) * smooth
}

export function bodyDotColor(config) {
  if (!config) return 0xb8b8b8
  const share = Math.min(1, Math.max(0, Number(config.waterAmount) || 0))
  const channel = shift => {
    const land = (config.landColor >> shift) & 0xff
    const water = (config.waterColor >> shift) & 0xff
    return Math.round(land + (water - land) * share) << shift
  }
  return channel(16) | channel(8) | channel(0)
}
