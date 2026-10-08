import { describe, expect, it } from 'vitest'
import { findBoardStrips } from '../boardStrips'
import { BOARD_COLORS, STRIP_THICKNESS, generateStrip, renderCircuitBoard } from '../circuitBoard'
import { createSprite, getPixel } from '../pixelArt'
import { drawText, textWidth } from '../pixelFont'

const SEED = 'console-board'
const rect = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height, width, height })

function column(sprite, x) {
  return Array.from({ length: sprite.h }, (_, y) => getPixel(sprite, x, y)).join()
}

function window(sprite, from, length) {
  const columns = []
  for (let x = from; x < from + length; x++) columns.push(column(sprite, x))
  return columns.join('|')
}

describe('findBoardStrips', () => {
  it('finds one full-height vertical strip and one horizontal strip on desktop', () => {
    const container = rect(0, 0, 1400, 900)
    const strips = findBoardStrips(container, [
      rect(1080, 0, 320, 900), // lore
      rect(0, 0, 1066, 700), // map
      rect(0, 714, 1066, 186) // legend
    ])
    expect(strips).toEqual([
      { key: 'v0', orientation: 'vertical', x: 533, y: 0, length: 450, thickness: 7 },
      { key: 'h0', orientation: 'horizontal', x: 0, y: 350, length: 533, thickness: 7 }
    ])
  })

  it('finds the horizontal gaps of the mobile column', () => {
    const container = rect(0, 0, 390, 844)
    const strips = findBoardStrips(container, [
      rect(0, 0, 390, 330),
      rect(0, 344, 390, 330),
      rect(0, 688, 390, 156)
    ])
    expect(strips.map(strip => [strip.orientation, strip.y, strip.length, strip.thickness])).toEqual([
      ['horizontal', 165, 195, 7],
      ['horizontal', 337, 195, 7]
    ])
  })
})

describe('generateStrip', () => {
  const strip = generateStrip({ seed: SEED, key: 'v0', length: 450 })

  it('is deterministic and depends on the strip key', () => {
    expect(generateStrip({ seed: SEED, key: 'v0', length: 450 })).toEqual(strip)
    expect(generateStrip({ seed: SEED, key: 'h0', length: 450 }).pixels).not.toEqual(strip.pixels)
    expect([strip.w, strip.h]).toEqual([450, STRIP_THICKNESS])
  })

  it('has no repeating stretches', () => {
    const windows = []
    for (let x = 0; x + 24 <= strip.w; x += 4) windows.push(window(strip, x, 24))
    const detailed = windows.filter(text => text.split(/[|,]/).some(color => color !== BOARD_COLORS.board && color !== BOARD_COLORS.boardDark))
    expect(detailed.length).toBeGreaterThan(windows.length * 0.9)
    expect(new Set(detailed).size).toBeGreaterThanOrEqual(Math.floor(detailed.length * 0.9))
  })

  it('is dense with detail', () => {
    const detail = strip.pixels.filter(color => color !== BOARD_COLORS.board && color !== BOARD_COLORS.boardDark)
    expect(detail.length / strip.pixels.length).toBeGreaterThan(0.35)
  })

  it('does not leave the end of a strip bare', () => {
    const isDetail = color => color !== BOARD_COLORS.board && color !== BOARD_COLORS.boardDark
    for (let length = 200; length <= 700; length += 23) {
      for (const key of ['v0', 'h0', 'h1']) {
        const sprite = generateStrip({ seed: SEED, key, length })
        const tail = []
        for (let x = length - 40; x < length; x++) {
          for (let y = 0; y < STRIP_THICKNESS; y++) tail.push(getPixel(sprite, x, y))
        }
        expect(tail.filter(isDetail).length / tail.length).toBeGreaterThan(0.2)
      }
    }
  })

  it('keeps its beginning when the strip grows', () => {
    const short = generateStrip({ seed: SEED, key: 'h0', length: 300 })
    const long = generateStrip({ seed: SEED, key: 'h0', length: 600 })
    expect(window(long, 0, 200)).toBe(window(short, 0, 200))
  })
})

describe('renderCircuitBoard', () => {
  it('fills the board and draws strips in place, quickly', () => {
    const strips = [
      { key: 'v0', orientation: 'vertical', x: 533, y: 0, length: 450, thickness: 7 },
      { key: 'h0', orientation: 'horizontal', x: 0, y: 350, length: 533, thickness: 7 }
    ]
    const started = performance.now()
    const pixels = renderCircuitBoard({ seed: SEED, width: 700, height: 450, strips })
    expect(performance.now() - started).toBeLessThan(50)
    expect(pixels).toHaveLength(700 * 450)
    const base = pixels[0]
    expect(pixels[100 * 700 + 100]).toBe(base)
    const inStrip = Array.from({ length: 450 }, (_, y) => pixels[y * 700 + 536])
    expect(inStrip.filter(value => value !== base).length).toBeGreaterThan(100)
  })
})

describe('pixelFont', () => {
  it('draws readable 3×5 glyphs', () => {
    const sprite = createSprite(textWidth('R12'), 5)
    drawText(sprite, 0, 0, 'R12', '#fff')
    expect(textWidth('R12')).toBe(11)
    // R = 11, 1 = 7, 2 = 8 lit pixels.
    expect(sprite.pixels.filter(Boolean)).toHaveLength(11 + 7 + 8)
  })
})
