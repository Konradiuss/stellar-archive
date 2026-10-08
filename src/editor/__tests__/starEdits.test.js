import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  EditError, addFaction, addStar, formsCanEdit, idOf, moveStar, removeFaction, removeStar, renameStarId,
  setFactionField, setGalaxySize, setStarField, starAt, starLinks
} from '../starEdits'

const MAP = readFileSync(new URL('../../../test-world/map.json', import.meta.url), 'utf8')
const read = text => JSON.parse(text)
const failure = run => {
  try {
    run()
  } catch (error) {
    return error instanceof EditError ? [error.key, error.params] : error
  }
  return null
}

describe('the form of stars', () => {
  it('makes ids of names, none twice', () => {
    expect(idOf('Silent Reach')).toBe('silent-reach')
    expect(idOf('  Новая Земля! ')).toBe('новая-земля')
    expect(idOf('***')).toBe('star')
    const first = addStar(MAP, { name: 'Sol', sectorX: 0, sectorY: 0 })
    expect(first.id).toBe('sol-2')
    const second = addStar(first.text, { name: 'Sol', sectorX: 1, sectorY: 0, faction: 'concord' })
    expect(second.id).toBe('sol-3')
    expect(read(second.text).stars.at(-1)).toEqual({ id: 'sol-3', name: 'Sol', sectorX: 1, sectorY: 0, faction: 'concord' })
  })

  it('puts a new star only into an empty sector of the galaxy', () => {
    const sol = read(MAP).stars.find(star => star.id === 'sol')
    expect(failure(() => addStar(MAP, { name: 'X', sectorX: sol.sectorX, sectorY: sol.sectorY }))).toEqual(['editor.sectorTaken', { name: 'Sol' }])
    expect(failure(() => addStar(MAP, { name: 'X', sectorX: 8, sectorY: 0 }))).toEqual(['editor.badSector', {}])
    expect(failure(() => addStar(MAP, { name: 'X', sectorX: -1, sectorY: 0 }))).toEqual(['editor.badSector', {}])
    expect(read(addStar('{}', { name: 'First', sectorX: 3, sectorY: 4 }).text)).toEqual({ stars: [{ id: 'first', name: 'First', sectorX: 3, sectorY: 4 }] })
  })

  it('sets and clears the fields of a star', () => {
    const named = setStarField(MAP, 'sol', 'name', 'Солнце')
    expect(read(named).stars[0].name).toBe('Солнце')
    const unaligned = setStarField(MAP, 'sol', 'faction', '')
    expect(read(unaligned).stars[0]).not.toHaveProperty('faction')
    expect(read(setStarField(unaligned, 'sol', 'faction', 'combine')).stars[0].faction).toBe('combine')
    expect(failure(() => setStarField(MAP, 'nowhere', 'name', 'X'))).toEqual(['editor.noStar', { id: 'nowhere' }])
  })

  it('renames a star with its system and the routes that name it', () => {
    const text = renameStarId('{ "stars": [{ "id": "a" }, { "id": "b" }], "systems": { "a": { "planets": [] } }, "hyperlines": [{ "from": "a", "to": "b" }, { "from": "b", "to": "a" }] }', 'a', 'alpha')
    expect(read(text)).toEqual({
      stars: [{ id: 'alpha' }, { id: 'b' }],
      systems: { alpha: { planets: [] } },
      hyperlines: [{ from: 'alpha', to: 'b' }, { from: 'b', to: 'alpha' }]
    })
    expect(failure(() => renameStarId(text, 'alpha', 'b'))).toEqual(['editor.idTaken', { id: 'b' }])
    expect(failure(() => renameStarId(text, 'alpha', ' '))).toEqual(['editor.emptyId', {}])
    expect(renameStarId(text, 'alpha', 'alpha')).toBe(text)
  })

  it('moves a star with the routes that name its sector', () => {
    const map = read(MAP)
    const sol = map.stars.find(star => star.id === 'sol')
    const routes = map.hyperlines.filter(line => [line.from, line.to].some(end => end.sectorX === sol.sectorX && end.sectorY === sol.sectorY)).length
    expect(routes).toBeGreaterThan(0)
    const moved = read(moveStar(MAP, 'sol', 0, 7))
    expect(moved.stars.find(star => star.id === 'sol')).toMatchObject({ sectorX: 0, sectorY: 7 })
    const after = moved.hyperlines.filter(line => [line.from, line.to].some(end => end.sectorX === 0 && end.sectorY === 7)).length
    expect(after).toBe(routes)
    expect(starAt(moved, sol.sectorX, sol.sectorY)).toBeNull()
    expect(failure(() => moveStar(MAP, 'sol', map.stars[1].sectorX, map.stars[1].sectorY))[0]).toBe('editor.sectorTaken')
  })

  it('deletes a star, with its system and routes if asked', () => {
    const map = read(MAP)
    const links = starLinks(map, 'sol')
    expect(links.system).toBe(true)
    expect(links.lines.length).toBeGreaterThan(0)
    const removed = removeStar(MAP, 'sol')
    const gone = read(removed.text)
    expect(gone.stars.some(star => star.id === 'sol')).toBe(false)
    expect(gone.systems).not.toHaveProperty('sol')
    expect(gone.hyperlines).toHaveLength(map.hyperlines.length - links.lines.length)
    const solar = ['deimos', 'earth', 'europa', 'io', 'jupiter', 'mars', 'mercury', 'moon', 'neptune', 'phobos', 'saturn', 'titan', 'triton', 'uranus', 'venus']
    expect(removed.orphans).toEqual(solar.map(name => `lore/solar/${name}.wiki`))
    const kept = read(removeStar(MAP, 'sol', { withSystem: false, withLines: false }).text)
    expect(kept.systems).toHaveProperty('sol')
    expect(kept.hyperlines).toHaveLength(map.hyperlines.length)
  })
})

describe('the form of factions and of the galaxy', () => {
  it('adds a faction with colours of its own, and edits it', () => {
    const { text, id } = addFaction(MAP, { name: 'Free Traders' })
    expect(id).toBe('free-traders')
    const faction = read(text).factions[id]
    expect(faction).toMatchObject({ name: 'Free Traders', fillOpacity: 0.12, borderWidth: 2 })
    expect(faction.fillColor).toMatch(/^0x[0-9a-f]{6}$/)
    expect(read(setFactionField(text, id, 'fillColor', '#123456')).factions[id].fillColor).toBe('#123456')
    expect(read(addFaction('{ "stars": [] }', { name: 'A' }).text).factions).toEqual({ a: { name: 'A', fillColor: '0x00aaff', fillOpacity: 0.12, borderColor: '0x00aaff', borderWidth: 2 } })
    expect(failure(() => setFactionField(MAP, 'nobody', 'name', 'X'))).toEqual(['editor.noFaction', { id: 'nobody' }])
  })

  it('sets the opacity of a fill and the width of a border, and takes them away when emptied', () => {
    const set = setFactionField(setFactionField(MAP, 'concord', 'fillOpacity', 0.3), 'concord', 'borderWidth', 4)
    expect(read(set).factions.concord).toMatchObject({ fillOpacity: 0.3, borderWidth: 4 })
    const emptied = read(setFactionField(setFactionField(set, 'concord', 'fillOpacity', ''), 'concord', 'borderColor', ''))
    expect(emptied.factions.concord).not.toHaveProperty('fillOpacity')
    expect(emptied.factions.concord).not.toHaveProperty('borderColor')
    expect(emptied.factions.concord).toMatchObject({ name: 'Solar Concord', borderWidth: 4 })
  })

  it('deletes a faction and leaves its stars without one', () => {
    const map = read(removeFaction(MAP, 'concord'))
    expect(map.factions).not.toHaveProperty('concord')
    expect(map.stars.some(star => star.faction === 'concord')).toBe(false)
    expect(map.stars.find(star => star.id === 'sol')).not.toHaveProperty('faction')
  })

  it('sizes the galaxy around its stars', () => {
    expect(read(setGalaxySize(MAP, 20, 12)).galaxy).toEqual({ columns: 20, rows: 12 })
    expect(failure(() => setGalaxySize(MAP, 4, 4))[0]).toBe('editor.starOutside')
    expect(failure(() => setGalaxySize(MAP, 0, 4))).toEqual(['editor.badSize', { max: 100 }])
    expect(read(setGalaxySize('{ "stars": [] }', 3, 2)).galaxy).toEqual({ columns: 3, rows: 2 })
  })

  it('works only on a map file that reads', () => {
    expect(formsCanEdit(MAP)).toBe(true)
    expect(formsCanEdit('{ "stars": [ }')).toBe(false)
    expect(formsCanEdit('[]')).toBe(false)
  })
})
