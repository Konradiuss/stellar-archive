<template>
  <div class="editor-pane main-page">
    <div class="editor-card main-top">
      <label class="editor-field main-home-field">
        <span>{{ t('editor.mainIs') }}</span>
        <select class="editor-input main-home" :value="homeTitle ?? ''" @change="chooseHome($event.target.value)">
          <option value="">{{ t('editor.mainWorld', { name: worldTitle }) }}</option>
          <option v-if="homeTitle && !homeArticle" :value="homeTitle">{{ homeTitle }} ?</option>
          <option v-for="article in articles" :key="article.title" :value="article.title">{{ article.title }}</option>
        </select>
      </label>
      <template v-if="!homeTitle">
        <div class="editor-hint main-world-note">{{ t('editor.mainCreateNote', { name: worldTitle }) }}</div>
        <button type="button" class="editor-button is-primary main-create" @click="createMain">{{ t('editor.mainCreate') }}</button>
      </template>
    </div>

    <div v-if="source.kind === 'missing'" class="editor-note is-warn main-missing">{{ t('editor.mainNotFound', { title: homeTitle }) }}</div>
    <template v-else-if="source.kind === 'file' && fileState">
      <div v-if="fileState === 'outside'" class="editor-note is-warn file-outside">{{ t('editor.outsideSite', { file: source.file }) }}</div>
      <div v-else-if="fileState === 'failed'" class="file-absent">
        <div class="editor-note is-error file-unread">{{ t('editor.readFailed', { file: source.path, reason: editor.readFailure(source.path) }) }}</div>
        <button type="button" class="editor-button action-retry" @click="editor.retryRead(source.path)">{{ t('editor.retry') }}</button>
      </div>
      <div v-else-if="fileState === 'reading'" class="editor-note file-reading">{{ t('editor.reading', { file: source.path }) }}</div>
      <div v-else class="file-absent">
        <div class="editor-note">{{ t('editor.missing') }}: {{ source.path }}</div>
        <button type="button" class="editor-button action-create" @click="editor.create(source.path)">{{ t('editor.create') }}</button>
      </div>
    </template>
    <div v-else-if="format !== 'wikitext'" class="editor-note is-warn main-markdown">{{ t('editor.mainMarkdown') }}</div>

    <div v-else class="main-body">
      <div class="main-cards">
        <div v-if="!cards.length" class="editor-note main-empty">{{ t('editor.mainEmpty') }}</div>
        <section
          v-for="(card, position) in cards"
          :key="card.index"
          class="editor-card main-card"
          :class="`is-${card.segment.kind}`"
          :data-kind="card.segment.kind"
          :aria-label="t(`editor.blocks.${card.segment.kind}`)"
        >
          <div class="main-card-head">
            <span class="main-card-kind">{{ t(`editor.blocks.${card.segment.kind}`) }}</span>
            <button type="button" class="editor-button is-icon is-small card-up" :aria-label="t('editor.moveUp')" :title="t('editor.moveUp')" :disabled="position === 0" @click="move(card.index, -1)">↑</button>
            <button type="button" class="editor-button is-icon is-small card-down" :aria-label="t('editor.moveDown')" :title="t('editor.moveDown')" :disabled="position === cards.length - 1" @click="move(card.index, 1)">↓</button>
            <button v-if="confirming !== card.index" type="button" class="editor-button is-danger is-small card-delete" @click="confirming = card.index">{{ t('editor.delete') }}</button>
          </div>
          <div v-if="confirming === card.index" class="editor-confirm card-confirm" role="alertdialog">
            <div>{{ t('editor.deleteBlock') }}</div>
            <div class="editor-actions">
              <button type="button" class="editor-button is-danger confirm-yes" @click="remove(card.index)">{{ t('editor.yes') }}</button>
              <button type="button" class="editor-button" @click="confirming = null">{{ t('editor.no') }}</button>
            </div>
          </div>
          <EditorBannerCard v-if="card.segment.kind === 'banner'" :segment="card.segment" @update="replace(card.index, $event)" />
          <EditorBoxCard v-else-if="card.segment.kind === 'box'" :segment="card.segment" @update="replace(card.index, $event)" />
          <EditorLinksCard v-else-if="card.segment.kind === 'links'" :segment="card.segment" :titles="titles" @update="replace(card.index, $event)" />
          <div v-else-if="card.segment.kind === 'portal'" class="editor-hint">{{ t('editor.portalNote') }}</div>
          <EditorCommitText
            v-else
            class="main-text"
            multiline
            :rows="6"
            :value="textOfBlock(card.segment)"
            :aria-label="t('editor.blocks.text')"
            @commit="replace(card.index, setBlockText(card.segment, $event))"
          />
        </section>
        <div class="main-add">
          <span class="editor-hint">{{ t('editor.mainAdd') }}:</span>
          <button v-for="kind in KINDS" :key="kind" type="button" class="editor-button is-small main-add-block" :data-kind="kind" @click="add(kind)">+ {{ t(`editor.blocks.${kind}`) }}</button>
        </div>
      </div>
      <EditorPreview class="main-preview" :text="pageText" format="wikitext" />
    </div>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { t } from '../i18n'
import { useEditorStore } from '../stores/editorStore'
import { addArticle, articleIndex, setArticleField, setHome, setWorldLore } from '../editor/articleEdits'
import { appendBlock, isGap, moveBlock, newBlock, readPage, removeBlock, replaceBlock, setBlockText, textOfBlock, writePage } from '../editor/pageLayout'
import { sitePathOf } from '../editor/siteFiles'
import { detectLoreFormat, normalizeLoreConfig } from '../utils/richText/lore'
import { worldPageTitle } from '../utils/wikiPages'
import EditorPreview from './EditorPreview.vue'
import EditorCommitText from './EditorCommitText.vue'
import EditorBannerCard from './EditorBannerCard.vue'
import EditorBoxCard from './EditorBoxCard.vue'
import EditorLinksCard from './EditorLinksCard.vue'

const KINDS = ['banner', 'box', 'links', 'portal', 'text']
const MAIN_TITLE = 'Main Page'

const editor = useEditorStore()
const map = computed(() => editor.parsed.data ?? {})
const articles = computed(() => (Array.isArray(map.value.wiki?.articles) ? map.value.wiki.articles : [])
  .filter(article => article && typeof article === 'object' && typeof article.title === 'string'))
const worldTitle = computed(() => worldPageTitle())
const homeTitle = computed(() => (typeof map.value.wiki?.home === 'string' && map.value.wiki.home.trim() ? map.value.wiki.home.trim() : null))
const homeArticle = computed(() => (homeTitle.value ? articles.value[articleIndex(map.value, homeTitle.value)] ?? null : null))

const source = computed(() => {
  if (homeTitle.value && !homeArticle.value) return { kind: 'missing' }
  const file = homeArticle.value ? homeArticle.value.file : map.value.worldLoreFile
  if (typeof file === 'string' && file.trim()) return { kind: 'file', file, path: sitePathOf(file) }
  return homeArticle.value ? { kind: 'article', title: homeArticle.value.title } : { kind: 'world' }
})
const sourceKey = computed(() => JSON.stringify(source.value))

const fileState = computed(() => {
  const { kind, path } = source.value
  if (kind !== 'file') return null
  if (!path) return 'outside'
  if (editor.readFailure(path)) return 'failed'
  if (editor.isReading(path)) return 'reading'
  return editor.exists(path) ? null : 'missing'
})

const format = computed(() => {
  const article = homeArticle.value
  const page = article ? { loreFormat: article.format, loreFile: article.file } : { loreFormat: map.value.worldLoreFormat, loreFile: map.value.worldLoreFile }
  return detectLoreFormat(page, normalizeLoreConfig(map.value.loreConfig))
})

const stored = computed(() => {
  const { kind, path } = source.value
  if (kind === 'file') return path ? editor.textOf(path) : ''
  if (kind === 'article') return typeof homeArticle.value.text === 'string' ? homeArticle.value.text : ''
  if (kind === 'world') return typeof map.value.worldLore === 'string' ? map.value.worldLore : ''
  return ''
})

// { text, source } while a change waits to be written.
const pending = ref(null)
let timer = null

function flush() {
  if (!pending.value) return
  clearTimeout(timer)
  timer = null
  const { text, key } = pending.value
  pending.value = null
  const { kind, title } = JSON.parse(key)
  editor.editMap(map => (kind === 'article' ? setArticleField(map, title, 'text', text) : setWorldLore(map, text)))
}
const release = editor.holdSave(flush)
watch(sourceKey, (key, previous) => {
  if (pending.value && pending.value.key === previous) flush()
})
onUnmounted(() => {
  flush()
  release()
})

const pageText = computed(() => pending.value?.text ?? stored.value)
const page = computed(() => readPage(pageText.value))
const cards = computed(() => page.value.segments.map((segment, index) => ({ segment, index })).filter(card => !isGap(card.segment)))

function write(segments) {
  const text = writePage(segments, page.value.eol)
  if (source.value.kind === 'file') {
    editor.setText(source.value.path, text)
    return
  }
  clearTimeout(timer)
  pending.value = { text, key: sourceKey.value }
  timer = setTimeout(flush, 500)
}

const confirming = ref(null)
watch(sourceKey, () => { confirming.value = null })

const replace = (index, segment) => write(replaceBlock(page.value.segments, index, segment))
const move = (index, step) => write(moveBlock(page.value.segments, index, step))
const add = kind => write(appendBlock(page.value.segments, newBlock(kind, { title: siteTitle.value })))

function remove(index) {
  write(removeBlock(page.value.segments, index))
  confirming.value = null
}

const siteTitle = computed(() => (typeof map.value.title === 'string' && map.value.title.trim() ? map.value.title.trim().toUpperCase() : 'ARCHIVE'))

const titles = computed(() => [
  ...articles.value.map(article => article.title),
  worldTitle.value,
  'Special:All pages', 'Special:Categories', 'Special:Icons', 'Special:Banners'
])

function chooseHome(title) {
  flush()
  editor.editMap(text => setHome(text, title || null))
}

function createMain() {
  flush()
  const skeleton = `{{Banner\n|title = ${siteTitle.value}\n|style = steel\n}}\n\n{{Archive sections}}\n`
  editor.editMap(text => {
    if (articleIndex(map.value, MAIN_TITLE) >= 0) return setHome(text, MAIN_TITLE)
    const added = addArticle(text, { title: MAIN_TITLE })
    return { ...added, text: setHome(added.text, MAIN_TITLE), create: { ...added.create, text: skeleton } }
  })
}
</script>

<style scoped>
.main-page {
  height: 100%;
}

.main-top {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px 16px;
}

.main-home-field {
  flex: 0 1 320px;
}

.main-world-note {
  flex: 1 1 320px;
}

.main-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
  height: max(480px, calc(100vh - 250px));
}

.main-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  padding-right: 4px;
  overflow-y: auto;
  scrollbar-color: var(--ed-border-strong) transparent;
}

.main-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.main-card-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.main-card-kind {
  margin-right: auto;
  color: var(--ed-text);
  font-weight: 600;
}

.main-add {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding-bottom: 8px;
}

.main-preview {
  min-height: 0;
}

@media (max-width: 900px) {
  .main-body {
    grid-template-columns: minmax(0, 1fr);
    height: auto;
  }

  .main-cards {
    overflow: visible;
  }

  .main-preview {
    height: 60vh;
  }
}
</style>
