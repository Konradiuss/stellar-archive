import { describe, expect, it } from 'vitest'
import { BOLT_OFFSET, layoutBezel, ledPace } from '../bezelDecor'
import {
  BASE_HEIGHT,
  BASE_WIDTH,
  BEZEL_BOTTOM,
  BEZEL_EDGE,
  BOLT_SIZE,
  STEEL_TINTS,
  buildBezelBase
} from '../bezelSprites'
import { createRng, createSprite, getPixel, setPixel, transpose } from '../pixelArt'

const WIDTH = 520
const HEIGHT = 340

function rectOf(part, width = WIDTH, height = HEIGHT) {
  const x = part.left ?? width - part.right - part.w
  const y = part.top ?? height - part.bottom - part.h
  return { x, y, w: part.w, h: part.h }
}

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

describe('pixelArt helpers', () => {
  it('createRng gives the same sequence for the same key', () => {
    const a = createRng('lore', 'top', 3)
    const b = createRng('lore', 'top', 3)
    const c = createRng('lore', 'top', 4)
    const first = [a.next(), a.next(), a.next()]
    expect([b.next(), b.next(), b.next()]).toEqual(first)
    expect([c.next(), c.next(), c.next()]).not.toEqual(first)
  })

  it('transpose swaps axes and keeps the top-left pixel in place', () => {
    const sprite = createSprite(3, 2)
    setPixel(sprite, 0, 0, 'a')
    setPixel(sprite, 2, 1, 'b')
    const result = transpose(sprite)
    expect([result.w, result.h]).toEqual([2, 3])
    expect(getPixel(result, 0, 0)).toBe('a')
    expect(getPixel(result, 1, 2)).toBe('b')
  })
})

describe('buildBezelBase', () => {
  const tint = STEEL_TINTS.blue
  const base = buildBezelBase(tint)
  const midX = Math.floor(BASE_WIDTH / 2)
  const midY = BEZEL_EDGE + 1
  const body = count => new Array(count).fill(tint.body)

  it('has rings of equal width on the left and right edges', () => {
    const fromLeft = Array.from({ length: BEZEL_EDGE }, (_, i) => getPixel(base, i, midY))
    const fromRight = Array.from({ length: BEZEL_EDGE }, (_, i) => getPixel(base, BASE_WIDTH - 1 - i, midY))
    expect(fromLeft).toEqual([tint.outline, tint.highlight, ...body(7), tint.dark, tint.recess, tint.rim])
    expect(fromRight).toEqual([tint.outline, tint.dark, ...body(7), tint.light, tint.recess, tint.rim])
  })

  it('mirrors the top rings on the thicker bottom edge', () => {
    const fromTop = Array.from({ length: BEZEL_EDGE }, (_, i) => getPixel(base, midX, i))
    const fromBottom = Array.from({ length: BEZEL_BOTTOM }, (_, i) => getPixel(base, midX, BASE_HEIGHT - 1 - i))
    expect(fromTop).toEqual([tint.outline, tint.highlight, ...body(7), tint.dark, tint.recess, tint.rim])
    expect(fromBottom).toEqual([tint.outline, tint.dark, ...body(9), tint.light, tint.recess, tint.rim])
  })

  it('leaves the screen transparent', () => {
    expect(getPixel(base, BEZEL_EDGE, BEZEL_EDGE)).toBeNull()
    expect(getPixel(base, BASE_WIDTH - 1 - BEZEL_EDGE, BASE_HEIGHT - 1 - BEZEL_BOTTOM)).toBeNull()
  })
})

describe('layoutBezel', () => {
  it('is deterministic for the same seed and size', () => {
    expect(layoutBezel({ seed: 'lore', width: WIDTH, height: HEIGHT }))
      .toEqual(layoutBezel({ seed: 'lore', width: WIDTH, height: HEIGHT }))
  })

  it('gives different casings to different seeds', () => {
    const kinds = seed => layoutBezel({ seed, width: WIDTH, height: HEIGHT }).items.map(item => item.kind).join()
    expect(kinds('map')).not.toBe(kinds('lore'))
    expect(kinds('lore')).not.toBe(kinds('legend'))
  })

  it('gives the three screens different steel tints', () => {
    const tints = ['map', 'lore', 'legend'].map(seed => layoutBezel({ seed }).tint)
    expect(new Set(tints).size).toBe(3)
  })

  it('places every bolt the same distance from both outer edges', () => {
    const { bolts } = layoutBezel({ seed: 'map', width: WIDTH, height: HEIGHT })
    expect(bolts).toHaveLength(4)
    const centre = BOLT_OFFSET + Math.floor(BOLT_SIZE / 2)
    for (const bolt of bolts) {
      const { x, y } = rectOf(bolt)
      const middleX = x + Math.floor(BOLT_SIZE / 2)
      const middleY = y + Math.floor(BOLT_SIZE / 2)
      expect(Math.min(middleX, WIDTH - 1 - middleX)).toBe(centre)
      expect(Math.min(middleY, HEIGHT - 1 - middleY)).toBe(centre)
    }
  })

  it('keeps details inside the casing body without overlaps', () => {
    for (const seed of ['map', 'lore', 'legend', 'test']) {
      const { bolts, items, led } = layoutBezel({ seed, width: WIDTH, height: HEIGHT })
      expect(items.length).toBeGreaterThan(8)
      const rects = [...bolts, ...items, led].map(part => rectOf(part))

      for (const item of items) {
        const { x, y, w, h } = rectOf(item)
        const side = item.key.split('-')[0]
        if (side === 'top') expect(y >= 2 && y + h <= BEZEL_EDGE - 3).toBe(true)
        if (side === 'bottom') expect(y >= HEIGHT - BEZEL_BOTTOM + 3 && y + h <= HEIGHT - 2).toBe(true)
        if (side === 'left') expect(x >= 2 && x + w <= BEZEL_EDGE - 3).toBe(true)
        if (side === 'right') expect(x >= WIDTH - BEZEL_EDGE + 3 && x + w <= WIDTH - 2).toBe(true)
        expect(x >= 0 && y >= 0 && x + w <= WIDTH && y + h <= HEIGHT).toBe(true)
      }

      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i], rects[j])).toBe(false)
      }
    }
  })

  it('keeps the first details when an edge grows', () => {
    const small = layoutBezel({ seed: 'legend', width: 260, height: 120 })
    const large = layoutBezel({ seed: 'legend', width: 700, height: 400 })
    const kinds = new Map(large.items.map(item => [item.key, item.kind]))
    expect(small.items.length).toBeGreaterThan(0)
    for (const item of small.items) expect(kinds.get(item.key)).toBe(item.kind)
  })

  it('returns only the base and bolts before the casing is measured', () => {
    const casing = layoutBezel({ seed: 'map' })
    expect(casing.items).toEqual([])
    expect(casing.baseUri.startsWith('data:image/svg+xml,')).toBe(true)
  })
})

describe('ledPace', () => {
  const seconds = value => Number(/^(-?\d+\.\d\d)s$/.exec(value)?.[1])

  it('gives the status light of each screen its own pace', () => {
    const paces = Array.from({ length: 20 }, () => ledPace())
    for (const pace of paces) {
      const period = seconds(pace['--led-period'])
      const phase = seconds(pace['--led-phase'])
      expect(period).toBeGreaterThanOrEqual(0.5)
      expect(period).toBeLessThanOrEqual(0.75)
      expect(phase).toBeLessThanOrEqual(0)
      expect(phase).toBeGreaterThanOrEqual(-period)
    }
    expect(new Set(paces.map(pace => pace['--led-period'])).size).toBeGreaterThan(1)
    expect(new Set(paces.map(pace => pace['--led-phase'])).size).toBeGreaterThan(1)
  })

  it('spans the whole range', () => {
    expect(ledPace(() => 0)).toEqual({ '--led-period': '0.50s', '--led-phase': '0.00s' })
    expect(ledPace(() => 0.999)).toEqual({ '--led-period': '0.75s', '--led-phase': '-0.75s' })
  })
})
