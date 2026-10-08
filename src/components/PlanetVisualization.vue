<template>
  <div class="planet-visualization">
    <canvas
      ref="canvasRef"
      class="planet-canvas"
      :class="{ 'is-draggable': draggable }"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="endDrag"
      @pointercancel="endDrag"
      @lostpointercapture="endDrag"
    ></canvas>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import {
  RING_INNER,
  RING_WIDTHS,
  getPlanetDitherValue,
  preparePlanetSurface,
  ringOuterRadius,
  samplePlanetSurface
} from '../utils/planetRenderer'
import { centeredCells } from '../utils/pixelGrid'
import { colorStyle, hexToRgb } from '../utils/color'

const props = defineProps({
  planetConfig: {
    type: Object,
    default: () => ({
      size: 100,
      landColor: 0x44aa44,
      waterColor: 0x2244aa,
      waterAmount: 0.6,
      waterType: 'water',
      ring: null
    })
  },
  scale: {
    type: Number,
    default: 1
  },
  // Disc radius as a share of the canvas's smaller side; unlike `scale`, the pixels stay.
  discShare: {
    type: Number,
    default: 0.35
  },
  targetFps: {
    type: Number,
    default: 30
  },
  ringFps: {
    type: Number,
    default: 10
  },
  paused: {
    type: Boolean,
    default: false
  },
  draggable: {
    type: Boolean,
    default: false
  },
  // Draws a smaller planet so the ring stays whole; off where the caller sizes
  // the disc itself (SatelliteOrbits).
  fitRing: {
    type: Boolean,
    default: false
  }
})

const RING_EDGE_PX = 2

const emit = defineEmits(['drag-start', 'drag-end'])

// rad per 1/60 s frame
const AUTO_SPIN = 0.002
// Spin after a drag: capped, fades out with this time constant.
const MAX_SPIN = 0.006 // rad/ms
const SPIN_DECAY_MS = 350
const SPIN_EPSILON = 0.00005 // well below the auto-rotation (0.00012)
const VELOCITY_WINDOW_MS = 80

const canvasRef = ref(null)
let ctx = null
let animationId = null
let resizeObserver = null
let rotation = 0
let ringRotation = 0
let lastDrawTime = 0
let lastRingDrawTime = -Infinity
let ringLayers = { back: null, front: null }
let preparedSurface = null
let spin = 0 // rad/ms, inertia after a drag
let needsDraw = false
let drag = null // { pointerId, lastX, pixelScale, samples: [{ time, rotation }] }

onMounted(() => {
  rebuildSurface()
  initCanvas()
  animationId = requestAnimationFrame(animate)

  if (canvasRef.value?.parentElement) {
    resizeObserver = new ResizeObserver(updateCanvasSize)
    resizeObserver.observe(canvasRef.value.parentElement)
  }
})

onUnmounted(() => {
  if (animationId) cancelAnimationFrame(animationId)
  if (drag) emit('drag-end')
  resizeObserver?.disconnect()
})

watch(() => props.planetConfig, () => {
  spin = 0
  rebuildSurface()
  invalidateRingLayers()
  drawPlanet(performance.now(), true)
}, { deep: true })

watch(() => [props.scale, props.discShare, props.fitRing], () => {
  invalidateRingLayers()
  drawPlanet(performance.now(), true)
})

function initCanvas() {
  if (!canvasRef.value) return
  ctx = canvasRef.value.getContext('2d')
  updateCanvasSize()
}

function rebuildSurface() {
  preparedSurface = preparePlanetSurface(props.planetConfig)
}

function updateCanvasSize() {
  const canvas = canvasRef.value
  const container = canvas?.parentElement
  if (!canvas || !container) return

  const width = Math.min(container.clientWidth, container.clientHeight * 1.5)
  const height = container.clientHeight
  if (width <= 0 || height <= 0) return

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    invalidateRingLayers()
  }

  drawPlanet(performance.now(), true)
}

function animate(timestamp) {
  animationId = requestAnimationFrame(animate)
  // A drag and its inertia move the planet even when the auto-rotation is off.
  const isHandled = drag !== null || spin !== 0
  if (props.paused && !isHandled) {
    lastDrawTime = 0
    if (needsDraw) {
      needsDraw = false
      drawPlanet(timestamp)
    }
    return
  }

  const frameInterval = drag ? 0 : 1000 / Math.max(1, props.targetFps)
  const elapsedSinceDraw = timestamp - lastDrawTime

  if (!lastDrawTime || elapsedSinceDraw >= frameInterval) {
    const elapsed = lastDrawTime ? Math.min(100, elapsedSinceDraw) : 1000 / 60
    const frameScale = elapsed / (1000 / 60)
    if (!props.paused) {
      if (!drag) rotation += AUTO_SPIN * frameScale
      ringRotation += 0.003 * frameScale
    }
    if (!drag && spin) {
      rotation += spin * elapsed
      spin *= Math.exp(-elapsed / SPIN_DECAY_MS)
      if (Math.abs(spin) < SPIN_EPSILON) spin = 0
    }
    needsDraw = false
    lastDrawTime = timestamp
    drawPlanet(timestamp)
  }
}

function planetRadius(canvas) {
  const radius = Math.min(canvas.width, canvas.height) * props.discShare * props.scale
  const reach = ringOuterRadius(props.planetConfig)
  if (!props.fitRing || reach <= 1) return radius
  // The ring is tilted: only its width can leave the canvas.
  return Math.min(radius, Math.max(1, canvas.width / 2 - RING_EDGE_PX) / reach)
}

function handlePointerDown(event) {
  const canvas = canvasRef.value
  if (!props.draggable || !canvas || event.button !== 0) return
  const rect = canvas.getBoundingClientRect()
  if (rect.width <= 0) return
  event.preventDefault()
  canvas.setPointerCapture?.(event.pointerId)
  spin = 0
  drag = {
    pointerId: event.pointerId,
    lastX: event.clientX,
    // Screen px to canvas px: the window zoom scales the canvas with CSS.
    pixelScale: canvas.width / rect.width,
    samples: [{ time: event.timeStamp, rotation }]
  }
  emit('drag-start')
}

function handlePointerMove(event) {
  const canvas = canvasRef.value
  if (!drag || event.pointerId !== drag.pointerId || !canvas) return
  const dx = (event.clientX - drag.lastX) * drag.pixelScale
  drag.lastX = event.clientX
  if (!dx) return
  // The surface point under the pointer moves with it: a larger rotation
  // turns the surface to the left.
  rotation -= dx / Math.max(1, planetRadius(canvas))
  drag.samples.push({ time: event.timeStamp, rotation })
  const oldest = event.timeStamp - VELOCITY_WINDOW_MS
  while (drag.samples.length > 2 && drag.samples[0].time < oldest) drag.samples.shift()
  needsDraw = true
}

function endDrag(event) {
  if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.pointerId)) return
  const { samples, pointerId } = drag
  drag = null
  canvasRef.value?.releasePointerCapture?.(pointerId)

  // A pointer that stopped before the release leaves no spin.
  const last = samples[samples.length - 1]
  const recent = samples.filter(sample => last.time - sample.time <= VELOCITY_WINDOW_MS)
  const first = recent[0]
  const duration = last.time - first.time
  const isFresh = event ? event.timeStamp - last.time < VELOCITY_WINDOW_MS : false
  spin = duration > 0 && isFresh
    ? Math.max(-MAX_SPIN, Math.min(MAX_SPIN, (last.rotation - first.rotation) / duration))
    : 0
  needsDraw = true
  emit('drag-end')
}

function hash(x, y, seed = 0) {
  let h = seed + x * 374761393 + y * 668265263
  h = (h ^ (h >>> 13)) * 1274126177
  return (h ^ (h >>> 16)) >>> 0
}

function fbm(x, y, octaves = 4, seed = 0) {
  let value = 0
  let amplitude = 0.5
  let frequency = 1

  for (let i = 0; i < octaves; i++) {
    const nx = x * frequency
    const ny = y * frequency
    const h = hash(Math.floor(nx), Math.floor(ny), seed + i)
    value += ((h / 4294967295.0) * 2 - 1) * amplitude
    amplitude *= 0.5
    frequency *= 2
  }

  return value
}

function drawPlanet(timestamp = performance.now(), forceRings = false) {
  const canvas = canvasRef.value
  if (!ctx || !canvas || canvas.width <= 0 || canvas.height <= 0) return
  if (!preparedSurface) rebuildSurface()

  const width = canvas.width
  const height = canvas.height
  const radius = planetRadius(canvas)
  const centerX = width / 2
  const centerY = height / 2
  const pixelSize = Math.max(2, 4 * props.scale)

  ctx.clearRect(0, 0, width, height)

  if (props.planetConfig.ring) {
    updateRingLayers(centerX, centerY, radius, pixelSize, timestamp, forceRings)
    if (ringLayers.back) ctx.drawImage(ringLayers.back, 0, 0)
  }

  // A grid centred on the planet, so that its edge is equally round on every side.
  const columns = centeredCells(centerX, radius, pixelSize, width)
  const rows = centeredCells(centerY, radius, pixelSize, height)

  for (const { start: y, offset: dy } of rows) {
    for (const { start: x, offset: dx } of columns) {
      const distance = Math.sqrt(dx * dx + dy * dy)
      if (distance > radius) continue

      const nx = dx / radius
      const ny = dy / radius
      const sphereDepth = Math.sqrt(Math.max(0, 1 - ny * ny - nx * nx))
      const ditherThreshold = getPlanetDitherValue(x / pixelSize, y / pixelSize)
      const surface = samplePlanetSurface(
        preparedSurface,
        nx,
        ny,
        sphereDepth,
        rotation,
        ditherThreshold
      )

      ctx.fillStyle = surface.color
      ctx.fillRect(x, y, pixelSize, pixelSize)
    }
  }

  if (props.planetConfig.ring && ringLayers.front) {
    ctx.drawImage(ringLayers.front, 0, 0)
  }
}

function invalidateRingLayers() {
  ringLayers = { back: null, front: null }
  lastRingDrawTime = -Infinity
}

function updateRingLayers(centerX, centerY, radius, pixelSize, timestamp, force) {
  const canvas = canvasRef.value
  if (!canvas || !props.planetConfig.ring) return

  const dimensionsChanged =
    !ringLayers.back ||
    ringLayers.back.width !== canvas.width ||
    ringLayers.back.height !== canvas.height
  const ringInterval = 1000 / Math.max(1, props.ringFps)

  if (!force && !dimensionsChanged && timestamp - lastRingDrawTime < ringInterval) return

  if (dimensionsChanged) {
    const createLayer = () => {
      const layer = document.createElement('canvas')
      layer.width = canvas.width
      layer.height = canvas.height
      return layer
    }
    ringLayers = { back: createLayer(), front: createLayer() }
  }

  const backCtx = ringLayers.back.getContext('2d')
  const frontCtx = ringLayers.front.getContext('2d')
  backCtx.clearRect(0, 0, canvas.width, canvas.height)
  frontCtx.clearRect(0, 0, canvas.width, canvas.height)
  drawRings(backCtx, centerX, centerY, radius, pixelSize, 'back')
  drawRings(frontCtx, centerX, centerY, radius, pixelSize, 'front')
  lastRingDrawTime = timestamp
}

function drawRings(targetCtx, centerX, centerY, planetRadius, pixelSize, part) {
  const ring = props.planetConfig.ring
  const canvas = canvasRef.value
  if (!ring || !canvas) return

  // The same numbers keep the satellites' orbits outside the ring.
  const ringWidth = planetRadius * (RING_WIDTHS[ring.size] ?? RING_WIDTHS.medium)
  const innerRadius = planetRadius * RING_INNER
  const outerRadius = innerRadius + ringWidth
  const perspective = 0.3
  const ringColor = hexToRgb(ring.color ?? 0xaaaaaa)
  const ringStyles = {
    bright: colorStyle(ringColor),
    mid: colorStyle({
      r: Math.floor(ringColor.r * 0.7),
      g: Math.floor(ringColor.g * 0.7),
      b: Math.floor(ringColor.b * 0.7)
    }),
    dark: colorStyle({
      r: Math.floor(ringColor.r * 0.4),
      g: Math.floor(ringColor.g * 0.4),
      b: Math.floor(ringColor.b * 0.4)
    })
  }

  // The planet's grid: the ring lines up with the planet pixel for pixel.
  const columns = centeredCells(centerX, outerRadius, pixelSize, canvas.width)
  const rows = centeredCells(centerY, outerRadius * perspective, pixelSize, canvas.height)

  for (const { start: y, offset: dy } of rows) {
    for (const { start: x, offset: dx } of columns) {
      const ellipseY = dy / perspective
      const distanceFromCenter = Math.sqrt(dx * dx + ellipseY * ellipseY)
      if (distanceFromCenter < innerRadius || distanceFromCenter > outerRadius) continue

      const isInFront = ellipseY > 0
      if (part === 'front' && !isInFront) continue
      if (part === 'back' && ellipseY >= 0) continue
      if (part === 'back' && Math.sqrt(dx * dx + dy * dy) < planetRadius) continue

      const angle = Math.atan2(ellipseY, dx) + ringRotation
      const ringNoise = fbm(distanceFromCenter * 0.05, angle * 5, 3, 54321)
      const ringPosition = (distanceFromCenter - innerRadius) / ringWidth
      const bands = Math.sin(ringPosition * 12 + ringNoise * 2) * 0.5 + 0.5
      const largeParticles = fbm(distanceFromCenter * 0.1 + angle * 3, ringPosition * 8 + angle * 5, 4, 99999)
      const mediumParticles = fbm(distanceFromCenter * 0.2 + angle * 8, ringPosition * 15 + angle * 10, 4, 77777)
      const smallParticles = fbm(distanceFromCenter * 0.4 + angle * 15, ringPosition * 25 + angle * 20, 3, 55555)
      const brightness = bands * 0.3 + ringNoise * 0.2 + largeParticles * 0.25 + mediumParticles * 0.15 + smallParticles * 0.1
      const edgeFade = Math.min(ringPosition * 3, (1 - ringPosition) * 3)
      const finalBrightness = brightness * Math.min(1, edgeFade)
      const ditherValue = getPlanetDitherValue(x / pixelSize, y / pixelSize)

      if (finalBrightness > 0.65 + ditherValue * 0.15) {
        targetCtx.fillStyle = ringStyles.bright
      } else if (finalBrightness > 0.35 + ditherValue * 0.15) {
        targetCtx.fillStyle = ringStyles.mid
      } else {
        targetCtx.fillStyle = ringStyles.dark
      }
      targetCtx.fillRect(x, y, pixelSize, pixelSize)
    }
  }
}
</script>

<style scoped>
.planet-visualization {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.planet-canvas {
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
  image-rendering: crisp-edges;
}

/* The page handles no touch gestures on a planet that is spun by hand. */
.planet-canvas.is-draggable {
  touch-action: none;
  user-select: none;
}
</style>
