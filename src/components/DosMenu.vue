<template>
  <!-- items:
       { type: 'toggle', label, value, onChange(next) }
       { type: 'choice', label, value, options: [{ label, value }], onChange(value) }
       { type: 'action', label, hint?, disabled?, onSelect() }
       { type: 'separator' } -->
  <div ref="menuRef" class="dos-menu" :class="`align-${align}`" role="menu" @pointerdown.stop @keydown="handleKey">
    <div v-if="title" class="dos-menu-title">{{ title }}</div>
    <template v-for="(item, index) in items" :key="index">
      <div v-if="item.type === 'separator'" class="dos-menu-separator" role="separator"></div>

      <button
        v-else-if="item.type === 'toggle'"
        type="button"
        class="dos-menu-item"
        role="menuitemcheckbox"
        :aria-checked="item.value"
        @click="toggleItem(item)"
      >
        <span class="dos-menu-mark">[{{ item.value ? 'x' : ' ' }}]</span>
        <span class="dos-menu-label">{{ item.label }}</span>
      </button>

      <div v-else-if="item.type === 'choice'" class="dos-menu-choice" role="group" :aria-label="item.label">
        <span class="dos-menu-label">{{ item.label }}</span>
        <span class="dos-menu-options">
          <button
            v-for="option in item.options"
            :key="option.value"
            type="button"
            class="dos-menu-option"
            :class="{ 'is-current': option.value === item.value }"
            role="menuitemradio"
            :aria-checked="option.value === item.value"
            @click="item.onChange(option.value)"
          >{{ option.value === item.value ? `(${option.label})` : ` ${option.label} ` }}</button>
        </span>
      </div>

      <button
        v-else
        type="button"
        class="dos-menu-item"
        role="menuitem"
        :disabled="item.disabled"
        @click="selectAction(item)"
      >
        <span class="dos-menu-label">{{ item.label }}</span>
        <span v-if="item.hint" class="dos-menu-hint">{{ item.hint }}</span>
      </button>
    </template>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { playSound } from '../sound'

defineProps({
  items: { type: Array, required: true },
  title: { type: String, default: '' },
  // 'right' | 'left'
  align: { type: String, default: 'right' }
})

const emit = defineEmits(['close'])
const menuRef = ref(null)

function toggleItem(item) {
  playSound(item.value ? 'toggleOff' : 'toggleOn')
  item.onChange(!item.value)
}

function selectAction(item) {
  item.onSelect?.()
  emit('close')
}

// Presses on the anchor are left to its own click, which toggles the menu:
// closing here first would make that click open it again.
function handleOutsidePress(event) {
  const anchor = menuRef.value?.parentElement
  if (!anchor?.contains(event.target)) emit('close')
}

const menuButtons = () => [...(menuRef.value?.querySelectorAll('button:not(:disabled)') ?? [])]
function focusItem(index) {
  const list = menuButtons()
  if (list.length) list[(index + list.length) % list.length].focus()
}
let opener = null
function handleKey(event) {
  const list = menuButtons()
  const at = list.indexOf(document.activeElement)
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) playSound('menuMove')
  if (event.key === 'ArrowDown') focusItem(at + 1)
  else if (event.key === 'ArrowUp') focusItem(at < 0 ? -1 : at - 1)
  else if (event.key === 'Home') focusItem(0)
  else if (event.key === 'End') focusItem(-1)
  else if (event.key === 'Escape') {
    emit('close')
    opener?.focus?.()
  } else return
  event.preventDefault()
  event.stopPropagation()
}

let listenTimer = null
onMounted(() => {
  playSound('menuOpen')
  opener = document.activeElement
  focusItem(0)
  // Next task, so the press that opened the menu does not close it.
  listenTimer = setTimeout(() => {
    listenTimer = null
    document.addEventListener('pointerdown', handleOutsidePress)
  }, 0)
})

onBeforeUnmount(() => {
  playSound('menuClose')
  clearTimeout(listenTimer)
  document.removeEventListener('pointerdown', handleOutsidePress)
})
</script>

<style scoped>
.dos-menu {
  position: absolute;
  top: calc(100% + 4px);
  z-index: 50;
  min-width: 250px;
  padding: 6px;
  background: var(--ui-screen);
  border: 4px double var(--ui-text);
  box-shadow: 6px 6px 0 rgb(var(--ui-screen-rgb) / 0.6);
  font-family: var(--font-pixel);
  font-size: 8px;
  line-height: 1.6;
  color: color-mix(in srgb, var(--ui-text) 50%, var(--ui-dim));
  text-align: left;
  white-space: nowrap;
  cursor: none;
  animation: dos-menu-drop 120ms steps(6, end) both;
}

@keyframes dos-menu-drop {
  from { clip-path: inset(0 0 100% 0); }
  to { clip-path: inset(0 -12px -12px 0); }
}

@media (prefers-reduced-motion: reduce) {
  .dos-menu {
    animation: none;
  }
}

.dos-menu.align-right {
  right: 0;
}

.dos-menu.align-left {
  left: 0;
}

.dos-menu-title {
  padding: 2px 6px 6px;
  color: var(--ui-text);
  border-bottom: 1px dashed var(--ui-line);
  margin-bottom: 4px;
}

.dos-menu-item,
.dos-menu-choice {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 4px 6px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: none;
}

.dos-menu-item:hover:not(:disabled),
.dos-menu-item:focus-visible {
  background: var(--ui-text);
  color: var(--ui-screen);
  outline: none;
}

.dos-menu-item:disabled {
  color: var(--ui-line);
}

.dos-menu-mark {
  color: var(--ui-text);
}

.dos-menu-item:hover .dos-menu-mark {
  color: inherit;
}

.dos-menu-label {
  flex: 1;
}

.dos-menu-hint {
  color: color-mix(in srgb, var(--ui-dim) 49%, var(--ui-line));
}

.dos-menu-options {
  display: flex;
  gap: 2px;
}

.dos-menu-option {
  padding: 1px 2px;
  border: 0;
  background: transparent;
  color: color-mix(in srgb, var(--ui-dim) 74%, var(--ui-line));
  font: inherit;
  white-space: pre;
  cursor: none;
}

.dos-menu-option.is-current {
  color: var(--ui-text);
}

.dos-menu-option:hover,
.dos-menu-option:focus-visible {
  background: var(--ui-text);
  color: var(--ui-screen);
  outline: none;
}

.dos-menu-separator {
  height: 0;
  margin: 4px 0;
  border-top: 1px dashed var(--ui-line);
}
</style>
