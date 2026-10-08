// A body is addressed by { star: star id, planet: index, satellite?: index }; { star } alone is the star itself.

import { appendItem, removeItem, removeKey, setKey, swapItems } from './jsonEdit'
import { EditError, idOf } from './starEdits'
import { lostFiles } from './siteFiles'
import { isObject } from '../utils/guards'

const read = text => JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
const isEmpty = value => value === '' || value === undefined || (typeof value === 'number' && !Number.isFinite(value))

export const WATER_TYPES = ['water', 'lava', 'acid', 'magma', 'ice', 'methane', 'ammonia', 'oil']
export const STATION_TYPES = ['ring', 'spindle', 'shipyard', 'outpost']
export const RING_SIZES = ['thin', 'medium', 'large']

export const isStarPlace = place => place.planet === null || place.planet === undefined

/** The path of the body in the map; a star's needs the map, as stars are a list. */
export function bodyPath({ star, planet, satellite = null }, map) {
  if (isStarPlace({ planet })) {
    const index = Array.isArray(map?.stars) ? map.stars.findIndex(each => each?.id === star) : -1
    return index < 0 ? null : ['stars', index]
  }
  const path = ['systems', star, 'planets', planet]
  return satellite === null || satellite === undefined ? path : [...path, 'satellites', satellite]
}

export function bodyAt(map, body) {
  const path = bodyPath(body, map)
  if (!path) return null
  let value = map
  for (const step of path) value = value?.[step]
  return isObject(value) ? value : null
}

function body(map, place) {
  const found = bodyAt(map, place)
  if (!found) throw isStarPlace(place) ? new EditError('editor.noStar', { id: place.star }) : new EditError('editor.noBody')
  return found
}

// A star is moved and deleted on the grid of the Galaxy tab.
function planetOrSatellite(map, place) {
  if (isStarPlace(place)) throw new EditError('editor.noBody')
  return body(map, place)
}

export function addSystem(text, star) {
  const map = read(text)
  if (!(Array.isArray(map.stars) && map.stars.some(each => each?.id === star))) throw new EditError('editor.noStar', { id: star })
  if (isObject(map.systems) && isObject(map.systems[star])) return text
  const system = { planets: [] }
  return isObject(map.systems) ? setKey(text, ['systems'], star, system) : setKey(text, [], 'systems', { [star]: system })
}

export function addPlanet(text, star, { name }) {
  let next = addSystem(text, star)
  const system = read(next).systems[star]
  const planets = Array.isArray(system.planets) ? system.planets : []
  const furthest = planets.reduce((most, each) => Math.max(most, Number(each?.orbitRadius) || 0), 0)
  const planet = {
    name: String(name ?? '').trim() || `${star}-${planets.length + 1}`,
    orbitRadius: furthest + (planets.length ? 30 : 40),
    // 137° (near the golden angle) spreads new planets around the star instead of in a line.
    angle: (planets.length * 137) % 360,
    speed: 0.001,
    visualization: { seed: idOf(name, 'planet') }
  }
  next = Array.isArray(system.planets) ? appendItem(next, ['systems', star, 'planets'], planet) : setKey(next, ['systems', star], 'planets', [planet])
  return { text: next, index: planets.length }
}

export function addSatellite(text, place, { kind = 'moon', name }) {
  const planet = planetOrSatellite(read(text), place)
  const satellites = Array.isArray(planet.satellites) ? planet.satellites : []
  const satellite = kind === 'station'
    ? { name: String(name ?? '').trim(), kind: 'station', type: 'ring' }
    : { name: String(name ?? '').trim(), kind: 'moon', visualization: { seed: idOf(name, 'moon') } }
  const path = bodyPath(place)
  const next = Array.isArray(planet.satellites) ? appendItem(text, [...path, 'satellites'], satellite) : setKey(text, path, 'satellites', [satellite])
  return { text: next, index: satellites.length }
}

export function setBodyField(text, place, field, value) {
  const map = read(text)
  body(map, place)
  const path = bodyPath(place, map)
  return isEmpty(value) ? removeKey(text, path, field) : setKey(text, path, field, value)
}

/** Sets a field of `visualization` (`starVisualization` of a star); an empty value removes it, while `ring: null` means no ring. */
export function setBodyLook(text, place, field, value) {
  const map = read(text)
  const found = body(map, place)
  const path = bodyPath(place, map)
  const look = isStarPlace(place) ? 'starVisualization' : 'visualization'
  if (!isObject(found[look])) return isEmpty(value) ? text : setKey(text, path, look, { [field]: value })
  return isEmpty(value) ? removeKey(text, [...path, look], field) : setKey(text, [...path, look], field, value)
}

export function moveBody(text, place, delta) {
  const map = read(text)
  planetOrSatellite(map, place)
  const isSatellite = place.satellite !== null && place.satellite !== undefined
  const index = isSatellite ? place.satellite : place.planet
  const listPath = bodyPath(place).slice(0, -1)
  let list = map
  for (const step of listPath) list = list[step]
  const other = index + delta
  if (other < 0 || other >= list.length) return text
  return swapItems(text, listPath, index, other)
}

export function removeBody(text, place) {
  planetOrSatellite(read(text), place)
  const path = bodyPath(place)
  const next = removeItem(text, path.slice(0, -1), path.at(-1))
  return { text: next, orphans: lostFiles(text, next) }
}
