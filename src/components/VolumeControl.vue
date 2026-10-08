<template>
  <div class="volume-control" :class="{ 'is-off': off, 'is-waiting': waiting }">
    <button
      type="button"
      class="volume-label"
      :aria-pressed="!off"
      :aria-label="toggleLabel"
      :data-hint="waiting ? toggleLabel : null"
      @pointerdown="remember"
      @keydown="remember"
      @click="press"
    >{{ label }}</button>
    <VolumeSlider
      v-if="!compact"
      class="volume-bar"
      :percent="percent"
      :label="sliderLabel"
      :dim="off"
      @change="value => $emit('change', value)"
    />
  </div>
</template>

<script setup>
import VolumeSlider from './VolumeSlider.vue'

const props = defineProps({
  label: { type: String, required: true },
  percent: { type: Number, required: true },
  off: { type: Boolean, default: false },
  toggleLabel: { type: String, required: true },
  sliderLabel: { type: String, required: true },
  compact: { type: Boolean, default: false },
  // On, but the browser holds the sound until the first press of the page.
  waiting: { type: Boolean, default: false }
})
const emit = defineEmits(['toggle', 'change', 'wake'])

// A press that began while the label blinked wakes the sound instead of turning it off.
// Decided on pointerdown: the sound may already run when the click comes.
let firstPress = false
const remember = () => { firstPress = props.waiting }
function press() {
  const wake = firstPress || props.waiting
  firstPress = false
  emit(wake ? 'wake' : 'toggle')
}
</script>

<style scoped>
.volume-control {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 18px;
}

.volume-label {
  height: 18px;
  padding: 0 2px;
  border: 0;
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  appearance: none;
  cursor: none;
}

.volume-label:hover,
.volume-label:focus-visible {
  background: var(--ui-text);
  color: var(--ui-screen);
  outline: none;
}

.volume-control.is-off .volume-label:not(:hover):not(:focus-visible) {
  color: var(--ui-dim);
  text-decoration: line-through;
}

.volume-bar {
  width: 44px;
}

.volume-control.is-waiting .volume-label:not(:hover):not(:focus-visible) {
  animation: volume-waiting 1s steps(1, end) infinite;
}

@keyframes volume-waiting {
  50% {
    color: var(--ui-dim);
  }
}

@media (prefers-reduced-motion: reduce) {
  .volume-control.is-waiting .volume-label:not(:hover):not(:focus-visible) {
    animation: none;
    color: var(--ui-dim);
  }
}
</style>
