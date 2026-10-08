<template>
  <div class="paged-lore" :data-state="readState" :data-page="page + 1" :data-pages="shownPages">
    <div
      ref="areaRef"
      class="lore-area"
      tabindex="0"
      role="region"
      :aria-label="t('panels.loreText')"
      @click="handleClick"
      @wheel.prevent="handleWheel"
      @keydown="handleKey"
      @focusin="showFocused"
    >
      <div ref="viewportRef" class="lore-viewport" :style="{ height: `${geometry.pageHeight}px` }">
        <div
          ref="columnsRef"
          class="lore-columns"
          :style="columnsStyle"
        >
          <RichText class="lore-text reading-text" :lang="language()" :doc="doc" :limit="visibleCount" :cursor="isTyping" />
        </div>
        <!-- Laid out unseen: tells the page count before the printing reaches the end. -->
        <div
          ref="ghostRef"
          class="lore-columns is-ghost"
          :style="ghostStyle"
          aria-hidden="true"
          inert
          @load.capture="measure"
        >
          <RichText class="reading-text" :lang="language()" :doc="doc" />
        </div>
      </div>
      <div class="lore-pagebar">
        <button type="button" class="pagebar-button" :aria-label="t('panels.previousPage')" :disabled="page === 0" @click.stop="previousPage">
          <svg viewBox="0 0 7 4" shape-rendering="crispEdges" aria-hidden="true"><path d="M3 0h1v1h1v1h1v1h1v1H0V3h1V2h1V1h1z" /></svg>
        </button>
        <span class="pagebar-track" aria-hidden="true">
          <span v-if="pagesKnown" class="pagebar-thumb" :style="{ top: `${thumb.top * 100}%`, height: `${thumb.size * 100}%` }"></span>
        </span>
        <button type="button" class="pagebar-button" :aria-label="t('panels.nextPage')" :disabled="!canGoNext" @click.stop="nextPage">
          <svg viewBox="0 0 7 4" shape-rendering="crispEdges" aria-hidden="true"><path d="M0 0h7v1H6v1H5v1H4v1H3V3H2V2H1V1H0z" /></svg>
        </button>
      </div>
    </div>
    <PanelStatusBar>
      <template #left>
        <span :class="{ 'is-blinking': readState === 'paused' }">{{ statusLeft }}</span>
      </template>
      <template #right>{{ statusRight }}</template>
    </PanelStatusBar>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRichTypewriter } from '../composables/useRichTypewriter'
import { measureDocument } from '../utils/richText/measure'
import { pageAt, pageCount, pageHeight, pageThumb } from '../utils/panelPages'
import { loadPixelFont } from '../utils/fontLoader'
import { TYPING_SPEED, useReadingText } from '../composables/useReadingText'
import { prefersReducedMotion } from '../utils/reducedMotion'
import { useSystemSettings } from '../stores/systemSettings'
import RichText from './RichText.vue'
import PanelStatusBar from './PanelStatusBar.vue'
import { language, t } from '../i18n'
import { playSound } from '../sound'

const PAGE_GAP = 24
const WHEEL_COOLDOWN_MS = 250

const props = defineProps({
  doc: { type: Object, default: null },
  // ms per character
  typingSpeed: { type: Number, default: TYPING_SPEED },
  typingPace: { type: Number, default: 1 }
})

const settings = useSystemSettings()
const { size: textSize, line: lineHeight, style: readingStyle } = useReadingText()

const areaRef = ref(null)
const viewportRef = ref(null)
const columnsRef = ref(null)
const ghostRef = ref(null)
const page = ref(0)
const pages = ref(1)
const pagesKnown = ref(false)
const geometry = reactive({ width: 0, pageHeight: lineHeight.value })
const step = computed(() => geometry.width + PAGE_GAP)

const reducedMotion = prefersReducedMotion()

// px in the columns; null without a cursor
function cursorPosition() {
  const cursor = columnsRef.value?.querySelector('.rt-cursor')
  if (!cursor) return null
  const box = cursor.getBoundingClientRect()
  const origin = columnsRef.value.getBoundingClientRect()
  return { left: box.left - origin.left, top: box.bottom - origin.top }
}

function cursorPage() {
  const position = cursorPosition()
  return position === null ? null : pageAt(position.left, step.value)
}

const { visibleCount, isTyping, isPaused, resume, fastForward } = useRichTypewriter(
  () => props.doc,
  {
    speed: props.typingSpeed,
    pace: props.typingPace,
    instant: () => reducedMotion || !settings.data.typing,
    shouldPause: () => (cursorPage() ?? 0) > page.value
  }
)

const total = computed(() => measureDocument(props.doc))
const readState = computed(() => {
  if (!isTyping.value) return 'done'
  return isPaused.value ? 'paused' : 'typing'
})

const shownPages = computed(() => Math.max(pages.value, page.value + 1))
const canGoNext = computed(() => isTyping.value || page.value < pages.value - 1)

const statusLeft = computed(() => {
  if (readState.value === 'typing') return t('panels.clickFinish')
  if (readState.value === 'paused') {
    const percent = total.value ? Math.floor(visibleCount.value / total.value * 100) : 0
    return t('panels.more', { percent })
  }
  return page.value < pages.value - 1 ? t('panels.clickNext') : t('panels.end')
})
const statusRight = computed(() => t('panels.page', { page: page.value + 1, pages: shownPages.value }))

const thumb = computed(() => pageThumb(page.value, shownPages.value))

const columnsStyle = computed(() => ({
  width: `${geometry.width}px`,
  height: `${geometry.pageHeight}px`,
  columnWidth: `${geometry.width}px`,
  columnGap: `${PAGE_GAP}px`,
  transform: `translateX(${-page.value * step.value}px)`,
  ...readingStyle.value,
  '--lore-line': `${lineHeight.value}px`,
  '--lore-page-height': `${geometry.pageHeight}px`
}))
const ghostStyle = computed(() => ({ ...columnsStyle.value, transform: 'none' }))

async function measure() {
  const area = areaRef.value
  const viewport = viewportRef.value
  if (!area || !viewport) return
  geometry.width = viewport.clientWidth
  const style = getComputedStyle(area)
  const available = area.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
  geometry.pageHeight = pageHeight(available, lineHeight.value)
  // The unseen layout takes a new page size on the next render: count then.
  await nextTick()
  const ghost = ghostRef.value
  if (!ghost) return
  pages.value = pageCount(ghost.scrollWidth, step.value, PAGE_GAP)
  if (!isTyping.value && page.value > pages.value - 1) page.value = pages.value - 1
}

function turned(turn) {
  const before = page.value
  turn()
  if (page.value !== before) playSound('pageTurn')
}

const nextPage = () => turned(showNextPage)

function showNextPage() {
  if (isTyping.value && !isPaused.value) {
    fastForward()
    return
  }
  if (isTyping.value) {
    const typed = cursorPage() ?? page.value + 1
    if (page.value + 1 >= typed) {
      page.value = typed
      resume()
    } else {
      page.value++
    }
    return
  }
  page.value = Math.min(pages.value - 1, page.value + 1)
}

function previousPage() {
  turned(() => { page.value = Math.max(0, page.value - 1) })
}

function handleClick(event) {
  if (event.target.closest?.('a, button, .rt-link')) return
  nextPage()
}

const NEXT_KEYS = new Set(['PageDown', ' ', 'ArrowDown'])
const PREVIOUS_KEYS = new Set(['PageUp', 'ArrowUp'])
function handleKey(event) {
  if (event.target !== areaRef.value || event.altKey || event.ctrlKey || event.metaKey) return
  if (NEXT_KEYS.has(event.key)) nextPage()
  else if (PREVIOUS_KEYS.has(event.key)) previousPage()
  else return
  event.preventDefault()
}

// A link reached with Tab may lie on another page: that page is shown.
function showFocused(event) {
  const columns = columnsRef.value
  if (!columns?.contains(event.target) || event.target === columns) return
  const left = event.target.getBoundingClientRect().left - columns.getBoundingClientRect().left
  const target = pageAt(left, step.value)
  if (target !== page.value) page.value = Math.max(0, target)
}

let lastWheelAt = 0
function handleWheel(event) {
  const now = performance.now()
  if (now - lastWheelAt < WHEEL_COOLDOWN_MS || Math.abs(event.deltaY) < 1) return
  lastWheelAt = now
  if (event.deltaY > 0) nextPage()
  else previousPage()
}

watch(() => props.doc, () => { page.value = 0 })
watch(() => props.doc, () => nextTick(measure), { flush: 'post' })
watch(textSize, size => {
  nextTick(measure)
  loadPixelFont(`${size}px "Ark Pixel 10"`).then(measure)
}, { flush: 'post' })

let resizeObserver = null
onMounted(() => {
  measure()
  resizeObserver = new ResizeObserver(() => measure())
  resizeObserver.observe(areaRef.value)
  // The fonts arrive after the first layout and change the line breaks: the
  // thumb shows up once the pages are counted in the right font.
  Promise.all([
    loadPixelFont(`${textSize.value}px "Ark Pixel 10"`),
    loadPixelFont('24px "Tiny5"'),
    loadPixelFont('8px "Press Start 2P"')
  ])
    .then(measure)
    .then(() => { pagesKnown.value = true })
})
onBeforeUnmount(() => resizeObserver?.disconnect())
</script>

<style scoped>
.paged-lore {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.lore-area {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 8px;
  padding: 10px 6px 0 10px;
}

.lore-area:focus-visible,
.pagebar-button:focus-visible {
  outline: 1px dashed var(--ui-dim);
  outline-offset: -1px;
}

.lore-viewport {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

/* Font, size and colours come from the shared reading style (.reading-text) */
.lore-columns {
  position: relative;
  column-fill: auto;
}

.lore-columns.is-ghost {
  position: absolute;
  top: 0;
  left: 0;
  visibility: hidden;
  pointer-events: none;
}

/* Everything keeps to the line grid, so no line is cut at the bottom of a page.
   These rules beat the em margins of the reading style. */
.lore-columns :deep(.reading-text .rt-p),
.lore-columns :deep(.reading-text .rt-list),
.lore-columns :deep(.reading-text .rt-definitions),
.lore-columns :deep(.reading-text .rt-quote),
.lore-columns :deep(.reading-text .rt-pre),
.lore-columns :deep(.reading-text .rt-table-wrap),
.lore-columns :deep(.reading-text .rt-hatnote),
.lore-columns :deep(.reading-text .rt-notice),
.lore-columns :deep(.reading-text .rt-gallery),
.lore-columns :deep(.reading-text .rt-references) {
  margin: 0 0 var(--lore-line);
}

.lore-columns :deep(.reading-text .rt-notice .rt-p),
.lore-columns :deep(.reading-text .rt-table .rt-p),
.lore-columns :deep(.reading-text .rt-list .rt-p),
.lore-columns :deep(.reading-text .rt-definitions .rt-p),
.lore-columns :deep(.reading-text .rt-infobox .rt-p),
.lore-columns :deep(.reading-text .rt-list .rt-list),
.lore-columns :deep(.reading-text .rt-list .rt-definitions) {
  margin: 0;
}

.lore-columns :deep(.rt-list li + li),
.lore-columns :deep(.rt-definitions > * + *) {
  margin-top: 0;
}

.lore-columns :deep(.reading-text .rt-heading) {
  margin: var(--lore-line) 0;
  line-height: var(--lore-line);
  break-after: avoid;
}

/* The rule under a heading fits into a grid line */
.lore-columns :deep(.reading-text .rt-h1),
.lore-columns :deep(.reading-text .rt-h2) {
  padding-bottom: 6px;
  line-height: calc(var(--lore-line) - 6px);
}

.lore-columns :deep(.reading-text .rt-heading:first-child) {
  margin-top: 0;
}

/* Pictures, tables, infoboxes, plates and galleries never split across pages */
.lore-columns :deep(.rt-figure),
.lore-columns :deep(.rt-table-wrap),
.lore-columns :deep(.rt-infobox),
.lore-columns :deep(.rt-notice),
.lore-columns :deep(.rt-gallery-item) {
  break-inside: avoid;
}

.lore-columns :deep(.rt-figure img),
.lore-columns :deep(.rt-figure canvas) {
  max-height: calc(var(--lore-page-height) - 3 * var(--lore-line));
  width: auto;
  max-width: 100%;
}

.lore-pagebar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  width: 12px;
  padding-bottom: 10px;
  user-select: none;
}

.pagebar-track {
  flex: 1;
  position: relative;
  width: 8px;
  background: repeating-conic-gradient(var(--ui-line) 0 25%, transparent 0 50%) 0 0 / 2px 2px;
}

.pagebar-thumb {
  position: absolute;
  left: 0;
  right: 0;
  min-height: 4px;
  background: var(--ui-text);
}

.pagebar-button {
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

.pagebar-button svg {
  width: 7px;
  height: 4px;
  fill: currentColor;
}

.pagebar-button:hover:not(:disabled) {
  background: var(--ui-text);
  color: var(--ui-screen);
}

.pagebar-button:disabled {
  color: color-mix(in srgb, var(--ui-line) 80%, var(--ui-screen));
}

.is-blinking {
  animation: crt-blink 1s steps(1, end) infinite;
}

@media (prefers-reduced-motion: reduce) {
  .is-blinking {
    animation: none;
  }
}
</style>
