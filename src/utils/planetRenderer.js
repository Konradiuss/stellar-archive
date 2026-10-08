// Inspired by Deep-Fold/PixelPlanets: https://github.com/Deep-Fold/PixelPlanets (MIT).

import { PLANET_PRESETS, findPlanetPreset } from './planetPresets'
import { clamp } from './math'
import { colorStyle, hexToRgb } from './color'
import { hashText, mulberry32 } from './random'

const DEFAULT_CONFIG = Object.freeze({
  size: 100,
  landColor: 0x44aa44,
  waterColor: 0x2244aa,
  waterAmount: 0.6,
  waterType: 'water',
  ring: null
})

// `size` is a percentage of the usual disc in the visualization window.
export const PLANET_SIZE = Object.freeze({ min: 25, max: 150 })

/** The disc's scale against the usual one (size 100). */
export function planetScale(config) {
  const size = Number(config?.size)
  return Number.isFinite(size) ? clamp(size, PLANET_SIZE.min, PLANET_SIZE.max) / DEFAULT_CONFIG.size : 1
}

// Rings, in planet radii: they start at RING_INNER and are this wide.
export const RING_INNER = 1.4
export const RING_WIDTHS = Object.freeze({ thin: 0.25, medium: 0.4, large: 0.6 })

/** In planet radii; 0 without a ring. */
export function ringOuterRadius(config) {
  if (!config?.ring) return 0
  return RING_INNER + (RING_WIDTHS[config.ring.size] ?? RING_WIDTHS.medium)
}

const LIQUID_TYPES = Object.freeze({
  water: { baseColor: 0x2244aa, darkColor: 0x112255 },
  lava: { baseColor: 0xff4400, darkColor: 0x882200 },
  acid: { baseColor: 0x88ff00, darkColor: 0x446600 },
  magma: { baseColor: 0xff6600, darkColor: 0x883300 },
  ice: { baseColor: 0xaaccff, darkColor: 0x5577aa },
  methane: { baseColor: 0xff9944, darkColor: 0x884422 },
  ammonia: { baseColor: 0xffdd88, darkColor: 0x886644 },
  oil: { baseColor: 0x333333, darkColor: 0x111111 }
})

const DITHER_MATRIX = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5]
]

const TAU = Math.PI * 2
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
const TERRAIN_SAMPLE_COUNT = 4096
const TERRAIN_CACHE_LIMIT = 128
const terrainDistributionCache = new Map()

const lightLength = Math.sqrt(0.5 * 0.5 + 0.5 * 0.5 + 0.7 * 0.7)
const lightX = -0.5 / lightLength
const lightY = -0.5 / lightLength
const lightZ = 0.7 / lightLength

function smooth(value) {
  return value * value * (3 - 2 * value)
}

function mix(from, to, amount) {
  return from + (to - from) * amount
}

function mixColor(from, to, amount) {
  return {
    r: Math.round(mix(from.r, to.r, amount)),
    g: Math.round(mix(from.g, to.g, amount)),
    b: Math.round(mix(from.b, to.b, amount))
  }
}

function scaleColor(color, amount) {
  return {
    r: Math.round(color.r * amount),
    g: Math.round(color.g * amount),
    b: Math.round(color.b * amount)
  }
}

function createPalette(baseColor, darkColor) {
  const midColor = {
    r: Math.floor((baseColor.r + darkColor.r) / 2),
    g: Math.floor((baseColor.g + darkColor.g) / 2),
    b: Math.floor((baseColor.b + darkColor.b) / 2)
  }
  const lightColor = {
    r: Math.min(255, baseColor.r + 40),
    g: Math.min(255, baseColor.g + 40),
    b: Math.min(255, baseColor.b + 40)
  }

  return {
    dark: colorStyle(darkColor),
    mid: colorStyle(midColor),
    base: colorStyle(baseColor),
    light: colorStyle(lightColor)
  }
}

function chooseColor(palette, lightIntensity, ditherThreshold) {
  // Keep the original PlanetVisualization shadow thresholds intact.
  if (lightIntensity > 0.75 + ditherThreshold * 0.1) return palette.light
  if (lightIntensity > 0.5 + ditherThreshold * 0.1) return palette.base
  if (lightIntensity > 0.25 + ditherThreshold * 0.1) {
    return ditherThreshold > 0.5 ? palette.base : palette.mid
  }
  return ditherThreshold > 0.5 ? palette.mid : palette.dark
}

export const hashPlanetSeed = (key = 'planet') => hashText(key)

function normalizeSeed(seed, fallbackKey) {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return Math.trunc(seed) >>> 0
  }
  if (seed !== undefined && seed !== null && seed !== '') {
    return hashPlanetSeed(seed)
  }
  return hashPlanetSeed(fallbackKey)
}

export function parsePlanetColor(value, fallback = 0xffffff) {
  let numeric = value
  if (typeof numeric === 'string') {
    const normalized = numeric.trim().replace(/^#/, '0x')
    numeric = Number.parseInt(normalized.replace(/^0x/i, ''), 16)
  }
  if (!Number.isFinite(numeric)) numeric = fallback
  return clamp(Math.trunc(numeric), 0, 0xffffff)
}

// A normalized config keeps the preset id in `preset`, so normalizing again finds the same preset.
function resolvePreset(input) {
  const named = findPlanetPreset(input?.seed)
  if (named) return named
  const id = input?.preset
  return typeof id === 'string' && Object.hasOwn(PLANET_PRESETS, id) ? { id, ...PLANET_PRESETS[id] } : null
}

// A ring of the map goes over the preset's (its size alone keeps the preset's colour); null or false: no ring.
function presetRing(input, ring) {
  if (!input || !Object.hasOwn(input, 'ring')) return ring ?? null
  const own = input.ring
  return own && typeof own === 'object' ? { ...(ring ?? {}), ...own } : null
}

export function normalizePlanetConfig(input = {}, seedKey = 'planet') {
  const preset = resolvePreset(input)
  const raw = preset
    ? {
        ...DEFAULT_CONFIG,
        ...(input || {}),
        ...preset.config,
        ring: presetRing(input, preset.config.ring)
      }
    : { ...DEFAULT_CONFIG, ...(input || {}) }
  const requestedAmount = Number(raw.waterAmount ?? DEFAULT_CONFIG.waterAmount)
  const waterAmount = Number.isFinite(requestedAmount)
    ? clamp(requestedAmount, 0, 1)
    : DEFAULT_CONFIG.waterAmount
  const waterType = Object.hasOwn(LIQUID_TYPES, raw.waterType) ? raw.waterType : 'water'
  const liquid = LIQUID_TYPES[waterType]
  const requestedSize = Number(raw.size)
  const ring = raw.ring
    ? {
        ...raw.ring,
        color: parsePlanetColor(raw.ring.color, 0xaaaaaa)
      }
    : null

  return {
    ...raw,
    size: Number.isFinite(requestedSize) ? clamp(requestedSize, PLANET_SIZE.min, PLANET_SIZE.max) : DEFAULT_CONFIG.size,
    landColor: parsePlanetColor(preset ? raw.landColor : input?.landColor, DEFAULT_CONFIG.landColor),
    waterColor: parsePlanetColor(preset ? raw.waterColor : input?.waterColor, liquid.baseColor),
    waterAmount,
    waterType,
    seed: preset ? preset.seed : normalizeSeed(raw.seed, seedKey),
    preset: preset?.id ?? null,
    ring
  }
}

export function createPlanetVisualizationConfig(planet) {
  if (!planet?.visualization) return null
  return normalizePlanetConfig(
    planet.visualization,
    planet.id ?? planet.name ?? 'planet'
  )
}

function latticeRandom(x, y, z, seed) {
  let hash = seed >>> 0
  hash ^= Math.imul(x | 0, 0x27d4eb2d)
  hash ^= Math.imul(y | 0, 0x165667b1)
  hash ^= Math.imul(z | 0, 0x1b873593)
  hash = Math.imul(hash ^ (hash >>> 15), 0x85ebca6b)
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35)
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295
}

export function valueNoise3D(x, y, z, seed = 0) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const z0 = Math.floor(z)
  const tx = smooth(x - x0)
  const ty = smooth(y - y0)
  const tz = smooth(z - z0)

  const n000 = latticeRandom(x0, y0, z0, seed)
  const n100 = latticeRandom(x0 + 1, y0, z0, seed)
  const n010 = latticeRandom(x0, y0 + 1, z0, seed)
  const n110 = latticeRandom(x0 + 1, y0 + 1, z0, seed)
  const n001 = latticeRandom(x0, y0, z0 + 1, seed)
  const n101 = latticeRandom(x0 + 1, y0, z0 + 1, seed)
  const n011 = latticeRandom(x0, y0 + 1, z0 + 1, seed)
  const n111 = latticeRandom(x0 + 1, y0 + 1, z0 + 1, seed)

  const nearTop = mix(mix(n000, n100, tx), mix(n010, n110, tx), ty)
  const farTop = mix(mix(n001, n101, tx), mix(n011, n111, tx), ty)
  return mix(nearTop, farTop, tz) * 2 - 1
}

export function fbm3D(x, y, z, octaves = 5, seed = 0) {
  let value = 0
  let amplitude = 0.5
  let frequency = 1
  let totalAmplitude = 0

  for (let octave = 0; octave < octaves; octave++) {
    value += valueNoise3D(x * frequency, y * frequency, z * frequency, seed + octave * 1013) * amplitude
    totalAmplitude += amplitude
    amplitude *= 0.5
    frequency *= 2
  }

  return totalAmplitude > 0 ? value / totalAmplitude : 0
}

export function samplePlanetElevation(x, y, z, seed = 0) {
  // One broad warp bends coastlines without breaking the large continental masses.
  const warp = fbm3D(
    x * 0.82 + 7.1,
    y * 0.82 - 11.7,
    z * 0.82 + 3.9,
    3,
    seed ^ 0x9e3779b9
  )
  const warpedX = (x + warp * 0.34) * 2.1
  const warpedY = (y - warp * 0.23) * 2.1
  const warpedZ = (z + warp * 0.29) * 2.1
  const continents = fbm3D(warpedX, warpedY, warpedZ, 5, seed)
  const detail = fbm3D(
    x * 3.6 - 5.3,
    y * 3.6 + 8.9,
    z * 3.6 - 2.7,
    3,
    seed ^ 0x85ebca6b
  )
  return continents * 0.88 + detail * 0.12
}

function fibonacciSpherePoint(index, count) {
  const y = 1 - 2 * ((index + 0.5) / count)
  const horizontalRadius = Math.sqrt(Math.max(0, 1 - y * y))
  const angle = index * GOLDEN_ANGLE
  return {
    x: Math.cos(angle) * horizontalRadius,
    y,
    z: Math.sin(angle) * horizontalRadius
  }
}

function getTerrainDistribution(seed) {
  const cached = terrainDistributionCache.get(seed)
  if (cached) return cached

  const values = new Float64Array(TERRAIN_SAMPLE_COUNT)
  for (let index = 0; index < TERRAIN_SAMPLE_COUNT; index++) {
    const point = fibonacciSpherePoint(index, TERRAIN_SAMPLE_COUNT)
    values[index] = samplePlanetElevation(point.x, point.y, point.z, seed)
  }
  values.sort()

  const distribution = {
    values,
    low: values[Math.floor(values.length * 0.05)],
    high: values[Math.floor(values.length * 0.95)]
  }
  if (terrainDistributionCache.size >= TERRAIN_CACHE_LIMIT) {
    terrainDistributionCache.delete(terrainDistributionCache.keys().next().value)
  }
  terrainDistributionCache.set(seed, distribution)
  return distribution
}

export function getPlanetTerrainProfile(config) {
  const normalized = normalizePlanetConfig(config)
  const distribution = getTerrainDistribution(normalized.seed)
  let seaLevel

  if (normalized.waterAmount <= 0) {
    seaLevel = Number.NEGATIVE_INFINITY
  } else if (normalized.waterAmount >= 1) {
    seaLevel = Number.POSITIVE_INFINITY
  } else {
    const rank = clamp(
      Math.ceil(normalized.waterAmount * distribution.values.length) - 1,
      0,
      distribution.values.length - 1
    )
    seaLevel = distribution.values[rank]
  }

  return {
    seaLevel,
    low: distribution.low,
    high: distribution.high
  }
}

function createSurfacePalettes(config) {
  const liquid = LIQUID_TYPES[config.waterType]
  const land = hexToRgb(config.landColor)
  const water = hexToRgb(config.waterColor)
  const darkLand = {
    r: Math.floor(land.r * 0.5),
    g: Math.floor(land.g * 0.5),
    b: Math.floor(land.b * 0.5)
  }
  const darkWater = hexToRgb(liquid.darkColor)
  const white = { r: 255, g: 255, b: 255 }

  return {
    waterDeep: createPalette(mixColor(water, darkWater, 0.42), scaleColor(darkWater, 0.82)),
    waterMid: createPalette(water, darkWater),
    waterShallow: createPalette(mixColor(water, white, 0.12), mixColor(darkWater, water, 0.18)),
    landLow: createPalette(mixColor(land, darkLand, 0.08), darkLand),
    landMid: createPalette(land, darkLand),
    landHigh: createPalette(mixColor(land, white, 0.18), mixColor(darkLand, land, 0.15))
  }
}

const presetRandom = mulberry32

function createCraters({ count, minRadius, maxRadius }, seed) {
  const random = presetRandom(seed ^ 0x5eed)
  return Array.from({ length: count }, () => {
    const y = random() * 2 - 1
    const angle = random() * TAU
    const horizontal = Math.sqrt(1 - y * y)
    // Many small craters, few large ones.
    const radius = mix(minRadius, maxRadius, random() ** 2)
    return {
      x: Math.cos(angle) * horizontal,
      y,
      z: Math.sin(angle) * horizontal,
      cosOuter: Math.cos(radius),
      cosInner: Math.cos(radius * 0.72)
    }
  })
}

// Map cells as palette keys; ocean next to land becomes 'coast'.
function prepareSurfaceMap(rows, legend) {
  const height = rows.length
  const width = rows[0].length
  const cells = new Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let key = legend[rows[y][x]] ?? 'ocean'
      if (key === 'ocean') {
        const neighbours = [
          rows[y][(x + 1) % width],
          rows[y][(x + width - 1) % width],
          rows[y - 1]?.[x],
          rows[y + 1]?.[x]
        ]
        if (neighbours.some(cell => cell && legend[cell] !== 'ocean' && legend[cell] !== 'ice')) key = 'coast'
      }
      cells[y * width + x] = key
    }
  }
  return { width, height, cells }
}

function preparePresetSurface(presetId, seed) {
  const surface = PLANET_PRESETS[presetId]?.surface
  if (!surface) return null
  return {
    type: surface.type,
    seed,
    map: surface.map ? prepareSurfaceMap(surface.map, surface.legend) : null,
    clouds: surface.clouds ?? null,
    bands: surface.bands ?? null,
    turbulence: surface.turbulence ?? 0,
    stretch: surface.stretch ?? 1,
    spot: surface.spot ?? null,
    polarCaps: surface.polarCaps ?? null,
    craters: surface.craters ? createCraters(surface.craters, seed) : null
  }
}

function presetPalettes(presetId) {
  const palettes = {}
  for (const [key, [base, dark]] of Object.entries(PLANET_PRESETS[presetId]?.surface.palettes ?? {})) {
    palettes[key] = createPalette(hexToRgb(base), hexToRgb(dark))
  }
  return palettes
}

// Wraps a longitude difference into [-π, π].
function wrapAngle(value) {
  return value - TAU * Math.round(value / TAU)
}

/** At a point of the unit sphere (y points down the screen); null means the regular terrain. */
function samplePresetSurface(surface, x, y, z) {
  const sinLatitude = -y

  if (surface.type === 'map') {
    const { width, height, cells } = surface.map
    if (surface.clouds) {
      const { scale, threshold } = surface.clouds
      if (fbm3D(x * scale, y * scale * 1.8, z * scale, 4, surface.seed ^ 0xc10d) > threshold) return 'cloud'
    }
    const longitude = Math.atan2(x, z)
    const latitude = Math.asin(clamp(sinLatitude, -1, 1))
    const column = clamp(Math.floor((longitude / TAU + 0.5) * width), 0, width - 1)
    const row = clamp(Math.floor((0.5 - latitude / Math.PI) * height), 0, height - 1)
    return cells[row * width + column]
  }

  const { spot } = surface
  if (spot) {
    const longitude = wrapAngle(Math.atan2(x, z) - spot.longitude)
    const latitude = sinLatitude - spot.latitude
    if ((longitude / spot.width) ** 2 + (latitude / spot.height) ** 2 <= 1) return spot.palette
  }

  if (surface.type === 'bands') {
    const swirl = fbm3D(x * 1.6, y * 1.6 * surface.stretch, z * 1.6, 3, surface.seed) * surface.turbulence
    const position = sinLatitude + swirl
    for (const [limit, key] of surface.bands) {
      if (position <= limit) return key
    }
    return surface.bands[surface.bands.length - 1][1]
  }

  if (surface.polarCaps) {
    const edge = fbm3D(x * 4, y * 4, z * 4, 2, surface.seed ^ 0x51ed) * 0.05
    if (sinLatitude > surface.polarCaps.north + edge || sinLatitude < -(surface.polarCaps.south + edge)) return 'ice'
  }
  if (surface.craters) {
    for (const crater of surface.craters) {
      const alignment = x * crater.x + y * crater.y + z * crater.z
      if (alignment > crater.cosOuter) return alignment > crater.cosInner ? 'craterFloor' : 'craterRim'
    }
  }
  return null
}

export function preparePlanetSurface(config = {}, seedKey = 'planet') {
  const normalizedConfig = normalizePlanetConfig(config, seedKey)
  const preset = normalizedConfig.preset
  return {
    config: normalizedConfig,
    terrain: getPlanetTerrainProfile(normalizedConfig),
    palettes: { ...createSurfacePalettes(normalizedConfig), ...presetPalettes(preset) },
    surface: preset ? preparePresetSurface(preset, normalizedConfig.seed) : null
  }
}

function normalizedRotation(rotation) {
  let wrapped = ((rotation % TAU) + TAU) % TAU
  if (Math.abs(wrapped) < 1e-12 || Math.abs(wrapped - TAU) < 1e-12) wrapped = 0
  return wrapped
}

function selectTerrainPalette(prepared, elevation, isWater) {
  const { terrain, palettes } = prepared
  if (isWater) {
    const denominator = Math.max(0.000001, terrain.seaLevel - terrain.low)
    const depth = Number.isFinite(terrain.seaLevel)
      ? clamp((terrain.seaLevel - elevation) / denominator, 0, 1)
      : clamp((terrain.high - elevation) / Math.max(0.000001, terrain.high - terrain.low), 0, 1)
    if (depth > 0.58) return { palette: palettes.waterDeep, band: 'water-deep' }
    if (depth > 0.18) return { palette: palettes.waterMid, band: 'water-mid' }
    return { palette: palettes.waterShallow, band: 'water-shallow' }
  }

  const denominator = Math.max(0.000001, terrain.high - terrain.seaLevel)
  const height = Number.isFinite(terrain.seaLevel)
    ? clamp((elevation - terrain.seaLevel) / denominator, 0, 1)
    : clamp((elevation - terrain.low) / Math.max(0.000001, terrain.high - terrain.low), 0, 1)
  if (height > 0.66) return { palette: palettes.landHigh, band: 'land-high' }
  if (height > 0.22) return { palette: palettes.landMid, band: 'land-mid' }
  return { palette: palettes.landLow, band: 'land-low' }
}

export function samplePlanetSurface(prepared, nx, ny, sphereDepth, rotation = 0, ditherThreshold = 0) {
  const angle = normalizedRotation(rotation)
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  const worldX = nx * cosine + sphereDepth * sine
  const worldZ = sphereDepth * cosine - nx * sine
  const lightDot = nx * lightX + ny * lightY + sphereDepth * lightZ
  const lightIntensity = Math.max(0, lightDot)

  const feature = prepared.surface ? samplePresetSurface(prepared.surface, worldX, ny, worldZ) : null
  if (feature && prepared.palettes[feature]) {
    return {
      band: feature,
      color: chooseColor(prepared.palettes[feature], lightIntensity, ditherThreshold),
      elevation: 0,
      isWater: feature === 'ocean' || feature === 'coast',
      lightIntensity
    }
  }

  const elevation = samplePlanetElevation(worldX, ny, worldZ, prepared.config.seed)
  const isWater = prepared.config.waterAmount >= 1 || (
    prepared.config.waterAmount > 0 && elevation <= prepared.terrain.seaLevel
  )
  const { palette, band } = selectTerrainPalette(prepared, elevation, isWater)

  return {
    band,
    color: chooseColor(palette, lightIntensity, ditherThreshold),
    elevation,
    isWater,
    lightIntensity
  }
}

export function getPlanetDitherValue(x, y) {
  const ix = Math.floor(Math.abs(x)) % 4
  const iy = Math.floor(Math.abs(y)) % 4
  return DITHER_MATRIX[iy][ix] / 16
}

export function createPlanetSurfaceMap(config, { width = 128, height = 64, rotation = 0 } = {}) {
  const prepared = preparePlanetSurface(config)
  const resolvedWidth = Math.max(1, Math.round(width))
  const resolvedHeight = Math.max(1, Math.round(height))
  const waterMask = new Uint8Array(resolvedWidth * resolvedHeight)
  const elevations = new Float64Array(resolvedWidth * resolvedHeight)
  const angleOffset = normalizedRotation(rotation)

  for (let y = 0; y < resolvedHeight; y++) {
    const latitude = Math.PI * (0.5 - (y + 0.5) / resolvedHeight)
    const cosLatitude = Math.cos(latitude)
    for (let x = 0; x < resolvedWidth; x++) {
      const longitude = TAU * ((x + 0.5) / resolvedWidth - 0.5) + angleOffset
      const px = Math.sin(longitude) * cosLatitude
      const py = Math.sin(latitude)
      const pz = Math.cos(longitude) * cosLatitude
      const elevation = samplePlanetElevation(px, py, pz, prepared.config.seed)
      const index = y * resolvedWidth + x
      elevations[index] = elevation
      waterMask[index] = prepared.config.waterAmount >= 1 || (
        prepared.config.waterAmount > 0 && elevation <= prepared.terrain.seaLevel
      ) ? 1 : 0
    }
  }

  return {
    width: resolvedWidth,
    height: resolvedHeight,
    waterMask,
    elevations,
    prepared
  }
}

export function measurePlanetWaterCoverage(config, sampleCount = TERRAIN_SAMPLE_COUNT) {
  const prepared = preparePlanetSurface(config)
  const count = Math.max(1, Math.round(sampleCount))
  let waterSamples = 0

  for (let index = 0; index < count; index++) {
    const point = fibonacciSpherePoint(index, count)
    const elevation = samplePlanetElevation(point.x, point.y, point.z, prepared.config.seed)
    if (prepared.config.waterAmount >= 1 || (
      prepared.config.waterAmount > 0 && elevation <= prepared.terrain.seaLevel
    )) {
      waterSamples++
    }
  }

  return waterSamples / count
}

export { DEFAULT_CONFIG, LIQUID_TYPES, TAU }
