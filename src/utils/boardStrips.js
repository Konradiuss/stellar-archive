// Rects are CSS pixels; strips are returned in board pixels (BOARD_PX each).

export const BOARD_PX = 2
// Wider separations are not gaps between neighbouring screens.
const MAX_GAP = 64

function relative(rect, container) {
  return {
    left: rect.left - container.left,
    top: rect.top - container.top,
    right: rect.right - container.left,
    bottom: rect.bottom - container.top
  }
}

function gapBetween(a, b, axis) {
  const [start, end, crossStart, crossEnd] = axis === 'x'
    ? ['left', 'right', 'top', 'bottom']
    : ['top', 'bottom', 'left', 'right']
  const size = b[start] - a[end]
  if (size <= 0 || size > MAX_GAP) return null
  const from = Math.max(a[crossStart], b[crossStart])
  const to = Math.min(a[crossEnd], b[crossEnd])
  if (to <= from) return null
  return { start: a[end], size, from, to }
}

// Touching gaps on the same line (across a junction) become one strip.
function mergeGaps(gaps) {
  const sorted = [...gaps].sort((a, b) => a.start - b.start || a.from - b.from)
  const merged = []
  for (const gap of sorted) {
    const last = merged[merged.length - 1]
    const sameLine = last && Math.abs(last.start - gap.start) <= 1 && Math.abs(last.size - gap.size) <= 1
    if (sameLine && gap.from <= last.to + Math.max(last.size, gap.size) + 1) {
      last.to = Math.max(last.to, gap.to)
    } else {
      merged.push({ ...gap })
    }
  }
  return merged
}

export function findBoardStrips(containerRect, screenRects) {
  const rects = screenRects.map(rect => relative(rect, containerRect))
  const vertical = []
  const horizontal = []
  for (const a of rects) {
    for (const b of rects) {
      if (a === b) continue
      const side = gapBetween(a, b, 'x')
      if (side) vertical.push(side)
      const below = gapBetween(a, b, 'y')
      if (below) horizontal.push(below)
    }
  }

  const toStrip = (gap, orientation, index) => {
    const start = Math.floor(gap.start / BOARD_PX)
    const end = Math.ceil((gap.start + gap.size) / BOARD_PX)
    const from = Math.floor(gap.from / BOARD_PX)
    const to = Math.ceil(gap.to / BOARD_PX)
    const along = { length: to - from, thickness: end - start }
    return orientation === 'vertical'
      ? { key: `v${index}`, orientation, x: start, y: from, ...along }
      : { key: `h${index}`, orientation, x: from, y: start, ...along }
  }

  return [
    ...mergeGaps(vertical).map((gap, index) => toStrip(gap, 'vertical', index)),
    ...mergeGaps(horizontal).map((gap, index) => toStrip(gap, 'horizontal', index))
  ]
}
