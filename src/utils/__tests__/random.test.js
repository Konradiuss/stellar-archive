import { describe, expect, it } from 'vitest'
import { hashText, mulberry32 } from '../random'
import { hashPlanetSeed } from '../planetRenderer'

// Every planet, star, casing and uncharted cluster hangs on these numbers: changing the formulas would redraw every existing map.
describe('the randomness of the pixel art', () => {
  it('gives the very same numbers it always gave', () => {
    expect(hashText('planet')).toBe(2224108531)
    expect(hashText('Сол')).toBe(2458068823)
    expect(hashPlanetSeed()).toBe(2224108531)
    const next = mulberry32(hashText('earth'))
    expect([next(), next()]).toEqual([0.807413699105382, 0.9921774505637586])
  })
})
