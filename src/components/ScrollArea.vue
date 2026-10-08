<template>
  <div class="scroll-area" :class="{ 'has-bar': bar }">
    <div ref="scrollRef" class="scroll-area-body" tabindex="-1" @scroll="update">
      <slot />
    </div>
    <div
      v-if="bar"
      class="scroll-area-bar"
      :class="{ 'is-idle': !scrollable }"
      :style="{ paddingTop: `${barInset[0]}px`, paddingBottom: `${barInset[1]}px` }"
      aria-hidden="true"
    >
      <button type="button" class="scrollbar-button" tabindex="-1" :disabled="!canScrollUp" @click="scrollByPage(-1)">
        <svg viewBox="0 0 7 4" shape-rendering="crispEdges"><path d="M3 0h1v1h1v1h1v1h1v1H0V3h1V2h1V1h1z" /></svg>
      </button>
      <span ref="trackRef" class="scrollbar-track" @pointerdown="handleTrackDown">
        <span
          class="scrollbar-thumb"
          :style="{ top: `${thumb.top * 100}%`, height: `${thumb.size * 100}%` }"
          @pointerdown.stop="handleThumbDown"
        ></span>
      </span>
      <button type="button" class="scrollbar-button" tabindex="-1" :disabled="!canScrollDown" @click="scrollByPage(1)">
        <svg viewBox="0 0 7 4" shape-rendering="crispEdges"><path d="M0 0h7v1H6v1H5v1H4v1H3V3H2V2H1V1H0z" /></svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { prefersReducedMotion } from '../utils/reducedMotion'

const PAGE_SHARE = 0.9

const props = defineProps({
  // false: no bar, nothing scrolls (the content is laid out to fit)
  bar: { type: Boolean, default: true },
  // [top, bottom] px, to line up with the text beside it
  barInset: { type: Array, default: () => [0, 0] }
})

const scrollRef = ref(null)
const trackRef = ref(null)

const thumb = reactive({ top: 0, size: 1 })
const scrollable = ref(false)
const progress = ref(0)
const canScrollUp = ref(false)
const canScrollDown = ref(false)

function update() {
  const element = scrollRef.value
  if (!element) return
  const { scrollTop, scrollHeight, clientHeight } = element
  const range = Math.max(0, scrollHeight - clientHeight)
  scrollable.value = props.bar && range > 1
  progress.value = range ? scrollTop / range : 1
  thumb.size = scrollHeight ? Math.min(1, clientHeight / scrollHeight) : 1
  thumb.top = range ? (scrollTop / range) * (1 - thumb.size) : 0
  canScrollUp.value = scrollTop > 0
  canScrollDown.value = scrollTop < range - 1
}

const reducedMotion = prefersReducedMotion()

function scrollToY(top, smooth = false) {
  scrollRef.value?.scrollTo({ top, behavior: smooth && !reducedMotion ? 'smooth' : 'auto' })
}

function scrollByPage(direction) {
  const element = scrollRef.value
  if (element) scrollToY(element.scrollTop + direction * element.clientHeight * PAGE_SHARE, true)
}

function handleTrackDown(event) {
  const box = trackRef.value.getBoundingClientRect()
  const thumbTop = box.top + thumb.top * box.height
  scrollByPage(event.clientY < thumbTop ? -1 : 1)
}

function handleThumbDown(event) {
  const element = scrollRef.value
  const track = trackRef.value
  if (!element || !track) return
  const startY = event.clientY
  const startScroll = element.scrollTop
  const ratio = element.scrollHeight / track.getBoundingClientRect().height
  const move = moveEvent => { element.scrollTop = startScroll + (moveEvent.clientY - startY) * ratio }
  const stop = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stop)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop)
}

let resizeObserver = null
let mutationObserver = null
function observeContent() {
  const element = scrollRef.value
  if (!element || !resizeObserver) return
  resizeObserver.disconnect()
  resizeObserver.observe(element)
  for (const child of element.children) resizeObserver.observe(child)
}

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') resizeObserver = new ResizeObserver(update)
  observeContent()
  if (typeof MutationObserver !== 'undefined') {
    mutationObserver = new MutationObserver(() => {
      observeContent()
      update()
    })
    mutationObserver.observe(scrollRef.value, { childList: true })
  }
  update()
})

watch(() => props.bar, update, { flush: 'post' })

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  mutationObserver?.disconnect()
})

defineExpose({
  get element() { return scrollRef.value },
  progress,
  scrollable,
  update,
  scrollToY,
  scrollByPage
})
</script>

<style scoped>
.scroll-area {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  gap: 8px;
}

.scroll-area-body {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  outline: none;
}

.scroll-area.has-bar > .scroll-area-body {
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
}

.scroll-area.has-bar > .scroll-area-body::-webkit-scrollbar {
  display: none;
}

.scroll-area-bar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  width: 12px;
  user-select: none;
}

.scroll-area-bar.is-idle {
  opacity: 0.35;
}

.scrollbar-track {
  flex: 1;
  position: relative;
  width: 8px;
  background: repeating-conic-gradient(var(--ui-line) 0 25%, transparent 0 50%) 0 0 / 2px 2px;
}

.scrollbar-thumb {
  position: absolute;
  left: 0;
  right: 0;
  min-height: 6px;
  background: var(--ui-text);
}

.scrollbar-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 10px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ui-text);
  appearance: none;
  cursor: none;
}

.scrollbar-button:hover:not(:disabled) {
  background: var(--ui-text);
  color: var(--ui-screen);
}

.scrollbar-button:disabled {
  color: color-mix(in srgb, var(--ui-line) 80%, var(--ui-screen));
}

.scrollbar-button svg {
  width: 7px;
  height: 4px;
  fill: currentColor;
}
</style>
