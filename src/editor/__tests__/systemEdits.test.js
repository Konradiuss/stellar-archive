import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EditError } from '../starEdits'
import { addPlanet, addSatellite, addSystem, bodyAt, moveBody, removeBody, setBodyField, setBodyLook } from '../systemEdits'
import { swapItems } from '../jsonEdit'
import { lostFiles } from '../siteFiles'

const MAP = readFileSync('public/map.json', 'utf8')
const read = text => JSON.parse(text)
const failure = run => {
  try {
    run()
  } catch (error) {
    return error instanceof EditError ? [error.key, error.params] : error
  }
  return null
}
const earth = { star: 'sol', planet: read(MAP).systems.sol.planets.findIndex(planet => planet.name === 'Earth') }

describe('the form of a system', () => {
  it('gives a star a system, and its first planet', () => {
    const lone = '{ "stars": [{ "id": "a", "sectorX": 0, "sectorY": 0 }] }'
    expect(read(addSystem(lone, 'a')).systems).toEqual({ a: { planets: [] } })
    expect(addSystem(addSystem(lone, 'a'), 'a')).toBe(addSystem(lone, 'a'))
    const { text, index } = addPlanet(lone, 'a', { name: 'First World' })
    expect(index).toBe(0)
    expect(read(text).systems.a.planets).toEqual([{ name: 'First World', orbitRadius: 40, angle: 0, speed: 0.001, visualization: { seed: 'first-world' } }])
    const second = addPlanet(text, 'a', { name: 'Second' })
    expect(read(second.text).systems.a.planets[1]).toMatchObject({ name: 'Second', orbitRadius: 70, angle: 137 })
    expect(failure(() => addSystem(lone, 'b'))).toEqual(['editor.noStar', { id: 'b' }])
  })

  it('adds a planet after the others, touching only the end of the list', () => {
    const { text, index } = addPlanet(MAP, 'sol', { name: 'Nemesis' })
    const planets = read(MAP).systems.sol.planets
    expect(index).toBe(planets.length)
    expect(read(text).systems.sol.planets.slice(0, -1)).toEqual(planets)
    expect(text.length - MAP.length).toBeLessThan(260)
  })

  it('sets the fields and the look of a body', () => {
    let text = setBodyField(MAP, earth, 'name', 'Терра')
    text = setBodyField(text, earth, 'orbitRadius', 95)
    text = setBodyLook(text, earth, 'waterColor', '#0044ff')
    text = setBodyLook(text, earth, 'ring', { size: 'thin', color: '#00ffff' })
    const planet = bodyAt(read(text), earth)
    expect(planet).toMatchObject({ name: 'Терра', orbitRadius: 95 })
    expect(planet.visualization).toMatchObject({ seed: 'earth', waterColor: '#0044ff', ring: { size: 'thin', color: '#00ffff' } })
    expect(bodyAt(read(setBodyLook(text, earth, 'ring', null)), earth).visualization.ring).toBeNull()
    expect(bodyAt(read(setBodyLook(text, earth, 'waterColor', '')), earth).visualization).not.toHaveProperty('waterColor')
    expect(bodyAt(read(setBodyField(text, earth, 'speed', '')), earth)).not.toHaveProperty('speed')
    const plain = '{ "stars": [{ "id": "a" }], "systems": { "a": { "planets": [{ "name": "X" }] } } }'
    expect(read(setBodyLook(plain, { star: 'a', planet: 0 }, 'size', 80)).systems.a.planets[0].visualization).toEqual({ size: 80 })
    expect(setBodyLook(plain, { star: 'a', planet: 0 }, 'size', '')).toBe(plain)
    expect(failure(() => setBodyField(MAP, { star: 'sol', planet: 99 }, 'name', 'X'))).toEqual(['editor.noBody', {}])
  })

  it('adds moons and stations to a planet', () => {
    const moon = addSatellite(MAP, earth, { kind: 'moon', name: 'Selene' })
    const satellites = bodyAt(read(MAP), earth).satellites
    expect(moon.index).toBe(satellites.length)
    expect(bodyAt(read(moon.text), { ...earth, satellite: moon.index })).toEqual({ name: 'Selene', kind: 'moon', visualization: { seed: 'selene' } })
    const station = addSatellite(moon.text, earth, { kind: 'station', name: 'Gateway' })
    const place = { ...earth, satellite: station.index }
    expect(bodyAt(read(station.text), place)).toEqual({ name: 'Gateway', kind: 'station', type: 'ring' })
    const typed = setBodyField(setBodyField(station.text, place, 'type', 'shipyard'), place, 'lights', '#ff0000')
    expect(bodyAt(read(typed), place)).toMatchObject({ type: 'shipyard', lights: '#ff0000' })
    const lone = '{ "stars": [{ "id": "a" }], "systems": { "a": { "planets": [{ "name": "X" }] } } }'
    expect(read(addSatellite(lone, { star: 'a', planet: 0 }, { name: 'M' }).text).systems.a.planets[0].satellites).toHaveLength(1)
  })

  it('moves bodies up and down their lists', () => {
    const planets = read(MAP).systems.sol.planets
    const down = moveBody(MAP, { star: 'sol', planet: 0 }, 1)
    expect(read(down).systems.sol.planets.slice(0, 2)).toEqual([planets[1], planets[0]])
    expect(moveBody(MAP, { star: 'sol', planet: 0 }, -1)).toBe(MAP)
    expect(moveBody(MAP, { star: 'sol', planet: planets.length - 1 }, 1)).toBe(MAP)
    expect(swapItems('[1, 2, 3]', [], 2, 0)).toBe('[3, 2, 1]')
    expect(swapItems('[\n  { "a": 1 },\n  {\n    "b": 2\n  }\n]', [], 0, 1)).toBe('[\n  {\n    "b": 2\n  },\n  { "a": 1 }\n]')
  })

  it('deletes a body, and gives back the files nothing names any more', () => {
    const planet = bodyAt(read(MAP), earth)
    expect(planet.loreFile).toBe('lore/solar/earth.wiki')
    const { text, orphans } = removeBody(MAP, earth)
    expect(read(text).systems.sol.planets.some(each => each.name === 'Earth')).toBe(false)
    expect(orphans).toEqual(['lore/solar/earth.wiki', 'lore/solar/moon.wiki'])
    const shared = setBodyField(MAP, { star: 'sol', planet: 0 }, 'loreFile', 'lore/solar/earth.wiki')
    expect(removeBody(shared, earth).orphans).toEqual(['lore/solar/moon.wiki'])
    expect(lostFiles(MAP, MAP)).toEqual([])
  })
})
