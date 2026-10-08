import { getPlanetDitherValue } from './planetRenderer'

// Screen pixels per image pixel for photos and drawings.
export const PIXEL_SIZE = 3
// Levels per colour channel: 5 → 125 colours.
export const DEFAULT_LEVELS = 5
// Clamped before dithering, or JPEG noise in a dark sky turns into scattered coloured dots.
const BLACK_POINT = 20
const WHITE_POINT = 240

// Images this small are already sprites (game icons): only scaled up.
export const SPRITE_MAX_SIZE = 96

export function isSprite(width, height) {
  return Math.max(width, height) <= SPRITE_MAX_SIZE
}

/** 4×4 Bayer posterize in place; alpha becomes fully opaque or fully transparent. */
export function pixelateImageData(data, width, height, { levels = DEFAULT_LEVELS } = {}) {
  const top = Math.max(2, levels) - 1
  const step = 255 / top
  const range = WHITE_POINT - BLACK_POINT
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4
      // Centred threshold: flat areas keep their average colour.
      const threshold = getPlanetDitherValue(x, y) + 1 / 32
      for (let channel = 0; channel < 3; channel++) {
        const value = Math.max(0, Math.min(255, (data[index + channel] - BLACK_POINT) * 255 / range))
        const scaled = value / step
        const base = Math.floor(scaled)
        const level = Math.min(top, scaled - base > threshold ? base + 1 : base)
        data[index + channel] = Math.round(level * step)
      }
      data[index + 3] = data[index + 3] >= 128 ? 255 : 0
    }
  }
  return data
}

export function pixelatedSize(naturalWidth, naturalHeight, displayWidth, pixelSize = PIXEL_SIZE) {
  const shownWidth = Math.max(pixelSize, Math.min(displayWidth, naturalWidth))
  const width = Math.max(1, Math.round(shownWidth / pixelSize))
  const height = Math.max(1, Math.round(width * naturalHeight / naturalWidth))
  return { width, height }
}

export function spriteScale(naturalWidth, available) {
  return Math.max(1, Math.min(4, Math.floor(available / naturalWidth)))
}
