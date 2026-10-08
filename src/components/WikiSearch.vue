<template>
  <div class="wiki-search" @keydown="handleKey">
    <label class="search-line">
      <span class="search-prompt">C:\WIKI&gt; {{ t('wiki.searchPrompt') }}</span>
      <input
        ref="inputRef"
        v-model="query"
        class="search-input"
        type="text"
        spellcheck="false"
        autocomplete="off"
        :aria-label="t('wiki.searchAria')"
        role="combobox"
        :aria-expanded="suggestions.length > 0"
        aria-autocomplete="list"
        :aria-controls="suggestions.length ? 'wiki-search-suggestions' : null"
        :aria-activedescendant="suggestions.length && active >= 0 ? `wiki-search-option-${active}` : null"
        @blur="handleBlur"
      />
    </label>
    <ul v-if="suggestions.length" id="wiki-search-suggestions" class="search-suggestions" role="listbox">
      <li
        v-for="(item, index) in suggestions"
        :id="`wiki-search-option-${index}`"
        :key="item.page.slug"
        role="option"
        class="search-suggestion"
        :class="{ 'is-active': index === active }"
        :aria-selected="index === active"
        @pointerdown.prevent="go(item.page.slug)"
        @pointerenter="active = index"
      >
        <span class="suggestion-title">{{ item.page.title }}</span>
        <span v-if="item.alias" class="suggestion-note">← {{ item.alias }}</span>
        <span v-if="KIND_TAGS.includes(item.page.tag)" class="suggestion-note">{{ t(`kinds.${item.page.tag}`) }}</span>
      </li>
      <li
        :id="`wiki-search-option-${suggestions.length}`"
        role="option"
        class="search-suggestion is-everywhere"
        :class="{ 'is-active': active === suggestions.length }"
        :aria-selected="active === suggestions.length"
        @pointerdown.prevent="go(searchSlug(query))"
        @pointerenter="active = suggestions.length"
      >{{ t('wiki.searchAll', { query: query.trim() }) }}</li>
    </ul>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useMapStore } from '../stores/mapStore'
import { useUIStore } from '../stores/uiStore'
import { searchSlug, suggestPages } from '../utils/wikiService'
import { t } from '../i18n'

const KIND_TAGS = ['world', 'star', 'planet', 'moon', 'station']

const emit = defineEmits(['close'])

const mapStore = useMapStore()
const uiStore = useUIStore()
const inputRef = ref(null)
const query = ref('')
// -1: none (Enter then goes by the text itself)
const active = ref(-1)

const suggestions = computed(() => suggestPages(mapStore.wikiIndex, query.value))
watch(query, () => { active.value = -1 })

function go(slug) {
  uiStore.openWiki(slug)
  emit('close')
}

function submit() {
  const text = query.value.trim()
  if (!text) return emit('close')
  if (active.value >= 0 && active.value < suggestions.value.length) return go(suggestions.value[active.value].page.slug)
  if (active.value === suggestions.value.length) return go(searchSlug(text))
  const page = mapStore.wikiIndex.get(text) ?? mapStore.wikiIndex.find(text)
  go(page ? page.slug : searchSlug(text))
}

function handleKey(event) {
  const lines = suggestions.value.length ? suggestions.value.length + 1 : 0
  switch (event.key) {
    case 'Enter':
      submit()
      break
    case 'Escape':
      emit('close')
      break
    case 'ArrowDown':
      if (lines) active.value = (active.value + 1) % lines
      break
    case 'ArrowUp':
      if (lines) active.value = active.value <= 0 ? lines - 1 : active.value - 1
      break
    default:
      return
  }
  event.preventDefault()
  event.stopPropagation()
}

// The suggestions act on pointerdown, before this blur closes the line.
function handleBlur() {
  emit('close')
}

onMounted(async () => {
  await nextTick()
  inputRef.value?.focus()
})
</script>

<style scoped>
.wiki-search {
  position: relative;
}

.search-line {
  display: flex;
  align-items: baseline;
  gap: 8px;
  color: var(--ui-text);
  font-size: 8px;
  line-height: 14px;
}

.search-prompt {
  flex-shrink: 0;
  color: var(--ui-dim);
}

.search-input {
  flex: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  border-bottom: 1px dashed var(--ui-dim);
  background: transparent;
  color: var(--ui-text);
  caret-color: var(--ui-text);
  font: inherit;
  outline: none;
  cursor: none;
}

.search-suggestions {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 5;
  min-width: min(420px, 100%);
  margin: 0;
  padding: 4px 0;
  border: 4px double var(--ui-dim);
  background: var(--ui-screen);
  list-style: none;
  font-family: var(--wiki-font);
  font-size: var(--wiki-ui-size);
  line-height: var(--wiki-ui-line);
}

.search-suggestion {
  display: flex;
  gap: 10px;
  padding: 0 10px;
  color: var(--ui-text);
  white-space: nowrap;
  cursor: none;
}

.suggestion-title {
  overflow: hidden;
  text-overflow: ellipsis;
}

.suggestion-note {
  flex-shrink: 0;
  color: var(--ui-dim);
}

.search-suggestion.is-everywhere {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px dashed var(--ui-line);
  color: var(--ui-dim);
}

.search-suggestion.is-active {
  background: var(--ui-text);
  color: var(--ui-screen);
}

.search-suggestion.is-active .suggestion-note {
  color: var(--ui-line);
}
</style>
