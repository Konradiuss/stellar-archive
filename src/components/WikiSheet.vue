<template>
  <section class="wiki-sheet" :class="`is-${kind}`" role="dialog" :aria-label="title" @click="closeOnLink">
    <header class="wiki-sheet-head">
      <span class="wiki-sheet-file">{{ kind === 'contents' ? t('files.contents') : t('files.navbox') }}</span>
      <span class="wiki-sheet-title">{{ title }}</span>
      <button ref="closeRef" type="button" class="wiki-sheet-close" :aria-label="t('wiki.closeSheet')" @click="emit('close')">[ X ]</button>
    </header>
    <div class="wiki-sheet-body">
      <WikiContents v-if="kind === 'contents'" :toc="toc" />
      <WikiNavbox v-else :navbox="mapStore.wikiNavbox" :pages="mapStore.wikiIndex.pages" :current-slug="uiStore.wikiPage?.slug ?? null" />
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useMapStore } from '../stores/mapStore'
import { useUIStore } from '../stores/uiStore'
import { collectHeadings } from '../utils/wikiToc'
import { t } from '../i18n'
import WikiContents from './WikiContents.vue'
import WikiNavbox from './WikiNavbox.vue'

const props = defineProps({
  // 'contents' | 'navbox'
  kind: { type: String, required: true }
})
const emit = defineEmits(['close'])

const mapStore = useMapStore()
const uiStore = useUIStore()
const closeRef = ref(null)

const toc = computed(() => collectHeadings(uiStore.wikiPage?.doc))
const title = computed(() => (props.kind === 'contents' ? t('panels.contents') : t('panels.navigation')))

function closeOnLink(event) {
  if (event.target.closest?.('.contents-link, .navbox-link, .portal-link')) emit('close')
}

onMounted(() => closeRef.value?.focus())
</script>

<style scoped>
.wiki-sheet {
  position: absolute;
  inset: 8px;
  z-index: 5;
  display: flex;
  flex-direction: column;
  border: 2px solid var(--ui-text);
  background: var(--ui-screen);
  box-shadow: 0 0 0 4px var(--ui-screen);
  font-family: var(--wiki-font);
  font-size: var(--wiki-ui-size);
  line-height: var(--wiki-ui-line);
}

.wiki-sheet-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-bottom: 2px solid var(--ui-line);
  font-family: var(--font-pixel);
  font-size: 10px;
  line-height: 16px;
}

.wiki-sheet-file {
  padding: 0 4px;
  background: var(--ui-text);
  color: var(--ui-screen);
}

.wiki-sheet-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--ui-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wiki-sheet-close {
  padding: 0 2px;
  border: 0;
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  cursor: none;
}

.wiki-sheet-close:hover,
.wiki-sheet-close:focus-visible {
  background: var(--ui-text);
  color: var(--ui-screen);
  outline: none;
}

.wiki-sheet-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.wiki-sheet-body > * {
  flex: 1;
  min-height: 0;
}
</style>
