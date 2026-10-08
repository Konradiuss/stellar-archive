import { createSprite, fillRect, getPixel, setPixel } from './pixelArt'
import { hashText } from './random'

// Casing thickness in sprite pixels; the bottom edge is thicker.
export const BEZEL_EDGE = 12
export const BEZEL_BOTTOM = 14
// Ring layout (same width on every side, only the colours differ):
// 0 outline, 1 outer bevel, body, inner bevel, recess, screen rim.
export const BEZEL_BODY_START = 2
export const BEZEL_INNER_RINGS = 3

// The first tint is sampled from tgstation console sprites.
export const STEEL_TINTS = {
  blue: {
    outline: '#151515', highlight: '#a5abb8', light: '#9399a7', body: '#767e8f',
    dark: '#4d535e', shade: '#2c2f2f', recess: '#1d2020', rim: '#0e0e0e'
  },
  grey: {
    outline: '#151515', highlight: '#b1b1ad', light: '#9b9b97', body: '#7b7b78',
    dark: '#52524f', shade: '#2e2e2c', recess: '#1e1e1d', rim: '#0e0e0e'
  },
  warm: {
    outline: '#161512', highlight: '#b3ac97', light: '#9f9984', body: '#807a68',
    dark: '#565244', shade: '#302e27', recess: '#1f1e19', rim: '#0e0e0c'
  },
  gunmetal: {
    outline: '#111213', highlight: '#8d949f', light: '#767d89', body: '#5c626d',
    dark: '#3c4149', shade: '#25282c', recess: '#18191c', rim: '#0b0b0c'
  }
}
const TINT_NAMES = Object.keys(STEEL_TINTS)

export function pickTint(seed, names = TINT_NAMES) {
  const list = names?.length ? names : TINT_NAMES
  return list[hashText(`tint:${seed}`) % list.length]
}

export const BASE_WIDTH = BEZEL_EDGE * 2 + 4
export const BASE_HEIGHT = BEZEL_EDGE + BEZEL_BOTTOM + 4

export function buildBezelBase(tint) {
  const W = BASE_WIDTH
  const H = BASE_HEIGHT
  const sprite = createSprite(W, H)
  // Screen rectangle (inclusive).
  const screenLeft = BEZEL_EDGE
  const screenRight = W - 1 - BEZEL_EDGE
  const screenTop = BEZEL_EDGE
  const screenBottom = H - 1 - BEZEL_BOTTOM

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const outX = Math.max(screenLeft - x, x - screenRight, 0)
      const outY = Math.max(screenTop - y, y - screenBottom, 0)
      const fromScreen = Math.max(outX, outY)
      if (fromScreen === 0) continue
      if (fromScreen <= BEZEL_INNER_RINGS) {
        const litSide = outY >= outX ? y > screenBottom : x > screenRight
        const ring = [tint.rim, tint.recess, litSide ? tint.light : tint.dark]
        setPixel(sprite, x, y, ring[fromScreen - 1])
        continue
      }

      const dl = x
      const dr = W - 1 - x
      const dt = y
      const db = H - 1 - y
      const cornerDistance = Math.min(dl, dr) + Math.min(dt, db)
      if (cornerDistance < 2) continue
      const outer = Math.min(dl, dr, dt, db)
      if (outer === 0 || cornerDistance === 2) {
        setPixel(sprite, x, y, tint.outline)
      } else if (outer === 1) {
        const lit = dt === 1 || (dl === 1 && db !== 1)
        setPixel(sprite, x, y, lit ? tint.highlight : tint.dark)
      } else {
        setPixel(sprite, x, y, tint.body)
      }
    }
  }
  return sprite
}

export const BOLT_SIZE = 5
export const BOLT_SLOTS = ['horizontal', 'vertical', 'diagonal', 'antidiagonal', 'cross']

const SLOT_PIXELS = {
  horizontal: [[1, 2], [2, 2], [3, 2]],
  vertical: [[2, 1], [2, 2], [2, 3]],
  diagonal: [[1, 1], [2, 2], [3, 3]],
  antidiagonal: [[3, 1], [2, 2], [1, 3]],
  cross: [[1, 2], [2, 2], [3, 2], [2, 1], [2, 3]]
}

export function buildBolt(tint, slot) {
  const bolt = createSprite(BOLT_SIZE, BOLT_SIZE)
  const head = [
    [tint.highlight, tint.highlight, tint.light],
    [tint.highlight, tint.light, tint.body],
    [tint.light, tint.body, tint.dark]
  ]
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) setPixel(bolt, x + 1, y + 1, head[y][x])
  }
  for (let i = 1; i <= 3; i++) {
    setPixel(bolt, i, 0, tint.dark)
    setPixel(bolt, 0, i, tint.dark)
    setPixel(bolt, i, 4, tint.outline)
    setPixel(bolt, 4, i, tint.outline)
  }
  for (const [x, y] of SLOT_PIXELS[slot]) setPixel(bolt, x, y, tint.shade)
  return bolt
}

function drawScrew(sprite, x, y, tint) {
  setPixel(sprite, x, y, tint.highlight)
  setPixel(sprite, x + 1, y, tint.dark)
  setPixel(sprite, x, y + 1, tint.dark)
  setPixel(sprite, x + 1, y + 1, tint.outline)
}

// Every detail is drawn horizontally; vertical edges get a transposed copy.
// `height` is the room across the edge (5 on thin edges, 7 on the bottom).

const BUTTON_COLORS = [
  ['#ff8a8a', '#c43232', '#7a1f1f'],
  ['#9dffb0', '#2fbf4f', '#1d6e2e'],
  ['#ffe08a', '#d99a1e', '#8a5f10'],
  ['#a8ccff', '#3a7bd5', '#1f4a85']
]

function vent(rng, tint, height) {
  const slits = rng.int(6, 13)
  const sprite = createSprite(slits * 2 - 1, height)
  for (let x = 0; x < sprite.w; x += 2) {
    setPixel(sprite, x, 0, tint.shade)
    fillRect(sprite, x, 1, 1, height - 2, tint.recess)
    setPixel(sprite, x, height - 1, tint.light)
  }
  return sprite
}

function buttons(rng, tint) {
  const count = rng.int(2, 4)
  const sprite = createSprite(count * 4 + 1, 5)
  fillRect(sprite, 0, 0, sprite.w, 5, tint.shade)
  fillRect(sprite, 1, 1, sprite.w - 2, 3, tint.recess)
  for (let i = 0; i < count; i++) {
    const [light, color, dark] = rng.pick(BUTTON_COLORS)
    const x = 1 + i * 4
    fillRect(sprite, x, 1, 3, 3, color)
    setPixel(sprite, x, 1, light)
    setPixel(sprite, x + 2, 3, dark)
    setPixel(sprite, x + 1, 3, dark)
    setPixel(sprite, x + 2, 2, dark)
  }
  return sprite
}

function toggles(rng, tint) {
  const count = rng.int(2, 3)
  const sprite = createSprite(count * 4 - 1, 5)
  for (let i = 0; i < count; i++) {
    const x = i * 4
    const up = rng.chance(0.5)
    const baseY = up ? 3 : 0
    fillRect(sprite, x, baseY, 3, 2, tint.shade)
    setPixel(sprite, x, baseY, tint.dark)
    const leverTop = up ? 0 : 2
    setPixel(sprite, x + 1, leverTop, up ? '#e4e6ea' : tint.light)
    setPixel(sprite, x + 1, leverTop + 1, tint.light)
    setPixel(sprite, x + 1, leverTop + 2, up ? tint.dark : '#e4e6ea')
  }
  return sprite
}

function knob(rng, tint) {
  const sprite = createSprite(5, 5)
  const shape = [
    [null, tint.outline, tint.outline, tint.outline, null],
    [tint.outline, '#5a5d63', '#4a4d52', '#3a3c40', tint.outline],
    [tint.outline, '#4a4d52', '#3a3c40', '#2e3034', tint.outline],
    [tint.outline, '#3a3c40', '#2e3034', '#232427', tint.outline],
    [null, tint.outline, tint.outline, tint.outline, null]
  ]
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) setPixel(sprite, x, y, shape[y][x])
  const [tx, ty] = rng.pick([[2, 1], [3, 1], [3, 2], [3, 3], [2, 3], [1, 3], [1, 2], [1, 1]])
  setPixel(sprite, tx, ty, '#e8e8e8')
  return sprite
}

function plate(rng, tint, height) {
  const cream = rng.chance(0.4)
  const background = cream ? '#cfc6a8' : '#23272c'
  const ink = cream ? '#4a4434' : '#8fa3b3'
  const sprite = createSprite(rng.int(14, 24), height)
  fillRect(sprite, 0, 0, sprite.w, height, tint.shade)
  fillRect(sprite, 1, 1, sprite.w - 2, height - 2, background)
  const textTop = Math.floor((height - 3) / 2)
  let x = 2
  while (x < sprite.w - 2) {
    const word = rng.int(2, 5)
    for (let i = 0; i < word && x < sprite.w - 2; i++, x++) {
      const bits = rng.int(1, 7)
      for (let row = 0; row < 3; row++) {
        if (bits & (1 << row)) setPixel(sprite, x, textTop + row, ink)
      }
    }
    x += 1
  }
  return sprite
}

function barcode(rng) {
  const sprite = createSprite(rng.int(9, 13), 5)
  fillRect(sprite, 0, 0, sprite.w, 5, '#e3e1d6')
  for (let x = 1; x < sprite.w - 1; x++) {
    if (rng.chance(0.55)) fillRect(sprite, x, 1, 1, 3, '#1b1b1b')
  }
  return sprite
}

function hazard(rng, tint) {
  const sprite = createSprite(rng.int(10, 20), 5)
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < sprite.w; x++) {
      const yellow = Math.floor((x + y) / 2) % 2 === 0
      setPixel(sprite, x, y, yellow ? '#d9b21e' : '#1f1d17')
    }
  }
  for (let x = 0; x < sprite.w; x++) setPixel(sprite, x, 4, getPixel(sprite, x, 4) === '#d9b21e' ? '#a8891a' : tint.outline)
  return sprite
}

function hatch(rng, tint, height) {
  const sprite = createSprite(rng.int(16, 30), height)
  const right = sprite.w - 1
  const bottom = height - 1
  fillRect(sprite, 0, 0, sprite.w, 1, tint.shade)
  fillRect(sprite, 0, 0, 1, height, tint.shade)
  fillRect(sprite, 0, bottom, sprite.w, 1, tint.dark)
  fillRect(sprite, right, 0, 1, height, tint.dark)
  fillRect(sprite, 1, 1, sprite.w - 2, 1, tint.highlight)
  fillRect(sprite, 1, 1, 1, height - 2, tint.highlight)
  drawScrew(sprite, 2, 2, tint)
  drawScrew(sprite, sprite.w - 4, height - 4, tint)
  const middle = Math.floor(sprite.w / 2)
  fillRect(sprite, middle - 2, Math.floor(height / 2), 4, 1, tint.shade)
  return sprite
}

function jacks(rng, tint) {
  const count = rng.int(2, 3)
  const sprite = createSprite(count * 6 - 1, 5)
  const pinColor = rng.pick(['#c9a94a', '#b8bcc4'])
  for (let i = 0; i < count; i++) {
    const x = i * 6
    const socket = [
      [null, tint.shade, tint.shade, tint.shade, null],
      [tint.shade, '#0a0a0a', '#0a0a0a', '#0a0a0a', tint.highlight],
      [tint.shade, '#0a0a0a', pinColor, '#0a0a0a', tint.highlight],
      [tint.shade, '#0a0a0a', '#0a0a0a', '#0a0a0a', tint.highlight],
      [null, tint.highlight, tint.highlight, tint.highlight, null]
    ]
    for (let y = 0; y < 5; y++) for (let dx = 0; dx < 5; dx++) setPixel(sprite, x + dx, y, socket[y][dx])
  }
  return sprite
}

function speaker(rng, tint) {
  const sprite = createSprite(rng.int(4, 7) * 2 + 1, 5)
  for (let y = 0; y < 5; y += 2) {
    for (let x = 0; x < sprite.w; x += 2) setPixel(sprite, x, y, tint.recess)
  }
  return sprite
}

function screw(rng, tint) {
  const sprite = createSprite(3, 3)
  const head = [
    [tint.highlight, tint.light, tint.dark],
    [tint.light, tint.shade, tint.dark],
    [tint.dark, tint.dark, tint.outline]
  ]
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) setPixel(sprite, x, y, head[y][x])
  return sprite
}

export const DETAIL_BUILDERS = { vent, buttons, toggles, knob, plate, barcode, hazard, hatch, jacks, speaker, screw }
