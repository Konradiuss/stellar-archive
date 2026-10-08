<template>
  <div class="syndicate-hack" :class="`is-${phase}`" :style="glitch.style.value" role="alert" aria-live="assertive">
    <HackCodeRain v-if="phase !== 'breach'" class="hack-rain" :density="0.1" ink="rgba(0, 0, 0, 0.3)" :tear="false" />
    <div v-if="phase === 'breach'" class="hack-breach">{{ t('syndicate.breach') }}</div>
    <div v-else class="hack-sign">
      <img class="hack-snake" :src="snake" alt="" draggable="false" />
      <PixelLogo class="hack-title" :logo="TITLE" />
      <div class="hack-caption">{{ phase === 'reboot' ? t('syndicate.rebooting') : t('syndicate.caption') }}</div>
    </div>
    <template v-if="phase !== 'breach'">
      <HackNukeWindow class="hack-side is-left" />
      <HackCrewMonitor class="hack-side is-right" />
    </template>
  </div>
</template>

<script setup>
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useUIStore } from '../stores/uiStore'
import { useScreenGlitch } from '../composables/useScreenGlitch'
import { snakeUri } from '../utils/syndicateSnake'
import { t } from '../i18n'
import PixelLogo from './PixelLogo.vue'
import HackNukeWindow from './HackNukeWindow.vue'
import HackCrewMonitor from './HackCrewMonitor.vue'
import HackCodeRain from './HackCodeRain.vue'

// The song lasts 11 s; the timer ends the hack if the browser does not play it.
const HACK_AUDIO = 'audio/syndicate.mp3'
const BREACH_MS = 800
const HACK_MS = 11200
const REBOOT_MS = 700

const TITLE = { text: t('syndicate.title'), colors: ['#000000', '#1a0000'], outline: '#ff3030', shadow: false, font: 'press', scale: 6 }

const uiStore = useUIStore()
const glitch = useScreenGlitch({ pause: [600, 2600], strength: 0.7 })
const snake = snakeUri()
const phase = ref('breach')
const timers = []
let audio = null
let rebooting = false

function later(callback, delay) {
  timers.push(setTimeout(callback, delay))
}

function reboot() {
  if (rebooting) return
  rebooting = true
  phase.value = 'reboot'
  audio?.pause()
  uiStore.resetWindows()
  later(async () => {
    await nextTick()
    window.location.reload()
  }, REBOOT_MS)
}

onMounted(() => {
  try {
    audio = new Audio(new URL(HACK_AUDIO, document.baseURI).href)
    audio.addEventListener('ended', reboot)
    audio.play()?.catch?.(() => {})
  } catch {
    audio = null
  }
  later(() => { phase.value = 'owned' }, BREACH_MS)
  later(reboot, HACK_MS)
})

onUnmounted(() => {
  timers.forEach(clearTimeout)
  audio?.pause()
})
</script>

<style scoped>
/* Larger than the screen, so a glitch shift shows no edge. */
.syndicate-hack {
  position: absolute;
  inset: -8px;
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: radial-gradient(ellipse at center, #b00000 0%, #6a0000 70%, #3a0000 100%);
  font-family: var(--font-pixel);
  color: #000;
  container-type: size;
}

.is-breach {
  animation: hack-flicker 0.16s steps(2) infinite;
}

.hack-breach {
  font-size: clamp(14px, 3vw, 32px);
  color: #ff3030;
  text-shadow: 0 0 12px #ff0000;
  letter-spacing: 2px;
}

.hack-sign {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(6px, 3cqh, 24px);
  max-width: 100%;
  padding: 16px;
  box-sizing: border-box;
}

.hack-snake {
  width: auto;
  height: min(288px, 48cqh);
  image-rendering: pixelated;
  filter: drop-shadow(0 0 18px rgba(0, 0, 0, 0.6));
}

.hack-title {
  max-width: 92cqw;
  max-height: 16cqh;
  object-fit: contain;
}

.hack-caption {
  font-size: clamp(7px, 1.4cqw, 16px);
  color: #000;
  background: #ff3030;
  padding: 6px 10px;
  animation: hack-blink var(--blink-duration, 0.9s) steps(2) var(--blink-delay, 0s) infinite;
}

.is-reboot .hack-caption {
  animation: none;
}

@keyframes hack-blink {
  0% { opacity: 1; }
  100% { opacity: 0; }
}

.hack-side {
  position: absolute;
  z-index: 1;
  top: 6cqh;
  bottom: 6cqh;
  width: min(340px, 25cqw);
}

.hack-side.is-left {
  left: 3cqw;
}

.hack-side.is-right {
  right: 3cqw;
}

@container (max-width: 820px) {
  .hack-side {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .is-breach,
  .hack-caption {
    animation: none;
  }
}
</style>

<style>
.syndicate-hack .hack-panel {
  font-family: var(--font-pixel);
  font-size: clamp(7px, 0.62cqw, 9px);
  line-height: 1.6;
  color: #000;
  background: #c81414;
  border: 2px solid #000;
  box-shadow: 5px 5px 0 rgba(0, 0, 0, 0.55);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
  animation: hack-panel-open 0.18s steps(3, end) both;
}

.syndicate-hack .hack-panel-title {
  padding: 3px 6px;
  color: #ff3030;
  background: #000;
}

.syndicate-hack .hack-panel-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 8px 10px 10px;
}

.syndicate-hack .hack-panel-blink {
  animation: hack-panel-blink 0.8s steps(2) infinite;
}

.syndicate-hack .hack-panel-heading {
  margin-bottom: 0.6em;
}

.syndicate-hack .hack-panel-progress {
  height: 8px;
  background: rgba(0, 0, 0, 0.25);
}

.syndicate-hack .hack-panel-progress span {
  display: block;
  height: 100%;
  background: #000;
  transition: width 0.25s steps(4, end);
}

.syndicate-hack .hack-panel-progress.is-done span {
  background: #9de64e;
}

@keyframes hack-panel-open {
  from { transform: scale(0.2, 0.05); }
  to { transform: none; }
}

@keyframes hack-panel-blink {
  0% { opacity: 1; }
  100% { opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .syndicate-hack .hack-panel,
  .syndicate-hack .hack-panel-blink {
    animation: none;
  }
}
</style>
