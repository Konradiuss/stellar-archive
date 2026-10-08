<template>
  <div ref="rootRef" class="screen-bezel" :class="`led-${status}`" :data-tint="casing.tint" :style="casingStyle">
    <div class="screen-bezel-screen">
      <slot />
    </div>
    <div class="bezel-decor" aria-hidden="true">
      <div
        v-for="part in parts"
        :key="part.key"
        class="bezel-part"
        :style="partStyle(part)"
      ></div>
      <div class="bezel-led" :style="placement(casing.led)"></div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { layoutBezel, ledPace } from '../utils/bezelDecor'
import { BEZEL_BOTTOM, BEZEL_EDGE } from '../utils/bezelSprites'
import { consolePx, useScreenLayout } from '../composables/useScreenLayout'

// 1 sprite pixel = `px` CSS pixels
const { layout } = useScreenLayout()
const px = computed(() => consolePx(layout.value))

const props = defineProps({
  // 'off' | 'busy' | 'on' | 'error'
  status: { type: String, default: 'on' },
  // Seeded: the same casing on every reload.
  seed: { type: String, default: 'console' }
})

const rootRef = ref(null)
const size = shallowRef({ width: 0, height: 0 })

const casing = computed(() => layoutBezel({ seed: props.seed, ...size.value }))
const parts = computed(() => [...casing.value.bolts, ...casing.value.items])

const pace = ledPace()

const casingStyle = computed(() => ({
  ...pace,
  '--console-px': `${px.value}px`,
  '--bezel-edge': BEZEL_EDGE,
  '--bezel-bottom': BEZEL_BOTTOM,
  borderImageSource: `url("${casing.value.baseUri}")`
}))

const toCss = value => `calc(var(--console-px) * ${value})`

function placement(position) {
  const style = { width: toCss(position.w), height: toCss(position.h) }
  for (const edge of ['left', 'right', 'top', 'bottom']) {
    if (position[edge] !== undefined) style[edge] = toCss(position[edge])
  }
  return style
}

function partStyle(part) {
  return { ...placement(part), backgroundImage: `url("${part.uri}")` }
}

let observer = null
let measured = { width: 0, height: 0 }
function measure(width, height) {
  measured = { width, height }
  const next = { width: Math.floor(width / px.value), height: Math.floor(height / px.value) }
  if (next.width !== size.value.width || next.height !== size.value.height) size.value = next
}
watch(px, () => measure(measured.width, measured.height))

onMounted(() => {
  const element = rootRef.value
  measure(element.offsetWidth, element.offsetHeight)
  observer = new ResizeObserver(([entry]) => {
    const box = entry.borderBoxSize?.[0]
    if (box) measure(box.inlineSize, box.blockSize)
    else measure(element.offsetWidth, element.offsetHeight)
  })
  observer.observe(element)
})

onBeforeUnmount(() => observer?.disconnect())
</script>

<style scoped>
.screen-bezel {
  position: relative;
  display: flex;
  flex-direction: column;
  border-style: solid;
  border-width:
    calc(var(--console-px) * var(--bezel-edge))
    calc(var(--console-px) * var(--bezel-edge))
    calc(var(--console-px) * var(--bezel-bottom))
    calc(var(--console-px) * var(--bezel-edge));
  /* 9-slice; the image and ring sizes come from the inline style */
  border-image-slice: var(--bezel-edge) var(--bezel-edge) var(--bezel-bottom) var(--bezel-edge);
  border-image-repeat: stretch;
  image-rendering: pixelated;
}

.screen-bezel-screen {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: #000000;
}

/* Covers the whole border box so details are placed from its outer edges. */
.bezel-decor {
  position: absolute;
  top: calc(var(--console-px) * -1 * var(--bezel-edge));
  right: calc(var(--console-px) * -1 * var(--bezel-edge));
  bottom: calc(var(--console-px) * -1 * var(--bezel-bottom));
  left: calc(var(--console-px) * -1 * var(--bezel-edge));
  pointer-events: none;
}

.bezel-part {
  position: absolute;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  image-rendering: pixelated;
}

.bezel-led {
  position: absolute;
  background: var(--led-color);
  box-shadow:
    0 0 0 var(--console-px) #151515,
    inset var(--console-px) var(--console-px) 0 var(--led-shine),
    0 0 calc(var(--console-px) * 4) var(--led-glow);
}

.led-off {
  --led-color: #2c2f2f;
  --led-shine: #3a3e3e;
  --led-glow: transparent;
}

.led-on {
  --led-color: #2fbf4f;
  --led-shine: #9dffb0;
  --led-glow: rgba(47, 191, 79, 0.45);
}

.led-busy {
  --led-color: #d99a1e;
  --led-shine: #ffe08a;
  --led-glow: rgba(217, 154, 30, 0.5);
  /* An off lamp is a dark amber lens, not a transparent hole */
  --led-dim-color: #5a3f0f;
  --led-dim-shine: #7a5a1e;
}

.led-busy .bezel-led {
  animation: led-blink var(--led-period, 0.6s) steps(1, end) var(--led-phase, 0s) infinite;
}

.led-error {
  --led-color: #c43232;
  --led-shine: #ff9a9a;
  --led-glow: rgba(196, 50, 50, 0.5);
}

/* Only the light fades: the outline and lens stay opaque */
@keyframes led-blink {
  0%, 50% {
    background: var(--led-color);
  }
  50.01%, 100% {
    background: var(--led-dim-color);
    box-shadow:
      0 0 0 var(--console-px) #151515,
      inset var(--console-px) var(--console-px) 0 var(--led-dim-shine),
      0 0 0 transparent;
  }
}

@media (prefers-reduced-motion: reduce) {
  .led-busy .bezel-led {
    animation: none;
  }
}
</style>
