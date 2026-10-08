import { describe, expect, it } from 'vitest'
import { createGalaxyGeometry } from '../../config/mapGeometry.js'
import {
  UNCHARTED_GRID_ALPHAS,
  distanceToMap,
  seedFromText,
  unchartedFog,
  unchartedGridSegments,
  unchartedRings,
  unchartedSectorLabels
} from '../unchartedSpace.js'

const geometry = createGalaxyGeometry(6, 4)
const seed = seedFromText('sol,asterion')

describe('uncharted space', () => {
  it('draws the same thing for the same map', () => {
    expect(unchartedGridSegments(geometry, { seed })).toEqual(unchartedGridSegments(geometry, { seed }))
    expect(unchartedFog(geometry, { seed })).toEqual(unchartedFog(geometry, { seed }))
    expect(unchartedGridSegments(geometry, { seed: seed + 1 })).not.toEqual(unchartedGridSegments(geometry, { seed }))
  })

  it('continues the grid only outside the map, fading with distance', () => {
    const segments = unchartedGridSegments(geometry, { seed })
    expect(segments.length).toBeGreaterThan(50)
    for (const segment of segments) {
      const midX = (segment.x1 + segment.x2) / 2
      const midY = (segment.y1 + segment.y2) / 2
      expect(distanceToMap(midX, midY, geometry)).toBeGreaterThan(0)
      expect(Math.abs(segment.x1 === segment.x2 ? segment.x1 : segment.y1) % 100).toBe(0)
    }
    const near = segments.filter(segment => segment.alpha === UNCHARTED_GRID_ALPHAS[0]).length
    const far = segments.filter(segment => segment.alpha === UNCHARTED_GRID_ALPHAS.at(-1)).length
    expect(near).toBeGreaterThan(0)
    expect(far / (geometry.columns + 2 * UNCHARTED_GRID_ALPHAS.length)).toBeLessThan(near / (geometry.columns + 2))
  })

  it('numbers some sectors of the first ring around the map', () => {
    const labels = unchartedSectorLabels(geometry, { seed })
    expect(labels.length).toBeGreaterThan(3)
    for (const { x, y } of labels) {
      const insideX = x >= 0 && x < geometry.width
      const insideY = y >= 0 && y < geometry.height
      expect(insideX && insideY).toBe(false)
      expect(x).toBeGreaterThanOrEqual(-100)
      expect(y).toBeLessThanOrEqual(geometry.height)
    }
  })

  it('keeps the fog of unknown clusters out of the charted map', () => {
    const fog = unchartedFog(geometry, { seed, rings: 5 })
    let filled = 0
    for (let ty = 0; ty < fog.height; ty++) {
      for (let tx = 0; tx < fog.width; tx++) {
        const level = fog.levels[ty * fog.width + tx]
        if (!level) continue
        filled++
        const x = fog.originX + (tx + 0.5) * fog.texel
        const y = fog.originY + (ty + 0.5) * fog.texel
        expect(distanceToMap(x, y, geometry)).toBeGreaterThan(0)
      }
    }
    expect(filled).toBeGreaterThan(0)
  })

  it('fills enough rings to reach the screen edge at the farthest zoom', () => {
    // 1600x900 map, 1500x800 screen, zoom 0.25: 6000x3200 world pixels are visible.
    const big = createGalaxyGeometry(16, 9)
    expect(unchartedRings(big, 1500, 800, 0.25)).toBeGreaterThanOrEqual(22)
    expect(unchartedRings(big, 1500, 800, 3)).toBe(UNCHARTED_GRID_ALPHAS.length)
  })
})
