<template>
  <section class="editor-pane music-panel" :aria-label="t('editor.tabMusic')">
    <div class="editor-card">
      <div class="editor-heading">{{ t('editor.musicTitle') }}</div>
      <div class="editor-hint">{{ t('editor.musicNote', { max: sizeText(MAX_MUSIC_BYTES) }) }}</div>
      <div class="editor-actions music-actions">
        <label class="editor-button music-add" :class="{ 'is-busy': adding }">
          {{ adding ? t('editor.musicAdding') : t('editor.musicAdd') }}
          <input type="file" class="music-files" :accept="ACCEPT" multiple hidden :disabled="adding" @change="addFiles" />
        </label>
      </div>
      <div v-for="(problem, at) in addErrors" :key="at" class="editor-note is-error music-error" role="alert">{{ problem }}</div>
      <div v-if="!tracks.length" class="editor-note music-empty">{{ t('editor.musicEmpty') }}</div>
    </div>

    <ol v-if="tracks.length" class="music-list">
      <li v-for="(track, index) in tracks" :key="index" class="editor-card track-row" :data-index="index">
        <div class="track-head">
          <span class="track-number">{{ String(index + 1).padStart(2, '0') }}</span>
          <span class="track-name is-code">{{ nameOf(track) }}</span>
          <button type="button" class="editor-button is-icon is-small track-up" :aria-label="t('editor.moveUp')" :title="t('editor.moveUp')" :disabled="index === 0" @click="move(index, -1)">↑</button>
          <button type="button" class="editor-button is-icon is-small track-down" :aria-label="t('editor.moveDown')" :title="t('editor.moveDown')" :disabled="index === tracks.length - 1" @click="move(index, 1)">↓</button>
          <button type="button" class="editor-button is-small is-danger track-remove" :aria-label="t('editor.remove')" :title="t('editor.remove')" @click="remove(index)">✕</button>
        </div>

        <div v-if="!isObject(track)" class="editor-note is-warn track-not-track">
          <code class="is-code">? {{ shown(track) }}</code> {{ t('editor.trackNotTrack') }}
        </div>
        <template v-else>
          <div class="track-fields">
            <label v-for="field in TEXT_FIELDS" :key="field" class="editor-field" :class="`track-${field}-field`">
              <span>{{ t(`editor.trackFields.${field}`) }}</span>
              <input
                :class="['editor-input', 'is-code', `track-${field}`]"
                :value="field === 'duration' ? durationShown(track.duration) : shown(track[field])"
                :placeholder="placeholderOf(track, field)"
                :list="field === 'license' ? 'track-licenses' : undefined"
                spellcheck="false"
                @change="set(index, field, $event, track[field])"
                @keydown.enter="$event.target.blur()"
              />
            </label>
          </div>
          <div v-for="field in badFields(track)" :key="field" class="editor-note is-warn track-bad-value" :data-field="field">
            {{ t('editor.trackBadValue', { field: t(`editor.trackFields.${field}`), value: shown(track[field]) }) }}
          </div>

          <div class="track-file-row">
            <label class="editor-field track-file-field">
              <span>{{ t('editor.trackFields.file') }}</span>
              <input class="editor-input is-code track-file" :value="shown(track.file)" placeholder="music/track.mp3" spellcheck="false" :disabled="moving === index" @change="setFile(index, $event, track.file)" @keydown.enter="$event.target.blur()" />
            </label>
            <label class="editor-button is-small track-replace">
              {{ track.file === undefined ? t('editor.trackUpload') : t('editor.trackReplace') }}
              <input type="file" class="track-replace-file" :accept="ACCEPT" hidden @change="replace(index, $event)" />
            </label>
          </div>
          <div class="editor-hint track-file-hint">{{ t('editor.trackFileHint') }}</div>
          <div v-if="!hasFile(track)" class="editor-note is-warn track-no-file">{{ t('editor.trackNoFile') }}</div>
          <template v-else>
            <div class="editor-hint track-file-state">{{ fileState(track.file) }}</div>
            <EditorTrackFile :file="track.file" :title="nameOf(track)" />
          </template>
          <div v-if="errors[index]" class="editor-note is-error track-error" role="alert">{{ errors[index] }}</div>
        </template>
      </li>
    </ol>
    <datalist id="track-licenses" class="is-code">
      <option v-for="license in LICENSES" :key="license" :value="license"></option>
    </datalist>
  </section>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { t } from '../i18n'
import { useEditorStore } from '../stores/editorStore'
import EditorTrackFile from './EditorTrackFile.vue'
import { EditError } from '../editor/starEdits'
import { MAX_MUSIC_BYTES, UPLOAD_EXTENSIONS, binarySize, extensionOf, mimeOf, sizeText } from '../editor/binaryFiles'
import { namedPaths, sitePathOf } from '../editor/siteFiles'
import { addTrack, moveTrack, musicPath, removeTrack, setTrackField, setTrackFile, titleOf, tracksOf, trackFile } from '../editor/musicEdits'
import { audioLength } from '../utils/audioLength'
import { formatTime } from '../utils/musicPlaylist'
import { MAP_FILE } from '../utils/mapCheck'
import { isObject } from '../utils/guards'

const ACCEPT = '.wav,.mp3,.ogg,audio/wav,audio/mpeg,audio/ogg'
const TEXT_FIELDS = ['title', 'author', 'license', 'url', 'duration']
const LICENSES = ['CC BY 4.0', 'CC BY-SA 4.0', 'CC BY-NC 4.0', 'CC BY-NC-SA 4.0', 'CC BY-ND 4.0', 'CC0 1.0']

const editor = useEditorStore()
const map = computed(() => editor.parsed.data ?? {})
const tracks = computed(() => tracksOf(map.value))
const errors = reactive({})
const addErrors = ref([])
const adding = ref(false)
const moving = ref(null)

const mapUrl = () => new URL(MAP_FILE, document.baseURI)

// What the map has, as written: a value the site cannot read stays to be seen.
function shown(value) {
  if (value === undefined || value === null) return ''
  return typeof value === 'string' ? value : JSON.stringify(value)
}
const durationShown = value => {
  const seconds = Number(value)
  return typeof value === 'number' && Number.isFinite(seconds) && seconds > 0 ? formatTime(seconds) : shown(value)
}

const hasFile = track => typeof track.file === 'string' && !!track.file.trim()
const fileName = track => (hasFile(track) ? track.file.trim().split('/').pop() : '')
// As the player names it.
const nameOf = track => {
  if (!isObject(track)) return '?'
  return typeof track.title === 'string' && track.title.trim() ? track.title.trim() : fileName(track) || '?'
}

function placeholderOf(track, field) {
  if (field === 'title') return fileName(track)
  if (field === 'duration') return t('editor.trackDurationAuto')
  if (field === 'url') return 'https://'
  return ''
}

// Must match utils/musicPlaylist.js.
function badFields(track) {
  return TEXT_FIELDS.filter(field => {
    const value = track[field]
    if (value === undefined) return false
    if (field === 'duration') return !(Number.isFinite(Number(value)) && Number(value) > 0)
    if (field === 'url') return !(typeof value === 'string' && /^https?:\/\//i.test(value.trim()))
    return typeof value !== 'string'
  })
}

function fileState(file) {
  const path = sitePathOf(file)
  if (!path) return t('editor.trackOnWeb')
  if (editor.isChanged(path) && editor.exists(path)) return t('editor.trackInDraft', { size: sizeText(binarySize(editor.textOf(path))) })
  return t('editor.trackOnSite')
}

// A refused value goes back to what the map has.
function set(index, field, event, before) {
  if (!editor.editMap(text => setTrackField(text, index, field, event.target.value))) {
    event.target.value = field === 'duration' ? durationShown(before) : shown(before)
  }
}

// The errors are kept by place in the list: they move with their tracks and go with them.
function move(index, step) {
  const other = index + step
  if (other < 0 || other >= tracks.value.length) return
  if (!editor.editMap(text => moveTrack(text, index, step))) return
  ;[errors[index], errors[other]] = [errors[other] ?? null, errors[index] ?? null]
}

function remove(index) {
  const count = tracks.value.length
  if (!editor.editMap(text => removeTrack(text, index))) return
  for (let at = index; at < count - 1; at++) errors[at] = errors[at + 1] ?? null
  delete errors[count - 1]
}

function refuse(error) {
  if (!(error instanceof EditError)) throw error
  editor.formError = { key: error.key, params: error.params }
}

// A file the host has under that name is not written over.
async function hostHas(path) {
  try {
    const response = await fetch(new URL(path, mapUrl()).href, { method: 'HEAD', cache: 'no-store' })
    return response.ok && !/text\/html/i.test(response.headers.get('content-type') ?? '')
  } catch {
    return false
  }
}

async function freePath(fileName) {
  const taken = new Set([...namedPaths(map.value), ...editor.files.map(file => file.path)])
  for (;;) {
    const path = musicPath(fileName, taken)
    if (!(await hostHas(path))) return path
    taken.add(path)
  }
}

// → { bytes, seconds }, or the text of why the file is not taken.
async function recordingOf(file) {
  if (!UPLOAD_EXTENSIONS.includes(extensionOf(file.name))) return { problem: t('editor.musicFormat', { file: file.name }) }
  if (file.size > MAX_MUSIC_BYTES) return { problem: t('editor.musicTooBig', { file: file.name, size: sizeText(file.size), max: sizeText(MAX_MUSIC_BYTES) }) }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const address = URL.createObjectURL(new Blob([bytes], { type: mimeOf(file.name) }))
  const seconds = await audioLength(address)
  URL.revokeObjectURL(address)
  return seconds === null ? { problem: t('editor.musicUnreadable', { file: file.name }) } : { bytes, seconds }
}

// The file first: the map must not name one the browser had no room for.
async function store(file, recording) {
  const path = await freePath(file.name)
  const refused = await editor.setBinary(path, recording.bytes)
  return refused ? { problem: t(refused.key, refused.params) } : { path }
}

async function addFiles(event) {
  const chosen = [...(event.target.files ?? [])]
  event.target.value = ''
  if (!chosen.length) return
  addErrors.value = []
  adding.value = true
  try {
    for (const file of chosen) {
      const recording = await recordingOf(file)
      const stored = recording.problem ? recording : await store(file, recording)
      if (stored.problem) {
        addErrors.value = [...addErrors.value, stored.problem]
        continue
      }
      const track = { title: titleOf(file.name), file: stored.path, duration: Math.round(recording.seconds) }
      if (!editor.editMap(text => addTrack(text, track))) editor.revert(stored.path)
    }
  } finally {
    adding.value = false
  }
}

// The new file's length goes with it.
async function replace(index, event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  errors[index] = null
  const recording = await recordingOf(file)
  const stored = recording.problem ? recording : await store(file, recording)
  if (stored.problem) {
    errors[index] = stored.problem
    return
  }
  const done = editor.editMap(text => {
    const result = setTrackFile(text, index, stored.path)
    return { ...result, text: setTrackField(result.text, index, 'duration', Math.round(recording.seconds)) }
  })
  if (!done) editor.revert(stored.path)
}

// Another path of the site moves the file there; an address of the web only points the track at it.
async function setFile(index, event, before) {
  const back = () => { event.target.value = shown(before) }
  let target
  try {
    target = trackFile(event.target.value)
  } catch (error) {
    refuse(error)
    back()
    return
  }
  const from = sitePathOf(before)
  const to = sitePathOf(target)
  errors[index] = null
  if (from && to && from !== to && !namedPaths(map.value).has(to)) {
    moving.value = index
    try {
      const bytes = await bytesAt(from)
      if (bytes) {
        const refused = await editor.setBinary(to, bytes)
        if (refused) {
          errors[index] = t(refused.key, refused.params)
          back()
          return
        }
      }
    } finally {
      moving.value = null
    }
  }
  if (!editor.editMap(text => setTrackFile(text, index, target))) back()
}

// The draft's, else the host's; null when neither has it.
async function bytesAt(path) {
  const own = editor.isChanged(path) ? await editor.bytesOf(path) : null
  if (own) return own
  try {
    const response = await fetch(new URL(path, mapUrl()).href)
    if (!response.ok || /text\/html/i.test(response.headers.get('content-type') ?? '')) return null
    return new Uint8Array(await response.arrayBuffer())
  } catch {
    return null
  }
}
</script>

<style scoped>
/* The editor's forms area does not scroll, so each tab scrolls itself. */
.music-panel {
  height: 100%;
  gap: 12px;
}

@media (max-width: 760px) {
  .music-panel {
    height: auto;
  }
}

.music-actions {
  margin-top: 12px;
}

.music-add {
  position: relative;
}

.music-add.is-busy {
  opacity: 0.6;
}

.music-error,
.music-empty {
  margin-top: 10px;
}

.music-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.track-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.track-number {
  color: var(--ui-dim);
}

.track-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text);
}

.track-fields {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px 16px;
  margin: 10px 0 6px;
}

.track-file-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 8px 12px;
  margin-top: 6px;
}

.track-file-field {
  flex: 1 1 280px;
}

.track-replace {
  position: relative;
}

.track-file-state {
  margin: 4px 0 6px;
}

.track-not-track,
.track-no-file,
.track-bad-value,
.track-error {
  margin-top: 8px;
}
</style>
