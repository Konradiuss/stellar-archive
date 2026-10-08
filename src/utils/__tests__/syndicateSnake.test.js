import { describe, expect, it } from 'vitest'
import { SNAKE_COLORS, SNAKE_ROWS, snakeSprite, snakeUri } from '../syndicateSnake'
import { getPixel } from '../pixelArt'

describe('the snake of the Syndicate', () => {
  it('is drawn in rows of one length with the letters of its colours', () => {
    expect(SNAKE_ROWS.every(row => row.length === SNAKE_ROWS[0].length)).toBe(true)
    expect(SNAKE_ROWS.join('').replace(/\./g, '').split('').every(letter => letter in SNAKE_COLORS)).toBe(true)
  })

  it('makes a sprite of the rows: a black body, red eyes and tongue', () => {
    const sprite = snakeSprite()
    expect([sprite.w, sprite.h]).toEqual([50, 64])
    const colors = new Set(sprite.pixels.filter(Boolean))
    expect(colors).toEqual(new Set(Object.values(SNAKE_COLORS)))
    const eyes = SNAKE_ROWS.flatMap((row, y) => [...row.matchAll(/R+K{2,4}R+/g)].map(match => ({ x: match.index, y })))
    expect(new Set(eyes.map(eye => Math.round(eye.x / 9))).size).toBe(3)
    expect(eyes.every(eye => eye.y < sprite.h / 2 && eye.x > sprite.w / 3)).toBe(true)
    expect(getPixel(sprite, eyes[0].x, eyes[0].y)).toBe(SNAKE_COLORS.R)
    expect(snakeUri()).toMatch(/^data:image\/svg\+xml,/)
  })
})
