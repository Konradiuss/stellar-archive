<template>
  <section class="editor-pane site-panel" :aria-label="t('editor.tabSite')">
    <div class="editor-card site-card">
      <div class="editor-heading">{{ t('editor.siteTitle') }}</div>
      <div class="site-grid">
        <div class="site-fields">
          <label class="editor-field">
            <span>{{ t('editor.siteName') }}</span>
            <input class="editor-input is-code site-title" :value="site.title ?? ''" :placeholder="DEFAULT_SITE_CONFIG.title" @change="set('title', $event)" @keydown.enter="$event.target.blur()" />
          </label>
          <label class="editor-field">
            <span>{{ t('editor.siteDescription') }}</span>
            <textarea class="editor-input site-description" rows="4" :value="site.description ?? ''" :placeholder="t('editor.siteDescriptionAuto')" @change="set('description', $event)"></textarea>
            <span class="editor-hint site-description-count" :class="{ 'is-warn': descriptionLength > SITE_DESCRIPTION_MAX }">
              {{ t('editor.siteDescriptionCount', { count: descriptionLength, max: SITE_DESCRIPTION_MAX, shown: DESCRIPTION_MAX }) }}
            </span>
          </label>
          <label class="editor-field">
            <span>{{ t('editor.siteTemplate') }}</span>
            <input class="editor-input is-code site-template" :value="site.titleTemplate ?? ''" :placeholder="DEFAULT_SITE_CONFIG.titleTemplate" spellcheck="false" @change="set('titleTemplate', $event)" @keydown.enter="$event.target.blur()" />
            <span class="editor-hint site-template-hint">
              <span v-for="token in TEMPLATE_TOKENS" :key="token"><code>{{ braced(token) }}</code> {{ t(`editor.template.${token}`) }}</span>
            </span>
            <span v-if="example" class="editor-hint site-template-example">{{ t('editor.siteTemplateExample', { title: example }) }}</span>
          </label>
          <div class="editor-row">
            <label class="editor-field">
              <span>{{ t('editor.siteLanguage') }}</span>
              <input class="editor-input is-code site-language" :value="site.language ?? ''" :placeholder="DEFAULT_LANGUAGE" list="site-languages" spellcheck="false" @change="set('language', $event)" @keydown.enter="$event.target.blur()" />
              <datalist id="site-languages" class="is-code">
                <option v-for="tag in LANGUAGES" :key="tag" :value="tag">{{ languageName(tag) }}</option>
              </datalist>
            </label>
            <label class="editor-field site-url-field">
              <span>{{ t('editor.siteUrl') }}</span>
              <input class="editor-input is-code site-url" :value="site.url ?? ''" placeholder="https://owner.github.io/site/" spellcheck="false" @change="set('url', $event)" @keydown.enter="$event.target.blur()" />
            </label>
          </div>
          <div class="editor-hint">{{ t('editor.siteLanguageHint') }}</div>
          <div v-if="!site.url" class="editor-note site-no-url">{{ t('editor.siteNoUrl') }}</div>
          <div v-for="field in PICTURES" :key="field" class="site-picture" :data-field="field">
            <EditorThumb class="site-picture-image" :source="field === 'favicon' ? site.favicon ?? DEFAULT_SITE_CONFIG.favicon : site.preview ?? null" />
            <label class="editor-field">
              <span>{{ t(field === 'favicon' ? 'editor.siteFavicon' : 'editor.sitePreview') }}</span>
              <input
                :class="['editor-input', 'is-code', `site-${field}`]"
                :value="site[field] ?? ''"
                :placeholder="field === 'favicon' ? DEFAULT_SITE_CONFIG.favicon : t('editor.sitePreviewAuto')"
                spellcheck="false"
                @change="set(field, $event)"
                @keydown.enter="$event.target.blur()"
              />
            </label>
            <label class="editor-button is-small site-upload">
              {{ t('editor.soundUpload') }}
              <input type="file" :class="`site-${field}-file`" :accept="IMAGE_ACCEPT" hidden @change="upload(field, $event)" />
            </label>
            <div v-if="pictureErrors[field]" class="editor-note is-error site-picture-error" role="alert">{{ pictureErrors[field] }}</div>
          </div>
          <div class="editor-hint">{{ t('editor.sitePreviewHint', { max: sizeText(MAX_IMAGE_BYTES) }) }}</div>
        </div>

        <EditorSiteCard />
      </div>
    </div>

    <div class="editor-card terminal-card">
      <div class="editor-heading">{{ t('editor.terminalTitle') }}</div>
      <div class="editor-hint">{{ t('editor.terminalNote') }}</div>
      <div class="editor-row">
        <label class="editor-field site-path-field">
          <span>{{ t('editor.terminalScript') }}</span>
          <input class="editor-input is-code terminal-script" :value="terminal.script ?? ''" :placeholder="t('editor.terminalBuiltIn')" spellcheck="false" @change="setScript($event)" @keydown.enter="$event.target.blur()" />
        </label>
        <button v-if="scriptPath && isMissing(scriptPath)" type="button" class="editor-button terminal-create" @click="editor.setText(scriptPath, BUILT_IN_SCRIPT)">{{ t('editor.terminalCreate') }}</button>
        <button v-else-if="scriptPath && editor.exists(scriptPath)" type="button" class="editor-button is-small terminal-open" @click="openFile(scriptPath)">{{ t('editor.openFile') }}</button>
      </div>
      <div class="editor-subheading">{{ t('editor.terminalFiles') }}</div>
      <div class="terminal-files">
        <div v-for="[name, path] in terminalFiles" :key="name" class="terminal-file" :data-name="name">
          <input class="editor-input is-code terminal-file-name" :value="name" spellcheck="false" :aria-label="t('editor.terminalFileName')" @change="renameFile(name, $event)" @keydown.enter="$event.target.blur()" />
          <input class="editor-input is-code terminal-file-path" :value="path" spellcheck="false" :aria-label="t('editor.terminalFilePath')" @change="moveFile(name, $event)" @keydown.enter="$event.target.blur()" />
          <button v-if="sitePathOf(path) && isMissing(sitePathOf(path))" type="button" class="editor-button is-small terminal-file-create" @click="editor.create(sitePathOf(path))">{{ t('editor.create') }}</button>
          <button v-else-if="sitePathOf(path)" type="button" class="editor-button is-small terminal-file-open" @click="openFile(sitePathOf(path))">{{ t('editor.openFile') }}</button>
          <button type="button" class="editor-button is-small is-danger terminal-file-remove" :aria-label="t('editor.remove')" @click="removeFile(name)">✕</button>
        </div>
        <form class="terminal-file is-new" @submit.prevent="addFile">
          <input v-model="newName" class="editor-input is-code terminal-new-name" placeholder="NOTES.TXT" spellcheck="false" :aria-label="t('editor.terminalFileName')" />
          <input v-model="newPath" class="editor-input is-code terminal-new-path" placeholder="terminal/notes.txt" spellcheck="false" :aria-label="t('editor.terminalFilePath')" />
          <button type="submit" class="editor-button is-small terminal-add" :disabled="!newName.trim() || !newPath.trim()">{{ t('editor.add') }}</button>
        </form>
      </div>
      <label class="editor-check">
        <input type="checkbox" class="terminal-syndicate" :checked="terminal.syndicate !== false" @change="setHidden($event.target.checked)" />
        {{ t('editor.terminalSyndicate') }}
      </label>
    </div>

    <div class="editor-card wiki-card">
      <div class="editor-heading">{{ t('editor.wikiTitle') }}</div>
      <div class="editor-row">
        <label class="editor-field">
          <span>{{ t('editor.wikiFormat') }}</span>
          <select class="editor-input wiki-format" :value="loreConfig.format ?? ''" @change="setLore('format', $event.target.value)">
            <option value="">{{ t('editor.autoValue', { value: t('editor.formatWikitext') }) }}</option>
            <option value="markdown">{{ t('editor.formatMarkdown') }}</option>
            <option v-if="loreConfig.format && loreConfig.format !== 'markdown'" :value="loreConfig.format">{{ loreConfig.format === 'wikitext' ? t('editor.formatWikitext') : `? ${loreConfig.format}` }}</option>
          </select>
        </label>
        <label class="editor-field">
          <span>{{ t('editor.wikiImages') }}</span>
          <input class="editor-input is-code wiki-images" :value="loreConfig.images ?? ''" :placeholder="DEFAULT_LORE_CONFIG.images" spellcheck="false" @change="setLoreFrom('images', $event)" @keydown.enter="$event.target.blur()" />
        </label>
        <label class="editor-field site-url-field">
          <span>{{ t('editor.wikiUrl') }}</span>
          <input class="editor-input is-code wiki-url" :value="loreConfig.wikiUrl ?? ''" placeholder="https://wiki.example.org/wiki/" spellcheck="false" @change="setLoreFrom('wikiUrl', $event)" @keydown.enter="$event.target.blur()" />
        </label>
      </div>
      <div class="editor-hint">{{ t('editor.wikiFormatHint') }}</div>
      <div v-if="loreConfig.wikiUrl" class="editor-note is-warn wiki-url-note">{{ t('editor.wikiUrlNote') }}</div>
      <label class="editor-check">
        <input type="checkbox" class="wiki-portal" :checked="map.wiki?.portal !== false" @change="setHomePortal($event.target.checked)" />
        {{ t('editor.wikiPortal') }}
      </label>
    </div>

    <div class="editor-card legend-card">
      <div class="editor-heading">{{ t('editor.galaxyLegend') }}</div>
      <div class="editor-hint">{{ t('editor.galaxyLegendHint') }}</div>
      <EditorTextSource :owner="{ at: 'root', keys: 'legend' }" :label="t('editor.galaxyLegend')" area-class="galaxy-legend-text" compact />
    </div>
  </section>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { DEFAULT_LANGUAGE, t } from '../i18n'
import { useEditorStore } from '../stores/editorStore'
import EditorTextSource from './EditorTextSource.vue'
import EditorSiteCard from './EditorSiteCard.vue'
import EditorThumb from './EditorThumb.vue'
import { DEFAULT_SITE_CONFIG, SITE_DESCRIPTION_MAX, normalizeSiteConfig } from '../utils/siteConfig'
import { DEFAULT_LORE_CONFIG } from '../utils/richText/lore'
import { DESCRIPTION_MAX } from '../social/preview'
import { buildTabTitle } from '../utils/tabTitle'
import { sitePathOf } from '../editor/siteFiles'
import { addTerminalFile, removeTerminalFile, renameTerminalFile, setLoreConfig, setPortal, setSiteField, setSyndicate, setTerminalFilePath, setTerminalScript } from '../editor/siteEdits'
import { isObject } from '../utils/guards'
import { IMAGE_UPLOAD_EXTENSIONS, MAX_IMAGE_BYTES, extensionOf, isImagePath, sizeText } from '../editor/binaryFiles'
import BUILT_IN_SCRIPT from '../data/terminal.txt?raw'

const LANGUAGES = ['en', 'ru', 'uk', 'de', 'fr', 'es', 'it', 'pl', 'pt', 'ja', 'zh', 'ko']
const PICTURES = ['favicon', 'preview']
const TEMPLATE_TOKENS = ['page', 'site', 'star', 'planet']
const braced = token => `{${token}}`
const IMAGE_ACCEPT = IMAGE_UPLOAD_EXTENSIONS.map(extension => `.${extension}`).join(',')
// An uploaded picture is named for what it is: favicon.png, preview.jpg.
const UPLOAD_NAMES = { favicon: 'favicon', preview: 'preview' }

const editor = useEditorStore()
const map = computed(() => editor.parsed.data ?? {})
const site = computed(() => (isObject(map.value.site) ? map.value.site : {}))
const terminal = computed(() => (isObject(map.value.terminal) ? map.value.terminal : {}))
const loreConfig = computed(() => (isObject(map.value.loreConfig) ? map.value.loreConfig : {}))
const terminalFiles = computed(() => (isObject(terminal.value.files) ? Object.entries(terminal.value.files) : []))
const scriptPath = computed(() => (typeof terminal.value.script === 'string' ? sitePathOf(terminal.value.script) : null))
const descriptionLength = computed(() => String(site.value.description ?? '').trim().length)

const languageName = tag => {
  try {
    return new Intl.DisplayNames([tag], { type: 'language' }).of(tag)
  } catch {
    return tag
  }
}

// The tab title of the first planet of the first system, as the site writes it.
const example = computed(() => {
  const stars = Array.isArray(map.value.stars) ? map.value.stars : []
  const star = stars.find(each => Array.isArray(map.value.systems?.[each?.id]?.planets) && map.value.systems[each.id].planets.length) ?? stars[0]
  if (!star) return ''
  const planet = map.value.systems?.[star.id]?.planets?.[0] ?? null
  return buildTabTitle({ site: normalizeSiteConfig(site.value), star: { name: star.name ?? star.id }, planet })
})

// A refused value goes back to what the map has.
function apply(event, edit, shown) {
  if (!editor.editMap(edit)) event.target.value = shown ?? ''
}

const set = (field, event) => apply(event, text => setSiteField(text, field, event.target.value), site.value[field])
const setScript = event => apply(event, text => setTerminalScript(text, event.target.value), terminal.value.script)
const setHidden = on => editor.editMap(text => setSyndicate(text, on))
const setLore = (field, value) => editor.editMap(text => setLoreConfig(text, field, value))
const setLoreFrom = (field, event) => apply(event, text => setLoreConfig(text, field, event.target.value), loreConfig.value[field])
const setHomePortal = on => editor.editMap(text => setPortal(text, on))

const isMissing = path => !editor.exists(path) && !editor.isReading(path) && !editor.readFailure(path)

function openFile(path) {
  editor.current = path
  editor.tab = 'files'
}

const newName = ref('')
const newPath = ref('')
function addFile() {
  if (!editor.editMap(text => addTerminalFile(text, newName.value, newPath.value))) return
  newName.value = ''
  newPath.value = ''
}
const renameFile = (name, event) => apply(event, text => renameTerminalFile(text, name, event.target.value), name)
const moveFile = (name, event) => apply(event, text => setTerminalFilePath(text, name, event.target.value), terminal.value.files[name])
const removeFile = name => editor.editMap(text => removeTerminalFile(text, name))

const pictureErrors = reactive({})

// → whether the browser can show these bytes as a picture.
async function isPicture(bytes, type) {
  const address = URL.createObjectURL(new Blob([bytes], { type }))
  try {
    const image = new Image()
    image.src = address
    await image.decode()
    return image.naturalWidth > 0
  } catch {
    return false
  } finally {
    URL.revokeObjectURL(address)
  }
}

async function upload(field, event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  pictureErrors[field] = null
  const extension = extensionOf(file.name)
  if (!IMAGE_UPLOAD_EXTENSIONS.includes(extension) || !isImagePath(file.name)) {
    pictureErrors[field] = t('editor.imageFormat', { file: file.name })
    return
  }
  if (file.size > MAX_IMAGE_BYTES) {
    pictureErrors[field] = t('editor.imageTooBig', { file: file.name, size: sizeText(file.size), max: sizeText(MAX_IMAGE_BYTES) })
    return
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!(await isPicture(bytes, file.type))) {
    pictureErrors[field] = t('editor.imageUnreadable', { file: file.name })
    return
  }
  const path = `${UPLOAD_NAMES[field]}.${extension}`
  const refused = await editor.setBinary(path, bytes)
  if (refused) {
    pictureErrors[field] = t(refused.key, refused.params)
    return
  }
  if (!editor.editMap(text => setSiteField(text, field, path))) editor.revert(path)
}
</script>

<style scoped>
.site-panel {
  height: 100%;
  gap: 12px;
}

@media (max-width: 760px) {
  .site-panel {
    height: auto;
  }
}

.site-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 440px);
  gap: 20px;
  margin-top: 12px;
}

.site-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.site-url-field,
.site-path-field {
  flex: 1 1 280px !important;
}

.site-description-count.is-warn {
  color: var(--ed-warn);
}

.site-template-hint {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 14px;
}

.site-picture {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: end;
}

.site-picture-image {
  width: 48px;
  height: 48px;
  object-fit: contain;
  image-rendering: pixelated;
  border: 1px solid var(--ed-border);
  border-radius: 4px;
  background: #000;
}

.site-picture-error {
  grid-column: 1 / -1;
}

.terminal-files {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 8px 0 12px;
}

.terminal-file {
  display: grid;
  grid-template-columns: minmax(0, 180px) minmax(0, 1fr) auto auto;
  gap: 8px;
  align-items: center;
}

.terminal-file.is-new {
  grid-template-columns: minmax(0, 180px) minmax(0, 1fr) auto;
}

.wiki-url-note {
  margin-top: 8px;
}

@media (max-width: 900px) {
  .site-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
