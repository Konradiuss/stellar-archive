<template>
  <canvas ref="canvasRef" class="circuit-board" aria-hidden="true"></canvas>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { BOARD_PX, findBoardStrips } from '../utils/boardStrips'
import { renderCircuitBoard } from '../utils/circuitBoard'

// Seeded: the same board on every reload.
const BOARD_SEED = 'console-board'
const REDRAW_DELAY_MS = 120

const canvasRef = ref(null)
let observer = null
let redrawTimer = null
let lastGeometry = ''

function screensOf(container) {
  return [...container.querySelectorAll(':scope > .screen-bezel, :scope > .board-block')]
}

function redraw() {
  redrawTimer = null
  const canvas = canvasRef.value
  const container = canvas?.parentElement
  if (!container) return

  const containerRect = container.getBoundingClientRect()
  const strips = findBoardStrips(containerRect, screensOf(container).map(screen => screen.getBoundingClientRect()))
  const width = Math.ceil(containerRect.width / BOARD_PX)
  const height = Math.ceil(containerRect.height / BOARD_PX)
  const geometry = JSON.stringify([width, height, strips])
  if (geometry === lastGeometry) return
  lastGeometry = geometry

  const pixels = renderCircuitBoard({ seed: BOARD_SEED, width, height, strips })
  canvas.width = width
  canvas.height = height
  canvas.style.width = `${width * BOARD_PX}px`
  canvas.style.height = `${height * BOARD_PX}px`
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels.buffer), width, height), 0, 0)
}

function scheduleRedraw() {
  clearTimeout(redrawTimer)
  redrawTimer = setTimeout(redraw, REDRAW_DELAY_MS)
}

onMounted(() => {
  const container = canvasRef.value.parentElement
  redraw()
  observer = new ResizeObserver(scheduleRedraw)
  observer.observe(container)
  for (const screen of screensOf(container)) observer.observe(screen)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  clearTimeout(redrawTimer)
})
</script>

<style scoped>
.circuit-board {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 0;
  pointer-events: none;
  image-rendering: pixelated;
}
</style>
