<template>
  <div class="text-source">
    <div class="source-bar">
      <label class="editor-field source-where-field">
        <span>{{ t('editor.sourceWhere') }}</span>
        <select class="editor-input source-where" :value="source.file !== null ? 'file' : 'map'" :disabled="outside" @change="setWhere($event.target.value)">
          <option value="map">{{ t('editor.sourceInMap') }}</option>
          <option value="file">{{ t('editor.sourceInFile') }}</option>
        </select>
      </label>
      <label v-if="source.file !== null" class="editor-field source-file-field">
        <span>{{ t('editor.sourceFile') }}</span>
        <input class="editor-input is-code source-file" :value="source.file" spellcheck="false" @change="moveFile($event)" @keydown.enter="$event.target.blur()" />
      </label>
      <label class="editor-field source-format-field">
        <span>{{ t('editor.format') }}</span>
        <select class="editor-input source-format" :value="source.format ?? ''" @change="setFormat($event.target.value)">
          <option value="">{{ t('editor.autoValue', { value: formatName(autoFormat) }) }}</option>
          <option v-for="each in LORE_FORMATS" :key="each" :value="each">{{ formatName(each) }}</option>
          <option v-if="unknownFormat" :value="source.format">? {{ source.format }}</option>
        </select>
      </label>
      <button v-if="file" type="button" class="editor-button is-small source-open" @click="openFile">{{ t('editor.openFile') }}</button>
    </div>
    <div v-if="source.file !== null && source.text" class="editor-hint source-fallback">{{ t('editor.sourceFallback') }}</div>

    <div class="article-body source-body" :class="{ 'is-compact': compact }">
      <div class="article-text">
        <span class="editor-label">{{ t('editor.sourceText') }}</span>
        <template v-if="source.file !== null">
          <div v-if="outside" class="editor-note is-warn file-outside">{{ t('editor.outsideSite', { file: source.file }) }}</div>
          <div v-else-if="editor.readFailure(file)" class="file-absent">
            <div class="editor-note is-error file-unread">{{ t('editor.readFailed', { file, reason: editor.readFailure(file) }) }}</div>
            <button type="button" class="editor-button action-retry" @click="editor.retryRead(file)">{{ t('editor.retry') }}</button>
          </div>
          <div v-else-if="editor.isReading(file)" class="editor-note file-reading">{{ t('editor.reading', { file }) }}</div>
          <div v-else-if="!editor.exists(file)" class="file-absent">
            <div class="editor-note">{{ t('editor.missing') }}: {{ file }}</div>
            <button type="button" class="editor-button action-create" @click="editor.create(file)">{{ t('editor.create') }}</button>
          </div>
          <EditorTextArea
            v-else
            :class="['article-area', areaClass]"
            :model-value="editor.textOf(file)"
            :label="label"
            wrap
            @update:model-value="editor.setText(file, $event)"
          />
        </template>
        <EditorTextArea
          v-else
          :class="['article-area', areaClass]"
          :model-value="inline"
          :label="label"
          wrap
          @update:model-value="type"
        />
      </div>
      <EditorPreview class="article-preview" :text="shownText" :format="format" :star-id="starId" />
    </div>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { t } from '../i18n'
import { useEditorStore } from '../stores/editorStore'
import EditorTextArea from './EditorTextArea.vue'
import EditorPreview from './EditorPreview.vue'
import { LORE_FORMATS, detectLoreFormat, normalizeLoreConfig } from '../utils/richText/lore'
import { isOutsideFile, moveSourceFile, setSourceFormat, setSourceText, sourceOf, sourceToFile, sourceToMap, suggestSourceFile } from '../editor/textSources'
import { sitePathOf } from '../editor/siteFiles'

const props = defineProps({
  // See textSources.js; a new owner is a new component (:key), so a typed text goes where it was typed.
  owner: { type: Object, required: true },
  label: { type: String, default: '' },
  starId: { type: String, default: null },
  areaClass: { type: String, default: '' },
  compact: { type: Boolean, default: false }
})

const editor = useEditorStore()
const map = computed(() => editor.parsed.data ?? {})
const source = computed(() => sourceOf(map.value, props.owner))
const outside = computed(() => isOutsideFile(source.value.file))
const file = computed(() => (source.value.file !== null ? sitePathOf(source.value.file) : null))
const config = computed(() => normalizeLoreConfig(map.value.loreConfig))
const autoFormat = computed(() => detectLoreFormat({ loreFile: source.value.file ?? undefined }, config.value))
const format = computed(() => detectLoreFormat({ loreFormat: source.value.format ?? undefined, loreFile: source.value.file ?? undefined }, config.value))
const unknownFormat = computed(() => !!source.value.format && !LORE_FORMATS.includes(source.value.format))
const formatName = value => t(value === 'markdown' ? 'editor.formatMarkdown' : 'editor.formatWikitext')

// Typed text waits a moment before it goes into the map; any other edit writes it first (holdSave).
const inline = ref(source.value.text ?? '')
let timer = null
watch(() => source.value.text, value => {
  if (!timer) inline.value = value ?? ''
})

function type(value) {
  inline.value = value
  clearTimeout(timer)
  timer = setTimeout(commit, 500)
}

function commit() {
  if (!timer) return
  clearTimeout(timer)
  timer = null
  if ((source.value.text ?? '') !== inline.value) editor.editMap(text => setSourceText(text, props.owner, inline.value))
}
const release = editor.holdSave(commit)
onUnmounted(() => {
  commit()
  release()
})

const shownText = computed(() => (source.value.file !== null ? (file.value && editor.exists(file.value) ? editor.textOf(file.value) : '') : inline.value))

function setWhere(where) {
  if (where === 'file') {
    commit()
    const path = suggestSourceFile(map.value, props.owner, format.value, editor.exists)
    editor.editMap(text => sourceToFile(text, props.owner, path, inline.value))
  } else if (file.value) {
    const fileText = editor.exists(file.value) ? editor.textOf(file.value) : ''
    editor.editMap(text => sourceToMap(text, props.owner, fileText))
  }
}

function moveFile(event) {
  const path = event.target.value.trim()
  if (path === source.value.file) return
  const fileText = file.value && editor.exists(file.value) ? editor.textOf(file.value) : ''
  if (!editor.editMap(text => moveSourceFile(text, props.owner, path, fileText))) event.target.value = source.value.file
}

const setFormat = value => editor.editMap(text => setSourceFormat(text, props.owner, value))

function openFile() {
  editor.current = file.value
  editor.tab = 'files'
}
</script>

<style scoped>
.text-source {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.source-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px 14px;
}

.source-where-field,
.source-format-field {
  flex: 0 1 200px;
}

.source-file-field {
  flex: 1 1 240px;
}

.source-body.is-compact {
  height: 330px;
}

@media (max-width: 900px) {
  .source-body.is-compact {
    height: auto;
  }
}
</style>
