<template>
  <div class="system-taskbar" :class="{ 'has-tabs': tabs }">
    <div v-if="tabs" class="taskbar-items taskbar-tabs" role="tablist">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        role="tab"
        class="taskbar-item taskbar-tab"
        :class="{ 'is-current': tab.id === current }"
        :aria-selected="tab.id === current"
        :data-window="tab.id"
        :title="t('windows.tabHint', { window: tab.title })"
        @click="$emit('restore', tab.id)"
      >[ {{ tab.label }} ]</button>
    </div>
    <div v-else class="taskbar-items">
      <span class="taskbar-label">{{ t('windows.taskbar') }}</span>
      <button
        v-for="window in windows"
        :key="window.id"
        type="button"
        class="taskbar-item"
        :class="{ 'is-arriving': arriving.includes(window.id) }"
        :data-window="window.id"
        :title="t('windows.taskbarRestore', { window: window.title })"
        :data-hint="t('windows.taskbarHint', { window: window.title })"
        @click="$emit('restore', window.id)"
      >[ {{ window.title }} ]</button>
      <span v-if="!windows.length" class="taskbar-empty">—</span>
    </div>
    <template v-if="!tabs">
    <div v-if="hoverHint" class="taskbar-hint is-hover" aria-live="polite">&gt; {{ hoverHint.toUpperCase() }}</div>
    <div v-else class="taskbar-hint" aria-hidden="true">{{ hints.join('  ') }}</div>
    </template>
  </div>
</template>

<script setup>
import { t } from '../i18n'
defineProps({
  // [{ id, title }]
  windows: { type: Array, default: () => [] },
  // ['KEY:LABEL', …]
  hints: { type: Array, default: () => [] },
  hoverHint: { type: String, default: null },
  arriving: { type: Array, default: () => [] },
  // [{ id, label, title }]
  tabs: { type: Array, default: null },
  current: { type: String, default: null }
})

defineEmits(['restore'])
</script>

<style scoped>
.system-taskbar {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 26px;
  padding: 4px 20px;
  background: var(--ui-screen);
  border-top: 1px solid var(--ui-text);
  font-family: var(--font-pixel);
  font-size: 8px;
  color: color-mix(in srgb, var(--ui-dim) 74%, var(--ui-line));
  white-space: nowrap;
  overflow: hidden;
}

.taskbar-items {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 8px;
  min-width: 0;
}

.taskbar-label {
  color: var(--ui-line);
}

.taskbar-item {
  padding: 2px 4px;
  border: 0;
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  cursor: none;
}

.taskbar-item:hover,
.taskbar-item:focus-visible {
  background: var(--ui-text);
  color: var(--ui-screen);
  outline: none;
}

.taskbar-item.is-arriving {
  animation: taskbar-arrive 600ms steps(1, end);
}

@keyframes taskbar-arrive {
  0%, 34%, 68% { background: var(--ui-text); color: var(--ui-screen); }
  17%, 51%, 85% { background: transparent; color: var(--ui-text); }
}

@media (prefers-reduced-motion: reduce) {
  .taskbar-item.is-arriving {
    animation: none;
    background: var(--ui-text);
    color: var(--ui-screen);
  }
}

.taskbar-empty {
  color: color-mix(in srgb, var(--ui-line) 80%, var(--ui-screen));
}

.system-taskbar.has-tabs {
  padding: 4px 8px;
}

.taskbar-tabs {
  flex: 1;
  flex-wrap: nowrap;
  justify-content: space-around;
}

.taskbar-tab.is-current {
  background: var(--ui-text);
  color: var(--ui-screen);
}

.taskbar-hint {
  flex: 0 1 auto;
  min-width: 0;
  color: #8a8a8a;
  white-space: pre;
  overflow: hidden;
  text-overflow: ellipsis;
}

.taskbar-hint.is-hover {
  color: var(--ui-text);
}
</style>
