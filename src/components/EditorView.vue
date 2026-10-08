<template>
  <div class="editor-view">
    <header class="editor-bar">
      <h1 class="editor-title">{{ t('editor.title') }}</h1>
      <nav class="editor-tabs">
        <button type="button" class="editor-tab tab-files" :class="{ 'is-active': editor.tab === 'files' }" @click="editor.tab = 'files'">{{ t('editor.tabFiles') }}</button>
        <button type="button" class="editor-tab tab-stars" :class="{ 'is-active': editor.tab === 'stars' }" @click="editor.tab = 'stars'">{{ t('editor.tabGalaxy') }}</button>
        <button type="button" class="editor-tab tab-system" :class="{ 'is-active': editor.tab === 'system' }" @click="editor.tab = 'system'">{{ t('editor.tabSystem') }}</button>
        <button type="button" class="editor-tab tab-articles" :class="{ 'is-active': editor.tab === 'articles' }" @click="editor.tab = 'articles'">{{ t('editor.tabArticles') }}</button>
        <button type="button" class="editor-tab tab-main" :class="{ 'is-active': editor.tab === 'main' }" @click="editor.tab = 'main'">{{ t('editor.tabMain') }}</button>
        <button type="button" class="editor-tab tab-site" :class="{ 'is-active': editor.tab === 'site' }" @click="editor.tab = 'site'">{{ t('editor.tabSite') }}</button>
        <button type="button" class="editor-tab tab-theme" :class="{ 'is-active': editor.tab === 'theme' }" @click="editor.tab = 'theme'">{{ t('editor.tabTheme') }}</button>
        <button type="button" class="editor-tab tab-sounds" :class="{ 'is-active': editor.tab === 'sounds' }" @click="editor.tab = 'sounds'">{{ t('editor.tabSounds') }}</button>
        <button type="button" class="editor-tab tab-music" :class="{ 'is-active': editor.tab === 'music' }" @click="editor.tab = 'music'">{{ t('editor.tabMusic') }}</button>
        <button type="button" class="editor-tab tab-loader" :class="{ 'is-active': editor.tab === 'loader' }" @click="editor.tab = 'loader'">{{ t('editor.tabLoader') }}</button>
        <button type="button" class="editor-tab tab-texts" :class="{ 'is-active': editor.tab === 'texts' }" @click="editor.tab = 'texts'">{{ t('editor.tabTexts') }}</button>
      </nav>
      <span class="editor-changed" :class="{ 'is-changed': changedCount }">{{ changedCount ? t('editor.changed', { count: changedCount }) : t('editor.unchanged') }}</span>
      <div class="editor-bar-actions">
        <button type="button" class="editor-button action-preview" :disabled="!ready" @click="editor.preview()">{{ t('editor.preview') }}</button>
        <button type="button" class="editor-button action-download" :disabled="!changedCount" @click="editor.download()">{{ t('editor.download') }}</button>
        <button type="button" class="editor-button is-primary action-publish" :disabled="!changedCount" @click="publishing = true">{{ t('editor.publish') }}</button>
        <button type="button" class="editor-button is-quiet action-site" @click="editor.toSite()">{{ t('editor.toSite') }}</button>
      </div>
    </header>

    <div v-if="!editor.draftKept" class="editor-banner is-error editor-not-kept">{{ t('editor.draftNotKept') }}</div>
    <div v-else-if="editor.otherTabFiles.length" class="editor-banner is-error editor-other-tab" role="alert" @click="editor.otherTabFiles = []">{{ t('editor.otherTab', { files: editor.otherTabFiles.join(', ') }) }}</div>
    <div v-else></div>

    <main v-if="editor.status === 'loading'" class="editor-main editor-loading">{{ t('editor.loading', { file: 'map.json' }) }}</main>
    <main v-else-if="editor.status === 'failed'" class="editor-main editor-failed is-error">{{ editor.loadError }}</main>

    <main v-else-if="editor.tab === 'files'" class="editor-main editor-files">
      <div class="editor-split">
        <nav class="editor-side" :aria-label="t('editor.tabFiles')">
          <div class="editor-list file-list">
            <button
              v-for="file in editor.files"
              :key="file.path"
              type="button"
              class="editor-list-item is-code file-item"
              :class="{ 'is-current': file.path === editor.current, 'is-changed': editor.isChanged(file.path), 'is-deleted': editor.isDeleted(file.path), 'is-missing': isMissing(file.path) }"
              :data-path="file.path"
              :title="file.path"
              @click="editor.current = file.path"
            >
              <span class="file-name">{{ file.path }}</span>
              <span v-if="editor.isDeleted(file.path)" class="file-state file-deleted">✕</span>
              <span v-else-if="isMissing(file.path)" class="file-state file-missing">{{ t('editor.missing') }}</span>
              <span v-else-if="editor.isChanged(file.path)" class="file-state" aria-hidden="true"></span>
            </button>
          </div>
          <template v-if="changedCount">
            <button v-if="!confirmDiscard" type="button" class="editor-button is-danger action-discard" @click="confirmDiscard = true">{{ t('editor.discard') }}</button>
            <div v-else class="editor-confirm" role="alertdialog">
              <div>{{ t('editor.confirmDiscard') }}</div>
              <div class="editor-actions">
                <button type="button" class="editor-button is-danger confirm-yes" @click="discard">{{ t('editor.yes') }}</button>
                <button type="button" class="editor-button" @click="confirmDiscard = false">{{ t('editor.no') }}</button>
              </div>
            </div>
          </template>
        </nav>
        <section class="file-pane">
          <div class="file-pane-bar">
            <span class="file-pane-name">{{ editor.current }}</span>
            <div class="editor-actions">
              <button v-if="canPreview" type="button" class="editor-button is-small action-preview-file" @click="filePreview = !filePreview">{{ filePreview ? t('editor.hidePreview') : t('editor.showPreview') }}</button>
              <button v-if="editor.isChanged(editor.current) && !editor.isDeleted(editor.current)" type="button" class="editor-button is-small action-revert" @click="editor.revert(editor.current)">{{ t('editor.revert') }}</button>
            </div>
          </div>
          <div v-if="editor.isDeleted(editor.current)" class="file-absent">
            <div class="editor-note is-warn">✕ {{ editor.current }}: {{ t('editor.willDelete') }}</div>
            <button type="button" class="editor-button action-keep" @click="editor.revert(editor.current)">{{ t('editor.keepFile') }}</button>
          </div>
          <div v-else-if="editor.readFailure(editor.current)" class="file-absent">
            <div class="editor-note is-error file-unread">{{ t('editor.readFailed', { file: editor.current, reason: editor.readFailure(editor.current) }) }}</div>
            <button type="button" class="editor-button action-retry" @click="editor.retryRead(editor.current)">{{ t('editor.retry') }}</button>
          </div>
          <div v-else-if="editor.isReading(editor.current)" class="file-absent">
            <div class="editor-note file-reading">{{ t('editor.reading', { file: editor.current }) }}</div>
          </div>
          <div v-else-if="isMissing(editor.current)" class="file-absent">
            <div class="editor-note">{{ t('editor.missing') }}: {{ editor.current }}</div>
            <button v-if="!isBinaryPath(editor.current)" type="button" class="editor-button action-create" @click="editor.create(editor.current)">{{ t('editor.create') }}</button>
          </div>
          <div v-else-if="isBinaryPath(editor.current)" class="file-absent" :class="isImagePath(editor.current) ? 'file-picture' : 'file-sound'">
            <div v-if="editor.lostFiles.includes(editor.current)" class="editor-note is-error file-lost">{{ t('editor.binaryGone') }}</div>
            <template v-else-if="isImagePath(editor.current)">
              <EditorThumb class="file-picture-image" :source="editor.current" />
              <div class="editor-note">{{ t('editor.pictureFileNote', { size: soundSize }) }}</div>
            </template>
            <template v-else>
              <div class="editor-note">{{ t('editor.soundFileNote', { size: soundSize }) }}</div>
              <button type="button" class="editor-button action-play" data-sfx="none" @click="playFile">▶</button>
            </template>
          </div>
          <div v-else class="file-pair" :class="{ 'has-preview': showFilePreview }">
            <EditorTextArea
              :model-value="editor.textOf(editor.current)"
              :label="t('editor.fileLabel', { file: editor.current })"
              :show="place"
              :wrap="isProse(editor.current)"
              @update:model-value="editor.setText(editor.current, $event)"
            />
            <EditorPreview v-if="showFilePreview" class="file-preview" :label="false" :text="editor.textOf(editor.current)" :format="fileFormat" />
          </div>
        </section>
      </div>
    </main>

    <main v-else class="editor-main editor-forms">
      <div v-if="!editor.formsOpen" class="editor-note is-warn forms-blocked">{{ t('editor.formsBlocked') }}</div>
      <EditorStars v-else-if="editor.tab === 'stars'" />
      <EditorSystem v-else-if="editor.tab === 'system'" />
      <EditorArticles v-else-if="editor.tab === 'articles'" />
      <EditorMainPage v-else-if="editor.tab === 'main'" />
      <EditorSite v-else-if="editor.tab === 'site'" />
      <EditorTheme v-else-if="editor.tab === 'theme'" />
      <EditorSounds v-else-if="editor.tab === 'sounds'" />
      <EditorMusic v-else-if="editor.tab === 'music'" />
      <EditorLoader v-else-if="editor.tab === 'loader'" />
      <EditorTexts v-else-if="editor.tab === 'texts'" />
    </main>

    <footer v-if="ready" class="editor-problems" :class="{ 'is-open': problemsOpen && problemCount }" :aria-label="t('editor.problems')">
      <div v-if="editor.formError" class="editor-banner is-error form-error" role="alert">{{ t(editor.formError.key, editor.formError.params) }}</div>
      <button type="button" class="problems-bar" :aria-expanded="problemsOpen && !!problemCount" :disabled="!problemCount" @click="problemsOpen = !problemsOpen">
        <span class="problems-title">{{ t('editor.problems') }}</span>
        <span v-if="problemCount" class="problem-count" :class="{ 'is-error': hasErrors }">{{ t('editor.problemCount', { count: problemCount }) }}</span>
        <span v-else class="is-ok no-problems">{{ t('editor.noProblems') }}</span>
        <span v-if="problemCount" class="problems-chevron" aria-hidden="true">⌃</span>
      </button>
      <div v-if="problemsOpen && problemCount" class="problems-list">
        <button v-if="syntax" type="button" class="problem is-error problem-syntax" @click="showSyntax">
          <span class="problem-level">{{ t('special.error') }}</span>
          <span class="problem-text">{{ t('editor.syntax', syntax) }}</span>
        </button>
        <template v-else>
          <button
            v-for="(problem, index) in editor.problems"
            :key="index"
            type="button"
            class="problem"
            :class="problem.level === 'error' ? 'is-error' : 'is-warn'"
            @click="showProblem(problem)"
          >
            <span class="problem-level">{{ problem.level === 'error' ? t('special.error') : t('special.warning') }}</span>
            <span class="problem-where">{{ problem.where }}</span>
            <span class="problem-text">{{ problem.message }}</span>
          </button>
        </template>
      </div>
    </footer>

    <EditorPublish v-if="publishing" @close="publishing = false" />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { t } from '../i18n'
import { useEditorStore } from '../stores/editorStore'
import { MAP_FILE } from '../utils/mapCheck'
import { locate } from '../editor/jsonEdit'
import { binarySize, isBinaryPath, isImagePath, sizeText } from '../editor/binaryFiles'
import { soundEngine } from '../sound'
import EditorTextArea from './EditorTextArea.vue'
import EditorThumb from './EditorThumb.vue'
import EditorStars from './EditorStars.vue'
import EditorSystem from './EditorSystem.vue'
import EditorArticles from './EditorArticles.vue'
import EditorMainPage from './EditorMainPage.vue'
import EditorSite from './EditorSite.vue'
import EditorTheme from './EditorTheme.vue'
import EditorSounds from './EditorSounds.vue'
import EditorMusic from './EditorMusic.vue'
import EditorLoader from './EditorLoader.vue'
import EditorTexts from './EditorTexts.vue'
import EditorPreview from './EditorPreview.vue'
import { detectLoreFormat, normalizeLoreConfig } from '../utils/richText/lore'
import EditorPublish from './EditorPublish.vue'
import '../styles/editor.css'

const editor = useEditorStore()
const ready = computed(() => editor.status === 'ready')
const changedCount = computed(() => editor.changedFiles.length)
const publishing = ref(false)
const confirmDiscard = ref(false)
// { start, end } in the map file text
const place = ref(null)

const syntax = computed(() => editor.parsed.error ?? null)
const problemCount = computed(() => (syntax.value ? 1 : editor.problems.length))
const hasErrors = computed(() => !!syntax.value || editor.problems.some(problem => problem.level === 'error'))
const problemsOpen = ref(false)
watch(() => (syntax.value ? `syntax:${syntax.value.line}:${syntax.value.column}` : editor.problems.map(problem => `${problem.where}|${problem.message}`).join('\n')), (now, before) => {
  if (now && now !== before) problemsOpen.value = true
})

const soundSize = computed(() => sizeText(isBinaryPath(editor.current) && editor.exists(editor.current) ? binarySize(editor.textOf(editor.current)) : 0))
async function playFile() {
  const bytes = await editor.bytesOf(editor.current)
  if (bytes) soundEngine.audition(null, bytes)
}

const isMissing = path => !editor.isDeleted(path) && !editor.exists(path) && editor.originals[path] !== undefined
const isProse = path => /\.(wiki|md|markdown|txt)$/i.test(path ?? '')
const canPreview = computed(() => /\.(wiki|md|markdown)$/i.test(editor.current ?? '') && editor.exists(editor.current))
const filePreview = ref(true)
const showFilePreview = computed(() => filePreview.value && canPreview.value)
const fileFormat = computed(() => detectLoreFormat({ loreFile: editor.current }, normalizeLoreConfig(editor.parsed.data?.loreConfig)))

function showAt(start, end) {
  editor.tab = 'files'
  editor.current = MAP_FILE
  place.value = { start, end }
}

function showSyntax() {
  const lines = editor.mapText.replace(/^\uFEFF/, '').split('\n')
  const { line, column } = syntax.value
  const offset = lines.slice(0, line - 1).reduce((sum, each) => sum + each.length + 1, 0) + column - 1 + (editor.mapText.charCodeAt(0) === 0xfeff ? 1 : 0)
  showAt(offset, offset + 1)
}

function showProblem(problem) {
  const found = locate(editor.mapText, problem.where)
  if (found) showAt(found.start, found.end)
  else showAt(0, 0)
}

function discard() {
  editor.discard()
  confirmDiscard.value = false
}

onMounted(async () => {
  await editor.load()
  const site = editor.parsed.data?.site?.title
  document.title = typeof site === 'string' && site.trim() ? `${t('editor.title')} — ${site}` : t('editor.title')
})
</script>
