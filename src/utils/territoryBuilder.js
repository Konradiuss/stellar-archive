import {
  DEFAULT_GALAXY,
  SECTOR_SIZE,
  TERRITORY_GRID_STEP
} from '../config/mapGeometry.js'

const CLUSTER_DISTANCE = 2
const STAR_INFLUENCE_RADIUS = SECTOR_SIZE * 1.65
const CORRIDOR_INFLUENCE_RADIUS = SECTOR_SIZE * 1.05
const FIELD_BLEND_RADIUS = SECTOR_SIZE * 0.45
const BORDER_GAP_HALF = 5
const ENCLAVE_RING_RADIUS = SECTOR_SIZE * 0.8
const ENCLAVE_RING_THICKNESS = SECTOR_SIZE * 1.25
const MIN_RING_AREA = TERRITORY_GRID_STEP * TERRITORY_GRID_STEP * 4
const RESAMPLE_SPACING = TERRITORY_GRID_STEP * 2
const EDGE_EPSILON = 0.001
// Past 30 sectors across the grid gets coarser: at most this many steps per side.
const MAX_GRID_STEPS = 600
// A farther star or corridor cannot move the border: the field matters only near zero,
// where a far one is lost in the smooth minimum.
const FIELD_REACH = SECTOR_SIZE * 6
const FIELD_BLOCK = SECTOR_SIZE * 2

export function territoryGridStep({ width, height }) {
  return Math.max(TERRITORY_GRID_STEP, Math.ceil(Math.max(width, height) / MAX_GRID_STEPS))
}

export function groupStarsByFaction(stars) {
  const groups = {}
  stars.forEach(star => {
    if (!star.faction) return
    if (!groups[star.faction]) groups[star.faction] = []
    groups[star.faction].push(star)
  })
  return groups
}

function starKey(star) {
  return `${star.sectorX},${star.sectorY}`
}

function starCenter(star) {
  return {
    x: star.sectorX * SECTOR_SIZE + SECTOR_SIZE / 2,
    y: star.sectorY * SECTOR_SIZE + SECTOR_SIZE / 2
  }
}

// occupied: the sectors that have a star ('x,y').
function isPathClear(from, to, occupied, factionStarKeys) {
  const dx = to.sectorX - from.sectorX
  const dy = to.sectorY - from.sectorY
  const steps = Math.max(Math.abs(dx), Math.abs(dy))

  for (let index = 1; index < steps; index++) {
    const checkX = Math.round(from.sectorX + (dx / steps) * index)
    const checkY = Math.round(from.sectorY + (dy / steps) * index)
    const key = `${checkX},${checkY}`
    if (occupied.has(key) && !factionStarKeys.has(key)) return false
  }
  return true
}

const occupiedSectors = stars => new Set(stars.map(starKey))

export function findConnectedClusters(factionStars, allStars, maxDistance = CLUSTER_DISTANCE) {
  if (factionStars.length === 0) return []

  const factionStarKeys = new Set(factionStars.map(starKey))
  const occupied = occupiedSectors(allStars)
  const bySector = new Map(factionStars.map(star => [starKey(star), star]))
  const visited = new Set()
  const clusters = []

  // An explicit stack: a long chain of stars must not overflow the call stack.
  function collect(first) {
    const cluster = []
    const stack = [first]
    visited.add(starKey(first))
    while (stack.length) {
      const star = stack.pop()
      cluster.push(star)
      for (let dy = -maxDistance; dy <= maxDistance; dy++) {
        for (let dx = -maxDistance; dx <= maxDistance; dx++) {
          const otherKey = `${star.sectorX + dx},${star.sectorY + dy}`
          const other = bySector.get(otherKey)
          if (!other || visited.has(otherKey) || !isPathClear(star, other, occupied, factionStarKeys)) continue
          visited.add(otherKey)
          stack.push(other)
        }
      }
    }
    return cluster
  }

  factionStars.forEach(star => {
    if (visited.has(starKey(star))) return
    clusters.push(collect(star).sort((left, right) => left.id.localeCompare(right.id)))
  })

  return clusters.sort((left, right) => left[0].id.localeCompare(right[0].id))
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y)
  const projection = Math.max(0, Math.min(1,
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)
  ))
  return Math.hypot(
    point.x - (start.x + projection * dx),
    point.y - (start.y + projection * dy)
  )
}

function smoothMinimum(left, right, blendRadius = FIELD_BLEND_RADIUS) {
  if (!Number.isFinite(left)) return right
  if (!Number.isFinite(right)) return left
  const blend = Math.max(blendRadius - Math.abs(left - right), 0) / blendRadius
  return Math.min(left, right) - blend * blend * blendRadius * 0.25
}

function createConnectionSegments(cluster, occupied) {
  if (cluster.length < 2) return []
  const factionKeys = new Set(cluster.map(starKey))
  const segments = []

  for (let leftIndex = 0; leftIndex < cluster.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < cluster.length; rightIndex++) {
      const left = cluster[leftIndex]
      const right = cluster[rightIndex]
      const gridDistance = Math.max(
        Math.abs(left.sectorX - right.sectorX),
        Math.abs(left.sectorY - right.sectorY)
      )
      if (gridDistance > CLUSTER_DISTANCE || !isPathClear(left, right, occupied, factionKeys)) continue
      segments.push({
        id: `${left.id}:${right.id}`,
        start: starCenter(left),
        end: starCenter(right)
      })
    }
  }

  return segments.sort((left, right) => left.id.localeCompare(right.id))
}

// bounds: { width, height } of the galaxy in world pixels.
function createFactionFields(stars, bounds) {
  const occupied = occupiedSectors(stars)
  const fields = Object.entries(groupStarsByFaction(stars))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([faction, factionStars]) => ({
      faction,
      enclaveSupports: [],
      clusters: findConnectedClusters(factionStars, stars).map(clusterStars => ({
        stars: clusterStars.map(star => ({ id: star.id, center: starCenter(star) })),
        segments: createConnectionSegments(clusterStars, occupied)
      }))
    }))
  const fieldByFaction = new Map(fields.map(field => [field.faction, field]))

  fields.forEach(field => {
    field.clusters.filter(cluster => cluster.stars.length === 1).forEach(cluster => {
      const enclave = cluster.stars[0]
      const neighbours = stars
        .filter(star => star.faction !== field.faction)
        .map(star => ({
          star,
          distance: Math.hypot(
            starCenter(star).x - enclave.center.x,
            starCenter(star).y - enclave.center.y
          )
        }))
        .sort((left, right) => (
          left.distance - right.distance || left.star.id.localeCompare(right.star.id)
        ))
        .slice(0, 4)

      const parentCounts = new Map()
      neighbours.forEach(({ star }) => {
        parentCounts.set(star.faction, (parentCounts.get(star.faction) || 0) + 1)
      })
      // Factionless stars count as null: compare as text so a tie does not throw.
      const parentEntry = [...parentCounts.entries()]
        .sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0])))[0]
      if (!parentEntry || parentEntry[1] < 3) return

      const parentFaction = parentEntry[0]
      const parentNeighbours = neighbours.filter(({ star }) => star.faction === parentFaction)
      const angles = parentNeighbours
        .map(({ star }) => {
          const center = starCenter(star)
          const angle = Math.atan2(center.y - enclave.center.y, center.x - enclave.center.x)
          return angle < 0 ? angle + Math.PI * 2 : angle
        })
        .sort((left, right) => left - right)
      let maximumAngleGap = Math.PI * 2
      if (angles.length >= 3) {
        maximumAngleGap = 0
        angles.forEach((angle, index) => {
          const next = index === angles.length - 1 ? angles[0] + Math.PI * 2 : angles[index + 1]
          maximumAngleGap = Math.max(maximumAngleGap, next - angle)
        })
      }

      const edgeDistance = Math.min(
        enclave.center.x,
        bounds.width - enclave.center.x,
        enclave.center.y,
        bounds.height - enclave.center.y
      )
      const surrounded = maximumAngleGap <= Math.PI + 0.15
      if (edgeDistance < STAR_INFLUENCE_RADIUS && !surrounded) return

      fieldByFaction.get(parentFaction)?.enclaveSupports.push({
        id: enclave.id,
        center: enclave.center
      })
    })
  })

  fields.forEach(field => field.enclaveSupports.sort((left, right) => left.id.localeCompare(right.id)))
  return fields
}

function clusterDistanceAt(point, cluster) {
  let distance = Infinity
  cluster.stars.forEach(star => {
    const starDistance = Math.hypot(point.x - star.center.x, point.y - star.center.y) -
      STAR_INFLUENCE_RADIUS
    distance = smoothMinimum(distance, starDistance)
  })
  cluster.segments.forEach(segment => {
    const corridorDistance = distanceToSegment(point, segment.start, segment.end) -
      CORRIDOR_INFLUENCE_RADIUS
    distance = smoothMinimum(distance, corridorDistance)
  })
  return distance
}

function factionDistanceAt(point, field) {
  let distance = Infinity
  field.clusters.forEach(cluster => {
    distance = Math.min(distance, clusterDistanceAt(point, cluster))
  })
  field.enclaveSupports.forEach(support => {
    const radialDistance = Math.hypot(
      point.x - support.center.x,
      point.y - support.center.y
    )
    const ringDistance = Math.abs(radialDistance - ENCLAVE_RING_RADIUS) -
      ENCLAVE_RING_THICKNESS
    distance = smoothMinimum(distance, ringDistance)
  })
  return distance
}

// box: { left, top, right, bottom } in world pixels.
const pointInBox = (point, box) => point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom
const segmentInBox = (segment, box) => (
  Math.max(segment.start.x, segment.end.x) >= box.left && Math.min(segment.start.x, segment.end.x) <= box.right &&
  Math.max(segment.start.y, segment.end.y) >= box.top && Math.min(segment.start.y, segment.end.y) <= box.bottom
)

// Each list keeps its order: the smooth minimum is taken in that order.
function fieldWithin(field, box) {
  return {
    clusters: field.clusters
      .map(cluster => ({
        stars: cluster.stars.filter(star => pointInBox(star.center, box)),
        segments: cluster.segments.filter(segment => segmentInBox(segment, box))
      }))
      .filter(cluster => cluster.stars.length || cluster.segments.length),
    enclaveSupports: field.enclaveSupports.filter(support => pointInBox(support.center, box))
  }
}

function createVisibleFields(stars, bounds) {
  const factionFields = createFactionFields(stars, bounds)
  const step = territoryGridStep(bounds)
  const columns = Math.round(bounds.width / step)
  const rows = Math.round(bounds.height / step)
  const vertexColumns = columns + 1
  const vertexRows = rows + 1
  const valuesByFaction = new Map(
    factionFields.map(field => [field.faction, new Float64Array(vertexColumns * vertexRows)])
  )
  const blockVertices = Math.max(1, Math.round(FIELD_BLOCK / step))

  for (let blockY = 0; blockY < vertexRows; blockY += blockVertices) {
    for (let blockX = 0; blockX < vertexColumns; blockX += blockVertices) {
      const lastX = Math.min(vertexColumns, blockX + blockVertices) - 1
      const lastY = Math.min(vertexRows, blockY + blockVertices) - 1
      const reach = {
        left: blockX * step - FIELD_REACH,
        top: blockY * step - FIELD_REACH,
        right: lastX * step + FIELD_REACH,
        bottom: lastY * step + FIELD_REACH
      }
      const nearFields = factionFields.map(field => fieldWithin(field, reach))

      for (let gridY = blockY; gridY <= lastY; gridY++) {
        const y = gridY * step
        for (let gridX = blockX; gridX <= lastX; gridX++) {
          const x = gridX * step
          const point = { x, y }
          const distances = nearFields.map(field => factionDistanceAt(point, field))
          const onMapEdge = gridX === 0 || gridY === 0 || gridX === columns || gridY === rows
          const valueIndex = gridY * vertexColumns + gridX

          factionFields.forEach((field, factionIndex) => {
            const ownDistance = distances[factionIndex]
            let foreignDistance = Infinity
            distances.forEach((distance, otherIndex) => {
              if (otherIndex !== factionIndex) foreignDistance = Math.min(foreignDistance, distance)
            })

            // Equal influence leaves a real neutral ribbon instead of a shared stroke.
            const competitionDistance = Number.isFinite(foreignDistance)
              ? BORDER_GAP_HALF - (foreignDistance - ownDistance) / 2
              : -Infinity
            let visibleDistance = Math.max(ownDistance, competitionDistance)
            if (onMapEdge) visibleDistance = Math.max(visibleDistance, EDGE_EPSILON)
            valuesByFaction.get(field.faction)[valueIndex] = visibleDistance
          })
        }
      }
    }
  }

  return { factionFields, valuesByFaction, columns, rows, vertexColumns, step }
}

function interpolateContourPoint(start, end, startValue, endValue) {
  const denominator = startValue - endValue
  const amount = Math.abs(denominator) < 1e-12
    ? 0.5
    : Math.max(0, Math.min(1, startValue / denominator))
  return [
    start[0] + (end[0] - start[0]) * amount,
    start[1] + (end[1] - start[1]) * amount
  ]
}

function addContourSegment(segments, first, second) {
  if (Math.hypot(first[0] - second[0], first[1] - second[1]) < 1e-7) return
  segments.push({ first, second })
}

function marchingSquaresSegments(values, grid) {
  const { columns, rows, vertexColumns, step } = grid
  const segments = []

  for (let gridY = 0; gridY < rows; gridY++) {
    for (let gridX = 0; gridX < columns; gridX++) {
      const x = gridX * step
      const y = gridY * step
      const topLeftIndex = gridY * vertexColumns + gridX
      const topRightIndex = topLeftIndex + 1
      const bottomLeftIndex = topLeftIndex + vertexColumns
      const bottomRightIndex = bottomLeftIndex + 1
      const cornerValues = [
        values[topLeftIndex],
        values[topRightIndex],
        values[bottomRightIndex],
        values[bottomLeftIndex]
      ]
      const corners = [
        [x, y],
        [x + step, y],
        [x + step, y + step],
        [x, y + step]
      ]
      let mask = 0
      cornerValues.forEach((value, index) => {
        if (value <= 0) mask |= (1 << index)
      })
      if (mask === 0 || mask === 15) continue

      const crossings = new Map()
      const edgeCorners = [[0, 1], [1, 2], [2, 3], [3, 0]]
      edgeCorners.forEach(([from, to], edgeIndex) => {
        if ((cornerValues[from] <= 0) === (cornerValues[to] <= 0)) return
        crossings.set(edgeIndex, interpolateContourPoint(
          corners[from], corners[to], cornerValues[from], cornerValues[to]
        ))
      })

      const crossingEdges = [...crossings.keys()]
      if (crossingEdges.length === 2) {
        addContourSegment(
          segments,
          crossings.get(crossingEdges[0]),
          crossings.get(crossingEdges[1])
        )
        continue
      }

      if (crossingEdges.length === 4) {
        const centerInside = cornerValues.reduce((sum, value) => sum + value, 0) / 4 <= 0
        let pairs
        if (mask === 5) {
          pairs = centerInside ? [[0, 1], [2, 3]] : [[0, 3], [1, 2]]
        } else {
          pairs = centerInside ? [[0, 3], [1, 2]] : [[0, 1], [2, 3]]
        }
        pairs.forEach(([firstEdge, secondEdge]) => addContourSegment(
          segments,
          crossings.get(firstEdge),
          crossings.get(secondEdge)
        ))
      }
    }
  }

  return segments
}

function pointKey(point) {
  return `${Math.round(point[0] * 10000)},${Math.round(point[1] * 10000)}`
}

function removeDuplicateNeighbours(points) {
  return points.filter((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length]
    return Math.hypot(point[0] - previous[0], point[1] - previous[1]) > 1e-7
  })
}

function traceContourLoops(segments) {
  const adjacency = new Map()
  const used = new Set()
  const loops = []

  segments.forEach((segment, index) => {
    segment.firstKey = pointKey(segment.first)
    segment.secondKey = pointKey(segment.second)
    if (!adjacency.has(segment.firstKey)) adjacency.set(segment.firstKey, [])
    if (!adjacency.has(segment.secondKey)) adjacency.set(segment.secondKey, [])
    adjacency.get(segment.firstKey).push(index)
    adjacency.get(segment.secondKey).push(index)
  })

  segments.forEach((startingSegment, startingIndex) => {
    if (used.has(startingIndex)) return
    used.add(startingIndex)
    const startKey = startingSegment.firstKey
    let currentKey = startingSegment.secondKey
    const loop = [startingSegment.first, startingSegment.second]
    let closed = currentKey === startKey

    for (let guard = 0; !closed && guard <= segments.length; guard++) {
      const candidates = (adjacency.get(currentKey) || [])
        .filter(index => !used.has(index))
        .sort((left, right) => left - right)
      if (candidates.length === 0) break
      const nextIndex = candidates[0]
      const next = segments[nextIndex]
      used.add(nextIndex)
      if (next.firstKey === currentKey) {
        currentKey = next.secondKey
        if (currentKey !== startKey) loop.push(next.second)
      } else {
        currentKey = next.firstKey
        if (currentKey !== startKey) loop.push(next.first)
      }
      closed = currentKey === startKey
    }

    const cleaned = removeDuplicateNeighbours(loop)
    if (closed && cleaned.length >= 3) loops.push(cleaned)
  })

  return loops
}

export function calculatePolygonArea(points) {
  let area = 0
  for (let index = 0; index < points.length; index++) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    area += current[0] * next[1] - next[0] * current[1]
  }
  return area / 2
}

function orientation(a, b, c) {
  const value = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  if (Math.abs(value) < 1e-9) return 0
  return value > 0 ? 1 : -1
}

function onSegment(a, b, point) {
  return point[0] >= Math.min(a[0], b[0]) - 1e-9 &&
    point[0] <= Math.max(a[0], b[0]) + 1e-9 &&
    point[1] >= Math.min(a[1], b[1]) - 1e-9 &&
    point[1] <= Math.max(a[1], b[1]) + 1e-9
}

function segmentsIntersect(a, b, c, d) {
  const first = orientation(a, b, c)
  const second = orientation(a, b, d)
  const third = orientation(c, d, a)
  const fourth = orientation(c, d, b)
  if (first !== second && third !== fourth) return true
  if (first === 0 && onSegment(a, b, c)) return true
  if (second === 0 && onSegment(a, b, d)) return true
  if (third === 0 && onSegment(c, d, a)) return true
  if (fourth === 0 && onSegment(c, d, b)) return true
  return false
}

function edgesCross(points, firstIndex, secondIndex) {
  const firstNext = (firstIndex + 1) % points.length
  const secondNext = (secondIndex + 1) % points.length
  if (firstIndex === secondIndex || firstNext === secondIndex || secondNext === firstIndex) return false
  return segmentsIntersect(points[firstIndex], points[firstNext], points[secondIndex], points[secondNext])
}

// Long rings are checked by cells: a big faction's contour has thousands of points.
const BRUTE_RING_POINTS = 64

export function isSimpleRing(points) {
  if (points.length < 3) return false
  if (points.length > BRUTE_RING_POINTS) return isSimpleRingByCells(points)
  for (let firstIndex = 0; firstIndex < points.length; firstIndex++) {
    const firstNext = (firstIndex + 1) % points.length
    for (let secondIndex = firstIndex + 1; secondIndex < points.length; secondIndex++) {
      const secondNext = (secondIndex + 1) % points.length
      if (firstIndex === secondIndex || firstNext === secondIndex || secondNext === firstIndex) continue
      if (segmentsIntersect(points[firstIndex], points[firstNext], points[secondIndex], points[secondNext])) {
        return false
      }
    }
  }
  return true
}

function isSimpleRingByCells(points) {
  const count = points.length
  let perimeter = 0
  for (let index = 0; index < count; index++) {
    const next = points[(index + 1) % count]
    perimeter += Math.hypot(next[0] - points[index][0], next[1] - points[index][1])
  }
  const cellSize = Math.max(1e-3, (perimeter / count) * 4)
  // A hair wider: touching edges cross too.
  const PAD = 1e-6
  const cells = new Map()
  for (let index = 0; index < count; index++) {
    const start = points[index]
    const end = points[(index + 1) % count]
    const fromX = Math.floor((Math.min(start[0], end[0]) - PAD) / cellSize)
    const toX = Math.floor((Math.max(start[0], end[0]) + PAD) / cellSize)
    const fromY = Math.floor((Math.min(start[1], end[1]) - PAD) / cellSize)
    const toY = Math.floor((Math.max(start[1], end[1]) + PAD) / cellSize)
    for (let cellY = fromY; cellY <= toY; cellY++) {
      for (let cellX = fromX; cellX <= toX; cellX++) {
        const key = `${cellX},${cellY}`
        const edges = cells.get(key)
        if (edges) edges.push(index)
        else cells.set(key, [index])
      }
    }
  }
  for (const edges of cells.values()) {
    for (let first = 0; first < edges.length; first++) {
      for (let second = first + 1; second < edges.length; second++) {
        if (edgesCross(points, edges[first], edges[second])) return false
      }
    }
  }
  return true
}

export function pointInPolygon(point, polygon) {
  let inside = false
  for (let currentIndex = 0, previousIndex = polygon.length - 1;
    currentIndex < polygon.length;
    previousIndex = currentIndex++) {
    const current = polygon[currentIndex]
    const previous = polygon[previousIndex]
    const intersects = ((current[1] > point[1]) !== (previous[1] > point[1])) &&
      (point[0] < (previous[0] - current[0]) * (point[1] - current[1]) /
        (previous[1] - current[1]) + current[0])
    if (intersects) inside = !inside
  }
  return inside
}

function resampleClosedRing(points, spacing = RESAMPLE_SPACING) {
  const lengths = []
  let perimeter = 0
  for (let index = 0; index < points.length; index++) {
    const next = points[(index + 1) % points.length]
    const length = Math.hypot(next[0] - points[index][0], next[1] - points[index][1])
    lengths.push(length)
    perimeter += length
  }
  if (perimeter === 0) return points

  const sampleCount = Math.max(12, Math.ceil(perimeter / spacing))
  const result = []
  let segmentIndex = 0
  let segmentStartDistance = 0
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
    const targetDistance = perimeter * sampleIndex / sampleCount
    while (segmentIndex < lengths.length - 1 &&
      segmentStartDistance + lengths[segmentIndex] < targetDistance) {
      segmentStartDistance += lengths[segmentIndex]
      segmentIndex++
    }
    const start = points[segmentIndex]
    const end = points[(segmentIndex + 1) % points.length]
    const length = lengths[segmentIndex]
    const amount = length === 0 ? 0 : (targetDistance - segmentStartDistance) / length
    result.push([
      start[0] + (end[0] - start[0]) * amount,
      start[1] + (end[1] - start[1]) * amount
    ])
  }
  return result
}

function chaikinClosedRing(points) {
  const result = []
  for (let index = 0; index < points.length; index++) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    result.push([
      current[0] * 0.75 + next[0] * 0.25,
      current[1] * 0.75 + next[1] * 0.25
    ])
    result.push([
      current[0] * 0.25 + next[0] * 0.75,
      current[1] * 0.25 + next[1] * 0.75
    ])
  }
  return result
}

function canonicalizeRing(points) {
  let startIndex = 0
  for (let index = 1; index < points.length; index++) {
    if (points[index][0] < points[startIndex][0] ||
      (points[index][0] === points[startIndex][0] && points[index][1] < points[startIndex][1])) {
      startIndex = index
    }
  }
  return [...points.slice(startIndex), ...points.slice(0, startIndex)]
}

function smoothContourRing(points, bounds) {
  const resampled = resampleClosedRing(points)
  const smoothed = chaikinClosedRing(resampled).map(([x, y]) => [
    Math.max(0, Math.min(bounds.width, x)),
    Math.max(0, Math.min(bounds.height, y))
  ])
  const cleaned = removeDuplicateNeighbours(smoothed)
  if (cleaned.length >= 3 && isSimpleRing(cleaned)) return canonicalizeRing(cleaned)
  if (resampled.length >= 3 && isSimpleRing(resampled)) return canonicalizeRing(resampled)
  return canonicalizeRing(points)
}

function normalizeDirection(points, positiveArea) {
  const isPositive = calculatePolygonArea(points) > 0
  const normalized = isPositive === positiveArea ? points : [...points].reverse()
  return canonicalizeRing(normalized)
}

function classifyContourLoops(rawLoops, bounds) {
  const loops = rawLoops
    .map(loop => smoothContourRing(loop, bounds))
    .filter(loop => loop.length >= 3 && isSimpleRing(loop))
    .map(loop => ({ loop, area: Math.abs(calculatePolygonArea(loop)), containers: [] }))
    .filter(entry => entry.area >= MIN_RING_AREA)
    .sort((left, right) => right.area - left.area)

  loops.forEach((entry, entryIndex) => {
    loops.forEach((candidate, candidateIndex) => {
      if (candidateIndex === entryIndex || candidate.area <= entry.area) return
      if (pointInPolygon(entry.loop[0], candidate.loop)) entry.containers.push(candidateIndex)
    })
    entry.depth = entry.containers.length
  })

  const polygons = []
  loops.forEach((entry, index) => {
    if (entry.depth % 2 !== 0) return
    const holes = loops.filter((hole, holeIndex) => {
      if (hole.depth !== entry.depth + 1 || !hole.containers.includes(index)) return false
      const nearerOuter = loops.some((candidate, candidateIndex) => (
        candidateIndex !== index &&
        candidate.depth === entry.depth &&
        candidate.area < entry.area &&
        candidate.area > hole.area &&
        pointInPolygon(hole.loop[0], candidate.loop)
      ))
      return !nearerOuter
    })
    polygons.push({
      outer: normalizeDirection(entry.loop, true),
      holes: holes.map(hole => normalizeDirection(hole.loop, false))
    })
  })

  return polygons.sort((left, right) => (
    Math.abs(calculatePolygonArea(right.outer)) - Math.abs(calculatePolygonArea(left.outer))
  ))
}

// geometry: the galaxy size (config/mapGeometry.js), 16x9 sectors by default.
export function buildTerritories(stars, factionConfig, geometry = DEFAULT_GALAXY) {
  if (!stars.length) return []
  const bounds = { width: geometry.width, height: geometry.height }
  const fieldGrid = createVisibleFields(stars, bounds)
  const territories = []

  fieldGrid.factionFields.forEach(field => {
    const config = factionConfig[field.faction]
    if (!config) return
    const segments = marchingSquaresSegments(fieldGrid.valuesByFaction.get(field.faction), fieldGrid)
    const polygons = classifyContourLoops(traceContourLoops(segments), bounds)
    polygons.forEach(polygon => {
      territories.push({
        name: config.name,
        color: config.fillColor,
        fillOpacity: config.fillOpacity ?? 0.15,
        borderColor: config.borderColor,
        borderWidth: config.borderWidth ?? 2,
        outer: polygon.outer,
        holes: polygon.holes,
        faction: field.faction,
        geometry: 'smooth-field'
      })
    })
  })

  const factionCounts = new Map()
  territories.forEach(territory => {
    factionCounts.set(territory.faction, (factionCounts.get(territory.faction) || 0) + 1)
  })
  const factionIndexes = new Map()
  territories.forEach(territory => {
    const count = factionCounts.get(territory.faction)
    if (count <= 1) return
    const index = (factionIndexes.get(territory.faction) || 0) + 1
    factionIndexes.set(territory.faction, index)
    territory.name = `${territory.name} (${index})`
  })

  return territories
}
