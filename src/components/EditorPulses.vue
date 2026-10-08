<template>
  <div class="editor-pulses" :class="inputClass">
    <label class="editor-check">
      <input type="checkbox" :class="`${inputClass}-on`" :checked="!!resolved" @change="toggle($event.target.checked)" />
      {{ t('editor.pulses') }}
    </label>
    <canvas ref="canvasRef" class="pulse-preview" :class="[`${inputClass}-preview`, { 'is-off': !shownPulse }]" aria-hidden="true"></canvas>
    <div class="pulse-fields" :class="{ 'is-off': !resolved }">
      <div v-for="field in FIELDS" :key="field.key" class="pulse-field" :class="{ 'is-auto': !isOwn(field.key) }">
        <div class="pulse-top">
          <span class="editor-label">{{ t(field.label) }}</span>
          <span class="pulse-value">{{ field.key === 'interval' ? t('editor.pulseEvery', { value: shown('interval') }) : shown(field.key) }}</span>
          <button v-if="isOwn(field.key) && resolved" type="button" class="editor-button is-quiet is-small pulse-reset" @click="reset(field.key)">{{ t('editor.reset') }}</button>
          <span v-else-if="resolved" class="editor-hint pulse-auto">{{ autoLabel }}</span>
        </div>
        <input
          type="range"
          class="pulse-range"
          :class="`${inputClass}-${field.key}`"
          :aria-label="t(field.label)"
          :min="field.min"
          :max="field.max"
          :step="field.step"
          :value="valueOf(field.key)"
          :disabled="!resolved"
          @input="dragging = { key: field.key, value: Number($event.target.value) }"
          @change="commit(field.key, Number($event.target.value))"
        />
      </div>
    </div>
    <div class="editor-hint">{{ t('editor.pulsesHint') }}</div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { t } from '../i18n'
import { pulseAfter } from '../editor/routeEdits'
import { measurePath, pulseSquares } from '../utils/hyperlinePulses'
import { cssColor, mixColor } from '../utils/color'
import { prefersReducedMotion } from '../utils/reducedMotion'
import { isObject } from '../utils/guards'

const FIELDS = [
  { key: 'interval', label: 'editor.pulseFrequency', min: 0.3, max: 6, step: 0.1 },
  { key: 'speed', label: 'editor.pulseSpeed', min: 10, max: 300, step: 5 },
  { key: 'length', label: 'editor.pulseTail', min: 2, max: 40, step: 1 }
]
// From each end to the star, as far as on the map, where pulses leave from under the star.
const END = 12
const HEIGHT = 40

const props = defineProps({
  // The `pulse` of this layer as the map has it: an object, false or undefined.
  own: { type: [Object, Boolean], default: undefined },
  // The pulses of the layers below (null: off), and those the line ends up with.
  inherited: { type: Object, default: null },
  resolved: { type: Object, default: null },
  color: { type: Number, default: 0xffffff },
  width: { type: Number, default: 2 },
  opacity: { type: Number, default: 0.7 },
  direction: { type: String, default: 'both' },
  autoLabel: { type: String, default: '' },
  inputClass: { type: String, default: 'pulse' }
})
const emit = defineEmits(['set'])

// The own settings while pulses are off, to bring them back when they are turned on again.
const kept = ref(null)
const dragging = ref(null)
watch(() => props.own, () => { dragging.value = null })

const ownFields = computed(() => (isObject(props.own) ? props.own : {}))
const isOwn = key => ownFields.value[key] !== undefined
const valueOf = key => {
  if (dragging.value?.key === key) return dragging.value.value
  return props.resolved?.[key] ?? kept.value?.[key] ?? props.inherited?.[key] ?? null
}
const shown = key => {
  const value = valueOf(key)
  return typeof value === 'number' ? Number(value.toFixed(2)) : '—'
}
const shownPulse = computed(() => (props.resolved ? { ...props.resolved, ...(dragging.value ? { [dragging.value.key]: dragging.value.value } : {}) } : null))

function toggle(on) {
  if (!on) kept.value = Object.keys(ownFields.value).length ? { ...ownFields.value } : null
  emit('set', pulseAfter(props.own, props.inherited, on ? { on: true, kept: kept.value } : { on: false }))
}
const commit = (key, value) => emit('set', pulseAfter(props.own, props.inherited, { key, value }))
const reset = key => emit('set', pulseAfter(props.own, props.inherited, { key, reset: true }))

const canvasRef = ref(null)
let frame = 0
let resize = null

function draw(seconds) {
  const canvas = canvasRef.value
  if (!canvas) return
  const scale = window.devicePixelRatio || 1
  const cssWidth = canvas.clientWidth
  if (canvas.width !== Math.round(cssWidth * scale)) {
    canvas.width = Math.round(cssWidth * scale)
    canvas.height = Math.round(HEIGHT * scale)
  }
  const context = canvas.getContext('2d')
  context.setTransform(scale, 0, 0, scale, 0, 0)
  context.clearRect(0, 0, cssWidth, HEIGHT)
  const y = HEIGHT / 2
  const path = measurePath([{ x: END, y }, { x: cssWidth - END, y }])
  context.globalAlpha = props.opacity
  context.fillStyle = cssColor(props.color)
  context.fillRect(END, y - props.width / 2, path.total, props.width)
  context.globalAlpha = 1
  context.fillStyle = '#f4f4f4'
  for (const x of [END, cssWidth - END]) context.fillRect(x - 3, y - 3, 6, 6)
  if (!shownPulse.value) return
  const tones = {
    glow: cssColor(props.color),
    head: cssColor(mixColor(props.color, 0xffffff, 0.7)),
    tail: cssColor(mixColor(props.color, 0xffffff, 0.3))
  }
  const look = { pulse: shownPulse.value, direction: props.direction, width: props.width }
  for (const square of pulseSquares(path, look, seconds)) {
    context.globalAlpha = square.alpha
    context.fillStyle = tones[square.tone]
    context.fillRect(square.x, square.y, square.size, square.size)
  }
  context.globalAlpha = 1
}

function animate() {
  draw(performance.now() / 1000)
  frame = requestAnimationFrame(animate)
}

onMounted(() => {
  // As on the map: with less motion asked for, one still picture.
  if (prefersReducedMotion()) {
    const still = () => draw((shownPulse.value?.interval ?? 1) * 0.6)
    still()
    watch([shownPulse, () => props.color, () => props.width, () => props.opacity, () => props.direction], still, { deep: true })
    resize = new ResizeObserver(still)
  } else {
    animate()
    resize = new ResizeObserver(() => draw(performance.now() / 1000))
  }
  resize.observe(canvasRef.value)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  resize?.disconnect()
})
</script>

<style scoped>
.editor-pulses {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  max-width: 560px;
}

.pulse-preview {
  display: block;
  width: 100%;
  height: 40px;
  border: 1px solid var(--ed-border);
  border-radius: 6px;
  background: #000;
}

.pulse-fields {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pulse-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pulse-top {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
}

.pulse-top .editor-label {
  flex: 1;
}

.pulse-auto {
  white-space: nowrap;
}

.pulse-fields.is-off {
  opacity: 0.5;
}

.pulse-range {
  width: 100%;
  accent-color: var(--ed-accent);
}

.pulse-value {
  white-space: nowrap;
  font-family: var(--ed-mono);
  font-size: 12px;
}

.pulse-field.is-auto .pulse-value {
  color: var(--ed-muted);
}
</style>
