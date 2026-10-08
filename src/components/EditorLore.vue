<template>
  <section class="editor-card editor-lore" :aria-label="t('editor.lore')">
    <div class="editor-heading">
      {{ t('editor.lore') }}
      <button v-if="file" type="button" class="editor-button is-small lore-open" @click="openFile">{{ t('editor.openFile') }}</button>
    </div>
    <div v-if="loreFile && !file" class="editor-note is-warn lore-outside">{{ t('editor.outsideSite', { file: loreFile }) }}</div>
    <template v-else-if="file">
      <div class="editor-note">{{ t('editor.loreInFile', { file }) }}</div>
      <EditorPreview class="lore-preview is-alone" :text="editor.textOf(file)" :format="format" :star-id="place.star" />
    </template>
    <div v-else class="lore-pair">
      <label class="lore-column">
        <span class="editor-label">{{ t('editor.loreText') }}</span>
        <textarea
          class="editor-input lore-text"
          :aria-label="t('editor.loreLabel', { name: body.name ?? '' })"
          :value="text"
          spellcheck="false"
          @input="type($event.target.value)"
          @change="commit"
        ></textarea>
      </label>
      <EditorPreview class="lore-preview" :text="text" :format="format" :star-id="place.star" />
    </div>
  </section>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { t } from '../i18n'
import { useEditorStore } from '../stores/editorStore'
import EditorPreview from './EditorPreview.vue'
import { detectLoreFormat, normalizeLoreConfig } from '../utils/richText/lore'
import { setBodyField } from '../editor/systemEdits'
import { sitePathOf } from '../editor/siteFiles'

const props = defineProps({
  place: { type: Object, required: true },
  body: { type: Object, required: true }
})

const editor = useEditorStore()
// './lore/a.wiki' → 'lore/a.wiki'
const loreFile = computed(() => (typeof props.body.loreFile === 'string' && props.body.loreFile.trim() ? props.body.loreFile.trim() : null))
const file = computed(() => (loreFile.value ? sitePathOf(loreFile.value) : null))
const format = computed(() => detectLoreFormat(props.body, normalizeLoreConfig(editor.parsed.data?.loreConfig)))

// Also flushed before any other map edit (editorStore.holdSave), while `place`
// still points at this body.
const text = ref(props.body.lore ?? '')
watch(() => props.body.lore, value => {
  if (!timer) text.value = value ?? ''
})
let timer = null

function type(value) {
  text.value = value
  clearTimeout(timer)
  timer = setTimeout(commit, 500)
}

function commit() {
  if (!timer) return
  clearTimeout(timer)
  timer = null
  if ((props.body.lore ?? '') !== text.value) editor.editMap(map => setBodyField(map, props.place, 'lore', text.value))
}
const release = editor.holdSave(commit)

function openFile() {
  editor.current = file.value
  editor.tab = 'files'
}

onUnmounted(() => {
  commit()
  release()
})
</script>

<style scoped>
.lore-pair {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
}

.lore-column {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.lore-text {
  flex: 1;
  min-height: 280px;
  font-family: var(--ed-mono);
  line-height: 20px;
}

.lore-preview {
  height: 330px;
}

.lore-preview.is-alone {
  height: 300px;
}

@media (max-width: 900px) {
  .lore-pair {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
