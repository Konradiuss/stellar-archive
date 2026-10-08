<template>
  <div
    class="volume-slider"
    :class="{ 'is-dim': dim }"
    role="slider"
    tabindex="0"
    :aria-label="label"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="percent"
    :aria-valuetext="`${percent}%`"
    :data-hint="label"
    @pointerdown="start"
    @pointermove="move"
    @pointerup="end"
    @pointercancel="end"
    @wheel.prevent="wheel"
    @keydown="key"
  >
    <span class="volume-fill" :style="{ width: `${percent}%` }"></span>
  </div>
</template>

<script setup>
const props = defineProps({
  percent: { type: Number, required: true },
  label: { type: String, required: true },
  dim: { type: Boolean, default: false }
})
const emit = defineEmits(['change'])

// In percent
const STEP = 1
const WHEEL_STEP = 5
const PAGE_STEP = 10

const set = percent => emit('change', Math.min(100, Math.max(0, Math.round(percent))))

let dragging = false
function at(event) {
  const box = event.currentTarget.getBoundingClientRect()
  if (box.width > 0) set(((event.clientX - box.left) / box.width) * 100)
}
function start(event) {
  dragging = true
  event.currentTarget.setPointerCapture?.(event.pointerId)
  at(event)
}
function move(event) {
  if (dragging) at(event)
}
function end() {
  dragging = false
}

function wheel(event) {
  if (event.deltaY) set(props.percent + (event.deltaY < 0 ? WHEEL_STEP : -WHEEL_STEP))
}

const KEYS = {
  ArrowLeft: percent => percent - STEP,
  ArrowDown: percent => percent - STEP,
  ArrowRight: percent => percent + STEP,
  ArrowUp: percent => percent + STEP,
  PageDown: percent => percent - PAGE_STEP,
  PageUp: percent => percent + PAGE_STEP,
  Home: () => 0,
  End: () => 100
}
function key(event) {
  const change = KEYS[event.key]
  if (!change) return
  event.preventDefault()
  set(change(props.percent))
}
</script>

<style scoped>
.volume-slider {
  position: relative;
  width: 64px;
  height: 8px;
  background: repeating-conic-gradient(var(--ui-line) 0 25%, transparent 0 50%) 0 0 / 2px 2px;
  cursor: none;
  touch-action: none;
}

.volume-slider:focus-visible {
  outline: 1px dashed var(--ui-text);
  outline-offset: 2px;
}

.volume-fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--ui-text);
}

.volume-slider.is-dim .volume-fill {
  background: var(--ui-dim);
}
</style>
