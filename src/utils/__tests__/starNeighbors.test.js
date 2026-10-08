import { describe, expect, it } from 'vitest'
import { findNeighborStars } from '../starNeighbors'

const stars = [
  { id: 'sol', name: 'Sol', sectorX: 2, sectorY: 2 },
  { id: 'asterion', name: 'Asterion', sectorX: 7, sectorY: 3 },
  { id: 'cinder', name: 'Cinder', sectorX: 4, sectorY: 4 },
  { id: 'lonely', name: 'Lonely', sectorX: 9, sectorY: 9 }
]
const line = (id, from, to, description) => ({ id, from: { sectorX: from[0], sectorY: from[1] }, to: { sectorX: to[0], sectorY: to[1] }, description })

describe('findNeighborStars', () => {
  const hyperlines = [
    line('gate', [2, 2], [7, 3], 'Gate'),
    line('trade', [4, 4], [2, 2], 'Trade'),
    line('duplicate', [7, 3], [2, 2], 'Second route to Asterion')
  ]

  it('finds stars at the other end of lines in both directions, once each', () => {
    const neighbors = findNeighborStars(stars, hyperlines, 'sol')
    expect(neighbors.map(item => item.star.id)).toEqual(['asterion', 'cinder'])
    expect(neighbors[0].hyperline.id).toBe('gate')
  })

  it('works from the other end of a line', () => {
    expect(findNeighborStars(stars, hyperlines, 'cinder').map(item => item.star.id)).toEqual(['sol'])
  })

  it('returns nothing for a star without lines or an unknown star', () => {
    expect(findNeighborStars(stars, hyperlines, 'lonely')).toEqual([])
    expect(findNeighborStars(stars, hyperlines, 'missing')).toEqual([])
    expect(findNeighborStars(stars, undefined, 'sol')).toEqual([])
  })
})
