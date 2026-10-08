import { describe, expect, it } from 'vitest'
import { PLANET_PRESETS, findPlanetPreset } from '../planetPresets'
import { EARTH_MAP } from '../planetPresets/earthMap'
import { DEFAULT_STRINGS } from '../../i18n/strings'
import {
  createPlanetVisualizationConfig,
  normalizePlanetConfig,
  preparePlanetSurface,
  samplePlanetSurface
} from '../planetRenderer'

const DEG = Math.PI / 180

// Faces the viewer at rotation 0 (|longitude| < 90°), where view and world coordinates coincide.
function sampleAt(prepared, longitude, latitude) {
  const x = Math.sin(longitude * DEG) * Math.cos(latitude * DEG)
  const y = -Math.sin(latitude * DEG)
  const z = Math.cos(longitude * DEG) * Math.cos(latitude * DEG)
  return samplePlanetSurface(prepared, x, y, z, 0, 0.5).band
}

describe('planet presets', () => {
  it('finds presets by name, ignoring case', () => {
    expect(findPlanetPreset('earth').id).toBe('earth')
    expect(findPlanetPreset(' Earth ').id).toBe('earth')
    expect(findPlanetPreset('JUPITER').id).toBe('jupiter')
    expect(findPlanetPreset('Neptune').id).toBe('neptune')
    expect(findPlanetPreset(' PLUTO ').id).toBe('pluto')
    expect(findPlanetPreset('phobos').id).toBe('phobos')
    expect(findPlanetPreset('earthling')).toBeNull()
    expect(findPlanetPreset(42)).toBeNull()
  })

  it('takes colours from the preset but size and ring from the map', () => {
    const config = normalizePlanetConfig({ seed: 'mars', size: 65, landColor: '0x00ff00', ring: { size: 'thin', color: '0xffffff' } })
    expect(config).toMatchObject({
      preset: 'mars',
      seed: PLANET_PRESETS.mars.seed,
      size: 65,
      landColor: PLANET_PRESETS.mars.config.landColor,
      waterAmount: 0,
      ring: { size: 'thin', color: 0xffffff }
    })
    expect(normalizePlanetConfig({ seed: 'saturn' }).ring).toMatchObject({ size: 'large' })
    expect(normalizePlanetConfig({ seed: 'saturn', ring: null }).ring).toBeNull()
  })

  it('keeps the preset when a normalized config is normalized again', () => {
    const once = createPlanetVisualizationConfig({ name: 'Earth', visualization: { seed: 'earth' } })
    expect(normalizePlanetConfig(once)).toEqual(once)
    expect(preparePlanetSurface(once).surface.type).toBe('map')
  })

  it('leaves ordinary seeds random as before', () => {
    const config = normalizePlanetConfig({ seed: 'some-random-world' })
    expect(config.preset).toBeNull()
    expect(preparePlanetSurface(config).surface).toBeNull()
  })

  it('draws the real continents of the Earth', () => {
    expect(EARTH_MAP).toHaveLength(64)
    expect(EARTH_MAP.every(row => row.length === 128)).toBe(true)

    const earth = preparePlanetSurface({ seed: 'earth' })
    const kinds = points => points.map(([longitude, latitude]) => sampleAt(earth, longitude, latitude))
    expect(kinds([[10, 23], [5, 25], [20, 20]]).filter(kind => kind === 'desert').length).toBeGreaterThanOrEqual(2)
    expect(kinds([[-30, 0], [-35, -20], [-25, 10]]).filter(kind => kind === 'ocean').length).toBeGreaterThanOrEqual(2)
    expect(kinds([[0, -80], [30, -82], [-40, -78]]).filter(kind => kind === 'ice').length).toBeGreaterThanOrEqual(2)
    expect(kinds([[-60, -5], [-65, -8], [-55, -3]]).filter(kind => kind === 'forest').length).toBeGreaterThanOrEqual(2)
  })

  it('puts the Great Red Spot and cloud bands on Jupiter', () => {
    const jupiter = preparePlanetSurface({ seed: 'jupiter' })
    const { latitude, longitude } = PLANET_PRESETS.jupiter.surface.spot
    expect(sampleAt(jupiter, longitude / DEG, Math.asin(latitude) / DEG)).toBe('spot')
    const bands = new Set([-60, -40, -20, 0, 20, 40, 60].map(lat => sampleAt(jupiter, -60, lat)))
    expect(bands.size).toBeGreaterThanOrEqual(3)
  })

  it('gives Mars polar caps and the Moon its craters, the same every time', () => {
    const mars = preparePlanetSurface({ seed: 'mars' })
    expect(sampleAt(mars, 0, 88)).toBe('ice')
    expect(sampleAt(mars, 0, -89)).toBe('ice')

    const moon = preparePlanetSurface({ seed: 'moon' })
    expect(moon.surface.craters).toHaveLength(PLANET_PRESETS.moon.surface.craters.count)
    expect(preparePlanetSurface({ seed: 'moon' }).surface.craters).toEqual(moon.surface.craters)
    const [crater] = moon.surface.craters
    const band = samplePlanetSurface(moon, crater.x, crater.y, crater.z, 0, 0.5).band
    expect(band).toBe('craterFloor')
  })

  it('puts the Great Dark Spot and a white cloud band on Neptune', () => {
    const neptune = preparePlanetSurface({ seed: 'neptune' })
    const { latitude, longitude } = PLANET_PRESETS.neptune.surface.spot
    expect(sampleAt(neptune, longitude / DEG, Math.asin(latitude) / DEG)).toBe('spot')
    const bands = new Set([-60, -40, -20, -8, 0, 20, 40, 60].map(lat => sampleAt(neptune, -60, lat)))
    expect(bands.size).toBeGreaterThanOrEqual(3)
  })

  // Was: a spot was drawn only on banded planets.
  it('puts the heart on Pluto, a terrain planet', () => {
    const pluto = preparePlanetSurface({ seed: 'pluto' })
    const { latitude, longitude } = PLANET_PRESETS.pluto.surface.spot
    expect(sampleAt(pluto, longitude / DEG, Math.asin(latitude) / DEG)).toBe('heart')
  })

  it('gives Uranus a thin ring the map may take away', () => {
    expect(normalizePlanetConfig({ seed: 'uranus' }).ring).toMatchObject({ size: 'thin' })
    expect(normalizePlanetConfig({ seed: 'uranus', ring: null }).ring).toBeNull()
  })

  it('names every preset in the data screen and in the editor', () => {
    for (const id of Object.keys(PLANET_PRESETS)) {
      expect(DEFAULT_STRINGS.presets[id], `presets.${id}`).toEqual(expect.any(String))
      expect(DEFAULT_STRINGS.planetPresets[id], `planetPresets.${id}`).toEqual(expect.any(String))
    }
  })
})
