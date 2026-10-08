<template>
  <div class="wiki-navbox">
    <ScrollArea class="wiki-navbox-scroll" :bar-inset="[8, 8]">
      <div ref="bodyRef" class="wiki-navbox-body">
        <div v-if="navbox.home" class="navbox-head">
          <span class="navbox-rule" aria-hidden="true"></span>
          <button
            type="button"
            class="navbox-link navbox-home"
            :class="{ 'is-current': navbox.home.slug === currentSlug }"
            :aria-current="navbox.home.slug === currentSlug ? 'page' : null"
            @click="open(navbox.home)"
          >{{ navbox.home.title }}</button>
          <span class="navbox-rule" aria-hidden="true"></span>
        </div>
        <div class="navbox-grid">
          <div
            v-for="row in rows"
            :key="row.group.id"
            class="navbox-row"
            :class="{ 'is-top': row.depth === 0, 'is-inside': row.group.slugs.has(currentSlug) }"
            :style="{ '--depth': row.depth }"
            :data-group="row.group.id"
          >
            <div class="navbox-group">
              <button
                v-if="row.depth === 0"
                type="button"
                class="navbox-toggle"
                :aria-expanded="!row.folded"
                :aria-label="row.folded ? t('wiki.expandGroup') : t('wiki.collapseGroup')"
                @click="toggle(row.group.id)"
              >{{ row.folded ? '[+]' : '[-]' }}</button>
              <span
                v-if="row.group.color"
                class="navbox-sign"
                :style="{ borderColor: row.group.color, '--sign-fill': row.group.color }"
                aria-hidden="true"
              ></span>
              <span v-else-if="row.depth > 0" class="navbox-branch" aria-hidden="true"></span>
              <button
                v-if="row.group.page"
                type="button"
                class="navbox-link navbox-title"
                :class="{ 'is-current': row.group.page.slug === currentSlug }"
                @click="open(row.group.page)"
              >{{ row.group.title }}</button>
              <span v-else class="navbox-title">{{ row.group.title }}</span>
            </div>
            <div class="navbox-list">
              <span v-if="row.folded || !row.words.length" class="navbox-count">{{ t('wiki.groupPages', { count: row.group.slugs.size }) }}</span>
              <template v-else>
                <!-- Words do not break inside: a line wraps only after a dot or comma -->
                <template v-for="(word, wordIndex) in row.words" :key="wordIndex">
                  {{ wordIndex ? ' ' : '' }}<span class="navbox-word">
                    <template v-for="(token, position) in word" :key="position">
                      <button
                        v-if="token.page"
                        type="button"
                        class="navbox-link"
                        :class="{ 'is-current': token.page.slug === currentSlug, 'is-inner': token.depth > 0 }"
                        :aria-current="token.page.slug === currentSlug ? 'page' : null"
                        @click="open(token.page)"
                      >{{ token.text }}</button>
                      <span v-else-if="'page' in token" class="navbox-name">{{ token.text }}</span>
                      <span v-else class="navbox-mark">{{ token.text }}</span>
                    </template>
                  </span>
                </template>
              </template>
            </div>
          </div>
        </div>
      </div>
    </ScrollArea>
    <PanelStatusBar>
      <template #left>{{ statusLeft }}</template>
      <template #right>{{ t('wiki.navboxPages', { count: pages.length }) }}</template>
    </PanelStatusBar>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useUIStore } from '../stores/uiStore'
import { navboxWords } from '../utils/wikiNavbox'
import PanelStatusBar from './PanelStatusBar.vue'
import ScrollArea from './ScrollArea.vue'
import { scrollIntoNearest } from '../utils/scrollNearest'
import { t } from '../i18n'

const props = defineProps({
  // { home, groups } from utils/wikiNavbox.js
  navbox: { type: Object, default: () => ({ home: null, groups: [] }) },
  pages: { type: Array, default: () => [] },
  currentSlug: { type: String, default: null }
})

const uiStore = useUIStore()
const bodyRef = ref(null)

function open(page) {
  uiStore.openWiki(page.slug)
}

const collapsed = ref(new Set())
watch(() => props.navbox, () => { collapsed.value = new Set() })

function toggle(id) {
  const next = new Set(collapsed.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  collapsed.value = next
}

const rows = computed(() => {
  const result = []
  const walk = (group, depth, folded) => {
    result.push({ group, depth, folded, words: navboxWords(group.items) })
    if (!folded) group.groups.forEach(inner => walk(inner, depth + 1, false))
  }
  props.navbox.groups.forEach(group => walk(group, 0, collapsed.value.has(group.id)))
  return result
})

const statusLeft = computed(() => {
  const trail = []
  let groups = props.navbox.groups
  for (let group; (group = groups.find(inner => inner.slugs.has(props.currentSlug))); groups = group.groups) {
    trail.push(group.title.toUpperCase())
  }
  return trail.length ? trail.join(' › ') : t('wiki.navigation')
})

function showCurrent() {
  const opened = props.navbox.groups.filter(group => group.slugs.has(props.currentSlug) && collapsed.value.has(group.id))
  if (opened.length) collapsed.value = new Set([...collapsed.value].filter(id => !opened.some(group => group.id === id)))
  nextTick(() => {
    scrollIntoNearest(bodyRef.value?.querySelector('.navbox-list .navbox-link.is-current'))
  })
}

watch(() => props.currentSlug, showCurrent)
onMounted(showCurrent)
</script>

<style scoped>
.wiki-navbox {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.wiki-navbox-scroll {
  padding-right: 6px;
}

.wiki-navbox-body {
  padding: 6px 0 8px 10px;
  font-size: 8px;
  line-height: 14px;
  container-type: inline-size;
}

.navbox-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.navbox-rule {
  flex: 1;
  min-width: 8px;
  height: 2px;
  background: repeating-linear-gradient(90deg, var(--ui-line) 0 2px, transparent 2px 6px);
}

.navbox-grid {
  display: grid;
  grid-template-columns: fit-content(32%) 1fr;
  column-gap: 16px;
}

.navbox-row {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: subgrid;
  padding: 2px 0;
}

.navbox-row + .navbox-row.is-top {
  margin-top: 2px;
  padding-top: 4px;
  background: repeating-linear-gradient(90deg, color-mix(in srgb, var(--ui-line) 60%, var(--ui-screen)) 0 2px, transparent 2px 6px) top / 100% 2px no-repeat;
}

.navbox-group {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  padding-left: calc(var(--depth) * 12px);
  color: var(--ui-dim);
}

.navbox-row.is-top .navbox-title {
  text-transform: uppercase;
}

.navbox-row.is-inside > .navbox-group {
  color: var(--ui-text);
}

.navbox-toggle {
  flex-shrink: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ui-dim);
  font: inherit;
  appearance: none;
  cursor: none;
}

.navbox-toggle:hover,
.navbox-toggle:focus-visible {
  color: var(--ui-text);
  outline: none;
}

.navbox-sign {
  flex-shrink: 0;
  align-self: flex-start;
  margin-top: 3px;
  width: 4px;
  height: 4px;
  border: 2px solid;
  background: color-mix(in srgb, var(--sign-fill) 40%, transparent);
}

.navbox-branch {
  flex-shrink: 0;
  align-self: flex-start;
  margin-top: 2px;
  width: 6px;
  height: 6px;
  border-left: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
}

.navbox-title {
  min-width: 0;
  overflow-wrap: anywhere;
}

.navbox-list {
  min-width: 0;
  color: var(--ui-text);
}

.navbox-word {
  white-space: nowrap;
}

.navbox-link {
  display: inline;
  padding: 0 2px;
  border: 0;
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  line-height: inherit;
  text-align: left;
  white-space: nowrap;
  appearance: none;
  cursor: none;
}

.navbox-link.is-inner {
  color: #cfcfcf;
}

.navbox-group .navbox-link {
  color: inherit;
  white-space: normal;
  overflow-wrap: anywhere;
}

.navbox-link:hover,
.navbox-link:focus-visible,
.navbox-link.is-current,
.navbox-group .navbox-link:hover,
.navbox-group .navbox-link:focus-visible,
.navbox-group .navbox-link.is-current {
  background: var(--ui-text);
  color: var(--ui-screen);
  outline: none;
}

.navbox-name {
  padding: 0 2px;
  color: color-mix(in srgb, var(--ui-dim) 49%, var(--ui-line));
  white-space: nowrap;
}

.navbox-mark,
.navbox-count {
  color: var(--ui-dim);
}

@container (max-width: 420px) {
  .navbox-grid,
  .navbox-row {
    display: block;
  }

  .navbox-list {
    padding-left: calc(var(--depth) * 12px + 12px);
  }
}
</style>
