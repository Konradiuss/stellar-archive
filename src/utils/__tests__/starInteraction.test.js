import { describe, expect, it } from 'vitest'
import {
  STAR_TARGET_MIN_SIZE,
  findStarAtPoint,
  getStarInteractionRadius,
  getStarTargetSize,
  pointerMovedPastTolerance
} from '../starInteraction'
import { GALAXY_STAR_CORE_SIZE } from '../starRenderer'

describe('starInteraction', () => {
  it('keeps the magnetic target clickable when the visual is zoomed out', () => {
    const star = { id: 'sol', screenX: 100, screenY: 100, viewportScale: 0.25 }

    expect(getStarInteractionRadius(star)).toBe(25)
    expect(findStarAtPoint([star], 122, 100)).toBe(star)
    expect(findStarAtPoint([star], 126, 100)).toBeNull()
  })

  it('expands the interaction radius with a zoomed-in star', () => {
    const star = { id: 'sol', screenX: 100, screenY: 100, viewportScale: 2 }

    expect(getStarInteractionRadius(star)).toBe(60)
    expect(findStarAtPoint([star], 155, 100)).toBe(star)
  })

  it('chooses the nearest star when interaction areas overlap', () => {
    const first = { id: 'first', screenX: 100, screenY: 100, viewportScale: 1 }
    const second = { id: 'second', screenX: 130, screenY: 100, viewportScale: 1 }

    expect(findStarAtPoint([first, second], 118, 100)).toBe(second)
  })

  it('sizes the target square to frame the star core at any zoom', () => {
    const sizeAt = viewportScale => getStarTargetSize({ viewportScale })

    expect(sizeAt(1)).toBeGreaterThan(GALAXY_STAR_CORE_SIZE)
    expect(sizeAt(2)).toBeGreaterThan(GALAXY_STAR_CORE_SIZE * 2)
    expect(sizeAt(3)).toBeGreaterThan(sizeAt(2))
    expect(sizeAt(2)).toBeGreaterThan(sizeAt(1))
    expect(sizeAt(0.25)).toBe(STAR_TARGET_MIN_SIZE)
  })

  it('distinguishes a click from a viewport drag', () => {
    const start = { x: 10, y: 20 }

    expect(pointerMovedPastTolerance(start, { clientX: 14, clientY: 23 })).toBe(false)
    expect(pointerMovedPastTolerance(start, { clientX: 17, clientY: 20 })).toBe(true)
  })
})
