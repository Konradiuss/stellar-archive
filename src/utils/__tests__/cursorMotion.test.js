import { describe, expect, it } from 'vitest'
import { FOLLOW_MS, followStep, toDevicePixel } from '../cursorMotion'

describe('the follow of the drawn cursor', () => {
  it('covers most of the way in its time constant and is there within a tenth of a second', () => {
    expect(followStep(0, 100, FOLLOW_MS)).toBeCloseTo(63.2, 1)
    expect(followStep(0, 100, 100)).toBeGreaterThan(96)
  })

  it('does not depend on the frame rate', () => {
    const once = followStep(0, 100, 33)
    const twice = followStep(followStep(0, 100, 16.5), 100, 16.5)
    expect(twice).toBeCloseTo(once, 9)
  })

  it('is there at once without a time constant, or when a hair away', () => {
    expect(followStep(3, 250, 16, 0)).toBe(250)
    expect(followStep(99.995, 100, 16)).toBe(100)
    expect(followStep(100, 100, 16)).toBe(100)
  })

  it('stays put on a frame of no time', () => {
    expect(followStep(10, 100, 0)).toBe(10)
    expect(followStep(10, 100, -5)).toBe(10)
  })
})

describe('the cursor on the screen pixels', () => {
  it('lands on whole CSS pixels at a scale of 100%', () => {
    expect(toDevicePixel(10.4, 1)).toBe(10)
    expect(toDevicePixel(10.6, 1)).toBe(11)
  })

  it('lands on the device pixels at 150%: two thirds of a CSS pixel apart', () => {
    for (const value of [10, 10.2, 10.5, 10.9, 11.3]) {
      const pixel = toDevicePixel(value, 1.5) * 1.5
      expect(pixel).toBeCloseTo(Math.round(pixel), 9)
    }
    expect(toDevicePixel(100 + 2 / 3, 1.5)).not.toBe(toDevicePixel(100, 1.5))
  })

  it('takes a missing scale as 100%', () => {
    expect(toDevicePixel(7.6, 0)).toBe(8)
    expect(toDevicePixel(7.6)).toBe(8)
  })
})
