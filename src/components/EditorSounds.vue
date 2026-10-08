<template>
  <section class="editor-pane sounds-panel" :aria-label="t('editor.tabSounds')">
    <div class="editor-card">
      <div class="editor-heading">{{ t('editor.soundsTitle') }}</div>
      <div class="editor-hint">{{ t('editor.soundsNote', { max: MAX_KB }) }}</div>
      <div class="sounds-fields">
        <label class="editor-check">
          <input type="checkbox" class="sounds-on" :checked="enabled" @change="setEnabled($event.target.checked)" />
          {{ t('editor.soundsOn') }}
        </label>
        <label class="editor-field sounds-volume-field">
          <span>{{ t('editor.soundsVolume') }}</span>
          <EditorNumber
            input-class="sounds-volume"
            :value="volumePercent"
            :placeholder="String(DEFAULT_PERCENT)"
            :disabled="!enabled"
            @commit="setVolume"
          />
        </label>
      </div>
      <div v-if="!enabled" class="editor-note sounds-off">{{ t('editor.soundsOffNote') }}</div>
    </div>

    <ul v-if="enabled" class="sounds-list">
      <li v-for="row in rows" :key="row.name" class="editor-card sound-row" :data-sound="row.name">
        <div class="sound-head">
          <button
            type="button"
            class="editor-button is-small sound-play"
            data-sfx="none"
            :disabled="row.state.kind === 'silent'"
            :aria-label="t('special.soundPlay', { name: row.name })"
            @click="play(row)"
          >▶</button>
          <code class="sound-name">{{ row.name }}</code>
          <span class="sound-state" :class="`is-${row.state.kind}`">{{ stateText(row.state) }}</span>
        </div>
        <div class="sound-what">{{ t(`sounds.${row.name}`) }}</div>
        <div class="editor-actions">
          <label class="editor-button is-small sound-upload">
            {{ t('editor.soundUpload') }}
            <input type="file" class="sound-file" :accept="ACCEPT" hidden @change="upload(row.name, $event)" />
          </label>
          <button v-if="row.state.kind !== 'silent'" type="button" class="editor-button is-small sound-silence" @click="silence(row.name)">{{ t('editor.soundSilence') }}</button>
          <button v-if="row.state.kind !== 'site'" type="button" class="editor-button is-small sound-reset" @click="reset(row.name)">{{ t('editor.soundReset') }}</button>
        </div>
        <div v-if="errors[row.name]" class="editor-note is-error sound-error" role="alert">{{ errors[row.name] }}</div>
      </li>
    </ul>
  </section>
</template>

<script setup>
import { computed, reactive } from 'vue'
import { t } from '../i18n'
import { useEditorStore } from '../stores/editorStore'
import EditorNumber from './EditorNumber.vue'
import { SOUND_NAMES, DEFAULT_SOUND_VOLUME, soundEngine } from '../sound'
import { MAX_SOUND_BYTES, UPLOAD_EXTENSIONS, bytesOf, extensionOf, toDataUrl } from '../editor/binaryFiles'
import { resetSound, setSoundFile, setSoundsEnabled, setSoundsVolume, silenceSound, soundPath, soundState, soundsOf } from '../editor/soundEdits'
import { sitePathOf } from '../editor/siteFiles'
import { MAP_FILE } from '../utils/mapCheck'

const ACCEPT = '.wav,.mp3,.ogg,audio/wav,audio/mpeg,audio/ogg'
const MAX_KB = Math.round(MAX_SOUND_BYTES / 1024)
const DEFAULT_PERCENT = Math.round(DEFAULT_SOUND_VOLUME * 100)

const editor = useEditorStore()
const map = computed(() => editor.parsed.data ?? {})
const enabled = computed(() => soundsOf(map.value) !== false)
const volumePercent = computed(() => {
  const volume = soundsOf(map.value)?.volume
  return typeof volume === 'number' ? Math.round(volume * 100) : undefined
})
const rows = computed(() => SOUND_NAMES.map(name => ({ name, state: soundState(map.value, name) })))

const errors = reactive({})

function stateText(state) {
  if (state.kind === 'silent') return t('editor.soundSilent')
  if (state.kind === 'file') return t('editor.soundFile', { path: state.path })
  return t('editor.soundSite')
}

const setEnabled = on => editor.editMap(text => setSoundsEnabled(text, on))
const setVolume = value => editor.editMap(text => setSoundsVolume(text, value === '' ? null : value))
const silence = name => {
  errors[name] = null
  editor.editMap(text => silenceSound(text, name))
}
const reset = name => {
  errors[name] = null
  editor.editMap(text => resetSound(text, name))
}

async function recordingOf(path) {
  const own = sitePathOf(path)
  if (own && editor.exists(own) && editor.textOf(own)) return bytesOf(editor.textOf(own))
  const response = await fetch(new URL(path, new URL(MAP_FILE, document.baseURI)).href)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

// Plays even when this browser has sound effects off.
async function play(row) {
  errors[row.name] = null
  try {
    const bytes = row.state.kind === 'file' ? await recordingOf(row.state.path) : null
    if (!(await soundEngine.audition(row.name, bytes))) errors[row.name] = t('editor.soundUnreadable')
  } catch {
    errors[row.name] = t('editor.soundUnreadable')
  }
}

async function upload(name, event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  errors[name] = null
  // The map may name other formats; uploads are limited to ones every browser plays.
  if (!UPLOAD_EXTENSIONS.includes(extensionOf(file.name))) {
    errors[name] = t('editor.soundFormat', { file: file.name })
    return
  }
  if (file.size > MAX_SOUND_BYTES) {
    errors[name] = t('editor.soundTooBig', { file: file.name, size: Math.ceil(file.size / 1024), max: MAX_KB })
    return
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!(await soundEngine.canDecode(bytes))) {
    errors[name] = t('editor.soundUnreadable')
    return
  }
  const path = soundPath(name, file.name)
  if (!editor.editMap(text => setSoundFile(text, name, path))) return
  editor.setText(path, toDataUrl(bytes, path))
  soundEngine.audition(name, bytes)
}
</script>

<style scoped>
/* The editor's forms area does not scroll, so each tab scrolls itself. */
.sounds-panel {
  height: 100%;
  gap: 12px;
}

@media (max-width: 760px) {
  .sounds-panel {
    height: auto;
  }
}

.sounds-fields {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px 24px;
  margin-top: 12px;
}

.sounds-volume-field {
  flex: 0 1 200px;
}

.sounds-off {
  margin-top: 10px;
}

.sounds-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.sound-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.sound-name {
  font-family: inherit;
  color: var(--ui-text);
}

.sound-state {
  margin-left: auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-dim);
}

.sound-state.is-file {
  color: var(--ui-text);
}

.sound-state.is-silent {
  color: var(--ui-warn);
}

.sound-what {
  margin: 6px 0 8px;
  color: color-mix(in srgb, var(--ui-text) 35%, var(--ui-dim));
}

.sound-upload {
  position: relative;
}
</style>
