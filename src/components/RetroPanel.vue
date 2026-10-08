<template>
  <ScreenBezel class="retro-panel" :seed="seed" :status="ledStatus">
    <div
      class="retro-screen"
      :class="[`state-${state}`, { 'is-interfering': interfering }]"
      :style="timingStyle"
    >
      <!-- The key replays the interference on every switch -->
      <div :key="interferenceTick" class="retro-picture">
        <div class="panel-titlebar">
          <span v-if="shownFile" class="panel-file">{{ shownFile }}</span>
          <h3 class="panel-title">{{ shownTitle }}</h3>
          <div v-if="$slots['title-actions']" class="panel-title-actions">
            <slot name="title-actions" />
          </div>
        </div>
        <div class="panel-body">
          <div v-if="state === 'receiving'" class="panel-receiving crt-boot-text">
            {{ t('panels.receiving') }}<span class="receiving-dots">...</span>
          </div>
          <slot v-else-if="shownContent" :content="shownContent" :state="state" />
        </div>
        <div class="crt-bloom"></div>
      </div>

      <HackedScreen v-if="uiStore.syndicateHack" class="retro-hack" :scene="hackScene" />

      <CrtSnow class="retro-noise" :active="noiseActive" />

      <div class="crt-glass">
        <div class="crt-glass-scan"></div>
      </div>

      <div class="retro-overlay">
        <div class="crt-beam"></div>
      </div>
    </div>
  </ScreenBezel>
</template>

<script setup>
import { computed, watch } from 'vue'
import {
  PANEL_INTERFERENCE_MS,
  PANEL_POWER_ON_MS,
  PANEL_SWITCH_MS,
  usePanelScreen
} from '../composables/usePanelScreen'
import ScreenBezel from './ScreenBezel.vue'
import HackedScreen from './HackedScreen.vue'
import CrtSnow from './CrtSnow.vue'
import { useUIStore } from '../stores/uiStore'
import { crtScanTiming } from '../utils/crtTiming'
import { t } from '../i18n'
import { playSound } from '../sound'

const props = defineProps({
  title: { type: String, default: '' },
  // e.g. GALAXY.TXT, LEGEND.DAT
  file: { type: String, default: '' },
  // null while there is nothing yet; a new value plays a channel switch, then
  // reaches the default slot as `content`.
  content: { type: [Object, Array], default: null },
  // ms, for the cascade of screens at page load
  powerOnDelay: { type: Number, default: 0 },
  // Seeded: the casing details and steel tint stay the same across reloads.
  seed: { type: String, default: 'console' }
})

const uiStore = useUIStore()

// Joined so the file and title switch together, as one channel.
const { state, shownTitle: shownHeading, shownText: shownContent, interferenceTick, interfering } = usePanelScreen({
  title: () => `${props.file}\n${props.title}`,
  text: () => props.content,
  interferenceKey: () => uiStore.currentView
}, { powerOnDelay: props.powerOnDelay })

const shownFile = computed(() => (shownHeading.value || '').split('\n')[0])
const shownTitle = computed(() => (shownHeading.value || '').split('\n').slice(1).join(' '))

const HACK_SCENES = { lore: 'breach', music: 'locate' }
const hackScene = computed(() => HACK_SCENES[props.seed] ?? 'code')

const ledStatus = computed(() => {
  if (uiStore.syndicateHack) return 'error'
  if (state.value === 'off') return 'off'
  return state.value === 'on' ? 'on' : 'busy'
})

const timingStyle = {
  '--crt-on-duration': `${PANEL_POWER_ON_MS}ms`,
  '--panel-switch-duration': `${PANEL_SWITCH_MS}ms`,
  '--panel-interference-duration': `${PANEL_INTERFERENCE_MS}ms`,
  ...crtScanTiming(props.seed)
}

const noiseActive = computed(() => (
  state.value === 'receiving' || state.value === 'switching' || interfering.value
))
// Map only: in the wiki the contents switch with every article, and a hiss
// at each page wore the readers out.
watch(noiseActive, active => {
  if (active && uiStore.currentView !== 'wiki') playSound('static')
})
</script>

<style scoped>
/* The glass, glow, beam and keyframes are shared with the main screen (crt.css). */
.retro-panel {
  color: var(--ui-text);
  font-family: var(--font-pixel);
}

.retro-screen {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  background: var(--ui-screen);
}

.retro-picture {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 0;
  background: color-mix(in srgb, var(--ui-line) 14%, var(--ui-screen));
  transform-origin: center center;
}

.retro-screen.state-off .retro-picture {
  opacity: 0;
}

.retro-screen.state-powering .retro-picture {
  animation: crt-on var(--crt-on-duration) both;
  will-change: transform, filter, opacity;
}

.retro-screen.state-powering .crt-bloom {
  animation: bloom-on var(--crt-on-duration) both;
}

.retro-screen.state-powering .crt-beam {
  animation: beam-on var(--crt-on-duration) both;
}

/* The hack and the snow sit on the picture, under the glass (z 1, after them in the markup) */
.retro-screen .retro-hack,
.retro-noise {
  z-index: 1;
}

.retro-overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
}

.retro-screen.is-interfering .retro-picture {
  animation: crt-interference var(--panel-interference-duration) linear both;
}

/* If the channel changed together with the view, this plays instead of the interference. */
.retro-screen.state-switching .retro-picture {
  animation: crt-channel-roll var(--panel-switch-duration) linear both;
}

.panel-titlebar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  min-width: 0;
  padding: 5px 10px;
  background: color-mix(in srgb, var(--ui-line) 35%, var(--ui-screen));
  border-bottom: 1px solid var(--ui-text);
  font-size: 8px;
  line-height: 1;
  user-select: none;
}

.panel-file {
  flex-shrink: 0;
  padding: 2px 4px;
  background: var(--ui-text);
  color: var(--ui-screen);
}

.panel-title-actions {
  display: flex;
  flex-shrink: 0;
  gap: 4px;
  margin-left: auto;
}

.panel-title {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  font-size: inherit;
  font-weight: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
}

.panel-receiving {
  padding: 12px 10px;
  color: var(--ui-dim);
  font-size: 8px;
  line-height: 1.6;
}

.retro-noise {
  opacity: 0;
  transition: opacity 80ms linear;
}

.state-receiving .retro-noise {
  opacity: 0.12;
}

.retro-screen.is-interfering .retro-noise {
  opacity: 0.25;
}

.retro-screen.state-switching .retro-noise {
  opacity: 0.65;
}

.receiving-dots {
  display: inline-block;
  overflow: hidden;
  vertical-align: bottom;
  width: 0;
  animation: receiving-dots 1.2s steps(4, jump-none) infinite;
}

@keyframes receiving-dots {
  from { width: 0; }
  to { width: 3ch; }
}

@media (prefers-reduced-motion: reduce) {
  .retro-screen,
  .retro-picture,
  .receiving-dots {
    animation: none !important;
  }

  .receiving-dots {
    width: auto;
  }
}
</style>
