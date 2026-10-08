<template>
  <section class="terminal-window" :class="{ 'is-maximized': maximized, 'is-alone': alone }" :aria-label="title">
    <div ref="headerRef" class="terminal-header" :class="{ 'is-compact': compact }" @dblclick="handleHeaderDoubleClick">
      <div ref="titleRef" class="terminal-title" :data-hint="t('windows.titleHint')">{{ title }}</div>
      <div ref="rightRef" class="terminal-header-right">
        <slot name="actions" :compact="compact" />
        <div class="terminal-buttons">
          <button
            v-if="controls"
            type="button"
            class="window-btn button-minimize"
            :data-hint="t('windows.minimizeHint')"
            :aria-label="t('windows.minimizeAria', { window: title })"
            :title="compact ? t('windows.minimizeTitle') : null"
            @click.stop="$emit('minimize')"
          >
            <span class="window-btn-icon icon-minimize" aria-hidden="true"></span>
            <span v-if="!compact" class="window-btn-label">{{ t('windows.minimize') }}</span>
          </button>
          <button
            v-if="controls"
            type="button"
            class="window-btn button-maximize"
            :class="{ 'is-active': maximized || alone }"
            :data-hint="maximizeButton.hint"
            :aria-label="maximizeButton.aria"
            :title="compact ? maximizeButton.title : null"
            @click.stop="$emit('maximize')"
          >
            <span
              class="window-btn-icon"
              :class="maximized || alone ? 'icon-restore' : 'icon-maximize'"
              aria-hidden="true"
            ></span>
            <span v-if="!compact" class="window-btn-label">{{ maximizeButton.label }}</span>
          </button>
          <div class="terminal-menu-anchor">
            <button
              type="button"
              class="window-btn button-menu"
              :class="{ 'is-active': menuOpen }"
              :aria-label="t('windows.menuAria', { window: title })"
              :aria-expanded="menuOpen"
              aria-haspopup="menu"
              :data-hint="t('windows.menuHint')"
              :title="compact ? t('windows.menuTitle') : null"
              @click.stop="$emit('toggle-menu')"
            >
              <span class="window-btn-icon icon-menu" aria-hidden="true"></span>
              <span v-if="!compact" class="window-btn-label">{{ t('windows.menu') }}</span>
            </button>
            <DosMenu v-if="menuOpen" :title="title" :items="menuItems" @close="$emit('close-menu')" />
          </div>
        </div>
      </div>
    </div>
    <slot />
    <div class="crt-bloom" aria-hidden="true"></div>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import DosMenu from './DosMenu.vue'
import { t } from '../i18n'

const props = defineProps({
  title: { type: String, required: true },
  maximized: { type: Boolean, default: false },
  alone: { type: Boolean, default: false },
  menuOpen: { type: Boolean, default: false },
  menuItems: { type: Array, default: () => [] },
  controls: { type: Boolean, default: true }
})

const emit = defineEmits(['minimize', 'maximize', 'toggle-menu', 'close-menu'])

const maximizeButton = computed(() => {
  if (props.maximized) {
    return { label: t('windows.restore'), title: t('windows.restoreTitle'), aria: t('windows.restoreAria', { window: props.title }), hint: t('windows.restoreHint') }
  }
  if (props.alone) {
    return { label: t('windows.restoreAll'), title: t('windows.restoreAllTitle'), aria: t('windows.restoreAllTitle'), hint: t('windows.restoreAllHint') }
  }
  return { label: t('windows.maximize'), title: t('windows.maximizeTitle'), aria: t('windows.maximizeAria', { window: props.title }), hint: t('windows.maximizeHint') }
})

function handleHeaderDoubleClick(event) {
  if (!props.controls || event.target.closest('button, .dos-menu')) return
  emit('maximize')
}

const headerRef = ref(null)
const titleRef = ref(null)
const rightRef = ref(null)
const compact = ref(false)
// Measured while the captions are shown; the pixel font keeps it fixed afterwards.
let captionedWidth = 0
let resizeObserver = null

function fitHeader() {
  const header = headerRef.value
  // A minimized window has no size: keep the current look.
  if (!header || !header.clientWidth) return
  if (!compact.value) {
    const style = getComputedStyle(header)
    captionedWidth =
      parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + parseFloat(style.columnGap) +
      titleRef.value.scrollWidth + rightRef.value.offsetWidth
  }
  compact.value = header.clientWidth < captionedWidth
}

// The maximize caption changes its length: measure the captions again.
async function remeasure() {
  compact.value = false
  await nextTick()
  fitHeader()
}

watch(() => [props.maximized, props.alone], remeasure)

onMounted(() => {
  fitHeader()
  resizeObserver = new ResizeObserver(fitHeader)
  resizeObserver.observe(headerRef.value)
})

onBeforeUnmount(() => resizeObserver?.disconnect())
</script>

<style scoped>
.terminal-window {
  background: color-mix(in srgb, var(--ui-line) 14%, var(--ui-screen));
  border: 2px solid var(--ui-text);
  position: relative;
  image-rendering: pixelated;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  /* Not clipped: the window menu may reach past a short window; the body clips itself */
  overflow: visible;
}

.terminal-header {
  position: relative;
  z-index: 30;
  display: flex;
  /* A very narrow window: the buttons wrap under the title, not past the edge */
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 4px 8px;
  padding: 4px 10px;
  background: color-mix(in srgb, var(--ui-line) 35%, var(--ui-screen));
  border-bottom: 1px solid var(--ui-text);
  font-size: 8px;
  flex-shrink: 0;
  user-select: none;
}

.terminal-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--ui-text);
  font-family: var(--font-pixel);
  white-space: nowrap;
}

.terminal-header-right {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
  max-width: 100%;
  margin-left: auto;
  align-items: center;
  gap: 4px 8px;
}

.terminal-buttons {
  display: flex;
  align-items: center;
  gap: 6px;
}

.terminal-menu-anchor {
  position: relative;
}

.window-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 18px;
  padding: 0 6px;
  border: 1px solid var(--ui-text);
  background: transparent;
  color: var(--ui-text);
  font-family: var(--font-pixel);
  font-size: 8px;
  line-height: 1;
  white-space: nowrap;
  appearance: none;
  cursor: none;
}

.is-compact .window-btn {
  width: 18px;
  padding: 0;
}

.window-btn:hover,
.window-btn:focus-visible,
.window-btn.is-active {
  background: var(--ui-text);
  color: var(--ui-screen);
  outline: none;
}

.window-btn-icon {
  position: relative;
  flex-shrink: 0;
  width: 8px;
  height: 8px;
}

.icon-minimize::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  background: currentColor;
}

.icon-maximize {
  box-sizing: border-box;
  border: 1px solid currentColor;
  border-top-width: 3px;
}

.icon-restore::before,
.icon-restore::after {
  content: '';
  position: absolute;
  width: 6px;
  height: 6px;
  box-sizing: border-box;
  border: 1px solid currentColor;
  border-top-width: 2px;
}

.icon-restore::before {
  top: 0;
  right: 0;
}

.icon-restore::after {
  bottom: 0;
  left: 0;
  background: color-mix(in srgb, var(--ui-line) 35%, var(--ui-screen));
}

.window-btn:hover .icon-restore::after,
.window-btn:focus-visible .icon-restore::after,
.window-btn.is-active .icon-restore::after {
  background: var(--ui-text);
}

.icon-menu::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 2px;
  background: currentColor;
  box-shadow: 0 3px 0 currentColor, 0 6px 0 currentColor;
}
</style>
