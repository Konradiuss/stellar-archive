<template>
  <div class="glitch-container">
    <span class="glitch-text">{{ displayText }}</span>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  length: {
    type: Number,
    default: 20
  },
  speed: {
    type: Number,
    default: 50 // ms
  }
})

const displayText = ref('')

const glitchChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*+-=<>[]{}|/'

let intervalId = null

function randomChar() {
  return glitchChars[Math.floor(Math.random() * glitchChars.length)]
}

function updateText() {
  let newText = ''
  for (let i = 0; i < props.length; i++) {
    newText += randomChar()
  }
  displayText.value = newText
}

onMounted(() => {
  updateText()
  intervalId = setInterval(updateText, props.speed)
})

onUnmounted(() => {
  if (intervalId) {
    clearInterval(intervalId)
  }
})
</script>

<style scoped>
.glitch-container {
  display: inline-block;
  font-family: var(--font-pixel);
  overflow: hidden;
}

.glitch-text {
  display: inline-block;
  color: inherit;
  animation: glitch 0.3s infinite;
  letter-spacing: 0;
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
  image-rendering: crisp-edges;
}

@keyframes glitch {
  0% {
    opacity: 1;
    transform: translateX(0);
  }
  20% {
    opacity: 0.7;
    transform: translateX(-1px);
  }
  40% {
    opacity: 1;
    transform: translateX(1px);
  }
  60% {
    opacity: 0.8;
    transform: translateX(-1px);
  }
  80% {
    opacity: 1;
    transform: translateX(1px);
  }
  100% {
    opacity: 1;
    transform: translateX(0);
  }
}
</style>
