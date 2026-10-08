import { describe, expect, it } from 'vitest'
import { getPixel } from '../pixelArt'
import { LOGO_STYLES, buildLogoSprite, gradientAt, inkRuns, logoColors, logoMask, maskColumns } from '../pixelLogo'

// A mask from rows of '#' (ink) and '.'.
const mask = rows => ({ w: rows[0].length, h: rows.length, bits: rows.join('').split('').map(char => (char === '#' ? 1 : 0)) })

const FILL = ['#ff0000', '#0000ff']
const OUTLINE = '#111111'
const SHADOW = '#000000'

describe('pixel logo', () => {
  it('is the ink with a pixel of outline around it and the shadow one pixel down and right', () => {
    const sprite = buildLogoSprite(mask(['#.', '##']), { fill: FILL, outline: OUTLINE, shadow: SHADOW })
    // 2 x 2 of ink, 1 of outline on each side, 1 of shadow.
    expect([sprite.w, sprite.h]).toEqual([5, 5])
    expect(getPixel(sprite, 1, 1)).toBe('#ff0000')
    expect(getPixel(sprite, 2, 1)).toBe(OUTLINE)
    for (const [x, y] of [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2], [0, 3], [1, 3], [2, 3], [3, 3], [3, 1], [3, 2]]) {
      expect(getPixel(sprite, x, y), `${x},${y}`).toBe(OUTLINE)
    }
    expect(getPixel(sprite, 4, 4)).toBe(SHADOW)
    expect(getPixel(sprite, 4, 2)).toBe(SHADOW)
    expect(getPixel(sprite, 4, 1)).toBeNull()
    expect(getPixel(sprite, 0, 4)).toBeNull()
  })

  it('fills the ink row by row from the first colour to the last', () => {
    const sprite = buildLogoSprite(mask(['#', '#', '#']), { fill: FILL, outline: OUTLINE })
    expect([sprite.w, sprite.h]).toEqual([3, 5])
    expect(getPixel(sprite, 1, 1)).toBe('#ff0000')
    expect(getPixel(sprite, 1, 2)).toBe('#800080')
    expect(getPixel(sprite, 1, 3)).toBe('#0000ff')
    expect(getPixel(sprite, 2, 4)).toBe(OUTLINE)
  })

  it('mixes the colours of a gradient and keeps a single colour whole', () => {
    expect(gradientAt(['#000000', '#ffffff'], 0.5)).toBe('#808080')
    expect(gradientAt(['#ff0000', '#00ff00', '#0000ff'], 0.5)).toBe('#00ff00')
    expect(gradientAt(['#f00', '#00f'], 1)).toBe('#0000ff')
    expect(gradientAt(['#abcdef'], 0.3)).toBe('#abcdef')
  })

  it('takes the colours of its style, the author’s colours and outline over them', () => {
    expect(logoColors({ style: 'sunset' })).toEqual({ fill: LOGO_STYLES.sunset.fill, outline: LOGO_STYLES.sunset.outline, shadow: '#000000' })
    expect(logoColors({ style: 'nope', colors: ['#123456'], outline: '#654321' })).toEqual({ fill: ['#123456'], outline: '#654321', shadow: '#000000' })
  })

  it('needs a canvas to read the text: without one there is no mask', () => {
    // happy-dom has no 2D canvas; PixelLogo then shows the text in Tiny5.
    expect(logoMask('ARCHIVE')).toBeNull()
  })

  it('finds its letters between the empty columns, a space being a wider gap', () => {
    const word = mask(['#.##...#', '#.##...#'])
    expect(inkRuns(word)).toEqual([{ from: 0, to: 0 }, { from: 2, to: 3 }, { from: 7, to: 7 }])
    expect(inkRuns(mask(['...']))).toEqual([])
    expect(maskColumns(word, 2, 3)).toEqual({ w: 2, h: 2, bits: [1, 1, 1, 1] })
    const letter = buildLogoSprite(maskColumns(word, 2, 3), { fill: FILL, outline: OUTLINE, shadow: SHADOW })
    expect([letter.w, letter.h]).toEqual([5, 5])
  })
})
