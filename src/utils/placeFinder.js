const normalizeName = name => String(name ?? '').trim().replace(/_/g, ' ').toLowerCase()

/**
 * Order: a planet of the current system, a satellite there, a star (name or id),
 * then any planet or satellite. Returns { kind: 'star'|'planet'|'satellite',
 * starId, planetIndex?, satelliteIndex? } or null.
 */
export function createPlaceFinder(stars = [], systems = {}) {
  const starsByName = new Map()
  for (const star of stars ?? []) {
    starsByName.set(normalizeName(star.id), star.id)
    starsByName.set(normalizeName(star.name), star.id)
  }
  // Planets first: a planet wins over a satellite of the same name.
  const bodiesByName = new Map()
  const addBody = (name, target) => {
    const key = normalizeName(name)
    if (!key) return
    if (!bodiesByName.has(key)) bodiesByName.set(key, [])
    bodiesByName.get(key).push(target)
  }
  for (const [starId, system] of Object.entries(systems ?? {})) {
    (system?.planets ?? []).forEach((planet, planetIndex) => addBody(planet.name, { kind: 'planet', starId, planetIndex }))
  }
  for (const [starId, system] of Object.entries(systems ?? {})) {
    (system?.planets ?? []).forEach((planet, planetIndex) => {
      (Array.isArray(planet?.satellites) ? planet.satellites : []).forEach((satellite, satelliteIndex) => {
        if (satellite && typeof satellite === 'object') addBody(satellite.name, { kind: 'satellite', starId, planetIndex, satelliteIndex })
      })
    })
  }

  return function findPlace(name, contextStarId = null) {
    const key = normalizeName(name)
    if (!key) return null
    const bodies = bodiesByName.get(key) ?? []
    const local = bodies.find(body => body.starId === contextStarId)
    if (local) return { ...local }
    if (starsByName.has(key)) return { kind: 'star', starId: starsByName.get(key) }
    return bodies[0] ? { ...bodies[0] } : null
  }
}
