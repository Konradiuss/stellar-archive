import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildLegend, cssColor } from '../mapLegend.js'

const mapData = JSON.parse(
  readFileSync(new URL('../../../test-world/map.json', import.meta.url), 'utf8')
)
const section = (sections, id) => sections.find(item => item.id === id)

describe('map legend', () => {
  it('reads colours of the map file', () => {
    expect(cssColor('0x00AAFF')).toBe('#00aaff')
    expect(cssColor(0xff00)).toBe('#00ff00')
    expect(cssColor('#123456')).toBe('#123456')
    expect(cssColor('red')).toBeNull()
  })

  // Was: the legend was only a line of text written by hand.
  it('lists the factions of the map with their colours and stars', () => {
    const factions = section(buildLegend(mapData), 'factions').rows
    expect(factions.map(row => row.id)).toEqual(Object.keys(mapData.factions))
    expect(factions[0]).toMatchObject({ name: mapData.factions.concord.name, border: '#00aaff', fill: '#0088ff' })
    const withFaction = mapData.stars.filter(star => mapData.factions[star.faction]).length
    expect(factions.reduce((sum, row) => sum + row.count, 0)).toBe(withFaction)
  })

  it('counts stars without a faction apart', () => {
    const stars = [{ id: 'a', faction: 'concord' }, { id: 'b' }]
    const rows = section(buildLegend({ stars, factions: { concord: { name: 'Concord' } } }), 'factions').rows
    expect(rows.map(row => [row.name, row.count])).toEqual([['Concord', 1], ['No faction', 1]])
  })

  it('shows every hyperline type once, named by the map or the built-in names', () => {
    const lines = section(buildLegend(mapData), 'lines').rows
    expect(lines.map(row => row.name).sort()).toEqual(['Industrial Line', 'Military Corridor', 'Quantum Gates', 'Supply Line', 'Trade Route'])
    const renamed = section(buildLegend({ ...mapData, hyperlineTypes: { trade: 'Trade routes' } }), 'lines').rows
    expect(renamed.some(row => row.name === 'Trade routes')).toBe(true)
    expect(section(buildLegend({ hyperlines: [{ type: 'smuggling', color: '0x123456' }] }), 'lines').rows[0])
      .toMatchObject({ name: 'smuggling', color: '#123456' })
  })

  it('takes the name and the colour of a line from its type', () => {
    const rows = section(buildLegend({
      hyperlines: [{ id: 'a', type: 'smuggling' }],
      hyperlineTypes: { smuggling: { name: 'Smuggling', color: '#123456', width: 3 } }
    }), 'lines').rows
    expect(rows[0]).toMatchObject({ name: 'Smuggling', color: '#123456', width: 3 })
  })

  it('keeps the note of the map file', () => {
    const doc = { blocks: [] }
    expect(section(buildLegend({ ...mapData, legendDoc: doc }), 'note').doc).toBe(doc)
    expect(section(buildLegend(mapData), 'note')).toBeUndefined()
  })

  it('shows the star, its links and its note inside a system', () => {
    const doc = { blocks: [] }
    const systems = { ...mapData.systems, sol: { ...mapData.systems.sol, legendDoc: doc } }
    const sections = buildLegend({ ...mapData, systems }, { view: 'system', starId: 'sol' })
    const about = section(sections, 'system').rows
    expect(about[0]).toMatchObject({ kind: 'star', name: 'Sol' })
    expect(about.find(row => row.kind === 'faction')).toMatchObject({ id: 'concord' })
    expect(about.find(row => row.id === 'planets').count).toBe(mapData.systems.sol.planets.length)
    const links = section(sections, 'links').rows
    expect(links.length).toBeGreaterThan(0)
    expect(links.find(row => row.target === 'Asterion')).toMatchObject({ name: 'Quantum Gates', color: '#00ffff' })
    expect(section(sections, 'note').doc).toBe(doc)
    expect(section(sections, 'signs').rows.map(row => row.kind)).toEqual(['orbit', 'planet', 'satellite', 'station', 'target'])
    expect(about.find(row => row.id === 'satellites').count).toBe(7)
    expect(about.find(row => row.id === 'stations').count).toBe(1)
  })

  it('shows no moon rows in a system that has only stations', () => {
    const sections = buildLegend(mapData, { view: 'system', starId: 'cinder' })
    const about = section(sections, 'system').rows
    expect(about.find(row => row.id === 'satellites')).toBeUndefined()
    expect(about.find(row => row.id === 'stations').count).toBe(1)
    expect(section(sections, 'signs').rows.map(row => row.kind)).toEqual(['orbit', 'planet', 'station', 'target'])
  })
})
