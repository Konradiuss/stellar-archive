<template>
  <div class="wiki-contents">
    <ScrollArea class="wiki-contents-scroll" :bar-inset="[10, 10]">
      <div class="wiki-contents-body">
        <button type="button" class="contents-link contents-top" @click="uiStore.scrollWikiTo(-1)">{{ t('wiki.top') }}</button>
        <ol v-if="toc.length" class="contents-list">
          <li
            v-for="row in rows"
            :key="row.index"
            ref="rowRefs"
            class="contents-row"
            :class="{ 'is-current': row.index === active, 'is-ancestor': ancestors.has(row.index) }"
            :style="{ '--depth': row.depth }"
            :data-index="row.index"
          >
            <button
              v-if="row.hasChildren"
              type="button"
              class="contents-toggle"
              :aria-expanded="!collapsed.has(row.index)"
              :aria-label="collapsed.has(row.index) ? t('wiki.expandSection') : t('wiki.collapseSection')"
              @click="toggle(row.index)"
            >{{ collapsed.has(row.index) ? '[+]' : '[-]' }}</button>
            <span v-else class="contents-toggle is-empty" aria-hidden="true"></span>
            <button
              type="button"
              class="contents-link"
              :aria-current="row.index === active ? 'location' : null"
              @click="uiStore.scrollWikiTo(row.index)"
            >
              <span class="contents-number">{{ row.number }}</span>
              <span class="contents-text">{{ row.text }}</span>
            </button>
          </li>
        </ol>
        <p v-else class="contents-empty">{{ t('wiki.noSections') }}</p>
      </div>
    </ScrollArea>
    <PanelStatusBar>
      <template #left>{{ statusLeft }}</template>
      <template #right>{{ statusRight }}</template>
    </PanelStatusBar>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useUIStore } from '../stores/uiStore'
import PanelStatusBar from './PanelStatusBar.vue'
import ScrollArea from './ScrollArea.vue'
import { scrollIntoNearest } from '../utils/scrollNearest'
import { t } from '../i18n'

const props = defineProps({
  // [{ level, text, anchor, number, depth, parent }] from utils/wikiToc.js
  toc: { type: Array, default: () => [] }
})

const uiStore = useUIStore()
const rowRefs = ref([])

const withChildren = computed(() => new Set(props.toc.map(heading => heading.parent).filter(parent => parent !== null)))

const collapsed = ref(new Set())
watch(() => props.toc, () => { collapsed.value = new Set() })

function toggle(index) {
  const next = new Set(collapsed.value)
  if (next.has(index)) next.delete(index)
  else next.add(index)
  collapsed.value = next
}

function ancestorsOf(index) {
  const result = new Set()
  for (let parent = props.toc[index]?.parent ?? null; parent !== null; parent = props.toc[parent]?.parent ?? null) result.add(parent)
  return result
}

const rows = computed(() => props.toc
  .map((heading, index) => ({ ...heading, index, hasChildren: withChildren.value.has(index) }))
  .filter(row => ![...ancestorsOf(row.index)].some(parent => collapsed.value.has(parent))))

const active = computed(() => (uiStore.wikiActiveSection < props.toc.length ? uiStore.wikiActiveSection : -1))
const ancestors = computed(() => (active.value >= 0 ? ancestorsOf(active.value) : new Set()))

watch(active, index => {
  if (index < 0) return
  const opened = [...ancestors.value].filter(parent => collapsed.value.has(parent))
  if (opened.length) collapsed.value = new Set([...collapsed.value].filter(parent => !opened.includes(parent)))
  nextTick(() => {
    scrollIntoNearest(rowRefs.value.find(row => Number(row.dataset.index) === index))
  })
})

const statusLeft = computed(() => {
  if (!props.toc.length) return t('panels.end')
  return active.value < 0 ? t('wiki.toSection') : t('wiki.section', { number: props.toc[active.value].number })
})
const statusRight = computed(() => (
  active.value < 0 ? t('wiki.sections', { count: props.toc.length }) : `${active.value + 1}/${props.toc.length}`
))
</script>

<style scoped>
.wiki-contents {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.wiki-contents-scroll {
  padding-right: 6px;
}

.wiki-contents-body {
  padding: 10px 0 10px 10px;
  font-family: 'Tiny5', 'Press Start 2P', monospace;
  font-size: 16px;
  line-height: 20px;
}

.contents-list {
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
}

.contents-row {
  display: flex;
  align-items: baseline;
  padding-left: calc(var(--depth) * 12px);
}

.contents-toggle {
  flex-shrink: 0;
  width: 18px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ui-dim);
  font: inherit;
  font-size: 12px;
  text-align: left;
  appearance: none;
  cursor: none;
}

.contents-toggle:hover,
.contents-toggle:focus-visible {
  color: var(--ui-text);
  outline: none;
}

.contents-link {
  display: flex;
  gap: 6px;
  flex: 1;
  min-width: 0;
  padding: 0 4px;
  border: 0;
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  text-align: left;
  appearance: none;
  cursor: none;
}

.contents-number {
  flex-shrink: 0;
  color: var(--ui-dim);
}

.contents-text {
  min-width: 0;
  overflow-wrap: anywhere;
}

.contents-link:hover,
.contents-link:focus-visible {
  background: var(--ui-text);
  color: var(--ui-screen);
  outline: none;
}

.contents-row.is-current .contents-link {
  background: var(--ui-text);
  color: var(--ui-screen);
}

.contents-row.is-ancestor .contents-link {
  background: color-mix(in srgb, var(--ui-line) 60%, var(--ui-screen));
}

.contents-row.is-current .contents-number,
.contents-link:hover .contents-number,
.contents-link:focus-visible .contents-number {
  color: var(--ui-line);
}

.contents-top {
  display: block;
  width: 100%;
  color: var(--ui-dim);
}

.contents-empty {
  margin: 6px 0 0;
  color: var(--ui-dim);
}
</style>
