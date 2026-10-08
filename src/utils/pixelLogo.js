import { createSprite, setPixel } from './pixelArt'

// fill stops run from top to bottom.
export const LOGO_STYLES = {
  steel: { fill: ['#ffffff', '#d6dae2', '#9aa1ad', '#6c7380'], outline: '#15171c', shadow: '#000000' },
  sunset: { fill: ['#ffe066', '#ff9a3c', '#ff4f5e', '#b0306a'], outline: '#2a0a1e', shadow: '#000000' },
  phosphor: { fill: ['#e6ffe9', '#7dff9a', '#2fd35a', '#138a35'], outline: '#04210d', shadow: '#000000' },
  amber: { fill: ['#fff3c4', '#ffcf5a', '#ff9f1a', '#b86200'], outline: '#2a1500', shadow: '#000000' },
  ice: { fill: ['#ffffff', '#bff4ff', '#5ccdf5', '#2a7fd4'], outline: '#071a33', shadow: '#000000' },
  plasma: { fill: ['#ffd6ff', '#ff7ae0', '#b04cff', '#5a2ad0'], outline: '#1a0833', shadow: '#000000' },
  gold: { fill: ['#fff6c8', '#ffd34d', '#d99a1a', '#8a5a0a'], outline: '#2a1a00', shadow: '#000000' }
}

// size: a pixel of the font is one pixel.
export const LOGO_FONTS = {
  tiny5: { family: 'Tiny5', size: 8 },
  press: { family: 'Press Start 2P', size: 8 }
}

const INK_ALPHA = 128

export function logoColors({ style, colors, outline } = {}) {
  const base = LOGO_STYLES[style] ?? LOGO_STYLES.steel
  return {
    fill: colors?.length ? colors : base.fill,
    outline: outline ?? base.outline,
    shadow: base.shadow
  }
}

const parseHex = hex => {
  const value = hex.replace('#', '')
  const full = value.length <= 4 ? [...value.slice(0, 3)].map(char => char + char).join('') : value.slice(0, 6)
  return [0, 2, 4].map(index => parseInt(full.slice(index, index + 2), 16))
}
const toHex = channels => `#${channels.map(value => Math.round(value).toString(16).padStart(2, '0')).join('')}`

// t: 0 at the top, 1 at the bottom.
export function gradientAt(stops, t) {
  if (stops.length === 1) return stops[0]
  const position = Math.min(1, Math.max(0, t)) * (stops.length - 1)
  const index = Math.min(stops.length - 2, Math.floor(position))
  const from = parseHex(stops[index])
  const to = parseHex(stops[index + 1])
  const part = position - index
  return toHex(from.map((value, channel) => value + (to[channel] - value) * part))
}

const inkAt = (mask, x, y) => x >= 0 && y >= 0 && x < mask.w && y < mask.h && mask.bits[y * mask.w + x] === 1

/** mask: { w, h, bits: 0/1 row by row }; `shadow` repeats the outlined shape 1px right and down. */
export function buildLogoSprite(mask, { fill, outline, shadow = null }) {
  const pad = 1
  const drop = shadow ? 1 : 0
  const sprite = createSprite(mask.w + pad * 2 + drop, mask.h + pad * 2 + drop)
  const shape = (x, y) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) if (inkAt(mask, x + dx, y + dy)) return true
    }
    return false
  }
  for (let y = -pad; y < mask.h + pad; y++) {
    for (let x = -pad; x < mask.w + pad; x++) {
      if (!shape(x, y)) continue
      if (drop) setPixel(sprite, x + pad + drop, y + pad + drop, shadow)
    }
  }
  for (let y = -pad; y < mask.h + pad; y++) {
    for (let x = -pad; x < mask.w + pad; x++) {
      if (shape(x, y)) setPixel(sprite, x + pad, y + pad, outline)
    }
  }
  const last = Math.max(1, mask.h - 1)
  for (let y = 0; y < mask.h; y++) {
    const color = gradientAt(fill, y / last)
    for (let x = 0; x < mask.w; x++) if (inkAt(mask, x, y)) setPixel(sprite, x + pad, y + pad, color)
  }
  return sprite
}

// At native size the edges of the font's pixels blur into their neighbours.
const DRAW_SCALE = 16

/** { w, h, bits } cropped to the ink, or null. Each cell of the font grid is read at its centre. */
export function logoMask(text, fontName = 'tiny5') {
  const font = LOGO_FONTS[fontName] ?? LOGO_FONTS.tiny5
  const canvas = globalThis.document?.createElement('canvas')
  const context = canvas?.getContext?.('2d', { willReadFrequently: true })
  if (!context) return null
  const size = font.size * DRAW_SCALE
  const fontCss = `${size}px "${font.family}"`
  context.font = fontCss
  const margin = size
  const width = Math.ceil(context.measureText(text).width) + margin * 2
  const height = size * 3
  canvas.width = width
  canvas.height = height
  // A new size resets the context.
  context.font = fontCss
  context.textBaseline = 'top'
  context.fillStyle = '#000000'
  context.fillText(text, margin, size)
  const { data } = context.getImageData(0, 0, width, height)
  const ink = (x, y) => data[(Math.round(y) * width + Math.round(x)) * 4 + 3] >= INK_ALPHA
  let left = width
  let right = -1
  let top = height
  let bottom = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!ink(x, y)) continue
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
    }
  }
  if (right < 0) return null
  const mask = {
    w: Math.max(1, Math.round((right - left + 1) / DRAW_SCALE)),
    h: Math.max(1, Math.round((bottom - top + 1) / DRAW_SCALE)),
    bits: []
  }
  for (let y = 0; y < mask.h; y++) {
    for (let x = 0; x < mask.w; x++) {
      mask.bits.push(ink(left + (x + 0.5) * DRAW_SCALE, top + (y + 0.5) * DRAW_SCALE) ? 1 : 0)
    }
  }
  return mask
}

/** Runs of inked columns [{ from, to }] (`to` included): a pixel font leaves an empty column between letters. */
export function inkRuns(mask) {
  const runs = []
  let from = -1
  for (let x = 0; x <= mask.w; x++) {
    let ink = false
    if (x < mask.w) for (let y = 0; y < mask.h && !ink; y++) ink = inkAt(mask, x, y)
    if (ink && from < 0) from = x
    if (!ink && from >= 0) {
      runs.push({ from, to: x - 1 })
      from = -1
    }
  }
  return runs
}

/** Columns from..to (included) as a mask of the same height. */
export function maskColumns(mask, from, to) {
  const w = to - from + 1
  const bits = []
  for (let y = 0; y < mask.h; y++) {
    for (let x = from; x <= to; x++) bits.push(mask.bits[y * mask.w + x])
  }
  return { w, h: mask.h, bits }
}
