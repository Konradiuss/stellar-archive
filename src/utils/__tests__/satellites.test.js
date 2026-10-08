import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ellipsePosition,
  findSatellite,
  getSatellites,
  layoutOrbits,
  miniOrbitLayout,
  miniOrbitReach,
  orbitDistances,
  planetViewLayout,
  fitPlanetView,
  needsSatelliteGrid,
  orbitLight,
  orbitViewSize,
  planetDiscShare,
  satelliteRows
} from '../satellites.js'
import { ringOuterRadius } from '../planetRenderer.js'

const degrees = radians => Math.round(((radians * 180) / Math.PI + 360) % 360)

describe('satellites', () => {
  afterEach(() => vi.restoreAllMocks())

  it('reads the satellites of a planet with defaults', () => {
    const planet = { name: 'Mars', satellites: [{ name: 'Phobos' }, { name: 'Deimos', distance: 4, size: 0.1, angle: 90, speed: 0.02 }] }
    const [phobos, deimos] = getSatellites(planet)
    expect(phobos).toMatchObject({ index: 0, kind: 'moon', distance: 2.2, size: 0.3, angle: 0, speed: 0.012 })
    expect(deimos).toMatchObject({ index: 1, distance: 4, size: 0.1, speed: 0.02 })
    expect(deimos.angle).toBeCloseTo(Math.PI / 2)
    expect(phobos.data).toBe(planet.satellites[0])
    expect(getSatellites({ name: 'Mercury' })).toEqual([])
  })

  it('replaces bad values and skips kinds it does not know', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const planet = { name: 'Earth', satellites: [{ name: 'Ark', kind: 'ark' }, { name: 'Moon', distance: -1, size: 'big' }, null] }
    const satellites = getSatellites(planet)
    expect(satellites).toHaveLength(1)
    expect(satellites[0]).toMatchObject({ index: 1, distance: 2.2, size: 0.3 })
    expect(warn).toHaveBeenCalledTimes(4)
    expect(warn.mock.calls[0][0]).toContain('"Ark" of "Earth"')
    expect(findSatellite(planet, 1).data.name).toBe('Moon')
    expect(findSatellite(planet, 0)).toBeNull()
  })

  it('reads stations with their type and their own defaults', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const planet = {
      name: 'Mars',
      satellites: [
        { name: 'Phobos' },
        { name: 'Shipyard', kind: 'station', type: 'shipyard' },
        { name: 'Node', kind: 'station' },
        { name: 'Sphere', kind: 'station', type: 'sphere' }
      ]
    }
    const [phobos, yard, node, sphere] = getSatellites(planet)
    expect(phobos).toMatchObject({ kind: 'moon', type: null })
    expect(yard).toMatchObject({ kind: 'station', type: 'shipyard', size: 0.35, speed: 0.02 })
    expect(yard.distance).toBeCloseTo(2.9)
    expect(node.type).toBe('ring')
    expect(sphere.type).toBe('ring')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('Station type "sphere" is unknown')
  })

  it('moves the bodies of one orbit together, spread evenly', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const planet = {
      name: 'Crown',
      satellites: [
        { name: 'A', distance: 3, angle: 10, speed: 0.01 },
        { name: 'B', distance: 3.001, speed: 0.05 },
        { name: 'C', distance: 3 },
        { name: 'D', distance: 5, kind: 'station' },
        { name: 'E', distance: 5, kind: 'station', angle: 45 }
      ]
    }
    const [a, b, c, d, e] = getSatellites(planet)
    expect([a, b, c].map(body => body.speed)).toEqual([0.01, 0.01, 0.01])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('"B" of "Crown": "speed" 0.05')
    expect([a, b, c].map(body => degrees(body.angle))).toEqual([10, 130, 250])
    expect(degrees(d.angle)).toBe(0)
    expect(degrees(e.angle)).toBe(45)
    expect([a, b, c, d, e].map(body => body.orbit)).toEqual([0, 0, 0, 1, 1])
    expect(orbitDistances([a, b, c, d, e])).toEqual([3, 5])
  })

  it('does not put bodies without an angle on one line', () => {
    const planet = { name: 'Jupiter', satellites: [{ name: 'Io' }, { name: 'Europa' }, { name: 'Ganymede' }] }
    const angles = getSatellites(planet).map(body => degrees(body.angle))
    expect(new Set(angles).size).toBe(3)
    expect(angles[0]).toBe(0)
  })

  it('lays orbits out in order, clear of each other and inside the window', () => {
    expect(layoutOrbits([2, 4], { unit: 10, minRadius: 15, maxRadius: 100, spacing: 8 })).toEqual({ radii: [20, 40], visible: 2 })
    expect(layoutOrbits([1.5, 1.6], { unit: 10, minRadius: 25, maxRadius: 100, spacing: 8 }).radii).toEqual([25, 33])
    expect(layoutOrbits([2, 20], { unit: 10, minRadius: 0, maxRadius: 100, spacing: 8 }).radii).toEqual([10, 100])
    const crowded = layoutOrbits([2, 2.1, 2.2, 2.3, 2.4, 2.5], { unit: 40, minRadius: 50, maxRadius: 80, spacing: 10 })
    expect(crowded).toEqual({ radii: [50, 60, 70, 80], visible: 4 })
    expect(layoutOrbits([2, 2.1], { unit: 40, minRadius: 50, maxRadius: 200, spacing: 2, reaches: [10, 10] }).radii).toEqual([80, 102])
    expect(layoutOrbits([], { maxRadius: 10 })).toEqual({ radii: [], visible: 0 })
  })

  it('keeps the bodies around a ringed planet out of the ring, the nearest six', () => {
    const planet = {
      name: 'Crown',
      satellites: Array.from({ length: 10 }, (_, index) => ({
        name: `s${index}`,
        kind: index % 2 ? 'station' : 'moon',
        distance: 1.5 + index * 0.4,
        size: 0.2
      }))
    }
    const satellites = getSatellites(planet)
    const view = planetViewLayout(satellites, { discRadius: 60, ringOuter: 2, maxRadius: 300 })
    expect(view.bodies.length).toBeLessThanOrEqual(6)
    expect(view.hidden).toBe(10 - view.bodies.length)
    expect(view.bodies.map(body => body.satellite.index)).toEqual([0, 1, 2, 3, 4, 5].slice(0, view.bodies.length))
    view.bodies.forEach(body => expect(body.orbitRadius - body.bodyRadius).toBeGreaterThan(120))
    view.bodies.slice(1).forEach((body, index) => {
      const previous = view.bodies[index]
      expect(body.orbitRadius - body.bodyRadius).toBeGreaterThanOrEqual(previous.orbitRadius + previous.bodyRadius)
    })
    view.bodies.forEach(body => expect(body.orbitRadius + body.bodyRadius).toBeLessThanOrEqual(300))
    const bare = planetViewLayout(satellites.slice(0, 1), { discRadius: 60, maxRadius: 300 })
    expect(bare.bodies[0].orbitRadius).toBe(90)
  })

  it('draws the planet smaller, not below 0.22, to show its satellites', () => {
    const mars = getSatellites({ name: 'Mars', satellites: [{ name: 'Shipyard', kind: 'station', distance: 1.6, size: 0.45 }, { name: 'Phobos', distance: 2.2, size: 0.14 }, { name: 'Deimos', distance: 3.2, size: 0.1 }] })
    const small = fitPlanetView(mars, { width: 340, height: 200, ringOuter: 1.8 })
    expect(small.hidden).toBe(0)
    expect(small.share).toBeLessThan(0.35)
    expect(small.share).toBeGreaterThanOrEqual(0.22)
    expect(fitPlanetView(mars, { width: 1600, height: 500, ringOuter: 1.8 }).share).toBe(0.35)
    const crowd = getSatellites({ name: 'Swarm', satellites: Array.from({ length: 10 }, (_, index) => ({ name: `s${index}`, kind: 'station', distance: 2 + index * 0.3 })) })
    const crowded = fitPlanetView(crowd, { width: 340, height: 200, ringOuter: 2 })
    expect(crowded.share).toBeLessThan(0.35)
    expect(crowded.hidden).toBeGreaterThan(0)
    expect(crowded.bodies.length).toBeGreaterThan(0)
    expect(crowded.hidden).toBe(10 - crowded.bodies.length)
  })

  it('draws a smaller or bigger planet with its satellites in step, never past the window', () => {
    const mars = getSatellites({ name: 'Mars', satellites: [{ name: 'Shipyard', kind: 'station', distance: 1.6, size: 0.45 }, { name: 'Phobos', distance: 2.2, size: 0.14 }, { name: 'Deimos', distance: 3.2, size: 0.1 }] })
    const view = { width: 1600, height: 500, ringOuter: 1.8 }
    const usual = fitPlanetView(mars, view)
    const half = fitPlanetView(mars, { ...view, scale: 0.5 })
    expect(half.share).toBeCloseTo(usual.share / 2)
    expect(half.hidden).toBe(0)
    half.bodies.forEach((body, index) => expect(body.orbitRadius).toBeLessThan(usual.bodies[index].orbitRadius))
    expect(planetDiscShare(0.5)).toBeCloseTo(0.175)
    expect(planetDiscShare(1.5)).toBe(0.48)
    const big = fitPlanetView(mars, { ...view, scale: 1.5 })
    expect(big.discRadius).toBeLessThan(250)
    big.bodies.forEach(body => expect(body.orbitRadius + body.bodyRadius).toBeLessThanOrEqual(800))
    expect(needsSatelliteGrid(mars, { width: 600, height: 400 }, 1.8, 0.5)).toBe(false)
  })

  it('puts the satellites in rows by orbit for the grid, nearest first', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const distances = [2.4, 2.1, 3, 3, 3.6, 3.6, 4.2, 4.6, 5, 5.6]
    const planet = {
      name: 'Crown',
      satellites: distances.map((distance, index) => ({ name: `s${index}`, kind: index % 2 ? 'station' : 'moon', distance }))
    }
    const rows = satelliteRows(getSatellites(planet))
    expect(rows.map(row => row.orbit)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(rows.map(row => row.distance)).toEqual([2.1, 2.4, 3, 3.6, 4.2, 4.6, 5, 5.6])
    expect(rows.map(row => row.bodies.map(body => body.index))).toEqual([[1], [0], [2, 3], [4, 5], [6], [7], [8], [9]])
    expect(satelliteRows([])).toEqual([])
  })

  it('knows the room of the orbits, and when only the grid shows every body', () => {
    // Beside the parameters (200 px and a gap of 20), at most 60% of the width.
    expect(orbitViewSize({ width: 1000, height: 400 }, true)).toEqual({ width: 600, height: 400 })
    expect(orbitViewSize({ width: 500, height: 200 }, true)).toEqual({ width: 280, height: 200 })
    expect(orbitViewSize({ width: 500, height: 200 }, false)).toEqual({ width: 500, height: 200 })

    const mars = getSatellites({ name: 'Mars', satellites: [{ name: 'Shipyard', kind: 'station', distance: 1.6, size: 0.45 }, { name: 'Phobos', distance: 2.2, size: 0.14 }, { name: 'Deimos', distance: 3.2, size: 0.1 }] })
    expect(needsSatelliteGrid(mars, { width: 600, height: 400 }, 1.8)).toBe(false)
    expect(needsSatelliteGrid(mars, { width: 90, height: 60 }, 1.8)).toBe(true)
    const crowd = getSatellites({ name: 'Swarm', satellites: Array.from({ length: 7 }, (_, index) => ({ name: `s${index}`, distance: 2 + index * 0.6, size: 0.05 })) })
    expect(needsSatelliteGrid(crowd, { width: 4000, height: 2000 })).toBe(true)
    expect(needsSatelliteGrid([], { width: 90, height: 60 })).toBe(false)
    expect(needsSatelliteGrid(crowd, { width: 0, height: 0 })).toBe(false)
  })

  it('shrinks crowded bodies before it hides them', () => {
    const planet = { name: 'Mars', satellites: [{ name: 'Shipyard', kind: 'station', distance: 1.6, size: 0.45 }, { name: 'Phobos', distance: 2.2, size: 0.14 }, { name: 'Deimos', distance: 3.2, size: 0.1 }] }
    const view = planetViewLayout(getSatellites(planet), { discRadius: 65, ringOuter: 1.8, maxRadius: 183 })
    expect(view.hidden).toBe(0)
    expect(view.bodies[0].bodyRadius).toBeLessThan(0.45 * 65)
  })

  it('keeps mini orbits between 10 and 24 px, out of the ring, a swarm after three bodies', () => {
    const bodies = count => getSatellites({ name: `p${count}`, satellites: Array.from({ length: count }, (_, index) => ({ name: `s${index}`, distance: 2 + index })) })
    expect(miniOrbitLayout(bodies(1), 7)).toEqual({ mode: 'rings', radii: [14] })
    expect(miniOrbitLayout(bodies(3), 7)).toEqual({ mode: 'rings', radii: [12, 18, 24] })
    // A medium ring reaches 12.6 px: the nearest orbit starts past it.
    const ringed = miniOrbitLayout(bodies(2), 7, 12.6)
    expect(ringed.radii[0]).toBe(16)
    expect(miniOrbitReach(ringed)).toBe(21)
    expect(miniOrbitLayout(bodies(10), 7)).toEqual({ mode: 'swarm', haloRadius: 20 })
    expect(miniOrbitLayout(bodies(10), 7, 19)).toEqual({ mode: 'swarm', haloRadius: 22 })
  })

  it('knows where the rings of a planet end', () => {
    expect(ringOuterRadius({ ring: { size: 'thin' } })).toBeCloseTo(1.65)
    expect(ringOuterRadius({ ring: { size: 'medium' } })).toBeCloseTo(1.8)
    expect(ringOuterRadius({ ring: { size: 'large' } })).toBeCloseTo(2)
    expect(ringOuterRadius({ ring: null })).toBe(0)
  })

  it('puts a satellite behind the planet on the far half of its tilted orbit', () => {
    expect(ellipsePosition(0, 100)).toEqual({ x: 100, y: 0, behind: false })
    const near = ellipsePosition(Math.PI / 2, 100)
    expect(near.y).toBeCloseTo(30)
    expect(near.behind).toBe(false)
    const far = ellipsePosition(-Math.PI / 2, 100)
    expect(far.y).toBeCloseTo(-30)
    expect(far.behind).toBe(true)
  })
})

describe('satellite light', () => {
  it('dims smoothly on the way behind the planet', () => {
    expect(orbitLight(Math.PI / 2)).toBe(1)
    expect(orbitLight(-Math.PI / 2)).toBeCloseTo(0.6)
    expect(orbitLight(0)).toBeCloseTo(0.8)
    expect(orbitLight(0.001)).toBeCloseTo(orbitLight(-0.001), 2)
    let previous = orbitLight(0)
    for (let step = 1; step <= 360; step++) {
      const light = orbitLight((step * Math.PI) / 180)
      expect(Math.abs(light - previous)).toBeLessThan(0.02)
      previous = light
    }
  })
})

describe('satellite dot colour', () => {
  it('mixes land and liquid by the share of liquid', async () => {
    const { bodyDotColor } = await import('../satellites.js')
    expect(bodyDotColor({ landColor: 0x9a9a9a, waterColor: 0x000000, waterAmount: 0 })).toBe(0x9a9a9a)
    expect(bodyDotColor({ landColor: 0x000000, waterColor: 0x0000ff, waterAmount: 1 })).toBe(0x0000ff)
    expect(bodyDotColor({ landColor: 0x000000, waterColor: 0x00ff00, waterAmount: 0.5 })).toBe(0x008000)
    expect(bodyDotColor(null)).toBe(0xb8b8b8)
  })
})
