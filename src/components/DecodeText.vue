<template>
  <span class="decode-text" :aria-label="text">
    <span aria-hidden="true">{{ shown }}</span>
  </span>
</template>

<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { prefersReducedMotion } from '../utils/reducedMotion'

const props = defineProps({
  text: { type: String, default: '' },
  // ms
  delay: { type: Number, default: 0 },
  duration: { type: Number, default: 400 }
})

const GLYPHS = '!#$%&*+-/0123456789<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_{|}~'
const FRAME_MS = 35

const shown = ref('')
let timer = null
let startedAt = 0

function scramble(text, revealed) {
  let result = text.slice(0, revealed)
  for (let index = revealed; index < text.length; index++) {
    result += text[index] === ' ' ? ' ' : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
  }
  return result
}

function stop() {
  clearInterval(timer)
  timer = null
}

function start(text) {
  stop()
  if (!text || prefersReducedMotion()) {
    shown.value = text
    return
  }
  startedAt = performance.now()
  shown.value = scramble(text, 0)
  timer = setInterval(() => {
    const progress = (performance.now() - startedAt - props.delay) / props.duration
    const revealed = Math.max(0, Math.min(text.length, Math.floor(progress * text.length)))
    shown.value = scramble(text, revealed)
    if (revealed >= text.length) stop()
  }, FRAME_MS)
}

watch(() => props.text, start, { immediate: true })
onBeforeUnmount(stop)
</script>
