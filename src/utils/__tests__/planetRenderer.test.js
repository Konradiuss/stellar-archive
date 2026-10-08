import { describe, expect, it } from 'vitest'
import {
  TAU,
  createPlanetSurfaceMap,
  createPlanetVisualizationConfig,
  measurePlanetWaterCoverage,
  normalizePlanetConfig,
  preparePlanetSurface,
  samplePlanetSurface,
  valueNoise3D
} from '../planetRenderer'

function getMapCoherence(map) {
  let matchingNeighbours = 0
  let comparisons = 0

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const index = y * map.width + x
      const right = y * map.width + ((x + 1) % map.width)
      matchingNeighbours += map.waterMask[index] === map.waterMask[right] ? 1 : 0
      comparisons++

      if (y + 1 < map.height) {
        matchingNeighbours += map.waterMask[index] === map.waterMask[index + map.width] ? 1 : 0
        comparisons++
      }
    }
  }

  return matchingNeighbours / comparisons
}

function getMajorLandComponents(map, minimumShare = 0.03) {
  const seen = new Uint8Array(map.waterMask.length)
  const componentSizes = []
  let landCells = 0

  for (const value of map.waterMask) landCells += value === 0 ? 1 : 0

  for (let start = 0; start < seen.length; start++) {
    if (seen[start] || map.waterMask[start]) continue

    let size = 0
    const pending = [start]
    seen[start] = 1

    while (pending.length > 0) {
      const index = pending.pop()
      const x = index % map.width
      const y = Math.floor(index / map.width)
      size++

      const neighbours = [
        y * map.width + ((x + map.width - 1) % map.width),
        y * map.width + ((x + 1) % map.width),
        y > 0 ? index - map.width : -1,
        y + 1 < map.height ? index + map.width : -1
      ]
      for (const neighbour of neighbours) {
        if (neighbour >= 0 && !seen[neighbour] && map.waterMask[neighbour] === 0) {
          seen[neighbour] = 1
          pending.push(neighbour)
        }
      }
    }

    componentSizes.push(size)
  }

  return componentSizes.filter(size => size / landCells >= minimumShare)
}

describe('planetRenderer', () => {
  it('normalizes zero values, colors, liquid fallbacks, and stable seeds', () => {
    const config = normalizePlanetConfig({
      landColor: '0x000000',
      waterColor: 0,
      waterAmount: 0,
      waterType: 'oil',
      seed: 17
    })

    expect(config.landColor).toBe(0)
    expect(config.waterColor).toBe(0)
    expect(config.waterAmount).toBe(0)
    expect(config.seed).toBe(17)
    expect(normalizePlanetConfig(config).seed).toBe(17)
    expect(normalizePlanetConfig({ waterType: 'lava' }).waterColor).toBe(0xff4400)
    expect(normalizePlanetConfig({ waterType: 'unknown' }).waterType).toBe('water')

    const first = createPlanetVisualizationConfig({ name: 'Earth', visualization: {} })
    const second = createPlanetVisualizationConfig({ name: 'Earth', visualization: {} })
    const other = createPlanetVisualizationConfig({ name: 'Mars', visualization: {} })
    expect(first.seed).toBe(second.seed)
    expect(first.seed).not.toBe(other.seed)
  })

  it('interpolates value noise continuously between lattice points', () => {
    const before = valueNoise3D(0.9999, 2.4, -1.7, 42)
    const after = valueNoise3D(1.0001, 2.4, -1.7, 42)
    expect(Math.abs(before - after)).toBeLessThan(0.002)
  })

  it.each([0, 0.3, 0.7, 1])(
    'keeps global water coverage near %s',
    waterAmount => {
      const coverage = measurePlanetWaterCoverage({ seed: 42, waterAmount })
      expect(Math.abs(coverage - waterAmount)).toBeLessThanOrEqual(0.02)
    }
  )

  it('renders deterministic terrain, while different seeds change the surface', () => {
    const first = preparePlanetSurface({ seed: 12, waterAmount: 0.5 })
    const second = preparePlanetSurface({ seed: 12, waterAmount: 0.5 })
    const other = preparePlanetSurface({ seed: 13, waterAmount: 0.5 })
    const sample = prepared => samplePlanetSurface(prepared, 0.2, -0.3, Math.sqrt(0.87), 0.75, 0.25)

    expect(sample(first)).toEqual(sample(second))
    expect(sample(first).elevation).not.toBe(sample(other).elevation)
  })

  it('wraps rotation without a texture seam', () => {
    const start = createPlanetSurfaceMap(
      { seed: 91, waterAmount: 0.6 },
      { width: 64, height: 32, rotation: 0 }
    )
    const wrapped = createPlanetSurfaceMap(
      { seed: 91, waterAmount: 0.6 },
      { width: 64, height: 32, rotation: TAU }
    )

    expect(wrapped.waterMask).toEqual(start.waterMask)
    expect(wrapped.elevations).toEqual(start.elevations)
  })

  it('forms coherent regions with several major landmasses', () => {
    const map = createPlanetSurfaceMap(
      { seed: 777, waterAmount: 0.5 },
      { width: 128, height: 64 }
    )
    const majorLandmasses = getMajorLandComponents(map)

    expect(getMapCoherence(map)).toBeGreaterThan(0.85)
    expect(majorLandmasses.length).toBeGreaterThanOrEqual(2)
    expect(majorLandmasses.length).toBeLessThanOrEqual(6)
  })
})
