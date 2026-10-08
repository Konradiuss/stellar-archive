import { getPlanetDitherValue } from './planetRenderer'

// Grid alpha by distance from the map edge in sectors (1 = the first ring).
export const UNCHARTED_GRID_ALPHAS = [0.3, 0.22, 0.16, 0.11, 0.08, 0.06, 0.04, 0.03]
// Fog levels drawn over black: darkest to brightest.
export const UNCHARTED_FOG_COLORS = ['#0b121c', '#132034', '#1d314e']

export function seedFromText(text) {
  let hash = 2166136261
  for (const char of String(text)) {
    hash ^= char.codePointAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function hash2(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

function smooth(t) {
  return t * t * (3 - 2 * t)
}

function valueNoise(x, y, seed) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const tx = smooth(x - x0)
  const ty = smooth(y - y0)
  const top = hash2(x0, y0, seed) * (1 - tx) + hash2(x0 + 1, y0, seed) * tx
  const bottom = hash2(x0, y0 + 1, seed) * (1 - tx) + hash2(x0 + 1, y0 + 1, seed) * tx
  return top * (1 - ty) + bottom * ty
}

function fbm(x, y, seed, octaves = 4) {
  let value = 0
  let amplitude = 0.5
  let frequency = 1
  let total = 0
  for (let octave = 0; octave < octaves; octave++) {
    value += valueNoise(x * frequency, y * frequency, seed + octave * 131) * amplitude
    total += amplitude
    amplitude *= 0.5
    frequency *= 2
  }
  return value / total
}

export function distanceToMap(x, y, geometry) {
  const dx = Math.max(0 - x, 0, x - geometry.width)
  const dy = Math.max(0 - y, 0, y - geometry.height)
  return Math.hypot(dx, dy)
}

export function unchartedRings(geometry, screenWidth, screenHeight, minScale) {
  const spareX = (screenWidth / minScale - geometry.width) / 2
  const spareY = (screenHeight / minScale - geometry.height) / 2
  const rings = Math.ceil(Math.max(spareX, spareY, 0) / geometry.sectorSize) + 1
  return Math.min(40, Math.max(UNCHARTED_GRID_ALPHAS.length, rings))
}

/** Half-sector pieces: [{ x1, y1, x2, y2, alpha }]. */
export function unchartedGridSegments(geometry, { rings = UNCHARTED_GRID_ALPHAS.length, seed = 0 } = {}) {
  const { columns, rows, sectorSize } = geometry
  const piece = sectorSize / 2
  const segments = []
  const reach = Math.min(rings, UNCHARTED_GRID_ALPHAS.length)
  const minX = -reach * sectorSize
  const minY = -reach * sectorSize
  const maxX = geometry.width + reach * sectorSize
  const maxY = geometry.height + reach * sectorSize

  function addPiece(x1, y1, x2, y2, key) {
    const midX = (x1 + x2) / 2
    const midY = (y1 + y2) / 2
    // Pieces on the map edge or inside belong to the charted grid.
    if (midX >= 0 && midX <= geometry.width && midY >= 0 && midY <= geometry.height) return
    const ring = Math.ceil(distanceToMap(midX, midY, geometry) / sectorSize)
    if (ring < 1 || ring > reach) return
    const dropout = 0.08 + ring * 0.09
    if (hash2(key[0], key[1], seed + key[2]) < dropout) return
    segments.push({ x1, y1, x2, y2, alpha: UNCHARTED_GRID_ALPHAS[ring - 1] })
  }

  for (let column = -reach; column <= columns + reach; column++) {
    const x = column * sectorSize
    for (let y = minY, index = 0; y < maxY; y += piece, index++) addPiece(x, y, x, y + piece, [column, index, 1])
  }
  for (let row = -reach; row <= rows + reach; row++) {
    const y = row * sectorSize
    for (let x = minX, index = 0; x < maxX; x += piece, index++) addPiece(x, y, x + piece, y, [index, row, 2])
  }
  return segments
}

/** [{ x, y }]: top-left corners of the first-ring sectors that get a "??,??" number. */
export function unchartedSectorLabels(geometry, { seed = 0 } = {}) {
  const { columns, rows, sectorSize } = geometry
  const labels = []
  for (let row = -1; row <= rows; row++) {
    for (let column = -1; column <= columns; column++) {
      const onRing = row === -1 || row === rows || column === -1 || column === columns
      if (!onRing || hash2(column, row, seed + 7) < 0.45) continue
      labels.push({ x: column * sectorSize, y: row * sectorSize })
    }
  }
  return labels
}

/**
 * `levels[i]` is 0 (empty) or 1..UNCHARTED_FOG_COLORS.length. Covers the map and `rings` sectors
 * around it; texel is its size in world pixels.
 */
export function unchartedFog(geometry, { rings = UNCHARTED_GRID_ALPHAS.length, texel = 10, seed = 0 } = {}) {
  const margin = rings * geometry.sectorSize
  const originX = -margin
  const originY = -margin
  const width = Math.ceil((geometry.width + margin * 2) / texel)
  const height = Math.ceil((geometry.height + margin * 2) / texel)
  const levels = new Uint8Array(width * height)
  const levelCount = UNCHARTED_FOG_COLORS.length
  // Clusters grow in from the edge over a sector and a half.
  const ramp = geometry.sectorSize * 1.5

  for (let ty = 0; ty < height; ty++) {
    for (let tx = 0; tx < width; tx++) {
      const x = originX + (tx + 0.5) * texel
      const y = originY + (ty + 0.5) * texel
      const distance = distanceToMap(x, y, geometry)
      if (distance <= 0) continue
      const edge = Math.min(1, distance / ramp)
      const clouds = fbm(x / 420, y / 420, seed)
      const knots = fbm(x / 90, y / 90, seed + 977)
      const density = Math.max(0, clouds - 0.46) * 2.4 + Math.max(0, knots - 0.62) * 1.6 * (clouds > 0.4 ? 1 : 0)
      const value = Math.min(1, density) * edge
      const level = Math.floor(value * levelCount + getPlanetDitherValue(tx, ty) - 0.5)
      levels[ty * width + tx] = Math.max(0, Math.min(levelCount, level))
    }
  }
  return { originX, originY, width, height, texel, levels }
}
