import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  buildTerritories,
  calculatePolygonArea,
  isSimpleRing,
  pointInPolygon
} from '../territoryBuilder.js'
import { createGalaxyGeometry } from '../../config/mapGeometry.js'

const mapData = JSON.parse(
  readFileSync(new URL('../../../test-world/map.json', import.meta.url), 'utf8')
)

// The release map widened eastwards with a ring of Free Tide stars round two foreign enclaves.
const crowdedGalaxy = createGalaxyGeometry(13, mapData.galaxy.rows)
const tide = (id, sectorX, sectorY) => ({ id, name: id, faction: 'tide', sectorX, sectorY })
const crowdedStars = [
  ...mapData.stars,
  tide('tide-1', 9, 3), tide('tide-2', 10, 2), tide('tide-3', 11, 3), tide('tide-4', 10, 4),
  tide('tide-5', 9, 5), tide('tide-6', 11, 5), tide('tide-7', 10, 6),
  { id: 'enclave-concord', name: 'Concord Mission', faction: 'concord', sectorX: 9, sectorY: 4 },
  { id: 'enclave-combine', name: 'Combine Depot', faction: 'combine', sectorX: 11, sectorY: 4 }
]

function starCenter(star) {
  return [star.sectorX * 100 + 50, star.sectorY * 100 + 50]
}

function territoryContains(territory, point) {
  return pointInPolygon(point, territory.outer) &&
    !territory.holes.some(hole => pointInPolygon(point, hole))
}

describe('territories in a galaxy of another size', () => {
  it('stay inside a smaller map', () => {
    const galaxy = createGalaxyGeometry(6, 5)
    const stars = mapData.stars.filter(star => star.sectorX < 6 && star.sectorY < 5)
    const territories = buildTerritories(stars, mapData.factions, galaxy)
    expect(territories.length).toBeGreaterThan(0)
    territories.flatMap(territory => [territory.outer, ...territory.holes]).flat().forEach(([x, y]) => {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(galaxy.width)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(galaxy.height)
    })
  })

  it('reach past the old 16x9 edge on a bigger map', () => {
    const galaxy = createGalaxyGeometry(24, 14)
    const stars = [...mapData.stars, { id: 'far', name: 'Far', faction: mapData.stars[0].faction, sectorX: 22, sectorY: 12 }]
    const territories = buildTerritories(stars, mapData.factions, galaxy)
    const farthest = Math.max(...territories.flatMap(territory => territory.outer.map(([x]) => x)))
    expect(farthest).toBeGreaterThan(1600)
    expect(farthest).toBeLessThanOrEqual(galaxy.width)
  })
})

describe('dynamic territory geometry', () => {
  const territories = buildTerritories(crowdedStars, mapData.factions, crowdedGalaxy)

  it('builds simple finite rings entirely inside the map', () => {
    expect(territories.length).toBeGreaterThan(0)

    territories.forEach(territory => {
      const rings = [territory.outer, ...territory.holes]
      rings.forEach(ring => {
        expect(ring.length).toBeGreaterThanOrEqual(3)
        expect(isSimpleRing(ring)).toBe(true)
        expect(Math.abs(calculatePolygonArea(ring))).toBeGreaterThan(0)
        ring.forEach(([x, y]) => {
          expect(Number.isFinite(x)).toBe(true)
          expect(Number.isFinite(y)).toBe(true)
          expect(x).toBeGreaterThanOrEqual(0)
          expect(x).toBeLessThanOrEqual(crowdedGalaxy.width)
          expect(y).toBeGreaterThanOrEqual(0)
          expect(y).toBeLessThanOrEqual(crowdedGalaxy.height)
        })
      })
    })
  })

  it('cuts the Concord Mission out of the Free Tide', () => {
    const mission = crowdedStars.find(star => star.id === 'enclave-concord')
    const center = starCenter(mission)
    const tideTerritory = territories.find(territory => territory.faction === 'tide' && territory.holes.length > 0)
    const concordEnclave = territories.find(territory => (
      territory.faction === 'concord' && pointInPolygon(center, territory.outer)
    ))

    expect(tideTerritory).toBeDefined()
    expect(concordEnclave).toBeDefined()
    expect(tideTerritory.holes.some(hole => pointInPolygon(center, hole))).toBe(true)
    expect(pointInPolygon(center, concordEnclave.outer)).toBe(true)
  })

  it('builds both enclaves as detailed round contours and matching holes', () => {
    const tideTerritory = territories.find(territory => territory.faction === 'tide' && territory.holes.length > 0)
    const enclaveIds = ['enclave-concord', 'enclave-combine']

    enclaveIds.forEach(id => {
      const star = crowdedStars.find(candidate => candidate.id === id)
      const center = starCenter(star)
      const enclave = territories.find(territory => (
        territory.faction === star.faction && territoryContains(territory, center)
      ))
      const containingHole = tideTerritory.holes.find(hole => pointInPolygon(center, hole))

      expect(enclave).toBeDefined()
      expect(enclave.outer.length).toBeGreaterThanOrEqual(24)
      expect(containingHole).toBeDefined()
      expect(containingHole.length).toBeGreaterThanOrEqual(24)
    })
  })

  it('leaves an actual neutral gap where the Concord and the Combine meet', () => {
    const concordTerritories = territories.filter(territory => territory.faction === 'concord')
    const combineTerritories = territories.filter(territory => territory.faction === 'combine')
    const gapSamples = []

    // Between Sol and Cinder.
    for (let x = 250; x <= 350; x += 2) {
      const point = [x, 150]
      const inConcord = concordTerritories.some(territory => territoryContains(territory, point))
      const inCombine = combineTerritories.some(territory => territoryContains(territory, point))
      if (!inConcord && !inCombine) gapSamples.push(point)
      expect(inConcord && inCombine).toBe(false)
    }

    expect(gapSamples.length).toBeGreaterThanOrEqual(4)
  })

  it('is deterministic for the same map data', () => {
    expect(buildTerritories(crowdedStars, mapData.factions, crowdedGalaxy)).toEqual(territories)
  })
})
