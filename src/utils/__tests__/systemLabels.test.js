import { describe, expect, it } from 'vitest'
import { placePlanetLabel, typePlanetLabel } from '../systemLabels'

function planet({ x, y, centerX = 400, text = 'EARTH', width = 60 }) {
  const leader = { clear: () => leader, moveTo: () => leader, lineTo: () => leader, stroke: () => leader }
  return {
    sprite: { x, y },
    centerX,
    centerY: 300,
    label: { x: 0, y: 0, height: 10, text: '' },
    labelContainer: {},
    labelWidth: width,
    labelSide: null,
    labelText: text,
    labelTypedCharacters: 0,
    labelTypingElapsed: 0,
    labelColor: 0xffffff,
    leader,
    isSelected: false
  }
}

describe('the labels of the planets', () => {
  it('hang on the outer side of the orbit, and move inwards at the edge of the window', () => {
    const screen = { width: 800, height: 600 }
    const right = planet({ x: 600, y: 300 })
    placePlanetLabel(right, screen)
    expect(right.label.x).toBeGreaterThan(0)

    const atEdge = planet({ x: 780, y: 300 })
    placePlanetLabel(atEdge, screen)
    expect(atEdge.label.x).toBeLessThan(0)
    const top = planet({ x: 600, y: 2 })
    placePlanetLabel(top, screen)
    expect(top.sprite.y + top.label.y).toBeGreaterThanOrEqual(6)
  })

  it('type the name in, a letter at a time with a cursor, then show it whole', () => {
    const body = planet({ x: 600, y: 300 })
    typePlanetLabel(body, 100)
    expect(body.label.text).toBe('EA_')
    typePlanetLabel(body, 1000)
    expect(body.label.text).toBe('EARTH')
    expect(body.labelTypedCharacters).toBeNull()
  })
})
