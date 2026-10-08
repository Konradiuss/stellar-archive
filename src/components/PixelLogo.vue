<template>
  <img
    v-if="uri && motion === 'none'"
    class="pixel-logo"
    :src="uri"
    :alt="logo.text"
    :style="{ width: `${width}px` }"
    draggable="false"
  />
  <span
    v-else-if="uri"
    class="pixel-logo is-animated"
    :class="`is-${motion}`"
    role="img"
    :aria-label="logo.text"
    :style="{ width: `${width}px`, aspectRatio: `${size.w} / ${size.h}` }"
  >
    <template v-if="letters">
      <img
        v-for="(letter, index) in letters"
        :key="index"
        class="pixel-logo-letter"
        :src="letter.uri"
        alt=""
        draggable="false"
        :style="{ left: `${letter.left}%`, width: `${letter.width}%`, animationDelay: `${letterDelay(index)}ms` }"
      />
    </template>
    <img v-else class="pixel-logo-image" :src="uri" alt="" draggable="false" />
    <span v-if="motion === 'shine'" class="pixel-logo-shine" :style="{ maskImage: `url(${uri})`, WebkitMaskImage: `url(${uri})` }" aria-hidden="true"></span>
  </span>
  <div
    v-else
    class="pixel-logo-text"
    role="img"
    :aria-label="logo.text"
    :style="{ color: colors.fill[Math.floor(colors.fill.length / 2)], fontSize: `${LOGO_FONTS[logo.font]?.size * logo.scale}px` }"
  >{{ logo.text }}</div>
</template>

<script setup>
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { loadPixelFont } from '../utils/fontLoader'
import { spriteToDataUri } from '../utils/pixelArt'
import { LOGO_FONTS, buildLogoSprite, inkRuns, logoColors, logoMask, maskColumns } from '../utils/pixelLogo'
import { prefersReducedMotion } from '../utils/reducedMotion'

const props = defineProps({
  // { text, style, colors, outline, shadow, font, scale, animation } of {{Banner}}
  logo: { type: Object, required: true }
})

const LETTER_MOTIONS = new Set(['bounce', 'wave'])

const uri = ref(null)
const width = ref(0)
const size = ref({ w: 1, h: 1 })
// [{ uri, left, width }] in % of the logo; null: one picture.
const letters = shallowRef(null)
const colors = computed(() => logoColors(props.logo))
const motion = computed(() => (prefersReducedMotion() ? 'none' : props.logo.animation ?? 'none'))

// Wave letters start with a negative delay, so the wave runs from the first frame.
const letterDelay = index => (motion.value === 'wave' ? -index * 120 : index * 90)

let token = 0
async function draw() {
  const current = ++token
  const font = LOGO_FONTS[props.logo.font] ?? LOGO_FONTS.tiny5
  // Load the glyphs of the text too: Latin and Cyrillic are in separate parts of the font.
  await loadPixelFont(`${font.size}px "${font.family}"`)
  await globalThis.document?.fonts?.load?.(`${font.size}px "${font.family}"`, props.logo.text).catch(() => {})
  if (current !== token) return
  const mask = logoMask(props.logo.text, props.logo.font)
  if (!mask) {
    uri.value = null
    return
  }
  const { fill, outline, shadow } = colors.value
  const look = { fill, outline, shadow: props.logo.shadow === false ? null : shadow }
  const sprite = buildLogoSprite(mask, look)
  uri.value = spriteToDataUri(sprite)
  width.value = sprite.w * props.logo.scale
  size.value = { w: sprite.w, h: sprite.h }
  // A letter's picture starts at its mask column: the outline before it takes
  // the place of the frame pixel around the mask.
  letters.value = LETTER_MOTIONS.has(motion.value)
    ? inkRuns(mask).map(run => {
      const letter = buildLogoSprite(maskColumns(mask, run.from, run.to), look)
      return { uri: spriteToDataUri(letter), left: (run.from / sprite.w) * 100, width: (letter.w / sprite.w) * 100 }
    })
    : null
}

onMounted(draw)
watch(() => props.logo, draw, { deep: true })
watch(motion, draw)
</script>

<style scoped>
.pixel-logo {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
  image-rendering: pixelated;
}

.pixel-logo.is-animated {
  position: relative;
}

.pixel-logo-image,
.pixel-logo-letter {
  position: absolute;
  top: 0;
  height: 100%;
  image-rendering: pixelated;
  user-select: none;
}

.pixel-logo-image {
  left: 0;
  width: 100%;
}

.is-bounce .pixel-logo-letter {
  animation: pixel-logo-bounce 2.4s ease-out infinite;
}

@keyframes pixel-logo-bounce {
  0%, 30%, 100% { transform: translateY(0); }
  10% { transform: translateY(-16%); }
  20% { transform: translateY(2%); }
}

.is-wave .pixel-logo-letter {
  animation: pixel-logo-wave 1.6s ease-in-out infinite;
}

@keyframes pixel-logo-wave {
  0%, 100% { transform: translateY(6%); }
  50% { transform: translateY(-6%); }
}

.pixel-logo.is-float {
  animation: pixel-logo-float 3.2s ease-in-out infinite alternate;
}

@keyframes pixel-logo-float {
  from { transform: translateY(-4%); }
  to { transform: translateY(4%); }
}

.pixel-logo-shine {
  position: absolute;
  inset: 0;
  background: linear-gradient(105deg, transparent 42%, rgb(255 255 255 / 70%) 50%, transparent 58%) no-repeat;
  background-size: 300% 100%;
  mask-size: 100% 100%;
  -webkit-mask-size: 100% 100%;
  animation: pixel-logo-shine 3.6s ease-in-out infinite;
  pointer-events: none;
}

@keyframes pixel-logo-shine {
  0% { background-position: 100% 0; }
  45%, 100% { background-position: 0 0; }
}

.pixel-logo.is-flicker {
  animation: pixel-logo-flicker 4.2s linear infinite;
}

@keyframes pixel-logo-flicker {
  0%, 17%, 21%, 23%, 52%, 56%, 100% { opacity: 1; }
  19%, 22%, 54% { opacity: 0.35; }
}

@media (prefers-reduced-motion: reduce) {
  .pixel-logo,
  .pixel-logo-letter,
  .pixel-logo-shine {
    animation: none !important;
  }
}

.pixel-logo-text {
  font-family: 'Tiny5', 'Press Start 2P', monospace;
  line-height: 1.1;
  text-align: center;
  text-shadow: 2px 2px 0 var(--ui-screen);
}
</style>
