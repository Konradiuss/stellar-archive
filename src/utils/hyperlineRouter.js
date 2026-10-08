import { MAP_COLUMNS, MAP_ROWS } from '../config/mapGeometry.js'

const ORTHOGONAL_COST = 10
const DIAGONAL_COST = 14
const TURN_PENALTY = 3
const SHARED_NODE_PENALTY = 25
const SHARED_EDGE_PENALTY = 12
const CROSSING_PENALTY = 100
const MAP_EDGE_PENALTY = 5
const STAR_PROXIMITY_PENALTY = 6
// Star names sit under the stars (starLabels.js): leaving downwards costs a little more than a turn,
// so the route bends only when that is cheap; otherwise the name moves above the star.
const LABEL_SIDE_PENALTY = 12

const DIRECTIONS = [
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 }
]

function pointKey(point) {
  return `${point.x},${point.y}`
}

export function getSegmentKey(from, to) {
  const fromKey = pointKey(from)
  const toKey = pointKey(to)
  return fromKey < toKey ? `${fromKey}-${toKey}` : `${toKey}-${fromKey}`
}

function stateKey(x, y, directionIndex) {
  return `${x},${y},${directionIndex}`
}

function octileDistance(from, to) {
  const dx = Math.abs(to.x - from.x)
  const dy = Math.abs(to.y - from.y)
  return ORTHOGONAL_COST * Math.max(dx, dy) +
    (DIAGONAL_COST - ORTHOGONAL_COST) * Math.min(dx, dy)
}

function isInside(point, columns, rows) {
  return point.x >= 0 && point.x < columns && point.y >= 0 && point.y < rows
}

function sharesEndpoint(a, b, c, d) {
  return (a.x === c.x && a.y === c.y) ||
    (a.x === d.x && a.y === d.y) ||
    (b.x === c.x && b.y === c.y) ||
    (b.x === d.x && b.y === d.y)
}

function cross(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

function segmentsProperlyIntersect(a, b, c, d) {
  if (sharesEndpoint(a, b, c, d)) return false

  const abC = cross(a, b, c)
  const abD = cross(a, b, d)
  const cdA = cross(c, d, a)
  const cdB = cross(c, d, b)

  return ((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) &&
    ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))
}

// Two crossing segments share at least the cell of their crossing point.
function forEachCell(from, to, visit) {
  for (let x = Math.min(from.x, to.x); x <= Math.max(from.x, to.x); x++) {
    for (let y = Math.min(from.y, to.y); y <= Math.max(from.y, to.y); y++) visit(`${x},${y}`)
  }
}

function createUsage(routes, excludedId = null) {
  const nodeUsage = new Map()
  const edgeUsage = new Map()
  const segmentsByCell = new Map()

  routes.forEach((route, id) => {
    if (!route || id === excludedId) return

    for (let index = 1; index < route.length - 1; index++) {
      const key = pointKey(route[index])
      nodeUsage.set(key, (nodeUsage.get(key) || 0) + 1)
    }

    for (let index = 0; index < route.length - 1; index++) {
      const from = route[index]
      const to = route[index + 1]
      const key = getSegmentKey(from, to)
      edgeUsage.set(key, (edgeUsage.get(key) || 0) + 1)
      const segment = { from, to }
      forEachCell(from, to, cell => {
        const list = segmentsByCell.get(cell)
        if (list) list.push(segment)
        else segmentsByCell.set(cell, [segment])
      })
    }
  })

  return { nodeUsage, edgeUsage, segmentsByCell }
}

function countCrossings(from, to, usage) {
  const near = new Set()
  forEachCell(from, to, cell => usage.segmentsByCell.get(cell)?.forEach(segment => near.add(segment)))
  let crossings = 0
  for (const segment of near) {
    if (segmentsProperlyIntersect(from, to, segment.from, segment.to)) crossings++
  }
  return crossings
}

// Binary heap ordered by estimate, then cost, then key: the same order a full sort gave.
class OpenList {
  constructor(before) {
    this.items = []
    this.before = before
  }

  get size() {
    return this.items.length
  }

  push(item) {
    const items = this.items
    items.push(item)
    let index = items.length - 1
    while (index > 0) {
      const parent = (index - 1) >> 1
      if (this.before(items[parent], items[index]) <= 0) break
      ;[items[parent], items[index]] = [items[index], items[parent]]
      index = parent
    }
  }

  pop() {
    const items = this.items
    const top = items[0]
    const last = items.pop()
    if (items.length) {
      items[0] = last
      let index = 0
      for (;;) {
        const left = index * 2 + 1
        const right = left + 1
        let first = index
        if (left < items.length && this.before(items[left], items[first]) < 0) first = left
        if (right < items.length && this.before(items[right], items[first]) < 0) first = right
        if (first === index) break
        ;[items[first], items[index]] = [items[index], items[first]]
        index = first
      }
    }
    return top
  }
}

const searchOrder = (a, b) => a.f - b.f || a.g - b.g || a.key.localeCompare(b.key)

function isNearBlockedStar(point, blocked) {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue
      if (blocked.has(`${point.x + dx},${point.y + dy}`)) return true
    }
  }

  return false
}

function labelSideCost(from, to, start, end) {
  const leavesStartDown = from.x === start.x && from.y === start.y && to.y > from.y
  const entersEndFromBelow = to.x === end.x && to.y === end.y && to.y < from.y
  return (leavesStartDown ? LABEL_SIDE_PENALTY : 0) + (entersEndFromBelow ? LABEL_SIDE_PENALTY : 0)
}

function transitionCost(current, next, nextDirection, previousDirection, context) {
  const diagonal = current.x !== next.x && current.y !== next.y
  let cost = diagonal ? DIAGONAL_COST : ORTHOGONAL_COST
  cost += labelSideCost(current, next, context.start, context.end)

  if (previousDirection !== -1 && previousDirection !== nextDirection) {
    cost += TURN_PENALTY
  }

  if (next.x === 0 || next.x === context.columns - 1 || next.y === 0 || next.y === context.rows - 1) {
    if (next.x !== context.end.x || next.y !== context.end.y) {
      cost += MAP_EDGE_PENALTY
    }
  }

  const nodeCount = context.usage.nodeUsage.get(pointKey(next)) || 0
  cost += nodeCount * SHARED_NODE_PENALTY

  const edgeCount = context.usage.edgeUsage.get(getSegmentKey(current, next)) || 0
  cost += edgeCount * SHARED_EDGE_PENALTY

  cost += countCrossings(current, next, context.usage) * CROSSING_PENALTY

  if (isNearBlockedStar(next, context.blocked)) {
    cost += STAR_PROXIMITY_PENALTY
  }

  return cost
}

function reconstructPath(goalKey, parents, states) {
  const path = []
  let currentKey = goalKey

  while (currentKey) {
    const state = states.get(currentKey)
    path.push({ x: state.x, y: state.y })
    currentKey = parents.get(currentKey) || null
  }

  path.reverse()
  return path.filter((point, index) => {
    if (index === 0) return true
    const previous = path[index - 1]
    return point.x !== previous.x || point.y !== previous.y
  })
}

/** Returns null rather than a partial route when no path exists. */
export function findGridPath({
  from,
  to,
  stars = [],
  routes = new Map(),
  excludedRouteId = null,
  columns = MAP_COLUMNS,
  rows = MAP_ROWS
}) {
  const start = { x: from.sectorX ?? from.x, y: from.sectorY ?? from.y }
  const end = { x: to.sectorX ?? to.x, y: to.sectorY ?? to.y }

  if (!isInside(start, columns, rows) || !isInside(end, columns, rows)) {
    return null
  }

  if (start.x === end.x && start.y === end.y) {
    return [start]
  }

  const blocked = new Set()
  stars.forEach(star => {
    const key = `${star.sectorX},${star.sectorY}`
    if (key !== pointKey(start) && key !== pointKey(end)) blocked.add(key)
  })

  const usage = createUsage(routes, excludedRouteId)
  const context = { blocked, usage, columns, rows, start, end }
  const open = new OpenList(searchOrder)
  const bestCosts = new Map()
  const parents = new Map()
  const states = new Map()

  const initialKey = stateKey(start.x, start.y, -1)
  const initialState = {
    x: start.x,
    y: start.y,
    direction: -1,
    g: 0,
    f: octileDistance(start, end),
    key: initialKey
  }

  open.push(initialState)
  bestCosts.set(initialKey, 0)
  states.set(initialKey, initialState)

  while (open.size > 0) {
    const current = open.pop()

    if (current.g !== bestCosts.get(current.key)) continue

    if (current.x === end.x && current.y === end.y) {
      return reconstructPath(current.key, parents, states)
    }

    for (let directionIndex = 0; directionIndex < DIRECTIONS.length; directionIndex++) {
      const direction = DIRECTIONS[directionIndex]
      const next = { x: current.x + direction.x, y: current.y + direction.y }

      if (!isInside(next, columns, rows) || blocked.has(pointKey(next))) continue

      const stepCost = transitionCost(
        { x: current.x, y: current.y },
        next,
        directionIndex,
        current.direction,
        context
      )
      const nextCost = current.g + stepCost
      const nextKey = stateKey(next.x, next.y, directionIndex)

      if (nextCost >= (bestCosts.get(nextKey) ?? Infinity)) continue

      const nextState = {
        x: next.x,
        y: next.y,
        direction: directionIndex,
        g: nextCost,
        f: nextCost + octileDistance(next, end),
        key: nextKey
      }

      bestCosts.set(nextKey, nextCost)
      parents.set(nextKey, current.key)
      states.set(nextKey, nextState)
      open.push(nextState)
    }
  }

  return null
}

function routeLengthEstimate(hyperline) {
  const from = { x: hyperline.from.sectorX, y: hyperline.from.sectorY }
  const to = { x: hyperline.to.sectorX, y: hyperline.to.sectorY }
  return octileDistance(from, to)
}

function pathCost(path, usage, columns, rows) {
  if (!path) return Infinity

  let cost = 0
  let previousDirection = null

  for (let index = 0; index < path.length - 1; index++) {
    const from = path[index]
    const to = path[index + 1]
    const dx = to.x - from.x
    const dy = to.y - from.y
    const direction = `${dx},${dy}`
    cost += dx !== 0 && dy !== 0 ? DIAGONAL_COST : ORTHOGONAL_COST
    cost += labelSideCost(from, to, path[0], path[path.length - 1])

    if (previousDirection !== null && previousDirection !== direction) cost += TURN_PENALTY
    previousDirection = direction

    if (index < path.length - 2) {
      cost += (usage.nodeUsage.get(pointKey(to)) || 0) * SHARED_NODE_PENALTY
    }
    cost += (usage.edgeUsage.get(getSegmentKey(from, to)) || 0) * SHARED_EDGE_PENALTY
    cost += countCrossings(from, to, usage) * CROSSING_PENALTY

    if ((to.x === 0 || to.x === columns - 1 || to.y === 0 || to.y === rows - 1) && index < path.length - 2) {
      cost += MAP_EDGE_PENALTY
    }
  }

  return cost
}

function travelCost(path) {
  if (!path) return Infinity
  let cost = 0
  for (let index = 0; index < path.length - 1; index++) {
    const from = path[index]
    const to = path[index + 1]
    cost += from.x !== to.x && from.y !== to.y ? DIAGONAL_COST : ORTHOGONAL_COST
  }
  return cost
}

function capDetour(candidate, shortestPath) {
  if (!candidate) return shortestPath
  if (!shortestPath) return candidate
  const maximumUsefulCost = travelCost(shortestPath) * 1.75 + ORTHOGONAL_COST * 2
  return travelCost(candidate) <= maximumUsefulCost ? candidate : shortestPath
}

/** Results are in the original data order. */
export function routeHyperlines(hyperlines, stars, options = {}) {
  const columns = options.columns ?? MAP_COLUMNS
  const rows = options.rows ?? MAP_ROWS
  const routes = new Map()
  const shortestPaths = new Map()
  const sorted = [...hyperlines].sort((a, b) => {
    return routeLengthEstimate(b) - routeLengthEstimate(a) || a.id.localeCompare(b.id)
  })

  for (const hyperline of sorted) {
    const shortestPath = findGridPath({
      from: hyperline.from,
      to: hyperline.to,
      stars,
      routes: new Map(),
      columns,
      rows
    })
    shortestPaths.set(hyperline.id, shortestPath)
    const preferredPath = findGridPath({
      from: hyperline.from,
      to: hyperline.to,
      stars,
      routes,
      columns,
      rows
    })
    routes.set(hyperline.id, capDetour(preferredPath, shortestPath))
  }

  for (let pass = 0; pass < 2; pass++) {
    for (const hyperline of sorted) {
      const currentPath = routes.get(hyperline.id)
      const usageWithoutCurrent = createUsage(routes, hyperline.id)
      const preferredCandidate = findGridPath({
        from: hyperline.from,
        to: hyperline.to,
        stars,
        routes,
        excludedRouteId: hyperline.id,
        columns,
        rows
      })
      const candidate = capDetour(preferredCandidate, shortestPaths.get(hyperline.id))

      if (candidate && pathCost(candidate, usageWithoutCurrent, columns, rows) <
        pathCost(currentPath, usageWithoutCurrent, columns, rows)) {
        routes.set(hyperline.id, candidate)
      }
    }
  }

  return hyperlines.map(hyperline => ({
    hyperline,
    path: routes.get(hyperline.id) || null
  }))
}
