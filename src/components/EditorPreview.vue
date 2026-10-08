<template>
  <section class="editor-preview" :aria-label="t('editor.previewHeading')">
    <span v-if="label" class="editor-label">{{ t('editor.previewHeading') }}</span>
    <div class="editor-preview-page" @click.capture.stop.prevent>
      <RichText v-if="doc" class="wiki-text reading-text" :lang="language()" :doc="doc" wiki />
    </div>
  </section>
</template>

<script setup>
import { onUnmounted, shallowRef, watch } from 'vue'
import { language, t } from '../i18n'
import { useEditorStore } from '../stores/editorStore'
import RichText from './RichText.vue'
import { createPageFinder, normalizeLoreConfig, parseLore, resolveLoreDocument, wikiLinkTargets } from '../utils/richText/lore'
import { MAP_FILE, checkMap } from '../utils/mapCheck'
import { collectMapNotes } from '../utils/mapJournal'
import { normalizeWiki } from '../utils/wikiPages'

const props = defineProps({
  text: { type: String, default: '' },
  label: { type: Boolean, default: true },
  format: { type: String, default: 'wikitext' },
  starId: { type: String, default: null }
})

const editor = useEditorStore()
const doc = shallowRef(null)
let timer = null

function draw() {
  const raw = editor.parsed.data ?? null
  const { result } = collectMapNotes(() => {
    const data = raw ? checkMap(raw).data ?? null : null
    const wiki = normalizeWiki(data?.wiki)
    const config = normalizeLoreConfig(data?.loreConfig)
    const findPage = createPageFinder(data?.stars ?? [], data?.systems ?? {}, wikiLinkTargets({ ...(data ?? {}), wiki }))
    const parsed = parseLore(props.text, props.format)
    return resolveLoreDocument(parsed, { config, baseUrl: new URL(MAP_FILE, document.baseURI).href, findPage, contextStarId: props.starId })
  })
  doc.value = result
}

watch(() => [props.text, props.format, props.starId, editor.parsed], () => {
  clearTimeout(timer)
  timer = setTimeout(draw, doc.value ? 250 : 0)
}, { immediate: true })
onUnmounted(() => clearTimeout(timer))
</script>

<style scoped>
.editor-preview {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.editor-preview-page {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 14px 16px;
  border: 1px solid var(--ed-border);
  border-radius: var(--ed-radius);
  color: var(--ui-text);
  background: var(--ui-screen);
}
</style>
