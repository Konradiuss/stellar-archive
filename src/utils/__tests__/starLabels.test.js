import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  chooseLabelSides,
  fitStarLabel,
  labelFits,
  labelIsClear,
  layoutStarLabels,
  polylineSegments,
  resolveLabelSpace,
  sectorRect,
  segmentCrossesRect,
  starLabelRect,
  stepTyping,
  typedLabel,
  wrapName
} from '../starLabels.js'
import { routeHyperlines } from '../hyperlineRouter.js'
import { buildTerritories } from '../territoryBuilder.js'
import { getSectorCenter, normalizeGalaxyConfig } from '../../config/mapGeometry.js'

const mapData = JSON.parse(
  readFileSync(new URL('../../../public/map.json', import.meta.url), 'utf8')
)
// The release map is roomy: three stars squeezed in by Pelagos make one name wrap by words and one hide.
const crowdedMap = {
  ...mapData,
  stars: [
    ...mapData.stars,
    { id: 'commonwealth', name: 'Concord Commonwealth', sectorX: 5, sectorY: 6, faction: 'concord' },
    { id: 'dusk-gate', name: 'Dusk Gate', sectorX: 5, sectorY: 7, faction: 'combine' },
    { id: 'tidemark', name: 'Tidemark', sectorX: 4, sectorY: 7, faction: 'tide' }
  ]
}

describe('fitStarLabel', () => {
  it('keeps short names on one line of the big font', () => {
    expect(fitStarLabel('Sol')).toMatchObject({ lines: ['Sol'], fontSize: 10 })
  })

  it('wraps two words into two lines', () => {
    expect(fitStarLabel('Silent Reach')).toMatchObject({ lines: ['Silent', 'Reach'], fontSize: 10 })
  })

  it('cuts after a hyphen of the name itself', () => {
    expect(wrapName('Halcyon-442', 9, false)).toEqual(['Halcyon-', '442'])
  })

  it('switches to the small font and hyphenates a long word', () => {
    const fit = fitStarLabel('Concord Commonwealth')
    expect(fit.fontSize).toBe(8)
    expect(fit.lines).toEqual(['Concord', 'Common-', 'wealth'])
    expect(wrapName('Supercalifragilistic', 11, true)).toEqual(['Supercalif-', 'ragilistic'])
  })

  it('shortens a name that does not fit even the small font', () => {
    const fit = fitStarLabel('Great Northern Nebula of Orion')
    expect(fit.lines).toHaveLength(3)
    expect(fit.lines[2].endsWith('…')).toBe(true)
  })

  it('measures by the monospaced font', () => {
    const fit = fitStarLabel('Sol')
    expect(fit.width).toBe(3 * 10 + 4)
    expect(fit.height).toBe(11 + 4 + 2)
  })
})

describe('star label layout', () => {
  it('keeps every way to write a name of the sample map inside its own sector on both sides', () => {
    for (const star of [...mapData.stars, { name: 'Great Northern Nebula of Orion', sectorX: 0, sectorY: 0 }]) {
      const sector = sectorRect(star)
      for (const fit of labelFits(star.name)) {
        for (const side of ['below', 'above']) {
          const rect = starLabelRect(star, fit, side)
          expect(rect.left, star.name).toBeGreaterThanOrEqual(sector.left)
          expect(rect.right, star.name).toBeLessThanOrEqual(sector.right)
          expect(rect.top, star.name).toBeGreaterThanOrEqual(sector.top)
          expect(rect.bottom, star.name).toBeLessThanOrEqual(sector.bottom)
        }
      }
    }
  })

  it('offers narrower ways to write a name for a tight spot', () => {
    expect(labelFits('Dusk Gate').map(fit => [fit.lines, fit.fontSize])).toEqual([
      [['Dusk Gate'], 10],
      [['Dusk', 'Gate'], 10],
      [['Dusk Gate'], 8],
      [['Dusk', 'Gate'], 8]
    ])
    expect(labelFits('Thalassa').map(fit => [fit.lines, fit.fontSize])).toEqual([[['Thalassa'], 10], [['Thalassa'], 8]])
    expect(labelFits('Concord Commonwealth')).toHaveLength(1)
  })

  it('puts the name above a star whose hyperline leaves downwards', () => {
    const stars = [{ id: 'a', sectorX: 2, sectorY: 2 }, { id: 'b', sectorX: 3, sectorY: 4 }, { id: 'c', sectorX: 2, sectorY: 0 }]
    const down = { path: [{ x: 2, y: 2 }, { x: 3, y: 3 }, { x: 3, y: 4 }] }
    expect(chooseLabelSides(stars, [down])).toEqual(new Map([['a', 'above'], ['b', 'below'], ['c', 'below']]))
    const up = { path: [{ x: 2, y: 2 }, { x: 2, y: 1 }, { x: 2, y: 0 }] }
    expect(chooseLabelSides(stars, [down, up]).get('a')).toBe('below')
  })

  it('gives every star a label', () => {
    const labels = layoutStarLabels(mapData.stars)
    expect(labels.size).toBe(mapData.stars.length)
    expect([...labels.values()].every(label => label.side === 'below')).toBe(true)
  })
})

describe('room for star names', () => {
  const rect = { left: 10, top: 10, right: 30, bottom: 20 }

  it('tells whether a segment touches a rectangle', () => {
    expect(segmentCrossesRect({ x: 0, y: 15 }, { x: 40, y: 15 }, rect)).toBe(true) // through
    expect(segmentCrossesRect({ x: 12, y: 12 }, { x: 14, y: 14 }, rect)).toBe(true) // inside
    expect(segmentCrossesRect({ x: 0, y: 0 }, { x: 40, y: 5 }, rect)).toBe(false) // above
    expect(segmentCrossesRect({ x: 0, y: 40 }, { x: 5, y: 25 }, rect)).toBe(false) // aside
    expect(segmentCrossesRect({ x: 0, y: 0 }, { x: 20, y: 20 }, rect)).toBe(true) // diagonal in
  })

  it('moves a name to the free side instead of hiding it', () => {
    const star = { id: 'a', name: 'Sol', sectorX: 0, sectorY: 0 }
    const labels = layoutStarLabels([star])
    const below = [{ from: { x: 0, y: 72 }, to: { x: 100, y: 72 } }]
    expect(resolveLabelSpace(labels, [star], below).get('a')).toMatchObject({ side: 'above', hidden: false })
    const both = [...below, { from: { x: 0, y: 28 }, to: { x: 100, y: 28 } }]
    expect(resolveLabelSpace(labels, [star], both).get('a')).toMatchObject({ side: 'below', hidden: true })
  })

  it('wraps a name by words when one line has no room', () => {
    const star = { id: 'a', name: 'Dusk Gate', sectorX: 0, sectorY: 0 }
    const labels = layoutStarLabels([star])
    // Foreign lines at both ends of the one-line name (x 50±47), clear of a word per line (50±22).
    const sides = [5, 95].map(x => ({ from: { x, y: 0 }, to: { x, y: 100 }, faction: 'other' }))
    expect(resolveLabelSpace(labels, [star], sides).get('a')).toMatchObject({ lines: ['Dusk', 'Gate'], fontSize: 10, hidden: false })
  })

  // Was: a hyperline leaving the star itself hid its name.
  it('lets the star\'s own hyperlines run under its name, not other ones', () => {
    const star = { id: 'a', name: 'Vesper', sectorX: 1, sectorY: 1, faction: 'combine' }
    const rect = starLabelRect(star, fitStarLabel(star.name), 'below')
    const through = { from: { x: 150, y: 150 }, to: { x: 150, y: 250 } }
    expect(labelIsClear(star, rect, [{ ...through, ends: ['1,1', '1,2'] }])).toBe(true)
    expect(labelIsClear(star, rect, [{ ...through, ends: ['0,0', '1,2'] }])).toBe(false)
  })

  // Was: stars hid their names for touching their own border.
  it('lets the star\'s own border touch the edge of its name, not run through it', () => {
    const star = { id: 'a', name: 'Vesper', sectorX: 1, sectorY: 1, faction: 'combine' }
    const rect = starLabelRect(star, fitStarLabel(star.name), 'below')
    const edge = { from: { x: rect.right - 1, y: 100 }, to: { x: rect.right - 1, y: 200 } }
    const middle = { from: { x: 150, y: 100 }, to: { x: 150, y: 200 } }
    expect(labelIsClear(star, rect, [{ ...edge, faction: 'combine' }])).toBe(true)
    expect(labelIsClear(star, rect, [{ ...middle, faction: 'combine' }])).toBe(false)
    expect(labelIsClear(star, rect, [{ ...edge, faction: 'concord' }])).toBe(false)
  })

  it('shows only the names of the crowded map that have room', () => {
    const mapData = crowdedMap
    const galaxy = normalizeGalaxyConfig(mapData.galaxy, mapData.stars)
    const routes = routeHyperlines(mapData.hyperlines, mapData.stars, { columns: galaxy.columns, rows: galaxy.rows })
    const territories = buildTerritories(mapData.stars, mapData.factions, galaxy)
    const segments = [
      ...territories.flatMap(territory => [territory.outer, ...territory.holes]
        .flatMap(ring => polylineSegments(ring, true))
        .map(segment => ({ ...segment, faction: territory.faction }))),
      ...routes.flatMap(({ path }) => polylineSegments((path ?? []).map(point => getSectorCenter(point.x, point.y)))
        .map(segment => ({ ...segment, ends: [path[0], path.at(-1)].map(point => `${point.x},${point.y}`) })))
    ]
    const space = resolveLabelSpace(layoutStarLabels(mapData.stars, routes), mapData.stars, segments)
    const byName = name => space.get(mapData.stars.find(star => star.name === name).id)

    for (const star of mapData.stars) {
      const label = space.get(star.id)
      if (label.hidden) continue
      const key = `${star.sectorX},${star.sectorY}`
      const foreign = segments.filter(segment => !segment.ends?.includes(key) && segment.faction !== star.faction)
      expect(foreign.some(segment => segmentCrossesRect(segment.from, segment.to, label.rect)), star.name).toBe(false)
      expect(labelIsClear(star, label.rect, segments), star.name).toBe(true)
    }
    for (const name of ['Pelagos', 'Silent Reach', 'Tidemark']) expect(byName(name).hidden, name).toBe(false)
    expect(byName('Dusk Gate')).toMatchObject({ hidden: false, lines: ['Dusk', 'Gate'] })
    expect(byName('Concord Commonwealth').hidden).toBe(true)
    expect([...space.values()].filter(label => label.hidden).length).toBeLessThan(4)
  })
})

describe('typing a hidden name', () => {
  const lines = ['Concord', 'Common-', 'wealth']
  const lengths = text => text.split('\n').map(line => [...line].length)

  it('types letters behind a cursor without moving the lines', () => {
    expect(typedLabel(lines, 0)).toBe('_      \n       \n      ')
    expect(typedLabel(lines, 9)).toBe('Concord\nCo_    \n      ')
    expect(typedLabel(lines, 20)).toBe('Concord\nCommon-\nwealth')
    for (let count = 0; count <= 20; count++) expect(lengths(typedLabel(lines, count))).toEqual([7, 7, 6])
  })

  it('erases faster than it types and stops at the target', () => {
    expect(stepTyping(0, 20, 50)).toBe(2)
    expect(stepTyping(20, 20, 50)).toBe(20)
    expect(stepTyping(19, 20, 1000)).toBe(20)
    expect(stepTyping(1, 0, 1000)).toBe(0)
    expect(20 - stepTyping(20, 0, 50)).toBeGreaterThan(stepTyping(0, 20, 50))
  })
})
