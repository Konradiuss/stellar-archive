<template>
  <div class="hacked-screen" :class="`scene-${scene}`" :style="glitch.style.value" aria-hidden="true">
    <HackCodeRain class="hacked-code" background="#a80000" :density="scene === 'code' ? 0.85 : 0.4" :ink="scene === 'code' ? '#000000' : 'rgba(0, 0, 0, 0.35)'" />
    <div v-if="breaching" class="hacked-flicker"></div>

    <div v-if="scene === 'breach'" class="hacked-breach">
      <div class="hacked-heading">
        <div class="hacked-word">{{ t('syndicate.accessGranted') }}</div>
        <div class="hacked-word is-steady">{{ t('syndicate.userCompromised') }}</div>
      </div>
      <div class="hacked-cascade">
        <div
          v-for="(entry, index) in BREACH_WINDOWS.slice(0, windowsOpen)"
          :key="index"
          class="hack-window"
          :style="{ top: `${index * 13}%`, left: `${index * 3.5}%` }"
        >
          <div class="hack-window-title">{{ entry.title }}</div>
          <div class="hack-window-body">
            <div v-for="line in entry.lines" :key="line">{{ line }}</div>
            <div v-if="entry.progress" class="hack-window-progress"><span></span></div>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="scene === 'locate'" class="hacked-locate">
      <div class="hacked-word">{{ t('syndicate.locating') }}</div>
      <div class="hacked-loading">
        <span v-for="index in LOADING_CELLS" :key="index" :class="{ 'is-on': index <= loadingCells }"></span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { useScreenGlitch } from '../composables/useScreenGlitch'
import HackCodeRain from './HackCodeRain.vue'
import { t } from '../i18n'

defineProps({
  // 'code' | 'breach' | 'locate'
  scene: { type: String, default: 'code' }
})

// The first line of each text is the window title.
const BREACH_WINDOWS = [
  { key: 'syndicate.windowUsers' },
  // Early: the crew monitor on the main screen starts losing people after it.
  { key: 'syndicate.windowAtmos', progress: true },
  { key: 'syndicate.windowDatabase', progress: true },
  { key: 'syndicate.windowBank', progress: true },
  { key: 'syndicate.windowAccess' },
  { key: 'syndicate.windowMainframe' },
  { key: 'syndicate.windowPower' }
].map(({ key, progress }) => {
  const [title, ...lines] = t(key).split('\n')
  return { title, lines, progress }
})
// As long as SECURITY BREACH on the main screen (SyndicateHack.vue).
const BREACH_MS = 800
const WINDOW_FIRST_MS = 500
const WINDOW_EVERY_MS = 1400
const LOADING_CELLS = 16

const glitch = useScreenGlitch()

const breaching = ref(true)
const windowsOpen = ref(0)
const loadingCells = ref(0)
const timers = []

function stepLoading() {
  loadingCells.value = Math.min(LOADING_CELLS - 1, loadingCells.value + 1 + ((Math.random() * 2) | 0))
  timers.push(setTimeout(stepLoading, 300 + Math.random() * 900))
}

onMounted(() => {
  timers.push(setTimeout(() => { breaching.value = false }, BREACH_MS))
  BREACH_WINDOWS.forEach((entry, index) => {
    timers.push(setTimeout(() => { windowsOpen.value = index + 1 }, WINDOW_FIRST_MS + index * WINDOW_EVERY_MS))
  })
  stepLoading()
})

onUnmounted(() => timers.forEach(clearTimeout))
</script>

<style scoped>
/* Larger than the screen, so a glitch shift shows no edge. */
.hacked-screen {
  position: absolute;
  inset: -8px;
  z-index: 2;
  overflow: hidden;
  background: #a80000;
  filter: sepia(0.3) saturate(1.5) contrast(1.1);
  container-type: size;
}

.hacked-code {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
}

.hacked-flicker {
  position: absolute;
  inset: 0;
  z-index: 5;
  animation: hack-flicker 0.16s steps(2) infinite;
}

/* No box behind the words: a red rim around each letter keeps them readable. */
.hacked-word {
  font-family: var(--font-pixel);
  font-size: clamp(9px, 1.2vw, 14px);
  line-height: 1.4;
  color: #000;
  text-align: center;
  text-shadow: 2px 0 #a80000, -2px 0 #a80000, 0 2px #a80000, 0 -2px #a80000, 2px 2px #a80000, -2px -2px #a80000, 2px -2px #a80000, -2px 2px #a80000;
  animation: hacked-blink var(--blink-duration, 0.9s) steps(2) var(--blink-delay, 0s) infinite;
}

.hacked-word.is-steady {
  animation: none;
}

.hacked-breach {
  position: absolute;
  inset: 8px;
  display: flex;
  flex-direction: column;
}

.hacked-heading {
  flex: 0 0 33%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 0 8px;
}

.hacked-cascade {
  position: relative;
  flex: 1 1 auto;
  margin: 0 8px 8px;
  overflow: hidden;
}

.hack-window {
  position: absolute;
  width: 78%;
  font-family: var(--font-pixel);
  font-size: clamp(6px, 0.55vw, 8px);
  line-height: 1.6;
  color: #000;
  background: #c81414;
  border: 2px solid #000;
  box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.55);
  animation: hack-window-open 0.18s steps(3, end) both;
}

.hack-window-title {
  padding: 2px 4px;
  color: #ff3030;
  background: #000;
}

.hack-window-body {
  padding: 4px 6px 6px;
}

.hack-window-progress {
  height: 6px;
  margin-top: 4px;
  background: rgba(0, 0, 0, 0.3);
}

.hack-window-progress span {
  display: block;
  height: 100%;
  background: #000;
  animation: hack-progress 1.2s steps(10, end) both;
}

@keyframes hack-window-open {
  from { transform: scale(0.2, 0.05); }
  to { transform: none; }
}

@keyframes hack-progress {
  from { width: 0; background: #000; }
  90% { background: #000; }
  to { width: 100%; background: #9de64e; }
}

.hacked-locate {
  position: absolute;
  inset: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 8px;
}

.hacked-loading {
  display: flex;
  gap: 3px;
}

.hacked-loading span {
  width: 8px;
  height: 10px;
  background: rgba(0, 0, 0, 0.25);
}

.hacked-loading span.is-on {
  background: #000;
}

@container (max-height: 70px) {
  .hacked-locate {
    flex-direction: row;
    gap: 8px;
    padding: 4px;
  }

  .hacked-locate .hacked-word {
    font-size: 7px;
  }

  .hacked-loading {
    gap: 2px;
  }

  .hacked-loading span {
    width: 5px;
    height: 8px;
  }
}

@keyframes hacked-blink {
  0% { opacity: 1; }
  100% { opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .hacked-word,
  .hacked-flicker,
  .hack-window,
  .hack-window-progress span {
    animation: none;
  }
}
</style>
