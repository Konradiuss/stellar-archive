import { describe, expect, it } from 'vitest'
import { isSprite, pixelateImageData, pixelatedSize, spriteScale } from '../pixelImage'

const flat = (width, height, [r, g, b, a = 255]) => {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < data.length; index += 4) data.set([r, g, b, a], index)
  return data
}

describe('pixelImage', () => {
  it('reduces every channel to five levels', () => {
    const data = pixelateImageData(flat(8, 8, [100, 37, 250]), 8, 8)
    const levels = new Set([0, 64, 128, 191, 255])
    for (const value of data) expect(levels.has(value)).toBe(true)
  })

  it('dithers a flat mid tone into a mix that keeps its average', () => {
    const data = pixelateImageData(flat(4, 4, [160, 160, 160]), 4, 4)
    const reds = [...data].filter((value, index) => index % 4 === 0)
    expect(new Set(reds).size).toBe(2)
    const average = reds.reduce((sum, value) => sum + value, 0) / reds.length
    expect(Math.abs(average - (160 - 20) * 255 / 220)).toBeLessThan(12)
  })

  it('is deterministic and clears dark noise', () => {
    const first = pixelateImageData(flat(4, 4, [120, 60, 30]), 4, 4)
    const second = pixelateImageData(flat(4, 4, [120, 60, 30]), 4, 4)
    expect([...first]).toEqual([...second])
    expect([...pixelateImageData(flat(4, 4, [14, 10, 18]), 4, 4)].filter((v, i) => i % 4 !== 3).every(v => v === 0)).toBe(true)
  })

  it('makes alpha fully opaque or fully transparent', () => {
    expect(pixelateImageData(flat(1, 1, [0, 0, 0, 200]), 1, 1)[3]).toBe(255)
    expect(pixelateImageData(flat(1, 1, [0, 0, 0, 40]), 1, 1)[3]).toBe(0)
  })

  it('sizes the low-resolution picture and the sprites', () => {
    expect(pixelatedSize(600, 300, 300)).toEqual({ width: 100, height: 50 })
    expect(pixelatedSize(90, 90, 600)).toEqual({ width: 30, height: 30 })
    expect(isSprite(32, 32)).toBe(true)
    expect(isSprite(480, 480)).toBe(false)
    expect(spriteScale(32, 100)).toBe(3)
    expect(spriteScale(32, 10)).toBe(1)
    expect(spriteScale(16, 1000)).toBe(4)
  })
})
