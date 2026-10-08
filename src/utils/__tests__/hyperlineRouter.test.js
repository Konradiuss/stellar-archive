import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { findGridPath, routeHyperlines } from '../hyperlineRouter.js'

const mapData = JSON.parse(
  readFileSync(new URL('../../../public/map.json', import.meta.url), 'utf8')
)
const grid = { columns: mapData.galaxy.columns, rows: mapData.galaxy.rows }

// The release map with a field of extra stars around Nacre and Pelagos: two of its lines must go a long way round.
const FILLER_CELLS = [[4, 2], [4, 3], [4, 4], [4, 5], [4, 6], [3, 5], [5, 4], [5, 3], [2, 4], [2, 5], [3, 6], [5, 6], [6, 5]]
const denseStars = [
  ...mapData.stars,
  ...FILLER_CELLS.map(([sectorX, sectorY], index) => ({ id: `filler-${index}`, name: `Filler ${index}`, sectorX, sectorY }))
]

describe('hyperlines and star names', () => {
  // Names are written under the stars: a line should not leave a star downwards through its name when an equally short way exists.
  const stars = [{ id: 'a', sectorX: 2, sectorY: 2 }, { id: 'b', sectorX: 4, sectorY: 3 }]

  it('leaves the start star sideways rather than down through its name', () => {
    const path = findGridPath({ from: stars[0], to: stars[1], stars })
    expect(path[1]).toEqual({ x: 3, y: 2 })
  })

  it('reaches the end star from above rather than from under its name', () => {
    const path = findGridPath({ from: stars[1], to: stars[0], stars })
    expect(path.at(-2)).toEqual({ x: 3, y: 2 })
  })
})

describe('hyperline router', () => {
  const routed = routeHyperlines(mapData.hyperlines, mapData.stars, grid)

  it('routes every sample hyperline to its exact destination', () => {
    expect(routed).toHaveLength(mapData.hyperlines.length)

    routed.forEach(({ hyperline, path }) => {
      expect(path).not.toBeNull()
      expect(path[0]).toEqual({
        x: hyperline.from.sectorX,
        y: hyperline.from.sectorY
      })
      expect(path.at(-1)).toEqual({
        x: hyperline.to.sectorX,
        y: hyperline.to.sectorY
      })
    })
  })

  it('keeps all steps bounded, adjacent and outside unrelated star cells', () => {
    routed.forEach(({ hyperline, path }) => {
      const allowedStars = new Set([
        `${hyperline.from.sectorX},${hyperline.from.sectorY}`,
        `${hyperline.to.sectorX},${hyperline.to.sectorY}`
      ])
      const blockedStars = new Set(mapData.stars
        .map(star => `${star.sectorX},${star.sectorY}`)
        .filter(key => !allowedStars.has(key)))

      path.forEach((point, index) => {
        expect(point.x).toBeGreaterThanOrEqual(0)
        expect(point.x).toBeLessThan(grid.columns)
        expect(point.y).toBeGreaterThanOrEqual(0)
        expect(point.y).toBeLessThan(grid.rows)
        expect(blockedStars.has(`${point.x},${point.y}`)).toBe(false)

        if (index === 0) return
        const previous = path[index - 1]
        const dx = Math.abs(point.x - previous.x)
        const dy = Math.abs(point.y - previous.y)
        expect(Math.max(dx, dy)).toBe(1)
      })
    })
  })

  it('fixes the two routes that previously ran for 1000 steps', () => {
    const problemRoutes = routeHyperlines(mapData.hyperlines, denseStars, grid).filter(({ hyperline }) => (
      hyperline.id === 'trade-nacre-pelagos' || hyperline.id === 'gate-nacre-halcyon'
    ))
    expect(problemRoutes).toHaveLength(2)
    problemRoutes.forEach(({ hyperline, path }) => {
      expect(path).not.toBeNull()
      expect(path.at(-1)).toEqual({ x: hyperline.to.sectorX, y: hyperline.to.sectorY })
      expect(path.length - 1).toBeGreaterThan(6)
      expect(path.length - 1).toBeLessThan(16)
    })
  })

  it('produces deterministic routes', () => {
    expect(routeHyperlines(mapData.hyperlines, mapData.stars, grid)).toEqual(routed)
  })
})
