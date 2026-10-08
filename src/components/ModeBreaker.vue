<template>
  <button
    ref="rootRef"
    type="button"
    class="mode-breaker"
    :class="`is-${frame}`"
    :style="{ '--breaker-px': `${scale}px`, width: px(BREAKER_WIDTH) }"
    :aria-disabled="busy"
    :aria-pressed="wikiMode"
    :aria-label="wikiMode ? t('breaker.ariaOnWiki') : t('breaker.ariaOnMap')"
    :title="wikiMode ? t('breaker.titleOnWiki') : t('breaker.titleOnMap')"
    :data-hint="wikiMode ? t('breaker.hintOnWiki') : t('breaker.hintOnMap')"
    @click="toggle"
    @pointerenter="peek(true)"
    @pointerleave="peek(false)"
    @focus="peek(true)"
    @blur="peek(false)"
  >
    <img class="breaker-sprite" :src="spriteUri" :style="{ height: px(layout.height) }" alt="" draggable="false" />
    <img
      v-for="side in SIDES"
      :key="side"
      class="breaker-label"
      :class="[`is-${side}`, { 'is-lit': lit === side, 'is-hint': hint === side }]"
      :src="LABEL_URIS[side]"
      :style="place(layout.labels[side])"
      alt=""
      draggable="false"
    />
  </button>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { prefersReducedMotion } from '../utils/reducedMotion'
import { useUIStore } from '../stores/uiStore'
import { readStoredValue, writeStoredValue } from '../composables/usePersistentState'
import { STEEL_TINTS } from '../utils/bezelSprites'
import {
  BREAKER_FRAMES, BREAKER_MIN_HEIGHT, BREAKER_WIDTH, breakerLayout, breakerWords, buildBreaker, buildBreakerLabel
} from '../utils/breakerSprites'
import { spriteToDataUri } from '../utils/pixelArt'
import { language, t } from '../i18n'
import { playSound } from '../sound'
import { themeColor } from '../theme'

const FRAME_MS = 50
const LAST = BREAKER_FRAMES.length - 1
const NUDGE_IDLE_MS = 15000
const NUDGE_BEAT_MS = 90
const QUIET_HINT_MS = 1200
const USED_KEY = 'breaker-used'
const ACTIVITY_EVENTS = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart']

const SIDES = ['map', 'wiki']
const words = computed(() => breakerWords(key => t(`breaker.${key}`), language()))
const LIGHTS = { map: 'ok', wiki: 'warn' }
const LABEL_URIS = computed(() => Object.fromEntries(SIDES.map(side => [
  side,
  spriteToDataUri(buildBreakerLabel(side, words.value, themeColor(LIGHTS[side])))
])))

const props = defineProps({
  tint: { type: String, default: 'grey' }
})

const uiStore = useUIStore()

// Moves as soon as a switch starts (a click, a link, the browser's Back),
// not when the screen is dark.
const wikiMode = computed(() => (
  uiStore.transitionPhase !== 'idle' && uiStore.transitionTarget
    ? uiStore.transitionTarget.kind === 'wiki'
    : uiStore.currentView === 'wiki'
))
const busy = computed(() => uiStore.transitionPhase !== 'idle')

const restIndex = computed(() => (wikiMode.value ? LAST : 0))
const peekIndex = computed(() => (wikiMode.value ? LAST - 1 : 1))

// Steps one frame at a time; turning back halfway goes on from the frame reached.
const frameIndex = ref(restIndex.value)
const frame = computed(() => BREAKER_FRAMES[frameIndex.value])
let frameTimer = null

function moveTo(target, done = null) {
  clearTimeout(frameTimer)
  frameTimer = null
  const advance = () => {
    if (frameIndex.value !== target) frameIndex.value += Math.sign(target - frameIndex.value)
    if (frameIndex.value === target) done?.()
    else frameTimer = setTimeout(advance, FRAME_MS)
  }
  advance()
}

const throwing = ref(false)
watch(wikiMode, () => {
  stopNudge()
  hint.value = null
  throwing.value = true
  moveTo(restIndex.value, () => { throwing.value = false })
})

const lit = computed(() => (throwing.value ? null : wikiMode.value ? 'wiki' : 'map'))
const hint = ref(null)
const otherSide = () => (wikiMode.value ? 'map' : 'wiki')

const reducedMotion = prefersReducedMotion

let hovering = false
function peek(on) {
  hovering = on
  if (busy.value || throwing.value) return
  stopNudge()
  hint.value = on ? otherSide() : null
  if (!reducedMotion()) moveTo(on ? peekIndex.value : restIndex.value)
}

const used = ref(readStoredValue(USED_KEY, false) === true)
let idleTimer = null
let nudgeTimer = null
let nudging = false

const canNudge = () => !used.value && !busy.value && !throwing.value && !hovering && !globalThis.document?.hidden

function scheduleNudge() {
  clearTimeout(idleTimer)
  idleTimer = used.value ? null : setTimeout(nudge, NUDGE_IDLE_MS)
}

function stopNudge() {
  clearTimeout(nudgeTimer)
  nudgeTimer = null
  if (!nudging) return
  nudging = false
  hint.value = null
}

function finishNudge() {
  nudging = false
  hint.value = null
  scheduleNudge()
}

function nudge() {
  if (!canNudge()) return scheduleNudge()
  nudging = true
  hint.value = otherSide()
  if (reducedMotion()) {
    nudgeTimer = setTimeout(finishNudge, QUIET_HINT_MS)
    return
  }
  const moves = [peekIndex.value, restIndex.value, peekIndex.value, restIndex.value]
  const run = index => {
    if (!nudging) return
    if (index >= moves.length) return finishNudge()
    moveTo(moves[index], () => { nudgeTimer = setTimeout(() => run(index + 1), NUDGE_BEAT_MS) })
  }
  run(0)
}

function onActivity() {
  if (!nudging) scheduleNudge()
}

function listen(on) {
  for (const type of ACTIVITY_EVENTS) {
    if (on) window.addEventListener(type, onActivity, { passive: true })
    else window.removeEventListener(type, onActivity)
  }
}

// `aria-disabled`, not `disabled`, while busy: the keyboard keeps its place on
// the switch instead of falling back to the page.
function toggle() {
  if (busy.value) return
  playSound('breaker')
  if (!used.value) {
    used.value = true
    writeStoredValue(USED_KEY, true)
    listen(false)
    clearTimeout(idleTimer)
    stopNudge()
  }
  uiStore.toggleMode()
}

onMounted(() => {
  if (used.value) return
  listen(true)
  scheduleNudge()
})

onBeforeUnmount(() => {
  listen(false)
  clearTimeout(frameTimer)
  clearTimeout(idleTimer)
  clearTimeout(nudgeTimer)
})

// In casing pixels (2 CSS px) when the whole breaker fits, else in single pixels.
const CASING_PX = 2
const rootRef = ref(null)
const boxHeight = ref(BREAKER_MIN_HEIGHT * CASING_PX)
const scale = computed(() => (boxHeight.value / CASING_PX >= BREAKER_MIN_HEIGHT ? CASING_PX : 1))
const layout = computed(() => breakerLayout(boxHeight.value / scale.value, words.value))

let observer = null
onMounted(() => {
  if (typeof ResizeObserver === 'undefined') return
  const element = rootRef.value
  const measure = height => { if (height > 0) boxHeight.value = height }
  measure(element.offsetHeight)
  observer = new ResizeObserver(([entry]) => measure(entry.borderBoxSize?.[0]?.blockSize ?? element.offsetHeight))
  observer.observe(element)
})
onBeforeUnmount(() => observer?.disconnect())

const sprites = new Map()
const spriteUri = computed(() => {
  const { plate, map, wiki } = words.value
  const key = `${props.tint}:${frame.value}:${layout.value.height}:${plate}:${map}:${wiki}`
  if (!sprites.has(key)) {
    const tint = STEEL_TINTS[props.tint] ?? STEEL_TINTS.grey
    sprites.set(key, spriteToDataUri(buildBreaker(tint, frame.value, layout.value.height, words.value)))
  }
  return sprites.get(key)
})

const px = value => `calc(var(--breaker-px) * ${value})`
const place = ({ x, y, w, h }) => ({ left: px(x), top: px(y), width: px(w), height: px(h) })
</script>

<style scoped>
.mode-breaker {
  position: relative;
  display: block;
  align-self: stretch;
  flex-shrink: 0;
  overflow: hidden;
  padding: 0;
  border: 0;
  background: transparent;
  pointer-events: auto;
  appearance: none;
  cursor: none;
}

.mode-breaker[aria-disabled='true'] {
  cursor: none;
}

.mode-breaker:focus-visible {
  outline: 1px dashed var(--ui-text);
  outline-offset: 2px;
}

.breaker-sprite {
  display: block;
  width: 100%;
  image-rendering: pixelated;
}

.breaker-label {
  position: absolute;
  image-rendering: pixelated;
  opacity: 0;
  pointer-events: none;
}

.breaker-label.is-map {
  filter: drop-shadow(0 0 calc(var(--breaker-px) * 1.5) rgb(var(--ui-ok-rgb) / 0.55));
}

.breaker-label.is-wiki {
  filter: drop-shadow(0 0 calc(var(--breaker-px) * 1.5) rgb(var(--ui-warn-rgb) / 0.6));
}

.breaker-label.is-lit {
  opacity: 1;
}

.breaker-label.is-hint {
  animation: breaker-hint 0.5s steps(1, end) infinite;
}

@keyframes breaker-hint {
  0% { opacity: 1; }
  50% { opacity: 0.15; }
}
</style>
