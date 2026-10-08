<template>
  <section class="editor-pane loader-panel" :aria-label="t('editor.tabLoader')">
    <div class="editor-card">
      <div class="editor-heading">{{ t('editor.loaderTitle') }}</div>
      <div class="editor-hint">{{ t('editor.loaderNote') }}</div>
      <label class="editor-field loader-title-field">
        <span>{{ t('editor.loaderHeading') }}</span>
        <EditorCommitText
          class="loader-field is-code"
          data-key="title"
          :value="loaderText(map, 'title')"
          :placeholder="DEFAULTS.title"
          @commit="set('title', $event)"
        />
        <span v-if="tooLong('title')" class="editor-hint loader-too-long">{{ t('editor.loaderTooLong', { max: LOADER_LONG_LINE }) }}</span>
      </label>
    </div>

    <div v-for="group in groups" :key="group.id" class="editor-card loader-group" :data-group="group.id">
      <div class="editor-heading">{{ t(`editor.loaderGroups.${group.id}`) }}</div>
      <div class="loader-group-body">
        <div class="loader-fields">
          <label v-for="key in group.keys" :key="key" class="editor-field">
            <span class="loader-key">
              <code>{{ key }}</code>
              <span v-if="placeholdersOf(key).length" class="loader-params is-code">{{ placeholdersOf(key).join(' ') }}</span>
            </span>
            <EditorCommitText
              class="loader-field is-code"
              :data-key="key"
              :value="loaderText(map, key)"
              :placeholder="DEFAULTS[key]"
              @commit="set(key, $event)"
            />
            <span v-if="tooLong(key)" class="editor-hint loader-too-long">{{ t('editor.loaderTooLong', { max: LOADER_LONG_LINE }) }}</span>
          </label>
        </div>
        <div class="loader-preview-box">
          <!-- Texts being written, shown as the site prints them. -->
          <div class="loader-preview is-code" :aria-label="t('editor.loaderPreview')">
            <div class="loader-preview-title">{{ titleText }}</div>
            <div class="loader-preview-rule">==============================</div>
            <div v-for="(line, index) in shownLines(group)" :key="index" class="loader-preview-line">&gt; {{ padLoaderLabel(line.text) }} <span :class="line.done ? 'is-ok' : 'is-busy'">{{ line.done ? 'OK' : '_' }}</span></div>
          </div>
          <button
            type="button"
            class="editor-button is-small loader-play"
            data-sfx="none"
            :aria-label="t('editor.loaderPlay')"
            @click="play(group)"
          >▶</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onUnmounted, ref } from 'vue'
import { t } from '../i18n'
import { DEFAULT_STRINGS } from '../i18n/strings'
import { useEditorStore } from '../stores/editorStore'
import EditorCommitText from './EditorCommitText.vue'
import { LOADER_GROUPS, LOADER_LONG_LINE, padLoaderLabel } from '../utils/loaderLines'
import { mapLoaderCounts } from '../utils/loaderCounts'
import { orbitCount } from '../utils/satellites'
import { loaderText, setLoaderText } from '../editor/stringEdits'
import { BOOT_LINE_MS, LINE_MS } from '../stores/uiStore'
import { playSound, soundEngine } from '../sound'

const DEFAULTS = DEFAULT_STRINGS.loader
const groups = LOADER_GROUPS

const editor = useEditorStore()
const map = computed(() => editor.parsed.data ?? {})

const set = (key, value) => editor.editMap(text => setLoaderText(text, key, value))

const placeholdersOf = key => [...new Set([...String(DEFAULTS[key]).matchAll(/\{\w+\}/g)].map(match => match[0]))]
const titleText = computed(() => loaderText(map.value, 'title') || DEFAULTS.title)

const sample = computed(() => {
  const data = map.value
  const stars = Array.isArray(data.stars) ? data.stars : []
  const star = stars[0]
  const planets = Array.isArray(data.systems?.[star?.id]?.planets) ? data.systems[star.id].planets : []
  const { texts, articles } = mapLoaderCounts(data)
  const article = articles.find(item => item?.title)
  return {
    boot: { checkingMap: stars.length, loadingArchives: texts, routingHyperlines: Array.isArray(data.hyperlines) ? data.hyperlines.length : 0 },
    star: String(star?.name ?? star?.id ?? 'SOL').toUpperCase(),
    page: String(article?.title ?? 'MAIN PAGE').toUpperCase(),
    planets: planets.filter(planet => planet && typeof planet === 'object').length,
    orbits: orbitCount(planets)
  }
})

function paramsOf(key) {
  const { boot, star, page, planets, orbits } = sample.value
  if (key in boot) return { count: boot[key] }
  if (key === 'calculatingOrbits') return { count: orbits }
  if (key === 'renderingPlanets') return { count: planets }
  return { star, page }
}

const fill = (text, params) => text.replace(/\{(\w+)\}/g, (match, name) => (params[name] === undefined ? match : String(params[name])))
const lineText = key => fill(loaderText(map.value, key) || DEFAULTS[key], paramsOf(key))

const tooLong = key => !!loaderText(map.value, key) && (key === 'title' ? titleText.value : lineText(key)).length > LOADER_LONG_LINE

const playing = ref({ group: null, count: 0 })
let timer = null

function shownLines(group) {
  const all = group.keys.map(key => ({ text: lineText(key), done: true }))
  if (playing.value.group !== group.id) return all
  const finished = playing.value.count === all.length && !timer
  return all.slice(0, playing.value.count).map((line, index, shown) => ({ ...line, done: index < shown.length - 1 || finished }))
}

function play(group) {
  clearTimeout(timer)
  soundEngine.unlock()
  const pace = group.id === 'boot' ? BOOT_LINE_MS : LINE_MS
  playing.value = { group: group.id, count: 0 }
  const next = () => {
    if (playing.value.count >= group.keys.length) {
      timer = null
      playing.value = { ...playing.value }
      return
    }
    playing.value = { group: group.id, count: playing.value.count + 1 }
    playSound('loaderLine')
    timer = setTimeout(next, pace)
  }
  next()
}

onUnmounted(() => clearTimeout(timer))
</script>

<style scoped>
/* The editor's forms area does not scroll, so each tab scrolls itself. */
.loader-panel {
  height: 100%;
  gap: 12px;
}

@media (max-width: 760px) {
  .loader-panel {
    height: auto;
  }
}

.loader-title-field {
  max-width: 420px;
  margin-top: 12px;
}

.loader-group-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
  margin-top: 10px;
}

.loader-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.loader-key {
  display: flex;
  gap: 8px;
  align-items: baseline;
}

.loader-params {
  color: var(--ed-muted);
}

.loader-preview-box {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}

.loader-preview {
  box-sizing: border-box;
  width: 100%;
  padding: 12px;
  overflow-x: auto;
  border: 1px solid var(--ui-line);
  background: var(--ui-screen);
  color: color-mix(in srgb, var(--ui-text) 61%, var(--ui-dim));
  font-family: 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre;
}

.loader-preview-title {
  color: var(--ui-text);
}

.loader-preview-rule {
  margin-bottom: 4px;
  color: color-mix(in srgb, var(--ui-dim) 74%, var(--ui-line));
}

.is-ok {
  color: var(--ui-ok);
}

.is-busy {
  color: var(--ui-text);
}

@media (max-width: 760px) {
  .loader-group-body {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
