<template>
  <div class="editor-text">
    <div class="editor-text-body">
      <pre v-if="!wrap" ref="gutterRef" class="editor-gutter" aria-hidden="true">{{ numbers }}</pre>
      <textarea
        ref="areaRef"
        class="editor-area"
        :class="{ 'is-wrapped': wrap }"
        :value="modelValue"
        :aria-label="label"
        spellcheck="false"
        autocomplete="off"
        autocapitalize="off"
        :wrap="wrap ? 'soft' : 'off'"
        @input="emit('update:modelValue', $event.target.value)"
        @scroll="syncGutter"
        @keydown="handleKey"
        @keyup="updateCaret"
        @click="updateCaret"
        @select="updateCaret"
      ></textarea>
    </div>
    <div class="editor-text-status">{{ t('editor.position', caret) }}</div>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { t } from '../i18n'

const props = defineProps({
  modelValue: { type: String, default: '' },
  label: { type: String, default: '' },
  // { start, end }; a new object each time.
  show: { type: Object, default: null },
  wrap: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue'])

const areaRef = ref(null)
const gutterRef = ref(null)
const caret = ref({ line: 1, column: 1 })

const numbers = computed(() => Array.from({ length: props.modelValue.split('\n').length }, (_, index) => index + 1).join('\n'))

function syncGutter() {
  if (gutterRef.value && areaRef.value) gutterRef.value.scrollTop = areaRef.value.scrollTop
}

function updateCaret() {
  const area = areaRef.value
  if (!area) return
  const before = area.value.slice(0, area.selectionStart).split('\n')
  caret.value = { line: before.length, column: before.at(-1).length + 1 }
}

function handleKey(event) {
  if (event.key !== 'Tab' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return
  event.preventDefault()
  const area = areaRef.value
  // execCommand keeps the edit on the browser's undo stack (Ctrl+Z).
  if (!document.execCommand?.('insertText', false, '  ')) {
    const { selectionStart: start, selectionEnd: end } = area
    emit('update:modelValue', `${area.value.slice(0, start)}  ${area.value.slice(end)}`)
    nextTick(() => area.setSelectionRange(start + 2, start + 2))
  }
}

watch(() => props.show, async place => {
  if (!place) return
  await nextTick()
  const area = areaRef.value
  if (!area) return
  area.focus({ preventScroll: true })
  area.setSelectionRange(place.start, place.end)
  const line = area.value.slice(0, place.start).split('\n').length - 1
  const lineHeight = parseFloat(getComputedStyle(area).lineHeight) || 20
  area.scrollTop = Math.max(0, line * lineHeight - area.clientHeight / 3)
  syncGutter()
  updateCaret()
})
</script>

<style scoped>
/* The caret status is the last row, so the frame is as tall as a preview beside it. */
.editor-text {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  border: 1px solid var(--ed-border-strong);
  border-radius: var(--ed-radius);
  background: var(--ed-bg);
}

.editor-text:focus-within {
  border-color: var(--ed-accent);
}

.editor-text-body {
  flex: 1;
  display: flex;
  min-height: 0;
}

.editor-gutter,
.editor-area {
  margin: 0;
  padding: 10px 10px;
  font-family: var(--ed-mono);
  font-size: 13px;
  line-height: 20px;
}

.editor-gutter {
  overflow: hidden;
  min-width: 3.5em;
  text-align: right;
  color: var(--ed-faint);
  border-right: 1px solid var(--ed-border);
  background: var(--ed-panel);
  user-select: none;
}

.editor-area {
  flex: 1;
  min-width: 0;
  resize: none;
  border: 0;
  outline: none;
  color: var(--ed-text);
  background: transparent;
  caret-color: var(--ed-accent-text);
  white-space: pre;
  tab-size: 2;
}

.editor-area.is-wrapped {
  padding: 10px 14px;
  white-space: pre-wrap;
  overflow-wrap: break-word;
}

.editor-area::selection {
  background: rgb(79 140 255 / 0.35);
}

.editor-text-status {
  padding: 3px 10px;
  border-top: 1px solid var(--ed-border);
  font-size: 12px;
  color: var(--ed-faint);
  text-align: right;
  background: var(--ed-panel);
}
</style>
