<template>
  <!-- While focused, the field keeps what was typed, not what the page reads back
       (trailing spaces, a new line just begun). -->
  <textarea
    v-if="multiline"
    class="editor-input editor-commit-text is-multiline"
    :value="shown"
    :rows="rows"
    spellcheck="false"
    @focus="focused = true"
    @blur="leave"
    @input="type($event.target.value)"
  ></textarea>
  <input
    v-else
    class="editor-input editor-commit-text"
    :value="shown"
    :placeholder="placeholder"
    spellcheck="false"
    @focus="focused = true"
    @blur="leave"
    @input="type($event.target.value)"
    @keydown.enter="$event.target.blur()"
  />
</template>

<script setup>
import { computed, onUnmounted, ref } from 'vue'

const props = defineProps({
  value: { type: String, default: '' },
  multiline: { type: Boolean, default: false },
  rows: { type: Number, default: 4 },
  placeholder: { type: String, default: '' }
})
const emit = defineEmits(['commit'])

const focused = ref(false)
const typed = ref(null)
const shown = computed(() => (focused.value && typed.value !== null ? typed.value : props.value))
let timer = null

function commit() {
  clearTimeout(timer)
  timer = null
  if (typed.value !== null && typed.value !== props.value) emit('commit', typed.value)
}

function type(value) {
  typed.value = value
  clearTimeout(timer)
  timer = setTimeout(commit, 400)
}

function leave() {
  commit()
  focused.value = false
  typed.value = null
}

onUnmounted(commit)
</script>

<style scoped>
.editor-commit-text.is-multiline {
  min-height: 0;
  resize: vertical;
  font-family: var(--ed-mono, monospace);
  line-height: 1.5;
}
</style>
