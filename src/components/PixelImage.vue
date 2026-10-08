<template>
  <span ref="rootRef" class="pixel-image" :class="{ 'is-inline': inline }">
    <span v-show="ready" class="pixel-image-frame">
      <canvas ref="canvasRef" class="pixel-image-canvas" role="img" :aria-label="alt" :style="canvasStyle"></canvas>
    </span>
    <span v-if="failed" class="pixel-image-note">{{ t('wiki.imageUnavailable', { file: fileName }) }}</span>
    <span v-else-if="!ready" class="pixel-image-note">{{ t('wiki.loadingImage') }}</span>
  </span>
</template>

<script>
const imageCache = new Map()

function loadImage(src) {
  if (imageCache.has(src)) return imageCache.get(src)
  const attempt = crossOrigin => new Promise((resolve, reject) => {
    const element = new Image()
    if (crossOrigin) element.crossOrigin = 'anonymous'
    element.decoding = 'async'
    element.onload = () => resolve(element)
    element.onerror = reject
    element.src = src
  })
  // Without CORS headers the anonymous request fails: retry as a plain image,
  // which can still be drawn (only the palette step needs the pixels).
  const promise = attempt(true).catch(() => attempt(false))
  imageCache.set(src, promise)
  promise.catch(() => imageCache.delete(src))
  return promise
}
</script>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { t } from '../i18n'
import {
  PIXEL_SIZE,
  isSprite,
  pixelateImageData,
  pixelatedSize,
  spriteScale
} from '../utils/pixelImage'

const props = defineProps({
  src: { type: String, default: null },
  alt: { type: String, default: '' },
  // Screen px (the 200px of [[File:…|200px]])
  maxWidth: { type: Number, default: null },
  inline: { type: Boolean, default: false }
})

const INLINE_MAX_WIDTH = 64
const INLINE_SPRITE_HEIGHT = 32
const RESIZE_DELAY_MS = 150

const rootRef = ref(null)
const canvasRef = ref(null)
const ready = ref(false)
const failed = ref(false)
const canvasStyle = ref({})
let image = null
let lastWidth = 0
let resizeObserver = null
let resizeTimer = null

const fileName = computed(() => {
  const path = String(props.src ?? props.alt ?? '').split(/[?#]/)[0]
  const name = path.slice(path.lastIndexOf('/') + 1)
  // A stray % ("100%.png") is no escape: keep the name as written.
  let decoded = name
  try {
    decoded = decodeURIComponent(name)
  } catch {
    // Not URI-encoded.
  }
  return decoded || props.alt || '?'
})

function availableWidth() {
  const root = rootRef.value
  const width = props.inline ? INLINE_MAX_WIDTH : root?.clientWidth ?? 0
  return props.maxWidth ? Math.min(width, props.maxWidth) : width
}

function draw() {
  const canvas = canvasRef.value
  if (!image || !canvas) return
  const width = availableWidth()
  if (width <= 0) return
  lastWidth = width
  const { naturalWidth, naturalHeight } = image
  const context = canvas.getContext('2d')

  if (isSprite(naturalWidth, naturalHeight)) {
    const scale = props.inline
      ? Math.max(1, Math.floor(INLINE_SPRITE_HEIGHT / naturalHeight))
      : spriteScale(naturalWidth, width)
    canvas.width = naturalWidth
    canvas.height = naturalHeight
    context.imageSmoothingEnabled = false
    context.clearRect(0, 0, naturalWidth, naturalHeight)
    context.drawImage(image, 0, 0)
    canvasStyle.value = { width: `${naturalWidth * scale}px` }
    ready.value = true
    return
  }

  const size = pixelatedSize(naturalWidth, naturalHeight, width)
  // Halve step by step: one big smooth downscale would alias.
  let source = image
  let sourceWidth = naturalWidth
  let sourceHeight = naturalHeight
  while (sourceWidth / 2 > size.width * 2) {
    const half = document.createElement('canvas')
    half.width = Math.round(sourceWidth / 2)
    half.height = Math.round(sourceHeight / 2)
    const halfContext = half.getContext('2d')
    halfContext.imageSmoothingQuality = 'high'
    halfContext.drawImage(source, 0, 0, half.width, half.height)
    source = half
    sourceWidth = half.width
    sourceHeight = half.height
  }

  canvas.width = size.width
  canvas.height = size.height
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.clearRect(0, 0, size.width, size.height)
  context.drawImage(source, 0, 0, size.width, size.height)
  try {
    const pixels = context.getImageData(0, 0, size.width, size.height)
    pixelateImageData(pixels.data, size.width, size.height)
    context.putImageData(pixels, 0, 0)
  } catch {
    // Another site without CORS: the picture stays pixelated, just unpaletted.
  }
  canvasStyle.value = { width: `${size.width * PIXEL_SIZE}px` }
  ready.value = true
}

async function load() {
  ready.value = false
  failed.value = false
  image = null
  if (!props.src) {
    failed.value = true
    return
  }
  const src = props.src
  try {
    const loaded = await loadImage(src)
    if (src !== props.src) return
    image = loaded
    draw()
  } catch {
    if (src === props.src) failed.value = true
  }
}

function handleResize() {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    if (Math.abs(availableWidth() - lastWidth) >= PIXEL_SIZE) draw()
  }, RESIZE_DELAY_MS)
}

watch(() => [props.src, props.maxWidth], load)

onMounted(() => {
  load()
  if (!props.inline) {
    resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(rootRef.value)
  }
})

onBeforeUnmount(() => {
  clearTimeout(resizeTimer)
  resizeObserver?.disconnect()
})
</script>

<style scoped>
.pixel-image {
  display: block;
  width: 100%;
  text-align: center;
  line-height: 0;
}

.pixel-image.is-inline {
  display: inline-block;
  width: auto;
  vertical-align: middle;
}

.pixel-image-frame {
  position: relative;
  display: inline-block;
  max-width: 100%;
  animation: crt-on 360ms both;
}

.pixel-image-frame::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(
    180deg,
    transparent 0 2px,
    rgb(var(--ui-screen-rgb) / 0.22) 2px 3px
  );
}

.pixel-image-canvas {
  display: block;
  max-width: 100%;
  height: auto;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  filter: drop-shadow(0 0 4px rgb(var(--ui-text-rgb) / 0.12));
}

.is-inline .pixel-image-frame::after {
  display: none;
}

.pixel-image-note {
  display: inline-block;
  padding: 6px;
  border: 1px dashed var(--rt-dim, color-mix(in srgb, var(--ui-dim) 49%, var(--ui-line)));
  color: var(--rt-dim, color-mix(in srgb, var(--ui-dim) 49%, var(--ui-line)));
  line-height: 1.6;
}

@media (prefers-reduced-motion: reduce) {
  .pixel-image-frame {
    animation: none;
  }
}
</style>
