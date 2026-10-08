// Parts are packed along each gap strip, every slot with its own RNG: a longer strip only appends parts.
import { createRng, createSprite, fillRect, getPixel, rotateClockwise, setPixel } from './pixelArt'
import { drawText, textWidth } from './pixelFont'

export const STRIP_THICKNESS = 7
const T = STRIP_THICKNESS
const MIDDLE = Math.floor(T / 2)

export const BOARD_COLORS = {
  board: '#173a27',
  boardDark: '#133221',
  pour: '#1b422c',
  pourDark: '#183c28',
  trace: '#2d6644',
  traceLight: '#3a7b53',
  via: '#0b1a12',
  pad: '#7d8a82',
  padShade: '#5d6962',
  gold: '#a8903a',
  goldShade: '#7d6a2a',
  silk: '#8fa597',
  chipEdge: '#0e0f10',
  chip: '#1e1f22',
  chipTop: '#2e3034',
  chipMark: '#4a4d52',
  pin: '#9aa39d',
  pinShade: '#6f7872',
  smd: '#202020',
  ceramic: '#b89a6a',
  ceramicShade: '#8e7550',
  capRim: '#1a2750',
  capTop: '#2a3f7a',
  capStripe: '#9aa6c8',
  crystal: '#b8bcc4',
  crystalShade: '#80858d',
  inductor: '#3a3a3a',
  coil: '#8a6a3a',
  diodeBand: '#b8bcc4',
  ledRed: '#b83a3a',
  ledGreen: '#3ab85a',
  ledAmber: '#d99a1e',
  plastic: '#161616',
  jst: '#d8cfb0',
  jstShade: '#b3a988',
  jstSlot: '#3a3528',
  hole: '#050505',
  wireShadow: '#0c2016',
  tie: '#c8c8c0',
  tieShade: '#8a8a84'
}
const C = BOARD_COLORS

// [colour, highlight] of insulated wires.
const WIRE_COLORS = [
  ['#8a2c2c', '#c05050'],
  ['#a88a2a', '#d8b84a'],
  ['#2c4f8a', '#5078c0'],
  ['#86867e', '#a8a8a0'],
  ['#1a1a1a', '#454545']
]

const REF_PREFIXES = ['R', 'C', 'U', 'D', 'L', 'Q', 'J', 'TP', 'SW', 'X', 'F']
const BOARD_MARKS = ['NAV-3', 'REV B', 'REV C', '+5V', '+12V', 'GND', 'PWR', 'CPU', 'IO', 'BUS A', 'BUS B', 'SYNC', 'CLK', 'RX', 'TX', 'MK-II']

function traceColor(rng) {
  return rng.chance(0.12) ? C.traceLight : C.trace
}

function drawVia(sprite, x, y) {
  setPixel(sprite, x - 1, y, C.pad)
  setPixel(sprite, x + 1, y, C.pad)
  setPixel(sprite, x, y - 1, C.pad)
  setPixel(sprite, x, y + 1, C.padShade)
  setPixel(sprite, x, y, C.via)
}

// To the strip edge: it continues under a screen.
function traceToEdge(sprite, rng, x, y, up) {
  const end = up ? 0 : T - 1
  for (let row = y; up ? row >= end : row <= end; row += up ? -1 : 1) {
    if (!getPixel(sprite, x, row)) setPixel(sprite, x, row, traceColor(rng))
  }
}

function concat(left, right, gap) {
  const sprite = createSprite(left.w + gap + right.w, T)
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < left.w; x++) setPixel(sprite, x, y, getPixel(left, x, y))
    for (let x = 0; x < right.w; x++) setPixel(sprite, left.w + gap + x, y, getPixel(right, x, y))
  }
  return sprite
}

function refLabel(rng, prefix = rng.pick(REF_PREFIXES)) {
  const text = `${prefix}${rng.int(1, 99)}`
  const sprite = createSprite(textWidth(text), T)
  drawText(sprite, 0, 1, text, C.silk)
  return sprite
}

function withLabel(rng, sprite, prefix) {
  return rng.chance(0.45) ? concat(sprite, refLabel(rng, prefix), 2) : sprite
}

// Every builder returns a sprite T pixels tall; null pixels show the board.

function bus(rng) {
  const count = rng.int(2, 3)
  const length = rng.int(20, 70)
  const sprite = createSprite(length, T)
  let top = rng.int(0, T - 1 - (count - 1) * 2)
  const jogAt = rng.int(6, length - 10)
  const jog = rng.pick([-2, -1, 1, 2])
  const target = Math.min(T - 1 - (count - 1) * 2, Math.max(0, top + jog))
  const startToEdge = rng.chance(0.5)
  const endToEdge = rng.chance(0.5)

  const startTop = top
  for (let x = 0; x < length; x++) {
    if (x >= jogAt && top !== target) top += Math.sign(target - top)
    for (let lane = 0; lane < count; lane++) setPixel(sprite, x, top + lane * 2, traceColor(rng))
  }
  const ends = [[0, startTop, startToEdge, 1], [length - 1, top, endToEdge, -1]]
  for (const [x, laneTop, toEdge, inward] of ends) {
    for (let lane = 0; lane < count; lane++) {
      const row = laneTop + lane * 2
      if (toEdge) traceToEdge(sprite, rng, x, row, lane < count / 2)
      else drawVia(sprite, x + inward * (1 + (lane % 2) * 2), row)
    }
  }
  return sprite
}

function crossing(rng) {
  const count = rng.int(2, 5)
  const jog = rng.chance(0.5) ? rng.int(1, 2) : 0
  const sprite = createSprite((count - 1) * 2 + 1 + jog, T)
  for (let i = 0; i < count; i++) {
    let x = i * 2
    for (let y = 0; y < T; y++) {
      if (jog && y > 1 && y <= 1 + jog) x++
      setPixel(sprite, x, y, traceColor(rng))
    }
  }
  if (rng.chance(0.4)) drawVia(sprite, rng.int(0, count - 1) * 2, MIDDLE)
  return sprite
}

function soic(rng) {
  const pins = rng.int(2, 6)
  const length = pins * 2 + 1
  const sprite = createSprite(length, T)
  fillRect(sprite, 0, 2, length, 3, C.chip)
  fillRect(sprite, 0, 2, length, 1, C.chipTop)
  fillRect(sprite, 0, 2, 1, 3, C.chipEdge)
  fillRect(sprite, length - 1, 2, 1, 3, C.chipEdge)
  setPixel(sprite, 1, 3, C.chipMark)
  for (let i = 0; i < pins; i++) {
    const x = 1 + i * 2
    setPixel(sprite, x, 1, C.pin)
    setPixel(sprite, x, 5, C.pin)
    setPixel(sprite, x, 0, rng.chance(0.6) ? C.trace : C.pinShade)
    setPixel(sprite, x, 6, rng.chance(0.6) ? C.trace : C.pinShade)
  }
  return withLabel(rng, sprite, 'U')
}

function qfn(rng) {
  const sprite = createSprite(7, T)
  fillRect(sprite, 1, 1, 5, 5, C.chip)
  fillRect(sprite, 1, 1, 5, 1, C.chipTop)
  setPixel(sprite, 2, 2, C.chipMark)
  for (let i = 2; i <= 4; i += 2) {
    setPixel(sprite, i, 0, C.pin)
    setPixel(sprite, i, 6, C.pin)
    setPixel(sprite, 0, i, C.pin)
    setPixel(sprite, 6, i, C.pin)
  }
  return withLabel(rng, sprite, 'U')
}

function sot(rng) {
  const sprite = createSprite(5, T)
  const flip = rng.chance(0.5)
  const [twoSide, oneSide] = flip ? [5, 1] : [1, 5]
  fillRect(sprite, 1, 2, 3, 3, C.chip)
  fillRect(sprite, 1, 2, 3, 1, C.chipTop)
  setPixel(sprite, 1, twoSide, C.pin)
  setPixel(sprite, 3, twoSide, C.pin)
  setPixel(sprite, 2, oneSide, C.pin)
  traceToEdge(sprite, rng, 1, twoSide + (flip ? 1 : -1), !flip)
  traceToEdge(sprite, rng, 2, oneSide + (flip ? -1 : 1), flip)
  return withLabel(rng, sprite, 'Q')
}

const PASSIVE_BODIES = [
  ['resistor', C.smd, C.smd],
  ['ceramic', C.ceramic, C.ceramicShade],
  ['diode', C.smd, C.diodeBand],
  ['led', C.ledRed, '#e07070'],
  ['led', C.ledGreen, '#80e0a0'],
  ['led', C.ledAmber, '#ffe08a']
]

function passives(rng) {
  const count = rng.int(2, 4)
  const parts = []
  let length = 0
  for (let i = 0; i < count; i++) {
    const vertical = rng.chance(0.45)
    parts.push({ vertical, body: rng.pick(PASSIVE_BODIES), x: length, row: vertical ? rng.int(0, 1) * 2 + 1 : rng.int(1, 4) })
    length += (vertical ? 2 : 4) + 2
  }
  const sprite = createSprite(length - 2, T)
  for (const { vertical, body: [kind, color, accent], x, row } of parts) {
    if (vertical) {
      fillRect(sprite, x, row, 2, 1, C.pin)
      fillRect(sprite, x, row + 1, 2, 2, color)
      fillRect(sprite, x, row + 3, 2, 1, C.pin)
      if (kind === 'diode') fillRect(sprite, x, row + 1, 2, 1, accent)
      if (kind === 'led') setPixel(sprite, x, row + 1, accent)
      traceToEdge(sprite, rng, x, row - 1, true)
      traceToEdge(sprite, rng, x + 1, row + 4, false)
    } else {
      setPixel(sprite, x, row, C.pin)
      fillRect(sprite, x + 1, row, 2, 1, color)
      setPixel(sprite, x + 3, row, C.pin)
      if (kind === 'diode') setPixel(sprite, x + 1, row, accent)
      if (kind === 'led') setPixel(sprite, x + 2, row, accent)
      if (kind === 'ceramic') setPixel(sprite, x + 2, row, accent)
      traceToEdge(sprite, rng, x, row - 1, true)
      traceToEdge(sprite, rng, x + 3, row + 1, false)
    }
  }
  return sprite
}

function electrolytic(rng) {
  const sprite = createSprite(5, T)
  const shape = [
    [null, C.capRim, C.capRim, C.capRim, null],
    [C.capRim, C.capStripe, C.capTop, C.capTop, C.capRim],
    [C.capRim, C.capStripe, C.capRim, C.capTop, C.capRim],
    [C.capRim, C.capStripe, C.capTop, C.capTop, C.capRim],
    [null, C.capRim, C.capRim, C.capRim, null]
  ]
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) setPixel(sprite, x, y + 1, shape[y][x])
  return withLabel(rng, sprite, 'C')
}

function crystal(rng) {
  const length = rng.int(6, 8)
  const sprite = createSprite(length, T)
  fillRect(sprite, 1, 2, length - 2, 3, C.crystal)
  fillRect(sprite, 0, 3, length, 1, C.crystal)
  fillRect(sprite, 1, 4, length - 2, 1, C.crystalShade)
  setPixel(sprite, 0, 3, C.crystalShade)
  traceToEdge(sprite, rng, 1, 1, true)
  traceToEdge(sprite, rng, length - 2, 5, false)
  return withLabel(rng, sprite, 'X')
}

function inductor(rng) {
  const sprite = createSprite(5, T)
  fillRect(sprite, 0, 1, 5, 5, C.inductor)
  for (const [x, y] of [[1, 2], [2, 2], [3, 2], [3, 3], [3, 4], [2, 4], [1, 4], [1, 3]]) setPixel(sprite, x, y, C.coil)
  return withLabel(rng, sprite, 'L')
}

function header(rng) {
  const pins = rng.int(2, 6)
  const length = pins * 2 + 1
  const sprite = createSprite(length, T)
  fillRect(sprite, 0, 1, length, 5, C.plastic)
  for (let i = 0; i < pins; i++) {
    setPixel(sprite, 1 + i * 2, 2, C.gold)
    setPixel(sprite, 1 + i * 2, 4, C.gold)
  }
  setPixel(sprite, 0, 0, C.silk)
  setPixel(sprite, 1, 0, C.silk)
  return withLabel(rng, sprite, 'J')
}

function jst(rng) {
  const pins = rng.int(2, 5)
  const length = pins * 2 + 2
  const sprite = createSprite(length, T)
  fillRect(sprite, 0, 1, length, 5, C.jst)
  fillRect(sprite, 0, 5, length, 1, C.jstShade)
  fillRect(sprite, 1, 2, length - 2, 2, C.jstSlot)
  for (let i = 0; i < pins; i++) setPixel(sprite, 1 + i * 2 + 1, 3, C.gold)
  return withLabel(rng, sprite, 'J')
}

function label(rng) {
  const text = rng.chance(0.5) ? rng.pick(BOARD_MARKS) : `${rng.pick(REF_PREFIXES)}${rng.int(1, 99)}`
  const boxed = rng.chance(0.35)
  const width = textWidth(text) + (boxed ? 4 : 0)
  const sprite = createSprite(width, T)
  drawText(sprite, boxed ? 2 : 0, 1, text, C.silk)
  if (boxed) {
    fillRect(sprite, 0, 0, width, 1, C.silk)
    fillRect(sprite, 0, T - 1, width, 1, C.silk)
    fillRect(sprite, 0, 0, 1, T, C.silk)
    fillRect(sprite, width - 1, 0, 1, T, C.silk)
  }
  return sprite
}

function testpads(rng) {
  const count = rng.int(2, 5)
  const gold = rng.chance(0.5)
  const sprite = createSprite(count * 4 - 1, T)
  for (let i = 0; i < count; i++) {
    const x = i * 4 + 1
    const y = rng.int(2, 4)
    if (gold) {
      fillRect(sprite, x - 1, y - 1, 2, 2, C.gold)
      setPixel(sprite, x, y, C.goldShade)
    } else {
      drawVia(sprite, x, y)
    }
  }
  return sprite
}

function mount() {
  const sprite = createSprite(7, T)
  const ring = [
    [null, null, C.gold, C.gold, C.gold, null, null],
    [null, C.gold, C.goldShade, C.goldShade, C.goldShade, C.gold, null],
    [C.gold, C.goldShade, C.hole, C.hole, C.hole, C.goldShade, C.gold],
    [C.gold, C.goldShade, C.hole, C.hole, C.hole, C.goldShade, C.gold],
    [C.gold, C.goldShade, C.hole, C.hole, C.hole, C.goldShade, C.gold],
    [null, C.gold, C.goldShade, C.goldShade, C.goldShade, C.gold, null],
    [null, null, C.gold, C.gold, C.gold, null, null]
  ]
  for (let y = 0; y < T; y++) for (let x = 0; x < 7; x++) setPixel(sprite, x, y, ring[y][x])
  return sprite
}

function ground(rng) {
  const marked = rng.chance(0.3)
  const length = marked ? textWidth('GND') + 8 : rng.int(12, 30)
  const sprite = createSprite(length, T)
  fillRect(sprite, 0, 0, length, T, C.pour)
  if (marked) {
    drawText(sprite, 4, 1, 'GND', C.silk)
  } else {
    const offset = rng.int(0, 3)
    for (let x = 1 + offset; x < length - 1; x += 4) drawVia(sprite, x, (Math.floor(x / 4) % 2) ? 2 : 4)
  }
  return sprite
}

function meander(rng) {
  const turns = rng.int(3, 6)
  const sprite = createSprite(turns * 4 + 1, T)
  const [top, bottom] = [1, 5]
  for (let i = 0; i < turns; i++) {
    const x = i * 4
    for (let y = top; y <= bottom; y++) setPixel(sprite, x, y, C.trace)
    const row = i % 2 ? top : bottom
    for (let dx = 0; dx <= 4; dx++) setPixel(sprite, x + dx, row, C.trace)
  }
  for (let y = top; y <= bottom; y++) setPixel(sprite, turns * 4, y, C.trace)
  traceToEdge(sprite, rng, 0, top - 1, true)
  traceToEdge(sprite, rng, turns * 4, bottom + 1, false)
  return sprite
}

const PARTS = { bus, crossing, soic, qfn, sot, passives, electrolytic, crystal, inductor, header, jst, label, testpads, mount, ground, meander }
const PART_WEIGHTS = [
  ['bus', 3], ['crossing', 2.5], ['passives', 3], ['soic', 2], ['label', 2], ['sot', 1.5],
  ['testpads', 1.5], ['ground', 1.5], ['qfn', 1], ['electrolytic', 1], ['header', 1],
  ['crystal', 0.8], ['inductor', 0.8], ['jst', 0.8], ['meander', 0.8], ['mount', 0.4]
]

function blit(target, sprite, x0) {
  for (let y = 0; y < sprite.h; y++) {
    for (let x = 0; x < sprite.w; x++) {
      const color = getPixel(sprite, x, y)
      if (color) setPixel(target, x0 + x, y, color)
    }
  }
}

function drawBoardBase(strip, seed, key) {
  const { w } = strip
  const speck = createRng(seed, key, 'specks')
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < T; y++) if (speck.chance(0.03)) setPixel(strip, x, y, C.boardDark)
  }
  let cursor = createRng(seed, key, 'pour-start').int(0, 40)
  for (let index = 0; cursor < w; index++) {
    const rng = createRng(seed, key, 'pour', index)
    const length = rng.int(15, 60)
    const depth = rng.int(2, 4)
    const fromTop = rng.chance(0.5)
    for (let x = cursor; x < Math.min(w, cursor + length); x++) {
      const ramp = Math.min(x - cursor, cursor + length - 1 - x)
      const rows = Math.min(depth, ramp + 1)
      for (let i = 0; i < rows; i++) setPixel(strip, x, fromTop ? i : T - 1 - i, i === rows - 1 ? C.pourDark : C.pour)
    }
    cursor += length + rng.int(20, 90)
  }
}

const TAIL_ATTEMPTS = 24

function drawParts(strip, seed, key) {
  let cursor = createRng(seed, key, 'parts-start').int(1, 6)
  for (let index = 0; ; index++) {
    const rng = createRng(seed, key, index)
    const part = PARTS[rng.weighted(PART_WEIGHTS)](rng)
    if (cursor + part.w > strip.w) break
    blit(strip, part, cursor)
    cursor += part.w + rng.int(2, 8)
  }

  // Fill the rest with smaller parts, or the end of the strip stays bare.
  for (let attempt = 0; attempt < TAIL_ATTEMPTS && cursor < strip.w - 2; attempt++) {
    const rng = createRng(seed, key, 'tail', strip.w, attempt)
    const part = PARTS[rng.weighted(PART_WEIGHTS)](rng)
    if (cursor + part.w > strip.w) continue
    blit(strip, part, cursor)
    cursor += part.w + rng.int(2, 5)
  }
}

function drawWires(strip, seed, key) {
  let cursor = createRng(seed, key, 'wires-start').int(10, 80)
  for (let index = 0; ; index++) {
    const rng = createRng(seed, key, 'wires', index)
    const length = rng.int(40, 150)
    if (cursor + length > strip.w) break
    const bundle = rng.chance(0.4) ? 2 : 1
    const colors = [rng.pick(WIRE_COLORS), rng.pick(WIRE_COLORS)]
    const lane = rng.int(1, T - 2 * bundle - 1)
    const enterFromTop = rng.chance(0.5)
    const exitToTop = rng.chance(0.5)
    const offTop = -2 * bundle
    const pathRow = x => {
      const fromStart = x - cursor
      const fromEnd = cursor + length - 1 - x
      let row = lane
      row = enterFromTop ? Math.min(row, offTop + fromStart) : Math.max(row, T - fromStart)
      row = exitToTop ? Math.min(row, offTop + fromEnd) : Math.max(row, T - fromEnd)
      return row
    }
    // Shadow first, then each wire: highlight on top, colour below.
    for (let x = cursor; x < cursor + length; x++) {
      const row = pathRow(x)
      setPixel(strip, x + 1, row + bundle * 2, C.wireShadow)
    }
    for (let x = cursor; x < cursor + length; x++) {
      const row = pathRow(x)
      for (let wire = 0; wire < bundle; wire++) {
        const [color, light] = colors[wire]
        setPixel(strip, x, row + wire * 2, light)
        setPixel(strip, x, row + wire * 2 + 1, color)
      }
    }
    if (bundle === 2) {
      for (let x = cursor + T + rng.int(4, 12); x < cursor + length - T - 4; x += rng.int(30, 60)) {
        const row = pathRow(x)
        for (let y = row - 1; y <= row + 4; y++) setPixel(strip, x, y, C.tie)
        setPixel(strip, x + 1, row - 1, C.tieShade)
      }
    }
    cursor += length + rng.int(30, 160)
  }
}

export function generateStrip({ seed, key, length }) {
  const strip = createSprite(length, T, C.board)
  drawBoardBase(strip, seed, key)
  drawParts(strip, seed, key)
  drawWires(strip, seed, key)
  return strip
}

const packedCache = new Map()
function pack(hex) {
  if (!packedCache.has(hex)) {
    const value = parseInt(hex.slice(1), 16)
    const r = (value >> 16) & 255
    const g = (value >> 8) & 255
    const b = value & 255
    // ImageData is RGBA in memory: little-endian uint32 reads ABGR.
    packedCache.set(hex, ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0)
  }
  return packedCache.get(hex)
}

export function renderCircuitBoard({ seed, width, height, strips }) {
  const pixels = new Uint32Array(width * height).fill(pack(C.board))
  for (const strip of strips) {
    let sprite = generateStrip({ seed, key: strip.key, length: strip.length })
    if (strip.orientation === 'vertical') sprite = rotateClockwise(sprite)
    // Centre the strip design in the gap (a gap can be a pixel wider).
    const offsetX = strip.orientation === 'vertical' ? Math.floor((strip.thickness - T) / 2) : 0
    const offsetY = strip.orientation === 'horizontal' ? Math.floor((strip.thickness - T) / 2) : 0
    for (let y = 0; y < sprite.h; y++) {
      const py = strip.y + offsetY + y
      if (py < 0 || py >= height) continue
      for (let x = 0; x < sprite.w; x++) {
        const px = strip.x + offsetX + x
        if (px < 0 || px >= width) continue
        pixels[py * width + px] = pack(getPixel(sprite, x, y))
      }
    }
  }
  return pixels
}
