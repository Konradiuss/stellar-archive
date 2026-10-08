<template>
  <section class="article-panel world-panel" :aria-label="title">
    <div class="editor-card">
      <div class="editor-heading">{{ t('editor.worldPage', { name: title }) }}</div>
      <div class="editor-hint">{{ t('editor.worldNote', { name: title }) }}</div>
      <div class="world-fields">
        <label class="editor-field">
          <span>{{ t('editor.group') }}</span>
          <select class="editor-input world-group" :value="map.wiki?.worldGroup ?? ''" @change="setGroup($event.target.value)">
            <option value="">{{ t('editor.noGroup') }}</option>
            <option v-for="group in groups" :key="group.id" :value="group.id">{{ '· '.repeat(group.depth) }}{{ group.title }}</option>
          </select>
        </label>
        <div v-if="isHome" class="editor-note world-is-home">{{ t('editor.worldIsHome') }}</div>
        <button v-else type="button" class="editor-button world-make-home" @click="makeHome">{{ t('editor.worldMakeHome') }}</button>
      </div>
    </div>

    <div class="article-body">
      <div class="article-text">
        <span class="file-pane-name">{{ map.worldLoreFile ?? t('editor.inlineText') }}</span>
        <template v-if="map.worldLoreFile">
          <div v-if="!filePath" class="editor-note is-warn file-outside">{{ t('editor.outsideSite', { file: map.worldLoreFile }) }}</div>
          <div v-else-if="editor.readFailure(filePath)" class="file-absent">
            <div class="editor-note is-error file-unread">{{ t('editor.readFailed', { file: filePath, reason: editor.readFailure(filePath) }) }}</div>
            <button type="button" class="editor-button action-retry" @click="editor.retryRead(filePath)">{{ t('editor.retry') }}</button>
          </div>
          <div v-else-if="editor.isReading(filePath)" class="editor-note file-reading">{{ t('editor.reading', { file: filePath }) }}</div>
          <div v-else-if="!editor.exists(filePath)" class="file-absent">
            <div class="editor-note">{{ t('editor.missing') }}: {{ filePath }}</div>
            <button type="button" class="editor-button action-create" @click="editor.create(filePath)">{{ t('editor.create') }}</button>
          </div>
          <EditorTextArea
            v-else
            class="article-area world-area"
            :model-value="editor.textOf(filePath)"
            :label="t('editor.articleText', { title })"
            wrap
            @update:model-value="editor.setText(filePath, $event)"
          />
        </template>
        <EditorTextArea
          v-else
          class="article-area world-area"
          :model-value="inlineText"
          :label="t('editor.articleText', { title })"
          wrap
          @update:model-value="typeInline"
        />
      </div>
      <EditorPreview class="article-preview" :text="bodyText" :format="format" />
    </div>
  </section>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { t } from '../i18n'
import { useEditorStore } from '../stores/editorStore'
import EditorTextArea from './EditorTextArea.vue'
import EditorPreview from './EditorPreview.vue'
import { setHome, setWorldGroup, setWorldLore, wikiGroups } from '../editor/articleEdits'
import { sitePathOf } from '../editor/siteFiles'
import { detectLoreFormat, normalizeLoreConfig } from '../utils/richText/lore'
import { worldPageTitle } from '../utils/wikiPages'

const editor = useEditorStore()
const map = computed(() => editor.parsed.data ?? {})
const groups = computed(() => wikiGroups(map.value))
const title = computed(() => worldPageTitle())
const isHome = computed(() => !map.value.wiki?.home)
const format = computed(() => detectLoreFormat({ loreFormat: map.value.worldLoreFormat, loreFile: map.value.worldLoreFile }, normalizeLoreConfig(map.value.loreConfig)))

const setGroup = id => editor.editMap(text => setWorldGroup(text, id || null))
const makeHome = () => editor.editMap(text => setHome(text, null))

const inlineText = ref('')
let timer = null

function saveInline() {
  if (timer === null) return
  clearTimeout(timer)
  timer = null
  editor.editMap(text => setWorldLore(text, inlineText.value))
}
const release = editor.holdSave(saveInline)

watch(() => map.value.worldLore, value => {
  if (timer === null) inlineText.value = typeof value === 'string' ? value : ''
}, { immediate: true })

function typeInline(value) {
  inlineText.value = value
  clearTimeout(timer)
  timer = setTimeout(saveInline, 500)
}
onUnmounted(() => {
  saveInline()
  release()
})

const filePath = computed(() => (map.value.worldLoreFile ? sitePathOf(map.value.worldLoreFile) : null))
const bodyText = computed(() => (map.value.worldLoreFile ? (filePath.value ? editor.textOf(filePath.value) : '') : inlineText.value))
</script>

<style scoped>
.world-fields {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px 16px;
  margin-top: 12px;
}

.world-fields .editor-field {
  flex: 0 1 260px;
}
</style>
