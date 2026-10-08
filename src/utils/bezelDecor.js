import { createRng, spriteToDataUri, transpose } from './pixelArt'
import {
  BEZEL_BODY_START,
  BEZEL_BOTTOM,
  BEZEL_EDGE,
  BEZEL_INNER_RINGS,
  BOLT_SIZE,
  BOLT_SLOTS,
  DETAIL_BUILDERS,
  STEEL_TINTS,
  buildBezelBase,
  buildBolt
} from './bezelSprites'
import { themeCasing } from '../theme'

export const BOLT_OFFSET = 3
const SPAN_MARGIN = BOLT_OFFSET + BOLT_SIZE + 3
export const LED_WIDTH = 4
export const LED_HEIGHT = 3
const LED_CLEARANCE = 5

const THIN_BAND = BEZEL_EDGE - BEZEL_BODY_START - BEZEL_INNER_RINGS
const BOTTOM_BAND = BEZEL_BOTTOM - BEZEL_BODY_START - BEZEL_INNER_RINGS

const CLUSTER_SIZES = [[1, 5], [2, 4], [3, 2]]
const CLUSTER_INNER_GAP = 3
const CLUSTER_GAP = [16, 44]
const DETAIL_WEIGHTS = [
  ['vent', 3],
  ['buttons', 2],
  ['plate', 2],
  ['hatch', 2],
  ['screw', 2],
  ['toggles', 1.5],
  ['knob', 1.5],
  ['jacks', 1.5],
  ['speaker', 1.5],
  ['barcode', 1],
  ['hazard', 1]
]
const TALL_DETAILS = new Set(['vent', 'plate', 'hatch'])

const SIDES = ['top', 'bottom', 'left', 'right']
const isVertical = side => side === 'left' || side === 'right'

const baseCache = new Map()
const boltCache = new Map()
const clusterCache = new Map()

function baseUri(tintName) {
  if (!baseCache.has(tintName)) baseCache.set(tintName, spriteToDataUri(buildBezelBase(STEEL_TINTS[tintName])))
  return baseCache.get(tintName)
}

function boltUri(tintName, slot) {
  const key = `${tintName}:${slot}`
  if (!boltCache.has(key)) boltCache.set(key, spriteToDataUri(buildBolt(STEEL_TINTS[tintName], slot)))
  return boltCache.get(key)
}

// Each cluster has its own RNG: a longer edge only appends clusters, the first ones never change.
function clusterAt(seed, tintName, side, index) {
  const key = `${seed}|${tintName}|${side}|${index}`
  if (clusterCache.has(key)) return clusterCache.get(key)

  const rng = createRng(seed, side, index)
  const tint = STEEL_TINTS[tintName]
  const count = rng.weighted(CLUSTER_SIZES)
  const parts = []
  let length = 0
  let previous = null
  for (let i = 0; i < count; i++) {
    let kind = rng.weighted(DETAIL_WEIGHTS)
    if (kind === previous) kind = rng.weighted(DETAIL_WEIGHTS)
    previous = kind
    const height = side === 'bottom' && TALL_DETAILS.has(kind) ? BOTTOM_BAND - 2 : THIN_BAND - 2
    let sprite = DETAIL_BUILDERS[kind](rng, tint, height)
    const partLength = sprite.w
    const thickness = sprite.h
    if (isVertical(side)) sprite = transpose(sprite)
    if (i > 0) length += CLUSTER_INNER_GAP
    parts.push({ kind, offset: length, length: partLength, thickness, uri: spriteToDataUri(sprite) })
    length += partLength
  }
  const cluster = { parts, length, gap: rng.int(...CLUSTER_GAP) }
  clusterCache.set(key, cluster)
  return cluster
}

function layoutSide({ seed, tintName, side, length, ledEnd }) {
  let spanStart = SPAN_MARGIN
  let spanEnd = length - SPAN_MARGIN
  if (side === 'bottom' && ledEnd === 'start') spanStart += LED_WIDTH + LED_CLEARANCE
  if (side === 'bottom' && ledEnd === 'end') spanEnd -= LED_WIDTH + LED_CLEARANCE
  const span = spanEnd - spanStart
  if (span <= 0) return []

  const row = []
  let cursor = 0
  for (let index = 0; ; index++) {
    const cluster = clusterAt(seed, tintName, side, index)
    if (cursor + cluster.length > span) break
    row.push({ cluster, index, along: cursor })
    cursor += cluster.length + cluster.gap
  }
  if (!row.length) return []

  const last = row[row.length - 1]
  const used = last.along + last.cluster.length
  const offset = spanStart + Math.floor((span - used) / 2)
  const band = side === 'bottom' ? BOTTOM_BAND : THIN_BAND

  return row.flatMap(({ cluster, index, along }) => cluster.parts.map((part, partIndex) => {
    const across = BEZEL_BODY_START + Math.floor((band - part.thickness) / 2)
    const start = offset + along + part.offset
    const item = { key: `${side}-${index}-${partIndex}`, kind: part.kind, uri: part.uri, [side]: across }
    if (isVertical(side)) return Object.assign(item, { top: start, w: part.thickness, h: part.length })
    return Object.assign(item, { left: start, w: part.length, h: part.thickness })
  }))
}

// width/height in sprite pixels; positions are CSS-like offsets (left/right, top/bottom),
// so details on the right and bottom edges stay pinned to them.
export function layoutBezel({ seed, width = 0, height = 0 }) {
  const tintName = themeCasing(seed)
  const rng = createRng(seed, 'casing')
  const ledEnd = rng.chance(0.5) ? 'end' : 'start'

  const bolts = [
    ['top-left', { left: BOLT_OFFSET, top: BOLT_OFFSET }],
    ['top-right', { right: BOLT_OFFSET, top: BOLT_OFFSET }],
    ['bottom-left', { left: BOLT_OFFSET, bottom: BOLT_OFFSET }],
    ['bottom-right', { right: BOLT_OFFSET, bottom: BOLT_OFFSET }]
  ].map(([corner, position]) => {
    const slot = createRng(seed, 'bolt', corner).pick(BOLT_SLOTS)
    return { key: `bolt-${corner}`, kind: 'bolt', uri: boltUri(tintName, slot), w: BOLT_SIZE, h: BOLT_SIZE, ...position }
  })

  const led = {
    [ledEnd === 'end' ? 'right' : 'left']: SPAN_MARGIN,
    bottom: BEZEL_BODY_START + Math.floor((BOTTOM_BAND - LED_HEIGHT) / 2),
    w: LED_WIDTH,
    h: LED_HEIGHT
  }

  const items = SIDES.flatMap(side => layoutSide({
    seed,
    tintName,
    side,
    length: isVertical(side) ? height : width,
    ledEnd
  }))

  return { tint: tintName, baseUri: baseUri(tintName), bolts, items, led }
}

// Not seeded: screens busy together must not blink in step.
export function ledPace(random = Math.random) {
  const period = 0.5 + random() * 0.25
  return { '--led-period': `${period.toFixed(2)}s`, '--led-phase': `${(-random() * period).toFixed(2)}s` }
}
