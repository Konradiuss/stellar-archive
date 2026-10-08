// A sprite is { w, h, pixels }: pixels is a row-major array of colours (null = empty).
import { hashText, mulberry32 } from './random'

export function createSprite(w, h, fill = null) {
  return { w, h, pixels: new Array(w * h).fill(fill) }
}

export function setPixel(sprite, x, y, color) {
  if (x < 0 || y < 0 || x >= sprite.w || y >= sprite.h) return
  sprite.pixels[y * sprite.w + x] = color
}

export function getPixel(sprite, x, y) {
  if (x < 0 || y < 0 || x >= sprite.w || y >= sprite.h) return null
  return sprite.pixels[y * sprite.w + x]
}

export function fillRect(sprite, x, y, w, h, color) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) setPixel(sprite, x + dx, y + dy, color)
  }
}

// Swap axes rather than rotate, so the light still comes from the top-left.
export function transpose(sprite) {
  const result = createSprite(sprite.h, sprite.w)
  for (let y = 0; y < sprite.h; y++) {
    for (let x = 0; x < sprite.w; x++) setPixel(result, y, x, getPixel(sprite, x, y))
  }
  return result
}

// Unlike transpose, text drawn in the sprite stays readable.
export function rotateClockwise(sprite) {
  const result = createSprite(sprite.h, sprite.w)
  for (let y = 0; y < sprite.h; y++) {
    for (let x = 0; x < sprite.w; x++) setPixel(result, sprite.h - 1 - y, x, getPixel(sprite, x, y))
  }
  return result
}

export function spriteToSvg(sprite) {
  const { w, h, pixels } = sprite
  const rects = []
  for (let y = 0; y < h; y++) {
    let x = 0
    while (x < w) {
      const color = pixels[y * w + x]
      if (!color) { x++; continue }
      let run = 1
      while (x + run < w && pixels[y * w + x + run] === color) run++
      rects.push(`<rect x="${x}" y="${y}" width="${run}" height="1" fill="${color}"/>`)
      x += run
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${rects.join('')}</svg>`
}

export function spriteToDataUri(sprite) {
  return `data:image/svg+xml,${encodeURIComponent(spriteToSvg(sprite))}`
}

export function createRng(key, ...salts) {
  const next = mulberry32(hashText([key, ...salts].join(':')))
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: probability => next() < probability,
    pick: items => items[Math.floor(next() * items.length)],
    // table: [[value, weight], ...]
    weighted(table) {
      const total = table.reduce((sum, [, weight]) => sum + weight, 0)
      let roll = next() * total
      for (const [value, weight] of table) {
        roll -= weight
        if (roll < 0) return value
      }
      return table[table.length - 1][0]
    }
  }
}
