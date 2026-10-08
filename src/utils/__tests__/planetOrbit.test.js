import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ORBIT_SPEED,
  getInitialOrbitAngle,
  getOrbitNumbers,
  getOrbitSpeed,
  plural,
  toRoman
} from '../planetOrbit'

describe('planetOrbit', () => {
  it('uses the configured orbit speed', () => {
    expect(getOrbitSpeed({ speed: 0.0015 })).toBe(0.0015)
    expect(getOrbitSpeed({ speed: 0 })).toBe(0)
  })

  it('falls back to the default speed for missing or invalid values', () => {
    expect(getOrbitSpeed({})).toBe(DEFAULT_ORBIT_SPEED)
    expect(getOrbitSpeed(null)).toBe(DEFAULT_ORBIT_SPEED)
    expect(getOrbitSpeed({ speed: '0.002' })).toBe(DEFAULT_ORBIT_SPEED)
    expect(getOrbitSpeed({ speed: Number.NaN })).toBe(DEFAULT_ORBIT_SPEED)
  })

  it('converts the configured angle from degrees to radians', () => {
    expect(getInitialOrbitAngle({ angle: 0 })).toBe(0)
    expect(getInitialOrbitAngle({ angle: 90 })).toBeCloseTo(Math.PI / 2)
    expect(getInitialOrbitAngle({ angle: 270 })).toBeCloseTo(Math.PI * 1.5)
  })

  it('starts at zero when the angle is missing or invalid', () => {
    expect(getInitialOrbitAngle({})).toBe(0)
    expect(getInitialOrbitAngle({ angle: null })).toBe(0)
    expect(getInitialOrbitAngle({ angle: Number.POSITIVE_INFINITY })).toBe(0)
  })

  it('numbers the orbits from the star outwards in the data order', () => {
    const sol = [40, 60, 80, 100, 70].map(orbitRadius => ({ orbitRadius }))
    expect(getOrbitNumbers(sol)).toEqual([1, 2, 4, 5, 3])
  })

  it('keeps the data order for equal radii and puts unknown radii last', () => {
    expect(getOrbitNumbers([{ orbitRadius: 50 }, {}, { orbitRadius: 50 }, { orbitRadius: 10 }])).toEqual([2, 4, 3, 1])
    expect(getOrbitNumbers([])).toEqual([])
  })

  it('writes planet designations in Roman numerals', () => {
    expect([1, 2, 3, 4, 5, 9, 14, 39].map(toRoman)).toEqual(['I', 'II', 'III', 'IV', 'V', 'IX', 'XIV', 'XXXIX'])
    expect(toRoman(40)).toBe('40')
    expect(toRoman(0)).toBe('0')
  })

  it('picks the English plural form', () => {
    const forms = ['PLANET', 'PLANETS']
    expect([1, 2, 0, 11, 21, 101, -1].map(count => plural(count, forms))).toEqual([
      'PLANET', 'PLANETS', 'PLANETS', 'PLANETS', 'PLANETS', 'PLANETS', 'PLANET'
    ])
  })
})
