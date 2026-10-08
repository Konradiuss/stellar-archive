<template>
  <canvas ref="canvasRef" class="hack-code-rain" aria-hidden="true"></canvas>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { prefersReducedMotion } from '../utils/reducedMotion'

const props = defineProps({
  // 0..1
  density: { type: Number, default: 0.85 },
  ink: { type: String, default: '#000000' },
  // null keeps the canvas clear.
  background: { type: String, default: null },
  tear: { type: Boolean, default: true }
})

const SYMBOLS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&@*+=<>/\\'
const CELL_W = 9
const CELL_H = 11
const FRAME_MS = 33

const canvasRef = ref(null)
let frame = null
let lastAt = 0
let stalledUntil = 0
let rows = []
let cols = 0

const symbol = () => (Math.random() < props.density ? SYMBOLS[(Math.random() * SYMBOLS.length) | 0] : ' ')
const randomRow = () => Array.from({ length: cols }, symbol).join('')

function resize(canvas) {
  const width = Math.max(1, canvas.clientWidth)
  const height = Math.max(1, canvas.clientHeight)
  if (canvas.width === width && canvas.height === height && rows.length) return
  canvas.width = width
  canvas.height = height
  cols = Math.ceil(width / CELL_W)
  rows = Array.from({ length: Math.ceil(height / CELL_H) + 1 }, randomRow)
}

function draw(canvas) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  if (props.background) {
    ctx.fillStyle = props.background
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }
  ctx.font = '8px "Press Start 2P", monospace'
  ctx.textBaseline = 'top'
  ctx.fillStyle = props.ink
  rows.forEach((row, y) => ctx.fillText(row, 1, y * CELL_H + 2))
  if (props.tear && Math.random() < 0.3) {
    const bandY = (Math.random() * canvas.height) | 0
    const bandH = 4 + ((Math.random() * 24) | 0)
    const shift = ((Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 24)) | 0
    ctx.drawImage(canvas, 0, bandY, canvas.width, bandH, shift, bandY, canvas.width, bandH)
  }
}

function tick(timestamp) {
  frame = requestAnimationFrame(tick)
  if (timestamp - lastAt < FRAME_MS || timestamp < stalledUntil) return
  lastAt = timestamp
  const canvas = canvasRef.value
  if (!canvas) return
  resize(canvas)
  const lines = 1 + ((Math.random() * 2) | 0)
  for (let line = 0; line < lines; line++) {
    rows.shift()
    rows.push(randomRow())
  }
  rows = rows.map(row => [...row].map(char => (Math.random() < 0.08 ? symbol() : char)).join(''))
  draw(canvas)
  if (Math.random() < 0.05) stalledUntil = timestamp + 120 + Math.random() * 380
}

onMounted(() => {
  const canvas = canvasRef.value
  if (!canvas) return
  resize(canvas)
  draw(canvas)
  if (!prefersReducedMotion()) frame = requestAnimationFrame(tick)
})

onUnmounted(() => {
  if (frame !== null) cancelAnimationFrame(frame)
})
</script>

<style scoped>
.hack-code-rain {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
  pointer-events: none;
}
</style>
