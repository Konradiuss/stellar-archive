import { describe, expect, it } from 'vitest'
import { createPlaceFinder } from '../placeFinder'

const stars = [{ id: 'sol', name: 'Sol' }, { id: 'reach', name: 'Silent Reach' }]
const systems = {
  sol: { planets: [{ name: 'Earth', satellites: [{ name: 'Moon' }, null, { name: 'Exodus Station' }] }, { name: 'Mars' }] },
  reach: { planets: [{ name: 'Earth' }, { name: 'Moon' }] }
}

describe('finding a place by its name', () => {
  const find = createPlaceFinder(stars, systems)

  it('finds stars by name or id, whatever the case and "_"', () => {
    expect(find('sol')).toEqual({ kind: 'star', starId: 'sol' })
    expect(find('silent_reach')).toEqual({ kind: 'star', starId: 'reach' })
  })

  it('takes the place of the current system first, and a planet over a satellite', () => {
    expect(find('Earth', 'reach')).toEqual({ kind: 'planet', starId: 'reach', planetIndex: 0 })
    expect(find('Earth', 'sol')).toEqual({ kind: 'planet', starId: 'sol', planetIndex: 0 })
    expect(find('Moon')).toEqual({ kind: 'planet', starId: 'reach', planetIndex: 1 })
    expect(find('Moon', 'sol')).toEqual({ kind: 'satellite', starId: 'sol', planetIndex: 0, satelliteIndex: 0 })
  })

  it('counts satellites by their place in the list, past an entry that is none', () => {
    expect(find('Exodus Station')).toEqual({ kind: 'satellite', starId: 'sol', planetIndex: 0, satelliteIndex: 2 })
  })

  it('finds nothing for an unknown or empty name', () => {
    expect(find('Vesper')).toBeNull()
    expect(find('  ')).toBeNull()
  })
})
