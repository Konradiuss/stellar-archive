<template>
  <div ref="rootRef" class="star-visualization">
    <canvas ref="blobsCanvasRef" class="star-canvas star-blobs"></canvas>
    <canvas ref="surfaceCanvasRef" class="star-canvas star-surface"></canvas>
  </div>
</template>

<script setup>
import { ref, onActivated, onDeactivated, onMounted, onUnmounted, watch } from 'vue'
import {
  getStarRenderProfile,
  normalizeStarConfig,
  renderStarFrame
} from '../utils/starRenderer'
import { subscribeStarAnimation } from '../utils/starAnimationScheduler'

const props = defineProps({
  starConfig: {
    type: Object,
    default: () => ({
      size: 60,
      color1: 0xffaa00,
      color2: 0xff6600,
      color3: 0xffdd00
    })
  },
  scale: { type: Number, default: 1 },
  targetFps: { type: Number, default: 0 },
  lowPerformance: { type: Boolean, default: false }
})

const rootRef = ref(null)
const blobsCanvasRef = ref(null)
const surfaceCanvasRef = ref(null)
let normalizedConfig = null
let profile = null
let unsubscribeAnimation = null
let onScreen = true
let visibility = null

const layerStates = {
  blobs: createLayerState(blobsCanvasRef),
  surface: createLayerState(surfaceCanvasRef)
}

function createLayerState(canvasRef) {
  return {
    canvasRef,
    ctx: null,
    imageData: null,
    nextFrameAt: 0
  }
}

onMounted(() => {
  rebuildRenderer()
  startAnimation()
  if (typeof IntersectionObserver === 'function' && rootRef.value) {
    visibility = new IntersectionObserver(([entry]) => { onScreen = entry?.isIntersecting ?? true })
    visibility.observe(rootRef.value)
  }
})

onUnmounted(() => {
  stopAnimation()
  visibility?.disconnect()
})

// Kept alive while a system is open: must not keep rendering in the background.
onActivated(startAnimation)
onDeactivated(stopAnimation)

function startAnimation() {
  unsubscribeAnimation ||= subscribeStarAnimation(updateAnimation)
}

function stopAnimation() {
  unsubscribeAnimation?.()
  unsubscribeAnimation = null
}

watch(() => props.starConfig, rebuildRenderer, { deep: true })
watch(() => [props.scale, props.targetFps, props.lowPerformance], rebuildRenderer)

function rebuildRenderer() {
  if (!surfaceCanvasRef.value) return

  normalizedConfig = props.starConfig?.surfaceColors
    ? props.starConfig
    : normalizeStarConfig(props.starConfig)
  profile = getStarRenderProfile({
    scale: props.scale,
    lowPerformance: props.lowPerformance,
    targetFps: props.targetFps
  })

  const corePixels = profile.corePixels || normalizedConfig.size
  const resolution = corePixels * profile.outerScale
  const displaySize = profile.coreDisplaySize * profile.outerScale

  Object.values(layerStates).forEach(state => {
    const canvas = state.canvasRef.value
    if (!canvas) return
    state.ctx ||= canvas.getContext('2d', { alpha: true })
    if (canvas.width !== resolution || canvas.height !== resolution) {
      canvas.width = resolution
      canvas.height = resolution
      state.imageData = state.ctx.createImageData(resolution, resolution)
    }
    canvas.style.width = `${displaySize}px`
    canvas.style.height = `${displaySize}px`
    state.nextFrameAt = 0
  })

  const initialTime = performance.now() / 1000
  drawLayer('blobs', initialTime)
  drawLayer('surface', initialTime)
}

function layerFps(layer) {
  if (layer === 'blobs') return profile.blobFps
  return profile.surfaceFps
}

function layerPhase(layer) {
  const multiplier = layer === 'surface' ? 1.37 : 2.71
  return (normalizedConfig.seed * multiplier) % 1
}

function updateAnimation(timestamp) {
  if (!normalizedConfig || !profile || !onScreen) return

  Object.entries(layerStates).forEach(([layer, state]) => {
    const interval = 1000 / layerFps(layer)
    if (state.nextFrameAt === 0) {
      state.nextFrameAt = timestamp + interval * layerPhase(layer)
      return
    }
    if (timestamp < state.nextFrameAt) return

    drawLayer(layer, timestamp / 1000)
    state.nextFrameAt = timestamp + interval
  })
}

function drawLayer(layer, time) {
  const state = layerStates[layer]
  if (!state.ctx || !state.imageData || !normalizedConfig || !profile) return

  const frame = renderStarFrame({
    config: normalizedConfig,
    time,
    profile,
    output: state.imageData.data,
    layers: [layer]
  })

  if (frame.data !== state.imageData.data) {
    state.imageData = new ImageData(frame.data, frame.width, frame.height)
  }
  state.ctx.putImageData(state.imageData, 0, 0)
}
</script>

<style scoped>
.star-visualization {
  width: 100%;
  height: 100%;
  position: relative;
  pointer-events: none;
}

.star-canvas {
  position: absolute;
  top: 50%;
  left: 50%;
  display: block;
  transform: translate(-50%, -50%);
  pointer-events: none;
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
  image-rendering: crisp-edges;
}

.star-blobs { z-index: 0; }
.star-surface { z-index: 1; }
</style>
