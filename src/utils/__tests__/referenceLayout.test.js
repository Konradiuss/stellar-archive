import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { checkMap } from '../mapCheck'
import { getSectorCenter, normalizeGalaxyConfig } from '../../config/mapGeometry'
import { applyHyperlineStyles } from '../hyperlineStyle'
import { routeHyperlines } from '../hyperlineRouter'
import { labelFits, labelIsClear, layoutStarLabels, polylineSegments, resolveLabelSpace, starLabelRect } from '../starLabels'
import { buildTerritories } from '../territoryBuilder'

export function syntheticMap({ columns, rows, stars: count, lines, seed = 7 }) {
  let state = seed
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 2 ** 32
  }
  const factions = ['north', 'south', 'east', 'west']
  const taken = new Set()
  const stars = []
  while (stars.length < count) {
    const x = Math.floor(random() * columns)
    const y = Math.floor(random() * rows)
    if (taken.has(`${x},${y}`)) continue
    taken.add(`${x},${y}`)
    const faction = factions[(x * 2 >= columns ? 1 : 0) + (y * 2 >= rows ? 2 : 0)]
    stars.push({ id: `s${stars.length}`, name: `Star ${stars.length}`, sectorX: x, sectorY: y, faction: random() < 0.15 ? null : faction })
  }
  const hyperlines = []
  for (let index = 0; hyperlines.length < lines && index < lines * 20; index++) {
    const from = stars[Math.floor(random() * stars.length)]
    const near = stars.filter(star => star !== from && Math.abs(star.sectorX - from.sectorX) + Math.abs(star.sectorY - from.sectorY) <= 6)
    if (!near.length) continue
    const to = near[Math.floor(random() * near.length)]
    hyperlines.push({ id: `l${hyperlines.length}`, from: from.id, to: to.id, type: random() < 0.5 ? 'trade' : 'military' })
  }
  return {
    galaxy: { columns, rows },
    stars,
    hyperlines,
    factions: Object.fromEntries(factions.map((id, index) => [id, { name: id, fillColor: ['#2f8f46', '#2f62c8', '#b8352b', '#7c52c4'][index] }]))
  }
}

// Any speed-up of these builders must give the very same picture: the layout is pinned here to the last coordinate.
function layoutOf(raw) {
  const { data } = checkMap(raw)
  const galaxy = normalizeGalaxyConfig(data.galaxy, data.stars)
  const hyperlines = applyHyperlineStyles(data.hyperlines || [], data.hyperlineTypes || {})
  const routed = routeHyperlines(hyperlines, data.stars, { columns: galaxy.columns, rows: galaxy.rows })
  const labels = layoutStarLabels(data.stars, routed)
  const territories = buildTerritories(data.stars, data.factions || {}, galaxy)
  return {
    routes: routed.map(({ hyperline, path }) => ({ id: hyperline.id, path })),
    labels: [...labels].map(([id, label]) => ({ id, ...label })),
    territories: territories.map(({ faction, name, outer, holes }) => ({ faction, name, outer, holes }))
  }
}

// Brute force, one line at a time: what resolveLabelSpace must give with its index of near lines.
function roomOneByOne(labels, stars, segments) {
  const OTHER = { below: 'above', above: 'below' }
  return new Map(stars.filter(star => labels.has(star.id)).map(star => {
    const label = labels.get(star.id)
    for (const fit of labelFits(star.name)) {
      for (const side of [label.side, OTHER[label.side]]) {
        const rect = starLabelRect(star, fit, side)
        if (labelIsClear(star, rect, segments)) return [star.id, { ...label, ...fit, side, rect, hidden: false }]
      }
    }
    return [star.id, { ...label, hidden: true }]
  }))
}

describe('the room of the names', () => {
  it('is found among the near lines as among all of them', () => {
    const { data } = checkMap(syntheticMap({ columns: 30, rows: 20, stars: 160, lines: 70 }))
    const galaxy = normalizeGalaxyConfig(data.galaxy, data.stars)
    const routed = routeHyperlines(applyHyperlineStyles(data.hyperlines, {}), data.stars, { columns: galaxy.columns, rows: galaxy.rows })
    const labels = layoutStarLabels(data.stars, routed)
    const segments = [
      ...buildTerritories(data.stars, data.factions, galaxy).flatMap(territory => [territory.outer, ...territory.holes]
        .flatMap(ring => polylineSegments(ring, true)).map(segment => ({ ...segment, faction: territory.faction }))),
      ...routed.flatMap(({ hyperline, path }) => polylineSegments((path ?? []).map(point => getSectorCenter(point.x, point.y)))
        .map(segment => ({ ...segment, ends: [`${hyperline.from.sectorX},${hyperline.from.sectorY}`, `${hyperline.to.sectorX},${hyperline.to.sectorY}`] })))
    ]
    expect(resolveLabelSpace(labels, data.stars, segments)).toEqual(roomOneByOne(labels, data.stars, segments))
  })
})

describe('the layout of the reference map', () => {
  it('stays the same to the last coordinate', async () => {
    const layout = layoutOf(JSON.parse(readFileSync('test-world/map.json', 'utf8')))
    await expect(JSON.stringify(layout, null, 1)).toMatchFileSnapshot('./__snapshots__/referenceLayout.json')
  })

  // Was: a map of the biggest size (100x100 sectors) took minutes to lay out, and the tab froze on the loader.
  it('lays out a map of the biggest size in seconds', () => {
    const started = performance.now()
    const layout = layoutOf(syntheticMap({ columns: 100, rows: 100, stars: 1000, lines: 300 }))
    expect(layout.territories.length).toBeGreaterThan(0)
    expect(performance.now() - started).toBeLessThan(20_000)
  }, 60_000)

  it('stays the same on a bigger map too', async () => {
    const layout = layoutOf(syntheticMap({ columns: 30, rows: 20, stars: 160, lines: 70 }))
    await expect(JSON.stringify(layout)).toMatchFileSnapshot('./__snapshots__/syntheticLayout.json')
  })
})
