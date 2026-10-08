<template>
  <div class="planet-visualization station-visualization">
    <canvas ref="canvasRef" class="planet-canvas"></canvas>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { getPlanetDitherValue } from '../utils/planetRenderer'
import { centeredCells } from '../utils/pixelGrid'
import { sampleStation } from '../utils/stationRenderer'

const props = defineProps({
  // createStationConfig(...)
  config: { type: Object, required: true },
  // Half the station's square, as a share of the box's smaller side
  fill: { type: Number, default: 0.5 },
  pixelSize: { type: Number, default: 4 },
  targetFps: { type: Number, default: 12 },
  paused: { type: Boolean, default: false }
})

const canvasRef = ref(null)
let context = null
let frame = null
let resizeObserver = null
let lastTime = null
let lastDraw = 0
// Offset so the stations of one map do not blink in step.
let seconds = (props.config.seed % 997) / 100

const styles = new Map()
function style(color) {
  let value = styles.get(color)
  if (!value) {
    value = `#${color.toString(16).padStart(6, '0')}`
    styles.set(color, value)
  }
  return value
}

function draw() {
  const canvas = canvasRef.value
  if (!context || !canvas || canvas.width <= 0 || canvas.height <= 0) return
  const { width, height } = canvas
  const size = props.pixelSize
  const half = Math.min(width, height) * props.fill
  const cell = size / half
  context.clearRect(0, 0, width, height)
  for (const { start: y, offset: dy } of centeredCells(height / 2, half, size, height)) {
    for (const { start: x, offset: dx } of centeredCells(width / 2, half, size, width)) {
      const color = sampleStation(props.config, dx / half, dy / half, seconds, {
        cell,
        dither: getPlanetDitherValue(x / size, y / size)
      })
      if (color === null) continue
      context.fillStyle = style(color)
      context.fillRect(x, y, size, size)
    }
  }
}

function animate(time) {
  frame = requestAnimationFrame(animate)
  const elapsed = lastTime === null ? 0 : Math.min(100, time - lastTime)
  lastTime = time
  if (props.paused) return
  seconds += elapsed / 1000
  if (time - lastDraw < 1000 / Math.max(1, props.targetFps)) return
  lastDraw = time
  draw()
}

function updateSize() {
  const canvas = canvasRef.value
  const box = canvas?.parentElement
  if (!canvas || !box) return
  const width = Math.min(box.clientWidth, box.clientHeight * 1.5)
  const height = box.clientHeight
  if (width <= 0 || height <= 0) return
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
  }
  draw()
}

watch(() => [props.config, props.fill, props.pixelSize], draw)

onMounted(() => {
  context = canvasRef.value.getContext('2d')
  updateSize()
  resizeObserver = new ResizeObserver(updateSize)
  resizeObserver.observe(canvasRef.value.parentElement)
  frame = requestAnimationFrame(animate)
})

onUnmounted(() => {
  if (frame !== null) cancelAnimationFrame(frame)
  resizeObserver?.disconnect()
})
</script>

<style scoped>
.station-visualization {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.planet-canvas {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}
</style>
