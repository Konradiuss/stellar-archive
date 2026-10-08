<template>
  <div class="crt-screen" :class="`phase-${uiStore.transitionPhase}`" :style="timingStyle">
    <div class="crt-picture" @animationend.self="handlePictureAnimationEnd">
      <slot />
      <div class="crt-bloom"></div>
    </div>

    <div class="crt-glass">
      <div class="crt-glass-scan"></div>
    </div>

    <div class="crt-overlay">
      <div class="crt-beam"></div>
      <div v-if="afterglowKey && uiStore.transitionPhase === 'waiting'" :key="afterglowKey" class="crt-dot"></div>

      <div v-if="uiStore.loaderVisible" class="loader crt-boot-text">
        <div class="loader-title">{{ t('loader.title') }}</div>
        <div class="loader-rule">==============================</div>
        <div v-for="(step, index) in uiStore.loadingLog" :key="index" class="loader-line">
          &gt; {{ padLoaderLabel(t(step.key, step.params)) }} <span :class="step.done ? 'loader-ok' : 'loader-busy'">{{ step.done ? 'OK' : spinnerFrame }}</span>
        </div>
        <div v-if="uiStore.loadError" class="loader-line loader-error">
          {{ t('loader.error', { message: t(uiStore.loadError.key, uiStore.loadError.params) }) }}
        </div>
        <div v-if="uiStore.loadError && uiStore.loadErrorDetails.length" class="loader-details">
          <div v-for="(line, index) in uiStore.loadErrorDetails" :key="index" class="loader-detail">{{ line || ' ' }}</div>
        </div>
        <button v-if="uiStore.loadError && hasPlace()" type="button" class="loader-leave" @click="openGalaxy">{{ t('loader.toGalaxy') }}</button>
        <div class="loader-cursor">_</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { useUIStore } from '../stores/uiStore'
import { t } from '../i18n'
import { SHUTTER_OFF_MS, SHUTTER_ON_MS, crtScanTiming } from '../utils/crtTiming'
import { prefersReducedMotion } from '../utils/reducedMotion'
import { padLoaderLabel } from '../utils/loaderLines'

const SPINNER_FRAMES = ['|', '/', '-', '\\']

const uiStore = useUIStore()
const afterglowKey = ref(0)
const spinnerIndex = ref(0)
let fallbackTimer = null
let spinnerInterval = null

const spinnerFrame = computed(() => SPINNER_FRAMES[spinnerIndex.value % SPINNER_FRAMES.length])

// A function, not a computed: location.hash is not reactive.
const hasPlace = () => Boolean(window.location.hash)
function openGalaxy() {
  window.location.replace(`${window.location.pathname}${window.location.search}`)
}
const timingStyle = {
  '--crt-off-duration': `${SHUTTER_OFF_MS}ms`,
  '--crt-on-duration': `${SHUTTER_ON_MS}ms`,
  ...crtScanTiming('map')
}

watch(() => uiStore.transitionPhase, (phase, previousPhase) => {
  clearTimeout(fallbackTimer)
  fallbackTimer = null

  if (phase === 'waiting' && previousPhase === 'closing') afterglowKey.value++

  if (phase !== 'closing' && phase !== 'opening') return
  const finish = phase === 'closing' ? uiStore.finishClosing : uiStore.finishOpening
  if (prefersReducedMotion()) {
    finish()
    return
  }
  // animationend is not guaranteed (hidden tab, interrupted animation).
  const duration = phase === 'closing' ? SHUTTER_OFF_MS : SHUTTER_ON_MS
  fallbackTimer = setTimeout(finish, duration + 100)
})

watch(() => uiStore.loaderVisible, visible => {
  clearInterval(spinnerInterval)
  spinnerInterval = visible
    ? setInterval(() => { spinnerIndex.value++ }, 150)
    : null
}, { immediate: true })

onUnmounted(() => {
  clearTimeout(fallbackTimer)
  clearInterval(spinnerInterval)
})

// Scoped CSS hashes keyframe names, so the current phase tells which animation ended.
function handlePictureAnimationEnd() {
  if (uiStore.transitionPhase === 'closing') uiStore.finishClosing()
  else if (uiStore.transitionPhase === 'opening') uiStore.finishOpening()
}

</script>

<style scoped>
/* The shared CRT glass, beam and keyframes live in src/styles/crt.css. */
.crt-screen {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  background: var(--ui-screen);
}

.crt-picture {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden; /* Suns at the map edge must not stick out of the squashed strip */
  transform-origin: center center;
}

.phase-closing .crt-picture {
  animation: crt-off var(--crt-off-duration) forwards;
  will-change: transform, filter, opacity;
}

.phase-closing .crt-bloom {
  animation: bloom-off var(--crt-off-duration) forwards;
}

.phase-waiting .crt-picture {
  opacity: 0;
}

.phase-opening .crt-picture {
  animation: crt-on var(--crt-on-duration) both;
  will-change: transform, filter, opacity;
}

.phase-opening .crt-bloom {
  animation: bloom-on var(--crt-on-duration) both;
}

.crt-overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
}

/* Blocks clicks on the map during a transition */
.crt-screen:not(.phase-idle) .crt-overlay {
  pointer-events: auto;
}

.phase-closing .crt-beam {
  animation: beam-off var(--crt-off-duration) forwards;
}

.phase-opening .crt-beam {
  animation: beam-on var(--crt-on-duration) both;
}

.loader {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  max-width: calc(100% - 48px);
  color: color-mix(in srgb, var(--ui-text) 61%, var(--ui-dim));
  font-family: 'Courier New', monospace;
  font-size: 16px;
  line-height: 1.5;
  white-space: pre;
  overflow: hidden;
}

.loader-title {
  color: var(--ui-text);
}

.loader-rule {
  color: color-mix(in srgb, var(--ui-dim) 74%, var(--ui-line));
  margin-bottom: 6px;
}

.loader-ok {
  color: var(--ui-ok);
  text-shadow: 0 0 6px rgb(var(--ui-ok-rgb) / 0.6);
}

.loader-busy {
  color: var(--ui-text);
}

.loader-error {
  color: var(--ui-error);
  text-shadow: 0 0 6px rgb(var(--ui-error-rgb) / 0.6);
}

.loader-details {
  margin: 6px 0;
  color: color-mix(in srgb, var(--ui-text) 61%, var(--ui-dim));
}

.loader-detail {
  max-width: 76ch;
  white-space: pre-wrap;
}

.loader-leave {
  display: block;
  margin: 6px 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--ui-text);
  font: inherit;
  cursor: pointer;
}

.loader-leave:hover,
.loader-leave:focus-visible {
  background: var(--ui-text);
  color: var(--ui-screen);
  outline: none;
}

.loader-cursor {
  animation: crt-blink 1s steps(1, end) infinite;
}

/* Same phone breakpoint as composables/useScreenLayout.js */
@media (max-width: 600px) {
  .loader {
    font-size: 11px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .crt-picture,
  .loader-cursor {
    animation: none !important;
  }
}
</style>
