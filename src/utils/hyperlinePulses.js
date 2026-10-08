export function measurePath(points) {
  const lengths = [0]
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1]
    const to = points[index]
    lengths.push(lengths[index - 1] + Math.hypot(to.x - from.x, to.y - from.y))
  }
  return { points, lengths, total: lengths[lengths.length - 1] ?? 0 }
}

export function pointAt(path, distance) {
  const { points, lengths, total } = path
  if (points.length === 0) return { x: 0, y: 0 }
  if (distance <= 0 || points.length === 1) return { x: points[0].x, y: points[0].y }
  if (distance >= total) return { x: points.at(-1).x, y: points.at(-1).y }
  let index = 1
  while (lengths[index] < distance) index++
  const from = points[index - 1]
  const to = points[index]
  const span = lengths[index] - lengths[index - 1]
  const share = span > 0 ? (distance - lengths[index - 1]) / span : 0
  return { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share }
}

/**
 * [{ distance, forward }], distance from the `from` end. With direction 'both', pulses also
 * leave the `to` end half an interval later. `phase` (0..1) keeps lines out of step.
 */
export function pulsePositions(seconds, { total, speed, interval, direction = 'both', phase = 0 }) {
  if (!(total > 0) || !(speed > 0) || !(interval > 0)) return []
  const travel = total / speed
  const pulses = []
  const run = (offset, forward) => {
    const time = seconds + (phase + offset) * interval
    const newest = Math.floor(time / interval)
    for (let launch = newest; launch * interval > time - travel; launch--) {
      const covered = (time - launch * interval) * speed
      pulses.push({ distance: forward ? covered : total - covered, forward })
    }
  }
  run(0, true)
  if (direction === 'both') run(0.5, false)
  return pulses
}
