// Each name stays inside its star's sector, so names never overlap. Press Start 2P is monospaced
// (a glyph is as wide as the font size), so a name's size is known without drawing it.

import { SECTOR_SIZE, getSectorCenter } from '../config/mapGeometry'

const OUTLINE = 2
const SHADOW = 2
export const LABEL_GAP_FROM_CENTER = 17

// Tried in order until the name fits.
const FITS = [
  { fontSize: 10, lineHeight: 11, maxChars: 9, maxLines: 2, breakWords: false },
  { fontSize: 8, lineHeight: 9, maxChars: 11, maxLines: 3, breakWords: true }
]

const charCount = text => [...text].length

// Words, cut after their own hyphens ("Halcyon-442" -> "Halcyon-", "442").
function tokenize(name) {
  const tokens = []
  name.trim().split(/\s+/).filter(Boolean).forEach(word => {
    const parts = word.split(/(?<=-)/)
    parts.forEach((part, index) => tokens.push({ text: part, spaced: index === 0 && tokens.length > 0 }))
  })
  return tokens
}

// A word longer than a line is cut with a hyphen only with breakWords; otherwise the fit fails.
export function wrapName(name, maxChars, breakWords) {
  const lines = []
  let line = ''
  for (const token of tokenize(name)) {
    const glue = line && token.spaced ? ' ' : ''
    if (charCount(line + glue + token.text) <= maxChars) {
      line += glue + token.text
      continue
    }
    if (line) lines.push(line)
    line = ''
    const chars = [...token.text]
    if (chars.length > maxChars) {
      if (!breakWords) return null
      // Even pieces: "Indepe-" / "ndence" rather than "Independen-" / "ce".
      const pieces = Math.ceil((chars.length - 1) / (maxChars - 1))
      const size = Math.ceil(chars.length / pieces)
      for (let start = 0; start + size < chars.length; start += size) {
        lines.push(chars.slice(start, start + size).join('') + '-')
      }
      line = chars.slice(Math.floor((chars.length - 1) / size) * size).join('')
      continue
    }
    line = token.text
  }
  if (line) lines.push(line)
  return lines
}

function measure(lines, fit) {
  const longest = Math.max(...lines.map(charCount))
  return {
    lines,
    fontSize: fit.fontSize,
    lineHeight: fit.lineHeight,
    width: longest * fit.fontSize + OUTLINE * 2,
    height: lines.length * fit.lineHeight + OUTLINE * 2 + SHADOW
  }
}

export function fitStarLabel(name) {
  const text = String(name ?? '').trim() || '?'
  for (const fit of FITS) {
    const lines = wrapName(text, fit.maxChars, fit.breakWords)
    if (lines && lines.length <= fit.maxLines) return measure(lines, fit)
  }
  const fit = FITS.at(-1)
  const lines = wrapName(text, fit.maxChars, true).slice(0, fit.maxLines)
  const last = [...lines[lines.length - 1]].slice(0, fit.maxChars - 1)
  lines[lines.length - 1] = last.join('').replace(/[\s-]+$/, '') + '…'
  return measure(lines, fit)
}

/** Best first: the usual fit, a word per line, the small font on one line, the small font with a word per line. */
export function labelFits(name) {
  const text = String(name ?? '').trim() || '?'
  const longestWord = Math.max(...tokenize(text).map(token => charCount(token.text)))
  const fits = [fitStarLabel(text)]
  const add = (lines, fit) => {
    if (!lines || lines.length > fit.maxLines || lines.some(line => charCount(line) > fit.maxChars)) return
    const same = known => known.fontSize === fit.fontSize && known.lines.join('\n') === lines.join('\n')
    if (fits.some(same)) return
    fits.push(measure(lines, fit))
  }
  const [big, small] = FITS
  add(wrapName(text, longestWord, false), big)
  add(charCount(text) <= small.maxChars ? [text] : null, small)
  add(wrapName(text, longestWord, false), small)
  return fits
}

export function starLabelRect(star, fit, side = 'below') {
  const center = getSectorCenter(star.sectorX, star.sectorY)
  const top = side === 'above'
    ? center.y - LABEL_GAP_FROM_CENTER - fit.height
    : center.y + LABEL_GAP_FROM_CENTER
  return {
    left: center.x - fit.width / 2,
    right: center.x + fit.width / 2,
    top,
    bottom: top + fit.height
  }
}

const sectorKey = (x, y) => `${x},${y}`

/**
 * routes: [{ path }] from routeHyperlines. A line leaving downwards puts the name above, unless a line
 * also leaves upwards (then it stays below and the line passes under the text).
 */
export function chooseLabelSides(stars, routes = []) {
  const busy = new Map() // sector -> { below, above }
  const mark = (point, dy) => {
    const key = sectorKey(point.x, point.y)
    const entry = busy.get(key) ?? { below: false, above: false }
    if (dy > 0) entry.below = true
    if (dy < 0) entry.above = true
    busy.set(key, entry)
  }
  routes.forEach(({ path }) => {
    if (!path || path.length < 2) return
    mark(path[0], path[1].y - path[0].y)
    mark(path[path.length - 1], path[path.length - 2].y - path[path.length - 1].y)
  })

  return new Map(stars.map(star => {
    const entry = busy.get(sectorKey(star.sectorX, star.sectorY))
    return [star.id, entry?.below && !entry.above ? 'above' : 'below']
  }))
}

/** Map of star id -> { side, rect, lines, fontSize, lineHeight, width, height }. */
export function layoutStarLabels(stars, routes = []) {
  const sides = chooseLabelSides(stars, routes)
  return new Map(stars.map(star => {
    const fit = fitStarLabel(star.name)
    const side = sides.get(star.id)
    return [star.id, { ...fit, side, rect: starLabelRect(star, fit, side) }]
  }))
}

export function sectorRect(star) {
  const left = star.sectorX * SECTOR_SIZE
  const top = star.sectorY * SECTOR_SIZE
  return { left, top, right: left + SECTOR_SIZE, bottom: top + SECTOR_SIZE }
}

/** Liang–Barsky clipping: does the segment touch the rectangle? */
export function segmentCrossesRect(from, to, rect) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  let enter = 0
  let leave = 1
  const edges = [
    [-dx, from.x - rect.left], [dx, rect.right - from.x],
    [-dy, from.y - rect.top], [dy, rect.bottom - from.y]
  ]
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false
      continue
    }
    const t = q / p
    if (p < 0) enter = Math.max(enter, t)
    else leave = Math.min(leave, t)
    if (enter > leave) return false
  }
  return true
}

const LABEL_CLEARANCE = 2
// The star's own border may run along the edge of its name, over the outline,
const OWN_BORDER_SLACK = OUTLINE
const OTHER_SIDE = { below: 'above', above: 'below' }

const grow = (rect, by) => ({ left: rect.left - by, top: rect.top - by, right: rect.right + by, bottom: rect.bottom + by })

/** The star's own hyperline (`ends` holds its sector) does not count; its own border (`faction`) may touch the outline. */
export function labelIsClear(star, rect, segments) {
  const key = sectorKey(star.sectorX, star.sectorY)
  const zone = grow(rect, LABEL_CLEARANCE)
  const letters = grow(rect, -OWN_BORDER_SLACK)
  return !segments.some(segment => {
    if (segment.ends?.includes(key)) return false
    const own = segment.faction !== undefined && segment.faction === star.faction
    return segmentCrossesRect(segment.from, segment.to, own ? letters : zone)
  })
}

/**
 * segments: [{ from, to }] of borders (with `faction`) and hyperlines (with `ends`, the sectors they join).
 * A name with no room anywhere is `hidden` (typed in on hover).
 */
export function resolveLabelSpace(labels, stars, segments) {
  const near = segmentIndex(segments)
  return new Map(stars.filter(star => labels.has(star.id)).map(star => {
    const label = labels.get(star.id)
    for (const fit of labelFits(star.name)) {
      for (const side of [label.side, OTHER_SIDE[label.side]]) {
        const rect = starLabelRect(star, fit, side)
        if (labelIsClear(star, rect, near(grow(rect, LABEL_CLEARANCE)))) return [star.id, { ...label, ...fit, side, rect, hidden: false }]
      }
    }
    return [star.id, { ...label, hidden: true }]
  }))
}

// A segment through a rectangle shares a sector with it, so each name is tested only against nearby lines.
function segmentIndex(segments) {
  const cells = new Map()
  const cellsOf = (left, top, right, bottom, visit) => {
    for (let x = Math.floor(left / SECTOR_SIZE); x <= Math.floor(right / SECTOR_SIZE); x++) {
      for (let y = Math.floor(top / SECTOR_SIZE); y <= Math.floor(bottom / SECTOR_SIZE); y++) visit(`${x},${y}`)
    }
  }
  segments.forEach(segment => {
    const { from, to } = segment
    cellsOf(Math.min(from.x, to.x), Math.min(from.y, to.y), Math.max(from.x, to.x), Math.max(from.y, to.y), key => {
      const list = cells.get(key)
      if (list) list.push(segment)
      else cells.set(key, [segment])
    })
  })
  return rect => {
    const found = new Set()
    cellsOf(rect.left, rect.top, rect.right, rect.bottom, key => cells.get(key)?.forEach(segment => found.add(segment)))
    return [...found]
  }
}

// Points are { x, y } or [x, y].
export function polylineSegments(points, closed = false) {
  const list = (points ?? []).map(point => (Array.isArray(point) ? { x: point[0], y: point[1] } : point))
  const segments = []
  for (let index = 0; index + 1 < list.length; index++) segments.push({ from: list[index], to: list[index + 1] })
  if (closed && list.length > 2) segments.push({ from: list[list.length - 1], to: list[0] })
  return segments
}

export const TYPE_MS_PER_CHAR = 25
export const ERASE_MS_PER_CHAR = 12
const TYPE_CURSOR = '_'

/** Untyped characters become spaces, so the centred monospaced text does not move while it is typed. */
export function typedLabel(lines, count) {
  let left = Math.max(0, Math.floor(count))
  let cursor = left < charCount(lines.join(''))
  return lines.map(line => [...line].map(char => {
    if (left > 0) {
      left--
      return char
    }
    if (cursor) {
      cursor = false
      return TYPE_CURSOR
    }
    return ' '
  }).join('')).join('\n')
}

export function stepTyping(count, target, dtMs) {
  if (count < target) return Math.min(target, count + dtMs / TYPE_MS_PER_CHAR)
  if (count > target) return Math.max(target, count - dtMs / ERASE_MS_PER_CHAR)
  return count
}
