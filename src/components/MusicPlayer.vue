<template>
  <RetroPanel
    class="music-player"
    :class="{ 'is-compact': compact || vertical, 'is-vertical': vertical }"
    seed="music"
    :file="t('files.player')"
    :title="t('panels.music')"
    :content="mapStore.isLoaded ? mapStore.music : null"
    :power-on-delay="650"
  >
    <template v-if="hasTracks && !compact && !vertical" #title-actions>
      <button
        type="button"
        class="title-btn button-list"
        :class="{ 'is-active': showList }"
        :aria-label="t('music.list')"
        :aria-pressed="showList"
        :data-hint="t('music.list')"
        @click="showList = !showList"
      >
        <svg viewBox="0 0 7 7" shape-rendering="crispEdges" aria-hidden="true">
          <rect x="0" y="1" width="7" height="1" /><rect x="0" y="3" width="7" height="1" /><rect x="0" y="5" width="7" height="1" />
        </svg>
      </button>
    </template>
    <template #default="{ content }">
      <div class="player" :data-state="playerState" :data-track="player.index.value">
        <div v-if="!content.length" class="player-empty">
          {{ t('music.noRecords') }}
          <VolumeControl
            v-if="sound.available"
            class="sfx-control"
            :label="t('music.sfxLabel')"
            :percent="sfxPercent"
            :off="!sound.on"
            :waiting="sound.waiting"
            :toggle-label="sfxToggleLabel"
            :slider-label="t('music.sfxVolume')"
            @toggle="toggleSounds"
            @wake="wakeSounds"
            @change="setSoundPercent"
          />
        </div>
        <div v-else class="player-body">
          <div class="player-screen">
            <template v-if="!showList">
              <div class="player-now">
                <span class="now-title">{{ trackNumber }} {{ player.track.value?.title }}</span>
                <span class="now-time">{{ timeText }}</span>
              </div>
              <canvas ref="spectrumRef" class="player-spectrum" aria-hidden="true"></canvas>
              <div
                class="player-seek"
                role="slider"
                :aria-label="t('music.seek')"
                :aria-valuenow="Math.round(progress * 100)"
                aria-valuemin="0"
                aria-valuemax="100"
                @pointerdown="startSeek"
                @pointermove="moveSeek"
                @pointerup="endSeek"
                @pointercancel="endSeek"
              >
                <span class="seek-fill" :style="{ width: `${progress * 100}%` }"></span>
              </div>
            </template>
            <ol v-else class="player-list">
              <li
                v-for="(item, i) in content"
                :key="item.src"
                class="list-row"
                :class="{ 'is-current': i === player.index.value }"
                @click="player.select(i)"
              >
                <span class="list-number">{{ String(i + 1).padStart(2, '0') }}</span>
                <span class="list-title">{{ item.title }}</span>
                <span class="list-leader" aria-hidden="true"></span>
                <span class="list-time">{{ formatTime(item.duration) }}</span>
              </li>
            </ol>
          </div>

          <div class="player-controls">
            <button type="button" class="player-btn" :aria-label="t('music.previous')" :data-hint="t('music.previous')" @click="player.previous()">
              <svg viewBox="0 0 7 7" shape-rendering="crispEdges" aria-hidden="true">
                <rect x="0" y="0" width="1" height="7" /><rect x="2" y="3" width="1" height="1" /><rect x="3" y="2" width="1" height="3" />
                <rect x="4" y="1" width="1" height="5" /><rect x="5" y="0" width="1" height="7" />
              </svg>
            </button>
            <button
              type="button"
              class="player-btn button-play"
              :class="{ 'is-active': isOn }"
              :aria-label="isOn ? t('music.pause') : t('music.play')"
              :data-hint="isOn ? t('music.pause') : t('music.play')"
              @click="player.toggle()"
            >
              <svg v-if="isOn" viewBox="0 0 7 7" shape-rendering="crispEdges" aria-hidden="true">
                <rect x="1" y="0" width="2" height="7" /><rect x="4" y="0" width="2" height="7" />
              </svg>
              <svg v-else viewBox="0 0 7 7" shape-rendering="crispEdges" aria-hidden="true">
                <rect x="1" y="0" width="1" height="7" /><rect x="2" y="1" width="1" height="5" />
                <rect x="3" y="2" width="1" height="3" /><rect x="4" y="3" width="1" height="1" />
              </svg>
            </button>
            <button type="button" class="player-btn" :aria-label="t('music.next')" :data-hint="t('music.next')" @click="player.next()">
              <svg viewBox="0 0 7 7" shape-rendering="crispEdges" aria-hidden="true">
                <rect x="1" y="0" width="1" height="7" /><rect x="2" y="1" width="1" height="5" /><rect x="3" y="2" width="1" height="3" />
                <rect x="4" y="3" width="1" height="1" /><rect x="6" y="0" width="1" height="7" />
              </svg>
            </button>
            <VolumeControl
              v-if="sound.available && compact && !vertical"
              class="sfx-control"
              compact
              :label="t('music.sfxLabel')"
              :percent="sfxPercent"
              :off="!sound.on"
              :waiting="sound.waiting"
              :toggle-label="sfxToggleLabel"
              :slider-label="t('music.sfxVolume')"
              @toggle="toggleSounds"
              @wake="wakeSounds"
            />

            <div class="player-volume">
              <VolumeControl
                class="music-control"
                :label="t('music.musLabel')"
                :percent="volumePercent"
                :off="silent"
                :toggle-label="player.muted.value ? t('music.unmute') : t('music.mute')"
                :slider-label="t('music.musicVolume')"
                @toggle="player.toggleMute()"
                @change="setVolumePercent"
              />
              <VolumeControl
                v-if="sound.available"
                class="sfx-control"
                :label="t('music.sfxLabel')"
                :percent="sfxPercent"
                :off="!sound.on"
                :waiting="sound.waiting"
                :toggle-label="sfxToggleLabel"
                :slider-label="t('music.sfxVolume')"
                @toggle="toggleSounds"
                @wake="wakeSounds"
                @change="setSoundPercent"
              />
            </div>
          </div>
        </div>

        <PanelStatusBar>
          <template #left>{{ volumeNotice ?? statusText }}</template>
          <template #right>
            <a
              v-if="player.track.value?.url"
              class="player-credit"
              :href="player.track.value.url"
              target="_blank"
              rel="noopener noreferrer"
              :title="creditTitle"
            >{{ creditText }}</a>
            <span v-else :title="creditTitle">{{ creditText }}</span>
          </template>
        </PanelStatusBar>
      </div>
    </template>
  </RetroPanel>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useMapStore } from '../stores/mapStore'
import { useUIStore } from '../stores/uiStore'
import { useMusicPlayer } from '../composables/useMusicPlayer'
import { formatTime, spectrumBars } from '../utils/musicPlaylist'
import { useSoundStore } from '../stores/soundStore'
import { playSound, soundEngine } from '../sound'
import RetroPanel from './RetroPanel.vue'
import VolumeControl from './VolumeControl.vue'
import { t } from '../i18n'
import PanelStatusBar from './PanelStatusBar.vue'
import { prefersReducedMotion } from '../utils/reducedMotion'

// Sizes in canvas pixels
const SPECTRUM_BARS = 20
const CELL_HEIGHT = 3
const CELL_GAP = 1
const BAR_GAP = 2
const FALL_MS = 45

const props = defineProps({
  compact: { type: Boolean, default: false },
  vertical: { type: Boolean, default: false }
})

const mapStore = useMapStore()
const player = useMusicPlayer(() => mapStore.music)
const sound = useSoundStore()
const showList = ref(false)
watch(() => props.compact || props.vertical, compact => { if (compact) showList.value = false })
const hasTracks = computed(() => mapStore.isLoaded && mapStore.music.length > 0)
const spectrumRef = ref(null)

const reducedMotion = prefersReducedMotion()

const isOn = computed(() => player.playing.value || player.loading.value)
const playerState = computed(() => {
  if (player.error.value) return 'error'
  if (player.loading.value) return 'loading'
  return player.playing.value ? 'playing' : 'paused'
})
const statusText = computed(() => t(`music.${playerState.value}`))

const trackNumber = computed(() => {
  const count = mapStore.music.length
  const pad = value => String(value).padStart(2, '0')
  return `${pad(player.index.value + 1)}/${pad(count)}`
})
const timeText = computed(() => `${formatTime(player.currentTime.value)} / ${formatTime(player.length.value)}`)
const progress = computed(() => (
  player.length.value ? Math.min(1, player.currentTime.value / player.length.value) : 0
))
const volumePercent = computed(() => Math.round(player.volume.value * 100))
const silent = computed(() => player.muted.value || volumePercent.value === 0)

// The licence without its version fits the line ("Duke Gneiss, CC BY-NC-SA").
const creditText = computed(() => {
  const item = player.track.value
  if (!item) return ''
  const license = item.license.replace(/\s*\d+(\.\d+)*$/, '')
  return [item.author, license].filter(Boolean).join(', ')
})
const creditTitle = computed(() => {
  const item = player.track.value
  return item ? [item.author && `${item.author} — ${item.title}`, item.license].filter(Boolean).join(', ') : ''
})

let seeking = false
function seekAt(event) {
  const box = event.currentTarget.getBoundingClientRect()
  if (box.width > 0) player.seek(Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)))
}
function startSeek(event) {
  seeking = true
  event.currentTarget.setPointerCapture?.(event.pointerId)
  seekAt(event)
}
function moveSeek(event) {
  if (seeking) seekAt(event)
}
function endSeek() {
  seeking = false
}

const VOLUME_NOTICE_MS = 1500
const volumeNotice = ref(null)
let noticeTimer = null
function showVolume(channel, percent) {
  volumeNotice.value = t('music.volumeNotice', { channel, percent })
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => { volumeNotice.value = null }, VOLUME_NOTICE_MS)
}

// Any change of the volume turns the sound back on (setVolume unmutes).
function setVolumePercent(percent) {
  player.setVolume(percent / 100)
  showVolume(t('music.musLabel'), percent)
}

// One sample at most this often while the bar moves, not a buzz.
const SAMPLE_EVERY_MS = 120
let sampledAt = 0

const sfxPercent = computed(() => Math.round(sound.volume * 100))

function setSoundPercent(percent) {
  const awake = sound.setVolume(percent / 100)
  showVolume(t('music.sfxLabel'), percent)
  const now = performance.now()
  if (now - sampledAt < SAMPLE_EVERY_MS) return
  sampledAt = now
  awake.then(() => playSound('click'))
}

const sfxToggleLabel = computed(() => {
  if (sound.waiting) return t('music.sfxWaiting')
  return sound.on ? t('music.sfxOff') : t('music.sfxOn')
})

function wakeSounds() {
  showVolume(t('music.sfxLabel'), sfxPercent.value)
  soundEngine.wake().then(awake => { if (awake) playSound('toggleOn') })
}

// "off" plays while the sound is still on, "on" once it is.
function toggleSounds() {
  if (sound.on) {
    playSound('toggleOff')
    sound.toggle()
  } else {
    sound.toggle().then(awake => { if (awake) playSound('toggleOn') })
  }
}

let frame = null
let shown = new Array(SPECTRUM_BARS).fill(0)
let lastFallAt = 0

function drawSpectrum(timestamp = performance.now()) {
  frame = null
  const canvas = spectrumRef.value
  const context = canvas?.getContext('2d')
  if (!context) return
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  const rows = Math.max(1, Math.floor((height + CELL_GAP) / (CELL_HEIGHT + CELL_GAP)))
  const barWidth = Math.max(1, Math.floor((width - BAR_GAP * (SPECTRUM_BARS - 1)) / SPECTRUM_BARS))
  const target = player.playing.value && !reducedMotion
    ? spectrumBars(player.getSpectrum(), SPECTRUM_BARS, rows)
    : new Array(SPECTRUM_BARS).fill(0)

  const fall = timestamp - lastFallAt >= FALL_MS
  if (fall) lastFallAt = timestamp
  shown = shown.map((value, bar) => (target[bar] >= value ? target[bar] : fall ? value - 1 : value))

  context.clearRect(0, 0, width, height)
  for (let bar = 0; bar < SPECTRUM_BARS; bar++) {
    const x = bar * (barWidth + BAR_GAP)
    for (let row = 0; row < rows; row++) {
      context.fillStyle = row < shown[bar] ? '#ffffff' : '#262626'
      context.fillRect(x, height - (row + 1) * (CELL_HEIGHT + CELL_GAP) + CELL_GAP, barWidth, CELL_HEIGHT)
    }
  }
  if (player.playing.value || shown.some(value => value > 0)) frame = requestAnimationFrame(drawSpectrum)
}

function startSpectrum() {
  if (frame === null) frame = requestAnimationFrame(drawSpectrum)
}

watch(player.playing, startSpectrum)

const uiStore = useUIStore()
watch(() => uiStore.syndicateHack, hacked => {
  if (hacked) player.pause()
})
// The canvas remounts with the screen after the list or a channel switch.
watch(spectrumRef, canvas => { if (canvas) startSpectrum() })

onBeforeUnmount(() => {
  if (frame !== null) cancelAnimationFrame(frame)
  clearTimeout(noticeTimer)
})
</script>

<style scoped>
.player {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  font-size: 8px;
  line-height: 10px;
}

.player-empty {
  padding: 12px 10px;
  color: var(--ui-dim);
}

.player-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 10px;
}

.player-screen {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.player-now {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  white-space: nowrap;
}

.now-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.now-time {
  flex-shrink: 0;
  color: var(--ui-dim);
}

.player-spectrum {
  flex: 1;
  min-height: 12px;
  width: 100%;
  image-rendering: pixelated;
}

.player-seek {
  position: relative;
  flex-shrink: 0;
  height: 8px;
  background: repeating-conic-gradient(var(--ui-line) 0 25%, transparent 0 50%) 0 0 / 2px 2px;
  cursor: none;
  touch-action: none;
}

.seek-fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--ui-text);
}

.player-list {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
  scrollbar-width: thin;
  scrollbar-color: var(--ui-dim) color-mix(in srgb, var(--ui-line) 14%, var(--ui-screen));
}

.list-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 1px 2px;
  white-space: nowrap;
  cursor: none;
}

.list-row:hover {
  background: color-mix(in srgb, var(--ui-line) 35%, var(--ui-screen));
}

.list-row.is-current {
  background: var(--ui-text);
  color: var(--ui-screen);
}

.list-number,
.list-time {
  flex-shrink: 0;
}

.list-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.list-leader {
  flex: 1;
  min-width: 6px;
  height: 2px;
  margin-top: 4px;
  background: repeating-linear-gradient(90deg, currentColor 0 2px, transparent 2px 6px);
  opacity: 0.4;
}

.player-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.player-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 18px;
  padding: 0;
  border: 1px solid var(--ui-text);
  background: transparent;
  color: var(--ui-text);
  appearance: none;
  cursor: none;
}

.player-btn:hover,
.player-btn:focus-visible,
.player-btn.is-active {
  background: var(--ui-text);
  color: var(--ui-screen);
  outline: none;
}

.player-btn svg,
.title-btn svg {
  width: 7px;
  height: 7px;
  fill: currentColor;
}

.title-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 13px;
  padding: 0;
  border: 1px solid var(--ui-text);
  background: transparent;
  color: var(--ui-text);
  appearance: none;
  cursor: none;
}

.title-btn:hover,
.title-btn:focus-visible,
.title-btn.is-active {
  background: var(--ui-text);
  color: var(--ui-screen);
  outline: none;
}

.player-volume {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 18px;
  margin-left: auto;
}

.player-controls > .sfx-control :deep(.volume-label) {
  min-width: 34px;
  border: 1px solid var(--ui-text);
}

.player-controls > .sfx-control.is-off :deep(.volume-label):not(:hover):not(:focus-visible) {
  border-color: var(--ui-dim);
}

.player-empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

.player-empty .sfx-control {
  color: var(--ui-text);
}

/* The state stays whole; a long credit gives way instead */
.player :deep(.panel-status-left) {
  flex-shrink: 0;
}

.player :deep(.panel-status-right) {
  flex-shrink: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.player-credit {
  color: inherit;
  text-decoration: none;
  cursor: none;
}

.player-credit:hover {
  background: var(--ui-text);
  color: var(--ui-screen);
}

.music-player.is-compact :deep(.panel-titlebar),
.music-player.is-compact :deep(.panel-status),
.is-compact .player-spectrum,
.is-compact .player-seek,
.is-compact .player-volume,
.is-compact .player-list {
  display: none;
}

.is-compact .player-body {
  flex-direction: row-reverse;
  align-items: center;
  gap: 10px;
  padding: 3px 10px;
}

/* The track gives way to the buttons: on a narrow phone they went off the screen */
.is-compact .player {
  container-type: inline-size;
}

.is-compact .player-screen {
  justify-content: center;
  min-width: 0;
}

@container (max-width: 240px) {
  .is-compact .now-time {
    display: none;
  }
}

.is-vertical .player-screen {
  display: none;
}

.is-vertical .player-body {
  justify-content: center;
  padding: 6px 0;
}

.is-vertical .player-controls {
  flex-direction: column;
}
</style>
