<template>
  <canvas ref="canvasRef" class="squares-canvas"></canvas>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'

const props = defineProps({
  direction: {
    type: String,
    default: 'diagonal',
    validator: (value) => ['up', 'down', 'left', 'right', 'diagonal'].includes(value)
  },
  speed: {
    type: Number,
    default: 0.5
  },
  borderColor: {
    type: String,
    default: '#444444'
  },
  squareSize: {
    type: Number,
    default: 40
  }
})

const canvasRef = ref(null)
let ctx = null
let animationFrameId = null
let resizeObserver = null
let gridLayer = null
let fadeLayer = null
let lastFrameTime = 0
const gridOffset = { x: 0, y: 0 }

onMounted(() => {
  const canvas = canvasRef.value
  if (!canvas) return

  ctx = canvas.getContext('2d')
  resizeCanvas()

  if (canvas.parentElement) {
    resizeObserver = new ResizeObserver(resizeCanvas)
    resizeObserver.observe(canvas.parentElement)
  }

  animationFrameId = requestAnimationFrame(updateAnimation)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  if (animationFrameId) cancelAnimationFrame(animationFrameId)
})

watch(
  () => [props.direction, props.speed, props.borderColor, props.squareSize],
  () => {
    rebuildLayers()
    drawGrid()
  }
)

function resizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas || !canvas.parentElement) return

  const width = canvas.parentElement.clientWidth
  const height = canvas.parentElement.clientHeight
  if (width <= 0 || height <= 0) return
  if (canvas.width === width && canvas.height === height) return

  canvas.width = width
  canvas.height = height
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`

  ctx?.setTransform(1, 0, 0, 1, 0, 0)
  rebuildLayers()
  drawGrid()
}

// The grid and vignette never change: render them once and only move the cached
// layer, instead of hundreds of strokeRect calls per frame.
function rebuildLayers() {
  const canvas = canvasRef.value
  if (!canvas || !ctx) return

  gridLayer = document.createElement('canvas')
  gridLayer.width = canvas.width + props.squareSize
  gridLayer.height = canvas.height + props.squareSize
  const gridCtx = gridLayer.getContext('2d')
  gridCtx.strokeStyle = props.borderColor

  for (let x = 0; x < gridLayer.width; x += props.squareSize) {
    for (let y = 0; y < gridLayer.height; y += props.squareSize) {
      gridCtx.strokeRect(x, y, props.squareSize, props.squareSize)
    }
  }

  fadeLayer = document.createElement('canvas')
  fadeLayer.width = canvas.width
  fadeLayer.height = canvas.height
  const fadeCtx = fadeLayer.getContext('2d')
  const gradient = fadeCtx.createRadialGradient(
    canvas.width / 2,
    canvas.height / 2,
    0,
    canvas.width / 2,
    canvas.height / 2,
    Math.sqrt(canvas.width ** 2 + canvas.height ** 2) / 2
  )
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)')
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.5)')
  fadeCtx.fillStyle = gradient
  fadeCtx.fillRect(0, 0, canvas.width, canvas.height)
}

function drawGrid() {
  const canvas = canvasRef.value
  if (!canvas || !ctx || !gridLayer || !fadeLayer) return

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(
    gridLayer,
    -(gridOffset.x % props.squareSize),
    -(gridOffset.y % props.squareSize)
  )
  ctx.drawImage(fadeLayer, 0, 0)
}

function updateAnimation(timestamp) {
  const elapsed = lastFrameTime ? Math.min(50, timestamp - lastFrameTime) : 1000 / 60
  lastFrameTime = timestamp
  const effectiveSpeed = Math.max(props.speed, 0.1) * elapsed / (1000 / 60)

  switch (props.direction) {
    case 'right':
      gridOffset.x = (gridOffset.x - effectiveSpeed + props.squareSize) % props.squareSize
      break
    case 'left':
      gridOffset.x = (gridOffset.x + effectiveSpeed + props.squareSize) % props.squareSize
      break
    case 'up':
      gridOffset.y = (gridOffset.y + effectiveSpeed + props.squareSize) % props.squareSize
      break
    case 'down':
      gridOffset.y = (gridOffset.y - effectiveSpeed + props.squareSize) % props.squareSize
      break
    case 'diagonal':
      gridOffset.x = (gridOffset.x - effectiveSpeed + props.squareSize) % props.squareSize
      gridOffset.y = (gridOffset.y - effectiveSpeed + props.squareSize) % props.squareSize
      break
  }

  drawGrid()
  animationFrameId = requestAnimationFrame(updateAnimation)
}
</script>

<style scoped>
.squares-canvas {
  border: none;
  display: block;
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 0;
  background: transparent;
  image-rendering: auto;
  image-rendering: -webkit-optimize-contrast;
}
</style>
