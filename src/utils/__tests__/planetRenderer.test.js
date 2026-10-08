import { describe, expect, it } from 'vitest'
import {
  TAU,
  createPlanetSurfaceMap,
  createPlanetVisualizationConfig,
  measurePlanetWaterCoverage,
  normalizePlanetConfig,
  planetScale,
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

  // Was: "no ring" removed the key and the preset's ring came back; a size of the map dropped the preset's colour.
  it('takes the ring of a ready planet, none, or its own over it', () => {
    expect(normalizePlanetConfig({ seed: 'saturn' }).ring).toEqual({ size: 'large', color: 0xd9c9a0 })
    expect(normalizePlanetConfig({ seed: 'saturn', ring: null }).ring).toBeNull()
    expect(normalizePlanetConfig({ seed: 'saturn', ring: false }).ring).toBeNull()
    expect(normalizePlanetConfig({ seed: 'saturn', ring: { size: 'thin' } }).ring).toEqual({ size: 'thin', color: 0xd9c9a0 })
    expect(normalizePlanetConfig({ seed: 'saturn', ring: { color: '#ff0000' } }).ring).toEqual({ size: 'large', color: 0xff0000 })
    expect(normalizePlanetConfig({ seed: 'earth', ring: { size: 'thin' } }).ring).toEqual({ size: 'thin', color: 0xaaaaaa })
    // Normalized again, the same ring.
    const once = normalizePlanetConfig({ seed: 'saturn', ring: { size: 'thin' } })
    expect(normalizePlanetConfig(once).ring).toEqual(once.ring)
  })

  // Was: "size" was read and shown, but the disc was drawn the same at any size.
  it('keeps the size between 25 and 150 and scales the disc by it, a ready planet too', () => {
    expect(normalizePlanetConfig({ size: 10 }).size).toBe(25)
    expect(normalizePlanetConfig({ size: 400 }).size).toBe(150)
    expect(normalizePlanetConfig({ size: 'big' }).size).toBe(100)
    expect(normalizePlanetConfig({ seed: 'earth', size: 50 }).size).toBe(50)
    expect(planetScale(normalizePlanetConfig({ size: 50 }))).toBe(0.5)
    expect(planetScale({ size: 400 })).toBe(1.5)
    expect(planetScale({ size: 'big' })).toBe(1)
    expect(planetScale(null)).toBe(1)
  })
})
