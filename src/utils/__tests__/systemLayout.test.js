import { describe, expect, it } from 'vitest'
import { MIN_STAR_SCALE, STAR_CAPTION_CLEARANCE, STAR_CAPTION_GAP, STAR_CAPTION_HEIGHT, STAR_CORE_RADIUS, orbitArea, orbitScaler, starCaptionY, starScaleFor } from '../systemLayout'

describe('starCaptionY', () => {
  it('puts the caption below the outermost orbit', () => {
    expect(starCaptionY(300, 250)).toBe(300 + 250 + STAR_CAPTION_GAP)
  })

  // Was: a system without planets had its caption under the star sprite.
  it('keeps the caption below the star when there are no orbits', () => {
    expect(starCaptionY(300, 0)).toBe(300 + STAR_CAPTION_CLEARANCE + STAR_CAPTION_GAP)
    expect(starCaptionY(300)).toBe(starCaptionY(300, 0))
    expect(starCaptionY(300, 20)).toBe(starCaptionY(300, 0))
  })
})

// Was: in a narrow window the orbits shrank and the star did not: Mercury and Venus circled inside the sun.
describe('starScaleFor', () => {
  it('keeps the full star while the innermost orbit is clear of it', () => {
    expect(starScaleFor(100, 11)).toBe(1)
    expect(starScaleFor(STAR_CORE_RADIUS + 11, 11)).toBe(1)
  })

  it('shrinks the star inside the innermost orbit, in steps', () => {
    const scale = starScaleFor(38, 11)
    expect(scale).toBe(0.5)
    expect(STAR_CORE_RADIUS * scale).toBeLessThanOrEqual(38 - 11)
  })

  it('never makes the star smaller than a star, nor scales a system without planets', () => {
    expect(starScaleFor(5, 11)).toBe(MIN_STAR_SCALE)
    expect(starScaleFor(0)).toBe(1)
    expect(starScaleFor(undefined)).toBe(1)
  })
})

// Was: on a narrow window Mercury sat inside the Sun.
describe('orbitScaler', () => {
  const SOL = [45, 71, 97, 123, 149, 175, 201, 227]
  const edge = STAR_CORE_RADIUS * MIN_STAR_SCALE + 13

  it('keeps a roomy system linear', () => {
    const toPx = orbitScaler(SOL, 454, 13)
    for (const radius of SOL) expect(toPx(radius)).toBeCloseTo(radius * 2)
  })

  it('starts a cramped system at the edge of the smallest star and ends it in place', () => {
    const toPx = orbitScaler(SOL, 100, 13)
    const px = SOL.map(toPx)
    expect(px[0]).toBeCloseTo(edge)
    expect(px.at(-1)).toBeCloseTo(100)
    expect(px.every((value, index) => index === 0 || value > px[index - 1])).toBe(true)
    expect(starScaleFor(px[0], 13)).toBe(MIN_STAR_SCALE)
  })

  it('handles one orbit and no orbits', () => {
    expect(orbitScaler([30], 100, 13)(30)).toBe(100)
    expect(orbitScaler([], 100, 13)(30)).toBe(0)
  })
})

// Was: fixed fields of 50 and 100 px made the system a dot on a phone on its side (a 790 x 180 canvas), its caption under the edge.
describe('orbitArea', () => {
  it('puts the orbits and the caption under them in the middle of a tall canvas', () => {
    const area = orbitArea(330, 600, 200)
    expect(area.caption).toBe(null)
    expect(area.centerX).toBe(165)
    expect(area.size).toBe(330 - 2 * 33)
    expect(area.centerY - area.size / 2).toBeGreaterThanOrEqual(0)
    expect(starCaptionY(area.centerY, area.size / 2) + STAR_CAPTION_HEIGHT).toBeLessThanOrEqual(600)
  })

  it('keeps the old fields on a big window', () => {
    const area = orbitArea(800, 700, 200)
    expect(area.caption).toBe(null)
    expect(area.size).toBe(700 - 2 * 50 - STAR_CAPTION_GAP - STAR_CAPTION_HEIGHT)
  })

  it('moves the caption to the corner of a low canvas and gives the orbits its height', () => {
    const area = orbitArea(790, 180, 220)
    expect(area.size).toBe(180 - 2 * 18)
    expect(area.centerY).toBe(90)
    expect(area.caption.y + STAR_CAPTION_HEIGHT).toBeLessThanOrEqual(180)
    expect(area.centerX - area.size / 2).toBeGreaterThan(area.caption.x + 110)
  })

  it('never gives a negative room', () => {
    expect(orbitArea(10, 10).size).toBe(0)
  })
})
