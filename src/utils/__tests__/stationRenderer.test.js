import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HULL_COLOR,
  STATION_GLYPHS,
  STATION_TYPES,
  createStationConfig,
  sampleStation
} from '../stationRenderer.js'

// The station on an n x n grid: colours by cell, null for empty space.
function render(config, t = 0, n = 48) {
  const cell = 2 / n
  const cells = []
  for (let row = 0; row < n; row++) {
    for (let column = 0; column < n; column++) {
      cells.push(sampleStation(config, -1 + (column + 0.5) * cell, -1 + (row + 0.5) * cell, t, { cell }))
    }
  }
  return cells
}

const filled = cells => cells.filter(color => color !== null).length

describe('station renderer', () => {
  it('reads the look from the map entry', () => {
    const config = createStationConfig({ name: 'Shipyard', type: 'shipyard', color: '0x806040', lights: '#00ff00' })
    expect(config).toMatchObject({ type: 'shipyard', hull: 0x806040, lights: 0x00ff00 })
    expect(config.palette.hull.base).toBe(0x806040)
    expect(createStationConfig({ type: 'sphere' })).toMatchObject({ type: 'ring', hull: DEFAULT_HULL_COLOR })
  })

  it.each(STATION_TYPES)('draws a %s inside its square, with lit windows', type => {
    const config = createStationConfig({ name: type, type })
    const cells = render(config)
    const share = filled(cells) / cells.length
    expect(share).toBeGreaterThan(0.08)
    expect(share).toBeLessThan(0.7)
    expect(cells).toContain(config.lights)
    expect(sampleStation(config, 1.2, 1.2, 0, { cell: 0.05 })).toBeNull()
  })

  it.each(STATION_TYPES)('moves a %s with time', type => {
    const config = createStationConfig({ name: type, type })
    const before = render(config, 0)
    const after = render(config, 2.3)
    const changed = before.filter((color, index) => color !== after[index]).length
    expect(changed).toBeGreaterThan(5)
  })

  it('keeps thin parts at least a pixel wide on a small grid', () => {
    const config = createStationConfig({ type: 'outpost' })
    expect(filled(render(config, 0, 12))).toBeGreaterThan(20)
  })

  it('has a glyph with one light for each type', () => {
    for (const type of STATION_TYPES) {
      const glyph = STATION_GLYPHS[type].join('')
      expect(glyph.split('L')).toHaveLength(2)
      expect(glyph).toMatch(/#/)
    }
  })
})
