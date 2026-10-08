// Two-module circuit breaker: the toggle is up for the map, down for the wiki. Raised, it shows its
// underside (MAP); lowered, its top side (WIKI). One sprite per frame and height.
import { createSprite, fillRect, getPixel, setPixel } from './pixelArt'

export const BREAKER_WIDTH = 50
// The breaker is as tall as the legend casing, but never shorter than this.
export const BREAKER_MIN_HEIGHT = 84
// Frames of the throw, from the map (up) to the wiki (down).
export const BREAKER_FRAMES = ['up', 'up-half', 'middle', 'down-half', 'down']
// Terminal sockets (9×9) at the bottom.
export const TERMINAL_LEFTS = [8, 32]

export const TOGGLE = {
  glint: '#c4d6ff', light: '#6f9dff', body: '#3a6ff0', under: '#305fd2', dark: '#2447a8', edge: '#142a66'
}
const INK = '#eef3ff'
export const PLATE = { face: '#cdd2da', shadow: '#aab0bb', ink: '#1b1d22' }
export const LABEL_LIGHTS = { map: '#5dff7a', wiki: '#ffc24a' }
// Words come from breaker.* strings, drawn in the pixel letters below: Latin, digits and Cyrillic.
export const DEFAULT_WORDS = Object.freeze({ plate: 'MODE', map: 'MAP', wiki: 'WIKI' })

// Pixel letters of the words, 6 rows each.
export const BREAKER_GLYPHS = {
  A: ['0110', '1001', '1001', '1111', '1001', '1001'],
  B: ['1110', '1001', '1110', '1001', '1001', '1110'],
  C: ['0111', '1000', '1000', '1000', '1000', '0111'],
  D: ['1110', '1001', '1001', '1001', '1001', '1110'],
  E: ['1111', '1000', '1110', '1000', '1000', '1111'],
  F: ['1111', '1000', '1110', '1000', '1000', '1000'],
  G: ['0111', '1000', '1000', '1011', '1001', '0111'],
  H: ['1001', '1001', '1111', '1001', '1001', '1001'],
  I: ['111', '010', '010', '010', '010', '111'],
  J: ['0011', '0001', '0001', '0001', '1001', '0110'],
  K: ['1001', '1010', '1100', '1100', '1010', '1001'],
  L: ['1000', '1000', '1000', '1000', '1000', '1111'],
  M: ['10001', '11011', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001'],
  O: ['0110', '1001', '1001', '1001', '1001', '0110'],
  P: ['1110', '1001', '1001', '1110', '1000', '1000'],
  Q: ['0110', '1001', '1001', '1001', '1010', '0101'],
  R: ['1110', '1001', '1001', '1110', '1010', '1001'],
  S: ['0111', '1000', '0110', '0001', '0001', '1110'],
  T: ['111', '010', '010', '010', '010', '010'],
  U: ['1001', '1001', '1001', '1001', '1001', '0110'],
  V: ['10001', '10001', '10001', '01010', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '11011', '10001'],
  X: ['10001', '01010', '00100', '00100', '01010', '10001'],
  Y: ['10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['1111', '0001', '0010', '0100', '1000', '1111'],
  0: ['0110', '1001', '1011', '1101', '1001', '0110'],
  1: ['010', '110', '010', '010', '010', '111'],
  2: ['0110', '1001', '0010', '0100', '1000', '1111'],
  3: ['1110', '0001', '0110', '0001', '0001', '1110'],
  4: ['1001', '1001', '1111', '0001', '0001', '0001'],
  5: ['1111', '1000', '1110', '0001', '0001', '1110'],
  6: ['0110', '1000', '1110', '1001', '1001', '0110'],
  7: ['1111', '0001', '0010', '0100', '0100', '0100'],
  8: ['0110', '1001', '0110', '1001', '1001', '0110'],
  9: ['0110', '1001', '1001', '0111', '0001', '0110'],
  Б: ['1111', '1000', '1110', '1001', '1001', '1110'],
  Г: ['1111', '1000', '1000', '1000', '1000', '1000'],
  Д: ['00110', '01010', '01010', '01010', '11111', '10001'],
  Ж: ['10101', '10101', '01110', '10101', '10101', '10101'],
  З: ['1110', '0001', '0110', '0001', '0001', '1110'],
  И: ['10001', '10001', '10011', '10101', '11001', '10001'],
  Й: ['00100', '10001', '10011', '10101', '11001', '10001'],
  Л: ['0111', '0101', '0101', '0101', '0101', '1001'],
  П: ['1111', '1001', '1001', '1001', '1001', '1001'],
  У: ['1001', '1001', '1001', '0111', '0001', '0110'],
  Ф: ['01110', '10101', '10101', '10101', '01110', '00100'],
  Ц: ['10010', '10010', '10010', '10010', '10010', '11111'],
  Ч: ['1001', '1001', '1001', '0111', '0001', '0001'],
  Ш: ['10101', '10101', '10101', '10101', '10101', '11111'],
  Щ: ['101010', '101010', '101010', '101010', '101010', '111111'],
  Ъ: ['11000', '01000', '01110', '01001', '01001', '01110'],
  Ы: ['10001', '10001', '11101', '10011', '10011', '11101'],
  Ь: ['1000', '1000', '1110', '1001', '1001', '1110'],
  Э: ['1110', '0001', '0111', '0001', '0001', '1110'],
  Ю: ['10010', '10101', '11101', '10101', '10101', '10010'],
  Я: ['0111', '1001', '1001', '0111', '0101', '1001'],
  '-': ['000', '000', '111', '000', '000', '000'],
  '.': ['0', '0', '0', '0', '0', '1'],
  '▲': ['00000', '00100', '01110', '11111', '00000', '00000'],
  '▼': ['00000', '11111', '01110', '00100', '00000', '00000'],
  ' ': ['0', '0', '0', '0', '0', '0']
}
// Cyrillic letters drawn as the Latin ones of the same shape.
for (const [cyrillic, latin] of Object.entries({ А: 'A', В: 'B', Е: 'E', Ё: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', Х: 'X' })) {
  BREAKER_GLYPHS[cyrillic] = BREAKER_GLYPHS[latin]
}
const GLYPH_ROWS = 6

export const TERMINAL_SCREW = [
  '..hhl..',
  '.hhxlb.',
  'hhlxbbd',
  'hxxxxxd',
  'lllxbdd',
  '.lbxdd.',
  '..ddd..'
]

export function textWidth(text) {
  return [...text].reduce((width, char) => width + BREAKER_GLYPHS[char][0].length + 1, -1)
}

export const labelText = (side, words = DEFAULT_WORDS) => `${side === 'map' ? '▲' : '▼'} ${words[side]}`

const WINDOW = { x: 5, w: 40, h: 38 }
const STAMP_ROWS = GLYPH_ROWS + 1
const stampBox = (text, y) => {
  const w = textWidth(text)
  return { x: Math.floor((BREAKER_WIDTH - w) / 2), y, w, h: STAMP_ROWS }
}

export function breakerLayout(height = BREAKER_MIN_HEIGHT, words = DEFAULT_WORDS) {
  const h = Math.max(BREAKER_MIN_HEIGHT, Math.floor(height))
  const shift = Math.floor((h - BREAKER_MIN_HEIGHT) / 2)
  const window = { ...WINDOW, y: 22 + shift }
  return {
    height: h,
    plate: { x: 4, y: 3, w: BREAKER_WIDTH - 8, h: 10 },
    labels: {
      map: stampBox(labelText('map', words), window.y - 1 - STAMP_ROWS),
      wiki: stampBox(labelText('wiki', words), window.y + window.h + 2)
    },
    window,
    pivot: window.y + window.h / 2,
    ridge: h - 15,
    terminalTop: h - 12
  }
}

const TOGGLE_X = WINDOW.x + 1
const TOGGLE_W = WINDOW.w - 2
const FACE_LENGTH = 16
const CAP = 6
const STUB = 3
const FRAME_VIEW = {
  up: { side: 'up', face: 16, cap: 2 },
  'up-half': { side: 'up', face: 8, cap: 4 },
  middle: { side: null, face: 0, cap: CAP },
  'down-half': { side: 'down', face: 8, cap: 4 },
  down: { side: 'down', face: 16, cap: 2 }
}
const FACES = {
  up: { side: 'map', color: TOGGLE.under },
  down: { side: 'wiki', color: TOGGLE.body }
}

const RIB_STEP = 20
export const DRUM_TURN = { up: -15, 'up-half': -7.5, middle: 0, 'down-half': 7.5, down: 15 }

function faceTexture(face, word) {
  const { color } = FACES[face]
  const texture = createSprite(TOGGLE_W, FACE_LENGTH, color)
  const top = Math.floor((FACE_LENGTH - GLYPH_ROWS) / 2)
  let x = Math.floor((TOGGLE_W - textWidth(word)) / 2)
  for (const char of word) {
    const rows = BREAKER_GLYPHS[char]
    rows.forEach((row, dy) => [...row].forEach((cell, dx) => {
      if (cell !== '1') return
      if (getPixel(texture, x + dx + 1, top + dy + 1) !== INK) setPixel(texture, x + dx + 1, top + dy + 1, TOGGLE.edge)
      setPixel(texture, x + dx, top + dy, INK)
    }))
    x += rows[0].length + 1
  }
  return texture
}

const textures = new Map()
function textureOf(face, words) {
  const word = words[FACES[face].side]
  const key = `${face}:${word}`
  if (!textures.has(key)) textures.set(key, faceTexture(face, word))
  return textures.get(key)
}

function drawFace(sprite, side, top, rows, words) {
  const texture = textureOf(side, words)
  for (let row = 0; row < rows; row++) {
    const from = Math.floor(((row + 0.5) * FACE_LENGTH) / rows)
    for (let x = 0; x < TOGGLE_W; x++) setPixel(sprite, TOGGLE_X + x, top + row, getPixel(texture, x, from))
  }
  fillRect(sprite, TOGGLE_X, top, 1, rows, TOGGLE.light)
  fillRect(sprite, TOGGLE_X + TOGGLE_W - 1, top, 1, rows, TOGGLE.dark)
  fillRect(sprite, TOGGLE_X + 1, side === 'up' ? top + rows - 1 : top, TOGGLE_W - 2, 1, TOGGLE.dark)
}

function drawCap(sprite, top, rows, lit) {
  const ramp = lit ? [TOGGLE.glint, TOGGLE.light, TOGGLE.light, TOGGLE.body] : [TOGGLE.dark, TOGGLE.edge]
  for (let row = 0; row < rows; row++) {
    const color = lit ? ramp[Math.min(row, ramp.length - 1)] : ramp[row < rows - 1 ? 0 : 1]
    fillRect(sprite, TOGGLE_X, top + row, TOGGLE_W, 1, color)
  }
}

function drawEndOn(sprite, pivot) {
  const top = pivot - CAP / 2
  fillRect(sprite, TOGGLE_X, top, TOGGLE_W, CAP, TOGGLE.light)
  fillRect(sprite, TOGGLE_X, top, TOGGLE_W, 1, TOGGLE.glint)
  fillRect(sprite, TOGGLE_X, top, 1, CAP, TOGGLE.glint)
  fillRect(sprite, TOGGLE_X + TOGGLE_W - 1, top + 1, 1, CAP - 1, TOGGLE.dark)
  fillRect(sprite, TOGGLE_X + 1, top + CAP - 1, TOGGLE_W - 1, 1, TOGGLE.dark)
}

function drawStub(sprite, pivot, below) {
  const colors = [TOGGLE.dark, TOGGLE.edge, TOGGLE.edge]
  for (let row = 0; row < STUB; row++) {
    const y = below ? pivot + row : pivot - 1 - row
    fillRect(sprite, TOGGLE_X + 2, y, TOGGLE_W - 4, 1, colors[row])
  }
}

function toggleBottom(frame, pivot) {
  const view = FRAME_VIEW[frame]
  if (view.side === 'down') return pivot + view.face + view.cap - 1
  return pivot + CAP / 2 - 1
}

function drawToggle(sprite, frame, pivot, words) {
  const view = FRAME_VIEW[frame]
  if (!view.side) {
    drawEndOn(sprite, pivot)
    return
  }
  if (view.side === 'up') {
    const faceTop = pivot - view.face
    drawStub(sprite, pivot, true)
    drawCap(sprite, faceTop - view.cap, view.cap, true)
    drawFace(sprite, 'up', faceTop, view.face, words)
  } else {
    drawStub(sprite, pivot, false)
    drawFace(sprite, 'down', pivot, view.face, words)
    drawCap(sprite, pivot + view.face, view.cap, false)
  }
}

export function drumRibs(frame, layout = breakerLayout()) {
  const radius = layout.window.h / 2
  const rows = []
  for (let angle = DRUM_TURN[frame] - 4 * RIB_STEP; angle < 90; angle += RIB_STEP) {
    if (angle <= -90) continue
    const row = Math.round(layout.pivot - 0.5 + radius * Math.sin((angle * Math.PI) / 180))
    if (row > layout.window.y && row < layout.window.y + layout.window.h - 1) rows.push(row)
  }
  return rows
}

// The last shade level is only the glint along the brightest line.
function drumLevels(tint) {
  return [tint.rim, tint.recess, tint.shade, tint.dark, tint.body]
}
const DRUM_TOP_LEVEL = 3

function drumLight(y, pivot, radius) {
  const d = (y + 0.5 - pivot) / radius
  const facing = Math.sqrt(Math.max(0, 1 - d * d))
  return Math.min(1, Math.max(0, (0.8 * facing - 0.6 * d) * Math.sqrt(facing)))
}

// Dithered between shade levels, so the drum reads as round.
function drawDrum(sprite, tint, frame, layout) {
  const { window: win, pivot } = layout
  const radius = win.h / 2
  const levels = drumLevels(tint)
  const rows = []
  for (let y = win.y; y < win.y + win.h; y++) rows.push({ y, value: drumLight(y, pivot, radius) * DRUM_TOP_LEVEL, shift: 0 })
  const rowAt = y => rows[y - win.y]
  const brightest = rows.reduce((best, row) => (row.value > best.value ? row : best))
  brightest.glint = true
  const ribs = drumRibs(frame, layout)
  for (const rib of ribs) {
    rowAt(rib).shift -= 1
    if (rowAt(rib - 1)) rowAt(rib - 1).shift += 1
  }
  const shadow = rowAt(toggleBottom(frame, pivot) + 1)
  if (shadow) shadow.shift -= 1

  for (const { y, value, shift, glint } of rows) {
    const base = Math.floor(value)
    const part = value - base
    for (let x = TOGGLE_X; x < TOGGLE_X + TOGGLE_W; x++) {
      const up = part >= 0.75 || (part >= 0.25 && (x + y) % 2 === 0) ? 1 : 0
      const level = glint && !shift ? levels.length - 1 : Math.min(DRUM_TOP_LEVEL, Math.max(0, base + up + shift))
      setPixel(sprite, x, y, levels[level])
    }
    setPixel(sprite, win.x, y, shift < 0 ? tint.rim : levels[Math.max(0, base - 1)])
    setPixel(sprite, win.x + win.w - 1, y, shift < 0 ? tint.rim : tint.recess)
  }
}

function drawTerminal(sprite, tint, left, top) {
  const colors = { h: tint.highlight, l: tint.light, b: tint.body, d: tint.dark, x: tint.rim }
  fillRect(sprite, left, top, 9, 9, tint.outline)
  fillRect(sprite, left + 1, top + 1, 7, 7, tint.recess)
  fillRect(sprite, left + 1, top + 9, 9, 1, tint.highlight)
  fillRect(sprite, left + 9, top + 1, 1, 9, tint.highlight)
  TERMINAL_SCREW.forEach((row, y) => [...row].forEach((cell, x) => {
    if (colors[cell]) setPixel(sprite, left + 1 + x, top + 1 + y, colors[cell])
  }))
}

// `edge` (if any) goes on the pixel under each letter pixel that is not a letter itself.
function drawText(sprite, text, left, top, ink, edge = null) {
  const cells = []
  let x = left
  for (const char of text) {
    const rows = BREAKER_GLYPHS[char]
    rows.forEach((row, dy) => [...row].forEach((cell, dx) => { if (cell === '1') cells.push([x + dx, top + dy]) }))
    x += rows[0].length + 1
  }
  const letters = new Set(cells.map(([cx, cy]) => `${cx},${cy}`))
  for (const [cx, cy] of cells) {
    setPixel(sprite, cx, cy, ink)
    if (edge && !letters.has(`${cx},${cy + 1}`)) setPixel(sprite, cx, cy + 1, edge)
  }
}

function drawPlate(sprite, tint, plate, word) {
  fillRect(sprite, plate.x, plate.y, plate.w, plate.h, tint.outline)
  fillRect(sprite, plate.x + 1, plate.y + 1, plate.w - 2, plate.h - 2, PLATE.face)
  fillRect(sprite, plate.x + 1, plate.y + plate.h - 2, plate.w - 2, 1, PLATE.shadow)
  fillRect(sprite, plate.x, plate.y + plate.h, plate.w + 1, 1, tint.highlight)
  fillRect(sprite, plate.x + plate.w, plate.y + 1, 1, plate.h, tint.highlight)
  for (const x of [plate.x + 2, plate.x + plate.w - 4]) {
    fillRect(sprite, x, plate.y + 4, 2, 2, tint.dark)
    setPixel(sprite, x, plate.y + 4, tint.highlight)
  }
  const left = plate.x + Math.floor((plate.w - textWidth(word)) / 2)
  drawText(sprite, word, left, plate.y + 2, PLATE.ink)
}

/** Only the lit letters of a position's stamp, laid over the breaker at layout.labels[side]. */
export function buildBreakerLabel(side, words = DEFAULT_WORDS, light = LABEL_LIGHTS[side]) {
  const text = labelText(side, words)
  const sprite = createSprite(textWidth(text), STAMP_ROWS)
  drawText(sprite, text, 0, 0, light)
  return sprite
}

export function buildBreaker(tint, frame = 'up', height = BREAKER_MIN_HEIGHT, words = DEFAULT_WORDS) {
  const layout = breakerLayout(height, words)
  const W = BREAKER_WIDTH
  const H = layout.height
  const sprite = createSprite(W, H)

  fillRect(sprite, 0, 0, W, H, tint.outline)
  fillRect(sprite, 1, 1, W - 2, H - 2, tint.light)
  fillRect(sprite, 1, 1, W - 2, 1, tint.highlight)
  fillRect(sprite, 1, 1, 1, H - 2, tint.highlight)
  fillRect(sprite, 2, H - 2, W - 3, 1, tint.dark)
  fillRect(sprite, W - 2, 2, 1, H - 3, tint.dark)

  drawPlate(sprite, tint, layout.plate, words.plate)
  for (const left of TERMINAL_LEFTS) drawTerminal(sprite, tint, left, layout.terminalTop)
  fillRect(sprite, 2, layout.ridge, W - 4, 1, tint.dark)
  fillRect(sprite, 2, layout.ridge + 1, W - 4, 1, tint.highlight)

  for (const side of ['map', 'wiki']) {
    const box = layout.labels[side]
    drawText(sprite, labelText(side, words), box.x, box.y, tint.shade, tint.highlight)
  }

  const win = layout.window
  fillRect(sprite, win.x - 1, win.y - 1, win.w + 2, 1, tint.outline)
  fillRect(sprite, win.x - 1, win.y - 1, 1, win.h + 2, tint.outline)
  fillRect(sprite, win.x - 1, win.y + win.h, win.w + 2, 1, tint.highlight)
  fillRect(sprite, win.x + win.w, win.y, 1, win.h + 1, tint.highlight)

  drawDrum(sprite, tint, frame, layout)
  drawToggle(sprite, frame, layout.pivot, words)
  return sprite
}

const WORD_ROOM = { plate: BREAKER_WIDTH - 8 - 10, map: TOGGLE_W - 4, wiki: TOGGLE_W - 4 }
const STAMP_ROOM = BREAKER_WIDTH - 4

/** `key`: 'plate', 'map' or 'wiki'. Null when every letter has a pixel glyph and the word fits. */
export function breakerWordProblem(key, word) {
  const missing = [...new Set([...word].filter(char => !BREAKER_GLYPHS[char]))]
  if (missing.length) return `has letters the breaker cannot draw (${missing.join(' ')}): only A–Z, А–Я, 0–9, - and . are drawn`
  if (!word.trim()) return 'is empty'
  if (textWidth(word) > WORD_ROOM[key] || (key !== 'plate' && textWidth(labelText(key, { [key]: word })) > STAMP_ROOM)) {
    return `is too long for the breaker: ${textWidth(word)} pixels where ${WORD_ROOM[key]} fit`
  }
  return null
}

/** A word that cannot be drawn stays English. */
export function breakerWords(text, locale) {
  const words = {}
  for (const key of Object.keys(DEFAULT_WORDS)) {
    const word = String(text(key) ?? '').toLocaleUpperCase(locale)
    words[key] = breakerWordProblem(key, word) ? DEFAULT_WORDS[key] : word
  }
  return words
}
