<template>
  <div class="galaxy-zoom-hud">
    <span class="galaxy-zoom-level">{{ t('galaxy.zoom', { zoom: zoom.toFixed(1) }) }}</span>
    <button
      type="button"
      class="galaxy-zoom-btn"
      :disabled="!canZoomIn"
      :title="t('galaxy.zoomInTitle')"
      :aria-label="t('galaxy.zoomIn')"
      @click="$emit('zoom-in')"
    >[+]</button>
    <button
      type="button"
      class="galaxy-zoom-btn"
      :disabled="!canZoomOut"
      :title="t('galaxy.zoomOutTitle')"
      :aria-label="t('galaxy.zoomOut')"
      @click="$emit('zoom-out')"
    >[-]</button>
  </div>
</template>

<script setup>
import { t } from '../i18n'

defineProps({
  // 1.0 is the whole map on screen
  zoom: { type: Number, default: 1 },
  canZoomIn: { type: Boolean, default: false },
  canZoomOut: { type: Boolean, default: false }
})

defineEmits(['zoom-in', 'zoom-out'])
</script>

<style scoped>
.galaxy-zoom-hud {
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border: 1px solid var(--ui-text);
  background: var(--ui-screen);
  color: var(--ui-text);
  font-family: var(--font-pixel);
  font-size: 8px;
  line-height: 1;
  user-select: none;
}

.galaxy-zoom-level {
  min-width: 11ch;
  color: var(--ui-dim);
  white-space: nowrap;
}

.galaxy-zoom-btn {
  height: 18px;
  padding: 0 4px;
  border: 1px solid var(--ui-text);
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  cursor: none;
  appearance: none;
}

.galaxy-zoom-btn:hover:not(:disabled),
.galaxy-zoom-btn:focus-visible {
  background: var(--ui-text);
  color: var(--ui-screen);
  outline: none;
}

.galaxy-zoom-btn:disabled {
  border-color: var(--ui-line);
  color: var(--ui-line);
}
</style>
