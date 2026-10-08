<template>
  <div class="editor-split editor-articles">
    <nav class="editor-side article-list" :aria-label="t('editor.articles')">
      <div v-for="section in sections" :key="section.id ?? ''" class="article-section">
        <div class="editor-hint article-group" :style="{ paddingLeft: `${section.depth * 12 + 10}px` }">{{ section.title }}</div>
        <div class="editor-list">
          <button
            v-if="section.world"
            type="button"
            class="editor-list-item world-item"
            :class="{ 'is-current': editor.worldOpen }"
            :style="{ paddingLeft: `${section.depth * 12 + 10}px` }"
            @click="openWorld"
          ><span class="editor-list-text">{{ worldTitle }}</span></button>
          <button
            v-for="article in section.articles"
            :key="article.title"
            type="button"
            class="editor-list-item article-item"
            :class="{ 'is-current': article.title === current?.title }"
            :style="{ paddingLeft: `${section.depth * 12 + 10}px` }"
            :title="article.title"
            @click="open(article.title)"
          ><span class="editor-list-text">{{ article.title }}</span></button>
        </div>
      </div>
      <div v-if="!articles.length" class="editor-note">{{ t('editor.noArticles') }}</div>
      <button type="button" class="editor-list-item open-groups" :class="{ 'is-current': !current && !editor.worldOpen }" @click="openGroups">
        <span class="editor-list-text">{{ t('editor.editGroups') }}</span>
      </button>

      <form class="new-article" @submit.prevent="create">
        <label class="editor-field">
          <span>{{ t('editor.newArticleTitle') }}</span>
          <input v-model="newTitle" class="editor-input new-article-title" />
        </label>
        <label class="editor-field">
          <span>{{ t('editor.format') }}</span>
          <select v-model="newFormat" class="editor-input new-article-format">
            <option value="wikitext">{{ t('editor.formatWikitext') }}</option>
            <option value="markdown">{{ t('editor.formatMarkdown') }}</option>
          </select>
        </label>
        <div class="editor-actions">
          <button type="submit" class="editor-button is-primary new-article-create" :disabled="!newTitle.trim()">{{ t('editor.newArticle') }}</button>
        </div>
      </form>
    </nav>

    <div class="editor-pane article-pane">
      <section v-if="current" :key="current.title" class="article-panel" :aria-label="current.title">
        <div class="editor-card">
          <div class="article-fields">
            <label class="editor-field is-wide">
              <span>{{ t('editor.articleTitle') }}</span>
              <input class="editor-input article-title" :value="current.title" @change="rename($event.target.value)" @keydown.enter="$event.target.blur()" />
            </label>
            <label class="editor-check is-wide"><input v-model="keepAlias" type="checkbox" class="article-keep-alias" /> {{ t('editor.keepAlias') }}</label>
            <label class="editor-field">
              <span>{{ t('editor.group') }}</span>
              <select class="editor-input article-group-select" :value="current.group ?? ''" @change="set('group', $event.target.value)">
                <option value="">{{ t('editor.noGroup') }}</option>
                <option v-for="group in groups" :key="group.id" :value="group.id">{{ '· '.repeat(group.depth) }}{{ group.title }}</option>
              </select>
            </label>
            <label class="editor-field">
              <span>{{ t('editor.place') }}</span>
              <select class="editor-input article-place" :value="current.place ?? ''" @change="set('place', $event.target.value)">
                <option value="">{{ t('editor.noPlace') }}</option>
                <option v-for="(each, index) in places" :key="index" :value="each.name">{{ '· '.repeat(each.depth) }}{{ each.name }}</option>
              </select>
            </label>
            <label class="editor-field">
              <span>{{ t('editor.tabTitle') }}</span>
              <input class="editor-input article-tab" :value="current.tabTitle ?? ''" :placeholder="current.title" @change="set('tabTitle', $event.target.value.trim())" @keydown.enter="$event.target.blur()" />
            </label>
            <label class="editor-field">
              <span>{{ t('editor.aliases') }}</span>
              <input class="editor-input article-aliases" :value="(current.aliases ?? []).join(', ')" @change="setList('aliases', $event.target.value)" @keydown.enter="$event.target.blur()" />
            </label>
            <label class="editor-field">
              <span>{{ t('editor.categories') }}</span>
              <input class="editor-input article-categories" :value="(current.categories ?? []).join(', ')" @change="setList('categories', $event.target.value)" @keydown.enter="$event.target.blur()" />
            </label>
            <label class="editor-check article-home-field"><input type="checkbox" class="article-home" :checked="isHome" @change="setHomePage($event.target.checked)" /> {{ t('editor.isHome') }}</label>
          </div>
        </div>

        <div class="article-body">
          <div class="article-text">
            <span class="file-pane-name">{{ current.file ?? t('editor.inlineText') }}</span>
            <template v-if="current.file">
              <div v-if="!filePath" class="editor-note is-warn file-outside">{{ t('editor.outsideSite', { file: current.file }) }}</div>
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
                class="article-area"
                :model-value="editor.textOf(filePath)"
                :label="t('editor.articleText', { title: current.title })"
                wrap
                @update:model-value="editor.setText(filePath, $event)"
              />
            </template>
            <EditorTextArea
              v-else
              class="article-area"
              :model-value="inlineText"
              :label="t('editor.articleText', { title: current.title })"
              wrap
              @update:model-value="typeInline"
            />
          </div>
          <EditorPreview class="article-preview" :text="bodyText" :format="format" />
        </div>

        <div v-if="!confirming" class="editor-actions">
          <button type="button" class="editor-button is-danger article-delete" @click="confirming = true">{{ t('editor.delete') }}</button>
        </div>
        <div v-else class="editor-confirm" role="alertdialog">
          <div>{{ t('editor.confirmDeleteArticle', { title: current.title }) }}</div>
          <div v-if="deleteOrphans.length" class="editor-note delete-files">{{ t('editor.withFiles', { files: deleteOrphans.join(', ') }) }}</div>
          <div class="editor-actions">
            <button type="button" class="editor-button is-danger confirm-yes" @click="remove">{{ t('editor.yes') }}</button>
            <button type="button" class="editor-button" @click="confirming = false">{{ t('editor.no') }}</button>
          </div>
        </div>
      </section>
      <EditorWorldPage v-else-if="editor.worldOpen" />
      <EditorGroups v-else />
    </div>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { t } from '../i18n'
import { useEditorStore } from '../stores/editorStore'
import EditorTextArea from './EditorTextArea.vue'
import EditorPreview from './EditorPreview.vue'
import EditorGroups from './EditorGroups.vue'
import EditorWorldPage from './EditorWorldPage.vue'
import { addArticle, articleIndex, removeArticle, renameArticle, setArticleField, setArticleList, setHome, splitList, wikiGroups } from '../editor/articleEdits'
import { mapPlaces } from '../editor/places'
import { detectLoreFormat, normalizeLoreConfig } from '../utils/richText/lore'
import { pageKey, worldPageTitle } from '../utils/wikiPages'
import { sitePathOf } from '../editor/siteFiles'

const editor = useEditorStore()
const map = computed(() => editor.parsed.data ?? {})
const articles = computed(() => (Array.isArray(map.value.wiki?.articles) ? map.value.wiki.articles : [])
  .filter(article => article && typeof article === 'object' && typeof article.title === 'string'))
const groups = computed(() => wikiGroups(map.value))
const places = computed(() => mapPlaces(map.value))

const worldTitle = computed(() => worldPageTitle())
const sections = computed(() => {
  const known = new Set(groups.value.map(group => group.id))
  const worldGroup = known.has(map.value.wiki?.worldGroup) ? map.value.wiki.worldGroup : null
  const list = groups.value
    .map(group => ({ ...group, world: group.id === worldGroup, articles: articles.value.filter(article => article.group === group.id) }))
    .filter(group => group.world || group.articles.length)
  const loose = articles.value.filter(article => !known.has(article.group))
  if (!worldGroup || loose.length) list.push({ id: null, title: t('editor.ungrouped'), depth: 0, world: !worldGroup, articles: loose })
  return list
})

const current = computed(() => articles.value[articleIndex(map.value, editor.selectedArticle ?? '')] ?? null)
const isHome = computed(() => !!current.value && pageKey(map.value.wiki?.home) === pageKey(current.value.title))
const format = computed(() => detectLoreFormat({ loreFormat: current.value?.format, loreFile: current.value?.file }, normalizeLoreConfig(map.value.loreConfig)))

const keepAlias = ref(true)
const confirming = ref(false)
const newTitle = ref('')
const newFormat = ref('wikitext')
watch(() => current.value?.title, () => { confirming.value = false })

function open(title) {
  editor.worldOpen = false
  editor.selectedArticle = title
}

function openWorld() {
  editor.selectedArticle = null
  editor.worldOpen = true
}

function openGroups() {
  editor.selectedArticle = null
  editor.worldOpen = false
}

function create() {
  const done = editor.editMap(text => addArticle(text, { title: newTitle.value, format: newFormat.value }))
  if (!done) return
  open(newTitle.value.trim())
  newTitle.value = ''
}

function rename(value) {
  const title = current.value.title
  const done = editor.editMap(text => renameArticle(text, title, value, { keepAlias: keepAlias.value }))
  if (done) open(value.trim())
}

const set = (field, value) => editor.editMap(text => setArticleField(text, current.value.title, field, value))
const setList = (field, value) => editor.editMap(text => setArticleList(text, current.value.title, field, splitList(value)))
const setHomePage = on => editor.editMap(text => setHome(text, on ? current.value.title : null))

// { timer, title } while a typed text waits to be written to its article.
const inlineText = ref('')
let waiting = null

function saveInline() {
  if (!waiting) return
  const { timer, title } = waiting
  clearTimeout(timer)
  waiting = null
  editor.editMap(text => setArticleField(text, title, 'text', inlineText.value))
}
const release = editor.holdSave(saveInline)

// Flush the pending text to the article it was typed for before showing the new one.
watch(() => [current.value?.title, current.value?.text], ([title], previous) => {
  if (previous && title !== previous[0]) saveInline()
  if (!waiting) inlineText.value = current.value?.text ?? ''
}, { immediate: true })

function typeInline(value) {
  inlineText.value = value
  clearTimeout(waiting?.timer)
  waiting = { title: current.value.title, timer: setTimeout(saveInline, 500) }
}
onUnmounted(() => {
  saveInline()
  release()
})

// './wiki/a.wiki' → 'wiki/a.wiki'; null outside the site.
const filePath = computed(() => (current.value?.file ? sitePathOf(current.value.file) : null))
const bodyText = computed(() => (current.value?.file ? (filePath.value ? editor.textOf(filePath.value) : '') : inlineText.value))

const deleteOrphans = computed(() => {
  if (!confirming.value || !current.value) return []
  try {
    return removeArticle(editor.mapText, current.value.title).orphans
  } catch {
    return []
  }
})

function remove() {
  editor.editMap(text => removeArticle(text, current.value.title))
  editor.selectedArticle = null
}
</script>

<style scoped>
.article-section {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.article-group {
  padding: 6px 0 2px;
  font-weight: 600;
}

.new-article {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--ed-border);
}

.article-fields {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px 16px;
  align-items: end;
}

.article-fields .is-wide {
  grid-column: 1 / -1;
}

.article-home-field {
  min-height: var(--ed-field);
}
</style>
