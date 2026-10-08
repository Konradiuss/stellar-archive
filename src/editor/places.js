import { isObject } from '../utils/guards'

export function mapPlaces(map) {
  const places = []
  const systems = isObject(map?.systems) ? map.systems : {}
  for (const star of Array.isArray(map?.stars) ? map.stars : []) {
    if (!isObject(star) || typeof star.id !== 'string') continue
    places.push({ name: typeof star.name === 'string' ? star.name : star.id, depth: 0 })
    for (const planet of Array.isArray(systems[star.id]?.planets) ? systems[star.id].planets : []) {
      if (!isObject(planet) || typeof planet.name !== 'string') continue
      places.push({ name: planet.name, depth: 1 })
      for (const satellite of Array.isArray(planet.satellites) ? planet.satellites : []) {
        if (isObject(satellite) && typeof satellite.name === 'string' && satellite.name) places.push({ name: satellite.name, depth: 2 })
      }
    }
  }
  return places
}
