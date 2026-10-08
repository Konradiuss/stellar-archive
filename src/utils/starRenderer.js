// Canvas2D port of the star surface and blob layers from Deep-Fold/PixelPlanets.
// Original project: https://github.com/Deep-Fold/PixelPlanets (MIT).

import { clamp } from './math'
import { hashText } from './random'

const DEFAULT_CONFIG = Object.freeze({
  size: 60,
  color1: 0xffaa00,
  color2: 0xff6600,
  color3: 0xffdd00
})

const SYSTEM_PROFILE = Object.freeze({
  coreDisplaySize: 100,
  outerScale: 2,
  targetFps: 30,
  surfaceFps: 30,
  blobAlpha: 1,
  blobSamples: 10,
  blobFps: 12
})

// Diameter of a star core on the galaxy map at zoom 1, in CSS pixels.
export const GALAXY_STAR_CORE_SIZE = 30

const GALAXY_PROFILE = Object.freeze({
  coreDisplaySize: GALAXY_STAR_CORE_SIZE,
  outerScale: 2,
  targetFps: 12,
  surfaceFps: 8,
  blobAlpha: 0.45,
  corePixels: 20,
  blobSamples: 6,
  blobFps: 8
})

function fract(value) {
  return value - Math.floor(value)
}

function positiveMod(value, divisor) {
  return ((value % divisor) + divisor) % divisor
}

function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) return value < edge0 ? 0 : 1
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

function mixChannel(from, to, amount) {
  return Math.round(from + (to - from) * amount)
}

function mixColor(from, to, amount) {
  return {
    r: mixChannel(from.r, to.r, amount),
    g: mixChannel(from.g, to.g, amount),
    b: mixChannel(from.b, to.b, amount)
  }
}

function luminance(color) {
  return color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722
}

export function parseStarColor(value, fallback = 0xffffff) {
  let numeric = value
  if (typeof numeric === 'string') {
    const normalized = numeric.trim().replace(/^#/, '0x')
    numeric = Number.parseInt(normalized.replace(/^0x/i, ''), 16)
  }
  if (!Number.isFinite(numeric)) numeric = fallback
  numeric = clamp(Math.trunc(numeric), 0, 0xffffff)
  return {
    r: (numeric >> 16) & 255,
    g: (numeric >> 8) & 255,
    b: numeric & 255
  }
}

export function hashStarSeed(key = 'star') {
  return 1 + (hashText(key) % 9000) / 1000
}

const MIN_SPIN_SPEED = 0.6
const MAX_SPIN_SPEED = 1.5

export function seedVariation(seed, salt) {
  return fract(Math.sin(seed * 91.3458 + salt * 47.853) * 43758.5453)
}

function finiteNumberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function normalizeStarConfig(input = {}, seedKey = 'star') {
  const raw = { ...DEFAULT_CONFIG, ...(input || {}) }
  const sourceColors = [
    parseStarColor(raw.color1, DEFAULT_CONFIG.color1),
    parseStarColor(raw.color2, DEFAULT_CONFIG.color2),
    parseStarColor(raw.color3, DEFAULT_CONFIG.color3)
  ].sort((left, right) => luminance(right) - luminance(left))

  const [light, middle, dark] = sourceColors
  const highlight = mixColor(light, { r: 255, g: 255, b: 255 }, 0.62)
  const configuredSeed = Number(raw.seed)
  const seed = Number.isFinite(configuredSeed) ? clamp(configuredSeed, 1, 10) : hashStarSeed(seedKey)
  const configuredRotation = finiteNumberOrNull(raw.rotation)
  const configuredSpinSpeed = finiteNumberOrNull(raw.spinSpeed)

  return {
    size: clamp(Math.round(Number(raw.size) || DEFAULT_CONFIG.size), 32, 100),
    seed,
    // Radians; tilts the surface flow and the plasma rays.
    rotation: configuredRotation !== null
      ? configuredRotation * Math.PI / 180
      : seedVariation(seed, 1) * Math.PI * 2,
    // A negative value reverses the flow.
    spinSpeed: configuredSpinSpeed ??
      MIN_SPIN_SPEED + seedVariation(seed, 2) * (MAX_SPIN_SPEED - MIN_SPIN_SPEED),
    surfaceColors: [highlight, light, middle, dark],
    blobColor: highlight,
    color1: raw.color1,
    color2: raw.color2,
    color3: raw.color3
  }
}

export function createStarVisualizationConfig(star) {
  const source = star?.starVisualization || DEFAULT_CONFIG
  return normalizeStarConfig(source, star?.id || star?.name || 'star')
}

export function getStarRenderProfile({ scale = 1, lowPerformance = false, targetFps = 0 } = {}) {
  const base = lowPerformance ? GALAXY_PROFILE : SYSTEM_PROFILE
  const requestedFps = Number(targetFps)
  const resolvedTargetFps = requestedFps > 0
    ? Math.min(base.targetFps, requestedFps)
    : base.targetFps
  return {
    ...base,
    coreDisplaySize: Math.max(1, Math.round(SYSTEM_PROFILE.coreDisplaySize * scale)),
    targetFps: resolvedTargetFps,
    surfaceFps: Math.min(base.surfaceFps, resolvedTargetFps),
    blobFps: Math.min(base.blobFps, resolvedTargetFps)
  }
}

function shaderRand(x, y, seed, period) {
  const roundedPeriod = Math.max(1, Math.round(period))
  const px = positiveMod(x, roundedPeriod)
  const py = positiveMod(y, roundedPeriod)
  return fract(Math.sin(px * 12.9898 + py * 78.233) * 15.5453 * seed)
}

function hash2(x, y) {
  const value = 523 * Math.sin(x * 53.3158 + y * 43.6143)
  return {
    x: fract(15.32354 * value),
    y: fract(17.25865 * value)
  }
}

function cells(x, y, cellCount, tiles, seed) {
  const px = x * cellCount
  const py = y * cellCount
  const tilePeriod = cellCount / tiles
  // The seed shift is applied after the modulo, so the pattern still wraps seamlessly around the sphere.
  const seedOffsetX = seed * 17.13
  const seedOffsetY = seed * 31.71
  let minimum = Number.POSITIVE_INFINITY

  for (let offsetX = -1; offsetX <= 1; offsetX++) {
    for (let offsetY = -1; offsetY <= 1; offsetY++) {
      const cellX = Math.floor(px) + offsetX
      const cellY = Math.floor(py) + offsetY
      const hashed = hash2(
        positiveMod(cellX, tilePeriod) + seedOffsetX,
        positiveMod(cellY, tilePeriod) + seedOffsetY
      )
      const dx = px - cellX - hashed.x
      const dy = py - cellY - hashed.y
      minimum = Math.min(minimum, dx * dx + dy * dy)
    }
  }

  return Math.sqrt(minimum)
}

function rotateUv(x, y, angle) {
  const centeredX = x - 0.5
  const centeredY = y - 0.5
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  return {
    x: centeredX * cosine - centeredY * sine + 0.5,
    y: centeredX * sine + centeredY * cosine + 0.5
  }
}

function spherify(x, y) {
  const centeredX = x * 2 - 1
  const centeredY = y * 2 - 1
  const squaredDistance = centeredX * centeredX + centeredY * centeredY
  const z = Math.sqrt(Math.max(0, 1 - squaredDistance))
  return {
    x: centeredX / (z + 1) * 0.5 + 0.5,
    y: centeredY / (z + 1) * 0.5 + 0.5
  }
}

function isInsideStarCell(x, y, size) {
  const u = (x + 0.5) / size
  const v = (y + 0.5) / size
  return Math.hypot(u - 0.5, v - 0.5) <= 0.5
}

export function createStarCircleMask(size) {
  const resolvedSize = Math.max(1, Math.round(size))
  const mask = new Uint8Array(resolvedSize * resolvedSize)
  for (let y = 0; y < resolvedSize; y++) {
    for (let x = 0; x < resolvedSize; x++) {
      if (isInsideStarCell(x, y, resolvedSize)) {
        mask[y * resolvedSize + x] = 1
      }
    }
  }
  return mask
}

const BLOB_PERIOD = 4.93
const BLOB_FALLOFF = 0.42
const BLOB_MIN_FIELD = 0.045
// LRU cache: a map of a thousand stars would otherwise keep a thousand geometries.
const BLOB_GEOMETRY_KEPT = 64
const blobGeometryCache = new Map()
const blobOffsetCache = new Map()

// circle() from the StarBlobs shader with amount = 2, size = 1 baked in: the random radius
// clamps to 0.5, so that lookup is skipped. Identical to the generic formula.
function blobCirclePattern(x, y, seed) {
  if (positiveMod(y, 1) < 0.5) x += 0.25

  const threshold = 0.5 * shaderRand(
    Math.floor(x * 2) / 2 * 1.5,
    Math.floor(y * 2) / 2 * 1.5,
    seed,
    BLOB_PERIOD
  )
  const dx = positiveMod(x, 0.5) * 2 - 0.5
  const dy = positiveMod(y, 0.5) * 2 - 0.5
  const distance = Math.sqrt(dx * dx + dy * dy)
  // smoothstep(distance, distance + 0.5, threshold) is 0 below its lower edge.
  if (threshold <= distance) return 0
  return smoothstep(distance, distance + 0.5, threshold)
}

function getBlobOffsets(seed, count) {
  let offsets = blobOffsetCache.get(seed)
  if (!offsets || offsets.length < count) {
    offsets = new Float64Array(count)
    for (let sample = 0; sample < count; sample++) {
      offsets[sample] = shaderRand(sample, sample, seed, BLOB_PERIOD)
    }
    blobOffsetCache.set(seed, offsets)
  }
  return offsets
}

// Cached per resolution and rotation; pixels beyond the falloff radius can never pass the threshold.
function getBlobGeometry(resolution, rotation) {
  const key = `${resolution}:${rotation}`
  const cached = blobGeometryCache.get(key)
  if (cached) {
    blobGeometryCache.delete(key)
    blobGeometryCache.set(key, cached)
    return cached
  }

  const indexes = []
  const distances = []
  const radialBases = []
  const angularBases = []
  const pinches = []

  for (let y = 1; y < resolution - 1; y++) {
    for (let x = 1; x < resolution - 1; x++) {
      const u = (x + 0.5) / resolution
      const v = (y + 0.5) / resolution
      const distance = Math.hypot(u - 0.5, v - 0.5)
      if (distance < 0.0001 || distance >= BLOB_FALLOFF) continue

      const rotated = rotateUv(u, v, rotation)
      const angle = Math.atan2(rotated.x - 0.5, rotated.y - 0.5)
      indexes.push((y * resolution + x) * 4)
      distances.push(distance)
      radialBases.push(distance * BLOB_PERIOD)
      angularBases.push(angle * BLOB_PERIOD)
      pinches.push(0.1 / distance)
    }
  }

  const geometry = {
    indexes: Int32Array.from(indexes),
    distances: Float64Array.from(distances),
    radialBases: Float64Array.from(radialBases),
    angularBases: Float64Array.from(angularBases),
    pinches: Float64Array.from(pinches)
  }
  blobGeometryCache.set(key, geometry)
  if (blobGeometryCache.size > BLOB_GEOMETRY_KEPT) blobGeometryCache.delete(blobGeometryCache.keys().next().value)
  return geometry
}

function blendPixel(buffer, index, color, alpha) {
  const sourceAlpha = clamp(alpha, 0, 1)
  if (sourceAlpha <= 0) return

  const destinationAlpha = buffer[index + 3] / 255
  const outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha)
  if (outputAlpha <= 0) return

  buffer[index] = Math.round(
    (color.r * sourceAlpha + buffer[index] * destinationAlpha * (1 - sourceAlpha)) /
    outputAlpha
  )
  buffer[index + 1] = Math.round(
    (color.g * sourceAlpha + buffer[index + 1] * destinationAlpha * (1 - sourceAlpha)) /
    outputAlpha
  )
  buffer[index + 2] = Math.round(
    (color.b * sourceAlpha + buffer[index + 2] * destinationAlpha * (1 - sourceAlpha)) /
    outputAlpha
  )
  buffer[index + 3] = Math.round(outputAlpha * 255)
}

function renderBlobs(buffer, resolution, config, time, profile, counts) {
  const seed = config.seed
  const phase = time * 0.05
  const samples = profile.blobSamples
  const offsets = getBlobOffsets(seed, samples)
  const { indexes, distances, radialBases, angularBases, pinches } =
    getBlobGeometry(resolution, config.rotation)

  for (let pixel = 0; pixel < indexes.length; pixel++) {
    const distance = distances[pixel]
    const falloff = BLOB_FALLOFF - distance
    // Every circle contributes at most 1, so skip pixels that cannot pass.
    if (samples * falloff - distance < BLOB_MIN_FIELD) continue

    const radial = radialBases[pixel] - phase - pinches[pixel]
    const angular = angularBases[pixel] - phase - pinches[pixel]
    let field = 0
    let visible = false

    for (let sample = 0; sample < samples; sample++) {
      field += blobCirclePattern(radial + offsets[sample], angular + offsets[sample], seed)
      // Contributions are never negative: once the threshold is reached, the rest cannot change it.
      if (field * falloff - distance >= BLOB_MIN_FIELD) {
        visible = true
        break
      }
    }

    if (!visible) continue
    blendPixel(buffer, indexes[pixel], config.blobColor, profile.blobAlpha)
    counts.blobs++
  }
}

function renderSurface(buffer, resolution, corePixels, config, time, counts) {
  const offset = Math.floor((resolution - corePixels) / 2)
  const phase = time * 0.05 * (config.spinSpeed ?? 1)

  for (let localY = 0; localY < corePixels; localY++) {
    for (let localX = 0; localX < corePixels; localX++) {
      const u = (localX + 0.5) / corePixels
      const v = (localY + 0.5) / corePixels
      if (!isInsideStarCell(localX, localY, corePixels)) continue

      const rotated = rotateUv(u, v, config.rotation)
      const sphere = spherify(rotated.x, rotated.y)
      let value = cells(sphere.x - phase * 2, sphere.y, 10, 1, config.seed)
      value *= cells(sphere.x - phase, sphere.y, 20, 1, config.seed)
      value = clamp(value * 2, 0, 1)
      if ((localX + localY) % 2 === 0) value = clamp(value * 1.3, 0, 1)
      const colorIndex = clamp(Math.floor(value * 4), 0, 3)
      const color = config.surfaceColors[colorIndex]
      const x = offset + localX
      const y = offset + localY
      const index = (y * resolution + x) * 4
      blendPixel(buffer, index, color, 1)
      counts.surface++
    }
  }
}

export function renderStarFrame({
  config,
  time = 0,
  profile,
  output,
  layers = ['blobs', 'surface']
}) {
  const normalizedConfig = config?.surfaceColors
    ? config
    : normalizeStarConfig(config)
  const resolvedProfile = profile || getStarRenderProfile()
  const corePixels = resolvedProfile.corePixels || normalizedConfig.size
  const resolution = corePixels * resolvedProfile.outerScale
  const requiredLength = resolution * resolution * 4
  const buffer = output?.length === requiredLength
    ? output
    : new Uint8ClampedArray(requiredLength)
  buffer.fill(0)

  const counts = { blobs: 0, surface: 0 }
  if (layers.includes('blobs')) {
    renderBlobs(buffer, resolution, normalizedConfig, time, resolvedProfile, counts)
  }
  if (layers.includes('surface')) {
    renderSurface(buffer, resolution, corePixels, normalizedConfig, time, counts)
  }
  return {
    width: resolution,
    height: resolution,
    corePixels,
    data: buffer,
    layerPixelCounts: counts
  }
}

export { DEFAULT_CONFIG }
