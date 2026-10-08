<template>
  <div ref="screenRef" class="legend-screen">
    <ScrollArea class="legend-scroll" :class="`is-${layout}`" :bar="layout === 'scroll'" :bar-inset="[8, 8]">
      <div ref="bodyRef" class="legend-body" :class="`is-${layout}`" :data-layout="layout">
        <section
          v-for="section in numbered"
          :key="section.id"
          class="legend-section"
          :class="`legend-${section.id}`"
          :data-section="section.id"
        >
          <div class="legend-title" :class="{ 'is-pending': section.start >= revealed }">[{{ section.title }}]</div>
          <RichText
            v-if="section.doc"
            class="legend-note"
            :class="{ 'is-pending': section.start + 1 >= revealed }"
            :doc="section.doc"
          />
          <ul v-else class="legend-rows">
            <li
              v-for="(row, index) in section.rows"
              :key="index"
              class="legend-row"
              :class="{ 'is-pending': section.start + 1 + index >= revealed }"
              :data-kind="row.kind"
            >
              <span class="legend-sign-box" aria-hidden="true">
                <span class="legend-sign" :class="`sign-${row.kind}`" :style="signStyle(row)">{{ signText(row) }}</span>
              </span>
              <span class="legend-name">{{ row.name }}<template v-if="row.target"> → {{ row.target }}</template></span>
              <template v-if="row.count !== undefined && row.count !== null">
                <span class="legend-leader" aria-hidden="true"></span>
                <span class="legend-count">{{ row.count }}</span>
              </template>
            </li>
          </ul>
        </section>
      </div>
    </ScrollArea>
    <PanelStatusBar>
      <template #left>{{ summary }}</template>
      <template #right>{{ view === 'system' ? t('legend.system') : t('legend.galaxy') }}</template>
    </PanelStatusBar>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { prefersReducedMotion } from '../utils/reducedMotion'
import { loadPixelFont } from '../utils/fontLoader'
import { t } from '../i18n'
import RichText from './RichText.vue'
import PanelStatusBar from './PanelStatusBar.vue'
import ScrollArea from './ScrollArea.vue'

const ROW_MS = 40

const props = defineProps({
  // [{ id, title, rows } | { id, title, doc }] from utils/mapLegend.js
  sections: { type: Array, default: () => [] },
  view: { type: String, default: 'galaxy' }
})

// `start`: the line number of the section title
const numbered = computed(() => {
  let next = 0
  return props.sections.map(section => {
    const start = next
    next += 1 + (section.doc ? 1 : section.rows.length)
    return { ...section, start }
  })
})
const lineCount = computed(() => numbered.value.reduce((sum, section) => sum + 1 + (section.doc ? 1 : section.rows.length), 0))

const revealed = ref(0)
let timer = null
const reducedMotion = prefersReducedMotion()

function reveal() {
  clearInterval(timer)
  if (reducedMotion) {
    revealed.value = Infinity
    return
  }
  revealed.value = 0
  timer = setInterval(() => {
    revealed.value++
    if (revealed.value >= lineCount.value) clearInterval(timer)
  }, ROW_MS)
}

watch(() => props.sections, reveal, { immediate: true })

// 'columns' | 'scroll'
const screenRef = ref(null)
const bodyRef = ref(null)
const layout = ref('columns')

// Columns are tried first; the switch happens before the frame is drawn.
async function fit() {
  layout.value = 'columns'
  await nextTick()
  const body = bodyRef.value
  if (body && body.scrollWidth > body.clientWidth + 1) layout.value = 'scroll'
}

watch(() => props.sections, () => fit(), { flush: 'post' })

let resizeObserver = null
onMounted(() => {
  fit()
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => fit())
    resizeObserver.observe(screenRef.value)
  }
  // The pixel font changes the width of the rows.
  loadPixelFont().then(() => fit())
})

onBeforeUnmount(() => {
  clearInterval(timer)
  resizeObserver?.disconnect()
})

const count = id => props.sections.find(section => section.id === id)?.rows?.length ?? 0
const summary = computed(() => {
  if (props.view === 'system') {
    const counts = props.sections.find(section => section.id === 'system')?.rows.filter(row => row.kind === 'count') ?? []
    const planets = counts.find(row => row.id === 'planets')?.count ?? 0
    const satellites = counts.find(row => row.id === 'satellites')?.count ?? 0
    const stations = counts.find(row => row.id === 'stations')?.count ?? 0
    return [
      t('legend.statusPlanets', { count: planets }),
      satellites ? t('legend.statusMoons', { count: satellites }) : null,
      stations ? t('legend.statusStations', { count: stations }) : null,
      t('legend.statusLinks', { count: count('links') })
    ].filter(Boolean).join(' · ')
  }
  const factions = props.sections.find(section => section.id === 'factions')?.rows.filter(row => row.id).length ?? 0
  return t('legend.statusGalaxy', { factions, lines: count('lines') })
})

function signStyle(row) {
  if (row.kind === 'faction') return { borderColor: row.border, '--sign-fill': row.fill }
  if (row.kind === 'line') return { background: row.color, height: `${row.width}px` }
  return null
}

function signText(row) {
  if (row.kind === 'hidden-name') return '...'
  if (row.kind === 'uncharted') return '??,??'
  return ''
}
</script>

<style scoped>
.legend-screen {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.legend-body {
  box-sizing: border-box;
  font-size: 8px;
  line-height: 14px;
}

/* Full height: 6 rows of 14px. A section stays in one column if it fits;
   its title never parts from its rows. */
.legend-body.is-columns {
  height: 100%;
  padding: 4px 10px;
  column-width: 230px;
  column-gap: 24px;
  column-fill: auto;
}

.is-columns .legend-section {
  break-inside: avoid;
}

.is-columns .legend-section + .legend-section {
  margin-top: 8px;
}

.is-columns .legend-title {
  break-after: avoid;
}

.is-columns .legend-row {
  break-inside: avoid;
}

.legend-body.is-scroll {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  align-content: start;
  gap: 8px 24px;
  padding: 8px 0 8px 10px;
}

.legend-scroll.is-scroll {
  padding-right: 6px;
}

/* Not shown yet, but the room for the rows is already taken */
.is-pending {
  visibility: hidden;
}

.legend-title {
  color: var(--ui-dim);
}

.legend-rows {
  margin: 0;
  padding: 0;
  list-style: none;
}

.legend-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  white-space: nowrap;
}

.legend-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.legend-leader {
  flex: 1;
  min-width: 8px;
  height: 2px;
  margin-top: 6px;
  background: repeating-linear-gradient(90deg, var(--ui-line) 0 2px, transparent 2px 6px);
}

.legend-count {
  flex-shrink: 0;
  color: var(--ui-dim);
}

.legend-sign-box {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
}

.legend-sign {
  display: inline-block;
}

.sign-faction {
  width: 8px;
  height: 8px;
  border: 2px solid;
  background: color-mix(in srgb, var(--sign-fill) 40%, transparent);
}

.sign-line {
  width: 16px;
}

.sign-star,
.sign-planet {
  width: 8px;
  height: 8px;
  background: #fff2c0;
  clip-path: polygon(25% 0, 75% 0, 100% 25%, 100% 75%, 75% 100%, 25% 100%, 0 75%, 0 25%);
}

.sign-planet {
  width: 6px;
  height: 6px;
  background: #7aa0c8;
}

.sign-satellite {
  position: relative;
  width: 12px;
  height: 12px;
  border: 1px dotted var(--ui-line);
  border-radius: 50%;
}

.sign-satellite::after {
  content: '';
  position: absolute;
  top: -2px;
  left: 4px;
  width: 3px;
  height: 3px;
  background: color-mix(in srgb, var(--ui-text) 30%, var(--ui-dim));
}

.sign-station {
  position: relative;
  width: 12px;
  height: 12px;
  border: 1px dotted var(--ui-line);
  border-radius: 50%;
}

.sign-station::after,
.sign-station::before {
  content: '';
  position: absolute;
  top: -3px;
  left: 1px;
  width: 2px;
  height: 2px;
}

.sign-station::after {
  --hull: #9aa3ad;
  box-shadow:
    2px 0 var(--hull), 4px 0 var(--hull), 6px 0 var(--hull),
    0 2px var(--hull), 8px 2px var(--hull),
    2px 4px var(--hull), 4px 4px var(--hull), 6px 4px var(--hull);
}

.sign-station::before {
  top: -1px;
  left: 5px;
  background: #ffc860;
  animation: station-blink 1.4s steps(1) infinite;
}

@keyframes station-blink {
  50% { opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .sign-station::before {
    animation: none;
  }
}

.sign-hidden-name {
  color: var(--ui-text);
}

.sign-uncharted {
  color: #5b6f88;
  font-size: 6px;
}

.sign-orbit {
  width: 12px;
  height: 12px;
  border: 1px solid var(--ui-line);
  border-radius: 50%;
}

.sign-target {
  width: 12px;
  height: 12px;
  background:
    linear-gradient(var(--ui-text), var(--ui-text)) left top / 4px 2px,
    linear-gradient(var(--ui-text), var(--ui-text)) left top / 2px 4px,
    linear-gradient(var(--ui-text), var(--ui-text)) right top / 4px 2px,
    linear-gradient(var(--ui-text), var(--ui-text)) right top / 2px 4px,
    linear-gradient(var(--ui-text), var(--ui-text)) left bottom / 4px 2px,
    linear-gradient(var(--ui-text), var(--ui-text)) left bottom / 2px 4px,
    linear-gradient(var(--ui-text), var(--ui-text)) right bottom / 4px 2px,
    linear-gradient(var(--ui-text), var(--ui-text)) right bottom / 2px 4px;
  background-repeat: no-repeat;
}

.legend-note {
  --rt-text: var(--ui-text);
  --rt-bright: var(--ui-text);
  --rt-dim: var(--ui-dim);
  --rt-accent: var(--ui-accent);

  font-size: 8px;
  line-height: 14px;
}

.legend-note :deep(.rt-p) {
  margin: 0 0 14px;
}

.legend-section {
  min-width: 0;
}
</style>
