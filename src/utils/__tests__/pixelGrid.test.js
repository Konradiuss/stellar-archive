import { describe, expect, it } from 'vitest'
import { centeredCells } from '../pixelGrid'

// Row by row: how far the disk reaches left and right of its origin, in canvas pixels, as the planet renderer draws it.
function silhouette(center, radius, pixelSize, limit = Infinity) {
  const origin = Math.round(center)
  const cells = centeredCells(center, radius, pixelSize, limit)
  return cells.map(({ offset: dy }) => {
    const inside = cells.filter(({ offset: dx }) => Math.sqrt(dx * dx + dy * dy) <= radius)
    if (!inside.length) return null
    return { left: origin - inside[0].start, right: inside.at(-1).start + pixelSize - origin }
  }).filter(Boolean)
}

describe('centeredCells', () => {
  // Was: the grid was tied to the canvas corner and tested at cell corners, so the left edge of a planet came out shorter and flat.
  it.each([
    [118.5, 61.25, 4], // PLANET-VISUAL, odd canvas width
    [20, 14, 4], // a planet on the orbit
    [100, 33, 3.2], // a scaled pixel size
    [64.3, 40, 2]
  ])('draws a disk equally round on both sides (center %s, radius %s, pixel %s)', (center, radius, pixelSize) => {
    const rows = silhouette(center, radius, pixelSize)
    expect(rows.length).toBeGreaterThan(2)
    for (const row of rows) expect(row.left).toBeCloseTo(row.right, 6)
    expect(rows.map(row => row.left)).toEqual([...rows].reverse().map(row => row.left))
  })

  it('offsets cells symmetrically from the middle of each cell', () => {
    expect(centeredCells(10, 8, 4)).toEqual([
      { start: 2, offset: -6 },
      { start: 6, offset: -2 },
      { start: 10, offset: 2 },
      { start: 14, offset: 6 }
    ])
  })

  it('skips cells outside the canvas', () => {
    const cells = centeredCells(4, 12, 4, 10)
    expect(cells.map(cell => cell.start)).toEqual([0, 4, 8])
  })
})
