<template>
  <!-- Its own component: the card is drawn a moment after an edit, and redrawing the form
       would put the map's values back into fields still being typed in. -->
  <figure class="site-share" :aria-label="t('editor.siteShare')">
    <figcaption class="editor-label">{{ t('editor.siteShare') }}</figcaption>
    <div class="share-card">
      <div v-if="ownPicture" class="share-picture share-own">{{ t('editor.siteShareOwn', { file: ownPicture }) }}</div>
      <!-- cardSvg escapes every text it writes. -->
      <div v-else-if="card" class="share-picture" v-html="card.svg"></div>
      <div class="share-text">
        <div class="share-domain">{{ domain }}</div>
        <div class="share-title">{{ card?.title ?? '' }}</div>
        <div class="share-description">{{ card?.description || t('editor.siteShareEmpty') }}</div>
      </div>
    </div>
  </figure>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { t } from '../i18n'
import { useEditorStore } from '../stores/editorStore'
import { siteCard } from '../editor/siteCard'

const CARD_DELAY_MS = 500

const editor = useEditorStore()
const site = computed(() => (editor.parsed.data?.site && typeof editor.parsed.data.site === 'object' ? editor.parsed.data.site : {}))
const ownPicture = computed(() => (typeof site.value.preview === 'string' && site.value.preview.trim() ? site.value.preview.trim() : null))
const domain = computed(() => {
  try {
    return new URL(site.value.url).host
  } catch {
    return t('editor.siteShareNoUrl')
  }
})

const card = ref(null)
let timer = null
const readText = path => (editor.exists(path) ? editor.textOf(path) : null)
watch(() => editor.mapText, () => {
  clearTimeout(timer)
  timer = setTimeout(() => { card.value = editor.parsed.data ? siteCard(editor.parsed.data, readText) : null }, card.value ? CARD_DELAY_MS : 0)
}, { immediate: true })
onUnmounted(() => clearTimeout(timer))
</script>

<style scoped>
.site-share {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  min-width: 0;
}

.share-card {
  overflow: hidden;
  border: 1px solid var(--ed-border);
  border-radius: 8px;
}

.share-picture {
  aspect-ratio: 1200 / 630;
  background: #000;
}

.share-picture :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}

.share-own {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  color: #ccc;
  text-align: center;
  overflow-wrap: anywhere;
}

.share-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
}

.share-domain {
  font-size: 12px;
  color: var(--ed-muted);
  text-transform: uppercase;
}

.share-title {
  font-weight: 600;
}

.share-description {
  font-size: 13px;
  color: var(--ed-muted);
}
</style>
