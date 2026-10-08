import { describe, expect, it } from 'vitest'
import { createViewportClipPath } from '../cursorClipping'

describe('cursorClipping', () => {
  it('converts screen bounds to viewport inset values', () => {
    const clipPath = createViewportClipPath(
      { top: 50, right: 790, bottom: 660, left: 12 },
      1000,
      800
    )

    expect(clipPath).toBe('inset(50px 210px 140px 12px)')
  })

  it('does not create negative insets for partially offscreen panels', () => {
    const clipPath = createViewportClipPath(
      { top: -10, right: 1020, bottom: 810, left: -5 },
      1000,
      800
    )

    expect(clipPath).toBe('inset(0px 0px 0px 0px)')
  })

  it('disables clipping without a target', () => {
    expect(createViewportClipPath(null, 1000, 800)).toBe('none')
  })
})
