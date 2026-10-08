<template>
  <canvas ref="canvasRef" class="crt-snow" aria-hidden="true"></canvas>
</template>

<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'

const PIXEL_SIZE = 4
const FRAME_MS = 33

const props = defineProps({
  active: { type: Boolean, default: true }
})

const canvasRef = ref(null)
let frame = null
let lastAt = 0
let image = null

function draw(timestamp) {
  frame = requestAnimationFrame(draw)
  if (timestamp - lastAt < FRAME_MS) return
  lastAt = timestamp

  const canvas = canvasRef.value
  const ctx = canvas?.getContext('2d')
  if (!ctx) return
  // Follow the screen's aspect ratio so the snow pixels stay square.
  const width = Math.max(1, Math.ceil(canvas.clientWidth / PIXEL_SIZE))
  const height = Math.max(1, Math.ceil(canvas.clientHeight / PIXEL_SIZE))
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
    image = null
  }
  image ||= ctx.createImageData(width, height)
  const pixels = new Uint32Array(image.data.buffer)
  for (let index = 0; index < pixels.length; index++) {
    const value = (Math.random() * 256) | 0
    // ABGR (little-endian): opaque grey
    pixels[index] = 0xff000000 | (value << 16) | (value << 8) | value
  }
  ctx.putImageData(image, 0, 0)
}

function update() {
  if (props.active && canvasRef.value && frame === null) {
    lastAt = 0
    frame = requestAnimationFrame(draw)
  } else if (!props.active && frame !== null) {
    cancelAnimationFrame(frame)
    frame = null
  }
}

watch(() => props.active, update)
onMounted(update)
onUnmounted(() => {
  if (frame !== null) cancelAnimationFrame(frame)
})
</script>

<style scoped>
.crt-snow {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  image-rendering: pixelated;
  mix-blend-mode: screen;
}
</style>
